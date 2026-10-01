import { loadCommercialAreas, loadCommercialArea } from './commercial-areas-data.js?v=20260929-1';
import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quoteBase='https://wa.me/553230253588?text=';
let areaData=[];
let activeAreaSlug='grafica-papelaria';
let activeBanner=null;

function actionLabel(action){return action==='configure'?'Configurar e comprar':action==='quote'?'Solicitar orçamento':'Comprar'}
function actionClass(action){return action==='configure'?'configure':action==='quote'?'quote':''}
function itemHref(item,action){
  if(action==='quote')return `${quoteBase}${encodeURIComponent(`Olá! Vim pelo site da Croma e gostaria de solicitar orçamento para ${item.nome}.`)}`;
  return `/produtos/?produto=${encodeURIComponent(item.slug||item.id)}`;
}
function price(item,action){
  if(action==='quote')return 'Orçamento personalizado';
  const value=Number(item.preco||item.commercial_min_price||0);
  return value>0?money(value):'Solicite orçamento';
}
function areaBySlug(slug){return areaData.find(a=>a.slug===slug)}
function productScore(item,area){
  let score=0;
  if(area.media.has(item.id))score+=20;
  if(item.metadata?.home_featured||item.metadata?.featured_home)score+=50;
  if(Number(item.preco)>0)score+=3;
  if(item.product_type==='produto')score+=2;
  return score;
}
function highlights(area){return [...area.items].sort((a,b)=>productScore(b,area)-productScore(a,area)||String(a.nome).localeCompare(String(b.nome),'pt-BR')).slice(0,4)}

