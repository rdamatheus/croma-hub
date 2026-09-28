import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('auth');

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let rows=[];
let editing=null;

function toLocalInput(value){
  if(!value)return'';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return'';
  const pad=n=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function toIso(value){return value?new Date(value).toISOString():null}
function setStatus(text='',type=''){const el=$('status');el.textContent=text;el.className=`status${type?' '+type:''}`}

function updatePreview(){
  const image=$('imageDesktop').value.trim();
  const preview=$('preview');
  preview.style.backgroundImage=image?`linear-gradient(90deg,rgba(12,20,42,.82),rgba(20,19,64,.34)),url("${image.replaceAll('"','%22')}")`:'';
  $('previewEyebrow').textContent=$('eyebrow').value.trim()||'VITRINE CROMA';
  $('previewTitle').textContent=$('title').value.trim()||'Seu próximo banner aparece aqui.';
  $('previewSubtitle').textContent=$('subtitle').value.trim()||'Preencha os campos ao lado para visualizar a chamada.';
  $('previewCta').textContent=$('ctaLabel').value.trim()||'Ver mais';
  $('previewCta').href=$('targetUrl').value.trim()||'#';
}

function stateLabel(row){
  if(!row.active)return'Inativo';
  const now=Date.now(),start=row.starts_at?new Date(row.starts_at).getTime():null,end=row.ends_at?new Date(row.ends_at).getTime():null;
  if(start&&start>now)return'Agendado';
  if(end&&end<=now)return'Encerrado';
  return'Ativo agora';
}
function renderList(){
  $('list').innerHTML=rows.length?rows.map(row=>`<article class="item"><div><div><strong>${esc(row.name)}</strong> <span class="pill ${stateLabel(row)==='Ativo agora'?'on':''}">${esc(stateLabel(row))}</span></div><div class="muted">${esc(row.title)} · ${esc(row.target_type)}${row.target_ref?` · ${esc(row.target_ref)}`:''}</div><div class="muted">Destino: ${esc(row.target_url||'sem link')} · ordem ${Number(row.display_order||0)}</div></div><div class="item-actions"><button class="btn light" type="button" data-edit="${row.id}">Editar</button></div></article>`).join(''):'<p class="muted">Nenhum banner cadastrado ainda.</p>';
  $('list').querySelectorAll('[data-edit]').forEach(button=>button.addEventListener('click',()=>edit(button.dataset.edit)));
}

async function load(){
  const {data,error}=await supabase.from('site_banners').select('*').order('display_order').order('created_at',{ascending:false});
  if(error)throw error;
  rows=data||[];renderList();
}
function reset(){
  editing=null;$('formTitle').textContent='Novo banner';
  for(const id of ['name','eyebrow','title','subtitle','imageDesktop','imageMobile','ctaLabel','targetRef','targetUrl','startsAt','endsAt'])$(id).value='';
  $('targetType').value='page';$('displayOrder').value='0';$('active').checked=false;setStatus();updatePreview();
}
function edit(id){
  const row=rows.find(x=>x.id===id);if(!row)return;
  editing=row;$('formTitle').textContent='Editar banner';
  $('name').value=row.name||'';$('eyebrow').value=row.eyebrow||'';$('title').value=row.title||'';$('subtitle').value=row.subtitle||'';
  $('imageDesktop').value=row.image_desktop_url||'';$('imageMobile').value=row.image_mobile_url||'';$('ctaLabel').value=row.cta_label||'';
  $('targetType').value=row.target_type||'page';$('targetRef').value=row.target_ref||'';$('targetUrl').value=row.target_url||'';
  $('startsAt').value=toLocalInput(row.starts_at);$('endsAt').value=toLocalInput(row.ends_at);$('displayOrder').value=String(row.display_order||0);$('active').checked=Boolean(row.active);
  setStatus();updatePreview();scrollTo({top:0,behavior:'smooth'});
}
async function save(){
  const name=$('name').value.trim(),title=$('title').value.trim(),targetUrl=$('targetUrl').value.trim();
  if(!name||!title){setStatus('Informe o nome interno e o título do banner.','bad');return}
  if(targetUrl&&!/^(https?:\/\/|\/)/i.test(targetUrl)){setStatus('A URL final precisa começar com / ou http(s)://.','bad');return}
  const starts=toIso($('startsAt').value),ends=toIso($('endsAt').value);
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus('O fim precisa ser posterior ao início.','bad');return}
  const payload={name,placement:'home_hero',eyebrow:$('eyebrow').value.trim()||null,title,subtitle:$('subtitle').value.trim()||null,image_desktop_url:$('imageDesktop').value.trim()||null,image_mobile_url:$('imageMobile').value.trim()||null,cta_label:$('ctaLabel').value.trim()||null,target_type:$('targetType').value,target_ref:$('targetRef').value.trim()||null,target_url:targetUrl||null,starts_at:starts,ends_at:ends,display_order:Number($('displayOrder').value||0),active:$('active').checked,updated_by:session.user.id,updated_at:new Date().toISOString()};
  setStatus('Salvando...');
  let result;
  if(editing)result=await supabase.from('site_banners').update(payload).eq('id',editing.id).select().single();
  else result=await supabase.from('site_banners').insert({...payload,created_by:session.user.id}).select().single();
  if(result.error){console.error(result.error);setStatus(result.error.message||'Não foi possível salvar.','bad');return}
  setStatus('Banner salvo.','ok');await load();edit(result.data.id);
}

for(const id of ['name','eyebrow','title','subtitle','imageDesktop','ctaLabel','targetUrl'])$(id)?.addEventListener('input',updatePreview);
$('save').addEventListener('click',save);$('newBtn').addEventListener('click',reset);
reset();
try{await load();document.body.hidden=false}catch(error){console.error('vitrine_load_error',error);document.body.hidden=false;setStatus('Não foi possível carregar os banners.','bad')}
