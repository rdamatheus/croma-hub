import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let mountedFor=null, selectedCatalogItem=null, searchTimer=null;

function currentKey(){return new URLSearchParams(location.search).get('produto')||''}
async function resolveProduct(){
  const key=currentKey();if(!key)return null;
  let q=supabase.from('products').select('id,slug,sku,nome,ativo,published_on_site').limit(1);
  if(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(key))q=q.eq('id',key);else q=q.or(`slug.eq.${key},sku.eq.${key}`);
  const {data,error}=await q.maybeSingle();if(error){console.error(error);return null}return data||null;
}

function supplierCard(){return [...document.querySelectorAll('#cadastro .card')].find(c=>c.querySelector('h2')?.textContent.trim()==='Fornecedor')||null}
function ensureStyles(){
  if(document.querySelector('#supplierEnhancerStyles'))return;
  const s=document.createElement('style');s.id='supplierEnhancerStyles';s.textContent=`
    .supplier-catalog-box{grid-column:1/-1;border-top:1px solid #ece9f3;margin-top:4px;padding-top:14px}.supplier-search-row{display:grid;grid-template-columns:minmax(220px,1fr) auto;gap:8px;align-items:end}.supplier-results{display:grid;gap:6px;margin-top:8px;max-height:320px;overflow:auto}.supplier-result{border:1px solid #e1ddec;background:#fff;border-radius:10px;padding:10px;text-align:left;cursor:pointer}.supplier-result:hover{border-color:#8f89c2}.supplier-preview{margin-top:10px;padding:11px 12px;border-radius:10px;background:#f8f7fb;border:1px solid #e8e5f0}.site-publish-box{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.site-state{font-size:.8rem;font-weight:900}.site-state.on{color:#426920}.site-state.off{color:#777}@media(max-width:650px){.supplier-search-row{grid-template-columns:1fr}}
  `;document.head.appendChild(s);
}

async function mount(){
  const p=await resolveProduct();if(!p)return;
  if(mountedFor===p.id&&document.querySelector('#supplierCatalogEnhancer')){await refreshPublication(p);return}
  mountedFor=p.id;selectedCatalogItem=null;ensureStyles();
  mountPublication(p);await mountSupplier(p);
}

function mountPublication(p){
  const actions=document.querySelector('.editor-actions');if(!actions)return;
  document.querySelector('#sitePublishEnhancer')?.remove();
  const box=document.createElement('div');box.id='sitePublishEnhancer';box.className='site-publish-box';box.innerHTML=`<span class="site-state ${p.published_on_site?'on':'off'}" id="sitePublishState">${p.published_on_site?'Publicado no site':'Fora do site'}</span><button class="btn light" id="sitePublishToggle" type="button">${p.published_on_site?'Retirar do site':'Publicar no site'}</button>`;
  actions.prepend(box);box.querySelector('#sitePublishToggle').onclick=()=>togglePublication(p);
}
async function refreshPublication(p){
  const {data}=await supabase.from('products').select('id,ativo,published_on_site').eq('id',p.id).single();if(!data)return;
  const st=document.querySelector('#sitePublishState'),bt=document.querySelector('#sitePublishToggle');if(!st||!bt)return;
  st.textContent=data.published_on_site?'Publicado no site':'Fora do site';st.className=`site-state ${data.published_on_site?'on':'off'}`;bt.textContent=data.published_on_site?'Retirar do site':'Publicar no site';
}
async function togglePublication(p){
  const bt=document.querySelector('#sitePublishToggle');if(!bt)return;bt.disabled=true;
  try{
    const {data:row,error:rerr}=await supabase.from('products').select('ativo,published_on_site').eq('id',p.id).single();if(rerr)throw rerr;
    if(!row.ativo&&!row.published_on_site)throw new Error('Ative o produto no cadastro antes de publicá-lo no site.');
    const next=!row.published_on_site;const {error}=await supabase.from('products').update({published_on_site:next,updated_at:new Date().toISOString()}).eq('id',p.id);if(error)throw error;
    p.published_on_site=next;await refreshPublication(p);
  }catch(e){alert(e.message||'Não foi possível alterar a publicação.')}finally{bt.disabled=false}
}

async function mountSupplier(p){
  const card=supplierCard();const grid=card?.querySelector('.grid');if(!grid)return;
  document.querySelector('#supplierCatalogEnhancer')?.remove();
  const box=document.createElement('div');box.id='supplierCatalogEnhancer';box.className='supplier-catalog-box';box.innerHTML=`
    <strong>Catálogo do fornecedor</strong><p class="section-note" style="margin:4px 0 10px">Escolha o fornecedor acima e busque pelo código/SKU ou descrição. O vínculo é manual e definitivo até você escolher outro código.</p>
    <div class="supplier-search-row"><div class="field"><label>Código ou descrição</label><input id="supplierCatalogSearch" placeholder="Ex.: ADCASOV05 ou adesivo casca de ovo" autocomplete="off"></div><button class="btn" id="supplierCatalogLink" type="button" disabled>Vincular código</button></div>
    <div class="supplier-results" id="supplierCatalogResults"></div><div class="supplier-preview" id="supplierCatalogPreview"><span class="muted">Nenhum item selecionado.</span></div>`;
  grid.appendChild(box);
  const search=box.querySelector('#supplierCatalogSearch');search.addEventListener('input',()=>{clearTimeout(searchTimer);selectedCatalogItem=null;box.querySelector('#supplierCatalogLink').disabled=true;const q=search.value.trim();if(q.length<1){box.querySelector('#supplierCatalogResults').innerHTML='';return}searchTimer=setTimeout(()=>searchCatalog(q),220)});
  box.querySelector('#supplierCatalogLink').onclick=()=>linkSelected(p);
  document.querySelector('#supplierId')?.addEventListener('change',()=>{selectedCatalogItem=null;search.value='';box.querySelector('#supplierCatalogResults').innerHTML='';box.querySelector('#supplierCatalogPreview').innerHTML='<span class="muted">Nenhum item selecionado.</span>';box.querySelector('#supplierCatalogLink').disabled=true});
  await showCurrentLink(p);
}

