import { renderProductVisual } from './product-visual.js';
import { carregarVitrineHome } from './data-service.js';
import { setupNavigation } from './navigation.js';
import { supabase } from './croma-supabase.js';

if(!document.querySelector('script[data-croma-cart]')){const script=document.createElement('script');script.src='/js/cart.js?v=20260821-2';script.dataset.cromaCart='1';document.head.appendChild(script)}
if(!document.querySelector('script[data-public-header-loader]')){const headerScript=document.createElement('script');headerScript.src='/js/service-header.js?v=20260831-5';headerScript.defer=true;headerScript.dataset.publicHeaderLoader='1';document.head.appendChild(headerScript)}
setupNavigation();

document.querySelectorAll('.hero-slide').forEach(slide=>{if(slide.textContent.includes('Croma Papelaria & Presentes')){const a=slide.querySelector('.hero-slide-actions a');if(a){a.href='/produtos/';a.textContent='Explorar produtos'}}});

const showcaseState={tipo:'produtos',produtos:[],servicos:[]};
const WHATSAPP_NUMBER='553230253588',WHATSAPP_MESSAGE='Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.';
const grid=document.querySelector('#catalogGrid'),filters=document.querySelector('#catalogFilters'),search=document.querySelector('#catalogSearch'),modal=document.querySelector('#productModal'),modalClose=document.querySelector('#modalClose'),whatsappCta=document.querySelector('#whatsappCta'),whatsappFloat=document.querySelector('#whatsappFloat'),whatsappClose=document.querySelector('#whatsappClose');
const moeda=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

function setupShowcaseControls(){
  const section=document.querySelector('#catalogo');
  if(!section||document.querySelector('[data-showcase-switch]'))return;
  const heading=section.querySelector('.section-heading');
  const eyebrow=heading?.querySelector('.eyebrow');
  const title=heading?.querySelector('h2');
  if(eyebrow)eyebrow.textContent='Destaques Croma';
  if(title)title.textContent='Produtos e serviços em destaque.';
  search?.closest('.search-box')?.remove();
  if(filters)filters.hidden=true;

  const wrap=document.createElement('div');
  wrap.className='showcase-toolbar';
  wrap.innerHTML=`<div class="showcase-copy"><p>Uma seleção de produtos e serviços para você conhecer.</p></div><div class="showcase-switch" data-showcase-switch role="tablist" aria-label="Alternar vitrine"><span class="showcase-switch-thumb" aria-hidden="true"></span><button type="button" class="active" data-showcase-type="produtos" role="tab" aria-selected="true">Produtos</button><button type="button" data-showcase-type="servicos" role="tab" aria-selected="false">Serviços</button></div>`;
  heading?.after(wrap);

  wrap.addEventListener('click',event=>{
    const button=event.target.closest('[data-showcase-type]');
    if(!button)return;
    showcaseState.tipo=button.dataset.showcaseType;
    wrap.querySelectorAll('[data-showcase-type]').forEach(btn=>{
      const active=btn===button;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',String(active));
    });
    wrap.querySelector('.showcase-switch')?.classList.toggle('is-services',showcaseState.tipo==='servicos');
    renderShowcase();
  });
}

function showcaseItems(){
  return showcaseState.tipo==='servicos'?showcaseState.servicos:showcaseState.produtos;
}

function renderShowcase(){
  if(!grid)return;
  const itens=showcaseItems();
  if(!itens.length){
    const label=showcaseState.tipo==='servicos'?'serviços':'produtos';
    grid.innerHTML=`<div class="empty-state showcase-empty">Nenhum ${label} em destaque no momento.</div>`;
    return;
  }
  grid.innerHTML=itens.map(item=>{
    const action=item.tipo==='servico'?'Ver serviço':'Ver produtos';
    const description=item.descricao?`<p>${esc(item.descricao)}</p>`:'';
    const price=item.precoVenda?`<div class="catalog-price"><small>${item.tipo==='servico'?'a partir de':'por'}</small><strong>${moeda(item.precoVenda)}</strong></div>`:'';
    return `<article class="product-card showcase-card" aria-label="${esc(item.nome)}">${renderProductVisual(item)}<div class="product-body"><span class="product-category">${esc(item.categoria||'Croma')}</span><h3>${esc(item.nome)}</h3>${description}${price}<a class="product-more showcase-link" href="${esc(item.href||'#')}">${action} →</a></div></article>`;
  }).join('');
}

modalClose?.addEventListener('click',()=>modal?.close());
whatsappCta?.addEventListener('click',event=>{event.preventDefault();window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,'_blank','noopener,noreferrer')});
if(whatsappFloat&&whatsappClose){const hiddenUntil=Number(localStorage.getItem('cromaWhatsappHiddenUntil')||0);if(hiddenUntil>Date.now())whatsappFloat.hidden=true;whatsappClose.addEventListener('click',()=>{whatsappFloat.hidden=true;localStorage.setItem('cromaWhatsappHiddenUntil',String(Date.now()+86400000))})}

document.querySelectorAll('.service-card').forEach((card,i)=>{card.style.cursor='pointer';card.setAttribute('tabindex','0');const href=i===0?'/servicos/#comunicacao-visual':i===1?'/servicos/#servicos-graficos':i===2?'/produtos/':'/servicos/#eventos-personalizados';const go=()=>location.href=href;card.addEventListener('click',go);card.addEventListener('keydown',event=>{if(event.key==='Enter')go()})});

