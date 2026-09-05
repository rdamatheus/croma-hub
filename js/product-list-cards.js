const supabase=window.__cromaSupabase;
if(!supabase)throw new Error('Supabase indisponível para os cards de produtos.');

const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
const productMap=new Map();
const categoryMap=new Map();
const mediaMap=new Map();
let decorating=false;

function addStyles(){
  if(document.querySelector('#productListCardsStyles'))return;
  const st=document.createElement('style');
  st.id='productListCardsStyles';
  st.textContent=`
  #productList{gap:10px!important}
  .product-row[data-product-id]{
    width:100%;box-sizing:border-box;display:grid!important;
    grid-template-columns:78px minmax(230px,1.7fr) minmax(150px,.9fr) minmax(120px,.7fr) minmax(155px,.9fr) auto!important;
    gap:14px!important;align-items:center!important;padding:12px!important;border-radius:16px!important;
    border:1px solid #e6e3ee!important;background:#fff!important;box-shadow:0 2px 8px rgba(33,28,92,.03);
    transition:.16s ease;position:relative;overflow:hidden
  }
  .product-row[data-product-id]:hover{transform:translateY(-1px);border-color:#aaa3d7!important;box-shadow:0 10px 24px rgba(48,41,127,.10)!important}
  .product-row[data-product-id].selected{border-color:var(--croma-purple)!important;box-shadow:0 0 0 2px rgba(48,41,127,.08),0 10px 24px rgba(48,41,127,.10)!important}
  .product-card-thumb{width:68px;height:68px;border-radius:13px;border:1px solid #ece9f3;background:#f5f3fa;overflow:hidden;display:grid;place-items:center;flex:none}
  .product-card-thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .product-card-placeholder{font-size:1.4rem;color:#8c86b6;font-weight:900}
  .product-card-main{min-width:0}
  .product-card-main .product-name{font-size:.92rem;line-height:1.25;margin:0 0 5px;display:flex;align-items:center;gap:7px;white-space:normal}
  .product-card-main .category-icon{display:none!important}
  .product-card-code{font-size:.77rem;color:var(--croma-muted);margin-bottom:5px}
  .product-card-tags{display:flex;gap:6px;flex-wrap:wrap}
  .product-card-tag{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#f3f1f8;color:#5d5685;font-size:.68rem;font-weight:850}
  .product-card-tag.ok{background:#edf7e8;color:#426920}.product-card-tag.warn{background:#fff4d8;color:#725d00}.product-card-tag.off{background:#f2f2f2;color:#777}
  .product-card-field{min-width:0}.product-card-label{display:block;font-size:.66rem;text-transform:uppercase;letter-spacing:.03em;color:var(--croma-muted);font-weight:850;margin-bottom:4px}
  .product-card-value{display:block;color:var(--croma-deep);font-size:.83rem;font-weight:850;line-height:1.28;white-space:normal}
  .product-card-open{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--croma-line);background:#fff;color:var(--croma-purple);border-radius:10px;padding:9px 11px;font-size:.76rem;font-weight:900;white-space:nowrap;pointer-events:none}
  .segment-summary-row{display:none!important}
  .catalog-filter{border-radius:20px!important;box-shadow:0 4px 16px rgba(33,28,92,.04)}
  .catalog-filter .filter-field{margin-bottom:12px}.catalog-filter .filter-field select{padding:10px 11px!important;border-radius:11px!important}
  .catalog-filter-btn{padding-top:9px!important;padding-bottom:9px!important}
  @media(max-width:1080px){.product-row[data-product-id]{grid-template-columns:72px minmax(220px,1.5fr) minmax(130px,.8fr) minmax(120px,.7fr) auto!important}.product-card-bling{display:none}}
  @media(max-width:820px){.product-row[data-product-id]{grid-template-columns:68px minmax(0,1fr) auto!important}.product-card-category,.product-card-price,.product-card-bling{display:none}.product-card-thumb{width:58px;height:58px}.product-card-open{padding:8px}}
  `;
  document.head.appendChild(st);
}

function imageFromProduct(p){
  const meta=p?.metadata||{};
  return mediaMap.get(p?.id)||meta.imagem||meta.image_url||meta.imagem_principal||meta.image||'';
}

function categoryName(id){return categoryMap.get(id)?.nome||'Sem categoria';}
function typeLabel(t){return t==='servico'?'Serviço':'Produto';}
function blingLabel(p){
  if(p?.bling_sync_status==='sincronizado')return['Bling sincronizado','ok'];
  if(p?.bling_product_id)return['Bling vinculado','warn'];
  return['Sem vínculo Bling','off'];
}

