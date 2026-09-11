import { loadPublicCatalog, loadPrimaryMedia, rootCategories, categoryChildren, descendantIds, categoryPath } from './public-catalog-data.js?v=20260910-2';

const root=document.querySelector('#catalogRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const plain=s=>{const d=document.createElement('div');d.innerHTML=String(s??'');return(d.textContent||'').replace(/\s+/g,' ').trim()};
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const params=new URLSearchParams(location.search);
let familySlug=params.get('familia')||'',categorySlug=params.get('categoria')||'';
let families=[],categories=[],services=[];
const quoteBase='https://wa.me/553230253588?text=';

function commercialPrice(p){
  const childCount=Number(p?.child_count||0);
  const commercial=Number(p?.commercial_min_price);
  if(childCount>0){
    if(Number.isFinite(commercial)&&commercial>0)return{label:`A partir de ${money(commercial)}`,consult:false,from:true};
    return{label:'Sob consulta',consult:true,from:false};
  }
  const own=Number(p?.preco);
  if(Number.isFinite(own)&&own>0)return{label:money(own),consult:false,from:false};
  return{label:'Sob consulta',consult:true,from:false};
}
function familyMedia(f){return f?.image_url||''}
function categoryMedia(c,f){return c?.image_url||familyMedia(f)||''}
function categoryServices(id){const ids=descendantIds(categories,id);return services.filter(s=>ids.has(s.catalog_category_id))}
function rootsForFamily(id){return rootCategories(categories,id)}
function childrenFor(id){return categoryChildren(categories,id)}
function setUrl(family='',category=''){const u=new URL(location.href);u.searchParams.delete('familia');u.searchParams.delete('categoria');if(family)u.searchParams.set('familia',family);if(category)u.searchParams.set('categoria',category);history.replaceState({},'',u.pathname+(u.search?u.search:''));familySlug=family;categorySlug=category}

function renderFamilyCard(f){
  const media=familyMedia(f),roots=rootsForFamily(f.id);
  return `<article class="sc-family-card" data-family-card="${esc(f.slug)}"><button type="button" class="sc-family-main" data-family-trigger="${esc(f.slug)}" aria-expanded="false" style="width:100%;padding:0;border:0;background:transparent;text-align:left;cursor:pointer"><div class="sc-family-media">${media?`<img src="${esc(media)}" alt="${esc(f.image_alt||f.nome)}" loading="lazy">`:''}</div><div class="sc-family-body"><h2>${esc(f.nome)}</h2><p>${esc(f.descricao||'Conheça as soluções desta área.')}</p><span class="sc-family-action">Ver ${roots.length} categoria(s) ↓</span></div></button><div class="sc-family-detail" data-family-detail></div></article>`;
}

function categoryCard(f,c){
  const media=categoryMedia(c,f),children=childrenFor(c.id);
  return `<article class="sc-category-mini"><a href="/servicos/?familia=${encodeURIComponent(f.slug)}&categoria=${encodeURIComponent(c.slug)}" style="text-decoration:none;color:inherit"><div class="sc-category-mini-media">${media?`<img src="${esc(media)}" alt="${esc(c.image_alt||c.nome)}" loading="lazy">`:''}</div><div class="sc-category-mini-copy"><strong>${esc(c.nome)}</strong><span>${esc(c.descricao||'Conheça as opções desta categoria.')}</span></div></a>${children.length?`<div style="padding:10px 14px 14px;display:flex;flex-wrap:wrap;gap:8px">${children.map(ch=>`<a class="sc-family-close" href="/servicos/?familia=${encodeURIComponent(f.slug)}&categoria=${encodeURIComponent(ch.slug)}" style="text-decoration:none">${esc(ch.nome)}</a>`).join('')}</div>`:''}</article>`;
}

function renderHome(){
  root.innerHTML=`<div class="service-catalog"><div class="sc-intro"><p class="sc-eyebrow">Croma Gráfica</p><h1>O que você quer produzir?</h1><p>Escolha uma área e navegue pelas categorias para chegar mais rápido ao material ou solução que precisa.</p></div><div class="sc-family-grid">${families.map(renderFamilyCard).join('')}</div></div>`;
  root.querySelectorAll('[data-family-trigger]').forEach(btn=>btn.addEventListener('click',()=>toggleFamily(btn.dataset.familyTrigger)));
  if(familySlug)requestAnimationFrame(()=>openFamily(familySlug,false));
}
function closeFamilies(update=true){root.querySelectorAll('[data-family-card]').forEach(card=>{card.classList.remove('is-expanded');card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','false');const d=card.querySelector('[data-family-detail]');if(d)d.innerHTML=''});if(update)setUrl('','')}
function toggleFamily(slug){const card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);if(card?.classList.contains('is-expanded'))closeFamilies();else openFamily(slug,true)}
function openFamily(slug,scroll=true){const f=families.find(x=>x.slug===slug),card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);if(!f||!card)return;closeFamilies(false);card.classList.add('is-expanded');card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','true');const roots=rootsForFamily(f.id),detail=card.querySelector('[data-family-detail]');detail.innerHTML=`<div class="sc-family-detail-head"><div><h3>${esc(f.nome)}</h3><p>Escolha uma categoria e, quando houver, refine pela subcategoria.</p></div><button type="button" class="sc-family-close" data-family-close>Fechar</button></div>${roots.length?`<div class="sc-category-strip">${roots.map(c=>categoryCard(f,c)).join('')}</div>`:'<div class="sc-empty">Não há categorias disponíveis nesta área no momento.</div>'}`;detail.querySelector('[data-family-close]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeFamilies()});setUrl(f.slug,'');if(scroll)requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'nearest'}))}

