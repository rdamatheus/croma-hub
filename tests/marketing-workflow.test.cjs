const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../js/marketing-workflow-core.js'),'utf8').replace(/^export /gm,'');
const ctx=vm.createContext({URL,Date,Set,Array,String,Error,Math});
vm.runInContext(source+'\nthis.marketing={PRODUCTION_STAGES,localDateISO,monthCells,stageLabel,unifyMarketingEvents,collectMarketingMedia,upsertProductionPost};',ctx);
const m=ctx.marketing;

test('Datas locais não dependem de UTC e o mês contém semanas completas',()=>{
  assert.equal(m.localDateISO(new Date(2026,10,5)),'2026-11-05');
  const days=m.monthCells(2026,10);
  assert.equal(days.length,35);
  assert.equal(days.filter(d=>d.inMonth).length,30);
  assert.equal(days.filter(d=>d.date==='2026-11-05').length,1);
});
test('Estúdio e postagem vinculada não aparecem duplicados no calendário',()=>{
  const production={id:'p1',title:'Bastidores',planned_date:'2026-11-10',stage:'roteiro',brand:'Croma Gráfica',channel:'YouTube Vídeo'};
  const posts=[{production_id:'p1',date:'2026-11-10',title:'Bastidores',status:'Produzir foto/vídeo'}];
  const result=m.unifyMarketingEvents(posts,[production],[]);
  assert.equal(result.length,1);assert.equal(result[0].source,'post');
});
test('Peças de campanhas e posts antigos aparecem no mesmo calendário',()=>{
  const events=m.unifyMarketingEvents([{date:'2026-11-02',title:'Antigo'}],[],[{id:'c1',title:'Natal',assets:[{date:'2026-11-12',title:'Arte Reels'}]}]);
  assert.equal(events.length,2);assert.equal(events[0].title,'Antigo');assert.equal(events[1].source,'campaign');
});
test('Sincronização com calendário é idempotente',()=>{
  const p={id:'p1',title:'Bastidores',planned_date:'2026-11-12',stage:'roteiro'};
  const first=m.upsertProductionPost([],p),second=m.upsertProductionPost(first.posts,p);
  assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(second.posts.length,1);
});
test('Status manual do post é preservado ao sincronizar o briefing',()=>{
  const post={title:'A',date:'2026-11-02',status:'Publicado',production_id:'p1',extra:'manter'};
  const next=m.upsertProductionPost([post],{id:'p1',title:'Novo',planned_date:'2026-11-05',stage:'roteiro'});
  assert.equal(next.posts[0].status,'Publicado');assert.equal(next.posts[0].extra,'manter');assert.equal(next.posts[0].title,'Novo');
});
test('Biblioteca usa links HTTPS e evita arquivos duplicados',()=>{
  const media=m.collectMarketingMedia([{title:'X',asset_url:'https://drive.google.com/file/abc',edit_url:'javascript:alert(1)'}],[{title:'Campanha',drive_url:'https://drive.google.com/file/abc',assets:[{title:'Y',canva_url:'https://www.canva.com/design/abc'}]}]);
  assert.equal(media.length,2);assert.ok(media.every(x=>x.url.startsWith('https://')));
});
test('Falha sem data válida ou identificação ao criar post',()=>{
  assert.throws(()=>m.upsertProductionPost([],{id:'p',title:'X',planned_date:''}),/data/);
});
test('HTML possui as abas e integrações da Fase 1 sem publicação social',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../interno/marketing/index.html'),'utf8');
  const js=fs.readFileSync(path.join(__dirname,'../js/interno-marketing-workflow.js'),'utf8');
  const legacy=fs.readFileSync(path.join(__dirname,'../js/interno-marketing.js'),'utf8');
  for(const id of ['overview','studio','library','mwProductionForm','mwMonthGrid','mwLibraryList','mwCampaign'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/interno-marketing-workflow.js/);assert.match(legacy,/croma:marketing-create-post/);
  assert.doesNotMatch(js,/\.functions\.invoke\(|api\.instagram|api\.youtube|fetch\(['"]https:\/\/graph\.facebook/);
});
