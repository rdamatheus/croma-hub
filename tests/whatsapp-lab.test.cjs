const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const {stripTypeScriptTypes} = require('node:module');
const {webcrypto} = require('node:crypto');
const root = path.join(__dirname,'..');
const modelPromise = import(pathToFileURL(path.join(root,'js/whatsapp-lab-model.js')).href);
const ids = {user:'10000000-0000-4000-8000-000000000001',other:'10000000-0000-4000-8000-000000000002',
  atendimento:'20000000-0000-4000-8000-000000000001',request:'30000000-0000-4000-8000-000000000001',
  analysis:'40000000-0000-4000-8000-000000000001',message:'50000000-0000-4000-8000-000000000001'};

function validAnalysis(){return {
  resumo:'Pedido de 500 cartoes.',pedido_cliente:['500 cartoes'],especificacoes:[],pendencias:['Confirmar material'],
  resposta_sugerida:'Qual material deseja?',tarefas_internas:[],arquivos_analisados:[],
  categoria_sugerida:'orcamento',prioridade_sugerida:'urgente',tags:['recompra','urgente','falta_informacao'],
  dados_extraidos:{produto:'Cartao',quantidade:500,medidas:null,material:null,acabamento:null,prazo_solicitado:'amanha',forma_recebimento:null},
  dados_faltantes:['Material']
};}

async function processor(options={}){
  const model = await modelPromise;
  const calls = [],aiRequests=[];
  const profile={id:ids.user,role:'equipe',ativo:true,...options.profile};
  const atendimento={id:ids.atendimento,created_by:ids.user,contact_name:'Cliente ficticio',workflow_status:'aguardando_cliente',category:'arte_arquivo',...options.atendimento};
  const messages=options.messages || [{id:ids.message,author:'Cliente ficticio',body:'500 cartoes para amanha',direction:'recebida'}];
  const admin={
    auth:{getUser:async()=>({data:{user:options.invalidSession?null:{id:ids.user}}})},
    storage:{from(){return {download:async(key)=>{calls.push(['download',key]);return {data:new Blob(['fake document']),error:null};}};}},
    from(table){calls.push(['from',table]);return {
      select(){return this;},eq(){return this;},update(){return this;},
      maybeSingle:async()=>({data:table==='profiles'?profile:atendimento}),
      order:async()=>({data:table==='lab_whatsapp_mensagens'?messages:(options.attachments || [])})
    };},
    async rpc(name,args){calls.push(['rpc',name,args]);return {data:name==='start_lab_whatsapp_analysis'?
      (options.attempt || {started:true,analysis_id:ids.analysis}):null,error:options.finishError && args.p_result?{message:'Database unavailable'}:null};}
  };
  let handler;
  const context=vm.createContext({...model,createClient:()=>admin,Request,Response,FormData,File,Uint8Array,btoa,
    crypto:webcrypto,console:{error(){}},Deno:{env:{get:name=>name==='OPENAI_API_KEY'?(options.noKey?undefined:'fake-key'):'fake-config'},serve:fn=>{handler=fn;}},
    fetch:async(url,init)=>{aiRequests.push({url,body:JSON.parse(init.body)});
      if(options.apiFailure) return Response.json({error:{message:'AI unavailable'}},{status:503});
      return Response.json(options.raw || {status:'completed',output_text:JSON.stringify(options.analysis || validAnalysis())});}
  });
  const source=fs.readFileSync(path.join(root,'supabase/functions/whatsapp-lab-processar/index.ts'),'utf8').replace(/^import .*;\n/gm,'');
  vm.runInContext(stripTypeScriptTypes(source),context);
  const request=async(body={atendimento_id:ids.atendimento,request_id:ids.request},authorized=true)=>{
    const response=await handler(new Request('https://lab.test/process',{method:'POST',headers:authorized?{Authorization:'Bearer fake-token'}:{},body:JSON.stringify(body)}));
    return {status:response.status,body:await response.json()};
  };
  return {calls,aiRequests,request};
}

test('Manual input preserves the original text and rejects invalid or empty data',async()=>{
  const {manualTestInput}=await modelPromise;
  const body='  Quero 500 cartoes.\nFrente e verso.  ';
  const result=manualTestInput({body,inputKey:ids.request,phone:'+55 (32) 99999-0000'});
  assert.equal(result.p_body,body);assert.equal(result.p_contact_phone,'5532999990000');
  for(const input of [{body:'  '},{body:'x'.repeat(8001)},{body,phone:'WhatsApp 123'},{body,source:'real_whatsapp'}])
    assert.throws(()=>manualTestInput(input));
});

test('Analysis rejects unknown categories, malformed fields and invented negative quantities',async()=>{
  const {validateAnalysis}=await modelPromise;
  const value=validAnalysis();value.tags.push('urgente');
  assert.equal(validateAnalysis(value).tags.filter(tag=>tag==='urgente').length,1);
  for(const bad of [{...value,categoria_sugerida:'unknown'},{...value,tags:['admin']},
    {...value,dados_extraidos:{...value.dados_extraidos,quantidade:-1}}, {...value,pedido_cliente:'500'},
    {...value,dados_extraidos:{produto:'Cartao'}},{...value,constructor:'unexpected'}]) assert.throws(()=>validateAnalysis(bad));
});