async function showCurrentLink(p){
  const preview=document.querySelector('#supplierCatalogPreview');if(!preview)return;
  const {data,error}=await supabase.from('product_suppliers').select('supplier_sku,purchase_price,freight_cost,effective_unit_cost,lead_time_days,supplier_catalog_item_id,suppliers(name),supplier_catalog_items(id,sku,name,description,category,purchase_price,lead_time_days,minimum_order_quantity,attributes)').eq('product_id',p.id).is('variant_id',null).eq('preferred',true).eq('active',true).limit(1).maybeSingle();
  if(error){console.error(error);return}if(!data?.supplier_catalog_item_id)return;
  preview.innerHTML='<div class="muted" style="margin-bottom:4px">Vínculo atual</div>'+previewHtml(data.supplier_catalog_items,data);
}

async function searchCatalog(q){
  const supplierId=document.querySelector('#supplierId')?.value;const results=document.querySelector('#supplierCatalogResults');if(!results)return;
  if(!supplierId){results.innerHTML='<span class="muted">Selecione primeiro um fornecedor.</span>';return}
  results.innerHTML='<span class="muted">Buscando…</span>';const safe=q.replace(/[,%()]/g,' ').trim();
  const {data,error}=await supabase.from('supplier_catalog_items').select('id,sku,name,description,category,purchase_price,lead_time_days,minimum_order_quantity,attributes').eq('supplier_id',supplierId).eq('active',true).or(`sku.ilike.%${safe}%,name.ilike.%${safe}%,description.ilike.%${safe}%`).order('sku').limit(30);
  if(error){results.innerHTML=`<span class="muted">${esc(error.message)}</span>`;return}
  if(!data?.length){results.innerHTML='<span class="muted">Nenhum código encontrado neste fornecedor.</span>';return}
  results.innerHTML=data.map(x=>`<button type="button" class="supplier-result" data-catalog-id="${esc(x.id)}"><strong>${esc(x.sku)}</strong> — ${esc(x.name||x.description||'')}<div class="muted">${esc(x.category||'Sem categoria')} · ${x.purchase_price==null?'Sem preço':brl(x.purchase_price)}</div></button>`).join('');
  results.querySelectorAll('[data-catalog-id]').forEach(b=>b.onclick=()=>{selectedCatalogItem=data.find(x=>x.id===b.dataset.catalogId)||null;if(!selectedCatalogItem)return;document.querySelector('#supplierCatalogSearch').value=selectedCatalogItem.sku;results.innerHTML='';document.querySelector('#supplierCatalogPreview').innerHTML=previewHtml(selectedCatalogItem,null);document.querySelector('#supplierCatalogLink').disabled=false});
}

function previewHtml(item,link){const a=item?.attributes||{};const bits=[item?.category,a.size&&`Tamanho: ${a.size}`,a.colors&&`Cores: ${a.colors}`,a.quantity&&`Quantidade: ${a.quantity}`,item?.lead_time_days!=null&&`Prazo: ${item.lead_time_days} dia(s)`].filter(Boolean);return `<div><strong>${esc(item?.sku||link?.supplier_sku||'')}</strong> — ${esc(item?.name||item?.description||'')}</div>${bits.length?`<div class="muted" style="margin-top:4px">${bits.map(esc).join(' · ')}</div>`:''}<div style="margin-top:6px">Custo: <strong>${item?.purchase_price==null?'—':brl(item.purchase_price)}</strong>${link?.freight_cost!=null?` · Frete padrão: ${brl(link.freight_cost)}`:''}${link?.effective_unit_cost!=null?` · Custo efetivo: ${brl(link.effective_unit_cost)}`:''}</div>`}

async function linkSelected(p){
  if(!selectedCatalogItem)return;const btn=document.querySelector('#supplierCatalogLink');btn.disabled=true;btn.textContent='Vinculando…';
  try{
    const {data,error}=await supabase.rpc('link_product_to_supplier_catalog',{p_product_id:p.id,p_catalog_item_id:selectedCatalogItem.id});if(error)throw error;
    const link=Array.isArray(data)?data[0]:data;
    const set=(id,v)=>{const el=document.querySelector('#'+id);if(el)el.value=v??''};set('supplierSku',selectedCatalogItem.sku);set('supplierDescription',selectedCatalogItem.description||selectedCatalogItem.name||'');set('purchasePrice',selectedCatalogItem.purchase_price??0);set('freightCost',link?.freight_cost??0);
    document.querySelector('#supplierCatalogPreview').innerHTML='<div class="muted" style="margin-bottom:4px">Vínculo salvo</div>'+previewHtml(selectedCatalogItem,link);
    btn.textContent='Vinculado';selectedCatalogItem=null;
    setTimeout(()=>{btn.textContent='Vincular código';btn.disabled=true},1200);
  }catch(e){console.error(e);alert(e.message||'Não foi possível vincular o código.');btn.textContent='Vincular código';btn.disabled=false}
}

const observer=new MutationObserver(()=>{if(document.querySelector('#editor.open'))mount()});observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
window.addEventListener('popstate',mount);setTimeout(mount,400);
