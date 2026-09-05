import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const session = await protectInternalPage({ roles:['owner','manager'] });
if (!session) throw new Error('auth');

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const val = id => $('#'+id)?.value ?? '';
const num = id => { const v = val(id); return v === '' ? null : Number(v); };
const txt = id => val(id).trim() || null;
const PAGE = 500;
const UI_PAGE = 50;

let products = [], categories = [], suppliers = [], mediaMap = new Map();
let product = null, details = {}, stock = null, supplierLink = null, groups = [], variants = [], tiers = [], workingTiers = [];
let dirty = false, typeFilter = '', statusFilter = '', page = 1;

async function fetchAll(build){
  const out=[];
  for(let from=0;;from+=PAGE){
    const {data,error}=await build().range(from,from+PAGE-1);
    if(error) throw error;
    const rows=data||[];
    out.push(...rows);
    if(rows.length<PAGE) break;
  }
  return out;
}

function setDirty(v=true){
  dirty=v;
  if($('#dirty')){
    $('#dirty').textContent=v?'Alterações não salvas':'Nenhuma alteração pendente';
    $('#dirty').classList.toggle('clean',!v);
  }
}

window.addEventListener('beforeunload',e=>{ if(dirty){e.preventDefault();e.returnValue='';} });

document.querySelectorAll('.subnav button').forEach(b=>b.onclick=()=>{
  document.querySelectorAll('.subnav button').forEach(x=>x.classList.toggle('active',x===b));
  document.querySelectorAll('.section').forEach(x=>x.classList.toggle('active',x.id===b.dataset.section));
});

function categoryPath(c){
  if(!c?.nome) return '';
  const names=[c.nome]; let p=categories.find(x=>x.id===c.parent_id), guard=0;
  while(p&&guard++<8){names.unshift(p.nome);p=categories.find(x=>x.id===p.parent_id);}
  return names.join(' › ');
}

function syncBadge(p){
  if(p.bling_sync_status==='sincronizado') return '<span class="pill ok">Bling sincronizado</span>';
  if(p.bling_product_id) return '<span class="pill">Bling vinculado</span>';
  return '<span class="pill off">Sem vínculo Bling</span>';
}

function injectListStyles(){
  if($('#productsCoreStyles')) return;
  const s=document.createElement('style'); s.id='productsCoreStyles';
  s.textContent=`
  .core-filterbar{display:flex;gap:8px;align-items:end;flex-wrap:wrap;margin:10px 0 12px}.core-filterbar label{display:grid;gap:4px;font-size:.68rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple)}.core-filterbar select{padding:9px 10px;border:1px solid #d8d6e4;border-radius:9px;background:#fff;font:inherit;text-transform:none;font-weight:600;color:#3f3b54}.core-pagebar{display:flex;gap:8px;align-items:center;justify-content:flex-end;margin:12px 0}.core-pagebar button{padding:8px 10px}.product-row{grid-template-columns:58px minmax(180px,1.6fr) minmax(120px,.8fr) minmax(120px,.7fr) minmax(120px,.7fr) auto!important}.core-thumb{width:58px;height:58px;border-radius:10px;overflow:hidden;background:#efedf5;display:grid;place-items:center}.core-thumb img{width:100%;height:100%;object-fit:cover;display:block}.core-thumb span{font-size:.65rem;color:#8a8598;text-align:center}.core-open{pointer-events:none}
  @media(max-width:950px){.product-row{grid-template-columns:58px 1fr 1fr!important}.product-row>div:nth-child(2){grid-column:2/-1}}
  @media(max-width:650px){.product-row{grid-template-columns:52px 1fr!important}.core-thumb{width:52px;height:52px}.product-row>*{grid-column:auto!important}.product-row>div:nth-child(2){grid-column:2/-1!important}}
  `;
  document.head.appendChild(s);
}

