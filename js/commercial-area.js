import { loadCommercialArea } from './commercial-areas-data.js';

const root=document.querySelector('#commercialAreaRoot');
const areaSlug=document.body.dataset.commercialArea||'';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quoteBase='https://wa.me/553230253588?text=';

function categoryHref(family,category){
  const base=family.catalog_scope==='produto'?'/produtos/':'/servicos/';
  return `${base}?familia=${encodeURIComponent(family.slug)}&categoria=${encodeURIComponent(category.slug)}`;
}
function itemHref(item,category,family){
  if(item.product_type==='produto')return `/produtos/?produto=${encodeURIComponent(item.slug||item.id)}`;
  if(category&&family)return categoryHref(family,category);
  return '/servicos/';
}
function actionLabel(action){return action==='configure'?'Configurar e comprar':action==='quote'?'Solicitar orçamento':'Comprar'}
function actionClass(action){return action==='configure'?'configure':action==='quote'?'quote':''}
function priceMarkup(item,action){
  if(action==='quote')return '<div class="ca-product-price">Orçamento personalizado</div>';
  const value=Number(item.preco||item.commercial_min_price||0);
  return value>0?`<div class="ca-product-price">${esc(money(value))}</div>`:'<div class="ca-product-price">Solicite orçamento</div>';
}

function render(data){
  const categoriesByFamily=new Map();
  for(const cat of data.categories){
    if(!categoriesByFamily.has(cat.family_id))categoriesByFamily.set(cat.family_id,[]);
    categoriesByFamily.get(cat.family_id).push(cat);
  }
  const categoryById=new Map(data.categories.map(c=>[c.id,c]));
  const familyById=new Map(data.families.map(f=>[f.id,f]));
  const primaryFamilies=data.families.filter(f=>f.is_primary!==false);
  const sortedItems=[...data.items].sort((a,b)=>{
    const af=Number(a.metadata?.home_featured||a.metadata?.featured_home||0);
    const bf=Number(b.metadata?.home_featured||b.metadata?.featured_home||0);
    if(af!==bf)return bf-af;
    const ai=data.media.has(a.id)?1:0,bi=data.media.has(b.id)?1:0;
    if(ai!==bi)return bi-ai;
    return String(a.nome).localeCompare(String(b.nome),'pt-BR');
  }).slice(0,12);

  document.title=`${data.name} | Croma`;
  root.innerHTML=`
    <section class="ca-hero">
      <div class="ca-shell ca-hero-grid">
        <div>
          <span class="ca-eyebrow">Croma</span>
          <h1>${esc(data.name)}</h1>
          <p>${esc(data.description||'Encontre produtos, serviços e soluções desta área da Croma.')}</p>
          <form class="ca-search" action="/busca/" method="get">
            <input type="search" name="q" placeholder="O que você precisa?" aria-label="Buscar no catálogo Croma">
            <button type="submit">Buscar</button>
          </form>
        </div>
        <aside class="ca-hero-card"><strong>Navegue do geral ao específico</strong><span>Escolha uma família, refine pela categoria e siga para comprar, configurar ou solicitar orçamento.</span></aside>
      </div>
    </section>

    <section class="ca-section">
      <div class="ca-shell">
        <div class="ca-section-head"><div><span class="ca-eyebrow">Famílias e categorias</span><h2>Encontre pelo tipo de necessidade.</h2></div><p>As categorias atuais foram preservadas. Esta página apenas organiza o acesso a elas por uma camada comercial mais simples.</p></div>
        <div class="ca-family-grid">
          ${primaryFamilies.map(f=>{
            const cats=(categoriesByFamily.get(f.id)||[]).filter(c=>!c.parent_id&&c.show_in_navigation!==false).slice(0,8);
            return `<article class="ca-family-card"><small>${esc(f.catalog_scope==='produto'?'PRODUTOS':'SERVIÇOS')}</small><h3>${esc(f.nome)}</h3><p>${esc(f.descricao||'Veja as categorias disponíveis.')}</p><div class="ca-category-list">${cats.map(c=>`<a href="${esc(categoryHref(f,c))}">${esc(c.nome)}</a>`).join('')||'<span>Em organização</span>'}</div></article>`
          }).join('')||'<div class="ca-empty">As famílias desta área estão sendo organizadas.</div>'}
        </div>
      </div>
    </section>

    <section class="ca-section soft">
      <div class="ca-shell">
        <div class="ca-section-head"><div><span class="ca-eyebrow">Destaques</span><h2>Produtos e soluções desta área.</h2></div><p>Esta seleção será controlada pela futura Vitrine & Campanhas. Por enquanto, usamos itens reais do catálogo.</p></div>
        <div class="ca-product-grid">
          ${sortedItems.map(item=>{
            const media=data.media.get(item.id),action=data.actions.get(item.id)||'quote',category=categoryById.get(item.catalog_category_id),family=category?familyById.get(category.family_id):null;
            const href=action==='quote'?`${quoteBase}${encodeURIComponent(`Olá! Vim pelo site da Croma e gostaria de solicitar orçamento para ${item.nome}.`)}`:itemHref(item,category,family);
            const external=action==='quote'?' target="_blank" rel="noopener noreferrer"':'';
            return `<article class="ca-product-card"><div class="ca-product-media">${media?.url?`<img src="${esc(media.url)}" alt="${esc(media.alt_text||item.nome)}" loading="lazy">`:''}</div><div class="ca-product-copy"><small>${esc(category?.nome||family?.nome||'Croma')}</small><h3>${esc(item.nome)}</h3>${priceMarkup(item,action)}<a class="ca-action ${actionClass(action)}" href="${esc(href)}"${external}>${esc(actionLabel(action))}</a></div></article>`
          }).join('')||'<div class="ca-empty">Os destaques desta área serão adicionados em breve.</div>'}
        </div>
      </div>
    </section>

    <section class="ca-bottom"><div class="ca-shell ca-bottom-grid"><div><h2>Não encontrou o que precisa?</h2><p>Explique o projeto e a Croma direciona para a solução adequada.</p></div><a href="${quoteBase}${encodeURIComponent(`Olá! Vim pela área ${data.name} do site da Croma e gostaria de solicitar um orçamento.`)}" target="_blank" rel="noopener noreferrer">Solicitar orçamento</a></div></section>`;
}

try{
  if(!areaSlug)throw new Error('Área comercial não definida.');
  const data=await loadCommercialArea(areaSlug,{itemLimit:48});
  if(!data)throw new Error('Área comercial não encontrada.');
  render(data);
}catch(error){
  console.error('commercial_area_error',error);
  root.innerHTML='<div class="ca-shell" style="padding:80px 0"><div class="ca-empty">Não foi possível carregar esta área agora.</div></div>';
}
