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
let mediaMap=new Map();
let currentProduct=null;
let details={};
let stock=null;
let supplierLink=null;
let groups=[];
let variants=[];
let dirty=false;
let uiPage=1;
let filters={type:'',status:'',category:'',bling:''};

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

function detailHref(id){return `/interno/produtos/?produto=${encodeURIComponent(id)}&modo=ficha`;}

function injectStyles(){
  if($('#productsCoreStyles')) return;
  const s=document.createElement('style');
  s.id='productsCoreStyles';
  s.textContent=`
  .products-workspace{display:grid;grid-template-columns:280px minmax(0,1fr);gap:16px;align-items:start}.products-filters{background:#fff;border:1px solid var(--croma-line);border-radius:18px;padding:16px;position:sticky;top:86px;box-shadow:0 10px 28px rgba(33,28,92,.04)}.products-filters h3{margin:0 0 4px;color:var(--croma-purple);font-size:1rem}.products-filter-note{margin:0 0 15px;color:var(--croma-muted);font-size:.78rem;line-height:1.4}.products-filters label{display:grid;gap:6px;margin:0 0 13px;font-size:.68rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple)}.products-filters select{width:100%;padding:10px 11px;border:1px solid #d8d6e4;border-radius:10px;background:#fff;font:inherit;text-transform:none;color:#3f3b54}.products-main{min-width:0}.products-list-tools{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:10px}.products-list-tools .search{flex:1;min-width:260px}.product-list{display:grid;gap:8px}.product-row{display:grid!important;grid-template-columns:58px minmax(200px,1.6fr) minmax(120px,.8fr) minmax(110px,.65fr) minmax(130px,.7fr) auto!important;gap:10px;align-items:center;padding:12px 14px;border:1px solid #e6e3ee;border-radius:14px;background:#fff;color:inherit;cursor:pointer}.product-row:hover,.product-row.selected{border-color:#8f89c2;box-shadow:0 8px 22px #30297f12}.core-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;background:#efedf5;display:grid;place-items:center}.core-thumb img{width:100%;height:100%;object-fit:cover}.core-thumb span{font-size:.65rem;color:#8a8598;text-align:center}.core-open{white-space:nowrap}.core-pagebar{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:12px 0}.core-pagebar button{padding:8px 10px}.product-name{font-weight:900;color:var(--croma-deep)}.product-meta{font-size:.78rem;color:var(--croma-muted)}.pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#f0eef8;color:var(--croma-purple);font-size:.72rem;font-weight:900}.pill.ok{background:#edf7e8;color:#426920}.pill.off{background:#f4f4f4;color:#777}.list-head{display:none!important}.core-filterbar,#cromaProductStatus,.croma-edit-chip{display:none!important}.product-detail-mode #importCard,.product-detail-mode #corePager{display:none!important}.product-detail-mode #editor{display:block!important}.products-detail-back{display:inline-flex;margin-bottom:14px}.product-detail-mode .internal-title{margin-bottom:4px}
  @media(max-width:980px){.products-workspace{grid-template-columns:1fr}.products-filters{position:static;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.products-filters h3,.products-filter-note{grid-column:1/-1}.products-filters label{margin:0}.product-row{grid-template-columns:58px 1fr 1fr!important}.product-row>div:nth-child(2){grid-column:2/-1}}
  @media(max-width:650px){.products-filters{grid-template-columns:1fr}.products-filters h3,.products-filter-note{grid-column:auto}.product-row{grid-template-columns:52px 1fr!important}.core-thumb{width:52px;height:52px}.product-row>*{grid-column:auto!important}.product-row>div:nth-child(2){grid-column:2/-1!important}}
  `;
  document.head.appendChild(s);
}

