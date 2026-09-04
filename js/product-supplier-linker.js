export async function buildSupplierSection(supabase,{productId=null,esc=(v)=>String(v??''),brl=(v)=>String(v??'') }={}){
  const {data:suppliers,error:supplierError}=await supabase.from('suppliers').select('id,name,default_order_freight,active').eq('active',true).order('name');
  if(supplierError) throw supplierError;

  let link=null;
  if(productId){
    const {data,error}=await supabase
      .from('product_suppliers')
      .select('id,supplier_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,lead_time_days,minimum_order_quantity,supplier_catalog_item_id,suppliers(name,default_order_freight),supplier_catalog_items(id,sku,name,description,category,purchase_price,lead_time_days,minimum_order_quantity,attributes)')
      .eq('product_id',productId)
      .is('variant_id',null)
      .eq('active',true)
      .order('preferred',{ascending:false})
      .limit(1)
      .maybeSingle();
    if(error) throw error;
    link=data||null;
  }

  const selectedSupplier=link?.supplier_id||'';
  const selectedItem=link?.supplier_catalog_items||null;
  const supplierOptions=['<option value="">Sem fornecedor vinculado</option>',...(suppliers||[]).map(s=>`<option value="${esc(s.id)}" ${String(s.id)===String(selectedSupplier)?'selected':''}>${esc(s.name)}</option>`)].join('');
  const preview=selectedItem?catalogPreview(selectedItem,link,esc,brl):'<span class="muted">Nenhum código de fornecedor selecionado.</span>';

  return `
    <div class="wide"><strong>Fornecedor</strong><p class="muted" style="margin:.35rem 0 0">Escolha o fornecedor e pesquise pelo código ou descrição do catálogo.</p></div>
    <div class="field"><label>Fornecedor</label><select name="supplier_id" id="supplierLinkSupplier">${supplierOptions}</select></div>
    <div class="field"><label>Código / produto do fornecedor</label><input type="search" id="supplierCatalogSearch" placeholder="Digite código ou descrição" autocomplete="off" value="${esc(selectedItem?.sku||link?.supplier_sku||'')}"></div>
    <input type="hidden" name="supplier_catalog_item_id" id="supplierCatalogItemId" value="${esc(selectedItem?.id||link?.supplier_catalog_item_id||'')}">
    <div class="wide" id="supplierCatalogResults"></div>
    <div class="wide" id="supplierCatalogPreview" style="padding:12px;border:1px solid #e5e7eb;border-radius:10px">${preview}</div>`;
}

function catalogPreview(item,link,esc,brl){
  const attrs=item?.attributes||{};
  const bits=[
    item?.category,
    attrs?.size?`Tamanho: ${attrs.size}`:null,
    attrs?.colors?`Cores: ${attrs.colors}`:null,
    attrs?.quantity?`Quantidade: ${attrs.quantity}`:null,
    item?.lead_time_days!=null?`Prazo: ${item.lead_time_days} dia(s)`:null
  ].filter(Boolean);
  const purchase=item?.purchase_price??link?.purchase_price;
  const freight=link?.freight_cost;
  const effective=link?.effective_unit_cost;
  return `<div><strong>${esc(item?.sku||'')}</strong> — ${esc(item?.name||item?.description||'')}</div>
    ${bits.length?`<div class="muted" style="margin-top:4px">${bits.map(esc).join(' · ')}</div>`:''}
    <div style="margin-top:6px">Custo: <strong>${purchase==null?'—':brl(purchase)}</strong>${freight!=null?` · Frete padrão: ${brl(freight)}`:''}${effective!=null?` · Custo efetivo: ${brl(effective)}`:''}</div>`;
}

export function wireSupplierSection(supabase,{esc=(v)=>String(v??''),brl=(v)=>String(v??'')}={}){
  const supplier=document.querySelector('#supplierLinkSupplier');
  const search=document.querySelector('#supplierCatalogSearch');
  const results=document.querySelector('#supplierCatalogResults');
  const itemId=document.querySelector('#supplierCatalogItemId');
  const preview=document.querySelector('#supplierCatalogPreview');
  if(!supplier||!search||!results||!itemId||!preview)return;

  let timer=null;
  const clearSelection=()=>{itemId.value='';preview.innerHTML='<span class="muted">Nenhum código de fornecedor selecionado.</span>';};
  supplier.addEventListener('change',()=>{search.value='';results.innerHTML='';clearSelection();});
  search.addEventListener('input',()=>{
    clearTimeout(timer);
    clearSelection();
    const q=search.value.trim();
    if(!supplier.value||q.length<1){results.innerHTML='';return;}
    timer=setTimeout(()=>runSearch(q),220);
  });

  async function runSearch(q){
    results.innerHTML='<span class="muted">Buscando…</span>';
    const safe=q.replace(/[,%()]/g,' ').trim();
    const {data,error}=await supabase.from('supplier_catalog_items')
      .select('id,sku,name,description,category,purchase_price,lead_time_days,minimum_order_quantity,attributes')
      .eq('supplier_id',supplier.value)
      .eq('active',true)
      .or(`sku.ilike.%${safe}%,name.ilike.%${safe}%,description.ilike.%${safe}%`)
      .order('sku')
      .limit(30);
    if(error){results.innerHTML=`<span class="muted">${esc(error.message)}</span>`;return;}
    if(!data?.length){results.innerHTML='<span class="muted">Nenhum código encontrado.</span>';return;}
    results.innerHTML=`<div style="display:grid;gap:6px;margin-top:8px">${data.map(item=>`<button type="button" class="btn light" data-supplier-catalog-item="${esc(item.id)}" style="text-align:left;justify-content:flex-start"><strong>${esc(item.sku)}</strong>&nbsp; ${esc(item.name||item.description||'')} ${item.purchase_price!=null?`— ${brl(item.purchase_price)}`:''}</button>`).join('')}</div>`;
    results.querySelectorAll('[data-supplier-catalog-item]').forEach(btn=>btn.addEventListener('click',()=>{
      const item=data.find(x=>x.id===btn.dataset.supplierCatalogItem);if(!item)return;
      itemId.value=item.id;search.value=item.sku;results.innerHTML='';
      preview.innerHTML=catalogPreview(item,null,esc,brl);
      const cost=document.querySelector('input[name="cost"]');if(cost&&item.purchase_price!=null)cost.value=item.purchase_price;
      const ref=document.querySelector('input[name="supplier_reference"]');if(ref)ref.value=item.sku;
    }));
  }
}

export async function persistSupplierSelection(supabase,productId,formData){
  const catalogItemId=String(formData?.supplier_catalog_item_id||'').trim();
  if(!catalogItemId)return null;
  const {data,error}=await supabase.rpc('link_product_to_supplier_catalog',{p_product_id:productId,p_catalog_item_id:catalogItemId});
  if(error)throw error;
  return data;
}
