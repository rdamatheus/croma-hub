import { supabase } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';

const session = await protectInternalPage({ roles: ['owner'] });
if (!session) throw new Error('auth');

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const fmtDate = v => v ? new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}) : '—';
const statusLabel = {draft:'Rascunho',validated:'Validada',created_bling:'Criada no Bling',sending:'Enviando',authorized:'Autorizada',rejected:'Rejeitada',cancelled:'Cancelada'};
let profiles = [], localDocs = [], customersById = new Map(), profilesById = new Map(), selectedDoc = null, customerTimer = null;

$('logout').onclick = async()=>{await signOutStaff(); location.href='/interno/'};
$('refresh').onclick = ()=>loadAll(true);
$('newDraft').onclick = ()=>openEditor();
$('closeEditor').onclick = closeEditor;
$('description').addEventListener('input',()=>{$('descriptionCount').textContent=`${$('description').value.length} / 1600`});
$('fiscalProfile').addEventListener('change',renderFiscalPreview);
$('customerSearch').addEventListener('input',()=>{clearTimeout(customerTimer); customerTimer=setTimeout(()=>searchCustomers($('customerSearch').value),250)});
$('draftForm').addEventListener('submit',saveDraft);

function setMessage(text,type=''){
  const box=$('globalMessage');
  if(!text){box.className='notice hidden';box.textContent='';return}
  box.className=`notice ${type}`; box.textContent=text;
}
function setDetailMessage(text,type=''){
  const box=$('detailMessage');
  if(!text){box.className='notice hidden';box.textContent='';return}
  box.className=`notice ${type}`; box.textContent=text;
}
function dot(ok,warn=false){return `<span class="dot ${ok?'ok':warn?'warn':''}"></span>`}
function readableError(value){
  if(!value) return 'Falha inesperada.';
  if(typeof value==='string') return value;
  for(const key of ['detail','message','error']){
    if(typeof value[key]==='string') return value[key];
    if(value[key]&&value[key]!==value){const nested=readableError(value[key]);if(nested)return nested}
  }
  return 'Não foi possível concluir a operação.';
}
async function invoke(body){
  const {data,error}=await supabase.functions.invoke('bling-erp',{body});
  if(error){
    let message=readableError(error); let detail=null;
    try{if(error.context?.json){detail=await error.context.json(); message=readableError(detail)||message}}catch{}
    const e=new Error(message); e.payload=detail; throw e;
  }
  if(data?.error){const e=new Error(readableError(data));e.payload=data;throw e}
  return data;
}
function parseMoney(value){
  let text=String(value||'').trim().replace(/\s/g,'');
  if(!text)return 0;
  if(text.includes(',')&&text.includes('.')) text=text.replace(/\./g,'').replace(',','.');
  else if(text.includes(',')) text=text.replace(',','.');
  return Number(text);
}
function docDigits(v){return String(v||'').replace(/\D/g,'')}
function maskDoc(v){const d=docDigits(v);if(d.length===11)return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4');if(d.length===14)return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5');return v||'—'}

async function loadAll(showMessage=false){
  if(showMessage)setMessage('Atualizando dados…');
  const results=await Promise.allSettled([loadProfiles(),loadLocal(),loadBlingStatus(),loadExternal()]);
  const errors=results.filter(r=>r.status==='rejected').map(r=>r.reason?.message).filter(Boolean);
  if(errors.length)setMessage(errors.join(' · '),'error'); else if(showMessage)setMessage('Dados atualizados.','ok');
  if(selectedDoc){const fresh=localDocs.find(d=>d.id===selectedDoc.id); if(fresh) await showDetail(fresh.id)}
}

