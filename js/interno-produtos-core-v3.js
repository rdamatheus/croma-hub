import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const session = await protectInternalPage({ roles:['owner','manager'] });
if (!session) throw new Error('auth');

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const val = id => $('#'+id)?.value ?? '';
const num = id => val(id)==='' ? null : Number(val(id));
const txt = id => val(id).trim() || null;
const PAGE_SIZE = 500;
const UI_PAGE_SIZE = 50;
const params = new URLSearchParams(location.search);
const detailProductId = params.get('produto') || '';
const detailMode = params.get('modo') === 'ficha' && !!detailProductId;

let products=[];
let categories=[];
let suppliers=[];
let detailsRows=[];
let supplierLinks=[];
let stockSnapshots=[];
let mediaMap=new Map();
let detailsMap=new Map();
let supplierMap=new Map();
let supplierNameMap=new Map();
let stockMap=new Map();
let childrenMap=new Map();
let currentProduct=null;
let details={};
let stock=null;
let supplierLink=null;
let groups=[];
let variants=[];
let dirty=false;
let uiPage=1;
let filters={type:'',status:'',category:'',bling:'',structure:'',production:'',stock:'',brand:'',supplier:'',content:'',scope:''};
let columns=loadColumns();

function loadColumns(){
  try{return {...{category:true,stock:true,price:true,origin:true,supplier:false,sync:true},...JSON.parse(localStorage.getItem('croma_products_columns')||'{}')}}catch{return {category:true,stock:true,price:true,origin:true,supplier:false,sync:true}}
}
function saveColumns(){localStorage.setItem('croma_products_columns',JSON.stringify(columns));}

async function fetchAll(build){
  const out=[];
  for(let from=0;;from+=PAGE_SIZE){
    const {data,error}=await build().range(from,from+PAGE_SIZE-1);
    if(error) throw error;
    const rows=data||[];
    out.push(...rows);
    if(rows.length<PAGE_SIZE) break;
  }
  return out;
}

function setDirty(v=true){
  dirty=v;
  const el=$('#dirty');
  if(el){el.textContent=v?'Alterações não salvas':'Nenhuma alteração pendente';el.classList.toggle('clean',!v);}
}
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});

function categoryPath(c){
  if(!c?.nome) return '';
  const names=[c.nome];
  let p=categories.find(x=>x.id===c.parent_id),guard=0;
  while(p&&guard++<8){names.unshift(p.nome);p=categories.find(x=>x.id===p.parent_id);}
  return names.join(' › ');
}
function categoryMatches(productCategoryId,selectedId){
  if(!selectedId) return true;
  let c=categories.find(x=>x.id===productCategoryId),guard=0;
  while(c&&guard++<8){if(c.id===selectedId)return true;c=categories.find(x=>x.id===c.parent_id);}
  return false;
}
function detailHref(id){return `/interno/produtos/?produto=${encodeURIComponent(id)}&modo=ficha`;}
function fmtMoney(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
function fmtQty(v){if(v===null||v===undefined||v==='')return '—';const n=Number(v);return Number.isFinite(n)?n.toLocaleString('pt-BR',{maximumFractionDigits:3}):'—';}
function detailOf(id){return detailsMap.get(id)||{};}
function stockOf(id){return stockMap.get(id)||null;}
function supplierOf(id){const link=supplierMap.get(id);return link?supplierNameMap.get(link.supplier_id)||'Fornecedor':'—';}
function productAvailability(p){
  const children=childrenMap.get(p.id)||[];
  if(children.length){
    const values=children.map(c=>stockOf(c.id)?.available_stock).filter(v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)));
    if(values.length)return values.reduce((a,b)=>a+Number(b),0);
  }
  return stockOf(p.id)?.available_stock ?? null;
}
function structureKey(p){
  const hasChildren=(childrenMap.get(p.id)||[]).length>0;
  if(p.parent_product_id&&p.product_format==='composition')return 'variation_composition';
  if(p.parent_product_id)return 'variation';
  if(hasChildren)return 'parent';
  if(p.product_format==='composition')return 'composition';
  return 'simple';
}
function structureLabel(p){return ({simple:'Simples',parent:'Pai com variações',variation:'Variação',composition:'Composição',variation_composition:'Variação + composição'})[structureKey(p)]||'Simples';}
function productionLabel(v){return ({producao_interna:'Produção interna',terceirizado:'Terceirizado',revenda:'Revenda',misto:'Misto'})[v]||'Não informado';}
function syncBadge(p){
  if(p.bling_sync_status==='sincronizado') return '<span class="pill ok">Sincronizado</span>';
  if(p.bling_sync_status==='erro') return '<span class="pill off">Erro</span>';
  if(p.bling_product_id) return '<span class="pill">Vinculado</span>';
  return '<span class="pill off">Sem vínculo</span>';
}