function ensureFilters(){
  if($('#coreTypeFilter')) return;
  const list=$('#productList'); if(!list) return;
  const bar=document.createElement('div'); bar.className='core-filterbar';
  bar.innerHTML=`<label>Tipo<select id="coreTypeFilter"><option value="">Todos</option><option value="produto">Produtos</option><option value="servico">Serviços</option></select></label><label>Status<select id="coreStatusFilter"><option value="">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select></label>`;
  list.before(bar);
  $('#coreTypeFilter').onchange=e=>{typeFilter=e.target.value;page=1;renderList();};
  $('#coreStatusFilter').onchange=e=>{statusFilter=e.target.value;page=1;renderList();};
}

function filteredRows(){
  const q=$('#productSearch')?.value.trim().toLowerCase()||'';
  return products.filter(p=>{
    if(typeFilter&&p.product_type!==typeFilter) return false;
    if(statusFilter==='active'&&p.ativo!==true) return false;
    if(statusFilter==='inactive'&&p.ativo!==false) return false;
    if(!q) return true;
    const cat=categoryPath(categories.find(c=>c.id===p.catalog_category_id));
    return [p.nome,p.sku,p.bling_sku,p.bling_product_id,cat].some(v=>String(v??'').toLowerCase().includes(q));
  });
}

function renderList(){
  const rows=filteredRows();
  const totalPages=Math.max(1,Math.ceil(rows.length/UI_PAGE));
  if(page>totalPages) page=totalPages;
  const start=(page-1)*UI_PAGE;
  const shown=rows.slice(start,start+UI_PAGE);
  const count=$('#productCount');
  if(count) count.textContent=`${rows.length} encontrado(s) · ${products.length} no total`;
  const list=$('#productList');
  if(!list) return;
  list.innerHTML=shown.length?shown.map(p=>{
    const image=mediaMap.get(p.id);
    const cat=categories.find(c=>c.id===p.catalog_category_id)?.nome||'Sem categoria';
    return `<button class="product-row ${product?.id===p.id?'selected':''}" data-product-id="${p.id}" type="button">
      <div class="core-thumb">${image?`<img src="${esc(image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<span>Sem foto</span>'">`:'<span>Sem foto</span>'}</div>
      <div><div class="product-name">${esc(p.nome)}</div><div class="product-meta">${p.product_type==='servico'?'Serviço':'Produto'} · Código: ${esc(p.sku||'—')}</div></div>
      <div><div class="product-meta">Categoria</div><strong>${esc(cat)}</strong></div>
      <div><div class="product-meta">Preço</div><strong>${Number(p.preco||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong></div>
      <div>${syncBadge(p)}<div class="product-meta" style="margin-top:4px">ID: ${esc(p.bling_product_id||'—')}</div></div>
      <span class="btn light core-open">Abrir ficha</span>
    </button>`;
  }).join(''):'<p class="muted">Nenhum item encontrado.</p>';

  let pager=$('#corePager');
  if(!pager){pager=document.createElement('div');pager.id='corePager';pager.className='core-pagebar';list.after(pager);}
  pager.innerHTML=`<button class="btn light" id="corePrev" type="button" ${page<=1?'disabled':''}>Anterior</button><span class="muted">Página ${page} de ${totalPages}</span><button class="btn light" id="coreNext" type="button" ${page>=totalPages?'disabled':''}>Próxima</button>`;
  $('#corePrev').onclick=()=>{if(page>1){page--;renderList();scrollTo({top:0,behavior:'smooth'});}};
  $('#coreNext').onclick=()=>{if(page<totalPages){page++;renderList();scrollTo({top:0,behavior:'smooth'});}};
}

$('#productSearch').oninput=()=>{page=1;renderList();};
$('#productList').onclick=e=>{const row=e.target.closest('[data-product-id]');if(row)loadProduct(row.dataset.productId);};