async function loadProfiles(){
  const {data,error}=await supabase.from('fiscal_service_profiles').select('*').eq('ativo',true).order('padrao',{ascending:false}).order('nome');
  if(error)throw error;
  profiles=data||[]; profilesById=new Map(profiles.map(p=>[p.id,p]));
  $('fiscalProfile').innerHTML=profiles.map(p=>`<option value="${esc(p.id)}">${esc(p.nome)}${p.padrao?' · padrão':''}</option>`).join('');
  const p=profiles.find(x=>x.padrao)||profiles[0];
  $('profileStatus').innerHTML=p?`${dot(true)}${esc(p.nome)} · ${esc(p.codigo_tributacao_nacional)}`:`${dot(false,true)}Nenhum perfil ativo`;
  renderFiscalPreview();
}
async function loadBlingStatus(){
  const data=await invoke({action:'status'}); const connected=data.connection?.status==='connected';
  $('blingStatus').innerHTML=`${dot(connected,!connected)}${connected?'Conectado':'Atenção: '+esc(data.connection?.status||'indisponível')}`;
  try{
    const config=await invoke({action:'nfse_config_get'});
    $('configStatus').innerHTML=`${dot(true)}Leitura disponível`;
    $('configStatus').title=JSON.stringify(config.data||{}).slice(0,1500);
  }catch(error){
    $('configStatus').innerHTML=`${dot(false,true)}Não validada`;
    $('configStatus').title=error.message;
    throw new Error(`Configuração NFS-e do Bling: ${error.message}`);
  }
}
async function loadLocal(){
  const {data,error}=await supabase.from('nfse_documents').select('*').order('created_at',{ascending:false}).limit(100);
  if(error)throw error; localDocs=data||[];
  const customerIds=[...new Set(localDocs.map(x=>x.customer_id).filter(Boolean))];
  if(customerIds.length){const r=await supabase.from('customer_profiles').select('id,nome,cpf,bling_contact_id,bling_raw').in('id',customerIds);if(r.error)throw r.error;(r.data||[]).forEach(c=>customersById.set(c.id,c))}
  $('localSummary').textContent=`${localDocs.length} documento(s) local(is)`;
  $('localBody').innerHTML=localDocs.length?localDocs.map(renderLocalRow).join(''):'<tr><td colspan="6" class="muted" style="padding:24px">Nenhuma NFS-e preparada no Croma Hub.</td></tr>';
  $('localBody').querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>showDetail(b.dataset.detail));
  $('localBody').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editDocument(b.dataset.edit));
  $('localBody').querySelectorAll('[data-act]').forEach(b=>b.onclick=()=>runAction(b.dataset.act,b.dataset.id));
}
function renderLocalRow(d){
  const customer=customersById.get(d.customer_id); const st=d.status||'draft';
  const primary=actionFor(d);
  return `<tr><td>${esc(fmtDate(d.created_at))}</td><td>${esc(customer?.nome||'—')}</td><td>${esc(brl(d.valor_servico))}</td><td><span class="pill ${esc(st)}">${esc(statusLabel[st]||st)}</span>${d.error_code?`<br><span class="muted">${esc(d.error_code)}</span>`:''}</td><td>${esc(d.numero_nfse||'—')}</td><td><div class="row-actions"><button class="mini" data-detail="${esc(d.id)}">Detalhes</button>${canEdit(d)?`<button class="mini" data-edit="${esc(d.id)}">Editar</button>`:''}${primary?`<button class="mini primary" data-act="${primary.action}" data-id="${esc(d.id)}">${esc(primary.label)}</button>`:''}</div></td></tr>`;
}
function canEdit(d){return ['draft','rejected'].includes(d.status)&&!d.bling_nfse_id}
function actionFor(d){
  if(d.status==='draft'||(d.status==='rejected'&&!d.bling_nfse_id))return {action:'validate',label:'Validar'};
  if(d.status==='validated')return {action:'create',label:'Criar no Bling'};
  if(d.status==='created_bling')return {action:'send',label:'Emitir NFS-e'};
  if(d.status==='rejected'&&d.bling_nfse_id)return {action:'validate',label:'Revalidar'};
  return null;
}
async function loadExternal(){
  try{
    const data=await invoke({action:'nfse_list',query:{pagina:1,limite:20}}); const rows=Array.isArray(data?.data)?data.data:[];
    $('externalBody').innerHTML=rows.length?rows.map(n=>`<tr><td>${esc(n.numero||'—')}</td><td>${esc(n.numeroRPS||'—')}</td><td>${esc(n.contato?.nome||n.cliente?.nome||'—')}</td><td>${esc(brl(n.valor))}</td><td>${esc(n.situacao||'—')}</td><td>${esc(fmtDate(n.dataEmissao||n.data))}</td></tr>`).join(''):'<tr><td colspan="6" class="muted" style="padding:24px">Nenhuma nota retornada pelo Bling.</td></tr>';
  }catch(error){$('externalBody').innerHTML=`<tr><td colspan="6" style="padding:24px;color:#8c2f2f">${esc(error.message)}</td></tr>`;throw error}
}

