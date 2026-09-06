import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const slugify=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const PAGE_SIZE=10;

let session=null,families=[],categories=[],products=[],blingMappings=[],blingCategories=[];
let editing=null,currentScope='produto',selectedCategory=null,productPage=1,productSearch='';

function errorText(value,fallback='Não foi possível concluir a operação.'){
  if(!value)return fallback;
  if(typeof value==='string')return value;
  if(value instanceof Error&&value.message)return value.message;
  if(typeof value==='object'){
    for(const k of ['message','details','detail','hint','error_description'])if(typeof value[k]==='string'&&value[k].trim())return value[k].trim();
    if(value.error)return errorText(value.error,fallback);
    if(value.code)return `${fallback} (${value.code})`;
  }
  return fallback;
}
function setStatus(id,msg='',kind=''){const el=$(id);if(!el)return;el.className=`tx-status ${kind}`;el.textContent=msg}
function family(id){return families.find(f=>f.id===id)||null}
function category(id){return categories.find(c=>c.id===id)||null}
function familyLabel(id){return family(id)?.nome||'Sem família'}
function categoryPath(id){const c=category(id);if(!c)return'Sem categoria';const p=c.parent_id?category(c.parent_id):null;return [familyLabel(c.family_id),p?.nome,c.nome].filter(Boolean).join(' → ')}
function mappingForLocal(id){return blingMappings.find(m=>m.local_id===id)}
function mappingForExternal(id){return blingMappings.find(m=>String(m.external_id)===String(id))}
function rootCategories(scope,familyId){return categories.filter(c=>c.ativo&&c.catalog_scope===scope&&c.family_id===familyId&&!c.parent_id).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))}
function childCategories(parentId){return categories.filter(c=>c.ativo&&c.parent_id===parentId).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'))}

async function fetchAllProducts(){
  const all=[],size=1000;
  for(let from=0;;from+=size){
    const {data,error}=await supabase.from('products').select('id,nome,sku,product_type,catalog_category_id,bling_product_id,ativo').eq('ativo',true).order('nome').order('id').range(from,from+size-1);
    if(error)throw error;
    const rows=data||[];all.push(...rows);if(rows.length<size)break;
  }
  return all;
}

async function loadBase(){
  const [p,f,c,m]=await Promise.all([
    fetchAllProducts(),
    supabase.from('catalog_families').select('*').eq('ativo',true).order('catalog_scope').order('ordem'),
    supabase.from('catalog_categories').select('*').order('catalog_scope').order('ordem').order('nome'),
    supabase.from('erp_entity_mappings').select('*').eq('provider','bling').eq('entity_type','category')
  ]);
  for(const r of [f,c])if(r.error)throw r.error;
  products=p;families=f.data||[];categories=c.data||[];blingMappings=m.error?[]:(m.data||[]);
  renderKpis();fillEditorOptions();renderTree();renderInspector();
}

function renderKpis(){
  const vals={
    kFamilies:families.length,
    kCategories:categories.filter(c=>c.ativo).length,
    kProducts:products.filter(p=>p.product_type==='produto').length,
    kServices:products.filter(p=>p.product_type==='servico').length,
    kUnclassified:products.filter(p=>!p.catalog_category_id).length,
    kBling:blingMappings.filter(m=>m.local_id).length
  };
  Object.entries(vals).forEach(([id,v])=>{if($(id))$(id).textContent=String(v)})
}

function renderTree(){
  const root=$('structureTree');if(!root)return;
  const q=norm($('treeSearch')?.value||'');
  const fams=families.filter(f=>f.catalog_scope===currentScope);
  const html=fams.map(f=>{
    const roots=rootCategories(currentScope,f.id);
    const items=[];
    for(const r of roots){
      const children=childCategories(r.id);
      if(!q||norm(`${f.nome} ${r.nome}`).includes(q)||children.some(c=>norm(c.nome).includes(q))){
        items.push(`<button class="tx-node ${selectedCategory===r.id?'selected':''}" data-category="${r.id}"><span class="tx-node-copy"><strong>${esc(r.nome)}</strong><small>${products.filter(p=>p.catalog_category_id===r.id).length} item(ns)</small></span></button>`);
        for(const c of children.filter(c=>!q||norm(`${f.nome} ${r.nome} ${c.nome}`).includes(q))){
          items.push(`<button class="tx-node tx-indent-1 ${selectedCategory===c.id?'selected':''}" data-category="${c.id}"><span class="tx-node-copy"><strong>${esc(c.nome)}</strong><small>${products.filter(p=>p.catalog_category_id===c.id).length} item(ns)</small></span></button>`);
        }
      }
    }
    return `<div class="tx-family"><div class="tx-family-head"><span class="tx-family-name">${esc(f.nome)}</span><span class="tx-badge">${roots.length}</span></div><div class="tx-children">${items.join('')||'<div class="tx-empty compact">Sem categorias</div>'}</div></div>`;
  }).join('');
  root.innerHTML=html||'<div class="tx-empty">Nenhuma família encontrada.</div>';
  root.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>selectCategory(b.dataset.category));
}

