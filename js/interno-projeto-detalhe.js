import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js?v=20261004-1';

const STATUS = {active:'Ativo',paused:'Pausado',planning:'Planejamento',archived:'Arquivado'};
const TASK_STATUS = {pendente:'Pendente',em_andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'};
const KIND = {decisao:'Decisão',progresso:'Progresso',bloqueio:'Bloqueio',validacao:'Validação',handoff:'Transferência',nota:'Nota'};
const STATE = {aprovado:'Aprovado',proposto:'Proposto',rejeitado:'Rejeitado',registrado:'Registrado'};
const $ = selector => document.querySelector(selector);
const node = (tag, text, parent, cls) => {
  const el=document.createElement(tag);
  if(cls) el.className=cls;
  if(text!==undefined && text!==null) el.textContent=String(text);
  if(parent) parent.appendChild(el);
  return el;
};
const empty = (parent, message='Ainda não há informações registradas.') =>
  node('p',message,parent,'subtle');
const textOr = (selector, value, fallback='A detalhar durante o diagnóstico.') =>
  $(selector).textContent=typeof value==='string' && value.trim()?value:fallback;
const dateBR = value => {
  if(!value) return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(d);
};
const safeUrl = url => {
  try {
    const parsed=new URL(url);
    return ['http:','https:'].includes(parsed.protocol)?parsed.href:null;
  } catch { return null; }
};
function listAt(selector, items, fallback){
  const host=$(selector);host.replaceChildren();
  if(!Array.isArray(items)||!items.length){empty(host,fallback);return;}
  const ul=node('ul',null,host);
  for(const item of items){
    if(typeof item==='string' && item.trim())node('li',item,ul);
  }
  if(!ul.children.length){ul.remove();empty(host,fallback);}
}
function renderDecisions(entries){
  const target=$('#decisions');target.replaceChildren();
  const superseded=new Set(entries.filter(e=>e.kind==='decisao'&&e.state==='aprovado'&&e.supersedes_id).map(e=>e.supersedes_id));
  const decisions=entries.filter(e=>e.kind==='decisao'&&e.state==='aprovado'&&!superseded.has(e.id));
  if(!decisions.length){empty(target,'Nenhuma decisão aprovada registrada.');return;}
  for(const entry of decisions){
    const box=node('div',null,target,'decision');
    node('strong',entry.title,box);
    node('small',dateBR(entry.created_at),box,'subtle');
    node('span',' ',box);
    const anchor=node('a','Ver justificativa e detalhes',box);
    anchor.href='#registro-'+entry.id;
  }
}
function renderHistory(entries){
  const host=$('#journal');host.replaceChildren();
  if(!entries.length){empty(host,'Histórico ainda não iniciado.');return;}
  for(const entry of entries){
    const item=node('details',null,host,'entry');
    item.id='registro-'+entry.id;
    node('summary',entry.title,item);
    const body=node('div',null,item,'entry-body');
    const meta=node('div',null,body,'meta');
    node('span',KIND[entry.kind]||entry.kind,meta);
    node('span',STATE[entry.state]||entry.state,meta);
    node('span',dateBR(entry.created_at),meta);
    if(entry.description)node('p',entry.description,body);
    if(entry.source_ref)node('small','Origem: '+entry.source_ref,body,'subtle');
  }
}
function renderTasks(tasks, failed){
  const host=$('#tasks');host.replaceChildren();
  if(failed){empty(host,'Não foi possível consultar as tarefas.');return;}
  if(!tasks.length){empty(host,'Nenhuma tarefa cadastrada para este projeto.');return;}
  for(const task of tasks){
    const item=node('div',null,host,'task');
    node('strong',task.titulo,item);
    const labels=[TASK_STATUS[task.status]||task.status,task.prioridade?'Prioridade: '+task.prioridade:'',task.data_limite?'Prazo: '+task.data_limite:''].filter(Boolean);
    node('small',labels.join(' • '),item);
    if(task.descricao)node('p',task.descricao,item);
  }
}
function renderReferences(project){
  const host=$('#references');host.replaceChildren();
  const links=[
    ...(Array.isArray(project.metadata?.references)?project.metadata.references:[]),
    {label:'Painel de administração',url:project.admin_url},
    {label:'Site relacionado',url:project.site_url},
    {label:'Repositório',url:project.repository_url}
  ];
  const seen=new Set();
  for(const ref of links){
    const url=safeUrl(ref?.url);
    if(!url||seen.has(url))continue;
    seen.add(url);
    const anchor=node('a',ref.label||'Abrir referência',host,'ref');
    anchor.href=url;anchor.target='_blank';anchor.rel='noopener noreferrer';
  }
  if(!seen.size)empty(host,'Nenhuma referência vinculada.');
}
function renderProject(project,entries,tasks,tasksFailed){
  const brief=project.metadata?.brief||{};
  $('#project-name').textContent=project.name;
  $('#project-status').textContent=STATUS[project.status]||project.status;
  textOr('#project-intro',project.description);
  textOr('#objective',brief.objective||project.description);
  textOr('#outcome',brief.expected_result);
  textOr('#current-state',brief.current_state);
  textOr('#context-summary',brief.context,'Contexto detalhado ainda não registrado.');
  listAt('#issues',brief.issues,'A identificar e validar durante o diagnóstico.');
  listAt('#constraints',brief.constraints,'Nenhuma diretriz adicional registrada.');
  listAt('#next-steps',brief.next_steps,'Nenhum próximo passo definido.');
  renderDecisions(entries);
  renderHistory(entries);
  renderTasks(tasks,tasksFailed);
  renderReferences(project);
  $('#content').hidden=false;
}
async function load(){
  const slug=new URLSearchParams(location.search).get('slug')||'';
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){
    $('#message').textContent='Identificador de projeto inválido.';return;
  }
  $('#message').textContent='Carregando o projeto…';
  const {data:project,error}=await supabase.from('managed_projects')
    .select('id,slug,name,description,status,metadata,admin_url,site_url,repository_url')
    .eq('slug',slug).maybeSingle();
  if(error||!project){$('#message').textContent='Projeto não encontrado ou acesso não autorizado.';return;}
  const [jr,ts]=await Promise.all([
    supabase.from('project_journal')
      .select('id,kind,state,title,description,source_ref,supersedes_id,created_at')
      .eq('project_id',project.id).order('created_at',{ascending:false}).limit(500),
    supabase.from('tasks')
      .select('id,titulo,descricao,status,prioridade,data_limite')
      .eq('project_id',project.id).order('created_at',{ascending:false}).limit(200)
  ]);
  if(jr.error){
    console.error(jr.error);
    $('#message').textContent='Projeto localizado, mas o histórico não pôde ser carregado.';
  }else $('#message').textContent='';
  renderProject(project,jr.data||[],ts.data||[],Boolean(ts.error));
}
const session=await protectInternalPage({roles:['owner','manager']});
if(session)await load();