async function renderCategory(){
  const cat=categories.find(c=>c.slug===categorySlug),fam=families.find(f=>f.slug===familySlug)||families.find(f=>f.id===cat?.family_id);
  if(!cat||!fam){setUrl('','');renderHome();return}
  const ids=descendantIds(categories,cat.id),rows=services.filter(s=>ids.has(s.catalog_category_id));
  const media=await loadPrimaryMedia(rows.map(r=>r.id));
  const path=categoryPath(categories,families,cat.id),children=childrenFor(cat.id);
  const genericQuote=`${quoteBase}${encodeURIComponent(`Olá! Vim pelo site da Croma e gostaria de solicitar orçamento para ${cat.nome}.`)}`;
  root.innerHTML=`<div class="service-catalog"><div class="sc-breadcrumb"><a href="/">Início</a><span>›</span><a href="/servicos/">Serviços</a>${path.map((x,i)=>i===path.length-1?`<span>›</span><strong>${esc(x.nome)}</strong>`:`<span>›</span><a href="${i===0?`/servicos/?familia=${encodeURIComponent(fam.slug)}`:`/servicos/?familia=${encodeURIComponent(fam.slug)}&categoria=${encodeURIComponent(x.slug||'')}`}">${esc(x.nome)}</a>`).join('')}</div><section class="sc-family-hero">${familyMedia(fam)?`<img src="${esc(familyMedia(fam))}" alt="${esc(fam.image_alt||fam.nome)}">`:''}<div class="sc-family-hero-copy"><p class="sc-eyebrow">${esc(fam.nome)}</p><h1>${esc(cat.nome)}</h1><p>${esc(cat.descricao||'Consulte opções, formatos e possibilidades para esta categoria.')}</p></div></section>${children.length?`<div class="sc-sibling-grid">${children.map(c=>`<a class="sc-sibling-card" href="/servicos/?familia=${encodeURIComponent(fam.slug)}&categoria=${encodeURIComponent(c.slug)}"><div class="sc-sibling-copy"><strong>${esc(c.nome)}</strong><span>Explorar opções</span><i class="sc-sibling-arrow">→</i></div></a>`).join('')}</div>`:''}<div class="sc-category-heading"><h2>${rows.length?'Opções disponíveis':'Precisa desta solução?'}</h2><p>${rows.length?'Escolha uma opção abaixo ou fale com a Croma para um orçamento sob medida.':'Fale com a Croma para consultar materiais, medidas, quantidades e acabamentos disponíveis.'}</p></div>${rows.length?`<section class="sc-service-results"><div class="sc-services-grid">${rows.map(p=>{const m=media.get(p.id),desc=plain(p.short_description||p.descricao||'Solicite um orçamento para este serviço.'),price=commercialPrice(p),optionInfo=Number(p.child_count||0)>0?`<div class="sc-service-options">${Number(p.child_count)} opção(ões) cadastrada(s)</div>`:'';return `<article class="sc-service-card"><div class="sc-service-media">${m?.url?`<img src="${esc(m.url)}" alt="${esc(m.alt_text||p.nome)}" loading="lazy">`:''}</div><div class="sc-service-copy"><h4>${esc(p.nome)}</h4><p>${esc(desc)}</p>${optionInfo}<div class="sc-service-price ${price.consult?'is-consult':''}">${esc(price.label)}</div><a class="sc-cta" href="${quoteBase}${encodeURIComponent(`Olá! Vim pelo site da Croma e gostaria de ${price.consult?'consultar o valor':'solicitar orçamento'} para ${p.nome}.`)}" target="_blank" rel="noopener noreferrer">${price.consult?'Consultar pelo WhatsApp':'Solicitar orçamento'} →</a></div></article>`}).join('')}</div></section>`:`<div class="sc-empty"><p>Podemos orientar a melhor configuração para o seu projeto.</p><a class="sc-cta" href="${genericQuote}" target="_blank" rel="noopener noreferrer">Consultar pelo WhatsApp →</a></div>`}</div>`;
}

try{const data=await loadPublicCatalog('servico');families=data.families;categories=data.categories;services=data.items;if(categorySlug)await renderCategory();else renderHome()}catch(e){console.error('Falha ao carregar catálogo público de serviços.',e);root.innerHTML='<div class="service-catalog"><div class="sc-empty">Não foi possível carregar os serviços agora.</div></div>'}
