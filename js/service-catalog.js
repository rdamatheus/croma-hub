import { supabase } from './croma-supabase.js';

const root=document.querySelector('#catalogRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const plain=s=>{const d=document.createElement('div');d.innerHTML=String(s??'');return(d.textContent||'').replace(/\s+/g,' ').trim()};
const PAGE_SIZE=500;
const params=new URLSearchParams(location.search);
let familySlug=params.get('familia')||'';
let categorySlug=params.get('categoria')||'';
let families=[];
let categories=[];

const PILOT_CONFIGS={
  impressoes:{
    groups:[
      {key:'Formato',options:['A4','A3']},
      {key:'Cor',options:['Preto e branco','Colorido']},
      {key:'Lados',options:['Só frente','Frente e verso']},
      {key:'Acabamento',optional:true,options:['Sem acabamento','Grampo','Clips','Encadernação']}
    ],
    quantity:true
  },
  'impressoes-especiais':{
    groups:[
      {key:'Material',options:['Papel especial','Fotográfico','Cartão']},
      {key:'Formato',options:['A4','A3']},
      {key:'Lados',options:['Só frente','Frente e verso']},
      {key:'Corte',options:['Corte reto','Corte especial']},
      {key:'Acabamento',optional:true,options:['Sem acabamento','Plastificação','Laminação brilho','Laminação fosca']}
    ],
    quantity:true
  }
};

const RELATED_TAGS={
  impressoes:['A4 e A3','P&B ou colorido','Frente e verso','Grampo','Clips','Encadernação'],
  'impressoes-especiais':['Papéis especiais','Frente e verso','Corte reto','Corte especial','Plastificação','Laminação brilho','Laminação fosca']
};

async function fetchAll(build){
  const out=[];
  for(let from=0;;from+=PAGE_SIZE){
    const{data,error}=await build().range(from,from+PAGE_SIZE-1);
    if(error)throw error;
    const rows=data||[];
    out.push(...rows);
    if(rows.length<PAGE_SIZE)break;
  }
  return out;
}

function setUrl(family='',category=''){
  const u=new URL(location.href);
  u.searchParams.delete('familia');
  u.searchParams.delete('categoria');
  if(family)u.searchParams.set('familia',family);
  if(category)u.searchParams.set('categoria',category);
  history.replaceState({},'',u.pathname+(u.search?u.search:''));
  familySlug=family;categorySlug=category;
}

function familyCategories(id){
  return categories.filter(c=>c.family_id===id&&c.ativo!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}

function fallbackMedia(item){return item?.image_url||''}
function familyMedia(f){return fallbackMedia(f)}
function categoryMedia(c,f){return fallbackMedia(c)||familyMedia(f)}

function renderFamilyCard(f){
  const media=familyMedia(f);
  return `<article class="sc-family-card" data-family-card="${esc(f.slug)}">
    <button type="button" class="sc-family-main" data-family-trigger="${esc(f.slug)}" aria-expanded="false" style="width:100%;padding:0;border:0;background:transparent;text-align:left;cursor:pointer">
      <div class="sc-family-media">${media?`<img src="${esc(media)}" alt="${esc(f.image_alt||f.nome)}" loading="lazy">`:''}</div>
      <div class="sc-family-body">
        <h2>${esc(f.nome)}</h2>
        <p>${esc(f.descricao||'Conheça as opções disponíveis.')}</p>
        <span class="sc-family-action">Ver categorias ↓</span>
      </div>
    </button>
    <div class="sc-family-detail" data-family-detail></div>
  </article>`
}

function renderHome(){
  root.innerHTML=`<div class="service-catalog">
    <div class="sc-intro">
      <p class="sc-eyebrow">Serviços Gráficos</p>
      <h1>Escolha uma solução.</h1>
      <p>As famílias organizam os serviços por finalidade. Clique em uma delas para ver as categorias relacionadas.</p>
    </div>
    <div class="sc-family-grid">${families.map(renderFamilyCard).join('')}</div>
  </div>`;
  root.querySelectorAll('[data-family-trigger]').forEach(btn=>btn.addEventListener('click',()=>toggleFamily(btn.dataset.familyTrigger)));
  if(familySlug)requestAnimationFrame(()=>openFamily(familySlug,false));
}

function closeAllFamilies(update=true){
  root.querySelectorAll('[data-family-card]').forEach(card=>{
    card.classList.remove('is-expanded');
    card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','false');
    const d=card.querySelector('[data-family-detail]');if(d)d.innerHTML='';
  });
  if(update)setUrl('','');
}

function toggleFamily(slug){
  const card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);
  if(card?.classList.contains('is-expanded'))closeAllFamilies();
  else openFamily(slug,true);
}

function openFamily(slug,scroll=true){
  const f=families.find(x=>x.slug===slug);if(!f)return;
  const card=root.querySelector(`[data-family-card="${CSS.escape(slug)}"]`);if(!card)return;
  closeAllFamilies(false);
  card.classList.add('is-expanded');
  card.querySelector('[data-family-trigger]')?.setAttribute('aria-expanded','true');
  const cats=familyCategories(f.id),detail=card.querySelector('[data-family-detail]');
  detail.innerHTML=`<div class="sc-family-detail-head"><div><h3>Escolha uma categoria</h3><p>Veja as opções disponíveis dentro de ${esc(f.nome)}.</p></div><button type="button" class="sc-family-close" data-family-close>Fechar</button></div>
    ${cats.length?`<div class="sc-category-strip">${cats.map(c=>{
      const media=categoryMedia(c,f);
      return `<a class="sc-category-mini" href="/servicos/?familia=${encodeURIComponent(f.slug)}&categoria=${encodeURIComponent(c.slug)}">
        <div class="sc-category-mini-media">${media?`<img src="${esc(media)}" alt="${esc(c.image_alt||c.nome)}" loading="lazy">`:''}</div>
        <div class="sc-category-mini-copy"><strong>${esc(c.nome)}</strong><span>${esc(c.descricao||'Ver opções desta categoria.')}</span></div>
      </a>`}).join('')}</div>`:'<div class="sc-empty">As categorias desta família estão sendo organizadas.</div>'}`;
  detail.querySelector('[data-family-close]')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();closeAllFamilies()});
  setUrl(f.slug,'');
  if(scroll)requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'nearest'}));
}

