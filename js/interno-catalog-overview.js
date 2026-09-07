import { protectInternalPage } from './interno-auth.js';
import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const PAGE_SIZE=1000;
let families=[],categories=[],products=[],segments=[],links=[];

async function fetchPaged(build){
  const rows=[];
  for(let from=0;;from+=PAGE_SIZE){
    const {data,error}=await build().range(from,from+PAGE_SIZE-1);
    if(error)throw error;
    const chunk=data||[];rows.push(...chunk);if(chunk.length<PAGE_SIZE)break;
  }
  return rows;
}
function familyName(id){return families.find(f=>f.id===id)?.nome||'Sem família'}
function categoryName(id){return categories.find(c=>c.id===id)?.nome||'Sem categoria'}
function categoryPath(id){
  const c=categories.find(x=>x.id===id);if(!c)return'Sem categoria';
  const p=c.parent_id?categories.find(x=>x.id===c.parent_id):null;
  return [familyName(c.family_id),p?.nome,c.nome].filter(Boolean).join(' › ');
}
function statusLabel(p){
  if(p.is_input)return'Insumo interno';
  if(!p.is_sellable)return'Não vendável';
  if(p.published_on_site)return'Publicado';
  return'Não publicado';
}
function filteredProducts(){
  const scope=document.querySelector('#scopeFilter')?.value||'';
  const visibility=document.querySelector('#visibilityFilter')?.value||'';
  const q=(document.querySelector('#catalogSearch')?.value||'').trim().toLowerCase();
  return products.filter(p=>{
    if(scope&&p.product_type!==scope)return false;
    if(visibility==='public'&&!(p.published_on_site&&p.is_sellable&&!p.is_input))return false;
    if(visibility==='internal'&&!p.is_input)return false;
    if(visibility==='unpublished'&&p.published_on_site)return false;
    if(q&&![p.nome,p.sku,categoryPath(p.catalog_category_id)].some(v=>String(v||'').toLowerCase().includes(q)))return false;
    return true;
  });
}
function renderKpis(){
  const publicItems=products.filter(p=>p.published_on_site&&p.is_sellable&&!p.is_input).length;
  const internal=products.filter(p=>p.is_input).length;
  document.querySelector('#productsCount').textContent=String(products.filter(p=>p.product_type==='produto').length);
  document.querySelector('#servicesCount').textContent=String(products.filter(p=>p.product_type==='servico').length);
  document.querySelector('#categoriesCount').textContent=String(categories.length);
  document.querySelector('#publicCount').textContent=String(publicItems);
  document.querySelector('#internalCount').textContent=String(internal);
}
function renderTree(){
  const root=document.querySelector('#categoryTree');if(!root)return;
  const rows=filteredProducts();
  const roots=categories.filter(c=>!c.parent_id).sort((a,b)=>(a.catalog_scope||'').localeCompare(b.catalog_scope||'')||(a.ordem||0)-(b.ordem||0)||a.nome.localeCompare(b.nome,'pt-BR'));
  const html=[];
  for(const f of families){
    const familyRoots=roots.filter(c=>c.family_id===f.id);
    if(!familyRoots.length)continue;
    html.push(`<section class="tree-node depth-0"><div class="tree-title"><strong>${esc(f.nome)}</strong><span>${esc(f.catalog_scope)}</span></div></section>`);
    for(const c of familyRoots){
      const children=categories.filter(x=>x.parent_id===c.id).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||a.nome.localeCompare(b.nome,'pt-BR'));
      const ids=new Set([c.id,...children.map(x=>x.id)]),count=rows.filter(p=>ids.has(p.catalog_category_id)).length;
      html.push(`<article class="tree-node depth-1"><div class="tree-title"><span>${esc(c.nome)}</span><a href="/interno/categorias/">Editar</a></div><div class="tree-sub">${c.public_visible?'pública':'oculta'} · ${count} item(ns)</div></article>`);
      for(const child of children){
        const childRows=rows.filter(p=>p.catalog_category_id===child.id);
        html.push(`<article class="tree-node depth-2"><div class="tree-title"><span>${esc(child.nome)}</span><a href="/interno/categorias/">Editar</a></div><div class="tree-sub">${child.public_visible?'pública':'oculta'} · ${childRows.length} item(ns)</div>${childRows.length?`<div class="catalog-tags">${childRows.slice(0,10).map(p=>`<span class="catalog-tag">${esc(p.nome)} · ${esc(statusLabel(p))}</span>`).join('')}${childRows.length>10?`<span class="catalog-tag off">+${childRows.length-10}</span>`:''}</div>`:''}</article>`);
      }
    }
  }
  root.innerHTML=html.join('')||'<div class="empty">Nada encontrado.</div>';
}
function renderSegments(){
  const root=document.querySelector('#segmentTree');if(!root)return;
  const q=(document.querySelector('#segSearch')?.value||'').trim().toLowerCase();
  const rows=segments.filter(s=>!q||[s.nome,s.slug].some(v=>String(v||'').toLowerCase().includes(q)));
  root.innerHTML=rows.map(s=>{const ids=new Set(links.filter(x=>x.segment_id===s.id).map(x=>x.product_id)),ps=products.filter(p=>ids.has(p.id));return `<article class="tree-node"><div class="tree-title"><span>${esc(s.nome)}</span><a href="/interno/segmentos/">Editar</a></div><div class="tree-sub">${s.ativo?'ativo':'inativo'} · ${ps.length} item(ns)</div></article>`}).join('')||'<div class="empty">Nada encontrado.</div>';
}

try{
  const session=await protectInternalPage({roles:['owner','manager']});
  if(session){
    const [f,c,p,s,l]=await Promise.all([
      supabase.from('catalog_families').select('*').eq('ativo',true).order('catalog_scope').order('ordem'),
      supabase.from('catalog_categories').select('*').order('catalog_scope').order('ordem').order('nome'),
      fetchPaged(()=>supabase.from('products').select('id,nome,sku,product_type,catalog_category_id,ativo,published_on_site,is_sellable,is_input,bling_product_id').order('nome')),
      supabase.from('catalog_segments').select('*').order('home_order').order('nome'),
      fetchPaged(()=>supabase.from('product_segments').select('product_id,segment_id'))
    ]);
    for(const r of [f,c,s])if(r.error)throw r.error;
    families=f.data||[];categories=c.data||[];products=p;segments=s.data||[];links=l;
    renderKpis();renderTree();renderSegments();
    ['scopeFilter','visibilityFilter','catalogSearch'].forEach(id=>document.querySelector(`#${id}`)?.addEventListener('input',renderTree));
    document.querySelector('#segSearch')?.addEventListener('input',renderSegments);
  }
}catch(e){const el=document.querySelector('#pageError');if(el){el.hidden=false;el.textContent='Não foi possível carregar: '+(e.message||e)}}
