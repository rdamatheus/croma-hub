import{protectInternalPage}from'./interno-auth.js';import{migrateLocalState,saveModuleState}from'./interno-store.js';
const session=await protectInternalPage();if(!session)throw new Error('auth');
const MODULE='training_progress',LEGACY_PREFIX='croma_training_',checks=[...document.querySelectorAll('[data-k]')];
let legacy={};for(const e of checks)legacy[e.dataset.k]=localStorage.getItem(LEGACY_PREFIX+e.dataset.k)==='1';legacy.name=localStorage.getItem(LEGACY_PREFIX+'name')||'';legacy.date=localStorage.getItem(LEGACY_PREFIX+'date')||'';legacy.notes=localStorage.getItem(LEGACY_PREFIX+'notes')||'';
let state=await migrateLocalState(MODULE,'croma_training_state_v2',legacy);
function apply(){checks.forEach(e=>e.checked=!!state[e.dataset.k]);name.value=state.name||'';date.value=state.date||'';notes.value=state.notes||'';update()}
function snapshot(){checks.forEach(e=>state[e.dataset.k]=e.checked);state.name=name.value;state.date=date.value;state.notes=notes.value;return state}
function update(){const n=checks.filter(e=>e.checked).length,p=Math.round(n/checks.length*100);pct.textContent=p+'%';bar.style.width=p+'%'}
let timer;async function save(){snapshot();update();clearTimeout(timer);timer=setTimeout(()=>saveModuleState(MODULE,state),250)}checks.forEach(e=>e.onchange=save);['name','date','notes'].forEach(id=>document.getElementById(id).oninput=save);reset.onclick=async()=>{if(confirm('Limpar o progresso deste treinamento?')){state={};await saveModuleState(MODULE,state);apply()}};apply();