function renderFiscalPreview(){
  const p=profilesById.get($('fiscalProfile').value)||profiles[0];
  $('fiscalPreview').innerHTML=p?`<strong>${esc(p.nome)}</strong><br>Cód. nacional: ${esc(p.codigo_tributacao_nacional)} · Municipal: ${esc(p.codigo_tributacao_municipal||'—')}<br>NBS: ${esc(p.nbs||'—')} · Indicador: ${esc(p.indicador_operacao||'—')}<br>ISS: ${Number(p.aliquota_iss||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:4})}% · Retenção: ${p.reter_iss?'Sim':'Não'}${p.metadata?.provisional?'<br><span class="muted">Perfil operacional provisório; revisão fiscal pendente para outros serviços.</span>':''}`:'Nenhum perfil fiscal ativo.';
}
function openEditor(d=null){
  $('editorPanel').classList.remove('hidden'); $('editorPanel').scrollIntoView({behavior:'smooth',block:'start'}); setMessage('');
  $('editorTitle').textContent=d?'Editar rascunho':'Preparar NFS-e'; $('documentId').value=d?.id||'';
  const p=d?profilesById.get(d.fiscal_profile_id):(profiles.find(x=>x.padrao)||profiles[0]); if(p)$('fiscalProfile').value=p.id;
  $('serviceValue').value=d?Number(d.valor_servico).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}):'';
  $('description').value=d?.descricao||'Serviço de impressão'; $('description').dispatchEvent(new Event('input'));
  if(d){const c=customersById.get(d.customer_id);selectCustomer(c||{id:d.customer_id,nome:'Cliente selecionado',bling_contact_id:d.bling_contact_id})}else{clearCustomer()}
  renderFiscalPreview();
}
function closeEditor(){$('editorPanel').classList.add('hidden');$('draftForm').reset();$('documentId').value='';clearCustomer();renderFiscalPreview()}
function clearCustomer(){$('customerId').value='';$('customerSearch').value='';$('selectedCustomer').classList.add('hidden');$('selectedCustomer').innerHTML='';$('customerResults').classList.add('hidden');$('customerResults').innerHTML=''}
function selectCustomer(c){if(!c)return;customersById.set(c.id,c);$('customerId').value=c.id;$('customerSearch').value=c.nome||'';$('selectedCustomer').classList.remove('hidden');const doc=c.cpf||c.bling_raw?.numeroDocumento||'';$('selectedCustomer').innerHTML=`<strong>${esc(c.nome||'—')}</strong><br><span class="muted">${esc(maskDoc(doc))} · Bling ${c.bling_contact_id?'vinculado':'não vinculado'}</span>`;$('customerResults').classList.add('hidden')}
async function searchCustomers(q){
  q=String(q||'').trim(); if(q.length<2){$('customerResults').classList.add('hidden');return}
  let req=supabase.from('customer_profiles').select('id,nome,cpf,email,email_nota_fiscal,bling_contact_id,bling_raw,ativo').eq('ativo',true).order('nome').limit(20);
  const safe=q.replace(/[,%]/g,' '); req=req.or(`nome.ilike.%${safe}%,cpf.ilike.%${safe}%`);
  const {data,error}=await req;if(error){setMessage(error.message,'error');return}
  const rows=data||[];$('customerResults').innerHTML=rows.length?rows.map(c=>`<button type="button" class="customer-option" data-customer="${esc(c.id)}"><strong>${esc(c.nome)}</strong><br><span class="muted">${esc(maskDoc(c.cpf||c.bling_raw?.numeroDocumento||''))} · ${c.bling_contact_id?'Bling vinculado':'sem vínculo Bling'}</span></button>`).join(''):'<div class="muted" style="padding:12px">Nenhum cliente encontrado.</div>';
  $('customerResults').classList.remove('hidden'); rows.forEach(c=>customersById.set(c.id,c)); $('customerResults').querySelectorAll('[data-customer]').forEach(b=>b.onclick=()=>selectCustomer(customersById.get(b.dataset.customer)));
}
async function saveDraft(event){
  event.preventDefault(); const customerId=$('customerId').value; const profileId=$('fiscalProfile').value; const value=parseMoney($('serviceValue').value); const description=$('description').value.trim();
  if(!customerId){setMessage('Selecione um cliente.','error');return} if(!(value>0)){setMessage('Informe um valor maior que zero.','error');return} if(!description){setMessage('Informe a descrição do serviço.','error');return}
  const id=$('documentId').value; $('saveDraft').disabled=true; setMessage('Salvando rascunho…');
  try{
    const payload={customer_id:customerId,fiscal_profile_id:profileId,valor_servico:value,descricao:description,serie:'1',bling_contact_id:customersById.get(customerId)?.bling_contact_id||null};
    let result;
    if(id) result=await supabase.from('nfse_documents').update(payload).eq('id',id).select('*').single();
    else result=await supabase.from('nfse_documents').insert({...payload,created_by:session.user.id}).select('*').single();
    if(result.error)throw result.error; setMessage('Rascunho salvo. Faça a validação antes de criar no Bling.','ok'); closeEditor(); await loadLocal(); await showDetail(result.data.id);
  }catch(error){setMessage(error.message||'Não foi possível salvar o rascunho.','error')}finally{$('saveDraft').disabled=false}
}
function editDocument(id){const d=localDocs.find(x=>x.id===id);if(d&&canEdit(d))openEditor(d)}

