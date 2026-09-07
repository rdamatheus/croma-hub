import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('auth');

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const FALLBACK='https://images.pexels.com/photos/8490095/pexels-photo-8490095.jpeg?auto=compress&cs=tinysrgb&w=1200';
const slugify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const fmtBytes=value=>{const n=Number(value||0);if(!n)return '—';const u=['B','KB','MB','GB','TB'];let i=0,v=n;while(v>=1024&&i<u.length-1){v/=1024;i++}return `${v.toLocaleString('pt-BR',{maximumFractionDigits:i?1:0})} ${u[i]}`};

let rows=[];
let categories=[];
let segments=[];
let media=[];
let batches=[];
let editing=null;

const categoryMap=()=>new Map(categories.map(x=>[x.id,x]));
const segmentMap=()=>new Map(segments.map(x=>[x.id,x]));

function updatePreview(){
  $('preview').src=$('imageUrl').value.trim()||FALLBACK;
  $('preview').alt=$('imageAlt').value.trim()||$('title').value.trim()||'Prévia';
}

function fillTaxonomy(){
  const serviceCategories=categories.filter(x=>x.catalog_scope!=='produto');
  $('categoryId').innerHTML='<option value="">Sem categoria</option>'+serviceCategories.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  $('segmentId').innerHTML='<option value="">Sem segmento</option>'+segments.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join('');
}

function renderItems(){
  const q=$('search').value.trim().toLowerCase();
  const cm=categoryMap(),sm=segmentMap();
  const data=rows.filter(x=>!q||[x.title,x.slug,x.description,cm.get(x.category_id)?.nome,sm.get(x.segment_id)?.nome].some(v=>String(v||'').toLowerCase().includes(q)));
  $('list').innerHTML=data.map(x=>`<article class="item"><img src="${esc(x.image_url)}" alt="${esc(x.image_alt||x.title)}" loading="lazy"><div class="body"><div class="name">${esc(x.title)}</div><div class="muted">${x.is_reference?'Imagem de referência':'Trabalho real'} · ${x.active?'ativo':'inativo'}</div><div class="muted">${esc(cm.get(x.category_id)?.nome||'Sem categoria')} · ${esc(sm.get(x.segment_id)?.nome||'Sem segmento')}</div><div style="margin-top:9px"><button class="btn light" data-edit="${x.id}">Editar</button></div></div></article>`).join('')||'<p class="muted">Nenhum item encontrado.</p>';
}

function batchStatus(value){return({pending:'Pendente',processing:'Processando',blocked:'Bloqueado',completed:'Concluído',failed:'Falhou'})[value]||value}
function renderBatches(){
  $('batchList').innerHTML=batches.map(x=>`<article class="media-row"><div><strong>${esc(x.source_name)}</strong><div class="muted">${batchStatus(x.status)} · ${fmtBytes(x.source_size_bytes)}</div>${x.notes?`<div class="muted">${esc(x.notes)}</div>`:''}</div><div class="pill ${esc(x.status)}">${esc(batchStatus(x.status))}</div></article>`).join('')||'<p class="muted">Nenhum lote registrado.</p>';
}

function renderMedia(){
  const itemMap=new Map(rows.map(x=>[x.id,x]));
  $('mediaList').innerHTML=media.map(x=>`<article class="media-row"><div class="media-thumb">${x.public_url?`<img src="${esc(x.public_url)}" alt="${esc(x.image_alt||x.original_filename)}" loading="lazy">`:'<span>sem prévia</span>'}</div><div class="media-info"><strong>${esc(x.original_filename)}</strong><div class="muted">${esc(x.mime_type||'formato não informado')} · ${fmtBytes(x.byte_size)} · ${esc(x.status)}</div><div class="muted">${x.portfolio_item_id?`Vinculada a: ${esc(itemMap.get(x.portfolio_item_id)?.title||'trabalho')}`:'Ainda não vinculada'}</div><div class="actions compact">${editing&&x.public_url?`<button class="btn light" data-link-media="${x.id}">Vincular ao trabalho aberto</button><button class="btn light" data-cover-media="${x.id}">Usar como capa</button>`:''}</div></div></article>`).join('')||'<p class="muted">Ainda não há mídias importadas. O lote do Drive está registrado abaixo e aguardando uma origem que possa ser lida pelo importador.</p>';
}

async function loadAll(){
  const [itemsResult,categoriesResult,segmentsResult,mediaResult,batchesResult]=await Promise.all([
    supabase.from('portfolio_items').select('*').order('sort_order').order('title'),
    supabase.from('catalog_categories').select('id,nome,parent_id,catalog_scope,ativo').eq('ativo',true).order('nome'),
    supabase.from('catalog_segments').select('id,nome,parent_id,ativo').eq('ativo',true).order('nome'),
    supabase.from('portfolio_media').select('*').order('created_at',{ascending:false}).limit(200),
    supabase.from('portfolio_import_batches').select('*').order('created_at',{ascending:false}).limit(20)
  ]);
  for(const r of [itemsResult,categoriesResult,segmentsResult,mediaResult,batchesResult])if(r.error)throw r.error;
  rows=itemsResult.data||[];
  categories=categoriesResult.data||[];
  segments=segmentsResult.data||[];
  media=mediaResult.data||[];
  batches=batchesResult.data||[];
  fillTaxonomy();renderItems();renderMedia();renderBatches();
}

