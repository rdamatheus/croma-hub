import {supabase} from './croma-supabase.js';
import {protectInternalPage} from './interno-auth.js';
import {loadModuleState,saveModuleState} from './interno-store.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('Acesso restrito');
const KEY='marketing_campaigns_v1';
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const safeUrl=value=>{try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const link=(url,label)=>safeUrl(url)?`<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`:'';
const statuses={rascunho:'Rascunho',aprovacao:'Em aprovação',pronto:'Pronto para postar',publicado:'Publicado'};
let campaigns=[],currentCampaign=null,currentAsset=null,productMatches=[],busy=false;
function message(text,bad=false){$('campaignStatus').textContent=text;$('campaignStatus').style.color=bad?'#a43b3b':'#537b23'}
function statusLabel(v){return statuses[v]||statuses.rascunho}
function findCampaign(id){return campaigns.find(c=>c.id===id)}
function render(){
  $('campaignList').innerHTML=campaigns.length?campaigns.map(c=>{
    const pieces=c.assets||[];
    return `<article class="campaign-card"><h3>${esc(c.title)}</h3><div class="meta">${esc(c.product_name||'Sem produto vinculado')} · ${pieces.length} peças · ${pieces.filter(x=>x.status==='publicado').length} publicadas</div><p>${esc(c.notes||'')}</p><div class="actions">${link(c.drive_url,'Pasta Drive')} ${link(c.canva_url,'Canva')} ${c.product_slug?`<a href="/produtos/?produto=${encodeURIComponent(c.product_slug)}" target="_blank" rel="noopener">Ver produto ↗</a>`:''}<button type="button" class="btn alt" data-campaign="${esc(c.id)}">Abrir / editar</button></div></article>`;
  }).join(''):'<p class="empty">Nenhuma campanha cadastrada.</p>';
  const c=findCampaign(currentCampaign);
  $('campaignAssetEditor').hidden=!c;
  if(!c)return;
  $('campaignEditingName').textContent=c.title+' · '+(c.product_name||'Sem produto');
  $('campaignAssets').innerHTML=(c.assets||[]).map(a=>`<article class="campaign-asset"><strong>${esc(a.title)}</strong> <span class="pill">${esc(statusLabel(a.status))}</span><p class="meta">${esc(a.channel)} · ${esc(a.format)} ${a.date?'· '+esc(a.date):''}</p><p>${esc(a.caption||'Legenda ainda não cadastrada.')}</p><div class="actions">${link(a.drive_url,'Arquivo Drive')} ${link(a.canva_url,'Editar no Canva')} ${link(a.published_url,'Publicação')}<button type="button" class="btn alt" data-copy="${esc(a.id)}">Copiar legenda</button><button type="button" class="btn alt" data-asset="${esc(a.id)}">Editar</button></div></article>`).join('')||'<p class="empty">Adicione a primeira peça da campanha.</p>';
}
function resetCampaign(){currentCampaign=null;currentAsset=null;$('campaignForm').reset();$('campaignFormTitle').textContent='Nova campanha vinculada a produto';$('campaignAssetEditor').hidden=true;render()}
function editCampaign(c){currentCampaign=c.id;currentAsset=null;$('campaignFormTitle').textContent='Editar campanha';$('campaignProduct').value=c.product_name||'';$('campaignTitle').value=c.title||'';$('campaignDrive').value=c.drive_url||'';$('campaignCanva').value=c.canva_url||'';$('campaignNotes').value=c.notes||'';resetAsset();render();$('campaignAssetEditor').scrollIntoView({behavior:'smooth',block:'start'})}
function resetAsset(){currentAsset=null;$('campaignAssetForm').reset();$('assetStatus').value='rascunho'}
function editAsset(a){currentAsset=a.id;$('assetTitle').value=a.title||'';$('assetChannel').value=a.channel||'Instagram Feed';$('assetFormat').value=a.format||'';$('assetStatus').value=a.status||'rascunho';$('assetDrive').value=a.drive_url||'';$('assetCanva').value=a.canva_url||'';$('assetDate').value=a.date||'';$('assetPublished').value=a.published_url||'';$('assetCaption').value=a.caption||'';$('assetTitle').focus()}
async function persist(){if(busy)throw new Error('Outra gravação está em andamento');busy=true;try{await saveModuleState(KEY,campaigns)}finally{busy=false}}
async function searchProducts(term){if(term.trim().length<2)return;const {data,error}=await supabase.from('products').select('id,nome,slug').ilike('nome','%'+term.trim().replace(/[%_,]/g,' ')+'%').limit(20);if(error)throw error;productMatches=data||[];$('campaignProducts').innerHTML=productMatches.map(p=>`<option value="${esc(p.nome)}"></option>`).join('')}
let searchTimer;
$('campaignProduct').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>searchProducts($('campaignProduct').value).catch(e=>message(e.message,true)),350)});
$('campaignForm').addEventListener('submit',async e=>{
  e.preventDefault();const title=$('campaignTitle').value.trim();if(!title)return;
  const productName=$('campaignProduct').value.trim();const match=productMatches.find(p=>p.nome===productName);
  const previous=findCampaign(currentCampaign);
  const record={id:previous?.id||crypto.randomUUID(),product_id:match?.id||previous?.product_id||null,product_slug:match?.slug||previous?.product_slug||null,product_name:productName,title,drive_url:safeUrl($('campaignDrive').value),canva_url:safeUrl($('campaignCanva').value),notes:$('campaignNotes').value.trim(),assets:previous?.assets||[],updated_at:new Date().toISOString()};
  const old=structuredClone(campaigns);
  if(previous)Object.assign(previous,record);else campaigns.unshift(record);
  try{await persist();currentCampaign=record.id;resetAsset();render();message('Campanha salva.');}catch(error){campaigns=old;render();message('Erro ao salvar: '+error.message,true)}
});
$('campaignReset').addEventListener('click',resetCampaign);
$('campaignAssetForm').addEventListener('submit',async e=>{
  e.preventDefault();const c=findCampaign(currentCampaign);if(!c)return;
  const previous=(c.assets||[]).find(a=>a.id===currentAsset);
  const a={id:previous?.id||crypto.randomUUID(),title:$('assetTitle').value.trim(),channel:$('assetChannel').value,format:$('assetFormat').value.trim(),status:$('assetStatus').value,drive_url:safeUrl($('assetDrive').value),canva_url:safeUrl($('assetCanva').value),date:$('assetDate').value,published_url:safeUrl($('assetPublished').value),caption:$('assetCaption').value.trim()};
  if(!a.title||!a.format)return;
  const old=structuredClone(campaigns);
  if(previous)Object.assign(previous,a);else{c.assets||=[];c.assets.push(a)}
  c.updated_at=new Date().toISOString();
  try{await persist();resetAsset();render();message('Peça e legenda salvas.')}catch(error){campaigns=old;render();message('Erro ao salvar: '+error.message,true)}
});
$('assetReset').addEventListener('click',resetAsset);
$('campaignList').addEventListener('click',e=>{const btn=e.target.closest('[data-campaign]');if(!btn)return;const c=findCampaign(btn.dataset.campaign);if(c)editCampaign(c)});
$('campaignAssets').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  const c=findCampaign(currentCampaign);const a=c?.assets?.find(x=>x.id===(b.dataset.copy||b.dataset.asset));if(!a)return;
  if(b.dataset.asset){editAsset(a);return}
  try{await navigator.clipboard.writeText(a.caption||'');message('Legenda copiada.')}catch{message('Não foi possível copiar a legenda automaticamente.',true)}
});
try{const loaded=await loadModuleState(KEY,[]);campaigns=Array.isArray(loaded)?loaded:[];render()}catch(error){message('Não foi possível carregar campanhas: '+error.message,true)}
