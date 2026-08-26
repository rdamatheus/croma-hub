import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const TYPE_LABELS={insight:'Insight',decision:'Decisão',roadmap:'Roadmap',task:'Tarefa',learning:'Aprendizado',question:'Pergunta'};
const STATUS_LABELS={captured:'Capturado',review:'Revisar',approved:'Aprovado',done:'Concluído',archived:'Arquivado'};
const PRIORITY_LABELS={low:'Baixa',medium:'Média',high:'Alta',critical:'Crítica'};
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[ch]));
const fmtDate=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const $=id=>document.getElementById(id);

let session=null;
let entries=[];
let editingId=null;
let selectedScreen=null;
let lastReport=null;

function tagHtml(tags=[]){return tags.map(tag=>`<span class="kb-tag">${esc(tag)}</span>`).join('')}
function countBy(type){return entries.filter(e=>e.entry_type===type&&e.status!=='archived').length}
function updateKpis(){
  $('kInsights').textContent=countBy('insight');
  $('kDecisions').textContent=countBy('decision');
  $('kRoadmap').textContent=countBy('roadmap')+countBy('task');
  $('kReview').textContent=entries.filter(e=>e.status==='review'||e.status==='captured').length;
}
function filtered(){
  const q=$('search').value.trim().toLowerCase(),type=$('filterType').value,status=$('filterStatus').value,area=$('filterArea').value;
  return entries.filter(e=>{
    if(type&&e.entry_type!==type)return false;if(status&&e.status!==status)return false;if(area&&e.area!==area)return false;if(!q)return true;
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
  updateKpis();renderAreas();const list=filtered();
  $('entryList').innerHTML=list.length?list.map(e=>`
    <article class="kb-entry ${e.status==='archived'?'is-archived':''}">
      <div class="kb-entry-head"><div><div class="kb-meta"><span class="internal-pill">${esc(TYPE_LABELS[e.entry_type]||e.entry_type)}</span><span>${esc(e.area)}</span><span>•</span><span>${esc(STATUS_LABELS[e.status]||e.status)}</span><span>•</span><span>${esc(PRIORITY_LABELS[e.priority]||e.priority)}</span></div><h3>${esc(e.title)}</h3></div><small>${fmtDate(e.updated_at)}</small></div>
      <p>${esc(e.content).replace(/\n/g,'<br>')}</p><div class="kb-tags">${tagHtml(e.tags)}</div>
      <div class="kb-entry-foot"><small>${e.source_type?`Origem: ${esc(e.source_type)}`:''}${e.source_ref?` · ${esc(e.source_ref)}`:''}</small><div class="kb-actions"><button class="internal-btn secondary" data-edit="${e.id}">Editar</button>${session?.profile?.role!=='equipe'?`<button class="internal-btn danger" data-delete="${e.id}">Excluir</button>`:''}</div></div>
    </article>`).join(''):'<div class="internal-card internal-muted">Nenhum registro encontrado.</div>';
  document.querySelectorAll('[data-edit]').forEach(btn=>btn.onclick=()=>startEdit(btn.dataset.edit));
  document.querySelectorAll('[data-delete]').forEach(btn=>btn.onclick=()=>removeEntry(btn.dataset.delete));
}
async function loadEntries(){
  $('entryList').innerHTML='<div class="internal-card internal-muted">Carregando base de conhecimento…</div>';
  const {data,error}=await supabase.from('knowledge_entries').select('*').eq('workspace','croma').order('updated_at',{ascending:false});
  if(error)throw error;entries=data||[];renderList();
}
function resetForm(){
  editingId=null;$('formTitle').textContent='Registrar novo conhecimento';$('saveBtn').textContent='Salvar registro';$('entryType').value='insight';$('entryStatus').value='captured';$('entryPriority').value='medium';$('entryArea').value='copiloto';$('entryTitle').value='';$('entryContent').value='';$('entryTags').value='';$('entrySource').value='conversation';$('entrySourceRef').value='';$('entryDue').value='';$('cancelEdit').hidden=true;
}
function startEdit(id){
  const e=entries.find(x=>x.id===id);if(!e)return;editingId=id;$('formTitle').textContent='Editar registro';$('saveBtn').textContent='Atualizar registro';$('entryType').value=e.entry_type;$('entryStatus').value=e.status;$('entryPriority').value=e.priority;$('entryArea').value=e.area||'geral';$('entryTitle').value=e.title||'';$('entryContent').value=e.content||'';$('entryTags').value=(e.tags||[]).join(', ');$('entrySource').value=e.source_type||'manual';$('entrySourceRef').value=e.source_ref||'';$('entryDue').value=e.due_date||'';$('cancelEdit').hidden=false;$('entryTitle').focus();scrollTo({top:0,behavior:'smooth'});
}
async function saveEntry(event){
  event.preventDefault();const title=$('entryTitle').value.trim(),content=$('entryContent').value.trim();if(!title)return;
  const payload={workspace:'croma',entry_type:$('entryType').value,status:$('entryStatus').value,priority:$('entryPriority').value,area:$('entryArea').value.trim()||'geral',title,content,tags:$('entryTags').value.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean),source_type:$('entrySource').value.trim()||null,source_ref:$('entrySourceRef').value.trim()||null,due_date:$('entryDue').value||null,updated_by:session.user.id};
  $('formStatus').textContent='Salvando…';let error;if(editingId){({error}=await supabase.from('knowledge_entries').update(payload).eq('id',editingId));}else{payload.created_by=session.user.id;({error}=await supabase.from('knowledge_entries').insert(payload));}
  if(error){$('formStatus').textContent='Erro ao salvar: '+error.message;return;}$('formStatus').textContent='Salvo.';resetForm();await loadEntries();
}
async function removeEntry(id){
  const e=entries.find(x=>x.id===id);if(!e||!confirm(`Excluir “${e.title}”?`))return;const {error}=await supabase.from('knowledge_entries').delete().eq('id',id);if(error){alert('Não foi possível excluir: '+error.message);return;}await loadEntries();
}

function listHtml(target,items=[]){$(target).innerHTML=(items||[]).length?(items||[]).map(x=>`<li>${esc(x)}</li>`).join(''):'<li>Nenhum ponto relevante.</li>'}
function renderReport(report){
  lastReport=report||{};$('aiReport').classList.add('open');$('reportSummary').textContent=report?.resumo||'Análise concluída.';
  listHtml('reportObservations',report?.observacoes);listHtml('reportRisks',report?.riscos);listHtml('reportOpportunities',report?.oportunidades);listHtml('reportQuestions',report?.perguntas);listHtml('reportActions',report?.proximas_acoes);
  const suggestions=Array.isArray(report?.registros_sugeridos)?report.registros_sugeridos:[];
  $('reportSuggestions').innerHTML=suggestions.length?suggestions.map((s,i)=>`<div class="suggestion"><strong>${esc(s.titulo||'Registro sugerido')}</strong><small>${esc(TYPE_LABELS[s.tipo]||s.tipo||'Insight')} · ${esc(s.area||'copiloto')} · ${esc(PRIORITY_LABELS[s.prioridade]||s.prioridade||'Média')}</small><p>${esc(s.conteudo||'')}</p><button type="button" class="internal-btn secondary" data-save-suggestion="${i}">Salvar na memória</button></div>`).join(''):'<div class="internal-muted">Nenhum registro novo sugerido.</div>';
  document.querySelectorAll('[data-save-suggestion]').forEach(btn=>btn.onclick=()=>saveSuggestion(Number(btn.dataset.saveSuggestion)));
}
async function saveSuggestion(index){
  const s=lastReport?.registros_sugeridos?.[index];if(!s)return;
  const validTypes=['insight','decision','roadmap','task','learning','question'];const validPriorities=['low','medium','high','critical'];
  const payload={workspace:'croma',entry_type:validTypes.includes(s.tipo)?s.tipo:'insight',status:'review',priority:validPriorities.includes(s.prioridade)?s.prioridade:'medium',area:String(s.area||'copiloto').slice(0,80),title:String(s.titulo||'Insight do Copiloto').slice(0,180),content:String(s.conteudo||'').slice(0,10000),tags:['ia','print'],source_type:'screen',source_ref:'Copiloto Croma',created_by:session.user.id,updated_by:session.user.id};
  const {error}=await supabase.from('knowledge_entries').insert(payload);if(error){alert('Não foi possível salvar: '+error.message);return;}btnFeedback(index);await loadEntries();
}
function btnFeedback(index){const btn=document.querySelector(`[data-save-suggestion="${index}"]`);if(btn){btn.textContent='Salvo para revisão';btn.disabled=true}}
function clearScreen(){selectedScreen=null;lastReport=null;$('screenFile').value='';$('screenPreview').src='';$('screenPreview').hidden=true;$('screenEmpty').hidden=false;$('screenContext').value='';$('aiStatus').textContent='';$('aiReport').classList.remove('open')}
function fileToDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)})}
async function onScreenFile(){
  const file=$('screenFile').files?.[0];if(!file)return;const allowed=['image/png','image/jpeg','image/webp'];if(!allowed.includes(file.type)){alert('Use PNG, JPEG ou WEBP.');clearScreen();return;}if(file.size>8*1024*1024){alert('O print deve ter no máximo 8 MB.');clearScreen();return;}selectedScreen=await fileToDataUrl(file);$('screenPreview').src=selectedScreen;$('screenPreview').hidden=false;$('screenEmpty').hidden=true;
}
async function analyzeScreen(){
  if(!selectedScreen){$('aiStatus').textContent='Escolha um print primeiro.';return;}
  const button=$('analyzeScreen');button.disabled=true;button.textContent='Analisando…';$('aiStatus').textContent='O Copiloto está cruzando o print com a memória da Croma.';$('aiReport').classList.remove('open');
  try{
    const {data,error}=await supabase.functions.invoke('copiloto-analisar-print',{body:{image_data_url:selectedScreen,context:$('screenContext').value.trim()}});
    if(error)throw error;if(data?.error==='OPENAI_API_KEY_NOT_CONFIGURED'){throw new Error('A integração está pronta, mas falta configurar a chave OPENAI_API_KEY no Supabase.');}if(data?.error)throw new Error(data.message||data.error);
    renderReport(data.report||{});$('aiStatus').textContent='Análise concluída.';
  }catch(error){$('aiStatus').textContent='Não foi possível analisar: '+(error?.message||String(error));}
  finally{button.disabled=false;button.textContent='Analisar print';}
}

session=await protectInternalPage();if(!session)throw new Error('Acesso não autorizado.');$('who').textContent=session.profile.nome||session.user.email;
$('entryForm').addEventListener('submit',saveEntry);$('cancelEdit').onclick=resetForm;['search','filterType','filterStatus','filterArea'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderList));$('refreshBtn').onclick=loadEntries;
$('screenFile').addEventListener('change',onScreenFile);$('analyzeScreen').onclick=analyzeScreen;$('clearScreen').onclick=clearScreen;
resetForm();clearScreen();await loadEntries();
