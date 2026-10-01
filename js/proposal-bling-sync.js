import { supabase } from '/js/croma-supabase.js';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labels={not_synced:'Não sincronizada',syncing:'Sincronizando',synced:'Sincronizada',conflict:'Conflito',error:'Erro'};
let syncRows=new Map();

function injectStyles(){
  if(document.getElementById('proposalBlingSyncStyles'))return;
  const style=document.createElement('style');style.id='proposalBlingSyncStyles';style.textContent=`
    .bling-sync-control{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap}.bling-status{font-weight:900;border-radius:999px;padding:7px 10px;font-size:.74rem;white-space:nowrap;background:#efeff8;color:var(--croma-purple)}
    .bling-synced{background:#e9f7ed;color:#247347}.bling-conflict{background:#fff1d8;color:#8a5b00}.bling-error{background:#fdebed;color:#a5303b}.bling-syncing{background:#edf0ff;color:#3f4f9b}.bling-sync-btn{background:#4d46a8}
    .bling-modal-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.bling-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:14px 0}.bling-summary>div{background:#f8f7fc;border-radius:13px;padding:11px}.bling-summary span{display:block;color:var(--croma-muted);font-size:.72rem;margin-bottom:4px}.bling-summary strong{color:var(--croma-deep);font-size:.9rem}
    .bling-alert{border-radius:12px;padding:11px 13px;margin:10px 0;font-size:.86rem;line-height:1.45}.bling-alert.error{background:#fdebed;color:#8b2631}.bling-alert.conflict{background:#fff3dc;color:#805500}.bling-alert ul{margin:6px 0 0 18px;padding:0}
    .bling-item-list{display:grid;gap:8px}.bling-item-option{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--croma-line);border-radius:12px;padding:11px;cursor:pointer}.bling-item-option input{margin-top:3px}.bling-item-option strong,.bling-item-option small{display:block}.bling-item-option small{color:var(--croma-muted);margin-top:3px}.bling-force-confirm{display:flex;gap:10px;align-items:flex-start;background:#fff3dc;border-radius:12px;padding:12px;margin-top:14px;color:#6f4d00;font-size:.86rem}.bling-force-confirm input{margin-top:3px}
    @media(max-width:760px){.bling-summary{grid-template-columns:repeat(2,1fr)}.bling-modal-head{display:grid}}@media(max-width:430px){.bling-summary{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
}

function modalRoot(){return document.getElementById('proposalModalRoot')}
function closeModal(){modalRoot().innerHTML=''}
function feedback(message,type=''){const el=document.getElementById('proposalFeedback');if(!el)return;el.textContent=message||'';el.dataset.type=type}

async function invoke(body){
  const {data,error}=await supabase.functions.invoke('bling-proposal-sync',{body});
  if(!error)return data;
  let detail=error.message||'Não foi possível acessar a sincronização com o Bling.';
  let payload=null;
  try{
    if(error.context&&typeof error.context.clone==='function')payload=await error.context.clone().json();
    else if(error.context&&typeof error.context.json==='function')payload=await error.context.json();
  }catch{}
  if(payload?.detail)detail=payload.detail;
  else if(payload?.error)detail=payload.error;
  const wrapped=new Error(detail);wrapped.payload=payload;throw wrapped;
}

async function loadSyncRows(){
  const {data,error}=await supabase.from('sales_proposals').select('id,bling_proposal_id,bling_sync_status,bling_sync_error,bling_last_synced_at').order('created_at',{ascending:false}).limit(200);
  if(error)throw error;
  syncRows=new Map((data||[]).map(row=>[row.id,row]));
}

function statusClass(status){return `bling-status bling-${String(status||'not_synced').replace(/[^a-z_]/g,'')}`}
function actionLabel(row){
  if(row?.bling_sync_status==='conflict')return 'Revisar conflito';
  if(row?.bling_proposal_id)return 'Atualizar Bling';
  return 'Sincronizar com Bling';
}

function decorate(){
  document.querySelectorAll('.proposal-card[data-proposal-id]').forEach(card=>{
    const id=card.dataset.proposalId,row=syncRows.get(id)||{bling_sync_status:'not_synced'};
    const host=card.querySelector('.proposal-head-side');if(!host)return;
    host.querySelector('.bling-sync-control')?.remove();
    const wrap=document.createElement('span');wrap.className='bling-sync-control';
    wrap.innerHTML=`<span class="${statusClass(row.bling_sync_status)}" title="${esc(row.bling_sync_error||'')}">${esc(labels[row.bling_sync_status]||labels.not_synced)}${row.bling_proposal_id?` · #${esc(row.bling_proposal_id)}`:''}</span><button class="mini-btn bling-sync-btn" type="button">${esc(actionLabel(row))}</button>`;
    wrap.querySelector('button').addEventListener('click',()=>openSync(id));
    host.appendChild(wrap);
  });
}

function selectedIds(root){return [...root.querySelectorAll('input[name="blingProposalItem"]:checked')].map(input=>input.value)}
function selectedTotal(preview,ids){return (preview.items||[]).filter(i=>ids.includes(String(i.id))).reduce((sum,i)=>sum+Number(i.final_total||0),0)}

function renderModal(preview){
  const current=preview.proposal||{},items=preview.items||[],conflict=current.bling_sync_status==='conflict';
  modalRoot().innerHTML=`<div class="modal-backdrop" data-bling-backdrop><section class="modal bling-sync-modal" role="dialog" aria-modal="true" aria-labelledby="blingSyncTitle">
    <div class="bling-modal-head"><div><span class="internal-eyebrow">Integração Bling</span><h2 id="blingSyncTitle">Proposta #${esc(current.proposal_no)}</h2><p class="modal-lead">A sincronização envia apenas dados comerciais. Custos, frete, markup, margem e pesquisa de mercado permanecem no Croma Hub.</p></div><span class="${statusClass(current.bling_sync_status)}">${esc(labels[current.bling_sync_status]||labels.not_synced)}</span></div>
    <div class="bling-summary">
      <div><span>Cliente</span><strong>${esc(current.customer_name||'—')}</strong></div>
      <div><span>Contato Bling</span><strong>${esc(preview.customer?.bling_contact_id||'Não vinculado')}</strong></div>
      <div><span>Proposta Bling</span><strong>${esc(current.bling_proposal_id||'Ainda não criada')}</strong></div>
      <div><span>Última confirmação</span><strong>${current.bling_last_synced_at?esc(dateTime.format(new Date(current.bling_last_synced_at))):'—'}</strong></div>
    </div>
    ${current.bling_sync_error?`<div class="bling-alert ${conflict?'conflict':'error'}">${esc(current.bling_sync_error)}</div>`:''}
    ${(preview.errors||[]).length?`<div class="bling-alert error"><strong>Antes de sincronizar:</strong><ul>${preview.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div>`:''}
    <div class="form-section"><h3>Itens que irão para o Bling</h3><p class="share-note">Quando a cotação tem alternativas, selecione somente as opções que devem compor esta proposta comercial.</p>
      <div class="bling-item-list">${items.map(item=>`<label class="bling-item-option"><input type="checkbox" name="blingProposalItem" value="${esc(item.id)}" ${item.selected?'checked':''}><span><strong>${esc(item.option_label||item.description)}</strong><small>${esc(item.description||'')} · ${esc(item.quantity)} ${esc(item.unit||'un')} · ${item.final_total==null?'Preço final pendente':money.format(Number(item.final_total))}</small></span></label>`).join('')||'<p class="empty">Sem itens.</p>'}</div>
      <div class="analysis-strip"><span>Total comercial selecionado: <b id="blingSelectedTotal">${money.format(selectedTotal(preview,items.filter(i=>i.selected).map(i=>String(i.id))))}</b></span></div>
    </div>
    ${conflict?`<label class="bling-force-confirm"><input type="checkbox" id="blingForceConfirm"><span>Revisei o conflito e autorizo usar a versão do Croma Hub para atualizar a proposta no Bling.</span></label>`:''}
    <div id="blingModalFeedback" class="modal-feedback"></div>
    <div class="modal-actions"><button class="mini-btn alt" type="button" data-bling-close>Cancelar</button><button class="mini-btn" type="button" id="blingSyncSubmit">${conflict?'Usar Croma no Bling':current.bling_proposal_id?'Atualizar proposta no Bling':'Criar proposta no Bling'}</button></div>
  </section></div>`;
  const root=modalRoot(),submit=root.querySelector('#blingSyncSubmit'),total=root.querySelector('#blingSelectedTotal'),force=root.querySelector('#blingForceConfirm');
  const recalc=()=>{
    const ids=selectedIds(root);total.textContent=money.format(selectedTotal(preview,ids));
    submit.disabled=!ids.length||(conflict&&!force?.checked);
  };
  root.querySelectorAll('input[name="blingProposalItem"]').forEach(input=>input.addEventListener('change',recalc));
  force?.addEventListener('change',recalc);recalc();
  root.querySelector('[data-bling-close]').addEventListener('click',closeModal);
  root.querySelector('[data-bling-backdrop]').addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal()});
  submit.addEventListener('click',async()=>{
    const ids=selectedIds(root),fb=root.querySelector('#blingModalFeedback');
    if(!ids.length){fb.textContent='Selecione pelo menos um item.';fb.dataset.type='error';return}
    if(conflict&&!force?.checked){fb.textContent='Confirme a revisão do conflito para sobrescrever a versão do Bling.';fb.dataset.type='error';return}
    submit.disabled=true;fb.textContent='Sincronizando com o Bling…';fb.dataset.type='';
    try{
      const result=await invoke({action:'sync',proposal_id:current.id,item_ids:ids,force_local:Boolean(conflict&&force?.checked)});
      fb.textContent=result?.action==='created'?'Proposta criada e relida no Bling.':result?.action==='updated'?'Proposta atualizada e relida no Bling.':result?.action==='recovered_existing'?'Proposta existente recuperada sem duplicação.':'Sincronização confirmada.';fb.dataset.type='success';
      await loadSyncRows();decorate();setTimeout(closeModal,900);
    }catch(error){fb.textContent=error.message;fb.dataset.type='error';await loadSyncRows().catch(()=>{});decorate();submit.disabled=false}
  });
}

async function openSync(proposalId){
  feedback('Preparando sincronização com o Bling…');
  try{const preview=await invoke({action:'preview',proposal_id:proposalId});feedback('');renderModal(preview)}
  catch(error){feedback(error.message,'error')}
}

export async function initProposalBlingSync(){
  injectStyles();
  const list=document.getElementById('proposalsList');
  if(list&&!list.dataset.blingSyncObserved){
    list.dataset.blingSyncObserved='1';
    new MutationObserver(()=>decorate()).observe(list,{childList:true});
  }
  try{await loadSyncRows();decorate()}
  catch(error){feedback(`Propostas carregadas, mas o status do Bling não pôde ser consultado: ${error.message}`,'error')}
}
