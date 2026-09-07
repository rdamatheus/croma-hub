import { loadPublicCatalog, loadPrimaryMedia, rootCategories, categoryChildren, descendantIds, categoryPath } from './public-catalog-data.js?v=20260907-2';

const root=document.querySelector('#productCatalogRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const PAGE_SIZE=48;
const params=new URLSearchParams(location.search);
let families=[],categories=[],products=[],page=1,selectedCategory='',searchTerm=(params.get('q')||'').trim().toLowerCase();
const selectedProductRef=(params.get('produto')||'').trim();
const mediaCache=new Map();

function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function familyMedia(f){return f?.image_url||''}
function categoryMedia(c,f){return c?.image_url||familyMedia(f)||''}
function itemsForCategory(id){const ids=descendantIds(categories,id);return products.filter(p=>ids.has(p.catalog_category_id))}
function categoryHasItems(id){return itemsForCategory(id).length>0}
function productRef(p){return p.slug||p.id}
function productHref(p){return `/produtos/?produto=${encodeURIComponent(productRef(p))}`}
function setUrl(family='',category=''){
  const u=new URL(location.href);u.searchParams.delete('familia');u.searchParams.delete('categoria');u.searchParams.delete('produto');
  if(family)u.searchParams.set('familia',family);if(category)u.searchParams.set('categoria',category);
  history.replaceState({},'',u.pathname+(u.search?u.search:''));
}
function visibleRoots(familyId){return rootCategories(categories,familyId).filter(c=>categoryHasItems(c.id))}
function visibleChildren(parentId){return categoryChildren(categories,parentId).filter(c=>categoryHasItems(c.id))}

function hierarchyMarkup(f){
  const roots=visibleRoots(f.id);
  if(!roots.length)return '<div class="public-empty">Nenhum item disponível nesta família no momento.</div>';
  return `<div class="public-card-grid">${roots.map(cat=>{const media=categoryMedia(cat,f),children=visibleChildren(cat.id);return `<article class="public-card" style="padding:0;text-align:left"><button type="button" class="public-family-trigger" data-category-id="${cat.id}" data-category-slug="${esc(cat.slug)}" style="width:100%;border:0;background:transparent;text-align:left;padding:0;cursor:pointer"><div class="public-card-media">${media?`<img src="${esc(media)}" alt="${esc(cat.image_alt||cat.nome)}" loading="lazy">`:''}</div><div class="public-card-copy"><h3>${esc(cat.nome)}</h3><p>${esc(cat.descricao||'Ver produtos desta categoria.')}</p><span class="public-family-action">${itemsForCategory(cat.id).length} item(ns)</span></div></button>${children.length?`<div style="padding:0 18px 18px;display:flex;flex-wrap:wrap;gap:8px">${children.map(child=>`<button class="public-close" type="button" data-category-id="${child.id}" data-category-slug="${esc(child.slug)}">${esc(child.nome)}</button>`).join('')}</div>`:''}</article>`}).join('')}</div>`;
}

function familyCard(f){
  const media=familyMedia(f),count=products.filter(p=>categories.some(c=>c.id===p.catalog_category_id&&c.family_id===f.id)).length;
  return `<article class="public-family-card" data-family-card="${esc(f.slug)}"><button type="button" class="public-family-trigger" data-family-trigger="${esc(f.slug)}" aria-expanded="false"><div class="public-family-media">${media?`<img src="${esc(media)}" alt="${esc(f.image_alt||f.nome)}" loading="lazy">`:''}</div><div class="public-family-copy"><h2>${esc(f.nome)}</h2><p>${esc(f.descricao||'Conheça as categorias desta família.')}</p><span class="public-family-action">${count} item(ns) ↓</span></div></button><div class="public-family-detail" data-family-detail></div></article>`;
}

async function renderProductDetail(product){
  await ensureMedia([product.id]);
  const media=mediaCache.get(product.id),path=categoryPath(categories,families,product.catalog_category_id),backHref='/produtos/';
  root.innerHTML=`
    <div class="public-breadcrumb"><a href="/">Início</a><span>›</span><a href="${backHref}">Produtos</a>${path.length?`<span>›</span><span>${esc(path.map(x=>x.nome).join(' › '))}</span>`:''}<span>›</span><strong>${esc(product.nome)}</strong></div>
    <section class="public-editorial-hero" style="align-items:start">
      <div>${media?.url?`<img src="${esc(media.url)}" alt="${esc(media.alt_text||product.nome)}" loading="eager" referrerpolicy="no-referrer">`:'<div class="public-card-media" style="border-radius:20px;min-height:320px"></div>'}</div>
      <div>
        <span class="public-eyebrow">${esc(path.slice(1).map(x=>x.nome).join(' › ')||'Produto Croma')}</span>
        <h1 style="color:var(--pc-deep);font-size:clamp(2rem,4vw,3.8rem);line-height:1.02;margin:10px 0 14px">${esc(product.nome)}</h1>
        ${product.sku?`<p class="tx-meta">SKU ${esc(product.sku)}</p>`:''}
        ${Number(product.preco)>0?`<p class="public-price" style="font-size:1.55rem!important;margin:16px 0!important">${esc(money(product.preco))}</p>`:''}
        <p class="public-lead">${esc(product.short_description||product.descricao||'Consulte disponibilidade e condições deste produto com a Croma.')}</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px"><a class="public-cta" href="${backHref}">← Voltar aos produtos</a></div>
      </div>
    </section>`;
  document.title=`${product.nome} | Croma Papelaria & Presentes`;
}

function renderShell(){
  const familyList=families.filter(f=>visibleRoots(f.id).length);
  root.innerHTML=`<div class="public-breadcrumb"><a href="/">Início</a><span>›</span><strong>Produtos</strong></div><div class="public-intro"><span class="public-eyebrow">Croma Papelaria & Presentes</span><h1>Produtos</h1><p class="public-lead">Papelaria, presentes e itens criativos organizados por família, categoria e subcategoria para você encontrar mais rápido.</p></div><section><div class="public-family-grid">${familyList.map(familyCard).join('')||'<div class="public-empty">O catálogo de produtos está sendo atualizado.</div>'}</div></section><section class="public-section"><div class="public-section-head"><div><span class="public-eyebrow">Busca</span><h2 class="public-section-title">Encontre um produto</h2><p>Pesquise pelo nome ou navegue pelas categorias acima.</p></div><input class="public-search" id="productSearch" type="search" placeholder="Buscar produto"></div><div id="productResults"></div></section>`;
  root.querySelectorAll('[data-family-trigger]').forEach(b=>b.addEventListener('click',()=>toggleFamily(b.dataset.familyTrigger)));
  const search=root.querySelector('#productSearch');search.value=searchTerm;search.addEventListener('input',()=>{searchTerm=search.value.trim().toLowerCase();page=1;renderProducts()});
  const current=new URLSearchParams(location.search),familySlug=current.get('familia')||'',catSlug=current.get('categoria')||'';
  if(catSlug){const cat=categories.find(c=>c.slug===catSlug);if(cat){selectedCategory=cat.id;const fam=families.find(f=>f.id===cat.family_id);if(fam)requestAnimationFrame(()=>openFamily(fam.slug,false))}}else if(familySlug)requestAnimationFrame(()=>openFamily(familySlug,false));
  renderProducts();
}

function closeFamilies(update=true){root.querySelectorAll('[data-family-card]').forEach(card=>{card.classList.remove('is-expanded');card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','false');const detail=card.querySelector('[data-family-detail]');if(detail)detail.innerHTML=''});if(update){selectedCategory='';setUrl('','');renderProducts()}}
function toggleFamily(slug){const card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);if(card?.classList.contains('is-expanded'))closeFamilies();else openFamily(slug,true)}
function openFamily(slug,scroll=true){const f=families.find(x=>x.slug===slug),card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);if(!f||!card)return;closeFamilies(false);card.classList.add('is-expanded');card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','true');const detail=card.querySelector('[data-family-detail]');detail.innerHTML=`<div class="public-family-detail-head"><div><h3>${esc(f.nome)}</h3><p>Escolha uma categoria ou subcategoria.</p></div><button class="public-close" type="button" data-family-close>Fechar</button></div>${hierarchyMarkup(f)}`;detail.querySelector('[data-family-close]')?.addEventListener('click',e=>{e.stopPropagation();closeFamilies()});detail.querySelectorAll('[data-category-id]').forEach(b=>b.addEventListener('click',()=>selectCategory(f,b.dataset.categoryId,b.dataset.categorySlug)));setUrl(f.slug,'');if(scroll)requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'nearest'}))}
function selectCategory(f,id,slug){selectedCategory=id;page=1;searchTerm='';const search=root.querySelector('#productSearch');if(search)search.value='';setUrl(f.slug,slug);renderProducts();root.querySelector('#productResults')?.scrollIntoView({behavior:'smooth',block:'start'})}

async function ensureMedia(ids){const missing=ids.filter(id=>!mediaCache.has(id));if(!missing.length)return;const map=await loadPrimaryMedia(missing);for(const id of missing)mediaCache.set(id,map.get(id)||null)}

async function renderProducts(){
  const box=root.querySelector('#productResults');if(!box)return;let rows=products;
  if(selectedCategory){const allowed=descendantIds(categories,selectedCategory);rows=rows.filter(p=>allowed.has(p.catalog_category_id))}
  if(searchTerm)rows=rows.filter(p=>[p.nome,p.sku].some(v=>String(v||'').toLowerCase().includes(searchTerm)));
  const total=rows.length,pages=Math.max(1,Math.ceil(total/PAGE_SIZE));if(page>pages)page=pages;const shown=rows.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);box.innerHTML='<div class="public-empty">Carregando produtos...</div>';
  try{
    await ensureMedia(shown.map(p=>p.id));
    const selectedPath=selectedCategory?categoryPath(categories,families,selectedCategory).map(x=>x.nome).join(' → '):'';
    box.innerHTML=`<div style="display:flex;justify-content:space-between;gap:12px;align-items:center;margin:0 0 14px"><div><strong style="color:var(--pc-deep)">${total} produto(s)</strong>${selectedPath?`<div class="tx-meta">${esc(selectedPath)}</div>`:''}</div>${selectedCategory?'<button type="button" class="public-close" id="clearProductCategory">Limpar categoria</button>':''}</div>${shown.length?`<div class="public-card-grid">${shown.map(p=>{const m=mediaCache.get(p.id),path=categoryPath(categories,families,p.catalog_category_id).map(x=>x.nome);return `<a class="public-card" href="${productHref(p)}" aria-label="Ver ${esc(p.nome)}" style="display:block;text-decoration:none;color:inherit;cursor:pointer"><div class="public-card-media">${m?.url?`<img src="${esc(m.url)}" alt="${esc(m.alt_text||p.nome)}" loading="lazy" referrerpolicy="no-referrer">`:''}</div><div class="public-card-copy"><span class="public-eyebrow">${esc(path.slice(1).join(' › '))}</span><h3>${esc(p.nome)}</h3>${Number(p.preco)>0?`<p class="public-price">${esc(money(p.preco))}</p>`:''}<span class="public-family-action">Ver produto →</span></div></a>`}).join('')}</div>`:'<div class="public-empty">Nenhum produto encontrado.</div>'}${pages>1?`<div style="display:flex;justify-content:center;gap:10px;align-items:center;margin-top:24px"><button class="public-close" type="button" id="prevProductPage" ${page<=1?'disabled':''}>Anterior</button><span>Página ${page} de ${pages}</span><button class="public-close" type="button" id="nextProductPage" ${page>=pages?'disabled':''}>Próxima</button></div>`:''}`;
    box.querySelector('#clearProductCategory')?.addEventListener('click',()=>{selectedCategory='';page=1;setUrl('','');renderProducts()});box.querySelector('#prevProductPage')?.addEventListener('click',()=>{if(page>1){page--;renderProducts();box.scrollIntoView({behavior:'smooth',block:'start'})}});box.querySelector('#nextProductPage')?.addEventListener('click',()=>{if(page<pages){page++;renderProducts();box.scrollIntoView({behavior:'smooth',block:'start'})}});
  }catch(e){console.error(e);box.innerHTML='<div class="public-empty">Não foi possível carregar os produtos agora.</div>'}
}

try{
  const data=await loadPublicCatalog('produto');families=data.families;categories=data.categories;products=data.items;
  if(selectedProductRef){
    const product=products.find(p=>String(p.slug||'')===selectedProductRef||String(p.id)===selectedProductRef);
    if(product)await renderProductDetail(product);
    else{root.innerHTML='<div class="public-empty">Produto não encontrado. <a href="/produtos/">Voltar ao catálogo</a>.</div>';document.title='Produto não encontrado | Croma'}
  }else renderShell();
}catch(e){console.error('Falha ao carregar catálogo público de produtos.',e);root.innerHTML='<div class="public-empty">Não foi possível carregar os produtos agora. Tente novamente em instantes.</div>'}