function applyBannerBackground(){
  if(!activeBanner || document.querySelector('.home2-hero.approved-art'))return;
  const hero=document.querySelector('.home2-hero');
  if(!hero)return;
  const mobile=matchMedia('(max-width: 620px)').matches;
  const image=(mobile&&activeBanner.image_mobile_url)||activeBanner.image_desktop_url;
  if(!image){hero.style.backgroundImage='';hero.style.backgroundSize='';hero.style.backgroundPosition='';return}
  hero.style.backgroundImage=`linear-gradient(90deg,rgba(8,18,34,.9) 0%,rgba(15,23,47,.72) 48%,rgba(24,18,68,.35) 100%),url("${String(image).replaceAll('"','%22')}")`;
  hero.style.backgroundSize='cover';hero.style.backgroundPosition='center';
}
async function renderActiveBanner(){
  const {data,error}=await supabase.from('site_banners').select('id,name,eyebrow,title,subtitle,image_desktop_url,image_mobile_url,cta_label,target_type,target_ref,target_url,display_order').eq('placement','home_hero').order('display_order').limit(1).maybeSingle();
  if(error){console.warn('home_banner_error',error);return}
  if(!data)return;
  activeBanner=data;
  const hero=document.querySelector('.home2-hero');
  if(!hero)return;
  if(data.image_desktop_url){
    const safeUrl = value => {
      try { const url = new URL(value, location.origin); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; } catch { return null; }
    };
    const desktop = safeUrl(data.image_desktop_url);
    const mobile = safeUrl(data.image_mobile_url);
    if(desktop){
      const search = hero.querySelector('.home2-search');
      const heading = document.createElement('h1');
      heading.className = 'campaign-accessible-title';
      heading.textContent = data.title;
      const link = document.createElement('a');
      link.className = 'approved-art-link';
      link.href = safeUrl(data.target_url) || '/comunicacao-marketing/';
      link.setAttribute('aria-label', data.title + ' — ' + (data.cta_label || 'Conhecer soluções'));
      const picture = document.createElement('picture');
      if(mobile){
        const source = document.createElement('source');
        source.media = '(max-width: 620px)';
        source.srcset = mobile;
        picture.append(source);
      }
      const img = document.createElement('img');
      img.src = desktop;
      img.alt = [data.title, data.subtitle].filter(Boolean).join('. ');
      img.fetchPriority = 'high';
      picture.append(img);
      link.append(picture);
      hero.classList.add('approved-art');
      hero.replaceChildren(heading, link);
      if(search){
        const wrapper = document.createElement('div');
        wrapper.className = 'home2-shell approved-art-search';
        wrapper.append(search);
        hero.append(wrapper);
      }
      return;
    }
  }
  const eyebrow=hero.querySelector('.home2-hero-copy .home2-eyebrow');
  const title=hero.querySelector('.home2-hero-copy h1');
  const subtitle=hero.querySelector('.home2-hero-copy>p');
  const card=hero.querySelector('.home2-campaign-card');
  if(eyebrow)eyebrow.textContent=data.eyebrow||'Croma';
  if(title)title.textContent=data.title;
  if(subtitle&&data.subtitle)subtitle.textContent=data.subtitle;
  if(card){
    const small=card.querySelector('small'),strong=card.querySelector('strong'),copy=card.querySelector('p'),link=card.querySelector('a');
    if(small)small.textContent='CAMPANHA ATIVA';
    if(strong)strong.textContent=data.name;
    if(copy)copy.textContent=data.subtitle||'Confira a seleção preparada pela Croma.';
    if(link){
      const rawTarget=data.target_url||'#destaques';
      link.textContent=data.cta_label||'Ver campanha';
      link.href=rawTarget;
      if(/^https?:\/\//i.test(rawTarget)){link.target='_blank';link.rel='noopener noreferrer'}
      else{link.removeAttribute('target');link.removeAttribute('rel')}
    }
  }
  applyBannerBackground();
}

function renderAreas(areas){
  const root=document.querySelector('#home2Areas');
  if(!root)return;
  root.innerHTML=areas.map((area,index)=>`<a class="home2-area" href="${esc(area.public_path)}"><div><small>0${index+1}</small><h3>${esc(area.name)}</h3><p>${esc(area.description||'Conheça produtos e soluções desta área.')}</p></div><span>Explorar →</span></a>`).join('');
}

function renderTabs(){
  const root=document.querySelector('#home2HighlightTabs');
  if(!root)return;
  root.innerHTML=areaData.map(area=>`<button type="button" class="${area.slug===activeAreaSlug?'active':''}" data-area-tab="${esc(area.slug)}">${esc(area.name)}</button>`).join('');
  root.querySelectorAll('[data-area-tab]').forEach(button=>button.addEventListener('click',()=>{activeAreaSlug=button.dataset.areaTab;renderTabs();renderHighlights()}));
}
function renderHighlights(){
  const root=document.querySelector('#home2ProductGrid');
  if(!root)return;
  const area=areaBySlug(activeAreaSlug);
  if(!area){root.innerHTML='<div class="home2-empty">Os destaques estão sendo organizados.</div>';return}
  const categoryById=new Map(area.categories.map(c=>[c.id,c]));
  const rows=highlights(area);
  root.innerHTML=rows.length?rows.map(item=>{
    const media=area.media.get(item.id),category=categoryById.get(item.catalog_category_id),action=area.actions.get(item.id)||'quote',href=itemHref(item,action),external=action==='quote'?' target="_blank" rel="noopener noreferrer"':'';
    return `<article class="home2-product"><div class="home2-product-media">${media?.url?`<img src="${esc(media.url)}" alt="${esc(media.alt_text||item.nome)}" loading="lazy">`:''}</div><div class="home2-product-copy"><small>${esc(category?.nome||area.name)}</small><h3>${esc(item.nome)}</h3><div class="home2-product-price">${esc(price(item,action))}</div><a class="home2-product-action ${actionClass(action)}" href="${esc(href)}"${external}>${esc(actionLabel(action))}</a></div></article>`
  }).join(''):'<div class="home2-empty">Os destaques desta área serão adicionados em breve.</div>';
}

function renderFamilies(){
  const root=document.querySelector('#home2Families');
  if(!root)return;
  const cards=[];
  for(const area of areaData){
    const rootCategories=area.categories.filter(c=>!c.parent_id&&c.show_in_navigation!==false);
    for(const family of area.families.filter(f=>f.is_primary!==false)){
      const cats=rootCategories.filter(c=>c.family_id===family.id).slice(0,5);
      cards.push(`<article class="home2-family"><small>${esc(area.name)}</small><h3>${esc(family.nome)}</h3><p>${esc(family.descricao||'Explore esta família do catálogo Croma.')}</p><div class="home2-family-tags">${cats.map(c=>`<span>${esc(c.nome)}</span>`).join('')||'<span>Em organização</span>'}</div></article>`);
    }
  }
  root.innerHTML=cards.slice(0,9).join('')||'<div class="home2-empty">As famílias estão sendo organizadas.</div>';
}

async function renderPortfolio(){
  const root=document.querySelector('#home2Portfolio');
  if(!root)return;
  const {data,error}=await supabase.from('portfolio_items').select('title,description,image_url,image_alt').eq('active',true).eq('is_reference',false).order('sort_order').limit(4);
  if(error){console.warn('home_portfolio_error',error);root.innerHTML='<div class="home2-empty">O portfólio está sendo atualizado.</div>';return}
  root.innerHTML=data?.length?data.map(item=>`<article class="home2-portfolio"><img src="${esc(item.image_url)}" alt="${esc(item.image_alt||item.title)}" loading="lazy"><div><strong>${esc(item.title)}</strong>${item.description?`<span>${esc(item.description)}</span>`:''}</div></article>`).join(''):'<div class="home2-empty">O portfólio está sendo atualizado com trabalhos reais da Croma.</div>';
}

async function init(){
  await renderActiveBanner();
  const areas=await loadCommercialAreas();
  renderAreas(areas);
  areaData=(await Promise.all(areas.map(area=>loadCommercialArea(area.slug,{itemLimit:60})))).filter(Boolean);
  activeAreaSlug=areaData[0]?.slug||activeAreaSlug;
  renderTabs();renderHighlights();renderFamilies();
  await renderPortfolio();
}

addEventListener('resize',()=>{if(activeBanner)applyBannerBackground()});
init().catch(error=>{console.error('home_v2_error',error);document.querySelector('#home2ProductGrid')?.replaceChildren(Object.assign(document.createElement('div'),{className:'home2-empty',textContent:'Não foi possível carregar os destaques agora.'}))});
