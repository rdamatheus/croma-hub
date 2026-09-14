import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const URL=Deno.env.get('SUPABASE_URL')!;
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,KEY,{auth:{persistSession:false}});
const allowedOrigins=['https://www.cromapel.com.br','https://cromapel.com.br'];

function cors(req:Request){const o=req.headers.get('Origin')||'';return {'Access-Control-Allow-Origin':allowedOrigins.includes(o)?o:'https://www.cromapel.com.br','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'}}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}
function numberOrNull(v:unknown){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}

async function manager(req:Request){
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Response('Sessão ausente.',{status:401});
  const{data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw new Response('Sessão inválida.',{status:401});
  const{data:profile,error:pe}=await admin.from('profiles').select('role,ativo').eq('id',data.user.id).maybeSingle();
  if(pe||!profile?.ativo||!['owner','manager'].includes(profile.role))throw new Response('Acesso restrito à gestão.',{status:403});
  return data.user;
}

async function reconcileApprovedItem(item:any){
  const results:any[]=[];
  const{data:supplier}=await admin.from('suppliers').select('contact_id').eq('id',item.supplier_id).maybeSingle();
  if(!supplier?.contact_id)return results;
  const{data:contact}=await admin.from('customer_profiles').select('bling_contact_id').eq('id',supplier.contact_id).maybeSingle();
  const external=contact?.bling_contact_id==null?'':String(contact.bling_contact_id);
  if(!external)return results;
  const{data:snapshots}=await admin.from('product_supplier_external_snapshots').select('product_id,supplier_code,external_contact_id').eq('external_contact_id',external);
  const target=String(item.sku||'').trim().toUpperCase();
  const productIds=[...new Set((snapshots||[]).filter((s:any)=>String(s.supplier_code||'').trim().toUpperCase()===target).map((s:any)=>s.product_id).filter(Boolean))];
  for(const productId of productIds.slice(0,100)){
    const{data,error}=await admin.rpc('croma_reconcile_bling_supplier_catalog',{p_product_id:productId});
    results.push({product_id:productId,result:error?'error':data,detail:error?.message||null});
  }
  return results;
}

async function setStatus(userId:string,itemId:string,target:string,note:string,approvedInput:unknown){
  const{data:item,error}=await admin.from('supplier_catalog_items').select('id,supplier_id,sku,purchase_price,pending_purchase_price,validation_status,validation_reasons,active').eq('id',itemId).maybeSingle();
  if(error)throw error;if(!item)throw new Error('Item do catálogo não encontrado.');
  if(!['ok','review','reject'].includes(target))throw new Error('Status inválido.');
  if(target==='reject'&&!note.trim())throw new Error('Informe o motivo da rejeição.');
  const now=new Date().toISOString();
  const explicit=numberOrNull(approvedInput);
  const payload:any={validation_status:target,validation_reviewed_by:userId,validation_reviewed_at:now,validation_review_note:note.trim()||null,validation_source:'manual'};
  if(target==='ok'){
    const approved=explicit??numberOrNull(item.pending_purchase_price)??numberOrNull(item.purchase_price);
    if(approved==null||approved<=0)throw new Error('Informe um preço aprovado maior que zero antes de validar.');
    payload.purchase_price=approved;payload.pending_purchase_price=null;
  }else if(explicit!=null){
    if(explicit<0)throw new Error('Preço proposto inválido.');
    payload.pending_purchase_price=explicit;
  }
  const{data:updated,error:ue}=await admin.from('supplier_catalog_items').update(payload).eq('id',itemId).select('*').single();
  if(ue)throw ue;
  const reconciliations=target==='ok'?await reconcileApprovedItem(updated):[];
  return{item:updated,reconciliations};
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  try{
    if(req.method!=='POST')return json(req,{error:'Método não permitido.'},405);
    const user=await manager(req);const input=await req.json();const action=String(input.action||'set_status');
    if(action==='set_status'){
      const id=String(input.item_id||'');if(!id)return json(req,{error:'Item ausente.'},400);
      const result=await setStatus(user.id,id,String(input.status||''),String(input.note||''),input.approved_price);
      return json(req,{ok:true,...result});
    }
    if(action==='bulk_set_status'){
      const ids=Array.isArray(input.item_ids)?[...new Set(input.item_ids.map((x:unknown)=>String(x)).filter(Boolean))]:[];
      if(!ids.length)return json(req,{error:'Selecione ao menos um item.'},400);
      if(ids.length>200)return json(req,{error:'Selecione no máximo 200 itens por operação.'},400);
      const status=String(input.status||''),note=String(input.note||'');
      const results:any[]=[];
      for(let i=0;i<ids.length;i+=20){
        const chunk=ids.slice(i,i+20);
        const part=await Promise.all(chunk.map(async id=>{try{return{id,ok:true,...await setStatus(user.id,id,status,note,null)}}catch(e){return{id,ok:false,error:e instanceof Error?e.message:String(e)}}}));
        results.push(...part);
      }
      return json(req,{ok:results.every(x=>x.ok),processed:results.length,results},results.some(x=>!x.ok)?207:200);
    }
    return json(req,{error:'Ação inválida.'},400);
  }catch(e){
    if(e instanceof Response)return json(req,{error:await e.text()},e.status);
    console.error(e);return json(req,{error:e instanceof Error?e.message:'Não foi possível atualizar a validação.'},500);
  }
});
