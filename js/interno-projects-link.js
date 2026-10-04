const ALLOWED_ROLES=new Set(['owner','manager']);
let observer=null;

function projectIcon(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 4V2h8v2M3 10h18M8 14h3M8 17h6"/></svg>';
}

function ensureProjectsLink(role=document.body.dataset.staffRole||''){
  const sidebar=document.querySelector('.croma-sidebar');
  if(!sidebar)return false;
  const group=sidebar.querySelector('[data-group="sistema"] .croma-nav-links');
  if(!group)return false;

  const existing=group.querySelector('[data-projects-link]');
  const allowed=ALLOWED_ROLES.has(role);
  if(existing){
    existing.hidden=!allowed;
    return true;
  }
  if(!allowed)return true;

  const link=document.createElement('a');
  link.href='/interno/projetos/';
  link.dataset.projectsLink='1';
  if(location.pathname.startsWith('/interno/projetos'))link.classList.add('active');
  link.innerHTML=`${projectIcon()}<span>Projetos</span>`;
  group.appendChild(link);
  return true;
}

function start(){
  if(ensureProjectsLink())return;
  observer=new MutationObserver(()=>{
    if(ensureProjectsLink()){
      observer?.disconnect();
      observer=null;
    }
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
}

window.addEventListener('croma:staff-role',event=>ensureProjectsLink(event.detail?.role||''));
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',start):start();