function fillEditorOptions(){
  const scope=$('editScope')?.value||currentScope;
  if($('editFamily')){
    const current=$('editFamily').value;
    $('editFamily').innerHTML='<option value="">Selecione a família...</option>'+families.filter(f=>f.catalog_scope===scope).map(f=>`<option value="${f.id}">${esc(f.nome)}</option>`).join('');
    if([...$('editFamily').options].some(o=>o.value===current))$('editFamily').value=current;
  }
  if($('editParent')){
    const current=$('editParent').value;
    const famId=$('editFamily')?.value||'';
    $('editParent').innerHTML='<option value="">Categoria principal</option>'+categories.filter(c=>c.ativo&&c.catalog_scope===scope&&!c.parent_id&&c.id!==editing?.id&&(!famId||c.family_id===famId)).map(c=>`<option value="${c.id}">${esc(c.nome)}</option>`).join('');
    if([...$('editParent').options].some(o=>o.value===current))$('editParent').value=current;
  }
}

function resetEditor(){
  editing=null;
  $('editorTitle').textContent='Nova categoria';
  ['editName','editSlug','editDescription'].forEach(id=>$(id).value='');
  $('editScope').value=currentScope;$('editOrder').value='0';$('editActive').checked=true;$('editPublicVisible').checked=false;$('editNav').checked=false;$('editFeatured').checked=false;
  fillEditorOptions();$('editFamily').value='';fillEditorOptions();$('editParent').value='';$('blingMapInfo').textContent='Não vinculada ao Bling';setStatus('txStatus','');
}

function selectCategory(id){
  selectedCategory=id;productPage=1;productSearch='';
  const c=category(id);if(!c)return;
  editing=c;currentScope=c.catalog_scope||'produto';
  $('structureScope').value=currentScope;$('editScope').value=currentScope;fillEditorOptions();
  $('editorTitle').textContent='Editar categoria';$('editName').value=c.nome||'';$('editSlug').value=c.slug||'';$('editDescription').value=c.descricao||'';$('editOrder').value=c.ordem||0;$('editActive').checked=!!c.ativo;$('editPublicVisible').checked=!!c.public_visible;$('editNav').checked=!!c.show_in_navigation;$('editFeatured').checked=!!c.featured_home;
  $('editFamily').value=c.family_id||'';fillEditorOptions();$('editParent').value=c.parent_id||'';
  const map=mappingForLocal(c.id);$('blingMapInfo').textContent=map?`Bling #${map.external_id}`:'Não vinculada ao Bling';
  renderTree();renderInspector();
}

