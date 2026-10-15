const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {randomUUID} = require('node:crypto');
let PGlite;
try { ({PGlite}=require(require.resolve('@electric-sql/pglite',{paths:[process.env.CROMA_TEST_NODE_MODULES || __dirname]}))); } catch {}
const root=path.join(__dirname,'..');
const user='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
const manager='10000000-0000-4000-8000-000000000003',inactive='10000000-0000-4000-8000-000000000004';
const customer='10000000-0000-4000-8000-000000000005',legacy='20000000-0000-4000-8000-000000000001';

test('Migration preserves the lab, enforces RLS and records immutable, atomic analysis history', {skip:!PGlite}, async()=>{
  const db=new PGlite();
  try{
    await db.exec(fs.readFileSync(path.join(__dirname,'fixtures/whatsapp-lab-baseline.sql'),'utf8'));
    const migration=fs.readdirSync(path.join(root,'supabase/migrations')).find(name=>name.endsWith('_whatsapp_lab_mvp.sql'));
    await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',migration),'utf8'));
    const role=async(name,uid)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid || '']);await db.exec(`set role ${name}`);};
    const manual=(key,body='  Mensagem original\n500 cartoes  ')=>db.query('select public.save_lab_whatsapp_manual_test($1,$2,$3,$4,$5) as id',[key,'Cliente ficticio',null,body,'simulador']);
    const start=(atendimento,requestedBy,request=randomUUID())=>db.query('select public.start_lab_whatsapp_analysis($1,$2,$3,$4,$5,$6) as attempt',[atendimento,requestedBy,request,'existing-model','v1',[]]);
    const finish=(id,result,error=null)=>db.query('select public.finish_lab_whatsapp_analysis($1,$2,$3)',[id,result,error]);

    await role('anon');
    for(const table of ['lab_whatsapp_atendimentos','lab_whatsapp_mensagens','lab_whatsapp_anexos','lab_whatsapp_analises'])
      await assert.rejects(db.query(`select * from public.${table}`),/permission denied/);
    await assert.rejects(manual(randomUUID()),/permission denied/);

    for(const uid of [customer,inactive]){
      await role('authenticated',uid);
      assert.equal((await db.query('select * from public.lab_whatsapp_analises')).rows.length,0);
      assert.equal((await db.query('select * from public.lab_whatsapp_atendimentos')).rows.length,0);
      await assert.rejects(manual(randomUUID()),/insufficient_privilege|permission denied/i);
    }

    await role('authenticated',user);
    const inputKey=randomUUID();
    const first=(await manual(inputKey)).rows[0].id;
    assert.equal((await manual(inputKey)).rows[0].id,first);
    assert.equal((await db.query('select body from public.lab_whatsapp_mensagens where atendimento_id=$1',[first])).rows[0].body,'  Mensagem original\n500 cartoes  ');
    assert.equal((await db.query('select * from public.lab_whatsapp_mensagens where atendimento_id=$1',[first])).rows.length,1);
    await assert.rejects(manual(inputKey,'Different text'),/different content/);
    await assert.rejects(manual(randomUUID(),'   '),/Invalid manual test input/);
    assert.equal((await db.query('select summary from public.lab_whatsapp_atendimentos where id=$1',[legacy])).rows[0].summary,'Legacy result');
    await assert.rejects(start(first,user),/permission denied/);
    await assert.rejects(db.query('insert into public.lab_whatsapp_analises default values'),/permission denied/);

    await db.query("update public.lab_whatsapp_atendimentos set category='arte_arquivo',priority='alta',workflow_status='aguardando_cliente' where id=$1",[first]);
    await role('authenticated',other);
    assert.equal((await db.query("update public.lab_whatsapp_atendimentos set category='orcamento' where id=$1 returning id",[first])).rows.length,0);
    await role('service_role');
    await assert.rejects(start(first,other),/insufficient_privilege|permission denied/i);

    const request=randomUUID();const attempt=(await start(first,user,request)).rows[0].attempt;
    assert.equal(attempt.started,true);
    assert.equal((await start(first,user,request)).rows[0].attempt.started,false);
    assert.equal((await start(first,user)).rows[0].attempt.started,false);
    await finish(attempt.analysis_id,{resumo:'First analysis',resposta_sugerida:'Confirmar material',categoria_sugerida:'orcamento'});
    assert.equal((await start(first,user,request)).rows[0].attempt.status,'concluida');
    let stored=(await db.query('select * from public.lab_whatsapp_atendimentos where id=$1',[first])).rows[0];
    assert.equal(stored.category,'arte_arquivo');assert.equal(stored.priority,'alta');assert.equal(stored.workflow_status,'aguardando_cliente');
    await assert.rejects(finish(attempt.analysis_id,{resumo:'Overwrite'}),/not processing/);
    await assert.rejects(db.query("update public.lab_whatsapp_analises set result='{}' where id=$1",[attempt.analysis_id]),/immutable/);

    const second=(await start(first,manager)).rows[0].attempt;
    await finish(second.analysis_id,null,'AI failed');
    stored=(await db.query('select summary,status from public.lab_whatsapp_atendimentos where id=$1',[first])).rows[0];
    assert.equal(stored.summary,'First analysis');assert.equal(stored.status,'concluido');
    assert.equal((await db.query('select * from public.lab_whatsapp_analises where atendimento_id=$1',[first])).rows.length,2);

    await db.exec('reset role');
    await db.exec("alter table public.lab_whatsapp_atendimentos add constraint test_cache_failure check(summary is null or summary<>'Rejected result')");
    await role('service_role');
    const atomic=(await start(first,user)).rows[0].attempt;
    await assert.rejects(finish(atomic.analysis_id,{resumo:'Rejected result'}),/test_cache_failure/);
    assert.equal((await db.query('select status,result from public.lab_whatsapp_analises where id=$1',[atomic.analysis_id])).rows[0].status,'processando');
    assert.equal((await db.query('select summary from public.lab_whatsapp_atendimentos where id=$1',[first])).rows[0].summary,'First analysis');
    await finish(atomic.analysis_id,null,'Database write failed');
    const expiredId=randomUUID();const expiredRequest=randomUUID();
    await db.query("insert into public.lab_whatsapp_analises(id,atendimento_id,requested_by,request_id,previous_status,model,prompt_version,created_at) values($1,$2,$3,$4,'concluido','model','v1',now()-interval '16 minutes')",[expiredId,first,user,expiredRequest]);
    await db.query("update public.lab_whatsapp_atendimentos set status='em_analise' where id=$1",[first]);
    assert.equal((await start(first,user,expiredRequest)).rows[0].attempt.status,'erro');
    assert.equal((await db.query('select status from public.lab_whatsapp_atendimentos where id=$1',[first])).rows[0].status,'concluido');
    await assert.rejects(finish(expiredId,{resumo:'Late result'}),/not processing/);

    await role('authenticated',user);
    assert.equal((await db.query('select * from public.lab_whatsapp_analises where atendimento_id=$1',[first])).rows.length,4);
    await assert.rejects(db.query('delete from public.lab_whatsapp_analises where atendimento_id=$1',[first]),/permission denied/);
    await db.query('delete from public.lab_whatsapp_atendimentos where id=$1',[first]);
    assert.equal((await db.query('select * from public.lab_whatsapp_analises where atendimento_id=$1',[first])).rows.length,0);
  }finally{await db.close();}
});
