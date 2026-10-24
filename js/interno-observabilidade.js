import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';
const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('auth');
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const severityLabel={critical:'Crítica',high:'Alta',medium:'Média',low:'Baixa'};
const statusLabel={open:'Aberta',investigating:'Em análise',resolved:'Resolvida',ignored:'Ignorada'};
const date=s=>s?new Date(s).toLocaleString('pt-BR'):'—';
let incidents=[],imageOffset=0;
function moduleLink(i){
  if(i.module==='produtos')return '/interno/produtos/';
  if(i.module==='contatos')return '/interno/contatos/';
  if(i.module==='propostas')return '/interno/propostas/';
  if(i.module==='pedidos')return '/interno/pedidos/';
  return '/interno/';
}
function renderIncidents(){
  const module=$('#module').value,severity=$('#severity').value,state=$('#state').value;
  const filtered=incidents.filter(i=>(!module||i.module===module)&&(!severity||i.severity===severity)&&(state==='all'||(state==='active'?['open','investigating'].includes(i.status):i.status===state)));
  $('#incidentItems').innerHTML=filtered.length?filtered.map(i=>`<article class="incident" data-id="${esc(i.id)}">
    <div class="head"><div><h3>${esc(i.title)}</h3><span class="meta">${esc(i.module)} · ${esc(i.source)} · detectado em ${esc(date(i.first_seen_at))}</span></div>
    <div class="pills"><span class="pill ${esc(i.severity)}">${esc(severityLabel[i.severity]||i.severity)}</span><span class="pill">${esc(statusLabel[i.status]||i.status)}</span></div></div>
    <p>${esc(i.description||'Sem descrição adicional.')}</p>
    <div class="actions"><label class="field">Situação<select data-field="status"><option value="open" ${i.status==='open'?'selected':''}>Aberta</option><option value="investigating" ${i.status==='investigating'?'selected':''}>Em análise</option><option value="resolved" ${i.status==='resolved'?'selected':''}>Resolvida</option><option value="ignored" ${i.status==='ignored'?'selected':''}>Ignorada</option></select></label>
    <label class="field" style="flex:2">Diagnóstico / resolução<textarea data-field="note" maxlength="3000" placeholder="Causa, providência ou justificativa">${esc(i.resolution_note||'')}</textarea></label>
    <button type="button" data-save="${esc(i.id)}">Salvar análise</button><a class="btn" href="${moduleLink(i)}">Abrir módulo</a></div></article>`).join(''):'<p class="notice">Nenhuma ocorrência encontrada para os filtros.</p>';
  $('#incidentStatus').textContent=`${filtered.length} ocorrência(s) exibida(s) de ${incidents.length} carregadas.`;
}
async function loadIncidents(){
  $('#incidentStatus').textContent='Atualizando ocorrências…';
  try{
    const {data,error}=await supabase.from('ops_incidents').select('id,fingerprint,module,source,source_id,severity,status,title,description,first_seen_at,last_seen_at,resolution_note').order('last_seen_at',{ascending:false}).limit(500);
    if(error)throw error;incidents=data||[];
    $('#kpiOpen').textContent=incidents.filter(i=>['open','investigating'].includes(i.status)).length;
    $('#kpiHigh').textContent=incidents.filter(i=>['open','investigating'].includes(i.status)&&['critical','high'].includes(i.severity)).length;
    $('#kpiConflicts').textContent=incidents.filter(i=>i.source==='erp_sync_conflicts'&&['open','investigating'].includes(i.status)).length;
    renderIncidents();
  }catch(e){$('#incidentStatus').textContent='Não foi possível carregar ocorrências: '+(e.message||e);}
}
async function saveIncident(id,card,button){
  const incident=incidents.find(i=>i.id===id);if(!incident)return;
  const status=card.querySelector('[data-field="status"]').value;
  const note=card.querySelector('[data-field="note"]').value.trim();
  if(['resolved','ignored'].includes(status)&&!note){alert('Informe o diagnóstico ou a justificativa para concluir ou ignorar.');return}
  button.disabled=true;
  try{
    const payload={status,resolution_note:note||null,updated_at:new Date().toISOString(),resolved_at:['resolved','ignored'].includes(status)?new Date().toISOString():null,resolved_by:['resolved','ignored'].includes(status)?session.profile.id:null};
    const {data,error}=await supabase.from('ops_incidents').update(payload).eq('id',id).eq('status',incident.status).select('id');
    if(error)throw error;
    if(data?.length!==1)throw new Error('O registro mudou desde o carregamento. Atualize e revise.');
    await loadIncidents();
  }catch(e){alert(e.message||'Falha ao salvar a análise.')}finally{button.disabled=false}
}
$('#incidentItems').addEventListener('click',event=>{const button=event.target.closest('[data-save]');if(button)saveIncident(button.dataset.save,button.closest('.incident'),button)});
['module','severity','state'].forEach(id=>$('#'+id).addEventListener('change',renderIncidents));
$('#reload').addEventListener('click',async()=>{await Promise.all([loadIncidents(),loadImages(true)])});
async function loadImages(reset=false){
  if(reset){imageOffset=0;$('#imageRows').innerHTML=''}
  $('#imageStatus').textContent='Buscando produtos sem imagem…';
  try{
    // A seleção de candidatos é feita no cliente, sem alterar produtos. Cada lote lê até 200 produtos.
    const {data:products,error}=await supabase.from('products').select('id,nome,sku,bling_product_id,ativo').eq('ativo',true).order('nome').range(imageOffset,imageOffset+199);
    if(error)throw error;
    const ids=(products||[]).map(p=>p.id);
    const {data:images,error:mediaError}=ids.length?await supabase.from('product_media').select('product_id').in('product_id',ids).eq('ativo',true).eq('kind','image'): {data:[],error:null};
    if(mediaError)throw mediaError;
    const covered=new Set((images||[]).map(i=>i.product_id));
    const missing=(products||[]).filter(p=>!covered.has(p.id));
    $('#imageRows').insertAdjacentHTML('beforeend',missing.map(p=>`<tr><td>${esc(p.nome)}</td><td>${esc(p.sku||'—')}</td><td>${p.bling_product_id?'ID '+esc(p.bling_product_id):'Sem vínculo'}</td><td><a href="/interno/midias-produtos/?produto=${encodeURIComponent(p.id)}">Revisar imagens</a></td></tr>`).join(''));
    imageOffset+=(products||[]).length;
    $('#imageStatus').textContent=`${$('#imageRows').children.length} produto(s) sem foto nos ${imageOffset} registros consultados. Total estimado na base: 1.399 (inclui inativos).`;
    $('#moreImages').disabled=(products||[]).length<200;
  }catch(e){$('#imageStatus').textContent='Falha ao consultar imagens: '+(e.message||e)}
}
$('#moreImages').addEventListener('click',()=>loadImages());
await Promise.all([loadIncidents(),loadImages()]);