async function saveCategory(){
  try{
    setStatus('txStatus','Salvando...');
    const name=$('editName').value.trim(),scope=$('editScope').value,familyId=$('editFamily').value||null,parentId=$('editParent').value||null;
    if(!name)throw new Error('Informe o nome da categoria.');
    if(!familyId)throw new Error('Toda categoria deve pertencer a uma família.');
    if(parentId){const p=category(parentId);if(!p||p.catalog_scope!==scope||p.family_id!==familyId)throw new Error('A subcategoria deve usar uma categoria pai da mesma família e do mesmo tipo.');if(p.parent_id)throw new Error('A estrutura suporta apenas Categoria → Subcategoria.');}
    const row={nome:name,slug:$('editSlug').value.trim()||slugify(name),descricao:$('editDescription').value.trim()||null,catalog_scope:scope,family_id:familyId,parent_id:parentId,ordem:Number($('editOrder').value)||0,ativo:$('editActive').checked,public_visible:$('editPublicVisible').checked,show_in_navigation:$('editNav').checked,featured_home:$('editFeatured').checked,updated_at:new Date().toISOString()};
    let id=editing?.id;
    if(id){const {error}=await supabase.from('catalog_categories').update(row).eq('id',id);if(error)throw error}
    else{const {data,error}=await supabase.from('catalog_categories').insert(row).select('id').single();if(error)throw error;id=data.id}
    await loadBase();selectCategory(id);setStatus('txStatus','Categoria salva.','ok');
  }catch(e){setStatus('txStatus',errorText(e,'Falha ao salvar categoria.'),'bad')}
}

function inspectorRows(){
  if(!selectedCategory)return[];
  const ids=[selectedCategory];
  const c=category(selectedCategory);if(c&&!c.parent_id)ids.push(...childCategories(c.id).map(x=>x.id));
  const q=norm(productSearch);
  return products.filter(p=>ids.includes(p.catalog_category_id)&&(!q||norm(`${p.nome} ${p.sku||''}`).includes(q)));
}

function destinationOptions(product){
  return '<option value="">Sem categoria</option>'+categories.filter(c=>c.ativo&&c.catalog_scope===product.product_type).map(c=>`<option value="${c.id}" ${c.id===product.catalog_category_id?'selected':''}>${esc(categoryPath(c.id))}</option>`).join('');
}

function renderInspector(){
  const el=$('structureInspector');if(!el)return;
  if(!selectedCategory){el.innerHTML='<div class="tx-empty">Selecione uma categoria para ver e reorganizar os produtos vinculados.</div>';return}
  const c=category(selectedCategory);if(!c){el.innerHTML='<div class="tx-empty">Categoria não encontrada.</div>';return}
  const rows=inspectorRows(),pages=Math.max(1,Math.ceil(rows.length/PAGE_SIZE));productPage=Math.min(productPage,pages);const visible=rows.slice((productPage-1)*PAGE_SIZE,productPage*PAGE_SIZE);
  el.innerHTML=`<div class="tx-card-head"><div><span class="internal-eyebrow">Produtos vinculados</span><h2>${esc(categoryPath(c.id))}</h2><p class="tx-help">${rows.length} item(ns). Você pode pesquisar, mover ou deixar um item sem categoria.</p></div></div>
    <div class="tx-toolbar"><input id="productSearch" type="search" placeholder="Buscar nome ou SKU..." value="${esc(productSearch)}"></div>
    <div class="tx-item-grid">${visible.length?visible.map(p=>`<div class="tx-item"><div class="tx-item-head"><div><div class="tx-item-name">${esc(p.nome)}</div><div class="tx-meta">${p.sku?`SKU ${esc(p.sku)} · `:''}${esc(categoryPath(p.catalog_category_id))}</div></div></div><div class="tx-actions"><select data-move-product="${p.id}">${destinationOptions(p)}</select><button class="tx-btn secondary" data-save-move="${p.id}">Mover</button></div></div>`).join(''):'<div class="tx-empty">Nenhum item encontrado.</div>'}</div>
    <div class="tx-pager"><button class="tx-btn secondary" id="productPrev" ${productPage<=1?'disabled':''}>← Anterior</button><strong>${rows.length?((productPage-1)*PAGE_SIZE+1):0}–${Math.min(productPage*PAGE_SIZE,rows.length)} de ${rows.length}</strong><button class="tx-btn secondary" id="productNext" ${productPage>=pages?'disabled':''}>Próxima →</button></div><div id="productMoveStatus" class="tx-status"></div>`;
  $('productSearch').oninput=e=>{productSearch=e.target.value;productPage=1;renderInspector()};
  $('productPrev').onclick=()=>{if(productPage>1){productPage--;renderInspector()}};$('productNext').onclick=()=>{if(productPage<pages){productPage++;renderInspector()}};
  el.querySelectorAll('[data-save-move]').forEach(b=>b.onclick=()=>moveProduct(b.dataset.saveMove));
}

