import './croma-brand.js';
import './interno-polish.js?v=20260928-5';
import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js?v=20261004-1';

const TYPE_LABEL={internal:'Interno',venture:'Negócio',client:'Cliente',external:'Externo'};
const STATUS_LABEL={active:'Ativo',paused:'Pausado',planning:'Planejamento',archived:'Arquivado'};

const projectsEl=document.querySelector('#projects');
const messageEl=document.querySelector('#message');
const totalEl=document.querySelector('#mTotal');
const activeEl=document.querySelector('#mActive');
const sharedEl=document.querySelector('#mShared');

function esc(value=''){
  return String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}

function link(url,label,primary=false){
  if(!url)return '';
  return `<a${primary?' class="primary"':''} href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
}

function render(rows){
  totalEl.textContent=String(rows.length);
  activeEl.textContent=String(rows.filter(row=>row.status==='active').length);
  sharedEl.textContent=String(rows.filter(row=>row.metadata?.supabase_project==='croma-hub').length);

  if(!rows.length){
    projectsEl.innerHTML='<div class="empty">Nenhum projeto cadastrado.</div>';
    return;
  }

  projectsEl.innerHTML=rows.map(row=>{
    const supabaseProject=row.metadata?.supabase_project||'—';
    return `<article class="project">
      <div class="project-head">
        <div><h2>${esc(row.name)}</h2><p>${esc(row.description||'')}</p></div>
        <span class="badge">${esc(STATUS_LABEL[row.status]||row.status)}</span>
      </div>
      <div class="meta">
        <div><span>Tipo</span><b>${esc(TYPE_LABEL[row.project_type]||row.project_type)}</b></div>
        <div><span>Schema</span><b>${esc(row.supabase_schema||'—')}</b></div>
        <div><span>Supabase</span><b>${esc(supabaseProject)}</b></div>
        <div><span>Identificador</span><b>${esc(row.slug)}</b></div>
      </div>
      <div class="actions">
        ${link(row.admin_url,'Abrir painel',true)}
        ${link(row.site_url,'Abrir site')}
        ${link(row.repository_url,'GitHub')}
      </div>
    </article>`;
  }).join('');
}

async function load(){
  messageEl.textContent='Carregando projetos…';
  const { data,error }=await supabase
    .from('managed_projects')
    .select('id,slug,name,project_type,status,repository_url,site_url,admin_url,supabase_schema,description,metadata,sort_order,updated_at')
    .order('sort_order',{ascending:true})
    .order('name',{ascending:true});
  if(error){
    console.error(error);
    messageEl.textContent='Não foi possível carregar os projetos.';
    render([]);
    return;
  }
  messageEl.textContent='';
  render(data||[]);
}

const session=await protectInternalPage({roles:['owner','manager']});
if(session){
  await load();
  document.querySelector('#refresh')?.addEventListener('click',load);
}