function injectStyles(){
  if($('#productsCoreStyles')) return;
  const s=document.createElement('style');s.id='productsCoreStyles';s.textContent=`
  .products-workspace{display:grid;grid-template-columns:300px minmax(0,1fr);gap:16px;align-items:start}.products-filters{background:#fff;border:1px solid var(--croma-line);border-radius:18px;padding:16px;position:sticky;top:86px;box-shadow:0 10px 28px rgba(33,28,92,.04)}.products-filters h3{margin:0 0 4px;color:var(--croma-purple);font-size:1rem}.products-filter-note{margin:0 0 15px;color:var(--croma-muted);font-size:.78rem;line-height:1.4}.products-filters label{display:grid;gap:6px;margin:0 0 12px;font-size:.68rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple)}.products-filters select{width:100%;padding:10px 11px;border:1px solid #d8d6e4;border-radius:10px;background:#fff;font:inherit;text-transform:none;color:#3f3b54}.advanced-filters,.column-settings{border-top:1px solid #ece9f3;padding-top:10px;margin-top:8px}.advanced-filters summary,.column-settings summary{cursor:pointer;font-weight:900;color:var(--croma-purple);font-size:.82rem;margin-bottom:10px}.filter-actions{display:flex;gap:8px;margin-top:12px}.filter-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}.filter-chip{border:0;border-radius:999px;padding:5px 9px;background:#f0eef8;color:var(--croma-purple);font-size:.72rem;font-weight:800;cursor:pointer}.column-check{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:7px!important;margin:8px 0!important;text-transform:none!important;font-size:.78rem!important;color:#4e4960!important}.column-check input{width:16px;height:16px}.products-main{min-width:0}.products-list-tools{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}.products-list-tools .search{flex:1;min-width:260px}.product-list{display:grid;gap:8px}.product-row{display:grid!important;gap:10px;align-items:center;padding:12px 14px;border:1px solid #e6e3ee;border-radius:14px;background:#fff;color:inherit;cursor:pointer}.product-row:hover,.product-row.selected{border-color:#8f89c2;box-shadow:0 8px 22px #30297f12}.core-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;background:#efedf5;display:grid;place-items:center}.core-thumb img{width:100%;height:100%;object-fit:cover}.core-thumb span{font-size:.65rem;color:#8a8598;text-align:center}.core-open{white-space:nowrap}.core-pagebar{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:12px 0}.core-pagebar button{padding:8px 10px}.product-name{font-weight:900;color:var(--croma-deep)}.product-meta{font-size:.78rem;color:var(--croma-muted)}.data-cell strong{font-size:.86rem}.stock-positive{color:#426920}.stock-zero{color:#766b32}.stock-negative{color:#a63838}.pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#f0eef8;color:var(--croma-purple);font-size:.72rem;font-weight:900}.pill.ok{background:#edf7e8;color:#426920}.pill.off{background:#f4f4f4;color:#777}.list-head{display:none!important}.core-filterbar,#cromaProductStatus,.croma-edit-chip{display:none!important}.product-detail-mode #importCard,.product-detail-mode #corePager{display:none!important}.product-detail-mode #editor{display:block!important}.products-detail-back{display:inline-flex;margin-bottom:14px}.detail-stock-summary{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:12px 14px;margin:10px 0 0;border:1px solid #e6e3ee;border-radius:12px;background:#faf9fd}.detail-stock-summary strong{font-size:1.15rem;color:var(--croma-deep)}
  @media(max-width:1050px){.products-workspace{grid-template-columns:1fr}.products-filters{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.products-filters h3,.products-filter-note,.advanced-filters,.column-settings,.filter-actions{grid-column:1/-1}.products-filters label{margin:0}.product-row{grid-template-columns:58px 1fr!important}.product-row .data-cell{grid-column:2/-1}.product-row>div:nth-child(2){grid-column:2/-1}}
  @media(max-width:650px){.products-filters{grid-template-columns:1fr}.products-filters h3,.products-filter-note,.advanced-filters,.column-settings,.filter-actions{grid-column:auto}.product-row{grid-template-columns:52px 1fr!important}.core-thumb{width:52px;height:52px}}
  `;document.head.appendChild(s);
}

function rowTemplate(){
  const tracks=['58px','minmax(220px,1.6fr)'];
  if(columns.category)tracks.push('minmax(135px,.9fr)');
  if(columns.stock)tracks.push('minmax(90px,.55fr)');
  if(columns.price)tracks.push('minmax(105px,.62fr)');
  if(columns.origin)tracks.push('minmax(120px,.75fr)');
  if(columns.supplier)tracks.push('minmax(130px,.8fr)');
  if(columns.sync)tracks.push('minmax(125px,.75fr)');
  tracks.push('auto');return tracks.join(' ');
}

