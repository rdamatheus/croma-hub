import {protectInternalPage} from './interno-auth.js';
import {loadModuleState,saveModuleState} from './interno-store.js';
import {PRODUCTION_STAGES,stageLabel,localDateISO,monthCells,unifyMarketingEvents,collectMarketingMedia} from './marketing-workflow-core.js';

const session=await protectInternalPage();if(!session)throw Error('Acesso interno necessário');
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const validURL=v=>{try{const u=new URL(v);return u.protocol==='https:'?u.href:''}catch{return ''}};
const opt=(value,label)=>`<option value="${esc(value)}">${esc(label)}</option>`;
const key='marketing_productions_v1';
let productions=[],posts=[],campaigns=[],recent=[],editing=null,busy=false,stageFilter='all',brandFilter='all';
let month=new Date();month=new Date(month.getFullYear(),month.getMonth(),1);

function notify(t,error=false){$('mwStatus').textContent=t;$('mwStatus').setAttribute('aria-invalid',String(error))}
function dateText(iso){return /^\d{4}-\d{2}-\d{2}$/.test(iso||'')?iso.slice(8,10)+'/'+iso.slice(5,7)+'/'+iso.slice(0,4):'Sem data'}
function showTab(tab){
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.tab===tab));
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===tab));
}
function renderSelects(){
  const source=$('mwSource').value,campaign=$('mwCampaign').value;
  $('mwSource').innerHTML=opt('','Sem item vinculado')+recent.map((r,i)=>opt(String(i),(r.brand||'Croma')+' — '+r.name)).join('');
  if([...$('mwSource').options].some(o=>o.value===source))$('mwSource').value=source;
  $('mwCampaign').innerHTML=opt('','Sem campanha vinculada')+campaigns.map(c=>opt(c.id,c.title)).join('');
  if([...$('mwCampaign').options].some(o=>o.value===campaign))$('mwCampaign').value=campaign;
}
function renderOverview(){
  const metrics=[
    ['Em produção',productions.filter(p=>!['pronto','publicado'].includes(p.stage)).length],
    ['Em revisão',productions.filter(p=>p.stage==='revisao').length],
    ['Prontos',productions.filter(p=>p.stage==='pronto').length],
    ['Publicados (registrados)',posts.filter(p=>p.status==='Publicado').length]
  ];
  $('mwOverviewMetrics').innerHTML=metrics.map(([title,count])=>`<div class="mw-metric"><span>${esc(title)}</span><strong>${count}</strong></div>`).join('');
  $('mwPipeline').innerHTML=PRODUCTION_STAGES.map(s=>`<span class="mw-tag">${esc(s.label)}: ${productions.filter(p=>p.stage===s.id).length}</span>`).join('');
  const next=unifyMarketingEvents(posts,productions,campaigns).filter(e=>e.date>=localDateISO()).slice(0,6);
  $('mwNext').innerHTML=next.map(e=>`<div class="mw-item"><div class="mw-item-head"><strong>${esc(e.title)}</strong><span class="mw-tag">${esc(e.kind)}</span></div><small>${esc(dateText(e.date))} · ${esc(e.channel)} · ${esc(e.status)}</small></div>`).join('')||'<p class="mw-empty">Nenhum conteúdo futuro agendado.</p>';
  $('mwConnections').innerHTML=`<div class="mw-item"><strong>Campanhas cadastradas</strong><p>${campaigns.length} campanha(s) e ${campaigns.reduce((n,c)=>n+(c.assets||[]).length,0)} peça(s)</p><button class="btn alt" type="button" data-open-tab="campaigns">Abrir campanhas</button></div><div class="mw-item"><strong>Central de Aprovações</strong><p>Propostas da vitrine preservam seu fluxo independente.</p><a class="mw-link" href="/interno/vitrine-aprovacoes/">Abrir aprovações</a></div>`;
}
function renderStudio(){
  const list=productions.filter(p=>(stageFilter==='all'||p.stage===stageFilter)&&(brandFilter==='all'||p.brand===brandFilter)).slice().sort((a,b)=>(a.planned_date||'9999').localeCompare(b.planned_date||'9999'));
  $('mwStudioCount').textContent=list.length+' produção(ões)';
  $('mwStudioList').innerHTML=list.map(p=>{
    const campaign=campaigns.find(c=>c.id===p.campaign_id);
    const asset=validURL(p.asset_url),edit=validURL(p.edit_url);
    return `<article class="mw-item"><div class="mw-item-head"><div><strong>${esc(p.title)}</strong><br><small>${esc(p.brand)} · ${esc(p.channel)} · ${esc(p.format)} · ${esc(dateText(p.planned_date))}</small></div><span class="mw-tag">${esc(stageLabel(p.stage))}</span></div>
    ${p.goal?`<p><b>Objetivo:</b> ${esc(p.goal)}</p>`:''}
    ${campaign?`<p><small>Campanha: ${esc(campaign.title)}</small></p>`:''}
    <div class="mw-actions"><button type="button" class="btn alt" data-edit-production="${esc(p.id)}">Editar</button><button type="button" class="btn alt" data-create-calendar="${esc(p.id)}">Levar ao calendário</button>
    ${asset?`<a class="mw-link" href="${esc(asset)}" target="_blank" rel="noopener noreferrer">Arquivo / Drive</a>`:''}
    ${edit?`<a class="mw-link" href="${esc(edit)}" target="_blank" rel="noopener noreferrer">Edição</a>`:''}</div></article>`;
  }).join('')||'<p class="mw-empty">Nenhuma produção encontrada. Cadastre um conteúdo no formulário.</p>';
}
function renderCalendar(){
  const events=unifyMarketingEvents(posts,productions,campaigns),byDate=new Map();
  for(const e of events){const day=byDate.get(e.date)||[];day.push(e);byDate.set(e.date,day)}
  $('mwMonthLabel').textContent=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(month);
  const days=['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  $('mwMonthGrid').innerHTML=days.map(d=>`<div class="mw-calendar-header">${d}</div>`).join('')+monthCells(month.getFullYear(),month.getMonth()).map(d=>{
    const items=byDate.get(d.date)||[];
    return `<div class="mw-date${d.inMonth?'':' is-other'}${d.date===localDateISO()?' is-today':''}" aria-label="${esc(dateText(d.date))}, ${items.length} item(ns)"><span class="mw-date-number">${d.day}</span>
      ${items.slice(0,2).map(e=>`<span class="mw-calendar-event" title="${esc(e.title)}">${esc(e.title)}<small>${esc(e.kind)}</small></span>`).join('')}
      ${items.length>2?`<span class="mw-calendar-event">+${items.length-2} item(ns)</span>`:''}</div>`;
  }).join('');
  const prefix=month.getFullYear()+'-'+String(month.getMonth()+1).padStart(2,'0');
  const agenda=events.filter(e=>e.date.startsWith(prefix));
  $('mwAgenda').innerHTML=agenda.map(e=>`<div class="mw-agenda-line"><time datetime="${e.date}">${esc(dateText(e.date).slice(0,5))}</time><div><strong>${esc(e.title)}</strong><br><small>${esc(e.kind)} · ${esc(e.brand)} · ${esc(e.channel)} · ${esc(e.status)}</small></div></div>`).join('')||'<p class="mw-empty">Nenhum conteúdo planejado para este mês.</p>';
}
function renderLibrary(){
  const media=collectMarketingMedia(productions,campaigns);
  $('mwLibraryCount').textContent=media.length+' referência(s)';
  $('mwLibraryList').innerHTML=media.map(m=>`<div class="mw-link-tile"><small>${esc(m.origin)} · ${esc(m.kind)}</small><strong>${esc(m.title||'Material')}</strong><a class="mw-link" href="${esc(m.url)}" target="_blank" rel="noopener noreferrer">Abrir material</a></div>`).join('')||'<p class="mw-empty">Vincule links de arquivos nas produções ou campanhas. Os arquivos permanecem nas ferramentas de origem.</p>';
}
function render(){renderSelects();renderOverview();renderStudio();renderCalendar();renderLibrary()}
async function refresh(){
  try{
    const [p,c,r]=await Promise.all([
      loadModuleState('marketing_posts',[]),
      loadModuleState('marketing_campaigns_v1',[]),
      loadModuleState('marketing_recent',[])
    ]);
    posts=Array.isArray(p)?p:[];campaigns=Array.isArray(c)?c:[];recent=Array.isArray(r)?r:[];render();
  }catch(error){notify('Falha ao atualizar dados relacionados: '+error.message,true)}
}
function clearForm(){
  editing=null;$('mwProductionForm').reset();$('mwDate').value=localDateISO();$('mwStage').value='ideia';
  $('mwFormTitle').textContent='Nova produção de conteúdo';$('mwSave').textContent='Salvar briefing';notify('');
}
function editProduction(id){
  const p=productions.find(x=>x.id===id);if(!p)return;editing=id;
  const fields={mwTitle:p.title,mwBrand:p.brand,mwFormat:p.format,mwChannel:p.channel,mwStage:p.stage,mwDate:p.planned_date,mwGoal:p.goal,mwAudience:p.audience,mwBrief:p.brief,mwScript:p.script,mwAsset:p.asset_url,mwEditUrl:p.edit_url,mwNotes:p.notes,mwCampaign:p.campaign_id};
  for(const [k,v]of Object.entries(fields))$(k).value=v||'';
  $('mwSource').value='';$('mwFormTitle').textContent='Editar produção';$('mwSave').textContent='Salvar alterações';
  showTab('studio');$('mwProductionForm').scrollIntoView({behavior:'smooth',block:'start'});
}
function readForm(){
  const title=$('mwTitle').value.trim(),planned_date=$('mwDate').value;
  if(!title)throw Error('Informe o título.');if(!/^\d{4}-\d{2}-\d{2}$/.test(planned_date))throw Error('Informe a data prevista.');
  const asset=$('mwAsset').value.trim(),edit=$('mwEditUrl').value.trim();
  if((asset&&!validURL(asset))||(edit&&!validURL(edit)))throw Error('Use apenas links HTTPS válidos.');
  const source=$('mwSource').value===''?null:recent[Number($('mwSource').value)];
  return {
    title:title.slice(0,140),planned_date,brand:$('mwBrand').value,format:$('mwFormat').value,channel:$('mwChannel').value,
    stage:$('mwStage').value,goal:$('mwGoal').value.trim().slice(0,500),audience:$('mwAudience').value.trim().slice(0,300),
    brief:$('mwBrief').value.trim().slice(0,6000),script:$('mwScript').value.trim().slice(0,10000),
    notes:$('mwNotes').value.trim().slice(0,4000),asset_url:validURL(asset),edit_url:validURL(edit),
    campaign_id:$('mwCampaign').value||null,source_name:source?.name||''
  };
}
async function save(event){
  event.preventDefault();if(busy)return;
  let fields;try{fields=readForm()}catch(error){notify(error.message,true);return}
  const now=new Date().toISOString(),old=productions.find(p=>p.id===editing);
  const item={...old,...fields,id:old?.id||crypto.randomUUID(),created_at:old?.created_at||now,updated_at:now};
  const next=old?productions.map(p=>p.id===old.id?item:p):[item,...productions];
  busy=true;$('mwSave').disabled=true;
  try{await saveModuleState(key,next);productions=next;clearForm();render();notify('Briefing salvo no Supabase.')}
  catch(error){notify('Falha ao salvar: '+error.message,true)}
  finally{busy=false;$('mwSave').disabled=false}
}
async function toCalendar(id){
  const p=productions.find(x=>x.id===id);if(!p)return;
  if(!window.CromaMarketingPostBridgeReady){notify('Aguarde o calendário carregar e tente novamente.',true);return}
  try{
    await new Promise((resolve,reject)=>window.dispatchEvent(new CustomEvent('croma:marketing-create-post',{detail:{production:p,resolve,reject}})));
    await refresh();showTab('calendar');notify('Postagem vinculada ao calendário. Nenhuma publicação externa foi realizada.');
  }catch(error){notify('Falha ao vincular: '+error.message,true)}
}
$('mwProductionForm').addEventListener('submit',save);
$('mwClear').addEventListener('click',clearForm);
$('mwSource').addEventListener('change',()=>{
  const r=$('mwSource').value===''?null:recent[Number($('mwSource').value)];
  if(!r)return;if(!$('mwTitle').value.trim())$('mwTitle').value=r.name||'';
  if(r.brand)$('mwBrand').value=r.brand;
  if(!$('mwBrief').value.trim())$('mwBrief').value=[r.highlight,r.details].filter(Boolean).join('\n');
});
$('mwStageFilter').innerHTML=opt('all','Todas as etapas')+PRODUCTION_STAGES.map(s=>opt(s.id,s.label)).join('');
$('mwStage').innerHTML=PRODUCTION_STAGES.map(s=>opt(s.id,s.label)).join('');
$('mwStageFilter').addEventListener('change',e=>{stageFilter=e.target.value;renderStudio()});
$('mwBrandFilter').addEventListener('change',e=>{brandFilter=e.target.value;renderStudio()});
$('mwPrevMonth').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()-1,1);renderCalendar()});
$('mwNextMonth').addEventListener('click',()=>{month=new Date(month.getFullYear(),month.getMonth()+1,1);renderCalendar()});
$('mwTodayMonth').addEventListener('click',()=>{const d=new Date();month=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar()});
document.addEventListener('click',e=>{
  const open=e.target.closest('[data-open-tab]');if(open){showTab(open.dataset.openTab);return}
  const tab=e.target.closest('.tab[data-tab]');if(tab)showTab(tab.dataset.tab);
  const editor=e.target.closest('[data-edit-production]');if(editor){editProduction(editor.dataset.editProduction);return}
  const sync=e.target.closest('[data-create-calendar]');if(sync)toCalendar(sync.dataset.createCalendar);
});
window.addEventListener('croma:marketing-changed',refresh);
window.addEventListener('croma:marketing-campaigns-changed',refresh);
try{
  const data=await loadModuleState(key,[]);
  productions=Array.isArray(data)?data:[];
  clearForm();await refresh();showTab('overview');
}catch(error){notify('Falha ao iniciar o Estúdio: '+error.message,true)}