function reset(){
  editing=null;
  $('formTitle').textContent='Novo trabalho';
  for(const id of ['title','slug','description','imageUrl','imageAlt','credit','sourceUrl'])$(id).value='';
  $('categoryId').value='';$('segmentId').value='';$('sourceType').value='propria';$('sortOrder').value='0';
  $('reference').checked=false;$('featured').checked=false;$('active').checked=true;
  $('del').style.display='none';$('status').textContent='';
  updatePreview();renderMedia();
}

function edit(id){
  editing=rows.find(x=>x.id===id);if(!editing)return;
  $('formTitle').textContent='Editar trabalho';
  $('title').value=editing.title||'';$('slug').value=editing.slug||'';$('description').value=editing.description||'';
  $('categoryId').value=editing.category_id||'';$('segmentId').value=editing.segment_id||'';
  $('imageUrl').value=editing.image_url||'';$('imageAlt').value=editing.image_alt||'';$('sourceType').value=editing.image_source_type||'propria';
  $('credit').value=editing.image_credit||'';$('sourceUrl').value=editing.image_source_url||'';$('sortOrder').value=editing.sort_order||0;
  $('reference').checked=!!editing.is_reference;$('featured').checked=!!editing.featured;$('active').checked=!!editing.active;
  $('del').style.display='inline-block';updatePreview();renderMedia();scrollTo({top:0,behavior:'smooth'});
}

async function save(){
  $('status').className='status';$('status').textContent='Salvando...';
  try{
    const row={
      title:$('title').value.trim(),slug:$('slug').value.trim()||slugify($('title').value),description:$('description').value.trim()||null,
      category_id:$('categoryId').value||null,segment_id:$('segmentId').value||null,image_url:$('imageUrl').value.trim(),image_alt:$('imageAlt').value.trim()||null,
      image_source_type:$('sourceType').value,image_credit:$('credit').value.trim()||null,image_source_url:$('sourceUrl').value.trim()||null,
      is_reference:$('reference').checked,featured:$('featured').checked,active:$('active').checked,sort_order:Number($('sortOrder').value)||0,updated_at:new Date().toISOString()
    };
    if(!row.title||!row.image_url)throw new Error('Informe título e foto de capa.');
    const r=editing?await supabase.from('portfolio_items').update(row).eq('id',editing.id):await supabase.from('portfolio_items').insert(row);
    if(r.error)throw r.error;
    await loadAll();reset();$('status').className='status ok';$('status').textContent='Trabalho salvo.';
  }catch(e){$('status').className='status bad';$('status').textContent=e.message}
}

async function linkMedia(id,asCover=false){
  if(!editing)return;
  const m=media.find(x=>x.id===id);if(!m?.public_url)return;
  $('mediaStatus').textContent=asCover?'Definindo capa...':'Vinculando mídia...';
  try{
    if(asCover){
      const clear=await supabase.from('portfolio_media').update({is_cover:false}).eq('portfolio_item_id',editing.id);if(clear.error)throw clear.error;
    }
    const upd=await supabase.from('portfolio_media').update({portfolio_item_id:editing.id,status:'linked',active:true,is_cover:asCover}).eq('id',id);if(upd.error)throw upd.error;
    if(asCover){
      const cover=await supabase.from('portfolio_items').update({image_url:m.public_url,image_alt:m.image_alt||editing.image_alt||editing.title,updated_at:new Date().toISOString()}).eq('id',editing.id);if(cover.error)throw cover.error;
    }
    await loadAll();editing=rows.find(x=>x.id===editing.id)||editing;edit(editing.id);$('mediaStatus').textContent=asCover?'Capa atualizada.':'Mídia vinculada.';
  }catch(e){$('mediaStatus').textContent=e.message}
}

$('title').oninput=()=>{if(!editing&&!$('slug').value)$('slug').value=slugify($('title').value);updatePreview()};
$('imageUrl').oninput=$('imageAlt').oninput=updatePreview;
$('search').oninput=renderItems;
$('list').onclick=e=>{const b=e.target.closest('[data-edit]');if(b)edit(b.dataset.edit)};
$('mediaList').onclick=e=>{const link=e.target.closest('[data-link-media]');const cover=e.target.closest('[data-cover-media]');if(link)linkMedia(link.dataset.linkMedia,false);if(cover)linkMedia(cover.dataset.coverMedia,true)};
$('newBtn').onclick=reset;
$('save').onclick=save;
$('del').onclick=async()=>{if(!editing||!confirm('Excluir este trabalho do portfólio? As mídias vinculadas serão preservadas e voltarão a ficar sem trabalho.'))return;const r=await supabase.from('portfolio_items').delete().eq('id',editing.id);if(r.error){$('status').className='status bad';$('status').textContent=r.error.message;return}await loadAll();reset()};

await loadAll();
reset();
