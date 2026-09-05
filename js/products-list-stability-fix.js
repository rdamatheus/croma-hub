import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
const PAGE=1000;
let allProducts=[],mediaMap=new Map(),typeFilter='',statusFilter='';

async function fetchAll(build){
  const out=[];
  for(let from=0;;from+=PAGE){
    const {data,error}=await build().range(from,from+PAGE-1);
    if(error)throw error;
    const rows=data||[];out.push(...rows);
    if(rows.length<PAGE)break;
  }
  return out;
}

function styles(){
  if(document.querySelector('#productsStabilityStyles'))return;
  const s=document.createElement('style');s.id='productsStabilityStyles';s.textContent=`
  .croma-list-filter{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:12px 0}.croma-list-filter label{display:grid;gap:4px;font-size:.68rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple)}.croma-list-filter select{padding:9px 10px;border:1px solid #d8d6e4;border-radius:9px;background:#fff;font:inherit;text-transform:none;font-weight:600;color:#3f3b54}
  .product-row.croma-row-with-thumb{grid-template-columns:58px minmax(180px,1.6fr) minmax(120px,.8fr) minmax(120px,.7fr) minmax(120px,.7fr) auto}.croma-list-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;background:#efedf5;display:grid;place-items:center}.croma-list-thumb img{width:100%;height:100%;object-fit:cover;display:block}.croma-list-thumb span{font-size:.65rem;color:#8a8598;text-align:center}.croma-open-link{white-space:nowrap}
  @media(max-width:950px){.product-row.croma-row-with-thumb{grid-template-columns:58px 1fr 1fr}.product-row.croma-row-with-thumb>.croma-list-thumb{grid-column:1}.product-row.croma-row-with-thumb>div:nth-child(2){grid-column:2/-1}}
  @media(max-width:650px){.product-row.croma-row-with-thumb{grid-template-columns:52px 1fr}.croma-list-thumb{width:52px;height:52px}.product-row.croma-row-with-thumb>*{grid-column:auto!important}.product-row.croma-row-with-thumb>div:nth-child(2){grid-column:2}}
  `;document.head.appendChild(s);
}

function filters(){
  if(document.querySelector('#cromaProductTypeFilter'))return;
  const list=document.querySelector('#productList');if(!list)return;
  const bar=document.createElement('div');bar.className='croma-list-filter';bar.innerHTML=`<label>Tipo<select id="cromaProductTypeFilter"><option value="">Todos</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select></label><label>Status<select id="cromaProductStatusFilter"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>`;list.before(bar);
  bar.querySelector('#cromaProductTypeFilter').onchange=e=>{typeFilter=e.target.value;apply()};
  bar.querySelector('#cromaProductStatusFilter').onchange=e=>{statusFilter=e.target.value;apply()};
}

function apply(){
  const rows=[...document.querySelectorAll('#productList [data-product-id]')];let visible=0;
  for(const row of rows){const p=allProducts.find(x=>x.id===row.dataset.productId);const okType=!typeFilter||p?.product_type===typeFilter;const okStatus=!statusFilter||(statusFilter==='active'?p?.ativo===true:p?.ativo===false);row.style.display=okType&&okStatus?'':'none';if(okType&&okStatus)visible++}
  const count=document.querySelector('#productCount');if(count&&rows.length)count.textContent=`${visible} de ${allProducts.length} item(ns)`;
}

function decorate(){
  for(const row of document.querySelectorAll('#productList [data-product-id]')){
    const id=row.dataset.productId,p=allProducts.find(x=>x.id===id);if(!p)continue;
    row.dataset.type=p.product_type||'';row.dataset.active=String(!!p.ativo);
    if(!row.querySelector('.croma-list-thumb')){
      row.classList.add('croma-row-with-thumb');const box=document.createElement('div');box.className='croma-list-thumb';const url=mediaMap.get(id);box.innerHTML=url?`<img src="${esc(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span>Sem foto</span>'">`:'<span>Sem foto</span>';row.prepend(box);
    }
    const old=[...row.querySelectorAll('.btn.light')].find(x=>/editar/i.test(x.textContent||''));
    if(old&&!row.querySelector('.croma-open-link')){const a=document.createElement('a');a.className='btn light croma-open-link';a.textContent='Abrir ficha';a.href=`${location.pathname}?produto=${encodeURIComponent(id)}`;a.onclick=e=>e.stopPropagation();old.replaceWith(a)}
  }
  apply();
}

async function loadData(){
  allProducts=await fetchAll(()=>supabase.from('products').select('id,nome,sku,product_type,ativo,bling_product_id').order('nome'));
  const media=await fetchAll(()=>supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem'));
  mediaMap=new Map();for(const m of media)if(!mediaMap.has(m.product_id)&&m.url)mediaMap.set(m.product_id,m.url);
}

async function init(){
  styles();filters();await loadData();decorate();
  const list=document.querySelector('#productList');if(list)new MutationObserver(()=>decorate()).observe(list,{childList:true,subtree:true});
  document.addEventListener('click',e=>{const row=e.target.closest?.('#productList [data-product-id]');if(!row||e.target.closest('a'))return;const id=row.dataset.productId;setTimeout(()=>{if(!document.querySelector('#editor.open'))location.href=`${location.pathname}?produto=${encodeURIComponent(id)}`},450)},true);
  const wanted=new URLSearchParams(location.search).get('produto');if(wanted)setTimeout(()=>{if(!document.querySelector('#editor.open')){const row=document.querySelector(`#productList [data-product-id="${CSS.escape(wanted)}"]`);row?.click()}},900);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error));else init().catch(console.error);