async function moveProduct(productId){
  const select=document.querySelector(`[data-move-product="${CSS.escape(productId)}"]`);if(!select)return;
  try{
    setStatus('productMoveStatus','Salvando...');
    const product=products.find(p=>p.id===productId),dest=select.value||null;
    if(dest){const c=category(dest);if(!c||c.catalog_scope!==product.product_type)throw new Error('Categoria incompatível com o tipo do item.');}
    const {error}=await supabase.from('products').update({catalog_category_id:dest}).eq('id',productId);if(error)throw error;
    await loadBase();setStatus('productMoveStatus','Item atualizado.','ok');
  }catch(e){setStatus('productMoveStatus',errorText(e,'Falha ao mover item.'),'bad')}
}

async function loadBling(){
  const root=$('blingList');if(!root)return;
  setStatus('blingStatus','Consultando Bling...');
  try{
    const {data,error}=await supabase.functions.invoke('bling-categories',{body:{action:'list'}});if(error)throw error;if(data?.error)throw new Error(errorText(data.error));
    blingCategories=data?.data||[];
    root.innerHTML=blingCategories.length?blingCategories.map(b=>`<div class="tx-bling-row"><div><strong>${esc(b.name||`#${b.external_id}`)}</strong><div class="tx-meta">Bling #${esc(b.external_id)}</div></div><div>${mappingForExternal(b.external_id)?`Vinculada a ${esc(categoryPath(mappingForExternal(b.external_id).local_id))}`:'Sem vínculo Croma'}</div></div>`).join(''):'<div class="tx-empty">Nenhuma categoria encontrada no Bling.</div>';
    setStatus('blingStatus',`${blingCategories.length} categoria(s) retornada(s).`,'ok');
  }catch(e){root.innerHTML='<div class="tx-empty">Falha ao consultar categorias.</div>';setStatus('blingStatus',errorText(e,'Falha ao consultar o Bling.'),'bad')}
}

function bindTabs(){
  document.querySelectorAll('.taxonomy-tab').forEach(b=>b.onclick=()=>{
    document.querySelectorAll('.taxonomy-tab').forEach(x=>x.classList.toggle('active',x===b));
    document.querySelectorAll('.taxonomy-panel').forEach(p=>p.classList.remove('active'));
    $(`panel-${b.dataset.panel}`)?.classList.add('active');
    if(b.dataset.panel==='bling')loadBling();
  });
}
function bindEvents(){
  $('newCategory').onclick=resetEditor;$('resetCategory').onclick=resetEditor;$('saveCategory').onclick=saveCategory;
  $('structureScope').onchange=e=>{currentScope=e.target.value;selectedCategory=null;editing=null;productPage=1;resetEditor();renderTree();renderInspector()};
  $('treeSearch').oninput=renderTree;
  $('editScope').onchange=e=>{currentScope=e.target.value;fillEditorOptions()};$('editFamily').onchange=fillEditorOptions;
  $('editName').oninput=()=>{if(!editing)$('editSlug').value=slugify($('editName').value)};
  $('refreshBling').onclick=loadBling;bindTabs();
}

async function init(){
  try{
    session=await protectInternalPage({roles:['owner','manager']});if(!session)return;
    $('roleInfo').textContent=session.profile.role==='owner'?'Proprietário':'Gerência';
    bindEvents();await loadBase();resetEditor();
  }catch(e){const el=$('pageError');if(el){el.hidden=false;el.textContent=errorText(e,'Falha ao carregar a Central de Taxonomia.')}console.error(e)}
}
init();
