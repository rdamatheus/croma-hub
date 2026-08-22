import { protectInternalPage } from './interno-auth.js';
import { migrateLocalState, saveModuleState } from './interno-store.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('auth');

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const keys={notes:['management_notes','croma_mgmt_tasks_v1'],orders:['management_orders','croma_mgmt_orders_v1'],finance:['management_finance','croma_mgmt_finance_v1'],stock:['management_stock','croma_mgmt_stock_v1']};

let [notes,orders,finance,stock]=await Promise.all([
  migrateLocalState(...keys.notes,[]),migrateLocalState(...keys.orders,[]),migrateLocalState(...keys.finance,[]),migrateLocalState(...keys.stock,[])
]);

const persist={
  notes:()=>saveModuleState(keys.notes[0],notes),
  orders:()=>saveModuleState(keys.orders[0],orders),
  finance:()=>saveModuleState(keys.finance[0],finance),
  stock:()=>saveModuleState(keys.stock[0],stock)
};

document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');$(b.dataset.tab).classList.add('active');
});

function render(){
  const today=new Date().toISOString().slice(0,10);
  $('noteList').innerHTML=notes.length?notes.map((x,i)=>`<div class="row"><div><strong>${esc(x.title)}</strong></div><div>${x.due?x.due.split('-').reverse().join('/'):'Sem prazo'}</div><div><span class="pill ${x.due&&x.due<today&&!x.done?'late':''}">${esc(x.priority||'Média')}</span></div><div><button class="btn alt" data-note-toggle="${i}">${x.done?'Reabrir':'Concluir'}</button></div><button class="btn danger" data-note-del="${i}">Excluir</button></div>`).join(''):'<div class="empty">Nenhuma prioridade gerencial cadastrada.</div>';
  $('orderList').innerHTML=orders.length?orders.map((x,i)=>`<div class="row"><div><strong>${esc(x.client)}</strong><br><small>${esc(x.service||'')}</small></div><div>${x.due?x.due.split('-').reverse().join('/'):'Sem prazo'}</div><div><span class="pill">${esc(x.status)}</span></div><select data-order-status="${i}"><option>Orçamento</option><option>Aguardando arte</option><option>Aprovado</option><option>Produção</option><option>Pronto</option><option>Entregue</option></select><button class="btn danger" data-order-del="${i}">Excluir</button></div>`).join(''):'<div class="empty">Nenhum acompanhamento.</div>';
  [...$('orderList').querySelectorAll('select')].forEach((s,i)=>s.value=orders[i].status);
  $('financeList').innerHTML=finance.length?finance.map((x,i)=>`<div class="row"><div><strong>${esc(x.desc||x.cat)}</strong><br><small>${x.date?x.date.split('-').reverse().join('/'):''}</small></div><div class="money ${x.type}"><strong>${x.type==='out'?'- ':'+ '}${brl(x.value)}</strong></div><div><span class="pill">${esc(x.cat)}</span></div><div></div><button class="btn danger" data-finance-del="${i}">Excluir</button></div>`).join(''):'<div class="empty">Nenhum lançamento.</div>';
  $('stockList').innerHTML=stock.length?stock.map((x,i)=>`<div class="row"><div><strong>${esc(x.item)}</strong><br><small>${esc(x.supplier||x.obs||'')}</small></div><div>Atual: <strong>${x.qty}</strong></div><div>Mínimo: <strong>${x.min}</strong></div><div><span class="pill ${Number(x.qty)<=Number(x.min)?'late':'ok'}">${Number(x.qty)<=Number(x.min)?'Atenção':'OK'}</span></div><button class="btn danger" data-stock-del="${i}">Excluir</button></div>`).join(''):'<div class="empty">Nenhum alerta de estoque.</div>';
  const month=new Date().toISOString().slice(0,7),balance=finance.filter(x=>(x.date||'').startsWith(month)).reduce((a,x)=>a+(x.type==='in'?Number(x.value):-Number(x.value)),0);
  $('kOrders').textContent=orders.filter(x=>x.status!=='Entregue').length;$('kBalance').textContent=brl(balance);$('kStock').textContent=stock.filter(x=>Number(x.qty)<=Number(x.min)).length;
}

document.body.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.noteToggle!=null){notes[+b.dataset.noteToggle].done=!notes[+b.dataset.noteToggle].done;await persist.notes();render()}
  if(b.dataset.noteDel!=null){notes.splice(+b.dataset.noteDel,1);await persist.notes();render()}
  if(b.dataset.orderDel!=null){orders.splice(+b.dataset.orderDel,1);await persist.orders();render()}
  if(b.dataset.financeDel!=null){finance.splice(+b.dataset.financeDel,1);await persist.finance();render()}
  if(b.dataset.stockDel!=null){stock.splice(+b.dataset.stockDel,1);await persist.stock();render()}
});
$('orderList').addEventListener('change',async e=>{const s=e.target.closest('[data-order-status]');if(!s)return;orders[+s.dataset.orderStatus].status=s.value;await persist.orders();render()});

$('nAdd').onclick=async()=>{if(!$('nTitle').value.trim())return alert('Informe a prioridade.');notes.unshift({title:$('nTitle').value.trim(),due:$('nDue').value,priority:$('nPri').value,done:false});$('nTitle').value='';await persist.notes();render()};
$('oAdd').onclick=async()=>{if(!$('oClient').value.trim())return alert('Informe o cliente.');orders.unshift({client:$('oClient').value.trim(),service:$('oService').value.trim(),due:$('oDue').value,status:$('oStatus').value});$('oClient').value=$('oService').value='';await persist.orders();render()};
$('fDate').value=new Date().toISOString().slice(0,10);
$('fAdd').onclick=async()=>{if(!$('fValue').value)return alert('Informe o valor.');finance.unshift({date:$('fDate').value,type:$('fType').value,cat:$('fCat').value,value:Number($('fValue').value),desc:$('fDesc').value.trim()});$('fValue').value=$('fDesc').value='';await persist.finance();render()};
$('sAdd').onclick=async()=>{if(!$('sItem').value.trim())return alert('Informe o item.');stock.unshift({item:$('sItem').value.trim(),qty:Number($('sQty').value||0),min:Number($('sMin').value||0),obs:$('sObs').value.trim()});$('sItem').value=$('sQty').value=$('sMin').value=$('sObs').value='';await persist.stock();render()};

render();
