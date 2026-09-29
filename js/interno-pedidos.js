import { supabase } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';
const session=await protectInternalPage();if(!session)throw new Error('auth');
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const statusLabels={recebido:'Recebido',em_analise:'Em análise',aguardando_pagamento:'Aguardando pagamento',pago:'Pago',em_producao:'Em produção',pronto:'Pronto',enviado:'Enviado',concluido:'Concluído',cancelado:'Cancelado'};
const PAGE_SIZE=30;
const SEARCH_DELAY=300;
let page=1,total=0,revision=0,searchTimer;
const feedback=$('#ordersFeedback'),retry=$('#retryOrders'),results=$('#ordersResults');

function showPending(){
  total=0;
  $('#summary').textContent='Carregando pedidos…';
  $('#pager').replaceChildren();
  $('#body').replaceChildren();
  results.hidden=true;
  results.setAttribute('aria-busy','true');
  feedback.hidden=true;
  retry.hidden=true;
}

function requestLoad(delay=0){
  clearTimeout(searchTimer);
  // Invalidate immediately, including the debounce window before the next request.
  const requestRevision=++revision;
  showPending();
  if(delay)searchTimer=setTimeout(()=>load(requestRevision),delay);
  else void load(requestRevision);
}
$('#logout').onclick=async()=>{await signOutStaff();location.href='/interno/'};
for(const id of ['q','status','payment','fulfillment']) $('#'+id).addEventListener(id==='q'?'input':'change',()=>{page=1;requestLoad(id==='q'?SEARCH_DELAY:0)});
function renderPager(){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE)),box=$('#pager'),start=Math.max(1,page-2),end=Math.min(pages,page+2);let h=`<button ${page<=1?'disabled':''} data-p="${page-1}">← Anterior</button>`;if(start>1)h+=`<button data-p="1">1</button>${start>2?'<span>…</span>':''}`;for(let p=start;p<=end;p++)h+=`<button class="${p===page?'active':''}" data-p="${p}">${p}</button>`;if(end<pages)h+=`${end<pages-1?'<span>…</span>':''}<button data-p="${pages}">${pages}</button>`;h+=`<button ${page>=pages?'disabled':''} data-p="${page+1}">Próxima →</button>`;box.innerHTML=h;box.querySelectorAll('button[data-p]').forEach(b=>b.onclick=()=>{const p=Number(b.dataset.p);if(p>=1&&p<=pages&&p!==page){page=p;requestLoad();scrollTo({top:0,behavior:'smooth'})}})}
retry.addEventListener('click',()=>requestLoad());

async function load(requestRevision){
  const q=$('#q').value.trim(),status=$('#status').value,
    payment=$('#payment').value,fulfillment=$('#fulfillment').value;
  const from=(page-1)*PAGE_SIZE;
  try{
    // Preserve existing read filters; customer-name search is a separate change.
    let req=supabase.from('orders').select('*,customer_profiles(nome,email)',{count:'exact'}).order('created_at',{ascending:false});
    if(status)req=req.eq('status',status);
    if(payment)req=req.eq('payment_method',payment);
    if(fulfillment)req=req.eq('fulfillment',fulfillment);
    if(q){const safe=q.replaceAll(',',' ');req=req.or(`order_code.ilike.%${safe}%`)}
    const {data,error,count}=await req.range(from,from+PAGE_SIZE-1);
    if(requestRevision!==revision)return;
    if(error)throw error;
    results.hidden=false;
    results.setAttribute('aria-busy','false');
    let rows=data||[];if(q){const l=q.toLowerCase();rows=rows.filter(o=>String(o.order_code||'').toLowerCase().includes(l)||String(o.customer_profiles?.nome||'').toLowerCase().includes(l))}total=count||0;$('#summary').textContent=`${total.toLocaleString('pt-BR')} pedido(s) · 30 por página`;$('#body').innerHTML=rows.length?rows.map(o=>`<tr><td><strong>${esc(o.order_code||'—')}</strong></td><td>${esc(o.customer_profiles?.nome||'—')}<br><span class="muted">${esc(o.customer_profiles?.email||'')}</span></td><td><span class="pill">${esc(statusLabels[o.status]||o.status||'—')}</span></td><td>${o.fulfillment==='entrega'?'Entrega':'Retirada'}</td><td>${o.payment_method==='pix'?'Pix':o.payment_method==='credito'?'Crédito':o.payment_method==='debito'?'Débito':esc(o.payment_method||'—')}</td><td>${brl(o.total)}</td><td>${o.created_at?new Date(o.created_at).toLocaleString('pt-BR'):'—'}</td></tr>`).join(''):'<tr><td colspan="7" style="padding:28px;color:var(--croma-muted)">Nenhum pedido encontrado.</td></tr>';if(total>0)renderPager();if(!rows.length){results.hidden=true;feedback.hidden=false;feedback.textContent='Nenhum pedido encontrado para os filtros selecionados.'}
  }catch(error){
    if(requestRevision!==revision)return;
    console.error('Falha ao carregar pedidos.',error);
    results.setAttribute('aria-busy','false');
    $('#summary').textContent='Pedidos indisponíveis';
    feedback.textContent='Não foi possível carregar os pedidos. Tente novamente.';
    feedback.hidden=false;
    retry.hidden=false;
  }
}

requestLoad();
