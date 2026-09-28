import { INTERNAL_GROUPS, activeModuleKey, iconSvg } from './interno-navigation.js';

const STORAGE_COLLAPSED='croma_internal_sidebar_collapsed';
const STORAGE_GROUPS='croma_internal_sidebar_groups';

function readGroupState(){
  try{return JSON.parse(localStorage.getItem(STORAGE_GROUPS)||'{}')}catch{return {}}
}

function saveGroupState(sidebar){
  const state={};
  sidebar.querySelectorAll('.croma-nav-section').forEach(section=>{state[section.dataset.group]=section.open});
  localStorage.setItem(STORAGE_GROUPS,JSON.stringify(state));
}

function applyRole(sidebar,role){
  sidebar.dataset.role=role||'';
  sidebar.querySelectorAll('[data-owner-only="true"]').forEach(el=>{el.hidden=role!=='owner'});
}

function buildSidebar(){
  if(document.querySelector('.croma-sidebar'))return;
  const normalized=(location.pathname.replace(/\/+$/,'')||'/')+'/';
  const activeKey=activeModuleKey(location.pathname);
  const groupState=readGroupState();
  const side=document.createElement('aside');
  side.className='croma-sidebar';
  side.setAttribute('aria-label','Navegação administrativa');
  const groups=INTERNAL_GROUPS.map(group=>{
    const open=groupState[group.id]!==false;
    const links=group.items.map(item=>`<a href="${item.href}" data-module-key="${item.key}" data-owner-only="${item.ownerOnly?'true':'false'}" class="${item.key===activeKey?'active':''}"${item.ownerOnly?' hidden':''} title="${item.label}">${iconSvg(item.icon)}<span>${item.label}</span></a>`).join('');
    return `<details class="croma-nav-section" data-group="${group.id}"${open?' open':''}><summary><span>${group.label}</span><i aria-hidden="true">⌄</i></summary><div class="croma-nav-links">${links}</div></details>`;
  }).join('');
  side.innerHTML=`<div class="croma-sidebar-top"><a class="brand" href="/interno/" title="Painel interno"><img src="/favicon.svg?v=20260831-3" alt=""><span><strong>Croma Hub</strong><small>Administração</small></span></a><button class="croma-sidebar-collapse" type="button" aria-label="Recolher menu" title="Recolher menu">‹</button></div><nav class="croma-sidebar-nav">${groups}</nav><div class="croma-sidebar-spacer"></div><div class="croma-sidebar-footer"><a href="/" title="Ver site">${iconSvg('<path d="M3 12h18M3 12l7-7M3 12l7 7"/>')}<span>Ver site</span></a></div>`;
  const target=normalized==='/interno/'?(document.querySelector('#app')||document.body):document.body;
  target.appendChild(side);
  const overlay=document.createElement('button');
  overlay.type='button';overlay.className='croma-nav-overlay';overlay.setAttribute('aria-label','Fechar menu');
  target.appendChild(overlay);
  side.querySelectorAll('.croma-nav-section').forEach(section=>section.addEventListener('toggle',()=>saveGroupState(side)));
  const collapse=side.querySelector('.croma-sidebar-collapse');
  const storedCollapsed=localStorage.getItem(STORAGE_COLLAPSED)==='1';
  document.body.classList.toggle('nav-collapsed',storedCollapsed);
  collapse.textContent=storedCollapsed?'›':'‹';
  collapse.setAttribute('aria-label',storedCollapsed?'Expandir menu':'Recolher menu');
  collapse.title=storedCollapsed?'Expandir menu':'Recolher menu';
  collapse.addEventListener('click',()=>{
    const collapsed=document.body.classList.toggle('nav-collapsed');
    localStorage.setItem(STORAGE_COLLAPSED,collapsed?'1':'0');
    collapse.textContent=collapsed?'›':'‹';
    collapse.setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');
    collapse.title=collapsed?'Expandir menu':'Recolher menu';
  });
  const closeMobile=()=>document.body.classList.remove('nav-open');
  overlay.addEventListener('click',closeMobile);
  side.querySelectorAll('a').forEach(link=>link.addEventListener('click',closeMobile));
  window.addEventListener('keydown',event=>{if(event.key==='Escape')closeMobile()});
  window.addEventListener('croma:staff-role',event=>applyRole(side,event.detail?.role||null));
}

function addMobileButton(){
  const header=document.querySelector('.internal-header,.top');
  if(!header||header.querySelector('.croma-mobile-menu'))return;
  const button=document.createElement('button');
  button.type='button';button.className='croma-mobile-menu';button.setAttribute('aria-label','Abrir menu');button.textContent='☰';
  button.addEventListener('click',()=>document.body.classList.toggle('nav-open'));
  header.prepend(button);
}

function add(){
  document.body.classList.add('croma-modern');
  if(!document.querySelector('link[data-croma-modern]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/css/interno-modern.css?v=20260928-1';link.dataset.cromaModern='1';document.head.appendChild(link);
  }
  buildSidebar();
  addMobileButton();
}

document.readyState==='loading'?document.addEventListener('DOMContentLoaded',add):add();
