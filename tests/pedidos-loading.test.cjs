const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

test('Pedidos: debounce, stale responses, pagination, failures and recovery',async()=>{
 const nodes=new Map();
 class Element{
  constructor(){this.value='';this.textContent='';this.html='';this.hidden=false;this.attrs={};this.listeners={};this.buttons=[]}
  set innerHTML(value){this.html=value;this.buttons=[...value.matchAll(/<button ([^>]*)data-p="(\d+)"/g)].map(m=>({dataset:{p:m[2]},disabled:m[1].includes('disabled')}))}
  get innerHTML(){return this.html}
  replaceChildren(){this.innerHTML=''}
  setAttribute(k,v){this.attrs[k]=v}
  addEventListener(k,f){this.listeners[k]=f}
  querySelectorAll(){return this.buttons}
 }
 const el=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id)};
 const pending=[],timers=new Map();let timerId=0;
 const context=vm.createContext({document:{querySelector:el},console:{error(){}},location:{},scrollTo(){},
  setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)},
  protectInternalPage:async()=>({}),signOutStaff:async()=>{},
  supabase:{from(table){assert.equal(table,'orders');const calls=[];const q={};for(const method of ['select','order','eq','or'])q[method]=(...args)=>{calls.push([method,...args]);return q};q.range=(...range)=>new Promise((resolve,reject)=>pending.push({calls,range,resolve,reject}));return q}}
 });
 const source=fs.readFileSync(path.join(__dirname,'../js/interno-pedidos.js'),'utf8').replace(/^import .*;\n/gm,'');
 await vm.runInContext(`(async()=>{${source}})()`,context);
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const respond=async(i,code='DEMO',count=65)=>{pending[i].resolve({data:code?[{order_code:code,customer_profiles:{nome:'Demo'}}]:[],count,error:null});await flush()};
 const change=(id,value,event='change')=>{el(id).value=value;el(id).listeners[event]()};
 const tick=()=>{const f=[...timers.values()];timers.clear();f.forEach(fn=>fn())};
 assert.equal(pending.length,1);assert.match(el('#summary').textContent,/Carregando/);
 await respond(0);assert.match(el('#body').innerHTML,/DEMO/);
 el('#pager').buttons.find(b=>b.dataset.p==='2').onclick();assert.deepEqual(pending[1].range,[30,59]);assert.equal(el('#pager').buttons.length,0);await respond(1);
 change('#q','D','input');change('#q','DE','input');change('#q','DEMO','input');assert.equal(pending.length,2);assert.equal(timers.size,1);tick();assert.equal(pending.length,3);
 change('#q','NEW','input');await respond(2,'DEMO-STALE');assert.equal(el('#body').innerHTML,'');tick();await respond(3,'NEW',1);
 change('#status','pago');change('#status','pronto');await respond(5,'NEW-LATEST',1);await respond(4,'NEW-OLD',50);assert.match(el('#body').innerHTML,/NEW-LATEST/);assert.doesNotMatch(el('#body').innerHTML,/NEW-OLD/);
 change('#payment','pix');pending[6].resolve({error:{message:'simulated'}});await flush();assert.equal(el('#retryOrders').hidden,false);assert.equal(el('#summary').textContent,'Pedidos indisponíveis');assert.equal(el('#pager').buttons.length,0);
 el('#retryOrders').listeners.click();assert.ok(pending[7].calls.some(c=>c[0]==='eq'&&c[1]==='status'&&c[2]==='pronto'));await respond(7,'NEW-RECOVERED',1);assert.match(el('#body').innerHTML,/NEW-RECOVERED/);assert.equal(el('#retryOrders').hidden,true);
 change('#fulfillment','entrega');pending[8].reject(new Error('network'));await flush();assert.equal(el('#retryOrders').hidden,false);
 el('#retryOrders').listeners.click();await respond(9,null,0);assert.match(el('#ordersFeedback').textContent,/Nenhum pedido/);assert.equal(el('#pager').buttons.length,0);assert.equal(el('#ordersResults').attrs['aria-busy'],'false');
 // A late failure must not replace a newer success.
 change('#status','pago');change('#status','pronto');await respond(11,'NEW-OK',65);pending[10].reject(new Error('stale'));await flush();assert.match(el('#body').innerHTML,/NEW-OK/);assert.equal(el('#retryOrders').hidden,true);
 // Preserve a way back if a page becomes empty while other pages still exist.
 el('#pager').buttons.find(b=>b.dataset.p==='2').onclick();await respond(12,null,30);assert.ok(el('#pager').buttons.some(b=>b.dataset.p==='1'&&!b.disabled));
 // A select change cancels a queued search rather than issuing it twice.
 change('#q','N','input');change('#payment','credito');const before=pending.length;tick();assert.equal(pending.length,before);assert.deepEqual(pending.at(-1).range,[0,29]);
});
