import { protectInternalPage } from './interno-auth.js';
import { esc,fmtDateTime,loadSupplierDirectoryAll,loadSupplierLinkContext,fetchAll,importAgeBucket,waitFor } from './supplier-admin-shared.js';

const session=await protectInternalPage({roles:['owner','manager']});
if(!session)throw new Error('Acesso não autorizado.');

const state={suppliers:[],imports:[],links:[],rows:[],page:1,pageSize:15,filters:{supplier:'',status:'',catalog:'',update:'',linked:'',divergent:false,sort:'recent'}};
const el=id=>document.getElementById(id);
const latestBySupplier=new Map();
const statsBySupplier=new Map();

function supplierStats(id){if(!statsBySupplier.has(id))statsBySupplier.set(id,{linked:0,divergent:0});return statsBySupplier.get(id)}

async function load(){
  el('pageStatus').textContent='Carregando dados dos fornecedores…';
  try{
    const [suppliers,imports,ctx]=await Promise.all([
      loadSupplierDirectoryAll(),
      fetchAll('supplier_catalog_imports','id,supplier_id,original_file_name,status,items_processed,imported_at,completed_at,created_at,updated_at',q=>q.order('imported_at',{ascending:false})),
      loadSupplierLinkContext()
    ]);
    state.suppliers=suppliers;state.imports=imports;state.links=ctx.links;
    latestBySupplier.clear();statsBySupplier.clear();
    for(const row of imports){if(row.supplier_id&&!latestBySupplier.has(row.supplier_id))latestBySupplier.set(row.supplier_id,row)}
    for(const link of ctx.links){const s=supplierStats(link.supplier_id);s.linked++;if(link.divergent)s.divergent++}
    buildRows();populateSupplierSelect();renderKpis();applyFilters();wireImporterRefresh();
    el('pageStatus').textContent='';
  }catch(error){console.error(error);el('pageStatus').textContent=error.message||'Falha ao carregar fornecedores.';el('pageStatus').className='status bad'}
}

function buildRows(){
  state.rows=state.suppliers.map(s=>{
    const imp=s.supplierId?latestBySupplier.get(s.supplierId)||null:null;
    const stats=s.supplierId?supplierStats(s.supplierId):{linked:0,divergent:0};
    const last=imp?.completed_at||imp?.imported_at||null;
    return {...s,latestImport:imp,lastImport:last,catalogCount:Number(imp?.items_processed||0),linkedCount:stats.linked,divergenceCount:stats.divergent,hasCatalog:!!imp||stats.linked>0,active:s.contactActive&&s.supplierActive};
  });
}

function populateSupplierSelect(){
  el('supplierFilter').innerHTML='<option value="">Todos os fornecedores</option>'+state.rows.map(r=>`<option value="${esc(r.contactId)}">${esc(r.name)}</option>`).join('');
}
function renderKpis(){
  el('kpiActive').textContent=state.rows.filter(r=>r.active).length.toLocaleString('pt-BR');
  el('kpiCatalogs').textContent=state.rows.filter(r=>r.hasCatalog).length.toLocaleString('pt-BR');
  el('kpiLinked').textContent=state.links.length.toLocaleString('pt-BR');
  el('kpiDivergent').textContent=state.links.filter(r=>r.divergent).length.toLocaleString('pt-BR');
}

function applyFilters(){
  state.filters={supplier:el('supplierFilter').value,status:el('statusFilter').value,catalog:el('catalogFilter').value,update:el('updateFilter').value,linked:el('linkedFilter').value,divergent:el('divergenceFilter').checked,sort:el('sortFilter').value};
  let rows=state.rows.filter(r=>{
    if(state.filters.supplier&&r.contactId!==state.filters.supplier)return false;
    if(state.filters.status==='active'&&!r.active)return false;
    if(state.filters.status==='inactive'&&r.active)return false;
    if(state.filters.catalog==='yes'&&!r.hasCatalog)return false;
    if(state.filters.catalog==='no'&&r.hasCatalog)return false;
    if(state.filters.update&&importAgeBucket(r.lastImport)!==state.filters.update)return false;
    if(state.filters.linked==='yes'&&!r.linkedCount)return false;
    if(state.filters.linked==='no'&&r.linkedCount)return false;
    if(state.filters.divergent&&!r.divergenceCount)return false;
    return true;
  });
  rows.sort((a,b)=>{
    if(state.filters.sort==='name')return a.name.localeCompare(b.name,'pt-BR');
    if(state.filters.sort==='items')return b.catalogCount-a.catalogCount||a.name.localeCompare(b.name,'pt-BR');
    if(state.filters.sort==='divergence')return b.divergenceCount-a.divergenceCount||a.name.localeCompare(b.name,'pt-BR');
    return (new Date(b.lastImport||b.updatedAt||0))-(new Date(a.lastImport||a.updatedAt||0));
  });
  state.filtered=rows;state.page=Math.min(state.page,Math.max(1,Math.ceil(rows.length/state.pageSize)));renderRows();
}