function buildWorkspace(){
  if(detailMode)return;
  const list=$('#productList'),card=list?.closest('.card');if(!list||!card||$('#productsWorkspace'))return;
  card.querySelectorAll('.core-filterbar').forEach(x=>x.remove());
  const oldHead=card.querySelector('.list-head'),search=$('#productSearch'),count=$('#productCount');
  if(search)search.placeholder='Buscar por nome, SKU, GTIN, marca, Bling ou categoria';
  const workspace=document.createElement('div');workspace.id='productsWorkspace';workspace.className='products-workspace';
  const side=document.createElement('aside');side.className='products-filters';side.innerHTML=`
    <h3>Filtros do cadastro</h3><p class="products-filter-note">Filtros operacionais do Bling + organização própria da Croma.</p>
    <label>Status<select id="filterStatus"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
    <label>Categoria<select id="filterCategory"><option value="">Todas</option></select></label>
    <label>Estrutura<select id="filterStructure"><option value="">Todas</option><option value="simple">Simples</option><option value="parent">Pais com variações</option><option value="variation">Variações</option><option value="composition">Com composição</option></select></label>
    <label>Estoque<select id="filterStock"><option value="">Todos</option><option value="positive">Com saldo</option><option value="zero">Saldo zero</option><option value="negative">Saldo negativo</option><option value="below_min">Abaixo do mínimo</option><option value="unknown">Sem saldo sincronizado</option></select></label>
    <details class="advanced-filters"><summary>Mais filtros</summary>
      <label>Origem operacional<select id="filterProduction"><option value="">Todas</option><option value="producao_interna">Produção interna</option><option value="terceirizado">Terceirizado</option><option value="revenda">Revenda</option><option value="misto">Misto</option><option value="unknown">Não informado</option></select></label>
      <label>Marca<select id="filterBrand"><option value="">Todas</option></select></label>
      <label>Fornecedor<select id="filterSupplier"><option value="">Todos</option></select></label>
      <label>Integração Bling<select id="filterBling"><option value="">Todos</option><option value="linked">Vinculados</option><option value="unlinked">Sem vínculo</option><option value="synced">Sincronizados</option><option value="error">Com erro</option></select></label>
      <label>Tipo<select id="filterType"><option value="">Todos</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select></label>
      <label>Conteúdo<select id="filterContent"><option value="">Todos</option><option value="image">Com imagem</option><option value="no_image">Sem imagem</option><option value="gtin">Com GTIN</option><option value="no_gtin">Sem GTIN</option><option value="ncm">Com NCM</option><option value="no_ncm">Sem NCM</option></select></label>
      <label>Uso<select id="filterScope"><option value="">Todos</option><option value="commercial">Comercial</option><option value="input">Insumo interno</option><option value="site">Elegível para catálogo</option></select></label>
    </details>
    <details class="column-settings"><summary>Colunas</summary>${Object.entries({category:'Categoria',stock:'Disponível',price:'Preço',origin:'Origem',supplier:'Fornecedor',sync:'Integração'}).map(([k,n])=>`<label class="column-check"><input type="checkbox" data-col="${k}" ${columns[k]?'checked':''}> ${n}</label>`).join('')}</details>
    <div class="filter-actions"><button class="btn light" id="clearProductFilters" type="button">Limpar filtros</button></div>`;
  const main=document.createElement('div');main.className='products-main';const chips=document.createElement('div');chips.id='filterChips';chips.className='filter-chips';const tools=document.createElement('div');tools.className='products-list-tools';if(search)tools.appendChild(search);if(count)tools.appendChild(count);main.append(chips,tools,list);workspace.append(side,main);card.appendChild(workspace);if(oldHead)oldHead.style.display='none';
  const bind=(id,key)=>$('#'+id)?.addEventListener('change',e=>{filters[key]=e.target.value;uiPage=1;renderList();});
  bind('filterType','type');bind('filterStatus','status');bind('filterCategory','category');bind('filterBling','bling');bind('filterStructure','structure');bind('filterProduction','production');bind('filterStock','stock');bind('filterBrand','brand');bind('filterSupplier','supplier');bind('filterContent','content');bind('filterScope','scope');
  search?.addEventListener('input',()=>{uiPage=1;renderList();});
  $('#clearProductFilters')?.addEventListener('click',()=>{filters={type:'',status:'',category:'',bling:'',structure:'',production:'',stock:'',brand:'',supplier:'',content:'',scope:''};side.querySelectorAll('select').forEach(s=>s.value='');if(search)search.value='';uiPage=1;renderList();});
  side.querySelectorAll('[data-col]').forEach(input=>input.addEventListener('change',e=>{columns[e.target.dataset.col]=e.target.checked;saveColumns();renderList();}));
}

