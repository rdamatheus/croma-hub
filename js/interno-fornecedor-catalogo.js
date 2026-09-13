import { protectInternalPage } from './interno-auth.js';
import { supabase,esc,brl,fmtDateTime,fetchAll,loadSupplierDirectoryAll,loadSupplierLinkContext,sanitizeSearch,waitFor,downloadText } from './supplier-admin-shared.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('Acesso não autorizado.');
const supplierId=new URLSearchParams(location.search).get('supplier')||'';
if(!supplierId){location.href='/interno/fornecedores/';throw new Error('Fornecedor ausente.');}
const el=id=>document.getElementById(id);
const state={supplier:null,directory:null,links:[],linkByCatalog:new Map(),divergentIds:new Set(),linkedIds:new Set(),latestImport:null,page:1,pageSize:30,total:0,allFiltered:null,categories:[],activeCount:0};

function initials(name=''){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'F'}
function pricingBase(row){const map={m2:'m²',cm2:'cm²',linear_m:'metro linear',lot:'lote',unit:'unidade',unknown:''};return row.unit||map[row.pricing_unit]||'—'}
function ageStart(filter){const day=86400000;if(filter==='today')return new Date(Date.now()-day).toISOString();if(filter==='7d')return new Date(Date.now()-7*day).toISOString();if(filter==='30d')return new Date(Date.now()-30*day).toISOString();return null}

async function init(){
  el('pageStatus').textContent='Carregando catálogo do fornecedor…';
  try{
    const [{data:supplier,error:se},directory,ctx,countResult]=await Promise.all([
      supabase.from('suppliers').select('id,contact_id,name,active,default_order_freight,updated_at').eq('id',supplierId).maybeSingle(),
      loadSupplierDirectoryAll(),loadSupplierLinkContext(supplierId),
      supabase.from('supplier_catalog_items').select('id',{count:'exact',head:true}).eq('supplier_id',supplierId).eq('active',true)
    ]);
    if(se)throw se;if(countResult.error)throw countResult.error;if(!supplier)throw new Error('Fornecedor não encontrado.');
    state.supplier=supplier;state.directory=directory.find(x=>x.supplierId===supplierId)||null;state.links=ctx.links;state.activeCount=countResult.count||0;
    for(const link of ctx.links){if(link.supplier_catalog_item_id){state.linkedIds.add(link.supplier_catalog_item_id);if(!state.linkByCatalog.has(link.supplier_catalog_item_id))state.linkByCatalog.set(link.supplier_catalog_item_id,[]);state.linkByCatalog.get(link.supplier_catalog_item_id).push(link);if(link.divergent)state.divergentIds.add(link.supplier_catalog_item_id)}}
    await Promise.all([loadLatestImport(),loadCategories()]);
    renderHeader();renderKpis();renderImportSummary();await loadRows();wireImporter();
    if(location.hash==='#history')openHistory();
    el('pageStatus').textContent='';
  }catch(error){console.error(error);el('pageStatus').textContent=error.message||'Falha ao carregar catálogo.';el('pageStatus').className='status bad'}
}