function renderRows(){
  const rows=state.filtered||[];const pages=Math.max(1,Math.ceil(rows.length/state.pageSize));const start=(state.page-1)*state.pageSize;const pageRows=rows.slice(start,start+state.pageSize);
  el('resultCount').textContent=`${rows.length.toLocaleString('pt-BR')} fornecedor(es)`;
  el('supplierRows').innerHTML=pageRows.length?pageRows.map(r=>`<tr><td><div class="supplier-name">${esc(r.name)}</div><div class="supplier-meta">${esc(r.legalName||'')}</div></td><td>${r.blingContactId?`<strong>${esc(r.legalName||r.name)}</strong><div class="supplier-meta">ID ${esc(r.blingContactId)}</div>`:'<span class="muted">Sem vínculo Bling</span>'}</td><td class="nowrap">${r.hasCatalog?r.catalogCount.toLocaleString('pt-BR'):'—'}</td><td class="nowrap">${r.lastImport?fmtDateTime(r.lastImport):'Nunca'}</td><td>${r.linkedCount.toLocaleString('pt-BR')}</td><td>${r.divergenceCount?`<span class="pill bad">${r.divergenceCount}</span>`:'<span class="pill ok">0</span>'}</td><td>${r.active?'<span class="pill ok">Ativo</span>':'<span class="pill off">Inativo</span>'}</td><td>${r.supplierId?`<a class="btn light" href="/interno/fornecedores/catalogo/?supplier=${encodeURIComponent(r.supplierId)}">Ver catálogo</a>`:'<span class="muted">Cadastro operacional pendente</span>'}</td></tr>`).join(''):'<tr><td colspan="8" class="loading-skeleton">Nenhum fornecedor encontrado com estes filtros.</td></tr>';
  el('pageInfo').textContent=`Página ${state.page} de ${pages} · mostrando ${pageRows.length?start+1:0}–${Math.min(start+state.pageSize,rows.length)} de ${rows.length}`;
  el('prevPage').disabled=state.page<=1;el('nextPage').disabled=state.page>=pages;
}

async function openNewSupplier(){
  const dlg=await waitFor('#supplierQuickAddDialog');
  if(!dlg)return alert('O cadastro rápido de fornecedor ainda não está disponível. Atualize a página e tente novamente.');
  dlg.showModal();
}
async function openImport(){
  const btn=await waitFor('#openSupplierCatalogImport');
  if(!btn)return alert('O importador de catálogo ainda não está disponível.');
  btn.click();
}
function wireImporterRefresh(){
  const attach=async()=>{
    const quick=await waitFor('#supplierQuickAddDialog');const imp=await waitFor('#supplierCatalogDialog');
    if(quick&&!quick.dataset.supplierPageRefresh){quick.dataset.supplierPageRefresh='1';quick.addEventListener('close',()=>setTimeout(load,350))}
    if(imp&&!imp.dataset.supplierPageRefresh){imp.dataset.supplierPageRefresh='1';imp.addEventListener('close',()=>setTimeout(load,350))}
  };attach();
}

['supplierFilter','statusFilter','catalogFilter','updateFilter','linkedFilter','divergenceFilter','sortFilter'].forEach(id=>el(id).addEventListener('change',()=>{state.page=1;applyFilters()}));
el('prevPage').onclick=()=>{if(state.page>1){state.page--;renderRows()}};el('nextPage').onclick=()=>{const pages=Math.max(1,Math.ceil((state.filtered||[]).length/state.pageSize));if(state.page<pages){state.page++;renderRows()}};
el('newSupplier').onclick=openNewSupplier;el('newSupplierInline').onclick=openNewSupplier;el('importCatalog').onclick=openImport;
await load();