test('Anonymous, customer, inactive and another staff member cannot invoke the AI',async()=>{
  const anonymous=await processor();assert.equal((await anonymous.request(undefined,false)).status,401);
  for(const options of [{invalidSession:true},{profile:{role:'cliente'}},{profile:{ativo:false}},{atendimento:{created_by:ids.other}}]){
    const t=await processor(options);const result=await t.request();assert.ok([401,403].includes(result.status));
    assert.equal(t.aiRequests.length,0);assert.equal(t.calls.filter(c=>c[0]==='rpc').length,0);
  }
});

test('Bad identifiers and a missing API key do not start an analysis or consume the API',async()=>{
  const t=await processor();assert.equal((await t.request({atendimento_id:'bad',request_id:ids.request})).status,400);
  const missing=await processor({noKey:true});assert.equal((await missing.request()).status,503);
  assert.equal(missing.aiRequests.length,0);assert.equal(missing.calls.filter(c=>c[0]==='rpc').length,0);
});

test('A completed retry is reused and an active analysis cannot be run twice',async()=>{
  const reused=await processor({attempt:{started:false,status:'concluida',result:validAnalysis()}});
  const result=await reused.request();assert.equal(result.status,200);assert.equal(result.body.reused,true);assert.equal(reused.aiRequests.length,0);
  const active=await processor({attempt:{started:false,status:'processando'}});
  assert.equal((await active.request()).status,409);assert.equal(active.aiRequests.length,0);
});

test('A valid analysis uses the schema and saves through the atomic completion RPC',async()=>{
  const t=await processor({profile:{role:'manager'},atendimento:{created_by:ids.other}});
  assert.equal((await t.request()).status,200);
  assert.equal(t.aiRequests[0].body.text.format.strict,true);
  const finished=t.calls.find(c=>c[1]==='finish_lab_whatsapp_analysis')[2];
  assert.equal(finished.p_result.categoria_sugerida,'orcamento');
  assert.equal(finished.p_result.dados_extraidos.material,null);
  assert.equal(finished.p_result.contexto_truncado,false);
  assert.equal(finished.category,undefined);assert.equal(finished.workflow_status,undefined);
});

test('Refusals, incomplete results and malformed analysis are logged as failures',async()=>{
  for(const options of [{raw:{status:'incomplete',output_text:'{}'}},
    {raw:{status:'completed',output:[{content:[{type:'refusal',refusal:'No'}]}]}},
    {analysis:{...validAnalysis(),categoria_sugerida:'invalid'}},{apiFailure:true}]){
    const t=await processor(options);const result=await t.request();assert.equal(result.status,502);assert.equal(result.body.request_completed,true);
    const completions=t.calls.filter(c=>c[1]==='finish_lab_whatsapp_analysis');
    assert.equal(completions.length,1);assert.equal(completions[0][2].p_result,undefined);assert.ok(completions[0][2].p_error);
  }
});

test('A truncated conversation retains the latest messages and reports the limitation',async()=>{
  const t=await processor({messages:[{id:ids.message,body:'x'.repeat(101000),direction:'recebida'},
    {id:ids.message,body:'ULTIMA MENSAGEM: prazo confirmado',direction:'recebida'}]});
  const result=await t.request();assert.equal(result.status,200);assert.equal(result.body.analysis.contexto_truncado,true);
  assert.match(t.aiRequests[0].body.input,/ULTIMA MENSAGEM: prazo confirmado/);
});

test('The privileged processor never downloads files outside the test prefix or with traversal segments',async()=>{
  for(const storage_path of ['orders/private.pdf',`whatsapp-lab/${ids.user}/${ids.atendimento}/../private.pdf`,
    `whatsapp-lab/${ids.user}/${ids.atendimento}/%2e%2e`]){
    const t=await processor({attachments:[{id:ids.message,storage_path,kind:'pdf',file_name:'private.pdf',size_bytes:1}]});
    const result=await t.request();assert.equal(result.status,200);
    assert.match(result.body.attachment_errors[0].error,/Arquivo fora deste atendimento/);
    assert.equal(t.aiRequests.length,1);assert.equal(t.calls.filter(call=>call[0]==='download').length,0);
  }
  const storage_path=`whatsapp-lab/${ids.user}/${ids.atendimento}/123-test.pdf`;
  const valid=await processor({attachments:[{id:ids.message,storage_path,kind:'pdf',file_name:'test.pdf',size_bytes:1}]});
  const response=await valid.request();assert.equal(response.status,200);assert.equal(response.body.attachment_errors.length,0);
  assert.equal(valid.aiRequests.length,2);assert.equal(valid.calls.find(call=>call[0]==='download')[1],storage_path);
});
