import { supabase } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';

const session = await protectInternalPage({ roles: ['owner'] });
if (!session) throw new Error('auth');

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
const fmtDay = v => v ? new Date(`${String(v).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const docStatus = {draft:'Preparada',validated:'Validada',created_bling:'Criada no Bling',sending:'Enviando',authorized:'Autorizada',rejected:'Rejeitada',cancelled:'Cancelada'};
let profiles = [], profilesById = new Map(), page = 1, limit = 30, lastRows = [], selectedOrderId = null, selectedDetail = null, searchNumber = '';

$('logout').onclick = async()=>{await signOutStaff(); location.href='/interno/'};
$('refresh').onclick = ()=>loadAll(true);
$('searchOrder').onclick = ()=>{searchNumber=$('orderSearch').value.replace(/\D/g,'');page=1;loadOrders(true)};
$('clearSearch').onclick = ()=>{$('orderSearch').value='';searchNumber='';page=1;loadOrders(true)};
$('orderSearch').addEventListener('keydown',e=>{if(e.key==='Enter')$('searchOrder').click()});
$('prevPage').onclick = ()=>{if(page>1){page--;loadOrders(true)}};
$('nextPage').onclick = ()=>{if(lastRows.length===limit){page++;loadOrders(true)}};

function setMessage(text,type=''){
  const box=$('globalMessage');
  if(!text){box.className='notice hidden';box.textContent='';return}
  box.className=`notice ${type}`;box.textContent=text;
}
function setDetailMessage(text,type=''){
  const box=$('detailMessage');
  if(!text){box.className='notice hidden';box.textContent='';return}
  box.className=`notice ${type}`;box.textContent=text;
}
function dot(ok,warn=false){return `<span class="dot ${ok?'ok':warn?'warn':''}"></span>`}
function readableError(value){
  if(!value)return 'Falha inesperada.';
  if(typeof value==='string')return value;
  for(const key of ['detail','message','error']){
    if(typeof value[key]==='string')return value[key];
    if(value[key]&&value[key]!==value){const nested=readableError(value[key]);if(nested)return nested}
  }
  return 'Não foi possível concluir a operação.';
}
async function invoke(functionName,body){
  const {data,error}=await supabase.functions.invoke(functionName,{body});
  if(error){
    let message=readableError(error),payload=null;
    try{if(error.context?.json){payload=await error.context.json();message=readableError(payload)||message}}catch{}
    const e=new Error(message);e.payload=payload;throw e;
  }
  if(data?.error){const e=new Error(readableError(data));e.payload=data;throw e}
  return data;
}
const invokeBling=body=>invoke('bling-erp',body);
const invokeOrders=body=>invoke('nfse-order-workflow',body);

function maskDoc(v){const d=String(v||'').replace(/\D/g,'');if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');return v||'—'}
function nfsePill(d){
  if(!d)return '<span class="pill">Analisar</span>';
  if(d.status==='authorized')return `<span class="pill ok">NFS-e ${esc(d.numero_nfse||'autorizada')}</span>`;
  if(d.status==='rejected')return `<span class="pill error">${esc(docStatus[d.status])}${d.error_code?' · '+esc(d.error_code):''}</span>`;
  if(d.status==='sending')return '<span class="pill warn">Enviando</span>';
  return `<span class="pill warn">${esc(docStatus[d.status]||d.status)}</span>`;
}

async function loadProfiles(){
  const {data,error}=await supabase.from('fiscal_service_profiles').select('*').eq('ativo',true).order('padrao',{ascending:false}).order('nome');
  if(error)throw error;
  profiles=data||[];profilesById=new Map(profiles.map(p=>[p.id,p]));
  const p=profiles.find(x=>x.padrao)||profiles[0];
  $('profileStatus').innerHTML=p?`${dot(true)}${esc(p.nome)} · ${esc(p.codigo_tributacao_nacional)}`:`${dot(false,true)}Nenhum perfil ativo`;
}
async function loadBlingStatus(){
  const data=await invokeBling({action:'status'});const connected=data.connection?.status==='connected';
  $('blingStatus').innerHTML=`${dot(connected,!connected)}${connected?'Conectado':'Atenção: '+esc(data.connection?.status||'indisponível')}`;
  try{await invokeBling({action:'nfse_config_get'});$('configStatus').innerHTML=`${dot(true)}Leitura disponível`}
  catch(error){$('configStatus').innerHTML=`${dot(false,true)}Não validada`;throw new Error(`Configuração NFS-e: ${error.message}`)}
}
async function loadOrders(showMessage=false){
  if(showMessage)setMessage('Atualizando pedidos do Bling…');
  try{
    const data=await invokeOrders({action:'orders_list',page,limit,numero:searchNumber});
    lastRows=Array.isArray(data.data)?data.data:[];
    $('orderSummary').textContent=searchNumber?`${lastRows.length} resultado(s) para o pedido ${searchNumber}`:`${lastRows.length} pedido(s) nesta página`;
    $('pageLabel').textContent=`Página ${page}`;
    $('prevPage').disabled=page<=1;$('nextPage').disabled=lastRows.length<limit||!!searchNumber;
    $('ordersBody').innerHTML=lastRows.length?lastRows.map(o=>`<tr><td><strong>#${esc(o.numero||o.id)}</strong></td><td>${esc(fmtDay(o.data))}</td><td>${esc(o.contato?.nome||'—')}<br><span class="muted">${esc(maskDoc(o.contato?.numeroDocumento||''))}</span></td><td>${esc(brl(o.total))}</td><td>${esc(o.situacao?.valor||'—')}</td><td>${nfsePill(o.croma_nfse)}</td><td><button class="mini primary" data-order="${esc(o.id)}">Abrir</button></td></tr>`).join(''):'<tr><td colspan="7" class="muted" style="padding:24px">Nenhum pedido retornado pelo Bling.</td></tr>';
    $('ordersBody').querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>openOrder(Number(b.dataset.order)));
    if(showMessage)setMessage('Pedidos atualizados.','ok');
  }catch(error){$('ordersBody').innerHTML=`<tr><td colspan="7" style="padding:24px;color:#8c2f2f">${esc(error.message)}</td></tr>`;setMessage(error.message,'error')}
}
async function loadExternal(){
  try{
    const data=await invokeBling({action:'nfse_list',query:{pagina:1,limite:15}});const rows=Array.isArray(data?.data)?data.data:[];
    $('externalBody').innerHTML=rows.length?rows.map(n=>`<tr><td>${esc(n.numero||'—')}</td><td>${esc(n.numeroRPS||'—')}</td><td>${esc(n.contato?.nome||n.cliente?.nome||'—')}</td><td>${esc(brl(n.valor))}</td><td>${esc(n.situacao||'—')}</td><td>${esc(fmtDate(n.dataEmissao||n.data))}</td></tr>`).join(''):'<tr><td colspan="6" class="muted" style="padding:24px">Nenhuma NFS-e retornada pelo Bling.</td></tr>';
  }catch(error){$('externalBody').innerHTML=`<tr><td colspan="6" style="padding:24px;color:#8c2f2f">${esc(error.message)}</td></tr>`}
}
async function loadAll(showMessage=false){
  if(showMessage)setMessage('Atualizando dados…');
  const results=await Promise.allSettled([loadProfiles(),loadBlingStatus(),loadOrders(false),loadExternal()]);
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason?.message).filter(Boolean);
  if(errors.length)setMessage(errors.join(' · '),'error');else if(showMessage)setMessage('Dados atualizados.','ok');
  if(selectedOrderId)await openOrder(selectedOrderId,false).catch(()=>{});
}

