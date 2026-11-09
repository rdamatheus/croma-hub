import { supabase } from './croma-supabase.js';

// Painel adicional no cadastro de projetos existente. Não substitui o Centro Operacional.
const byId = (id) => document.getElementById(id);
const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stateLabels = {pendente:'Pendente',em_andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'};
const kindLabels = {progresso:'Progresso',decisao:'Decisão',bloqueio:'Bloqueio',validacao:'Validação',handoff:'Transferência',nota:'Nota'};
let currentProject = '';
let currentUser = '';
let available = [];
let tasks = [];
let records = [];
let initialized = false;
let requestSeq = 0;

function message(text, error=false) {
  const el=byId('governanceMessage');
  if(!el) return;
  el.textContent=text||'';
  el.dataset.error=error?'true':'false';
}
function taskCard(t) {
  const next=t.status==='pendente'?'em_andamento':t.status==='em_andamento'?'concluida':null;
  const nextLabel=next==='em_andamento'?'Iniciar':'Concluir';
  const due=t.data_limite?' · Prazo: '+safe(t.data_limite):'';
  return '<article class="gov-item"><div class="gov-item-head"><strong>'+safe(t.titulo)+'</strong><span class="gov-tag">'+safe(stateLabels[t.status]||t.status)+'</span></div>'
    +(t.descricao?'<p>'+safe(t.descricao)+'</p>':'')
    +'<small>Prioridade: '+safe(t.prioridade)+due+'</small>'
    +(next?'<div class="gov-actions"><button type="button" class="internal-btn secondary" data-task-id="'+safe(t.id)+'" data-next-status="'+next+'">'+nextLabel+'</button></div>':'')
    +'</article>';
}
function recordCard(r) {
  const date=r.created_at?new Date(r.created_at).toLocaleString('pt-BR'):'';
  const related=r.task_id?tasks.find(t=>t.id===r.task_id):null;
  return '<article class="gov-item"><div class="gov-item-head"><strong>'+safe(r.title)+'</strong><span class="gov-tag">'+safe(kindLabels[r.kind]||r.kind)+'</span></div>'
    +'<small>'+safe(date)+(r.kind==='decisao'?' · '+safe(r.state):'')+(related?' · '+safe(related.titulo):'')+'</small>'
    +(r.description?'<p>'+safe(r.description)+'</p>':'')
    +(r.source_ref?'<small>Referência: '+safe(r.source_ref)+'</small>':'')
    +'</article>';
}
function render() {
  byId('gPending').textContent=String(tasks.filter(t=>t.status==='pendente'||t.status==='em_andamento').length);
  byId('gBlocked').textContent=String(records.filter(r=>r.kind==='bloqueio').length);
  byId('gJournal').textContent=String(records.length);
  byId('governanceTasks').innerHTML=tasks.length?tasks.map(taskCard).join(''):'<p class="gov-empty">Nenhuma tarefa vinculada a este projeto.</p>';
  byId('governanceJournal').innerHTML=records.length?records.map(recordCard).join(''):'<p class="gov-empty">Nenhum registro no diário.</p>';
  const sel=byId('gEventTask');
  const previous=sel.value;
  sel.innerHTML='<option value="">Sem tarefa vinculada</option>'+tasks.map(t=>'<option value="'+safe(t.id)+'">'+safe(t.titulo)+'</option>').join('');
  if(tasks.some(t=>t.id===previous)) sel.value=previous;
}
async function reload() {
  const projectId=currentProject;
  const seq=++requestSeq;
  if(!projectId) { tasks=[];records=[];render();return; }
  message('Carregando agenda e histórico…');
  const [taskResult,journalResult] = await Promise.all([
    supabase.from('tasks')
      .select('id,project_id,titulo,descricao,status,prioridade,data_limite,concluida_em,updated_at')
      .eq('project_id',projectId).order('updated_at',{ascending:false}).limit(100),
    supabase.from('project_journal')
      .select('id,project_id,task_id,kind,state,title,description,source_ref,created_at')
      .eq('project_id',projectId).order('created_at',{ascending:false}).limit(100)
  ]);
  if(seq!==requestSeq||projectId!==currentProject) return;
  if(taskResult.error||journalResult.error) {
    tasks=[]; records=[]; render();
    message('Erro ao consultar o Diretório Mestre. Verifique as permissões e a migração.',true);
    console.error('Diretório Mestre',taskResult.error,journalResult.error);
    return;
  }
  tasks=taskResult.data||[];
  records=journalResult.data||[];
  message(records.length===100||tasks.length===100?'Exibindo até 100 itens de cada lista. Consultas históricas completas ficam no banco.':'');
  render();
}
async function saveTask(event) {
  event.preventDefault();
  if(!currentProject||!currentUser) return;
  const form=event.currentTarget, f=new FormData(form);
  const titulo=String(f.get('titulo')||'').trim();
  if(!titulo){message('Informe o título da tarefa.',true);return;}
  const row={
    project_id:currentProject,titulo,descricao:String(f.get('descricao')||'').trim()||null,
    prioridade:String(f.get('prioridade')||'normal'),data_limite:String(f.get('data_limite')||'')||null,
    status:'pendente',origem:'projeto',visibility_level:'management',created_by:currentUser
  };
  message('Salvando tarefa…');
  const {error}=await supabase.from('tasks').insert(row);
  if(error){message('Erro ao criar tarefa: '+error.message,true);return;}
  form.reset();
  await reload();
}
async function saveRecord(event) {
  event.preventDefault();
  if(!currentProject||!currentUser) return;
  const form=event.currentTarget, f=new FormData(form);
  const kind=String(f.get('kind')||'nota');
  const state=kind==='decisao'?String(f.get('state')||'proposto'):'registrado';
  const title=String(f.get('title')||'').trim();
  const description=String(f.get('description')||'').trim();
  const source_ref=String(f.get('source_ref')||'').trim();
  if(!title){message('Informe o título do registro.',true);return;}
  if(kind==='decisao'&&state==='aprovado'&&!source_ref){
    message('Para registrar uma decisão aprovada, informe a referência da aprovação.',true);return;
  }
  if(kind==='validacao'&&!String(f.get('task_id')||'')){
    message('Para validar uma tarefa, selecione a tarefa vinculada.',true);return;
  }
  const row={
    project_id:currentProject,task_id:String(f.get('task_id')||'')||null,
    kind,state,title,description,source_ref:source_ref||null,created_by:currentUser
  };
  message('Registrando evento…');
  const {error}=await supabase.from('project_journal').insert(row);
  if(error){message('Erro ao registrar evento: '+error.message,true);return;}
  form.reset();
  byId('gDecisionState').hidden=true;
  await reload();
}
async function changeTask(event) {
  const b=event.target.closest('button[data-task-id]');
  if(!b||!currentProject)return;
  const id=b.dataset.taskId,next=b.dataset.nextStatus;
  const task=tasks.find(t=>t.id===id);
  if(!task||!['em_andamento','concluida'].includes(next))return;
  b.disabled=true;
  try {
    if(next==='concluida'){
      const {data,error}=await supabase.from('project_journal').select('id')
        .eq('project_id',currentProject).eq('task_id',id).eq('kind','validacao').limit(1);
      if(error) throw error;
      if(!data?.length){message('Antes de concluir, registre uma validação vinculada à tarefa.',true);return;}
    }
    const update={status:next,concluida_em:next==='concluida'?new Date().toISOString():null};
    const {data,error}=await supabase.from('tasks').update(update)
      .eq('id',id).eq('project_id',currentProject).eq('status',task.status).select('id');
    if(error)throw error;
    if(!data?.length){message('Tarefa alterada por outra operação. Atualize e confira o estado.',true);return;}
    await reload();
  }catch(e){message('Erro ao atualizar tarefa: '+String(e.message||e),true);}
  finally {b.disabled=false;}
}
export async function initGovernance(projectRows,staffSession) {
  if(!byId('governanceProject'))return;
  currentUser=staffSession.user.id;
  available=(projectRows||[]).filter(p=>p.slug!=='personal-os');
  const select=byId('governanceProject');
  const selected=currentProject;
  select.innerHTML=available.map(p=>'<option value="'+safe(p.id)+'">'+safe(p.name)+'</option>').join('');
  currentProject=available.some(p=>p.id===selected)?selected:available[0]?.id||'';
  select.value=currentProject;
  if(!initialized){
    initialized=true;
    select.addEventListener('change',()=>{currentProject=select.value;reload();});
    byId('gTaskForm').addEventListener('submit',saveTask);
    byId('gEventForm').addEventListener('submit',saveRecord);
    byId('governanceTasks').addEventListener('click',changeTask);
    byId('gRefresh').addEventListener('click',reload);
    byId('gEventKind').addEventListener('change',(e)=>{
      const isDecision=e.target.value==='decisao';
      byId('gDecisionState').hidden=!isDecision;
    });
  }
  await reload();
}
