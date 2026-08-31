import { renderProductVisual } from './product-visual.js';
import { carregarCatalogo } from './data-service.js';
import { setupNavigation } from './navigation.js';
import { supabase } from './croma-supabase.js';

if(!document.querySelector('script[data-croma-cart]')){
  const script=document.createElement('script');
  script.src='/js/cart.js?v=20260821-2';
  script.dataset.cromaCart='1';
  document.head.appendChild(script);
}
if(!document.querySelector('script[data-public-header-loader]')){
  const headerScript=document.createElement('script');
  headerScript.src='/js/service-header.js?v=20260831-4';
  headerScript.defer=true;
  headerScript.dataset.publicHeaderLoader='1';
  document.head.appendChild(headerScript);
}

setupNavigation();

document.querySelectorAll('.hero-slide').forEach(slide=>{
  if(slide.textContent.includes('Croma Papelaria & Presentes')){
    const a=slide.querySelector('.hero-slide-actions a');if(a){a.href='/produtos/';a.textContent='Explorar produtos'}
  }
});

const state={data:null,categoria:'Todos',termo:''};
const CATEGORY_ORDER=['Todos','Comunicação Visual','Gráfica','Eventos','Papelaria','Presentes','Eletrônicos','Digital'];
const WHATSAPP_NUMBER='553230253588';
const WHATSAPP_MESSAGE='Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.';
const grid=document.querySelector('#catalogGrid'),filters=document.querySelector('#catalogFilters'),search=document.querySelector('#catalogSearch'),modal=document.querySelector('#productModal'),modalClose=document.querySelector('#modalClose'),whatsappCta=document.querySelector('#whatsappCta'),whatsappFloat=document.querySelector('#whatsappFloat'),whatsappClose=document.querySelector('#whatsappClose');
const normalizar=(text='')=>text.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const moeda=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function itensFiltrados(){if(!state.data)return[];const termo=normalizar(state.termo.trim());return state.data.itens.filter(item=>(state.categoria==='Todos'||item.categoria===state.categoria)&&(!termo||normalizar(`${item.nome} ${item.categoria} ${item.descricao}`).includes(termo)))}
function categoriasDisponiveis(){const available=new Set([...(state.data?.categororias||[]),...(state.data?.categorias||[]),...(state.data?.itens||[]).map(item=>item.categoria).filter(Boolean)]);return CATEGORY_ORDER.filter(category=>available.has(category)).concat([...available].filter(category=>!CATEGORY_ORDER.includes(category)))}
function renderFilters(){if(!filters||!state.data)return;filters.innerHTML=categoriasDisponiveis().map(category=>`<button class="filter-btn ${category===state.categoria?'active':''}" data-category="${category}">${category}</button>`).join('')}
function renderCatalog(){if(!grid)return;const itens=itensFiltrados();if(!itens.length){grid.innerHTML='<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>';return}grid.innerHTML=itens.map(item=>`<article class="product-card" aria-label="${item.nome}">${renderProductVisual(item)}<div class="product-body"><span class="product-category">${item.categoria}</span><h3>${item.nome}</h3><p>${item.descricao}</p>${item.precoVenda?`<div class="catalog-price"><small>${item.quantidadePreco||1} unidades a partir de</small><strong>${moeda(item.precoVenda)}</strong></div>`:''}<span class="product-more">Vitrine Croma</span></div></article>`).join('')}
filters?.addEventListener('click',event=>{const button=event.target.closest('[data-category]');if(!button)return;state.categoria=button.dataset.category;renderFilters();renderCatalog()});
search?.addEventListener('input',event=>{state.termo=event.target.value;renderCatalog()});
modalClose?.addEventListener('click',()=>modal?.close());
whatsappCta?.addEventListener('click',event=>{event.preventDefault();window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,'_blank','noopener,noreferrer')});
if(whatsappFloat&&whatsappClose){const hiddenUntil=Number(localStorage.getItem('cromaWhatsappHiddenUntil')||0);if(hiddenUntil>Date.now())whatsappFloat.hidden=true;whatsappClose.addEventListener('click',()=>{whatsappFloat.hidden=true;localStorage.setItem('cromaWhatsappHiddenUntil',String(Date.now()+86400000))})}

document.querySelectorAll('.service-card').forEach((card,i)=>{card.style.cursor='pointer';card.setAttribute('tabindex','0');const href=i===0?'/servicos/#comunicacao-visual':i===1?'/servicos/#servicos-graficos':i===2?'/produtos/':'/servicos/#eventos-personalizados';const go=()=>location.href=href;card.addEventListener('click',go);card.addEventListener('keydown',event=>{if(event.key==='Enter')go()})});

async function renderSegmentsHome(){
  const portfolio=document.querySelector('#portfolio');if(!portfolio)return;
  const {data,error}=await supabase.from('catalog_segments').select('id,nome,slug,descricao,icon,home_order,parent_id').eq('ativo',true).eq('featured_home',true).is('parent_id',null).order('home_order').limit(6);
  if(error||!data?.length)return;
  if(document.querySelector('#segmentos-home'))return;
  const section=document.createElement('section');section.className='section section-soft';section.id='segmentos-home';
  section.innerHTML=`<div class="section-heading split-heading"><div><span class="eyebrow">Soluções por segmento</span><h2>Encontre soluções pensadas para o seu negócio.</h2></div><p class="section-note">Os segmentos reúnem produtos e serviços sem duplicar cadastros.</p></div><div class="service-grid">${data.map((s,i)=>`<article class="service-card accent-${['magenta','blue','green','yellow'][i%4]}" data-segment><span>${s.icon||'◆'}</span><h3>${s.nome}</h3><p>${s.descricao||''}</p></article>`).join('')}</div><div style="margin-top:24px"><a class="btn btn-ghost" href="/segmentos/">Ver todas as soluções por segmento</a></div>`;
  portfolio.parentNode.insertBefore(section,portfolio);
  section.querySelectorAll('[data-segment]').forEach(card=>{card.style.cursor='pointer';card.onclick=()=>location.href='/segmentos/'});
}

const about=document.querySelector('#sobre');if(about){const more=document.createElement('p');more.innerHTML='<a class="btn btn-ghost" href="/sobre/">Conhecer a Croma</a>';about.querySelector('.about-copy')?.appendChild(more)}

async function init(){state.data=await carregarCatalogo();renderFilters();renderCatalog();renderSegmentsHome()}
init();