function fiscalProfileText(p){return p?`${p.nome} · ${p.codigo_tributacao_nacional} · NBS ${p.nbs||'—'}`:'—'}
function renderItem(item){
  const typeLabel=item.type==='service'?'Serviço':item.type==='product'?'Mercadoria':'Não identificado';
  let fiscal='';let cls='';
  if(item.type==='service'&&item.fiscal_profile){
    cls='<span class="pill ok">Classificado</span>';
    fiscal=`<div class="item-meta">${esc(fiscalProfileText(item.fiscal_profile))}${item.fiscal_profile_source==='parent'?' · herdado do produto pai':''}</div>`;
  }else if(item.type==='service'){
    cls='<span class="pill warn">Sem perfil fiscal</span>';
    const options=profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)} · ${esc(p.codigo_tributacao_nacional)}</option>`).join('');
    fiscal=`<div class="item-actions"><select data-profile-for="${esc(item.bling_product_id)}">${options}</select><button class="mini primary" data-classify="${esc(item.bling_product_id)}">Classificar</button></div>`;
  }else if(item.type==='product')cls='<span class="pill error">Mercadoria · NFS-e bloqueada</span>';
  else cls='<span class="pill error">Não localizado no catálogo</span>';
  return `<div class="item-card"><h4>${esc(item.descricao)}</h4><div class="item-meta">${esc(typeLabel)} · ${Number(item.quantidade||0).toLocaleString('pt-BR')} × ${esc(brl(item.valor_unitario))} · Bling produto ${esc(item.bling_product_id||'—')}</div><div style="margin-top:7px">${cls}</div>${fiscal}</div>`;
}
function docPrimaryAction(doc){
  if(!doc)return null;
  if(doc.status==='draft'||(doc.status==='rejected'&&!doc.bling_nfse_id))return {action:'validate',label:'Revalidar'};
  if(doc.status==='validated')return {action:'create',label:'Criar NFS-e no Bling'};
  if(doc.status==='created_bling')return {action:'send',label:'Emitir NFS-e'};
  if(doc.status==='rejected'&&doc.bling_nfse_id)return {action:'validate',label:'Revalidar'};
  return null;
}
function renderAnalysis(data){
  const {order,analysis}=data;selectedDetail=data;
  $('detailEmpty').classList.add('hidden');$('detailContent').classList.remove('hidden');
  $('detailFields').innerHTML=`<div><b>Pedido Bling</b>#${esc(order.numero||order.id)}</div><div><b>Cliente</b>${esc(order.contato?.nome||'—')} · ${esc(maskDoc(order.contato?.numeroDocumento||analysis.customer?.cpf||''))}</div><div><b>Total</b>${esc(brl(order.total))}</div><div><b>Situação</b>${esc(order.situacao?.valor||'—')}</div><div><b>Data</b>${esc(fmtDay(order.data))}</div>`;
  const s=analysis.summary||{};$('analysisSummary').innerHTML=`<div><strong>${s.services||0}</strong><span>Serviços</span></div><div><strong>${s.products||0}</strong><span>Mercadorias</span></div><div><strong>${s.unclassified||0}</strong><span>Sem perfil</span></div><div><strong>${s.unknown||0}</strong><span>Não localizados</span></div>`;
  const notices=[...(analysis.errors||[]),...(analysis.warnings||[])];setDetailMessage(notices.join(' '),analysis.errors?.length?'error':notices.length?'':'');
  $('items').innerHTML=(analysis.items||[]).map(renderItem).join('')||'<div class="muted">Pedido sem itens.</div>';
  $('items').querySelectorAll('[data-classify]').forEach(b=>b.onclick=()=>classifyItem(Number(b.dataset.classify)));
  const p=analysis.fiscal_profile;
  $('fiscalPreview').innerHTML=p?`<strong style="color:var(--croma-deep)">Perfil fiscal resolvido</strong><div class="muted" style="margin-top:5px">${esc(fiscalProfileText(p))} · ISS ${Number(p.aliquota_iss||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}% · Retenção ${p.reter_iss?'sim':'não'}</div>`:'<strong style="color:var(--croma-deep)">Perfil fiscal</strong><div class="muted" style="margin-top:5px">O pedido ainda não possui um único perfil fiscal válido para faturamento.</div>';
  const actions=[];const doc=analysis.existing_document;
  if(!doc&&analysis.eligible)actions.push(`<button class="internal-btn" data-prepare>Preparar faturamento</button>`);
  if(doc){
    actions.push(`<span class="pill ${doc.status==='authorized'?'ok':doc.status==='rejected'?'error':'warn'}">${esc(docStatus[doc.status]||doc.status)}${doc.numero_nfse?' · NFS-e '+esc(doc.numero_nfse):''}</span>`);
    const primary=docPrimaryAction(doc);if(primary)actions.push(`<button class="internal-btn" data-doc-action="${esc(primary.action)}" data-doc="${esc(doc.id)}">${esc(primary.label)}</button>`);
    if(doc.status==='authorized'&&doc.link_nfse)actions.push(`<a class="internal-btn secondary" href="${esc(doc.link_nfse)}" target="_blank" rel="noopener">Abrir NFS-e</a>`);
  }
  $('detailActions').innerHTML=actions.join('');
  $('detailActions').querySelector('[data-prepare]')?.addEventListener('click',prepareOrder);
  $('detailActions').querySelector('[data-doc-action]')?.addEventListener('click',e=>runDocAction(e.currentTarget.dataset.docAction,e.currentTarget.dataset.doc));
}
async function openOrder(orderId,scroll=true){
  selectedOrderId=Number(orderId);if(scroll)$('detailPanel').scrollIntoView({behavior:'smooth',block:'start'});setDetailMessage('Analisando pedido…');
  try{const data=await invokeOrders({action:'order_analyze',order_id:selectedOrderId});renderAnalysis(data)}
  catch(error){setDetailMessage(error.message,'error');throw error}
}
async function classifyItem(blingProductId){
  const select=document.querySelector(`[data-profile-for="${blingProductId}"]`);const profileId=select?.value;
  if(!profileId){setDetailMessage('Selecione um perfil fiscal.','error');return}
  setDetailMessage('Salvando classificação fiscal…');
  try{await invokeOrders({action:'classify_product',bling_product_id:blingProductId,fiscal_profile_id:profileId});setDetailMessage('Classificação salva. Reanalisando o pedido…','ok');await openOrder(selectedOrderId,false)}
  catch(error){setDetailMessage(error.message,'error')}
}
async function prepareOrder(){
  if(!selectedOrderId)return;
  if(!confirm('Preparar o faturamento deste pedido do Bling? Isso ainda não transmite a NFS-e ao Ambiente Nacional.'))return;
  setDetailMessage('Preparando faturamento a partir do pedido…');
  try{const data=await invokeOrders({action:'order_prepare',order_id:selectedOrderId});const warning=data.validation_error?` Atenção: ${readableError(data.validation_error)}`:'';setDetailMessage(`Pedido preparado e validado para NFS-e.${warning}`,'ok');await loadOrders(false);await openOrder(selectedOrderId,false)}
  catch(error){setDetailMessage(error.message,'error')}
}
async function runDocAction(action,id){
  const labels={validate:'Validando…',create:'Criando NFS-e no Bling…',send:'Transmitindo ao Ambiente Nacional…'};setDetailMessage(labels[action]||'Processando…');
  try{
    let data;
    if(action==='validate')data=await invokeBling({action:'nfse_validate',document_id:id});
    else if(action==='create'){
      if(!confirm('Criar a NFS-e deste pedido no Bling? Ela ainda não será transmitida ao Ambiente Nacional.'))return;
      data=await invokeBling({action:'nfse_create',document_id:id});
    }else if(action==='send'){
      if(!confirm('Emitir esta NFS-e agora no Ambiente Nacional? Esta ação transmite um documento fiscal real.'))return;
      data=await invokeBling({action:'nfse_send',document_id:id});
    }
    const warnings=data?.warnings||[];const text=action==='validate'?'Validação concluída.':action==='create'?'NFS-e criada no Bling, ainda não transmitida.':'NFS-e transmitida para o Ambiente Nacional.';setDetailMessage(warnings.length?`${text} ${warnings.join(' ')}`:text,'ok');
    await loadOrders(false);await loadExternal();await openOrder(selectedOrderId,false);
  }catch(error){setDetailMessage(error.message,'error')}
}

await loadAll();
