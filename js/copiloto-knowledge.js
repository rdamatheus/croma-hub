import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const TYPE_LABELS={insight:'Insight',decision:'Decisão',roadmap:'Roadmap',task:'Tarefa',learning:'Aprendizado',question:'Pergunta'};
const STATUS_LABELS={captured:'Capturado',review:'Revisar',approved:'Aprovado',done:'Concluído',archived:'Arquivado'};
const PRIORITY_LABELS={low:'Baixa',medium:'Média',high:'Alta',critical:'Crítica'};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmtDate=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const $=id=>document.getElementById(id);

let session=null;
let entries=[];
let editingId=null;

function tagHtml(tags=[]){
  return tags.map(tag=>`<span class="kb-tag">${esc(tag)}</span>`).join('');
}

function countBy(type){return entries.filter(e=>e.entry_type===type&&e.status!=='archived').length}

function updateKpis(){
  $('kInsights').textContent=countBy('insight');
  $('kDecisions').textContent=countBy('decision');
  $('kRoadmap').textContent=countBy('roadmap')+countBy('task');
  $('kReview').textContent=entries.filter(e=>e.status==='review'||e.status==='captured').length;
}

function filtered(){
  const q=$('search').value.trim().toLowerCase();
  const type=$('filterType').value;
  const status=$('filterStatus').value;
  const area=$('filterArea').value;
  return entries.filter(e=>{
    if(type&&e.entry_type!==type)return false;
    if(status&&e.status!==status)return false;
    if(area&&e.area!==area)return false;
    if(!q)return true;
    return [e.title,e.content,e.area,...(e.tags||[])].join(' ').toLowerCase().includes(q);
  });
}

function renderAreas(){
  const current=$('filterArea').value;
  const areas=[...new Set(entries.map(e=>e.area).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  $('filterArea').innerHTML='<option value="">Todas as áreas</option>'+areas.map(a=>`<option value="${esc(a)}">${esc(a)}</option>`).join('');
  if(areas.includes(current))$('filterArea').value=current;
}

function renderList(){
  updateKpis();
  renderAreas();
  const list=filtered();
  $('entryList').innerHTML=list.length?list.map(e=>`
    <article class="kb-entry ${e.status==='archived'?'is-archived':''}">
      <div class="kb-entry-head">
        <div>
          <div class="kb-meta"><span class="internal-pill">${esc(TYPE_LABELS[e.entry_type]||e.entry_type)}</span><span>${esc(e.area)}</span><span>•</span><span>${esc(STATUS_LABELS[e.status]||e.status)}</span><span>•</span><span>${esc(PRIORITY_LABELS[e.priority]||e.priority)}</span></div>
          <h3>${esc(e.title)}</h3>
        </div>
        <small>${fmtDate(e.updated_at)}</small>
      </div>
      <p>${esc(e.content).replace(/\n/g,'<br>')}</p>
      <div class="kb-tags">${tagHtml(e.tags)}</div>
      <div class="kb-entry-foot">
        <small>${e.source_type?`Origem: ${esc(e.source_type)}`:''}${e.source_ref?` · ${esc(e.source_ref)}`:''}</small>
        <div class="kb-actions">
          <button class="internal-btn secondary" data-edit="${e.id}">Editar</button>
          ${session?.profile?.role!=='equipe'?`<button class="internal-btn danger" data-delete="${e.id}">Excluir</button>`:''}
        </div>
      </div>
    </article>`).join(''):'<div class="internal-card internal-muted">Nenhum registro encontrado.</div>';

  document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>startEdit(btn.dataset.edit));
  document.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>removeEntry(btn.dataset.delete));
}

async function loadEntries(){
  $('entryList').innerHTML='<div class="internal-card internal-muted">Carregando base de conhecimento…</div>';
  const {data,error}=await supabase.from('knowledge_entries').select('*').eq('workspace','croma').order('updated_at',{ascending:false});
  if(error)throw error;
  entries=data||[];
  renderList();
}

function resetForm(){
  editingId=null;
  $('formTitle').textContent='Registrar novo conhecimento';
  $('saveBtn').textContent='Salvar registro';
  $('entryType').value='insight';
  $('entryStatus').value='captured';
  $('entryPriority').value='medium';
  $('entryArea').value='copiloto';
  $('entryTitle').value='';
  $('entryContent').value='';
  $('entryTags').value='';
  $('entrySource').value='conversation';
  $('entrySourceRef').value='';
  $('entryDue').value='';
  $('cancelEdit').hidden=true;
}

function startEdit(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  editingId=id;
  $('formTitle').textContent='Editar registro';
  $('saveBtn').textContent='Atualizar registro';
  $('entryType').value=e.entry_type;
  $('entryStatus').value=e.status;
  $('entryPriority').value=e.priority;
  $('entryArea').value=e.area||'geral';
  $('entryTitle').value=e.title||'';
  $('entryContent').value=e.content||'';
  $('entryTags').value=(e.tags||[]).join(', ');
  $('entrySource').value=e.source_type||'manual';
  $('entrySourceRef').value=e.source_ref||'';
  $('entryDue').value=e.due_date||'';
  $('cancelEdit').hidden=false;
  $('entryTitle').focus();
  scrollTo({top:0,behavior:'smooth'});
}

async function saveEntry(event){
  event.preventDefault();
  const title=$('entryTitle').value.trim();
  const content=$('entryContent').value.trim();
  if(!title)return;
  const payload={
    workspace:'croma',
    entry_type:$('entryType').value,
    status:$('entryStatus').value,
    priority:$('entryPriority').value,
    area:$('entryArea').value.trim()||'geral',
    title,
    content,
    tags:$('entryTags').value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),
    source_type:$('entrySource').value.trim()||null,
    source_ref:$('entrySourceRef').value.trim()||null,
    due_date:$('entryDue').value||null,
    updated_by:session.user.id
  };
  $('formStatus').textContent='Salvando…';
  let error;
  if(editingId){({error}=await supabase.from('knowledge_entries').update(payload).eq('id',editingId));}
  else {payload.created_by=session.user.id;({error}=await supabase.from('knowledge_entries').insert(payload));}
  if(error){$('formStatus').textContent='Erro ao salvar: '+error.message;return;}
  $('formStatus').textContent='Salvo.';
  resetForm();
  await loadEntries();
}

async function removeEntry(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  if(!confirm(`Excluir “${e.title}”?`))return;
  const {error}=await supabase.from('knowledge_entries').delete().eq('id',id);
  if(error){alert('Não foi possível excluir: '+error.message);return;}
  await loadEntries();
}

session=await protectInternalPage();
if(!session)throw new Error('Acesso não autorizado.');
$('who').textContent=session.profile.nome||session.user.email;
$('entryForm').addEventListener('submit',saveEntry);
$('cancelEdit').onclick=resetForm;
['search','filterType','filterStatus','filterArea'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderList));
$('refreshBtn').onclick=loadEntries;
resetForm();
await loadEntries();
