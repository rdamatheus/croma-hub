import { supabase } from './croma-supabase.js';
import { listSupplierDirectory, ensureSupplierExtension } from './supplier-directory.js';

const now=()=>new Date().toISOString();
const text=(el,tag)=>el.querySelector(`:scope > ${tag}`)?.textContent?.trim()||'';
const num=v=>{if(v===''||v==null)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:null};
const integer=v=>{const n=num(v);return n==null?null:Math.trunc(n)};
const mapPricing=v=>v==='linear_meter'?'linear_m':(v||'unknown');
const mapQty=(v,version)=>version==='2.0'&&v==='tier'?'range':(v||'unknown');

function parsePending(raw){
  const doc=new DOMParser().parseFromString(raw,'application/xml');if(doc.querySelector('parsererror'))throw new Error('XML inválido.');
  const root=doc.documentElement,version=root?.getAttribute('version')||'';if(root?.tagName!=='supplierCatalog'||!['1.0','2.0','2.1'].includes(version))throw new Error('Versão do catálogo não suportada.');
  const catalogDate=text(root,'catalogDate')||null,out=[];
  for(const item of doc.querySelectorAll('supplierCatalog > items > item')){
    let status=version==='1.0'?'ok':(text(item,'validationStatus')||'ok');if(!['ok','review','reject'].includes(status))status='review';if(status==='ok')continue;
    const sku=text(item,'sku'),price=num(text(item,'purchasePrice'));if(!sku||price==null)continue;
    const attrs={};item.querySelectorAll(':scope > attributes > attribute').forEach(a=>{const k=a.getAttribute('name')?.trim();if(k)attrs[k]=a.textContent?.trim()||''});if(version!=='1.0'&&text(item,'printMode'))attrs.printMode=text(item,'printMode');if(version!=='1.0'&&text(item,'sourceSize'))attrs.sourceSize=text(item,'sourceSize');
    const measurement=version==='1.0'?'unknown':(text(item,'measurementType')||'unknown'),pricing=version==='1.0'?'unknown':mapPricing(text(item,'pricingUnit')),quantity=version==='1.0'?'unknown':mapQty(text(item,'quantityType'),version),priceBasis=version==='2.1'?(text(item,'priceBasis')||'unit'):(pricing==='lot'?'lot':'unit'),baseQty=num(text(item,'baseQuantity'))??num(text(item,'minimumOrderQuantity'));
    let minQ=version==='2.1'?integer(text(item,'minQuantity')):null,maxQ=version==='2.1'?integer(text(item,'maxQuantity')):null;if(quantity==='exact'&&minQ!=null&&maxQ==null)maxQ=minQ;
    const note=version==='1.0'?null:(text(item,'validationNotes')||null),reasons=[];if(note)reasons.push({code:'source_validation_note',label:'Observação da conversão',detail:note});
    out.push({sku,name:text(item,'name')||null,description:text(item,'description')||text(item,'name')||null,category:text(item,'category')||null,purchase_price:price,pending_purchase_price:price,minimum_order_quantity:num(text(item,'minimumOrderQuantity'))??baseQty,lead_time_days:integer(text(item,'leadTimeDays')),weight:num(text(item,'weight')),unit:text(item,'unit')||null,width:num(text(item,'width')),height:num(text(item,'height')),depth:num(text(item,'depth')),attributes:attrs,active:true,standard_version:version,catalog_date:catalogDate,original_price_text:version==='1.0'?null:(text(item,'sourcePrice')||null),validation_status:status,validation_notes:note,validation_reasons:reasons,validation_source:'import',measurement_type:measurement,pricing_unit:pricing,quantity_type:quantity,price_basis:priceBasis,base_quantity:baseQty,min_quantity:minQ,max_quantity:maxQ,parent_key:version==='1.0'?null:(text(item,'parentKey')||null),dimension_unit:version==='1.0'?null:(text(item,'dimensionUnit')||null),min_width:version==='2.1'?num(text(item,'minWidth')):null,max_width:version==='2.1'?num(text(item,'maxWidth')):null,min_height:version==='2.1'?num(text(item,'minHeight')):null,max_height:version==='2.1'?num(text(item,'maxHeight')):null,min_area:version==='2.1'?num(text(item,'minArea')):null,max_area:version==='2.1'?num(text(item,'maxArea')):null,last_synced_at:now()});
  }
  return out;
}

async function supplierIdForContact(contactId){const directory=await listSupplierDirectory(),known=directory.find(x=>x.contactId===contactId);if(known?.supplierId)return known.supplierId;const s=await ensureSupplierExtension(contactId);return s.id}
async function latestImportId(supplierId,fileName){const{data}=await supabase.from('supplier_catalog_imports').select('id').eq('supplier_id',supplierId).eq('original_file_name',fileName).order('imported_at',{ascending:false}).limit(1).maybeSingle();return data?.id||null}

async function persistPending(supplierId,rows,sourceImportId){
  for(const r of rows){
    const{data:existing,error:ee}=await supabase.from('supplier_catalog_items').select('id,purchase_price').eq('supplier_id',supplierId).eq('sku',r.sku).maybeSingle();if(ee)throw ee;
    const payload={...r,supplier_id:supplierId,source_import_id:sourceImportId};
    if(existing?.id){const{error}=await supabase.from('supplier_catalog_items').update(payload).eq('id',existing.id);if(error)throw error}
    else{const{error}=await supabase.from('supplier_catalog_items').insert({...payload,purchase_price:r.purchase_price});if(error)throw error}
  }
}

function patch(){
  const dialog=document.querySelector('#supplierCatalogDialog'),button=dialog?.querySelector('#scImport');if(!dialog||!button||button.dataset.validationBridge)return;
  button.dataset.validationBridge='1';const original=button.onclick;
  button.onclick=async event=>{
    const contact=dialog.querySelector('#scSupplier')?.value,file=dialog.querySelector('#scFile')?.files?.[0];let pending=[],supplierId='';
    try{if(contact&&file){pending=parsePending(await file.text());if(pending.length)supplierId=await supplierIdForContact(contact)}}catch(e){console.error('validation bridge parse',e)}
    if(typeof original==='function')await original.call(button,event);
    if(!pending.length||!supplierId)return;
    try{
      const importId=await latestImportId(supplierId,file.name);await persistPending(supplierId,pending,importId);
      const status=dialog.querySelector('#scStatus');if(status){const previous=status.textContent||'';status.textContent=`${previous} ${pending.length.toLocaleString('pt-BR')} pendência(s) registrada(s) na fila de validação.`.trim();status.className='status ok'}
    }catch(e){console.error('validation bridge persist',e);const status=dialog.querySelector('#scStatus');if(status){status.textContent=`${status.textContent||''} Falha ao registrar pendências: ${e.message||e}`;status.className='status bad'}}
  };
}

patch();new MutationObserver(patch).observe(document.documentElement,{childList:true,subtree:true});