function buildWorkspace(){
  if(detailMode) return;
  const list=$('#productList');
  const card=list?.closest('.card');
  if(!list||!card||$('#productsWorkspace')) return;

  card.querySelectorAll('.core-filterbar').forEach(x=>x.remove());
  const oldHead=card.querySelector('.list-head');
  const search=$('#productSearch');
  const count=$('#productCount');

  const workspace=document.createElement('div');
  workspace.id='productsWorkspace';
  workspace.className='products-workspace';

  const side=document.createElement('aside');
  side.className='products-filters';
  side.innerHTML=`<h3>Filtros do cadastro</h3><p class="products-filter-note">Refine a lista por tipo, status, categoria e integração.</p>
    <label>Tipo<select id="filterType"><option value="">Todos</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select></label>
    <label>Status<select id="filterStatus"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>
    <label>Categoria<select id="filterCategory"><option value="">Todas</option></select></label>
    <label>Integração Bling<select id="filterBling"><option value="">Todos</option><option value="linked">Vinculados</option><option value="unlinked">Sem vínculo</option><option value="synced">Sincronizados</option><option value="error">Com erro</option></select></label>`;

  const main=document.createElement('div');
  main.className='products-main';
  const tools=document.createElement('div');
  tools.className='products-list-tools';
  if(search) tools.appendChild(search);
  if(count) tools.appendChild(count);
  main.append(tools,list);
  workspace.append(side,main);
  card.appendChild(workspace);
  if(oldHead) oldHead.style.display='none';

  $('#filterType').addEventListener('change',e=>{filters.type=e.target.value;uiPage=1;renderList();});
  $('#filterStatus').addEventListener('change',e=>{filters.status=e.target.value;uiPage=1;renderList();});
  $('#filterCategory').addEventListener('change',e=>{filters.category=e.target.value;uiPage=1;renderList();});
  $('#filterBling').addEventListener('change',e=>{filters.bling=e.target.value;uiPage=1;renderList();});
  search?.addEventListener('input',()=>{uiPage=1;renderList();});
}

function refreshCategoryFilter(){
  const sel=$('#filterCategory');
  if(!sel) return;
  const current=sel.value;
  const rows=[...categories].filter(c=>c.ativo!==false).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||String(a.nome||'').localeCompare(String(b.nome||'')));
  sel.innerHTML='<option value="">Todas</option>'+rows.map(c=>`<option value="${c.id}">${esc(categoryPath(c))}</option>`).join('');
  sel.value=current;
}

function syncBadge(p){
  if(p.bling_sync_status==='sincronizado') return '<span class="pill ok">Sincronizado</span>';
  if(p.bling_sync_status==='erro') return '<span class="pill off">Erro de sincronização</span>';
  if(p.bling_product_id) return '<span class="pill">Vinculado</span>';
  return '<span class="pill off">Sem vínculo</span>';
}

function filteredRows(){
  const q=($('#productSearch')?.value||'').trim().toLowerCase();
  return products.filter(p=>{
    if(filters.type&&p.product_type!==filters.type) return false;
    if(filters.status==='active'&&p.ativo!==true) return false;
    if(filters.status==='inactive'&&p.ativo!==false) return false;
    if(filters.category&&p.catalog_category_id!==filters.category) return false;
    if(filters.bling==='linked'&&!p.bling_product_id) return false;
    if(filters.bling==='unlinked'&&p.bling_product_id) return false;
    if(filters.bling==='synced'&&p.bling_sync_status!=='sincronizado') return false;
    if(filters.bling==='error'&&p.bling_sync_status!=='erro') return false;
    if(!q) return true;
    const cat=categoryPath(categories.find(c=>c.id===p.catalog_category_id));
    return [p.nome,p.sku,p.bling_sku,p.bling_product_id,cat].some(v=>String(v??'').toLowerCase().includes(q));
  });
}