async function loadCategoryServices(cat){
  const ids=[cat.id,...categories.filter(c=>c.parent_id===cat.id&&c.ativo!==false).map(c=>c.id)];
  const rows=await fetchAll(()=>supabase.from('products').select('id,nome,sku,slug,descricao,short_description,metadata,catalog_category_id,preco,ativo,product_type').eq('product_type','servico').eq('ativo',true).in('catalog_category_id',ids).order('nome'));
  const media=new Map();
  const productIds=rows.map(r=>r.id);
  for(let i=0;i<productIds.length;i+=180){
    const chunk=productIds.slice(i,i+180);if(!chunk.length)continue;
    const{data,error}=await supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').in('product_id',chunk).eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem');
    if(error)throw error;
    for(const m of data||[])if(m.product_id&&m.url&&!media.has(m.product_id))media.set(m.product_id,m.url);
  }
  return{rows,media};
}

function siblingCards(f,active){
  return familyCategories(f.id).map(c=>{
    const media=categoryMedia(c,f),selected=c.id===active.id;
    return `<a class="sc-sibling-card ${selected?'is-active':''}" href="/servicos/?familia=${encodeURIComponent(f.slug)}&categoria=${encodeURIComponent(c.slug)}">
      <div class="sc-sibling-media">${media?`<img src="${esc(media)}" alt="${esc(c.image_alt||c.nome)}" loading="lazy">`:''}</div>
      <div class="sc-sibling-copy"><strong>${esc(c.nome)}</strong><span>${esc(c.descricao||'Veja as opções disponíveis.')}</span><i class="sc-sibling-arrow">→</i></div>
    </a>`
  }).join('')
}

