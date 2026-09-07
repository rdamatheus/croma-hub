import { carregarVitrineHome } from './data-service.js';
import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

function renderFamilies(items){
  const root=document.querySelector('#homeServiceFamilies');
  if(!root)return;
  if(!items.length){root.innerHTML='<div class="home-empty">As famílias de serviços estão sendo organizadas.</div>';return}
  root.innerHTML=items.slice(0,8).map(item=>`<a class="home-family-card" href="${esc(item.href)}"><div class="home-family-media">${item.imagem?`<img src="${esc(item.imagem)}" alt="${esc(item.nome)}" loading="lazy">`:''}</div><div class="home-family-copy"><strong>${esc(item.nome)}</strong>${item.descricao?`<p>${esc(item.descricao)}</p>`:''}</div></a>`).join('');
}

function renderProducts(items){
  const root=document.querySelector('#homeProductGrid');
  if(!root)return;
  if(!items.length){root.innerHTML='<div class="home-empty">Nenhum produto foi publicado na vitrine ainda.</div>';return}
  root.innerHTML=items.slice(0,8).map(item=>`<a class="home-product-card" href="${esc(item.href)}"><div class="home-product-media">${item.imagem?`<img src="${esc(item.imagem)}" alt="${esc(item.nome)}" loading="lazy">`:''}</div><div class="home-product-copy"><small>${esc(item.categoria||'Produto')}</small><h3>${esc(item.nome)}</h3>${item.precoVenda?`<p class="home-product-price">${esc(money(item.precoVenda))}</p>`:''}</div></a>`).join('');
}

async function renderPortfolio(){
  const root=document.querySelector('#homePortfolioGrid');
  if(!root)return;
  const {data,error}=await supabase.from('portfolio_items').select('title,description,image_url,image_alt').eq('active',true).order('sort_order').limit(4);
  if(error){console.warn('Não foi possível carregar o portfólio.',error);return}
  if(!data?.length){root.innerHTML='<div class="home-empty">O portfólio está sendo atualizado com trabalhos reais da Croma.</div>';return}
  root.innerHTML=data.map(item=>`<article class="home-portfolio-card"><img src="${esc(item.image_url)}" alt="${esc(item.image_alt||item.title)}" loading="lazy"><div class="home-portfolio-copy"><strong>${esc(item.title)}</strong>${item.description?`<span>${esc(item.description)}</span>`:''}</div></article>`).join('');
}

async function init(){
  const showcase=await carregarVitrineHome(8);
  renderFamilies(showcase.servicos||[]);
  renderProducts(showcase.produtos||[]);
  await renderPortfolio();
}

init().catch(error=>console.error('home_init_error',error));