function injectVisualStyles(){
  if(document.querySelector('style[data-real-media-home]'))return;
  const s=document.createElement('style');
  s.dataset.realMediaHome='1';
  s.textContent=`
    .home-photo-card{position:relative;overflow:hidden;min-height:310px!important;background:#211c5c!important;color:#fff!important}.home-photo-card::before{content:'';position:absolute;inset:0;background-image:var(--photo);background-size:cover;background-position:center}.home-photo-card::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(20,16,60,.08),rgba(20,16,60,.86))}.home-photo-card>*{position:relative;z-index:1}.home-photo-card h3,.home-photo-card p,.home-photo-card span{color:#fff!important}
    .portfolio-real-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}.portfolio-real-card{position:relative;min-height:330px;border-radius:24px;overflow:hidden;background:#eceaf3}.portfolio-real-card img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.portfolio-real-card::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 35%,rgba(20,16,60,.88))}.portfolio-real-copy{position:absolute;z-index:2;left:18px;right:18px;bottom:18px;color:#fff}.portfolio-real-copy strong{display:block;font-size:1.05rem}.portfolio-real-copy small{display:block;margin-top:4px;color:#e9e7f5}
    #catalogo .catalog-grid{margin-top:22px}.showcase-toolbar{display:flex;align-items:center;justify-content:space-between;gap:24px;margin:6px 0 24px}.showcase-copy{max-width:640px}.showcase-copy p{margin:0;color:#625f70;line-height:1.55}.showcase-switch{position:relative;display:grid;grid-template-columns:1fr 1fr;min-width:270px;padding:4px;border-radius:999px;background:#e8e6ef;box-shadow:inset 0 0 0 1px rgba(48,41,127,.08)}.showcase-switch-thumb{position:absolute;top:4px;left:4px;width:calc(50% - 4px);height:calc(100% - 8px);border-radius:999px;background:#30297f;box-shadow:0 7px 18px rgba(48,41,127,.24);transition:transform .28s ease}.showcase-switch.is-services .showcase-switch-thumb{transform:translateX(100%)}.showcase-switch button{position:relative;z-index:1;border:0;background:transparent;padding:11px 20px;border-radius:999px;font:inherit;font-weight:700;color:#5d596b;cursor:pointer;transition:color .2s ease}.showcase-switch button.active{color:#fff}.showcase-card{overflow:hidden;transition:transform .2s ease,box-shadow .2s ease}.showcase-card:hover{transform:translateY(-3px);box-shadow:0 14px 34px rgba(35,31,75,.11)}.showcase-link{display:inline-flex;margin-top:10px;text-decoration:none;font-weight:800;color:#30297f}.showcase-empty{grid-column:1/-1}.media-brand-placeholder{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:linear-gradient(135deg,#f3f1fa,#e6e2f4);color:#30297f}.media-brand-placeholder[hidden]{display:none}.media-brand-mark{display:grid;place-items:center;width:68px;height:68px;border-radius:22px;background:#30297f;color:#fff;font-size:1.35rem;font-weight:900;letter-spacing:.04em;box-shadow:0 10px 24px rgba(48,41,127,.22)}.media-brand-placeholder small{text-transform:uppercase;letter-spacing:.16em;font-weight:800;color:#6d6880}.product-media-layered .media-product[hidden]{display:none}
    @media(max-width:900px){.portfolio-real-grid{grid-template-columns:repeat(2,1fr)}.showcase-toolbar{align-items:flex-start;flex-direction:column}.showcase-switch{width:100%;min-width:0}}
    @media(max-width:560px){.portfolio-real-grid{grid-template-columns:1fr}.showcase-switch button{padding:10px 12px}}
  `;
  document.head.appendChild(s);
}

async function renderServiceHomePhotos(){const cards=[...document.querySelectorAll('#servicos .service-card')];if(!cards.length)return;const {data}=await supabase.from('catalog_categories').select('slug,image_url').in('slug',['comunicacao-visual','servicos-graficos','papelaria','eventos-personalizados']);const by=new Map((data||[]).map(x=>[x.slug,x.image_url]));const slugs=['comunicacao-visual','servicos-graficos','papelaria','eventos-personalizados'];cards.forEach((card,i)=>{const url=by.get(slugs[i]);if(url){card.classList.add('home-photo-card');card.style.setProperty('--photo',`url("${url}")`)}})}

async function renderPortfolioHome(){const section=document.querySelector('#portfolio');if(!section)return;const {data,error}=await supabase.from('portfolio_items').select('*').eq('active',true).order('sort_order').limit(4);if(error||!data?.length)return;const old=section.querySelector('.portfolio-grid');if(old)old.outerHTML=`<div class="portfolio-real-grid">${data.map(x=>`<article class="portfolio-real-card"><img src="${esc(x.image_url)}" alt="${esc(x.image_alt||x.title)}" loading="lazy"><div class="portfolio-real-copy"><strong>${esc(x.title)}</strong><small>${esc(x.description||'')}</small></div></article>`).join('')}</div>`;const note=section.querySelector('.section-note');if(note)note.textContent='Uma seleção visual das principais soluções e trabalhos apresentados pela Croma.'}

const about=document.querySelector('#sobre');if(about){const more=document.createElement('p');more.innerHTML='<a class="btn btn-ghost" href="/sobre/">Conhecer a Croma</a>';about.querySelector('.about-copy')?.appendChild(more)}

async function init(){
  injectVisualStyles();
  setupShowcaseControls();
  const showcase=await carregarVitrineHome(8);
  showcaseState.produtos=showcase.produtos||[];
  showcaseState.servicos=showcase.servicos||[];
  renderShowcase();
  await Promise.allSettled([renderServiceHomePhotos(),renderPortfolioHome()]);
}
init();
