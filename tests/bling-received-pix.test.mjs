import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
const src=await readFile(new URL('../supabase/functions/croma-order-outbound/index.ts',import.meta.url),'utf8');
const pure=stripTypeScriptTypes(src.slice(src.indexOf('async function sendReceivedPix'),src.indexOf('async function syncOrder')));
function setup(opts={}){
 const o={id:'local-test',order_code:'TEST-1',status:'em_producao',total:450,payment_method:'pix',created_at:'2026-11-25T02:44:00Z',checkout_reference:null,...opts.order};
 const calls=[],writes=[];let remote=opts.remote||null;
 const form={id:12,descricao:'PIX',tipoPagamento:17,situacao:1,destino:1,finalidade:2,...opts.form};
 const items=[{produto:{id:13},quantidade:200,valor:2.25}];
 const db={from(table){let patch,mode;const chain={select(){return this},eq(){return this},is(){return this},update(p){patch=p;mode='update';return this},insert(p){patch=p;mode='insert';return this},then(resolve){return Promise.resolve(table==='payments'?{data:opts.payments||[]}:table==='order_activity_events'?{data:opts.events??[{amount:450,payment_method:'pix',financial_review:true}]}:(writes.push({table,patch}),{data:{id:o.id}})).then(resolve)},async maybeSingle(){if(table==='erp_entity_mappings')return {data:opts.link||null};if(opts.race)return {data:null};writes.push({table,patch});return {data:{id:o.id}}},async single(){writes.push({table,patch});return {data:{id:'mapping'}}}};return chain}};
 const api=async(path,method='GET',body,query)=>{calls.push({path,method,query,body});if(path==='/formas-pagamentos')return opts.forms||[form];if(path==='/formas-pagamentos/12')return form;if(path==='/pedidos/vendas'&&method==='GET')return query['numerosLojas[]']?(opts.existing||[]):(opts.duplicate||[]);if(path==='/pedidos/vendas'&&method==='POST'){if(opts.failPost)throw Error('network');remote={...body,numero:99,total:Number(o.total)};return {id:88}};if(path==='/pedidos/vendas/88')return remote;throw Error(path)};
 const round=(n,p=2)=>Math.round(Number(n)*10**p)/10**p;
 const run=new Function('db','api','round','orderBody',pure+';return sendReceivedPix')(db,api,round,()=>({itens:items,contato:{id:9}}));
 return {o,calls,writes,run:()=>run({o,c:{bling_contact_id:9,bling_sync_status:'sincronizado',...opts.customer},items,m:opts.mapping},'2026-11-24',opts.approvedJob)};
}
test('Pix confirmado: cria uma vez, valida parcela e não lança contas',async()=>{const a=setup();const x=await a.run();assert.equal(x.external_id,88);assert.equal(x.financial_status,'pending_verification');assert.equal(a.calls.filter(c=>c.method==='POST').length,1);assert.equal(a.calls.find(c=>c.method==='POST').body.parcelas[0].formaPagamento.id,12);assert.ok(a.calls.every(c=>!c.path.includes('contas')&&!c.path.includes('/contatos')));assert.equal(a.o.status,'em_producao')});
for(const [name,opts] of [['sem confirmação',{events:[]}],['pagamento online',{payments:[{status:'approved'}]}],['tipo incompatível',{form:{tipoPagamento:15}}],['nome divergente',{form:{descricao:'Outro PIX'}}],['forma inativa',{form:{situacao:0}}],['forma ambígua',{forms:[{id:12,descricao:'PIX',tipoPagamento:17,situacao:1},{id:12,descricao:'PIX',tipoPagamento:17,situacao:1}]}],['contato pendente',{customer:{bling_sync_status:'pendente'}}],['duplicidade manual',{duplicate:[{contato:{id:9},total:450}]}],['reserva concorrente',{race:true}],['envio pendente',{order:{checkout_reference:'bling-pendente:local-test'}}]])test(name+' bloqueia POST',async()=>{const a=setup(opts);await assert.rejects(a.run());assert.equal(a.calls.filter(c=>c.method==='POST').length,0)});
test('falha ambígua mantém referência pendente',async()=>{const a=setup({failPost:true});await assert.rejects(a.run());assert.equal(a.writes[0].patch.checkout_reference,'bling-pendente:local-test');assert.equal(a.writes.length,1)});
test('pedido já existente não é recriado',async()=>{const remote={numero:99,numeroLoja:'TEST-1',contato:{id:9},total:450,itens:[{produto:{id:13},quantidade:200,valor:2.25}],parcelas:[{formaPagamento:{id:12},valor:450,dataVencimento:'2026-11-24'}]};const a=setup({existing:[{id:88,numeroLoja:'TEST-1',contato:{id:9}}],remote});await a.run();assert.equal(a.calls.filter(c=>c.method==='POST').length,0)});
test('preserva caminhos não Pix e autorização da função',()=>{assert.match(src,/return await sendReceivedPix/);assert.match(src,/return await sendReceivable/);assert.match(src,/ctx.o.payment_method==="dinheiro"/);assert.match(src,/auth.getUser\(auth\)/);assert.match(src,/\["owner","manager"\]/)});
const ui=await readFile(new URL('../js/interno-pedido-detalhes.js',import.meta.url),'utf8');
test('interface: não habilita Pix sem evento confirmado; preserva dinheiro e crediário',()=>{const fn=new Function(ui.slice(ui.indexOf('function receivable'),ui.indexOf('let current'))+';return ready')();const o={payment_method:'pix',status:'em_producao',total:450};assert.equal(fn(o,{order:o,history:[],payments:[]}),false);assert.equal(fn(o,{order:o,history:[{action:'manual_payment_confirmed',financial_review:true,amount:450}],payments:[]}),true);assert.equal(fn({payment_method:'dinheiro',status:'concluido'},{}),true);assert.equal(fn({payment_method:'crediario',status:'aguardando_pagamento',payment_due_date:'2026-11-24'},{}),true)});