function renderList(){
  if(detailMode) return;
  const list=$('#productList');
  if(!list) return;
  const rows=filteredRows();
  const pages=Math.max(1,Math.ceil(rows.length/UI_PAGE_SIZE));
  if(uiPage>pages) uiPage=pages;
  const shown=rows.slice((uiPage-1)*UI_PAGE_SIZE,uiPage*UI_PAGE_SIZE);
  if($('#productCount')) $('#productCount').textContent=`${rows.length} encontrado(s) · ${products.length} no total`;

  list.innerHTML=shown.length?shown.map(p=>{
    const image=mediaMap.get(p.id);
    const cat=categories.find(c=>c.id===p.catalog_category_id)?.nome||'Sem categoria';
    const href=detailHref(p.id);
    return `<article class="product-row" data-open-id="${p.id}" tabindex="0">
      <div class="core-thumb">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span>Sem foto</span>'">`:'<span>Sem foto</span>'}</div>
      <div><div class="product-name">${esc(p.nome)}</div><div class="product-meta">${p.product_type==='servico'?'Serviço':'Produto'} · Código: ${esc(p.sku||'—')}</div></div>
      <div><div class="product-meta">Categoria</div><strong>${esc(cat)}</strong></div>
      <div><div class="product-meta">Preço</div><strong>${Number(p.preco||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
      <div>${syncBadge(p)}<div class="product-meta" style="margin-top:4px">ID: ${esc(p.bling_product_id||'—')}</div></div>
      <a class="btn light core-open" href="${href}">Abrir ficha</a>
    </article>`;
  }).join(''):'<p class="muted">Nenhum item encontrado.</p>';

  let pager=$('#corePager');
  if(!pager){pager=document.createElement('div');pager.id='corePager';pager.className='core-pagebar';list.after(pager);}
  pager.innerHTML=`<button class="btn light" id="corePrev" type="button" ${uiPage<=1?'disabled':''}>Anterior</button><span class="muted">Página ${uiPage} de ${pages}</span><button class="btn light" id="coreNext" type="button" ${uiPage>=pages?'disabled':''}>Próxima</button>`;
  $('#corePrev').addEventListener('click',()=>{if(uiPage>1){uiPage--;renderList();}});
  $('#coreNext').addEventListener('click',()=>{if(uiPage<pages){uiPage++;renderList();}});
}

function bindListEvents(){
  if(detailMode) return;
  const list=$('#productList');
  if(!list||list.dataset.bound==='1') return;
  list.dataset.bound='1';
  list.addEventListener('click',e=>{
    if(e.target.closest('a,button,input,select,textarea')) return;
    const row=e.target.closest('[data-open-id]');
    if(row) location.href=detailHref(row.dataset.openId);
  });
  list.addEventListener('keydown',e=>{
    if(e.key!=='Enter'&&e.key!==' ') return;
    const row=e.target.closest('[data-open-id]');
    if(row){e.preventDefault();location.href=detailHref(row.dataset.openId);}
  });
}

function prepareDetailMode(){
  if(!detailMode) return;
  document.body.classList.add('product-detail-mode');
  $('#importCard')?.remove();
  const listCard=$('#productList')?.closest('.card');
  if(listCard) listCard.style.display='none';
  const editor=$('#editor');
  if(editor&&!editor.querySelector('.products-detail-back')){
    const back=document.createElement('a');
    back.className='btn light products-detail-back';
    back.href='/interno/produtos/';
    back.textContent='← Voltar para produtos';
    editor.prepend(back);
  }
  const navButtons=[...document.querySelectorAll('a,button')].filter(el=>['produtos','categorias','segmentos'].includes(String(el.textContent||'').trim().toLowerCase()));
  const wrappers=[...new Set(navButtons.map(x=>x.parentElement).filter(Boolean))];
  wrappers.forEach(w=>{if(navButtons.filter(x=>x.parentElement===w).length>=2)w.style.display='none';});
}

async function loadListMode(){
  if($('#productCount')) $('#productCount').textContent='Carregando itens…';
  products=await fetchAll(()=>supabase.from('products').select('id,nome,sku,slug,catalog_category_id,preco,bling_product_id,bling_sku,bling_sync_status,product_type,ativo').order('nome'));
  renderList();

  const [catsResult,mediaResult]=await Promise.allSettled([
    fetchAll(()=>supabase.from('catalog_categories').select('id,nome,parent_id,ordem,catalog_scope,ativo').order('ordem').order('nome')),
    fetchAll(()=>supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem'))
  ]);
  if(catsResult.status==='fulfilled') categories=catsResult.value;
  if(mediaResult.status==='fulfilled'){
    mediaMap=new Map();
    for(const row of mediaResult.value) if(!mediaMap.has(row.product_id)&&row.url) mediaMap.set(row.product_id,row.url);
  }
  refreshCategoryFilter();
  renderList();
}

async function loadDetailMode(){
  prepareDetailMode();
  const [catsResult,suppliersResult]=await Promise.allSettled([
    fetchAll(()=>supabase.from('catalog_categories').select('id,nome,parent_id,ordem,catalog_scope,ativo').order('ordem').order('nome')),
    fetchAll(()=>supabase.from('suppliers').select('id,name,active').eq('active',true).order('name'))
  ]);
  if(catsResult.status==='fulfilled') categories=catsResult.value;
  if(suppliersResult.status==='fulfilled') suppliers=suppliersResult.value;
  await loadProduct(detailProductId);
}

async function loadProduct(id){
  if(dirty&&!confirm('Descartar alterações não salvas deste item?')) return;
  setDirty(false);
  const {data:full,error}=await supabase.from('products').select('*').eq('id',id).single();
  if(error) throw error;
  currentProduct=full;
  const idx=products.findIndex(x=>x.id===id);
  if(idx>=0) products[idx]={...products[idx],...full};

  const results=await Promise.all([
    supabase.from('product_details').select('*').eq('product_id',id).maybeSingle(),
    supabase.from('product_stock_settings').select('*').eq('product_id',id).is('variant_id',null).limit(1).maybeSingle(),
    supabase.from('product_suppliers').select('*').eq('product_id',id).is('variant_id',null).eq('preferred',true).limit(1).maybeSingle(),
    supabase.from('product_option_groups').select('*,product_options(*)').eq('product_id',id).order('ordem'),
    supabase.from('product_variants').select('*').eq('product_id',id).order('nome')
  ]);
  for(const r of results) if(r.error) throw r.error;
  details=results[0].data||{};
  stock=results[1].data||null;
  supplierLink=results[2].data||null;
  groups=results[3].data||[];
  variants=results[4].data||[];
  renderEditor();
  $('#editor')?.classList.add('open');
  $('#savebar')?.classList.add('show');
  if(!detailMode) $('#editor')?.scrollIntoView({behavior:'smooth',block:'start'});
}

function setv(id,v){const el=$('#'+id);if(el)el.value=v??'';}
function renderEditor(){
  if(!currentProduct) return;
  $('#editorTitle').textContent=currentProduct.nome;
  $('#editorMeta').textContent=`${currentProduct.sku||'Sem código'} · ${currentProduct.product_type==='servico'?'Serviço':'Produto'}`;
  ['sku','nome','slug','unidade','descricao'].forEach(k=>setv(k,currentProduct[k]||''));
  setv('preco',currentProduct.preco??0);setv('priceBaseMirror',currentProduct.preco??0);setv('productType',currentProduct.product_type||'produto');setv('productFormat',currentProduct.product_format||'simple');setv('condition',currentProduct.condition||'');setv('productLine',currentProduct.product_line||'');setv('ativo',String(currentProduct.ativo));setv('shortDescription',currentProduct.short_description||'');setv('complementaryDescription',currentProduct.complementary_description||'');setv('externalLink',currentProduct.external_link||'');setv('videoLink',currentProduct.video_link||'');setv('notes',currentProduct.notes||'');
  $('#category').innerHTML='<option value="">Sem categoria</option>'+categories.map(c=>`<option value="${c.id}">${esc(categoryPath(c))}</option>`).join('');setv('category',currentProduct.catalog_category_id||'');
  const dm={brand:'brand',model:'model',production_mode:'productionMode',expiration_date:'expirationDate',net_weight_kg:'netWeight',gross_weight_kg:'grossWeight',width_cm:'widthCm',height_cm:'heightCm',depth_cm:'depthCm',dimensions_unit:'dimensionsUnit',volumes:'volumes',items_per_box:'itemsPerBox',gtin:'gtin',gtin_tax:'gtinTax',origin:'origin',ncm:'ncm',cest:'cest',item_type:'itemType',approximate_tax_percent:'approxTax',tax_group:'taxGroup',icms_st_retained_base:'icmsBase',icms_st_retained_value:'icmsValue',own_icms_substitute:'ownIcms',fixed_pis:'fixedPis',fixed_cofins:'fixedCofins',anp_code:'anpCode',anp_description:'anpDescription',glp_percent:'glpPercent',glgn_national_percent:'glgnNational',glgn_imported_percent:'glgnImported',starting_value:'startingValue',additional_fiscal_info:'additionalFiscalInfo'};
  Object.entries(dm).forEach(([k,id])=>setv(id,details[k]??''));
  if($('#freeShipping')) $('#freeShipping').checked=!!details.free_shipping;
  setv('minimumStock',stock?.minimum_stock??'');setv('maximumStock',stock?.maximum_stock??'');setv('storageLocation',stock?.storage_location??'');
  $('#supplierId').innerHTML='<option value="">Sem fornecedor</option>'+suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');setv('supplierId',supplierLink?.supplier_id||'');setv('supplierSku',supplierLink?.supplier_sku||'');setv('supplierDescription',supplierLink?.supplier_product_description||'');setv('warrantyMonths',supplierLink?.warranty_months??'');setv('purchasePrice',supplierLink?.purchase_price??'');setv('freightCost',supplierLink?.freight_cost??'');setv('taxCost',supplierLink?.tax_cost??'');setv('otherCost',supplierLink?.other_cost??'');
  setv('blingProductId',currentProduct.bling_product_id||'');setv('blingParentId',currentProduct.bling_parent_id||'');setv('blingSku',currentProduct.bling_sku||'');setv('blingSyncStatus',currentProduct.bling_sync_status||'nao_sincronizado');setv('blingLastSynced',currentProduct.bling_last_synced_at?new Date(currentProduct.bling_last_synced_at).toLocaleString('pt-BR'):'');setv('blingSyncError',currentProduct.bling_sync_error||'');
  if($('#photosLink')) $('#photosLink').href=`../midias-produtos/?produto=${encodeURIComponent(currentProduct.id)}`;
  if($('#costsLink')) $('#costsLink').href=`../composicao-custos/?produto=${encodeURIComponent(currentProduct.id)}`;
  if($('#groups')) $('#groups').innerHTML=groups.length?groups.map(g=>`<div class="variant-card"><strong>${esc(g.nome)}</strong></div>`).join(''):'<p class="muted">Sem grupos de variação.</p>';
  if($('#variants')) $('#variants').innerHTML=variants.length?variants.map(v=>`<div class="variant-card"><strong>${esc(v.nome)}</strong></div>`).join(''):'<p class="muted">Sem combinações de variação.</p>';
}

document.querySelectorAll('.subnav button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.subnav button').forEach(x=>x.classList.toggle('active',x===b));document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===b.dataset.section));}));
document.addEventListener('input',e=>{if(e.target.closest('#editor'))setDirty();});
document.addEventListener('change',e=>{if(e.target.closest('#editor'))setDirty();});
$('#discard')?.addEventListener('click',()=>currentProduct&&loadProduct(currentProduct.id));
$('#openPublic')?.addEventListener('click',()=>{const href=currentProduct?.metadata?.href;if(href)window.open('/'+href.replace(/^\//,''),'_blank','noopener');else alert('Este item ainda não possui página pública cadastrada.');});

async function save(){
  if(!currentProduct) return;
  const status=$('#status');if(status){status.className='status';status.textContent='Salvando...';}
  try{
    const pp={sku:txt('sku'),nome:txt('nome'),slug:txt('slug'),catalog_category_id:val('category')||null,product_type:val('productType'),product_format:val('productFormat'),condition:val('condition')||null,product_line:txt('productLine'),unidade:txt('unidade')||'un',preco:Math.max(0,num('preco')||0),ativo:val('ativo')==='true',descricao:txt('descricao'),short_description:txt('shortDescription'),complementary_description:txt('complementaryDescription'),external_link:txt('externalLink'),video_link:txt('videoLink'),notes:txt('notes'),bling_product_id:num('blingProductId'),bling_parent_id:num('blingParentId'),bling_sku:txt('blingSku'),bling_sync_status:val('blingSyncStatus')};
    const {data,error}=await supabase.from('products').update(pp).eq('id',currentProduct.id).select('*').single();if(error)throw error;
    const dp={product_id:currentProduct.id,brand:txt('brand'),model:txt('model'),production_mode:val('productionMode')||null,expiration_date:val('expirationDate')||null,free_shipping:$('#freeShipping')?.checked||false,net_weight_kg:num('netWeight'),gross_weight_kg:num('grossWeight'),width_cm:num('widthCm'),height_cm:num('heightCm'),depth_cm:num('depthCm'),dimensions_unit:val('dimensionsUnit')||'cm',volumes:num('volumes'),items_per_box:num('itemsPerBox'),gtin:txt('gtin'),gtin_tax:txt('gtinTax'),origin:txt('origin'),ncm:txt('ncm'),cest:txt('cest'),item_type:txt('itemType'),approximate_tax_percent:num('approxTax'),tax_group:txt('taxGroup'),icms_st_retained_base:num('icmsBase'),icms_st_retained_value:num('icmsValue'),own_icms_substitute:num('ownIcms'),fixed_pis:num('fixedPis'),fixed_cofins:num('fixedCofins'),anp_code:txt('anpCode'),anp_description:txt('anpDescription'),glp_percent:num('glpPercent'),glgn_national_percent:num('glgnNational'),glgn_imported_percent:num('glgnImported'),starting_value:num('startingValue'),additional_fiscal_info:txt('additionalFiscalInfo'),updated_at:new Date().toISOString()};
    const {error:de}=await supabase.from('product_details').upsert(dp,{onConflict:'product_id'});if(de)throw de;
    currentProduct=data;
    const idx=products.findIndex(x=>x.id===data.id);if(idx>=0)products[idx]={...products[idx],...data};
    setDirty(false);renderList();if(status){status.className='status ok';status.textContent='Item salvo com sucesso.';}
  }catch(e){console.error(e);if(status){status.className='status bad';status.textContent='Não foi possível salvar o item.';}}
}
$('#save')?.addEventListener('click',save);

async function importBling(){
  const input=$('#blingImportCode');const button=$('#importBling');const status=$('#importStatus');const code=input?.value.trim();
  if(!code){if(status){status.className='status bad';status.textContent='Informe o código ou ID no Bling.';}return;}
  if(button)button.disabled=true;
  try{const{data,error}=await supabase.functions.invoke('bling-import-product',{body:{code}});if(error)throw error;if(data?.error)throw new Error(data.detail||data.error);await loadListMode();if(status){status.className='status ok';status.textContent='Importação concluída.';}if(input)input.value='';}catch(e){console.error(e);if(status){status.className='status bad';status.textContent='Não foi possível importar.';}}finally{if(button)button.disabled=false;}
}
$('#importBling')?.addEventListener('click',importBling);
$('#blingImportCode')?.addEventListener('keydown',e=>{if(e.key==='Enter')importBling();});
if(session.profile?.role!=='owner') $('#importCard')?.querySelectorAll('input,button').forEach(x=>x.disabled=true);

injectStyles();
if(detailMode){
  prepareDetailMode();
  loadDetailMode().catch(e=>{console.error('Falha ao carregar ficha do item',e);const status=$('#status');if(status){status.className='status bad';status.textContent='Não foi possível carregar esta ficha. Volte para a lista e tente novamente.';}});
}else{
  buildWorkspace();
  bindListEvents();
  loadListMode().catch(e=>{console.error('Falha ao carregar produtos/serviços',e);if($('#productCount'))$('#productCount').textContent='Falha ao carregar';if($('#productList'))$('#productList').innerHTML='<p class="status bad">Não foi possível carregar os itens. Atualize a página e tente novamente.</p>';});
}