async function loadLatestImport(){const{data,error}=await supabase.from('supplier_catalog_imports').select('id,original_file_name,status,items_processed,imported_at,completed_at,metadata,error_message').eq('supplier_id',supplierId).order('imported_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;state.latestImport=data||null}
async function loadCategories(){
  const rows=await fetchAll('supplier_catalog_items','category',q=>q.eq('supplier_id',supplierId).eq('active',true).not('category','is',null));
  state.categories=[...new Set(rows.map(x=>String(x.category||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  el('categoryFilter').innerHTML='<option value="">Todas</option>'+state.categories.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
}
function renderHeader(){const name=state.directory?.name||state.supplier.name;el('supplierName').textContent=name;el('supplierAvatar').textContent=initials(name);el('supplierBling').textContent=state.directory?.blingContactId?`Contato Bling: ${state.directory.legalName||name} · ID ${state.directory.blingContactId}`:'Fornecedor cadastrado no Croma Hub'}
function renderKpis(){el('kpiItems').textContent=state.activeCount.toLocaleString('pt-BR');el('kpiLinked').textContent=new Set(state.links.map(x=>x.product_id)).size.toLocaleString('pt-BR');el('kpiUnlinked').textContent=Math.max(0,state.activeCount-state.linkedIds.size).toLocaleString('pt-BR');el('kpiDivergent').textContent=state.divergentIds.size.toLocaleString('pt-BR')}
function renderImportSummary(){const r=state.latestImport;el('importSummary').innerHTML=r?`<div><strong>Arquivo:</strong><br>${esc(r.original_file_name||'—')}</div><div><strong>Importado em:</strong><br>${fmtDateTime(r.imported_at)}</div><div><strong>Itens processados:</strong><br>${Number(r.items_processed||0).toLocaleString('pt-BR')}</div><div><strong>Status:</strong><br>${esc(r.status||'—')}</div>`:'<span class="muted">Ainda não existe importação registrada para este fornecedor.</span>'}

function baseQuery(){
  let q=supabase.from('supplier_catalog_items').select('id,sku,name,description,category,purchase_price,unit,pricing_unit,minimum_order_quantity,lead_time_days,active,validation_status,validation_notes,last_synced_at,updated_at,source_import_id',{count:'exact'}).eq('supplier_id',supplierId);
  const search=sanitizeSearch(el('catalogSearch').value),status=el('validationFilter').value,category=el('categoryFilter').value,update=el('updateFilter').value;
  if(status==='inactive')q=q.eq('active',false);else{q=q.eq('active',true);if(status)q=q.eq('validation_status',status)}
  if(search)q=q.or(`sku.ilike.%${search}%,name.ilike.%${search}%,description.ilike.%${search}%`);
  if(category)q=q.eq('category',category);
  const start=ageStart(update);if(start)q=q.gte('updated_at',start);if(update==='old')q=q.lt('updated_at',new Date(Date.now()-30*86400000).toISOString());
  const sort=el('sortFilter').value;if(sort==='name')q=q.order('name');else if(sort==='price')q=q.order('purchase_price');else if(sort==='recent')q=q.order('updated_at',{ascending:false});else q=q.order('sku');
  return q;
}
async function fetchAllBase(){
  const out=[];for(let from=0;;from+=1000){const{data,error}=await baseQuery().range(from,from+999);if(error)throw error;out.push(...(data||[]));if(!data||data.length<1000)break}return out;
}
async function loadRows(){
  el('pageStatus').textContent='Carregando itens…';
  try{
    const linkFilter=el('linkFilter').value,divergent=el('onlyDivergent').checked;
    if(linkFilter||divergent){
      let rows=await fetchAllBase();
      if(linkFilter==='linked')rows=rows.filter(r=>state.linkedIds.has(r.id));
      if(linkFilter==='unlinked')rows=rows.filter(r=>!state.linkedIds.has(r.id));
      if(divergent)rows=rows.filter(r=>state.divergentIds.has(r.id));
      state.allFiltered=rows;state.total=rows.length;state.page=Math.min(state.page,Math.max(1,Math.ceil(state.total/state.pageSize)));renderRows(rows.slice((state.page-1)*state.pageSize,state.page*state.pageSize));
    }else{
      state.allFiltered=null;let from=(state.page-1)*state.pageSize;let result=await baseQuery().range(from,from+state.pageSize-1);if(result.error)throw result.error;state.total=result.count||0;const pages=Math.max(1,Math.ceil(state.total/state.pageSize));if(state.page>pages){state.page=pages;from=(state.page-1)*state.pageSize;result=await baseQuery().range(from,from+state.pageSize-1);if(result.error)throw result.error}renderRows(result.data||[]);
    }
    el('pageStatus').textContent='';
  }catch(error){console.error(error);el('pageStatus').textContent=error.message||'Falha ao carregar itens.';el('pageStatus').className='status bad'}
}
function rowStatus(row){if(state.divergentIds.has(row.id))return'<span class="pill bad">Divergência</span>';if(row.validation_status==='reject')return'<span class="pill bad">Rejeitado</span>';if(row.validation_status==='review')return'<span class="pill warn">Revisar</span>';if(state.linkedIds.has(row.id))return'<span class="pill ok">Vinculado</span>';return'<span class="pill off">Sem vínculo</span>'}
function linkedProduct(row){const links=state.linkByCatalog.get(row.id)||[];if(!links.length)return'<span class="muted">—</span>';const names=links.map(x=>x.product?.nome||x.product?.sku||'Produto Croma').filter(Boolean);return `${esc(names[0])}${names.length>1?` <span class="muted">+${names.length-1}</span>`:''}`}
function renderRows(rows){
  el('catalogRows').innerHTML=rows.length?rows.map(r=>`<tr><td><a href="/interno/fornecedores/item/?item=${encodeURIComponent(r.id)}">${esc(r.sku)}</a></td><td>${esc(r.name||r.description||'—')}</td><td>${esc(r.category||'—')}</td><td class="nowrap">${brl(r.purchase_price)}</td><td>${esc(pricingBase(r))}</td><td>${rowStatus(r)}</td><td>${linkedProduct(r)}</td><td class="nowrap">${fmtDateTime(r.updated_at||r.last_synced_at)}</td><td><a class="btn light" href="/interno/fornecedores/item/?item=${encodeURIComponent(r.id)}">Ver</a></td></tr>`).join(''):'<tr><td colspan="9" class="loading-skeleton">Nenhum item encontrado com estes filtros.</td></tr>';
  const pages=Math.max(1,Math.ceil(state.total/state.pageSize));if(state.page>pages)state.page=pages;el('catalogCount').textContent=`${state.total.toLocaleString('pt-BR')} item(ns)`;el('pageInfo').textContent=`Página ${state.page} de ${pages} · ${state.total.toLocaleString('pt-BR')} resultado(s)`;el('prevPage').disabled=state.page<=1;el('nextPage').disabled=state.page>=pages;
}

async function exportCsv(){
  const button=el('exportCsv');button.disabled=true;button.textContent='Preparando…';
  try{const rows=await fetchAll('supplier_catalog_items','sku,name,description,category,purchase_price,unit,pricing_unit,minimum_order_quantity,lead_time_days,validation_status,updated_at',q=>q.eq('supplier_id',supplierId).eq('active',true).order('sku'));const cols=['sku','name','description','category','purchase_price','unit','pricing_unit','minimum_order_quantity','lead_time_days','validation_status','updated_at'];const cell=v=>`"${String(v??'').replaceAll('"','""')}"`;const csv='\ufeff'+[cols.join(';'),...rows.map(r=>cols.map(c=>cell(r[c])).join(';'))].join('\n');downloadText(`catalogo-${(state.supplier.name||'fornecedor').toLowerCase().replace(/[^a-z0-9]+/gi,'-')}.csv`,csv,'text/csv;charset=utf-8');}catch(e){alert(e.message||'Falha ao exportar catálogo.')}finally{button.disabled=false;button.textContent='Exportar CSV'}
}

async function openHistory(){
  const dlg=el('historyDialog');dlg.showModal();el('historyStatus').textContent='Carregando histórico…';
  const{data,error}=await supabase.from('supplier_catalog_imports').select('original_file_name,status,items_processed,imported_at,completed_at,error_message').eq('supplier_id',supplierId).order('imported_at',{ascending:false}).limit(100);
  if(error){el('historyStatus').textContent=error.message;return}el('historyStatus').textContent=`${(data||[]).length} importação(ões) mais recente(s).`;el('historyRows').innerHTML=(data||[]).map(r=>`<tr><td><strong>${esc(r.original_file_name||'—')}</strong>${r.error_message?`<div class="supplier-meta">${esc(r.error_message)}</div>`:''}</td><td>${fmtDateTime(r.imported_at)}</td><td>${Number(r.items_processed||0).toLocaleString('pt-BR')}</td><td>${esc(r.status||'—')}</td><td>${fmtDateTime(r.completed_at)}</td></tr>`).join('')||'<tr><td colspan="5">Nenhuma importação registrada.</td></tr>';
}
async function openImporter(){const btn=await waitFor('#openSupplierCatalogImport');if(!btn)return alert('Importador indisponível.');btn.click();const select=await waitFor('#scSupplier');const contactId=state.directory?.contactId;if(select&&contactId){for(let i=0;i<50&&!select.querySelector(`option[value="${CSS.escape(contactId)}"]`);i++)await new Promise(r=>setTimeout(r,80));if(select.querySelector(`option[value="${CSS.escape(contactId)}"]`)){select.value=contactId;select.dispatchEvent(new Event('change',{bubbles:true}))}}}
function wireImporter(){(async()=>{const dlg=await waitFor('#supplierCatalogDialog');if(dlg&&!dlg.dataset.catalogPageRefresh){dlg.dataset.catalogPageRefresh='1';dlg.addEventListener('close',()=>setTimeout(()=>location.reload(),400))}})()}

const resetPage=()=>{state.page=1;loadRows()};
['validationFilter','categoryFilter','linkFilter','updateFilter','onlyDivergent','sortFilter'].forEach(id=>el(id).addEventListener('change',resetPage));let timer;el('catalogSearch').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(resetPage,300)});el('prevPage').onclick=()=>{if(state.page>1){state.page--;loadRows()}};el('nextPage').onclick=()=>{const pages=Math.max(1,Math.ceil(state.total/state.pageSize));if(state.page<pages){state.page++;loadRows()}};el('updateCatalog').onclick=openImporter;el('exportCsv').onclick=exportCsv;el('downloadAction').onclick=exportCsv;el('historyAction').onclick=openHistory;el('closeHistory').onclick=()=>el('historyDialog').close();el('unlinkedAction').onclick=()=>{el('linkFilter').value='unlinked';el('onlyDivergent').checked=false;resetPage()};el('divergentAction').onclick=()=>{el('onlyDivergent').checked=true;resetPage()};
await init();
