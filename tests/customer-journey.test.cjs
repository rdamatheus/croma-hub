const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../js',name),'utf8').replace(/^import .*;\n/gm,'');
function node(){return {value:'',textContent:'',innerHTML:'',disabled:false,dataset:{},listeners:{},className:'',classList:{toggle(){},add(){},remove(){}},addEventListener(k,f){this.listeners[k]=f},querySelector(){return node()},querySelectorAll(){return []}}}
async function checkout(authenticated){
 const nodes=new Map(),events={},radios={fulfillment:{...node(),value:'retirada'},addressMode:{...node(),value:'outro'},payment:{...node(),value:'pix'}};
 const el=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const calls=[],opens=[];let cart=[{id:'line',productId:'product',name:'Produto',qty:2,unitPrice:10}];
 const document={getElementById:el,addEventListener(k,f){events[k]=f},querySelector(s){const name=s.match(/name="(.*?)"/)?.[1];return radios[name]||node()},querySelectorAll(s){return s.startsWith('[name=')?[document.querySelector(s)]:[]}};
 const api={read:()=>cart,update(id,qty){cart[0].qty=Number(qty);events['croma:cart-updated']()},remove(){cart=[];events['croma:cart-updated']()},cartRef:()=> 'ref',syncNow:async()=>{calls.push('sync')},afterCheckout(){cart=[];events['croma:cart-updated']()}};
 const supabase={from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}},functions:{invoke:async()=>({data:{enabled:false}})},rpc:async(name,args)=>{calls.push([name,args]);return {data:[{order_id:'order',order_code:'CRO-TEST',total:20}]}}};
 const context=vm.createContext({document,window:{CromaCart:api,open:(...a)=>{const w={location:{},close(){}};opens.push(a);return w}},console,supabase,location:{href:'/carrinho/'},getSessionUser:async()=>authenticated?{id:'user'}:null,requireUser:async()=>{calls.push('login');return null},onlyDigits:s=>s.replace(/\D/g,''),sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},setTimeout(){},scrollTo(){},alert(){},URLSearchParams});
 await vm.runInContext(`(async()=>{${read('checkout.js')}\nglobalThis.payload=checkoutPayload;})()`,context);
 return {nodes,el,events,radios,calls,opens,api,context};
}
test('Carrinho anônimo permite revisar, editar e remover; login só ao continuar',async()=>{
 const t=await checkout(false);assert.deepEqual(t.calls,[]);assert.match(t.el('items').innerHTML,/Produto/);assert.match(t.el('total').textContent,/20,00/);
 t.api.update('line',3);assert.match(t.el('total').textContent,/30,00/);
 await t.el('to2').onclick();assert.deepEqual(t.calls,['login']);t.api.remove();assert.equal(t.el('to2').disabled,true);
});
test('Entrega solicita cotação sem criar pedido, pagamento ou limpar carrinho',async()=>{
 const t=await checkout(true);t.radios.fulfillment.value='entrega';
 for(const [id,value] of Object.entries({cep:'36000000',logradouro:'Rua Teste',numero:'1',bairro:'Centro',cidade:'Juiz de Fora',estado:'MG'}))t.el(id).value=value;
 await t.radios.fulfillment.onchange();assert.match(t.el('finish').textContent,/cotação/);
 await t.el('finish').onclick();assert.deepEqual(t.calls,[]);assert.equal(t.api.read().length,1);assert.match(t.opens[0][0],/^https:\/\/wa.me\//);assert.match(decodeURIComponent(t.opens[0][0]),/frete não incluído/);
 assert.throws(()=>t.context.payload('credito'),/Confirme o frete/);
});
test('Retirada mantém sincronização e registro pelo endpoint existente',async()=>{
 const t=await checkout(true);await t.el('finish').onclick();assert.equal(t.calls[0],'sync');assert.equal(t.calls[1][0],'checkout_active_cart');assert.equal(t.calls[1][1].p_fulfillment,'retirada');assert.equal(t.calls[1][1].p_delivery_fee,0);assert.equal(t.api.read().length,0);
});
test('Busca ignora resultados atrasados e oferece nova tentativa após erro',async()=>{
 const nodes=new Map(),pending=[];const el=s=>{if(!nodes.has(s))nodes.set(s,node());return nodes.get(s)};
 const context=vm.createContext({document:{querySelector:el},location:{search:'?q=inicial',href:'https://example.test/busca/'},history:{replaceState(){}},console:{error(){}},URL,URLSearchParams,searchCommercialCatalog:q=>new Promise((resolve,reject)=>pending.push({q,resolve,reject}))});
 await vm.runInContext(`(async()=>{${read('search-commercial.js')}globalThis.runSearch=run})()`,context);
 const result=name=>({query:name,items:[{id:name,nome:name}],categories:[],families:[],media:new Map(),actions:new Map()});
 const latest=context.runSearch('nova');pending[1].resolve(result('nova'));await latest;pending[0].resolve(result('antiga'));await new Promise(r=>setImmediate(r));assert.match(el('#searchResults').innerHTML,/nova/);assert.doesNotMatch(el('#searchResults').innerHTML,/antiga/);
 const fail=context.runSearch('falha');pending[2].reject(Error('offline'));await fail;assert.match(el('#searchResults').innerHTML,/retrySearch/);
});