function refreshFilters(){
  const cat=$('#filterCategory');if(cat){const current=cat.value;const rows=[...categories].filter(c=>c.ativo!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||String(a.nome||'').localeCompare(String(b.nome||'')));cat.innerHTML='<option value="">Todas</option>'+rows.map(c=>`<option value="${c.id}">${esc(categoryPath(c))}</option>`).join('');cat.value=current;}
  const brand=$('#filterBrand');if(brand){const current=brand.value;const vals=[...new Set(detailsRows.map(x=>x.brand).filter(Boolean))].sort((a,b)=>a.localeCompare(b));brand.innerHTML='<option value="">Todas</option>'+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');brand.value=current;}
  const sup=$('#filterSupplier');if(sup){const current=sup.value;sup.innerHTML='<option value="">Todos</option>'+suppliers.filter(s=>s.active!==false).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');sup.value=current;}
}

function filteredRows(){
  const q=($('#productSearch')?.value||'').trim().toLowerCase();
  return products.filter(p=>{
    const d=detailOf(p.id),st=stockOf(p.id),available=productAvailability(p),sk=structureKey(p),supplier=supplierMap.get(p.id);
    if(filters.type&&p.product_type!==filters.type)return false;
    if(filters.status==='active'&&p.ativo!==true)return false;if(filters.status==='inactive'&&p.ativo!==false)return false;
    if(filters.category&&!categoryMatches(p.catalog_category_id,filters.category))return false;
    if(filters.bling==='linked'&&!p.bling_product_id)return false;if(filters.bling==='unlinked'&&p.bling_product_id)return false;if(filters.bling==='synced'&&p.bling_sync_status!=='sincronizado')return false;if(filters.bling==='error'&&p.bling_sync_status!=='erro')return false;
    if(filters.structure==='parent'&&sk!=='parent')return false;if(filters.structure==='variation'&&!['variation','variation_composition'].includes(sk))return false;if(filters.structure==='composition'&&!['composition','variation_composition'].includes(sk))return false;if(filters.structure==='simple'&&sk!=='simple')return false;
    if(filters.production==='unknown'&&d.production_mode)return false;if(filters.production&&filters.production!=='unknown'&&d.production_mode!==filters.production)return false;
    if(filters.brand&&d.brand!==filters.brand)return false;if(filters.supplier&&supplier?.supplier_id!==filters.supplier)return false;
    if(filters.stock==='unknown'&&available!==null)return false;if(filters.stock==='positive'&&!(Number(available)>0))return false;if(filters.stock==='zero'&&!(available!==null&&Number(available)===0))return false;if(filters.stock==='negative'&&!(Number(available)<0))return false;if(filters.stock==='below_min'&&!(available!==null&&st?.minimum_stock!==null&&Number(available)<Number(st.minimum_stock)))return false;
    if(filters.content==='image'&&!mediaMap.has(p.id))return false;if(filters.content==='no_image'&&mediaMap.has(p.id))return false;if(filters.content==='gtin'&&!d.gtin)return false;if(filters.content==='no_gtin'&&d.gtin)return false;if(filters.content==='ncm'&&!d.ncm)return false;if(filters.content==='no_ncm'&&d.ncm)return false;
    if(filters.scope==='commercial'&&(p.is_input||!p.is_sellable))return false;if(filters.scope==='input'&&!p.is_input)return false;if(filters.scope==='site'&&!(p.product_type==='produto'&&p.ativo&&p.is_sellable&&!p.is_input))return false;
    if(!q)return true;
    const cat=categoryPath(categories.find(c=>c.id===p.catalog_category_id));
    return [p.nome,p.sku,p.bling_sku,p.bling_product_id,cat,d.gtin,d.barcode,d.brand,d.model,supplierOf(p.id)].some(v=>String(v??'').toLowerCase().includes(q));
  });
}

function renderChips(){
  const host=$('#filterChips');if(!host)return;const labels={status:'Status',category:'Categoria',structure:'Estrutura',stock:'Estoque',production:'Origem',brand:'Marca',supplier:'Fornecedor',bling:'Bling',type:'Tipo',content:'Conteúdo',scope:'Uso'};
  host.innerHTML=Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`<button class="filter-chip" type="button" data-clear-filter="${k}">${labels[k]||k}: ${esc(k==='category'?categoryPath(categories.find(c=>c.id===v)):k==='supplier'?supplierNameMap.get(v)||v:v)} ×</button>`).join('');
  host.querySelectorAll('[data-clear-filter]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.clearFilter;filters[k]='';const id={status:'filterStatus',category:'filterCategory',structure:'filterStructure',stock:'filterStock',production:'filterProduction',brand:'filterBrand',supplier:'filterSupplier',bling:'filterBling',type:'filterType',content:'filterContent',scope:'filterScope'}[k];if(id&&$('#'+id))$('#'+id).value='';uiPage=1;renderList();}));
}

function renderList(){
  if(detailMode)return;const list=$('#productList');if(!list)return;renderChips();const rows=filteredRows();const pages=Math.max(1,Math.ceil(rows.length/UI_PAGE_SIZE));if(uiPage>pages)uiPage=pages;const shown=rows.slice((uiPage-1)*UI_PAGE_SIZE,uiPage*UI_PAGE_SIZE);if($('#productCount'))$('#productCount').textContent=`${rows.length} encontrado(s) · ${products.length} no total`;
  const template=rowTemplate();
  list.innerHTML=shown.length?shown.map(p=>{const image=mediaMap.get(p.id),d=detailOf(p.id),available=productAvailability(p),stockClass=available===null?'':Number(available)<0?'stock-negative':Number(available)===0?'stock-zero':'stock-positive',cat=categoryPath(categories.find(c=>c.id===p.catalog_category_id))||'Sem categoria',href=detailHref(p.id);let cells='';
    if(columns.category)cells+=`<div class="data-cell"><div class="product-meta">Categoria</div><strong>${esc(cat)}</strong></div>`;
    if(columns.stock)cells+=`<div class="data-cell"><div class="product-meta">Disponível</div><strong class="${stockClass}">${fmtQty(available)}</strong>${(childrenMap.get(p.id)||[]).length?'<div class="product-meta">soma das variações</div>':''}</div>`;
    if(columns.price)cells+=`<div class="data-cell"><div class="product-meta">Preço</div><strong>${fmtMoney(p.preco)}</strong></div>`;
    if(columns.origin)cells+=`<div class="data-cell"><div class="product-meta">Origem</div><strong>${esc(productionLabel(d.production_mode))}</strong></div>`;
    if(columns.supplier)cells+=`<div class="data-cell"><div class="product-meta">Fornecedor</div><strong>${esc(supplierOf(p.id))}</strong></div>`;
    if(columns.sync)cells+=`<div class="data-cell">${syncBadge(p)}<div class="product-meta" style="margin-top:4px">${esc(structureLabel(p))}</div></div>`;
    return `<article class="product-row" style="grid-template-columns:${template}" data-open-id="${p.id}" tabindex="0"><div class="core-thumb">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span>Sem foto</span>'">`:'<span>Sem foto</span>'}</div><div><div class="product-name">${esc(p.nome)}</div><div class="product-meta">${p.product_type==='servico'?'Serviço':'Produto'} · SKU: ${esc(p.sku||'—')} · ${esc(structureLabel(p))}</div>${d.gtin?`<div class="product-meta">GTIN: ${esc(d.gtin)}</div>`:''}</div>${cells}<a class="btn light core-open" href="${href}">Abrir ficha</a></article>`;}).join(''):'<p class="muted">Nenhum item encontrado.</p>';
  let pager=$('#corePager');if(!pager){pager=document.createElement('div');pager.id='corePager';pager.className='core-pagebar';list.after(pager);}pager.innerHTML=`<button class="btn light" id="corePrev" type="button" ${uiPage<=1?'disabled':''}>Anterior</button><span class="muted">Página ${uiPage} de ${pages}</span><button class="btn light" id="coreNext" type="button" ${uiPage>=pages?'disabled':''}>Próxima</button>`;$('#corePrev').onclick=()=>{if(uiPage>1){uiPage--;renderList();}};$('#coreNext').onclick=()=>{if(uiPage<pages){uiPage++;renderList();}};
}

function bindListEvents(){if(detailMode)return;const list=$('#productList');if(!list||list.dataset.bound==='1')return;list.dataset.bound='1';list.addEventListener('click',e=>{if(e.target.closest('a,button,input,select,textarea'))return;const row=e.target.closest('[data-open-id]');if(row)location.href=detailHref(row.dataset.openId);});list.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key))return;const row=e.target.closest('[data-open-id]');if(row){e.preventDefault();location.href=detailHref(row.dataset.openId);}});}

function rebuildMaps(){
  detailsMap=new Map(detailsRows.map(x=>[x.product_id,x]));supplierMap=new Map();for(const l of supplierLinks)if(!supplierMap.has(l.product_id)||l.preferred)supplierMap.set(l.product_id,l);supplierNameMap=new Map(suppliers.map(s=>[s.id,s.name]));stockMap=new Map(stockSnapshots.map(s=>[s.product_id,s]));childrenMap=new Map();for(const p of products){if(!p.parent_product_id)continue;if(!childrenMap.has(p.parent_product_id))childrenMap.set(p.parent_product_id,[]);childrenMap.get(p.parent_product_id).push(p);}
}

async function loadListMode(){
  if($('#productCount'))$('#productCount').textContent='Carregando itens…';
  const basePromise=fetchAll(()=>supabase.from('products').select('id,nome,sku,slug,catalog_category_id,preco,bling_product_id,bling_parent_id,bling_sku,bling_sync_status,product_type,product_format,parent_product_id,ativo,is_input,is_sellable,is_purchasable,controls_stock,published_on_site').order('nome'));
  const results=await Promise.allSettled([
    basePromise,
    fetchAll(()=>supabase.from('catalog_categories').select('id,nome,parent_id,ordem,catalog_scope,ativo').order('ordem').order('nome')),
    fetchAll(()=>supabase.from('product_details').select('product_id,brand,model,barcode,gtin,ncm,cest,production_mode')),
    fetchAll(()=>supabase.from('product_stock_snapshots').select('product_id,available_stock,virtual_stock,minimum_stock,maximum_stock,storage_location,synced_at').eq('source','bling')),
    fetchAll(()=>supabase.from('suppliers').select('id,name,active').order('name')),
    fetchAll(()=>supabase.from('product_suppliers').select('product_id,supplier_id,preferred,active,purchase_price').eq('active',true)),
    fetchAll(()=>supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem'))
  ]);
  if(results[0].status==='rejected')throw results[0].reason;products=results[0].value;
  categories=results[1].status==='fulfilled'?results[1].value:[];detailsRows=results[2].status==='fulfilled'?results[2].value:[];stockSnapshots=results[3].status==='fulfilled'?results[3].value:[];suppliers=results[4].status==='fulfilled'?results[4].value:[];supplierLinks=results[5].status==='fulfilled'?results[5].value:[];
  mediaMap=new Map();if(results[6].status==='fulfilled')for(const row of results[6].value)if(!mediaMap.has(row.product_id)&&row.url)mediaMap.set(row.product_id,row.url);
  rebuildMaps();refreshFilters();renderList();
}

function prepareDetailMode(){if(!detailMode)return;document.body.classList.add('product-detail-mode');$('#importCard')?.remove();const listCard=$('#productList')?.closest('.card');if(listCard)listCard.style.display='none';const editor=$('#editor');if(editor&&!editor.querySelector('.products-detail-back')){const back=document.createElement('a');back.className='btn light products-detail-back';back.href='/interno/produtos/';back.textContent='← Voltar para produtos';editor.prepend(back);}}
function setv(id,v){const el=$('#'+id);if(el)el.value=v??'';}
function configureProductionField(){const el=$('#productionMode');if(!el)return;el.innerHTML='<option value="">Não informado</option><option value="producao_interna">Produção interna</option><option value="terceirizado">Terceirizado</option><option value="revenda">Revenda</option><option value="misto">Misto</option>';const label=el.closest('.field')?.querySelector('label');if(label)label.textContent='Origem operacional';}

async function loadDetailMode(){prepareDetailMode();configureProductionField();const [catsResult,suppliersResult]=await Promise.allSettled([fetchAll(()=>supabase.from('catalog_categories').select('id,nome,parent_id,ordem,catalog_scope,ativo').order('ordem').order('nome')),fetchAll(()=>supabase.from('suppliers').select('id,name,active').eq('active',true).order('name'))]);if(catsResult.status==='fulfilled')categories=catsResult.value;if(suppliersResult.status==='fulfilled')suppliers=suppliersResult.value;await loadProduct(detailProductId);}

async function loadProduct(id){
  if(dirty&&!confirm('Descartar alterações não salvas deste item?'))return;setDirty(false);const {data:full,error}=await supabase.from('products').select('*').eq('id',id).single();if(error)throw error;currentProduct=full;
  const results=await Promise.all([
    supabase.from('product_details').select('*').eq('product_id',id).maybeSingle(),
    supabase.from('product_stock_settings').select('*').eq('product_id',id).is('variant_id',null).limit(1).maybeSingle(),
    supabase.from('product_suppliers').select('*').eq('product_id',id).is('variant_id',null).eq('preferred',true).limit(1).maybeSingle(),
    supabase.from('product_option_groups').select('*,product_options(*)').eq('product_id',id).order('ordem'),
    supabase.from('product_variants').select('*').eq('product_id',id).order('variation_order').order('nome'),
    supabase.from('product_stock_snapshots').select('*').eq('product_id',id).eq('source','bling').maybeSingle(),
    supabase.from('products').select('id').eq('parent_product_id',id)
  ]);for(const r of results)if(r.error)throw r.error;details=results[0].data||{};stock=results[1].data||null;supplierLink=results[2].data||null;groups=results[3].data||[];variants=results[4].data||[];const snapshot=results[5].data||null;let available=snapshot?.available_stock??null;
  const childIds=(results[6].data||[]).map(x=>x.id);if(childIds.length){const {data:childStocks}=await supabase.from('product_stock_snapshots').select('product_id,available_stock').in('product_id',childIds).eq('source','bling');const vals=(childStocks||[]).map(x=>x.available_stock).filter(v=>v!==null&&v!==undefined);if(vals.length)available=vals.reduce((a,b)=>Number(a)+Number(b),0);}
  renderEditor(available,childIds.length);$('#editor')?.classList.add('open');$('#savebar')?.classList.add('show');
}

function renderEditor(available=null,childCount=0){
  if(!currentProduct)return;configureProductionField();$('#editorTitle').textContent=currentProduct.nome;$('#editorMeta').textContent=`${currentProduct.sku||'Sem código'} · ${currentProduct.product_type==='servico'?'Serviço':'Produto'} · ${structureLabel(currentProduct)}`;
  let summary=$('#editorStockSummary');if(!summary){summary=document.createElement('div');summary.id='editorStockSummary';summary.className='detail-stock-summary';const head=$('#editorTitle')?.closest('.card');head?.appendChild(summary);}summary.innerHTML=`<div><div class="product-meta">Disponível no Bling</div><strong>${fmtQty(available)}</strong></div>${childCount?`<div class="product-meta">Consolidado de ${childCount} variação(ões)</div>`:''}`;
  ['sku','nome','slug','unidade','descricao'].forEach(k=>setv(k,currentProduct[k]||''));setv('preco',currentProduct.preco??0);setv('priceBaseMirror',currentProduct.preco??0);setv('productType',currentProduct.product_type||'produto');setv('productFormat',currentProduct.product_format||'simple');setv('condition',currentProduct.condition||'');setv('productLine',currentProduct.product_line||'');setv('ativo',String(currentProduct.ativo));setv('shortDescription',currentProduct.short_description||'');setv('complementaryDescription',currentProduct.complementary_description||'');setv('externalLink',currentProduct.external_link||'');setv('videoLink',currentProduct.video_link||'');setv('notes',currentProduct.notes||'');
  $('#category').innerHTML='<option value="">Sem categoria</option>'+categories.map(c=>`<option value="${c.id}">${esc(categoryPath(c))}</option>`).join('');setv('category',currentProduct.catalog_category_id||'');
  const dm={brand:'brand',model:'model',production_mode:'productionMode',expiration_date:'expirationDate',net_weight_kg:'netWeight',gross_weight_kg:'grossWeight',width_cm:'widthCm',height_cm:'heightCm',depth_cm:'depthCm',dimensions_unit:'dimensionsUnit',volumes:'volumes',items_per_box:'itemsPerBox',gtin:'gtin',gtin_tax:'gtinTax',origin:'origin',ncm:'ncm',cest:'cest',item_type:'itemType',approximate_tax_percent:'approxTax',tax_group:'taxGroup',icms_st_retained_base:'icmsBase',icms_st_retained_value:'icmsValue',own_icms_substitute:'ownIcms',fixed_pis:'fixedPis',fixed_cofins:'fixedCofins',anp_code:'anpCode',anp_description:'anpDescription',glp_percent:'glpPercent',glgn_national_percent:'glgnNational',glgn_imported_percent:'glgnImported',starting_value:'startingValue',additional_fiscal_info:'additionalFiscalInfo'};Object.entries(dm).forEach(([k,id])=>setv(id,details[k]??''));if($('#freeShipping'))$('#freeShipping').checked=!!details.free_shipping;
  setv('minimumStock',stock?.minimum_stock??'');setv('maximumStock',stock?.maximum_stock??'');setv('storageLocation',stock?.storage_location??'');$('#supplierId').innerHTML='<option value="">Sem fornecedor</option>'+suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');setv('supplierId',supplierLink?.supplier_id||'');setv('supplierSku',supplierLink?.supplier_sku||'');setv('supplierDescription',supplierLink?.supplier_product_description||'');setv('warrantyMonths',supplierLink?.warranty_months??'');setv('purchasePrice',supplierLink?.purchase_price??'');setv('freightCost',supplierLink?.freight_cost??'');setv('taxCost',supplierLink?.tax_cost??'');setv('otherCost',supplierLink?.other_cost??'');
  setv('blingProductId',currentProduct.bling_product_id||'');setv('blingParentId',currentProduct.bling_parent_id||'');setv('blingSku',currentProduct.bling_sku||'');setv('blingSyncStatus',currentProduct.bling_sync_status||'nao_sincronizado');setv('blingLastSynced',currentProduct.bling_last_synced_at?new Date(currentProduct.bling_last_synced_at).toLocaleString('pt-BR'):'');setv('blingSyncError',currentProduct.bling_sync_error||'');if($('#photosLink'))$('#photosLink').href=`../midias-produtos/?produto=${encodeURIComponent(currentProduct.id)}`;if($('#costsLink'))$('#costsLink').href=`../composicao-custos/?produto=${encodeURIComponent(currentProduct.id)}`;
  if($('#groups'))$('#groups').innerHTML=groups.length?groups.map(g=>`<div class="variant-card"><strong>${esc(g.nome)}</strong><div class="product-meta">${(g.product_options||[]).map(o=>esc(o.nome)).join(' · ')}</div></div>`).join(''):'<p class="muted">Sem grupos de variação.</p>';
  if($('#variants'))$('#variants').innerHTML=variants.length?variants.map(v=>`<div class="variant-card"><strong>${esc(v.nome)}</strong><div class="product-meta">${esc(v.sku||v.code||'')} ${v.option_values?`· ${esc(Object.entries(v.option_values).filter(([k])=>k!=='_raw').map(([k,x])=>`${k}: ${x}`).join(' · '))}`:''}</div></div>`).join(''):'<p class="muted">Sem combinações de variação.</p>';
}

document.querySelectorAll('.subnav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.subnav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===b.dataset.section));}));document.addEventListener('input',e=>{if(e.target.closest('#editor'))setDirty();});document.addEventListener('change',e=>{if(e.target.closest('#editor'))setDirty();});$('#discard')?.addEventListener('click',()=>currentProduct&&loadProduct(currentProduct.id));$('#openPublic')?.addEventListener('click',()=>{const href=currentProduct?.metadata?.href;if(href)window.open('/'+href.replace(/^\//,''),'_blank','noopener');else alert('Este item ainda não possui página pública cadastrada.');});

async function save(){
  if(!currentProduct)return;const status=$('#status');if(status){status.className='status';status.textContent='Salvando...';}
  try{
    const pp={sku:txt('sku'),nome:txt('nome'),slug:txt('slug'),catalog_category_id:val('category')||null,product_type:val('productType'),product_format:val('productFormat'),condition:val('condition')||null,product_line:txt('productLine'),unidade:txt('unidade')||'un',preco:Math.max(0,num('preco')||0),ativo:val('ativo')==='true',descricao:txt('descricao'),short_description:txt('shortDescription'),complementary_description:txt('complementaryDescription'),external_link:txt('externalLink'),video_link:txt('videoLink'),notes:txt('notes'),bling_product_id:num('blingProductId'),bling_parent_id:num('blingParentId'),bling_sku:txt('blingSku'),bling_sync_status:val('blingSyncStatus')};const {data,error}=await supabase.from('products').update(pp).eq('id',currentProduct.id).select('*').single();if(error)throw error;
    const dp={product_id:currentProduct.id,brand:txt('brand'),model:txt('model'),production_mode:val('productionMode')||null,expiration_date:val('expirationDate')||null,free_shipping:$('#freeShipping')?.checked||false,net_weight_kg:num('netWeight'),gross_weight_kg:num('grossWeight'),width_cm:num('widthCm'),height_cm:num('heightCm'),depth_cm:num('depthCm'),dimensions_unit:val('dimensionsUnit')||'cm',volumes:num('volumes'),items_per_box:num('itemsPerBox'),gtin:txt('gtin'),gtin_tax:txt('gtinTax'),origin:txt('origin'),ncm:txt('ncm'),cest:txt('cest'),item_type:txt('itemType'),approximate_tax_percent:num('approxTax'),tax_group:txt('taxGroup'),icms_st_retained_base:num('icmsBase'),icms_st_retained_value:num('icmsValue'),own_icms_substitute:num('ownIcms'),fixed_pis:num('fixedPis'),fixed_cofins:num('fixedCofins'),anp_code:txt('anpCode'),anp_description:txt('anpDescription'),glp_percent:num('glpPercent'),glgn_national_percent:num('glgnNational'),glgn_imported_percent:num('glgnImported'),starting_value:num('startingValue'),additional_fiscal_info:txt('additionalFiscalInfo'),updated_at:new Date().toISOString()};const {error:de}=await supabase.from('product_details').upsert(dp,{onConflict:'product_id'});if(de)throw de;currentProduct=data;details={...details,...dp};setDirty(false);if(status){status.className='status ok';status.textContent='Item salvo com sucesso.';}
  }catch(e){console.error(e);if(status){status.className='status bad';status.textContent='Não foi possível salvar o item.';}}
}
$('#save')?.addEventListener('click',save);

async function importBling(){const input=$('#blingImportCode'),button=$('#importBling'),status=$('#importStatus'),code=input?.value.trim();if(!code){if(status){status.className='status bad';status.textContent='Informe o código ou ID no Bling.';}return;}if(button)button.disabled=true;try{const{data,error}=await supabase.functions.invoke('bling-import-product',{body:{code}});if(error)throw error;if(data?.error)throw new Error(data.detail||data.error);await loadListMode();if(status){status.className='status ok';status.textContent='Importação concluída.';}if(input)input.value='';}catch(e){console.error(e);if(status){status.className='status bad';status.textContent='Não foi possível importar.';}}finally{if(button)button.disabled=false;}}
$('#importBling')?.addEventListener('click',importBling);$('#blingImportCode')?.addEventListener('keydown',e=>{if(e.key==='Enter')importBling();});if(session.profile?.role!=='owner')$('#importCard')?.querySelectorAll('input,button').forEach(x=>x.disabled=true);

injectStyles();
if(detailMode){prepareDetailMode();loadDetailMode().catch(e=>{console.error('Falha ao carregar ficha do item',e);const status=$('#status');if(status){status.className='status bad';status.textContent='Não foi possível carregar esta ficha. Volte para a lista e tente novamente.';}});}else{buildWorkspace();bindListEvents();loadListMode().catch(e=>{console.error('Falha ao carregar produtos/serviços',e);if($('#productCount'))$('#productCount').textContent='Falha ao carregar';if($('#productList'))$('#productList').innerHTML='<p class="status bad">Não foi possível carregar os itens. Atualize a página e tente novamente.</p>';});}