function initialConfig(blueprint){
  const state={};
  blueprint.groups.forEach(g=>state[g.key]=g.options[0]);
  state.Quantidade=100;
  return state;
}

function configMarkup(cat){
  const blueprint=PILOT_CONFIGS[cat.slug];
  if(!blueprint)return'';
  return `<div class="sc-config-panel" data-config-panel>
    <div class="sc-config-grid">
      ${blueprint.groups.map(g=>`<section class="sc-config-group" data-config-group="${esc(g.key)}"><h3>${esc(g.key)}${g.optional?' (opcional)':''}</h3><div class="sc-option-row">${g.options.map((o,i)=>`<button type="button" class="sc-option ${i===0?'is-selected':''}" data-config-key="${esc(g.key)}" data-config-value="${esc(o)}">${esc(o)}</button>`).join('')}</div></section>`).join('')}
      ${blueprint.quantity?`<section class="sc-config-group"><h3>Quantidade</h3><div class="sc-quantity"><input type="number" min="1" step="1" value="100" data-config-quantity aria-label="Quantidade"></div></section>`:''}
    </div>
  </div>`
}

function summaryMarkup(cat,state){
  const blueprint=PILOT_CONFIGS[cat.slug];if(!blueprint)return'';
  return `<aside class="sc-summary"><h3>Resumo do seu material</h3><div class="sc-summary-list" data-config-summary>${Object.entries(state).map(([k,v])=>`<div class="sc-summary-item"><span>${esc(k)}</span><strong data-summary-key="${esc(k)}">${esc(v)}</strong></div>`).join('')}</div><p class="sc-summary-note">Envie as opções desejadas. A equipe confirma materiais, valores e prazo no orçamento.</p><button type="button" class="sc-cta" data-quote-cta>Solicitar orçamento →</button></aside>`
}

function relatedMarkup(f,cat){
  const siblings=familyCategories(f.id).filter(c=>c.id!==cat.id);if(!siblings.length)return'';
  const other=siblings[0],media=categoryMedia(other,f),tags=RELATED_TAGS[other.slug]||[];
  return `<aside class="sc-related"><div class="sc-related-media">${media?`<img src="${esc(media)}" alt="${esc(other.image_alt||other.nome)}" loading="lazy">`:''}</div><div class="sc-related-copy"><h3>${esc(other.nome)}</h3><p>${esc(other.descricao||'Conheça também esta categoria.')}</p>${tags.length?`<div class="sc-related-tags">${tags.map(t=>`<span class="sc-related-tag">${esc(t)}</span>`).join('')}</div>`:''}<a class="sc-cta" style="margin-top:16px" href="/servicos/?familia=${encodeURIComponent(f.slug)}&categoria=${encodeURIComponent(other.slug)}">Conheça todas as opções →</a></div></aside>`
}

function servicesMarkup(rows,media){
  if(!rows.length)return'';
  return `<section class="sc-service-results"><div class="sc-service-results-head"><h3>Serviços publicados nesta categoria</h3><span>${rows.length} serviço(s)</span></div><div class="sc-services-grid">${rows.slice(0,12).map(p=>{const img=media.get(p.id),desc=plain(p.short_description||p.descricao||'Solicite um orçamento para este serviço.');return `<article class="sc-service-card"><div class="sc-service-media">${img?`<img src="${esc(img)}" alt="${esc(p.nome)}" loading="lazy">`:''}</div><div class="sc-service-copy"><h4>${esc(p.nome)}</h4><p>${esc(desc)}</p><a class="cm-link" href="https://wa.me/553230253588?text=${encodeURIComponent(`Olá! Gostaria de orçamento para ${p.nome}.`)}">Solicitar orçamento →</a></div></article>`}).join('')}</div></section>`
}