async function showDetail(id){
  const d=localDocs.find(x=>x.id===id); if(!d)return; selectedDoc=d; const c=customersById.get(d.customer_id); const p=profilesById.get(d.fiscal_profile_id);
  $('detailEmpty').classList.add('hidden');$('detailContent').classList.remove('hidden');
  $('detailFields').innerHTML=`<div><b>Cliente</b>${esc(c?.nome||'—')}</div><div><b>Valor</b>${esc(brl(d.valor_servico))}</div><div><b>Situação</b>${esc(statusLabel[d.status]||d.status)}</div><div><b>Perfil fiscal</b>${esc(p?.nome||'—')} · ${esc(p?.codigo_tributacao_nacional||'—')}</div><div><b>Bling</b>${esc(d.bling_nfse_id||'Ainda não criada')}</div><div><b>NFS-e / RPS</b>${esc(d.numero_nfse||'—')} / ${esc(d.numero_rps||'—')}</div><div><b>Descrição</b>${esc(d.descricao)}</div>`;
  if(d.error_message)setDetailMessage(`${d.error_code?d.error_code+' · ':''}${d.error_message}`,'error');else setDetailMessage('');
  const actions=[]; if(canEdit(d))actions.push(`<button class="internal-btn secondary" data-detail-edit="${esc(d.id)}">Editar</button>`); const primary=actionFor(d); if(primary)actions.push(`<button class="internal-btn" data-detail-act="${esc(primary.action)}" data-id="${esc(d.id)}">${esc(primary.label)}</button>`); if(d.status==='authorized'&&d.link_nfse)actions.push(`<a class="internal-btn secondary" href="${esc(d.link_nfse)}" target="_blank" rel="noopener">Abrir NFS-e</a>`); $('detailActions').innerHTML=actions.join('');
  $('detailActions').querySelector('[data-detail-edit]')?.addEventListener('click',()=>editDocument(d.id)); $('detailActions').querySelector('[data-detail-act]')?.addEventListener('click',e=>runAction(e.currentTarget.dataset.detailAct,d.id));
  const {data:events,error}=await supabase.from('nfse_events').select('*').eq('nfse_document_id',d.id).order('created_at',{ascending:false}).limit(40); if(error){$('events').textContent=error.message;return}
  $('events').innerHTML=(events||[]).length?(events||[]).map(ev=>`<div class="event"><strong>${esc(eventLabel(ev.event_type))}</strong><span class="muted">${esc(fmtDate(ev.created_at))}</span>${eventText(ev)?`<br>${esc(eventText(ev))}`:''}</div>`).join(''):'<div class="muted">Nenhum evento registrado.</div>';
}
function eventLabel(t){return ({draft_created:'Rascunho criado',validation_failed:'Validação com pendências',validated:'Validada',created_bling:'Criada no Bling',sending:'Envio solicitado',authorized:'Autorizada',rejected:'Rejeitada'})[t]||t}
function eventText(ev){const p=ev.payload||{};if(p.message)return `${p.code?p.code+' · ':''}${p.message}`;if(Array.isArray(p.warnings)&&p.warnings.length)return p.warnings.join(' · ');if(p.bling_nfse_id)return `ID Bling ${p.bling_nfse_id}`;return ''}
async function runAction(action,id){
  const labels={validate:'Validando…',create:'Criando no Bling…',send:'Transmitindo ao Ambiente Nacional…'}; setMessage(labels[action]||'Processando…'); setDetailMessage('');
  document.querySelectorAll('button[data-act],button[data-detail-act]').forEach(b=>b.disabled=true);
  try{
    let data;
    if(action==='validate')data=await invoke({action:'nfse_validate',document_id:id});
    else if(action==='create')data=await invoke({action:'nfse_create',document_id:id});
    else if(action==='send'){
      if(!confirm('Emitir esta NFS-e agora no Ambiente Nacional? Esta ação transmite um documento fiscal real.')){setMessage('Emissão cancelada.');return}
      data=await invoke({action:'nfse_send',document_id:id});
    }
    const warnings=data?.warnings||[]; const text=action==='validate'?'Validação concluída.':action==='create'?'NFS-e criada no Bling, ainda não transmitida.':'NFS-e transmitida e autorizada.'; setMessage(warnings.length?`${text} Atenção: ${warnings.join(' · ')}`:text,'ok');
  }catch(error){const payload=error.payload||{};const code=payload.code?`${payload.code} · `:'';setMessage(`${code}${error.message}`,'error')}
  finally{await loadLocal();await loadExternal().catch(()=>{});const d=localDocs.find(x=>x.id===id);if(d)await showDetail(id);document.querySelectorAll('button[data-act],button[data-detail-act]').forEach(b=>b.disabled=false)}
}

await loadAll();
