import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js?v=20261004-1';

const STATUS={active:'Ativo',paused:'Pausado',planning:'Planejamento',archived:'Arquivado'};
const TASK_STATUS={pendente:'Pendente',em_andamento:'Em andamento',concluida:'Concluída',cancelada:'Cancelada'};
const KIND={decisao:'Decisão',progresso:'Progresso',bloqueio:'Bloqueio',validacao:'Validação',handoff:'Transferência',nota:'Nota'};
const STATE={aprovado:'Aprovado',proposto:'Proposto',rejeitado:'Rejeitado',registrado:'Registrado'};
const $=s=>document.querySelector(s);
const el=(tag,text,parent,cls)=>{
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(text!==undefined&&text!==null)n.textContent=String(text);
  if(parent)parent.appendChild(n);
  return n;
};
const clear=selector=>{const x=$(selector);x.replaceChildren();return x;};
const message=(container,text)=>el('p',text,container,'empty');
const dateBR=value=>{
  if(!value)return '';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(d);
};
const monthBR=value=>{
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'Sem data':new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(d);
};
const safeUrl=url=>{
  try{const parsed=new URL(url);return ['https:','http:'].includes(parsed.protocol)?parsed.href:null;}catch{return null;}
};
// Exibição apenas: nenhum texto, estado ou decisão é alterado no banco.
function structuredText(container,value,fallback='Ainda não informado.'){
  container.replaceChildren();
  if(typeof value!=='string'||!value.trim()){message(container,fallback);return;}
  const text=value.trim();
  // Os documentos atuais são narrativos. Separam-se frases longas apenas na interface.
  const parts=text.split(/\n{2,}|;\s+|(?<=[.!?])\s+(?=[A-ZÀ-Ý])/u).map(x=>x.trim()).filter(Boolean);
  const lines=parts.length>1?parts:[text];
  for(const line of lines)el('p',line,container,'split-paragraph');
}
function bulletList(selector,values,fallback,numbered=false){
  const host=clear(selector);
  const list=Array.isArray(values)?values.filter(x=>typeof x==='string'&&x.trim()):[];
  if(!list.length){message(host,fallback);return;}
  const ul=el(numbered?'ol':'ul',null,host,'points'+(numbered?' steps':''));
  for(const item of list)el('li',item,ul);
}
function validDecisions(entries){
  const superseded=new Set(entries.filter(x=>x.kind==='decisao'&&x.state==='aprovado'&&x.supersedes_id).map(x=>x.supersedes_id));
  return {superseded,live:entries.filter(x=>x.kind==='decisao'&&!superseded.has(x.id))};
}
function renderDecisionBox(selector,items,kind,emptyText){
  const target=clear(selector);
  if(!items.length){message(target,emptyText);return;}
  for(const entry of items){
    const box=el('div',null,target,'decision-card '+kind);
    el('strong',entry.title,box);
    el('small',dateBR(entry.created_at),box);
    const anchor=el('a','Ver registro completo',box);
    anchor.href='#registro-'+entry.id;
    anchor.addEventListener('click',()=>{
      activeFilter('todos');
      const item=document.getElementById('registro-'+entry.id);
      if(item)item.open=true;
    });
  }
}
let allEntries=[];
let journalFailed=false;
function activeFilter(filter){
  $('#history-filters').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
  renderHistory(filter);
}
function filterMatches(entry,filter){
  if(filter==='todos')return true;
  if(filter==='aprovado'||filter==='proposto')return entry.kind==='decisao'&&entry.state===filter;
  if(filter==='progresso'||filter==='bloqueio')return entry.kind===filter;
  return entry.kind==='nota'||entry.kind==='validacao'||entry.kind==='handoff'||(entry.kind==='decisao'&&entry.state==='rejeitado');
}
function renderHistory(filter='todos'){
  const host=clear('#journal');
  if(journalFailed){
    $('#history-count').textContent='';
    message(host,'Não foi possível consultar o histórico. Tente novamente mais tarde.');
    return;
  }
  const items=allEntries.filter(x=>filterMatches(x,filter));
  $('#history-count').textContent=items.length+' de '+allEntries.length+' registros';
  if(!items.length){message(host,allEntries.length?'Nenhum registro corresponde ao filtro.':'Nenhum registro no histórico.');return;}
  let activeMonth='';
  let timeline=null;
  for(const entry of items){
    const m=monthBR(entry.created_at);
    if(m!==activeMonth){activeMonth=m;el('h3',m,host,'history-group');timeline=el('div',null,host,'timeline');}
    const details=el('details',null,timeline,'journal-entry');
    details.id='registro-'+entry.id;
    const summary=el('summary',null,details);
    const heading=el('span',null,summary,'entry-text');
    el('strong',entry.title,heading);
    el('small',[dateBR(entry.created_at),KIND[entry.kind]||entry.kind,STATE[entry.state]||entry.state].filter(Boolean).join(' • '),heading);
    el('span','›',summary,'entry-arrow');
    const body=el('div',null,details,'entry-details');
    const labels=el('div',null,body,'entry-meta');
    el('span',KIND[entry.kind]||entry.kind,labels,'chip');
    el('span',STATE[entry.state]||entry.state,labels,'chip '+entry.state);
    const content=el('div',null,body);
    structuredText(content,entry.description,'Registro sem descrição.');
    if(entry.source_ref)el('div','Origem: '+entry.source_ref,body,'entry-source');
  }
}
function renderTasks(tasks,failed){
  const target=clear('#tasks');
  if(failed){message(target,'Falha ao consultar tarefas.');return;}
  if(!tasks.length){message(target,'Nenhuma tarefa vinculada. Os próximos passos acima são orientações, não tarefas atribuídas.');return;}
  for(const task of tasks){
    const box=el('div',null,target,'task');
    el('strong',task.titulo,box);
    el('small',[TASK_STATUS[task.status]||task.status,task.prioridade?'Prioridade: '+task.prioridade:'',task.data_limite?'Prazo: '+task.data_limite:''].filter(Boolean).join(' • '),box);
    if(task.descricao)el('p',task.descricao,box);
  }
}
function renderReferences(project){
  const target=clear('#references'),seen=new Set();
  const links=[...(Array.isArray(project.metadata?.references)?project.metadata.references:[]),
    {label:'Painel administrativo',url:project.admin_url},
    {label:'Site relacionado',url:project.site_url},
    {label:'Repositório de código',url:project.repository_url}];
  for(const ref of links){
    const url=safeUrl(ref?.url);
    if(!url||seen.has(url))continue;
    seen.add(url);
    const a=el('a',ref.label||url,target,'reference');
    a.href=url;a.target='_blank';a.rel='noopener noreferrer';
  }
  if(!seen.size)message(target,'Nenhuma referência cadastrada.');
}
function renderProject(project,entries,tasks,tasksFailed,historyFailed){
  const brief=project.metadata?.brief||{};
  $('#project-name').textContent=project.name;
  $('#project-status').textContent=STATUS[project.status]||project.status;
  $('#project-intro').textContent=project.description||'Sem descrição cadastrada.';
  structuredText(clear('#objective'),brief.objective||project.description);
  structuredText(clear('#outcome'),brief.expected_result);
  structuredText(clear('#current-state'),brief.current_state);
  structuredText(clear('#context-summary'),brief.context,'Contexto detalhado ainda não informado.');
  bulletList('#issues',brief.issues,'Problemas e oportunidades ainda serão identificados.');
  bulletList('#constraints',brief.constraints,'Nenhuma restrição adicional registrada.');
  bulletList('#next-steps',brief.next_steps,'Próximos passos ainda não definidos.',true);
  const {superseded,live}=validDecisions(entries);
  const approved=live.filter(x=>x.state==='aprovado');
  const proposed=live.filter(x=>x.state==='proposto');
  const archived=entries.filter(x=>x.kind==='decisao'&&(x.state==='rejeitado'||superseded.has(x.id)));
  if(historyFailed){
    for(const selector of ['#decisions-approved','#decisions-proposed','#decisions-archived'])message(clear(selector),'Decisões indisponíveis enquanto o histórico não carrega.');
  }else{
    renderDecisionBox('#decisions-approved',approved,'approved','Nenhuma decisão aprovada registrada.');
    renderDecisionBox('#decisions-proposed',proposed,'proposed','Nenhuma proposta aguardando análise.');
    renderDecisionBox('#decisions-archived',archived,'rejected','Nenhuma decisão rejeitada ou substituída.');
  }
  allEntries=entries;journalFailed=historyFailed;activeFilter('todos');
  $('#metric-history').textContent=historyFailed?'—':String(entries.length);
  $('#metric-approved').textContent=historyFailed?'—':String(approved.length);
  $('#metric-proposed').textContent=historyFailed?'—':String(proposed.length);
  $('#metric-next').textContent=String(Array.isArray(brief.next_steps)?brief.next_steps.length:0);
  renderTasks(tasks,tasksFailed);
  renderReferences(project);
  $('#content').hidden=false;
}
$('#history-filters').addEventListener('click',event=>{
  const button=event.target.closest('button[data-filter]');
  if(button)activeFilter(button.dataset.filter);
});
async function load(){
  const slug=new URLSearchParams(location.search).get('slug')||'';
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)){$('#message').textContent='Identificador de projeto inválido.';return;}
  $('#message').textContent='Carregando projeto e histórico…';
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
  if(jr.error||ts.error)console.error('Erro ao consultar informações do projeto',jr.error||ts.error);
  $('#message').textContent=jr.error?'Alguns registros não puderam ser carregados.':(ts.error?'Tarefas indisponíveis no momento.':'');
  renderProject(project,jr.data||[],ts.data||[],Boolean(ts.error),Boolean(jr.error));
}
try{
  const session=await protectInternalPage({roles:['owner','manager']});
  if(session)await load();
}catch(error){
  console.error(error);
  document.body.hidden=false;
  $('#message').textContent='Não foi possível carregar a página. Verifique a sessão e tente novamente.';
}