function decorateRow(row){
  const p=productMap.get(row.dataset.productId);
  if(!p)return;
  const img=imageFromProduct(p);
  const [blingText,blingClass]=blingLabel(p);
  const imageText=img?'Com foto':'Sem foto';
  const imageClass=img?'ok':'off';
  row.innerHTML=`
    <span class="product-card-thumb">${img?`<img src="${esc(img)}" alt="${esc(p.nome||'Produto')}" loading="lazy" onerror="this.remove();this.parentElement.innerHTML='<span class=&quot;product-card-placeholder&quot;>📦</span>'">`:'<span class="product-card-placeholder">📦</span>'}</span>
    <span class="product-card-main">
      <span class="product-name"><span class="category-icon"></span>${esc(p.nome||'Produto')}</span>
      <span class="product-card-code">Código Croma: ${esc(p.sku||'—')}${p.bling_sku&&p.bling_sku!==p.sku?` · SKU Bling: ${esc(p.bling_sku)}`:''}</span>
      <span class="product-card-tags"><span class="product-card-tag">${esc(typeLabel(p.product_type))}</span><span class="product-card-tag ${p.ativo?'ok':'off'}">${p.ativo?'Ativo':'Inativo'}</span><span class="product-card-tag ${imageClass}">${imageText}</span></span>
      <span class="segment-summary-row"></span>
    </span>
    <span class="product-card-field product-card-category"><span class="product-card-label">Categoria</span><span class="product-card-value">${esc(categoryName(p.catalog_category_id))}</span></span>
    <span class="product-card-field product-card-price"><span class="product-card-label">Preço</span><span class="product-card-value">${esc(money(p.preco))}</span></span>
    <span class="product-card-field product-card-bling"><span class="product-card-label">Integração</span><span class="product-card-value"><span class="product-card-tag ${blingClass}">${esc(blingText)}</span></span><span class="product-meta" style="margin-top:4px">ID: ${esc(p.bling_product_id||'—')}</span></span>
    <span class="product-card-open">Abrir ficha →</span>`;
  row.dataset.cardUi='1';
  row.title='Clique para abrir e editar este cadastro';
}

function decorateAll(){
  if(decorating)return;
  decorating=true;
  try{
    document.querySelectorAll('.product-row[data-product-id]').forEach(decorateRow);
  }finally{decorating=false;}
}

async function loadCategories(){
  const {data,error}=await supabase.from('catalog_categories').select('id,nome');
  if(error)throw error;
  for(const c of data||[])categoryMap.set(c.id,c);
}

async function loadProductsForVisibleRows(){
  const ids=[...new Set([...document.querySelectorAll('.product-row[data-product-id]')].map(r=>r.dataset.productId).filter(Boolean))];
  for(let i=0;i<ids.length;i+=180){
    const chunk=ids.slice(i,i+180);
    const {data,error}=await supabase.from('products').select('id,nome,sku,preco,ativo,product_type,catalog_category_id,bling_product_id,bling_sku,bling_sync_status,metadata').in('id',chunk);
    if(error)throw error;
    for(const p of data||[])productMap.set(p.id,p);
  }
}

async function loadMedia(){
  let from=0;
  const size=900;
  for(;;){
    const {data,error}=await supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo').eq('ativo',true).order('is_primary',{ascending:false}).order('ordem',{ascending:true}).range(from,from+size-1);
    if(error)throw error;
    const rows=data||[];
    for(const m of rows)if(m.product_id&&!mediaMap.has(m.product_id)&&m.url)mediaMap.set(m.product_id,m.url);
    if(rows.length<size)break;
    from+=size;
    if(from>5000)break;
  }
}

function watchList(){
  const list=document.querySelector('#productList');
  if(!list)return;
  let timer;
  new MutationObserver(()=>{
    clearTimeout(timer);
    timer=setTimeout(async()=>{
      try{
        await loadProductsForVisibleRows();
        decorateAll();
      }catch(e){console.error('Falha ao atualizar cards de produtos:',e);}
    },80);
  }).observe(list,{childList:true,subtree:false});
}

async function init(){
  for(let i=0;i<100;i++){
    if(document.querySelector('#productList'))break;
    await sleep(50);
  }
  addStyles();
  await Promise.all([loadCategories(),loadMedia()]);
  await loadProductsForVisibleRows();
  decorateAll();
  watchList();
}

init().catch(e=>console.error('Falha no redesign da lista de produtos:',e));