const approvedJob={source:'operator_confirmed_chat',order_id:'local-test',payment_method:'pix',payment_confirmed:true,amount_cents:45000,confirmation_ref:'chat:approved-test'};
test('despacho aprovado: reutiliza proteção sem confirmação duplicada na tela',async()=>{const a=setup({events:[],approvedJob});const x=await a.run();assert.equal(x.external_id,88);assert.equal(a.calls.filter(c=>c.method==='POST').length,1)});
for(const [name,job] of [['valor divergente',{...approvedJob,amount_cents:1}],['pedido divergente',{...approvedJob,order_id:'other'}],['não recebido',{...approvedJob,payment_confirmed:false}]])test(name+' bloqueia despacho',async()=>{const a=setup({events:[],approvedJob:job});await assert.rejects(a.run());assert.equal(a.calls.filter(c=>c.method==='POST').length,0)});
test('despacho da fila não autoriza ação geral com credencial cron',()=>{assert.match(src,/if\(input.action!=="dispatch_approved_order"\)return response\(\{error:"forbidden"\},403\)/);assert.match(src,/\.eq\("status","queued"\)\.select\("id"\)/)});

for(const [method,descricao,tipoPagamento] of [['dinheiro','Dinheiro',1],['credito','C.Crédito',3],['debito','C.Débito',4]])test('venda interna '+method+' sem reconfirmação',async()=>{const a=setup({order:{payment_method:method},events:[],approvedJob:{...approvedJob,payment_method:method},form:{descricao,tipoPagamento}});const x=await a.run();assert.equal(x.external_id,88);assert.equal(a.calls.filter(c=>c.method==='POST').length,1);assert.ok(a.calls.every(c=>!c.path.includes('contas')))});
test('Pix estático também aceito quando corresponde à modalidade existente',async()=>{const a=setup({form:{tipoPagamento:20}});assert.equal((await a.run()).external_id,88)});
test('crediário não entra no caminho de recebido',async()=>{const a=setup({order:{payment_method:'crediario'},events:[],approvedJob:{...approvedJob,payment_method:'crediario'}});await assert.rejects(a.run());assert.equal(a.calls.filter(c=>c.method==='POST').length,0)});