async function loadBase(){
  const [p,c,s,m]=await Promise.all([
    fetchAll(()=>supabase.from('products').select('id,nome,sku,slug,catalog_category_id,preco,bling_product_id,bling_sku,bling_sync_status,product_type,ativo').order('nome')),
    fetchAll(()=>supabase.from('catalog_categories').select('id,nome,parent_id,ordem,catalog_scope,ativo').order('ordem').order('nome')),
    fetchAll(()=>supabase.from('suppliers').select('id,name,active').eq('active',true).order('name')),
    fetchAll(()=>supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem'))
  ]);
  products=p; categories=c; suppliers=s;
  mediaMap=new Map(); for(const row of m) if(!mediaMap.has(row.product_id)&&row.url) mediaMap.set(row.product_id,row.url);
  renderList();
  const wanted=new URLSearchParams(location.search).get('produto');
  if(wanted){
    let found=products.find(x=>x.id===wanted||x.slug===wanted||x.sku===wanted);
    if(!found){
      const {data}=await supabase.from('products').select('id').or(`slug.eq.${wanted},sku.eq.${wanted}`).limit(1).maybeSingle();
      if(data) found=data;
    }
    if(found) await loadProduct(found.id);
  }
}

async function loadProduct(id){
  if(dirty&&!confirm('Descartar alterações não salvas deste item?')) return;
  setDirty(false);
  const full=await supabase.from('products').select('*').eq('id',id).single();
  if(full.error) throw full.error;
  product=full.data;
  const idx=products.findIndex(x=>x.id===id);
  if(idx>=0) products[idx]={...products[idx],...product};
  const [d,st,sp,g,v,t]=await Promise.all([
    supabase.from('product_details').select('*').eq('product_id',id).maybeSingle(),
    supabase.from('product_stock_settings').select('*').eq('product_id',id).is('variant_id',null).limit(1).maybeSingle(),
    supabase.from('product_suppliers').select('*').eq('product_id',id).is('variant_id',null).eq('preferred',true).limit(1).maybeSingle(),
    supabase.from('product_option_groups').select('*,product_options(*)').eq('product_id',id).order('ordem'),
    supabase.from('product_variants').select('*').eq('product_id',id).order('nome'),
    supabase.from('product_price_tiers').select('*').eq('product_id',id).order('min_qty')
  ]);
  for(const r of [d,st,sp,g,v,t]) if(r.error) throw r.error;
  details=d.data||{}; stock=st.data||null; supplierLink=sp.data||null; groups=g.data||[]; variants=v.data||[]; tiers=t.data||[]; workingTiers=structuredClone(tiers);
  renderEditor(); renderList();
  $('#editor').classList.add('open'); $('#savebar').classList.add('show');
  history.replaceState(null,'',`?produto=${encodeURIComponent(product.id)}`);
  $('#editor').scrollIntoView({behavior:'smooth',block:'start'});
}

function setv(id,v){const el=$('#'+id);if(el)el.value=v??'';}

function renderEditor(){
  $('#editorTitle').textContent=product.nome;
  $('#editorMeta').textContent=`${product.sku||'Sem código'} · ${product.product_type==='servico'?'Serviço':'Produto'}`;
  ['sku','nome','slug','unidade','descricao'].forEach(k=>setv(k,product[k]||''));
  setv('preco',product.preco??0); setv('priceBaseMirror',product.preco??0); setv('productType',product.product_type||'produto'); setv('productFormat',product.product_format||'simple'); setv('condition',product.condition||''); setv('productLine',product.product_line||''); setv('ativo',String(product.ativo)); setv('shortDescription',product.short_description||''); setv('complementaryDescription',product.complementary_description||''); setv('externalLink',product.external_link||''); setv('videoLink',product.video_link||''); setv('notes',product.notes||'');
  $('#category').innerHTML='<option value="">Sem categoria</option>'+categories.map(c=>`<option value="${c.id}">${esc(categoryPath(c))}</option>`).join(''); setv('category',product.catalog_category_id||'');
  const dm={brand:'brand',model:'model',production_mode:'productionMode',expiration_date:'expirationDate',net_weight_kg:'netWeight',gross_weight_kg:'grossWeight',width_cm:'widthCm',height_cm:'heightCm',depth_cm:'depthCm',dimensions_unit:'dimensionsUnit',volumes:'volumes',items_per_box:'itemsPerBox',gtin:'gtin',gtin_tax:'gtinTax',origin:'origin',ncm:'ncm',cest:'cest',item_type:'itemType',approximate_tax_percent:'approxTax',tax_group:'taxGroup',icms_st_retained_base:'icmsBase',icms_st_retained_value:'icmsValue',own_icms_substitute:'ownIcms',fixed_pis:'fixedPis',fixed_cofins:'fixedCofins',anp_code:'anpCode',anp_description:'anpDescription',glp_percent:'glpPercent',glgn_national_percent:'glgnNational',glgn_imported_percent:'glgnImported',starting_value:'startingValue',additional_fiscal_info:'additionalFiscalInfo'};
  Object.entries(dm).forEach(([k,id])=>setv(id,details[k]??''));
  $('#freeShipping').checked=!!details.free_shipping; setv('minimumStock',stock?.minimum_stock??''); setv('maximumStock',stock?.maximum_stock??''); setv('storageLocation',stock?.storage_location??'');
  $('#supplierId').innerHTML='<option value="">Sem fornecedor</option>'+suppliers.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('');
  setv('supplierId',supplierLink?.supplier_id||''); setv('supplierSku',supplierLink?.supplier_sku||''); setv('supplierDescription',supplierLink?.supplier_product_description||''); setv('warrantyMonths',supplierLink?.warranty_months??''); setv('purchasePrice',supplierLink?.purchase_price??''); setv('freightCost',supplierLink?.freight_cost??''); setv('taxCost',supplierLink?.tax_cost??''); setv('otherCost',supplierLink?.other_cost??'');
  setv('blingProductId',product.bling_product_id||''); setv('blingParentId',product.bling_parent_id||''); setv('blingSku',product.bling_sku||''); setv('blingSyncStatus',product.bling_sync_status||'nao_sincronizado'); setv('blingLastSynced',product.bling_last_synced_at?new Date(product.bling_last_synced_at).toLocaleString('pt-BR'):''); setv('blingSyncError',product.bling_sync_error||'');
  $('#photosLink').href=`../midias-produtos/?produto=${encodeURIComponent(product.id)}`; $('#costsLink').href=`../composicao-custos/?produto=${encodeURIComponent(product.id)}`;
  $('#groups').innerHTML=groups.length?groups.map(g=>`<div class="variant-card"><strong>${esc(g.nome)}</strong><div>${(g.product_options||[]).sort((a,b)=>a.ordem-b.ordem).map(o=>`<span class="pill" style="margin:6px 6px 0 0">${esc(o.nome)}</span>`).join('')}</div></div>`).join(''):'<p class="muted">Sem grupos de variação.</p>';
  $('#variants').innerHTML=variants.length?variants.map(v=>`<div class="variant-card"><strong>${esc(v.nome)}</strong><br><small>${esc(Object.entries(v.option_values||{}).map(([k,x])=>`${k}: ${x}`).join(' · '))}</small></div>`).join(''):'<p class="muted">Sem combinações de variação.</p>';
  $('#variantSelect').innerHTML='<option value="">Preço geral do item</option>'+variants.map(v=>`<option value="${v.id}">${esc(v.nome)}</option>`).join(''); $('#variantSelect').onchange=renderTiers; renderTiers();
}

$('#preco').oninput=()=>{setv('priceBaseMirror',$('#preco').value);setDirty();};
$('#priceBaseMirror').oninput=()=>{setv('preco',$('#priceBaseMirror').value);setDirty();};

function renderTiers(){
  const vid=$('#variantSelect').value||null, rows=workingTiers.filter(t=>(t.variant_id||null)===vid).sort((a,b)=>a.min_qty-b.min_qty);
  $('#tierRows').innerHTML=rows.length?rows.map(t=>`<tr><td><input data-tier-min="${t._local||t.id}" type="number" min="1" value="${t.min_qty}" style="width:150px;padding:9px"></td><td><input data-tier-price="${t._local||t.id}" type="number" min="0" step=".01" value="${t.unit_price}" style="width:170px;padding:9px"></td><td><button class="btn bad" data-tier-del="${t._local||t.id}" type="button">Remover</button></td></tr>`).join(''):'<tr><td colspan="3">Nenhuma faixa cadastrada.</td></tr>';
}
function syncTierInputs(){
  document.querySelectorAll('[data-tier-min]').forEach(i=>{const t=workingTiers.find(x=>(x._local||x.id)===i.dataset.tierMin);if(t)t.min_qty=Math.max(1,Number(i.value)||1);});
  document.querySelectorAll('[data-tier-price]').forEach(i=>{const t=workingTiers.find(x=>(x._local||x.id)===i.dataset.tierPrice);if(t)t.unit_price=Math.max(0,Number(i.value)||0);});
}
$('#addTier').onclick=()=>{if(!product)return;syncTierInputs();workingTiers.push({_local:'new_'+Date.now(),product_id:product.id,variant_id:$('#variantSelect').value||null,min_qty:1,unit_price:0,ativo:true});setDirty();renderTiers();};
document.addEventListener('click',e=>{const b=e.target.closest('[data-tier-del]');if(!b)return;syncTierInputs();workingTiers=workingTiers.filter(x=>(x._local||x.id)!==b.dataset.tierDel);setDirty();renderTiers();});
document.addEventListener('input',e=>{if(e.target.closest('#editor')&&!['variantSelect','preco','priceBaseMirror'].includes(e.target.id))setDirty();});
document.addEventListener('change',e=>{if(e.target.closest('#editor')&&e.target.id!=='variantSelect')setDirty();});
$('#discard').onclick=()=>product&&loadProduct(product.id);
$('#openPublic').onclick=()=>{const href=product?.metadata?.href;if(href)window.open('/'+href.replace(/^\//,''),'_blank','noopener');else alert('Este item ainda não possui página pública cadastrada.');};

async function save(){
  if(!product) return;
  syncTierInputs(); $('#status').className='status'; $('#status').textContent='Salvando...';
  try{
    const pp={sku:txt('sku'),nome:txt('nome'),slug:txt('slug'),catalog_category_id:val('category')||null,product_type:val('productType'),product_format:val('productFormat'),condition:val('condition')||null,product_line:txt('productLine'),unidade:txt('unidade')||'un',preco:Math.max(0,num('preco')||0),ativo:val('ativo')==='true',descricao:txt('descricao'),short_description:txt('shortDescription'),complementary_description:txt('complementaryDescription'),external_link:txt('externalLink'),video_link:txt('videoLink'),notes:txt('notes'),bling_product_id:num('blingProductId'),bling_parent_id:num('blingParentId'),bling_sku:txt('blingSku'),bling_sync_status:val('blingSyncStatus')};
    const {data:pd,error:pe}=await supabase.from('products').update(pp).eq('id',product.id).select('*').single(); if(pe) throw pe;
    const dp={product_id:product.id,brand:txt('brand'),model:txt('model'),production_mode:val('productionMode')||null,expiration_date:val('expirationDate')||null,free_shipping:$('#freeShipping').checked,net_weight_kg:num('netWeight'),gross_weight_kg:num('grossWeight'),width_cm:num('widthCm'),height_cm:num('heightCm'),depth_cm:num('depthCm'),dimensions_unit:val('dimensionsUnit')||'cm',volumes:num('volumes'),items_per_box:num('itemsPerBox'),gtin:txt('gtin'),gtin_tax:txt('gtinTax'),origin:txt('origin'),ncm:txt('ncm'),cest:txt('cest'),item_type:txt('itemType'),approximate_tax_percent:num('approxTax'),tax_group:txt('taxGroup'),icms_st_retained_base:num('icmsBase'),icms_st_retained_value:num('icmsValue'),own_icms_substitute:num('ownIcms'),fixed_pis:num('fixedPis'),fixed_cofins:num('fixedCofins'),anp_code:txt('anpCode'),anp_description:txt('anpDescription'),glp_percent:num('glpPercent'),glgn_national_percent:num('glgnNational'),glgn_imported_percent:num('glgnImported'),starting_value:num('startingValue'),additional_fiscal_info:txt('additionalFiscalInfo'),updated_at:new Date().toISOString()};
    const {error:de}=await supabase.from('product_details').upsert(dp,{onConflict:'product_id'}); if(de) throw de;
    const location=(await supabase.from('stock_locations').select('id').eq('active',true).order('created_at').limit(1).maybeSingle()).data;
    if(location?.id){const sr={product_id:product.id,variant_id:null,location_id:location.id,minimum_stock:num('minimumStock')||0,maximum_stock:num('maximumStock'),storage_location:txt('storageLocation'),updated_at:new Date().toISOString()};if(stock?.id){const{error}=await supabase.from('product_stock_settings').update(sr).eq('id',stock.id);if(error)throw error;}else if(sr.minimum_stock||sr.maximum_stock!==null||sr.storage_location){const{error}=await supabase.from('product_stock_settings').insert(sr);if(error)throw error;}}
    if(supplierLink?.id&&supplierLink.supplier_id!==val('supplierId')){const{error}=await supabase.from('product_suppliers').update({preferred:false}).eq('id',supplierLink.id);if(error)throw error;supplierLink=null;}
    if(val('supplierId')){const row={product_id:product.id,variant_id:null,supplier_id:val('supplierId'),supplier_sku:txt('supplierSku'),supplier_product_description:txt('supplierDescription'),warranty_months:num('warrantyMonths'),purchase_price:num('purchasePrice')||0,freight_cost:num('freightCost')||0,tax_cost:num('taxCost')||0,other_cost:num('otherCost')||0,preferred:true,active:true,updated_at:new Date().toISOString()};if(supplierLink?.id){const{error}=await supabase.from('product_suppliers').update(row).eq('id',supplierLink.id);if(error)throw error;}else{const{error}=await supabase.from('product_suppliers').insert(row);if(error)throw error;}}
    const oldIds=tiers.filter(t=>t.id).map(t=>t.id), keep=workingTiers.filter(t=>t.id).map(t=>t.id), remove=oldIds.filter(id=>!keep.includes(id));
    if(remove.length){const{error}=await supabase.from('product_price_tiers').delete().in('id',remove);if(error)throw error;}
    for(const t of workingTiers){const row={product_id:product.id,variant_id:t.variant_id||null,min_qty:Math.max(1,Number(t.min_qty)),unit_price:Math.max(0,Number(t.unit_price)),ativo:true};if(t.id){const{error}=await supabase.from('product_price_tiers').update(row).eq('id',t.id);if(error)throw error;}else{const{error}=await supabase.from('product_price_tiers').insert(row);if(error)throw error;}}
    const idx=products.findIndex(x=>x.id===product.id); if(idx>=0) products[idx]={...products[idx],...pd}; product=pd; setDirty(false); $('#status').className='status ok'; $('#status').textContent='Item salvo com sucesso.'; await loadProduct(product.id);
  }catch(e){console.error(e);$('#status').className='status bad';$('#status').textContent='Não foi possível salvar: '+(e.message||'erro desconhecido');}
}
$('#save').onclick=save;

async function importBling(){
  const code=$('#blingImportCode').value.trim();
  if(!code){$('#importStatus').className='status bad';$('#importStatus').textContent='Informe o código ou ID no Bling.';return;}
  if(dirty&&!confirm('Há alterações não salvas. Continuar com a importação?')) return;
  setDirty(false); $('#importBling').disabled=true; $('#importStatus').className='status'; $('#importStatus').textContent='Importando...';
  try{const{data,error}=await supabase.functions.invoke('bling-import-product',{body:{code}});if(error)throw error;if(data?.error)throw new Error(data.detail||data.error);await loadBase();const p=products.find(x=>x.id===data.product?.id||String(x.bling_product_id)===String(data.product?.bling_product_id));if(p)await loadProduct(p.id);$('#importStatus').className='status ok';$('#importStatus').textContent='Importação concluída.';$('#blingImportCode').value='';}catch(e){console.error(e);$('#importStatus').className='status bad';$('#importStatus').textContent='Não foi possível importar.';}finally{$('#importBling').disabled=false;}
}
$('#importBling').onclick=importBling;
$('#blingImportCode').addEventListener('keydown',e=>{if(e.key==='Enter')importBling();});
if(session.profile?.role!=='owner'){$('#importCard').querySelectorAll('input,button').forEach(x=>x.disabled=true);$('#importStatus').textContent='Importação disponível para o proprietário.';}

injectListStyles(); ensureFilters();
loadBase().catch(e=>{console.error(e);$('#productCount').textContent='Falha ao carregar';$('#productList').innerHTML='<p class="status bad">Não foi possível carregar os itens.</p>';});
