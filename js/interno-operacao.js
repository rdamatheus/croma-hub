import{protectInternalPage}from'./interno-auth.js';import{migrateLocalState,saveModuleState}from'./interno-store.js';
const session=await protectInternalPage();if(!session)throw new Error('auth');
const MODULE='store_operation',LOCAL='croma_operacao_v1',els=[...document.querySelectorAll('[data-save]')];
let data=await migrateLocalState(MODULE,LOCAL,[]);
function snapshot(){return els.map(e=>e.type==='checkbox'?e.checked:e.value)}
function apply(values){els.forEach((e,i)=>{if(values?.[i]===undefined)return;if(e.type==='checkbox')e.checked=!!values[i];else e.value=values[i]})}
let timer;async function save(){data=snapshot();document.querySelector('#saveStatus').textContent='Salvando...';clearTimeout(timer);try{await saveModuleState(MODULE,data);document.querySelector('#saveStatus').textContent='Salvo agora';timer=setTimeout(()=>document.querySelector('#saveStatus').textContent='Salvo automaticamente',1200)}catch{document.querySelector('#saveStatus').textContent='Falha ao salvar'}}
els.forEach(e=>e.addEventListener(e.type==='checkbox'?'change':'input',save));document.querySelector('#reset').onclick=async()=>{if(confirm('Limpar todas as marcações e campos desta rotina?')){els.forEach(e=>{if(e.type==='checkbox')e.checked=false;else e.value=''});await save()}};apply(data);