const jobValidator = new Function(stripTypeScriptTypes(src.slice(src.indexOf('function validInternalSaleJob'),src.indexOf('// Despacho administrativo',src.indexOf('function validInternalSaleJob'))))+';return validInternalSaleJob')();
const internalJob={source:'internal_sale_finalized',order_id:'12345678-1234-1234-1234-123456789abc',sale_date:'2026-11-25',amount_cents:45000,confirmation_ref:'authorized:test-reference',payment_confirmed:true};
for(const payment_method of ['pix','dinheiro','credito','debito'])test('fila interna automática aceita '+payment_method,()=>{assert.equal(jobValidator({...internalJob,payment_method}),true)});
test('fila interna aceita crediário somente a receber e com vencimento',()=>{assert.equal(jobValidator({...internalJob,payment_method:'crediario',payment_confirmed:false,due_date:'2026-12-25'}),true);assert.equal(jobValidator({...internalJob,payment_method:'crediario',payment_confirmed:true,due_date:'2026-12-25'}),false);assert.equal(jobValidator({...internalJob,payment_method:'crediario',payment_confirmed:false}),false);assert.equal(jobValidator({...internalJob,payment_method:'crediario',payment_confirmed:false,due_date:'2026-11-24'}),false)});
for(const patch of [{source:'checkout'},{payment_confirmed:false},{sale_date:'2026-02-31'},{amount_cents:0},{order_id:'bad'},{confirmation_ref:'short'}])test('fila bloqueia '+JSON.stringify(patch),()=>{assert.equal(jobValidator({...internalJob,payment_method:'pix',...patch}),false)});
test('origem definitiva reutiliza o envio de recebido sem segunda confirmação',async()=>{const a=setup({events:[],approvedJob:{...approvedJob,source:'internal_sale_finalized'}});assert.equal((await a.run()).external_id,88);assert.equal(a.calls.filter(c=>c.method==='POST').length,1)});
test('crediário usa fluxo a receber e não sobrescreve vínculo de outro pedido',()=>{const receivable=src.slice(src.indexOf('async function sendReceivable'),src.indexOf('async function sendReceivedPix'));assert.match(receivable,/commercial_payment_status:"receivable"/);assert.match(receivable,/linked.local_id!==o.id/);assert.match(receivable,/remote.numeroLoja/);assert.match(receivable,/JSON.stringify\(expectedItems\)!==JSON.stringify\(actualItems\)/);assert.match(src,/ctx.o.payment_due_date!==a.due_date/);assert.match(src,/await sendReceivable\(ctx,a.sale_date\)/);assert.doesNotMatch(receivable,/\.upsert\(mapping/)});


test('dinheiro recebido em duas parcelas e aprovado na origem: soma e envia uma unica vez',async()=>{
 const approved={...approvedJob,source:'internal_sale_finalized',payment_method:'dinheiro',amount_cents:60000};
 const entries=[{amount:500,payment_method:'dinheiro',financial_review:false},{amount:100,payment_method:'dinheiro',financial_review:false}];
 const a=setup({order:{payment_method:'dinheiro',total:600},events:entries,approvedJob:approved,form:{descricao:'Dinheiro',tipoPagamento:1}});
 const x=await a.run();
 assert.equal(x.external_id,88);assert.equal(x.total,600);
 assert.equal(a.calls.filter(c=>c.method==='POST').length,1);
 assert.equal(a.calls.find(c=>c.method==='POST').body.parcelas[0].valor,600);
 assert.ok(a.calls.every(c=>!c.path.includes('contas')&&!c.path.includes('/contatos')));
});
for(const [name,events] of [
 ['soma parcial', [{amount:500,payment_method:'dinheiro',financial_review:false},{amount:90,payment_method:'dinheiro',financial_review:false}]],
 ['modalidade divergente', [{amount:500,payment_method:'dinheiro',financial_review:false},{amount:100,payment_method:'pix',financial_review:false}]],
 ['recebimento negativo', [{amount:700,payment_method:'dinheiro',financial_review:false},{amount:-100,payment_method:'dinheiro',financial_review:false}]]
])test(name+' bloqueia despacho aprovado e nao cria pedido',async()=>{
 const a=setup({order:{payment_method:'dinheiro',total:600},events,approvedJob:{...approvedJob,source:'internal_sale_finalized',payment_method:'dinheiro',amount_cents:60000},form:{descricao:'Dinheiro',tipoPagamento:1}});
 await assert.rejects(a.run());assert.equal(a.calls.filter(c=>c.method==='POST').length,0);
});
test('sem aprovacao da origem duas parcelas nao revisadas nao autorizam envio',async()=>{
 const a=setup({order:{payment_method:'dinheiro',total:600},events:[{amount:500,payment_method:'dinheiro',financial_review:false},{amount:100,payment_method:'dinheiro',financial_review:false}],form:{descricao:'Dinheiro',tipoPagamento:1}});
 await assert.rejects(a.run());assert.equal(a.calls.filter(c=>c.method==='POST').length,0);
});
test('duas parcelas revisadas pela gestao mantem compatibilidade do fluxo manual',async()=>{
 const a=setup({order:{payment_method:'dinheiro',total:600},events:[{amount:500,payment_method:'dinheiro',financial_review:true},{amount:100,payment_method:'dinheiro',financial_review:true}],form:{descricao:'Dinheiro',tipoPagamento:1}});
 assert.equal((await a.run()).total,600);
});
