import { searchCommercialCatalog } from './commercial-areas-data.js';

const root=document.querySelector('#searchResults');
const form=document.querySelector('#commercialSearchForm');
const input=document.querySelector('#commercialSearchInput');
const status=document.querySelector('#searchStatus');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const params=new URLSearchParams(location.search);
const initial=(params.get('q')||'').trim();
const quoteBase='https://wa.me/553230253588?text=';

function label(action){return action==='configure'?'Configurar e comprar':action==='quote'?'Solicitar orçamento':'Comprar'}
function cls(action){return action==='configure'?'configure':action==='quote'?'quote':''}
function price(item,action){
  if(action==='quote')return 'Orçamento personalizado';
  const value=Number(item.preco||item.commercial_min_price||0);
  return value>0?money(value):'Solicite orçamento';
}
function hrefFor(item,action){
  if(action==='quote')return `${quoteBase}${encodeURIComponent(`Olá! Vim pela busca do site da Croma e gostaria de solicitar orçamento para ${item.nome}.`)}`;
  return `/produtos/?produto=${encodeURIComponent(item.slug||item.id)}`;
}

async function run(term){
  const q=String(term||'').trim();
  if(!q){status.textContent='Digite o que você procura.';root.innerHTML='<div class="search-empty">Exemplos: cartão, adesivo, caderno, placa, cabo, presente, site.</div>';return}
  status.textContent='Buscando no catálogo...';root.innerHTML='';
  try{
    const data=await searchCommercialCatalog(q,{limit:80});
    const categoryById=new Map(data.categories.map(c=>[c.id,c]));
    const familyById=new Map(data.families.map(f=>[f.id,f]));
    const count=data.items.length;
    status.textContent=count?`${count} resultado${count===1?'':'s'} para “${data.query}”.`:`Nenhum resultado para “${data.query}”.`;
    if(!count){root.innerHTML='<div class="search-empty">Não encontrei um item com esse termo. Tente uma palavra mais ampla ou solicite um orçamento para um projeto personalizado.</div>';return}
    root.innerHTML=`<div class="search-grid">${data.items.map(item=>{
      const category=categoryById.get(item.catalog_category_id),family=category?familyById.get(category.family_id):null,action=data.actions.get(item.id)||'quote',media=data.media.get(item.id),href=hrefFor(item,action),external=action==='quote'?' target="_blank" rel="noopener noreferrer"':'';
      return `<article class="search-card"><div class="search-media">${media?.url?`<img src="${esc(media.url)}" alt="${esc(media.alt_text||item.nome)}" loading="lazy">`:''}</div><div class="search-copy"><small>${esc(category?.nome||family?.nome||'Croma')}</small><h2>${esc(item.nome)}</h2><div class="search-price">${esc(price(item,action))}</div><a class="search-action ${cls(action)}" href="${esc(href)}"${external}>${esc(label(action))}</a></div></article>`
    }).join('')}</div>`;
  }catch(error){console.error('commercial_search_error',error);status.textContent='Não foi possível concluir a busca agora.';root.innerHTML='<div class="search-empty">Tente novamente em instantes.</div>'}
}

form?.addEventListener('submit',event=>{event.preventDefault();const q=input.value.trim();const url=new URL(location.href);if(q)url.searchParams.set('q',q);else url.searchParams.delete('q');history.replaceState({},'',url.pathname+url.search);run(q)});
input.value=initial;
run(initial);
