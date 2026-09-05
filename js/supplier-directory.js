import { supabase } from './croma-supabase.js';

async function invoke(body){
  const {data,error}=await supabase.functions.invoke('croma-suppliers',{body});
  if(error){let m=error.message;try{const j=await error.context?.json?.();m=j?.detail||j?.error||j?.message||m}catch{}throw new Error(m||'Falha na operação de fornecedor.')}if(data?.error)throw new Error(data.detail||data.error);return data;
}

export async function listSupplierDirectory(){
  const {data:roles,error:re}=await supabase.from('contact_roles').select('contact_id,role_code').in('role_code',['Fornecedor','Fornecedor verificado']);if(re)throw re;
  const ids=[...new Set((roles||[]).map(r=>r.contact_id))];if(!ids.length)return[];
  const [{data:contacts,error:ce},{data:ext,error:se}]=await Promise.all([
    supabase.from('customer_profiles').select('id,nome,nome_fantasia,cpf,email,telefone,celular,bling_contact_id,ativo').in('id',ids).eq('ativo',true).order('nome'),
    supabase.from('suppliers').select('id,contact_id,name,active,default_order_freight').eq('active',true)
  ]);if(ce||se)throw(ce||se);
  const byContact=new Map((ext||[]).filter(x=>x.contact_id).map(x=>[x.contact_id,x]));
  return (contacts||[]).map(c=>{const s=byContact.get(c.id)||null;return{contactId:c.id,supplierId:s?.id||null,name:c.nome_fantasia||c.nome,legalName:c.nome,document:c.cpf||null,email:c.email||null,phone:c.telefone||c.celular||null,blingContactId:c.bling_contact_id||null,defaultOrderFreight:s?.default_order_freight??0};}).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}

export async function ensureSupplierExtension(contactId){return (await invoke({action:'ensure_supplier',contact_id:contactId})).supplier}
export async function createSupplier(input){return await invoke({action:'create_supplier',...input})}
export async function linkCatalogItem(productId,catalogItemId,makePreferred=false){return await invoke({action:'link_catalog_item',product_id:productId,catalog_item_id:catalogItemId,make_preferred:makePreferred})}
export async function linkSupplier(productId,contactId){return await invoke({action:'link_supplier',product_id:productId,contact_id:contactId})}
export async function setPreferredSupplier(linkId){return await invoke({action:'set_preferred',link_id:linkId})}
export async function deactivateSupplierLink(linkId){return await invoke({action:'deactivate_link',link_id:linkId})}
