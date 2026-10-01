import { loadPublicCatalogMeta, loadPublicCatalogItems, loadPublicCatalogItem, loadPrimaryMedia, rootCategories, categoryChildren, descendantIds, categoryPath } from './public-catalog-data.js?v=20260923-1';
import { mountPublicItemConfigurator } from './public-item-configurator.js?v=20260930-1';

const root=document.querySelector('#catalogRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const plain=s=>{const d=document.createElement('div');d.innerHTML=String(s??'');return(d.textContent||'').replace(/\s+/g,' ').trim()};
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const params=new URLSearchParams(location.search);
let familySlug=params.get('familia')||'',categorySlug=params.get('categoria')||'',serviceRef=(params.get('servico')||'').trim();
let families=[],categories=[];
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
function rootsForFamily(id){return rootCategories(categories,id)}
function childrenFor(id){return categoryChildren(categories,id)}
function serviceHref(p){return `/servicos/?servico=${encodeURIComponent(p.slug||p.id)}`}
function setUrl(family='',category=''){
  const u=new URL(location.href);
  u.searchParams.delete('familia');u.searchParams.delete('categoria');u.searchParams.delete('servico');
  if(family)u.searchParams.set('familia',family);if(category)u.searchParams.set('categoria',category);
  history.replaceState({},'',u.pathname+(u.search?u.search:''));familySlug=family;categorySlug=category;serviceRef='';
}

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

function consultMarkup(service,price){
  const text=`Olá! Vim pelo site da Croma e gostaria de ${price.consult?'consultar o valor':'solicitar orçamento'} para ${service.nome}.`;
  return `<div class="public-item-consult"><strong>${price.consult?'Consulte condições':'Solicite seu orçamento'}</strong><p>${price.consult?'Fale com a Croma para confirmar materiais, quantidade, prazo e valor.':'Envie esta opção para a Croma e continue o atendimento pelo WhatsApp.'}</p><a class="sc-cta" href="${quoteBase}${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">${price.consult?'Consultar pelo WhatsApp':'Solicitar pelo WhatsApp'} →</a></div>`;
}

async function renderServiceDetail(){
  const service=await loadPublicCatalogItem('servico',serviceRef,{requirePublished:true});
  if(!service){
    root.innerHTML='<div class="service-catalog"><div class="sc-empty"><p>Este serviço não está disponível no catálogo público.</p><a class="sc-family-close" href="/servicos/">Voltar aos serviços</a></div></div>';
    return;
  }
  const mediaMap=await loadPrimaryMedia([service.id]);
  const media=mediaMap.get(service.id)||null;
  const path=categoryPath(categories,families,service.catalog_category_id);
  const category=categories.find(item=>item.id===service.catalog_category_id)||null;
  const family=category?families.find(item=>item.id===category.family_id)||null:null;
  const backHref=category&&family?`/servicos/?familia=${encodeURIComponent(family.slug)}&categoria=${encodeURIComponent(category.slug)}`:'/servicos/';
  const price=commercialPrice(service);
  const description=plain(service.short_description||service.descricao||'Escolha a configuração ideal ou solicite orientação da Croma.');
  const categoryNames=path.slice(1).map(item=>item.nome).join(' › ');

  root.innerHTML=`<div class="service-catalog public-item-profile">
    <div class="sc-breadcrumb"><a href="/">Início</a><span>›</span><a href="/servicos/">Serviços</a>${family?`<span>›</span><a href="/servicos/?familia=${encodeURIComponent(family.slug)}">${esc(family.nome)}</a>`:''}${category?`<span>›</span><a href="${backHref}">${esc(category.nome)}</a>`:''}<span>›</span><strong>${esc(service.nome)}</strong></div>
    <section class="public-editorial-hero" style="align-items:start">
      <div>${media?.url?`<img src="${esc(media.url)}" alt="${esc(media.alt_text||service.nome)}" loading="eager" referrerpolicy="no-referrer">`:'<div class="public-card-media" style="border-radius:20px;min-height:320px"></div>'}</div>
      <div class="public-item-profile-copy">
        <span class="public-eyebrow">${esc(categoryNames||family?.nome||'Serviço Croma')}</span>
        <h1 style="color:var(--pc-deep);font-size:clamp(2rem,4vw,3.8rem);line-height:1.02;margin:10px 0 14px">${esc(service.nome)}</h1>
        <p class="public-item-profile-price">${esc(price.label)}</p>
        <p class="public-lead">${esc(description)}</p>
      </div>
    </section>
    <div id="publicItemConfigurator"></div>
    <div id="publicItemFallback"></div>
    <div class="public-item-profile-actions"><a class="sc-family-close" href="${backHref}" style="text-decoration:none">← Voltar</a></div>
  </div>`;

  document.title=`${service.nome} | Croma Gráfica`;
  const configurator=root.querySelector('#publicItemConfigurator');
  const fallback=root.querySelector('#publicItemFallback');
  let mounted=false;
  if(configurator&&Number(service.child_count||0)>0){
    mounted=await mountPublicItemConfigurator({productId:service.id,productName:service.nome,mount:configurator,quoteBase});
  }
  if(!mounted&&fallback)fallback.innerHTML=consultMarkup(service,price);
}

async function renderCategory(){
  const cat=categories.find(c=>c.slug===categorySlug),fam=families.find(f=>f.slug===familySlug)||families.find(f=>f.id===cat?.family_id);
  if(!cat||!fam){setUrl('','');renderHome();return}
  const ids=[...descendantIds(categories,cat.id)];
  const rows=await loadPublicCatalogItems('servico',{requirePublished:true,categoryIds:ids,pageSize:100});
  const media=await loadPrimaryMedia(rows.map(r=>r.id));
  const path=categoryPath(categories,families,cat.id),children=childrenFor(cat.id);
  const genericQuote=`${quoteBase}${encodeURIComponent(`Olá! Vim pelo site da Croma e gostaria de solicitar orçamento para ${cat.nome}.`)}`;
  root.innerHTML=`<div class="service-catalog"><div class="sc-breadcrumb"><a href="/">Início</a><span>›</span><a href="/servicos/">Serviços</a>${path.map((x,i)=>i===path.length-1?`<span>›</span><strong>${esc(x.nome)}</strong>`:`<span>›</span><a href="${i===0?`/servicos/?familia=${encodeURIComponent(fam.slug)}`:`/servicos/?familia=${encodeURIComponent(fam.slug)}&categoria=${encodeURIComponent(x.slug||'')}`}">${esc(x.nome)}</a>`).join('')}</div><section class="sc-family-hero">${familyMedia(fam)?`<img src="${esc(familyMedia(fam))}" alt="${esc(fam.image_alt||fam.nome)}">`:''}<div class="sc-family-hero-copy"><p class="sc-eyebrow">${esc(fam.nome)}</p><h1>${esc(cat.nome)}</h1><p>${esc(cat.descricao||'Consulte opções, formatos e possibilidades para esta categoria.')}</p></div></section>${children.length?`<div class="sc-sibling-grid">${children.map(c=>`<a class="sc-sibling-card" href="/servicos/?familia=${encodeURIComponent(fam.slug)}&categoria=${encodeURIComponent(c.slug)}"><div class="sc-sibling-copy"><strong>${esc(c.nome)}</strong><span>Explorar opções</span><i class="sc-sibling-arrow">→</i></div></a>`).join('')}</div>`:''}<div class="sc-category-heading"><h2>${rows.length?'Opções disponíveis':'Precisa desta solução?'}</h2><p>${rows.length?'Abra uma opção para ver detalhes, configurações e valor.':'Fale com a Croma para consultar materiais, medidas, quantidades e acabamentos disponíveis.'}</p></div>${rows.length?`<section class="sc-service-results"><div class="sc-services-grid">${rows.map(p=>{const m=media.get(p.id),desc=plain(p.short_description||p.descricao||'Solicite um orçamento para este serviço.'),price=commercialPrice(p),optionInfo=Number(p.child_count||0)>0?`<div class="sc-service-options">Configurações disponíveis</div>`:'';return `<article class="sc-service-card"><div class="sc-service-media">${m?.url?`<img src="${esc(m.url)}" alt="${esc(m.alt_text||p.nome)}" loading="lazy">`:''}</div><div class="sc-service-copy"><h4>${esc(p.nome)}</h4><p>${esc(desc)}</p>${optionInfo}<div class="sc-service-price ${price.consult?'is-consult':''}">${esc(price.label)}</div><a class="sc-cta" href="${serviceHref(p)}">${Number(p.child_count||0)>0?'Configurar':'Ver detalhes'} →</a></div></article>`}).join('')}</div></section>`:`<div class="sc-empty"><p>Podemos orientar a melhor configuração para o seu projeto.</p><a class="sc-cta" href="${genericQuote}" target="_blank" rel="noopener noreferrer">Consultar pelo WhatsApp →</a></div>`}</div>`;
}

try{
  const data=await loadPublicCatalogMeta('servico',{requirePublished:true});
  families=data.families;categories=data.categories;
  if(serviceRef)await renderServiceDetail();
  else if(categorySlug)await renderCategory();
  else renderHome();
}catch(e){
  console.error('Falha ao carregar catálogo público de serviços.',e);
  root.innerHTML='<div class="service-catalog"><div class="sc-empty">Não foi possível carregar os serviços agora.</div></div>';
}
