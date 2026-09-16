import { supabase } from '/js/croma-supabase.js';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statusLabel=status=>({draft:'Rascunho',sent:'Enviada',approved:'Aprovada',rejected:'Recusada',expired:'Expirada',cancelled:'Cancelada'})[status]||status||'Rascunho';
const pct=value=>Number.isFinite(value)?`${value.toFixed(2).replace('.',',')}%`:'—';
const multiplier=value=>Number.isFinite(value)&&value>0?`${value.toFixed(2).replace('.',',')}×`:'—';

function safeUrl(value){
  try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}
}

function itemPricing(item){
  const cost=Number(item.total_cost||0);
  const markup=Number(item.applied_markup||item.recommended_markup||0);
  const markupPrice=Number(item.line_total||0);
  const market=item.market_reference_price==null?null:Number(item.market_reference_price);
  const suggested=item.suggested_price==null?null:Number(item.suggested_price);
  const contribution=suggested==null?null:suggested-cost;
  const margin=suggested&&suggested>0?contribution/suggested*100:null;
  const suggestedMarkup=suggested&&cost>0?suggested/cost:null;
  return {cost,markup,markupPrice,market,suggested,contribution,margin,suggestedMarkup};
}

function renderItem(item){
  const p=itemPricing(item);
  const sourceUrl=safeUrl(item.market_reference_metadata?.primary?.url);
  const marketSource=item.market_reference_source||item.market_reference_metadata?.primary?.supplier||'';
  return `<section class="proposal-item">
    <div class="proposal-item-head"><div><strong>${esc(item.option_label||item.description)}</strong><small>${esc(item.description||'')}</small></div><span class="sku">${esc(item.supplier_sku||'sem SKU')}</span></div>
    <div class="price-grid">
      <div><span>Custo do fornecedor</span><strong>${money.format(Number(item.base_cost||0))}</strong></div>
      <div><span>Frete</span><strong>${money.format(Number(item.freight_cost||0))}</strong></div>
      <div><span>Custo total</span><strong>${money.format(p.cost)}</strong></div>
      <div><span>Markup definido</span><strong>${multiplier(p.markup)}</strong></div>
      <div><span>Preço pelo markup</span><strong>${money.format(p.markupPrice)}</strong></div>
      <div class="market"><span>Valor de mercado</span><strong>${p.market==null?'Pesquisa pendente':money.format(p.market)}</strong></div>
      <div class="suggested"><span>Preço sugerido</span><strong>${p.suggested==null?'A definir':money.format(p.suggested)}</strong></div>
    </div>
    ${p.suggested!=null?`<div class="analysis-strip"><span>Markup implícito sugerido: <b>${multiplier(p.suggestedMarkup)}</b></span><span>Contribuição bruta: <b>${money.format(p.contribution)}</b></span><span>Margem sobre venda: <b>${pct(p.margin)}</b></span></div>`:''}
    ${marketSource?`<div class="market-source"><b>Referência:</b> ${esc(marketSource)}${sourceUrl?` · <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">abrir fonte</a>`:''}${item.market_researched_at?` · pesquisado em ${esc(dateTime.format(new Date(item.market_researched_at)))}`:''}</div>`:''}
  </section>`;
}

function renderProposal(proposal){
  const items=[...(proposal.sales_proposal_items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  return `<article class="proposal-card" data-search="${esc(`${proposal.proposal_no} ${proposal.customer_name} ${proposal.customer_phone||''}`.toLowerCase())}">
    <header class="proposal-head"><div><span class="proposal-number">Proposta #${esc(proposal.proposal_no)}</span><h2>${esc(proposal.customer_name)}</h2><p>${esc(proposal.customer_phone||'Sem telefone')}</p></div><span class="status">${esc(statusLabel(proposal.status))}</span></header>
    ${proposal.notes?`<p class="notes">${esc(proposal.notes)}</p>`:''}
    <div class="proposal-items">${items.length?items.map(renderItem).join(''):'<p class="empty">Sem itens nesta proposta.</p>'}</div>
    <footer>Criada em ${esc(dateTime.format(new Date(proposal.created_at)))}</footer>
  </article>`;
}

export async function initProposalsAdmin(){
  const list=document.getElementById('proposalsList');
  const search=document.getElementById('proposalSearch');
  const feedback=document.getElementById('proposalFeedback');
  feedback.textContent='Carregando propostas…';

  const {data,error}=await supabase
    .from('sales_proposals')
    .select('id,proposal_no,customer_name,customer_phone,status,notes,created_at,sales_proposal_items(id,description,option_label,quantity,unit,supplier_sku,base_cost,freight_cost,total_cost,recommended_markup,applied_markup,line_total,sort_order,market_reference_price,suggested_price,market_reference_source,market_researched_at,market_reference_metadata)')
    .order('created_at',{ascending:false})
    .limit(200);

  if(error){
    list.innerHTML='<p class="empty">Não foi possível carregar as propostas.</p>';
    feedback.textContent=error.message||'Falha ao carregar propostas.';
    feedback.dataset.type='error';
    return;
  }

  list.innerHTML=data?.length?data.map(renderProposal).join(''):'<p class="empty">Nenhuma proposta cadastrada.</p>';
  feedback.textContent=data?.length?`${data.length} proposta(s) encontrada(s).`:'';

  search?.addEventListener('input',()=>{
    const term=search.value.trim().toLowerCase();
    let visible=0;
    list.querySelectorAll('.proposal-card').forEach(card=>{
      const show=!term||card.dataset.search.includes(term);
      card.hidden=!show;
      if(show) visible++;
    });
    feedback.textContent=term?`${visible} proposta(s) encontrada(s).`:`${data?.length||0} proposta(s) encontrada(s).`;
  });
}
