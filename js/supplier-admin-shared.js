import { supabase } from './croma-supabase.js';

export { supabase };
export const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export const brl=v=>v==null||v===''?'—':Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export const fmtDate=v=>v?new Date(v).toLocaleDateString('pt-BR'):'—';
export const fmtDateTime=v=>v?new Date(v).toLocaleString('pt-BR'):'—';
export const short=s=>String(s||'').trim();
export const chunks=(arr,size=180)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));

export async function fetchAll(table,columns,configure=(q=>q),pageSize=1000){
  const out=[];
  for(let from=0;;from+=pageSize){
    let q=supabase.from(table).select(columns);
    q=configure(q);
    const {data,error}=await q.range(from,from+pageSize-1);
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  return out;
}

export async function loadSupplierDirectoryAll(){
  const {data:roles,error:re}=await supabase.from('contact_roles').select('contact_id,role_code').in('role_code',['Fornecedor','Fornecedor verificado']);
  if(re)throw re;
  const ids=[...new Set((roles||[]).map(r=>r.contact_id))];
  if(!ids.length)return[];
  const [{data:contacts,error:ce},{data:suppliers,error:se}]=await Promise.all([
    supabase.from('customer_profiles').select('id,nome,nome_fantasia,cpf,email,telefone,celular,bling_contact_id,ativo,updated_at').in('id',ids),
    supabase.from('suppliers').select('id,contact_id,name,active,default_order_freight,created_at,updated_at')
  ]);
  if(ce||se)throw(ce||se);
  const byContact=new Map((suppliers||[]).filter(x=>x.contact_id).map(x=>[x.contact_id,x]));
  return (contacts||[]).map(c=>{
    const s=byContact.get(c.id)||null;
    return {
      contactId:c.id,supplierId:s?.id||null,name:c.nome_fantasia||c.nome,legalName:c.nome,
      document:c.cpf||null,email:c.email||null,phone:c.telefone||c.celular||null,
      blingContactId:c.bling_contact_id||null,contactActive:c.ativo!==false,
      supplierActive:s?.active!==false,defaultOrderFreight:Number(s?.default_order_freight||0),
      updatedAt:s?.updated_at||c.updated_at||null
    };
  }).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

async function fetchByIds(table,columns,column,ids){
  const out=[];
  const unique=[...new Set(ids.filter(Boolean))];
  for(const group of chunks(unique,150)){
    if(!group.length)continue;
    const {data,error}=await supabase.from(table).select(columns).in(column,group);
    if(error)throw error;
    out.push(...(data||[]));
  }
  return out;
}

export async function loadSupplierLinkContext(supplierId=null){
  const links=await fetchAll('product_suppliers','id,product_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,preferred,active,created_at,updated_at,last_quote_at,supplier_product_description',q=>{
    let x=q.eq('active',true).is('variant_id',null);
    if(supplierId)x=x.eq('supplier_id',supplierId);
    return x;
  });
  const catalog=await fetchByIds('supplier_catalog_items','id,supplier_id,sku,name,purchase_price,updated_at','id',links.map(x=>x.supplier_catalog_item_id));
  const snapshots=await fetchByIds('product_supplier_external_snapshots','product_id,supplier_name,supplier_code,purchase_price,cost_price,synced_at,external_contact_id','product_id',links.map(x=>x.product_id));
  const products=await fetchByIds('products','id,sku,nome,product_type,published_on_site,bling_product_id,bling_last_synced_at','id',links.map(x=>x.product_id));
  const catalogById=new Map(catalog.map(x=>[x.id,x]));
  const snapshotByProduct=new Map(snapshots.map(x=>[x.product_id,x]));
  const productById=new Map(products.map(x=>[x.id,x]));
  const enriched=links.map(link=>{
    const item=catalogById.get(link.supplier_catalog_item_id)||null;
    const snapshot=snapshotByProduct.get(link.product_id)||null;
    const product=productById.get(link.product_id)||null;
    const a=snapshot?.purchase_price==null?null:Number(snapshot.purchase_price);
    const b=item?.purchase_price==null?null:Number(item.purchase_price);
    const priceDivergence=a!=null&&b!=null&&Math.abs(a-b)>0.01;
    const codeDivergence=!!(snapshot?.supplier_code&&item?.sku&&String(snapshot.supplier_code).trim().toUpperCase()!==String(item.sku).trim().toUpperCase());
    return {...link,catalogItem:item,snapshot,product,divergent:priceDivergence||codeDivergence,priceDivergence,codeDivergence};
  });
  return {links:enriched,catalogById,snapshotByProduct,productById};
}

export function importAgeBucket(value){
  if(!value)return'never';
  const age=Date.now()-new Date(value).getTime();
  const day=86400000;
  if(age<=day)return'today';
  if(age<=7*day)return'7d';
  if(age<=30*day)return'30d';
  return'old';
}

export function sanitizeSearch(v){return String(v||'').trim().replace(/[,%()'\"*]/g,' ').replace(/\s+/g,' ')}

export async function waitFor(selector,timeout=5000){
  const start=Date.now();
  while(Date.now()-start<timeout){
    const el=document.querySelector(selector);
    if(el)return el;
    await new Promise(r=>setTimeout(r,80));
  }
  return null;
}

export function downloadText(filename,text,type='text/plain;charset=utf-8'){
  const blob=new Blob([text],{type});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