function bindConfigurator(cat,state){
  root.querySelectorAll('[data-config-key]').forEach(btn=>btn.addEventListener('click',()=>{
    const key=btn.dataset.configKey,val=btn.dataset.configValue;state[key]=val;
    btn.closest('[data-config-group]')?.querySelectorAll('[data-config-key]').forEach(x=>x.classList.toggle('is-selected',x===btn));
    const target=root.querySelector(`[data-summary-key="${CSS.escape(key)}"]`);if(target)target.textContent=val;
  }));
  root.querySelector('[data-config-quantity]')?.addEventListener('input',e=>{
    const value=Math.max(1,Number(e.target.value||1));state.Quantidade=value;
    const target=root.querySelector('[data-summary-key="Quantidade"]');if(target)target.textContent=String(value);
  });
  root.querySelector('[data-quote-cta]')?.addEventListener('click',()=>{
    const details=Object.entries(state).map(([k,v])=>`${k}: ${v}`).join(' | ');
    const text=`Olá! Vim pelo Croma Hub e gostaria de solicitar orçamento para ${cat.nome}. ${details}`;
    window.open(`https://wa.me/553230253588?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  });
}

async function renderCategory(){
  const cat=categories.find(c=>c.slug===categorySlug&&c.ativo!==false);const fam=families.find(f=>f.slug===familySlug)||families.find(f=>f.id===cat?.family_id);
  if(!cat||!fam){setUrl('','');renderHome();return}
  const{rows,media}=await loadCategoryServices(cat);
  const hero=familyMedia(fam),catDesc=cat.descricao||'Configure seu material e solicite um orçamento de forma rápida e fácil.';
  const blueprint=PILOT_CONFIGS[cat.slug],state=blueprint?initialConfig(blueprint):null;
  root.innerHTML=`<div class="service-catalog">
    <div class="sc-breadcrumb"><a href="/">Início</a><span>›</span><a href="/servicos/">Serviços Gráficos</a><span>›</span><a href="/servicos/?familia=${encodeURIComponent(fam.slug)}">${esc(fam.nome)}</a><span>›</span><strong>${esc(cat.nome)}</strong></div>
    <section class="sc-family-hero">${hero?`<img src="${esc(hero)}" alt="${esc(fam.image_alt||fam.nome)}">`:''}<div class="sc-family-hero-copy"><p class="sc-eyebrow">Serviços Gráficos</p><h1>${esc(fam.nome)}</h1><p>${esc(fam.descricao||'Soluções profissionais para diferentes necessidades.')}</p></div></section>
    <div class="sc-sibling-grid">${siblingCards(fam,cat)}</div>
    <div class="sc-category-heading"><h2>${esc(cat.nome)}</h2><p>${esc(catDesc)}</p></div>
    ${blueprint?`<div class="sc-workspace">${configMarkup(cat)}<div>${summaryMarkup(cat,state)}${relatedMarkup(fam,cat)}</div>${servicesMarkup(rows,media)}</div>`:`<div class="sc-workspace"><div>${rows.length?servicesMarkup(rows,media):`<div class="sc-empty">Consulte a equipe para conhecer as opções desta categoria.</div>`}</div><div>${relatedMarkup(fam,cat)}</div></div>`}
  </div>`;
  if(blueprint)bindConfigurator(cat,state);
}

async function init(){
  if(!root)return;
  root.innerHTML='<div class="service-catalog"><div class="sc-empty">Carregando catálogo...</div></div>';
  try{
    [families,categories]=await Promise.all([
      fetchAll(()=>supabase.from('catalog_families').select('id,nome,slug,descricao,ordem,ativo,image_url,image_alt,catalog_scope').eq('catalog_scope','servico').eq('ativo',true).order('ordem').order('nome')),
      fetchAll(()=>supabase.from('catalog_categories').select('id,nome,slug,parent_id,family_id,ordem,catalog_scope,ativo,descricao,image_url,image_alt').eq('catalog_scope','servico').eq('ativo',true).order('ordem').order('nome'))
    ]);
    if(categorySlug)await renderCategory();else renderHome();
  }catch(error){
    console.error('Falha ao carregar catálogo de serviços.',error);
    root.innerHTML='<div class="service-catalog"><div class="sc-error"><h1>Serviços gráficos</h1>Não foi possível carregar os serviços agora. <a href="/contato/">Solicite orçamento com a equipe.</a></div></div>';
  }
}

init();
