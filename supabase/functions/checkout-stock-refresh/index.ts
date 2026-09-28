import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API="https://api.bling.com.br/Api/v3";
const db=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false}});
const origins=new Set(["https://www.cromapel.com.br","https://cromapel.com.br"]);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const numberOrNull=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const err=(e:any)=>e instanceof Error?e.message:String(e);

function cors(req:Request){const o=req.headers.get("Origin")||"";return{"Access-Control-Allow-Origin":origins.has(o)?o:"https://www.cromapel.com.br","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS",Vary:"Origin"}}
function json(req:Request,data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(req),"Content-Type":"application/json"}})}
async function secret(name:string){const{data,error}=await db.rpc("erp_read_secret",{p_name:name});if(error)throw error;return String(data||"")}
async function store(name:string,value:string,description:string){const{error}=await db.rpc("erp_store_secret",{p_name:name,p_value:value,p_description:description});if(error)throw error}
async function connection(){const{data,error}=await db.from("erp_connections").select("*").eq("provider","bling").single();if(error)throw error;return data}
function tokenName(kind:string,id:string){return`erp_bling_${kind}_token_${id.replaceAll("-","")}`}
async function accessToken(){
  const c=await connection();
  const{data:t,error}=await db.from("erp_private_tokens").select("*").eq("connection_id",c.id).single();
  if(error||!t)throw new Error("Bling não conectado.");
  if(new Date(t.expires_at).getTime()>Date.now()+90000){const a=await secret(t.access_token_secret_name);if(a)return a}
  const [clientId,clientSecret,refreshToken]=await Promise.all([secret("erp_bling_client_id"),secret("erp_bling_client_secret"),secret(t.refresh_token_secret_name)]);
  if(!clientId||!clientSecret||!refreshToken)throw new Error("Credenciais protegidas do Bling indisponíveis.");
  const response=await fetch(`${API}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${clientId}:${clientSecret}`)}`,"Content-Type":"application/x-www-form-urlencoded","enable-jwt":"1"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken})});
  const payload=await response.json();
  if(!response.ok)throw new Error(payload?.error_description||payload?.error?.description||"Falha ao renovar token do Bling.");
  const an=tokenName("access",c.id),rn=tokenName("refresh",c.id);
  await Promise.all([store(an,String(payload.access_token||""),"Access token OAuth do Bling"),store(rn,String(payload.refresh_token||""),"Refresh token OAuth do Bling")]);
  await db.from("erp_private_tokens").update({access_token_secret_name:an,refresh_token_secret_name:rn,expires_at:new Date(Date.now()+Number(payload.expires_in||3600)*1000).toISOString(),updated_at:new Date().toISOString()}).eq("connection_id",c.id);
  return String(payload.access_token||"");
}
async function getProduct(token:string,id:number){
  for(let attempt=0;attempt<4;attempt++){
    const response=await fetch(`${API}/produtos/${id}`,{headers:{Authorization:`Bearer ${token}`,Accept:"application/json","enable-jwt":"1"}});
    const payload=await response.json().catch(()=>({}));
    if(response.ok)return payload?.data||payload;
    if(response.status===429&&attempt<3){await sleep(1200*(attempt+1));continue}
    throw new Error(payload?.error?.description||payload?.message||`Bling respondeu ${response.status}.`);
  }
  throw new Error("Limite de requisições do Bling excedido.");
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});
  if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);
  try{
    const bearer=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!bearer)return json(req,{error:"Sessão ausente."},401);
    const{data:userData,error:userError}=await db.auth.getUser(bearer);
    if(userError||!userData.user)return json(req,{error:"Sessão inválida."},401);
    const uid=userData.user.id;
    const{data:cart,error:cartError}=await db.from("carts").select("id").eq("customer_id",uid).eq("status","active").maybeSingle();
    if(cartError)throw cartError;
    if(!cart)return json(req,{error:"Carrinho ativo não encontrado."},409);
    const{data:items,error:itemError}=await db.from("cart_items").select("product_id,quantity,product_name").eq("cart_id",cart.id);
    if(itemError)throw itemError;
    if(!items?.length)return json(req,{error:"Carrinho vazio."},409);
    const ids=[...new Set(items.map((x:any)=>x.product_id).filter(Boolean))];
    if(ids.length!==items.length&&items.some((x:any)=>!x.product_id))return json(req,{error:"Há item do carrinho sem vínculo com o catálogo."},409);
    const{data:products,error:productError}=await db.from("products").select("id,nome,product_type,bling_product_id").in("id",ids);
    if(productError)throw productError;
    const byId=new Map((products||[]).map((p:any)=>[p.id,p]));
    for(const item of items||[]){const p=byId.get(item.product_id);if(!p||p.product_type!=="produto")return json(req,{error:`${item.product_name}: somente produtos podem seguir para checkout.`},409);if(!p.bling_product_id)return json(req,{error:`${item.product_name}: produto sem vínculo com o Bling.`},409)}
    const token=await accessToken();
    const refreshed:any[]=[];
    for(const id of ids){
      const p:any=byId.get(id);
      const remote=await getProduct(token,Number(p.bling_product_id));
      const stock=remote?.estoque||{};
      const available=numberOrNull(stock?.saldoVirtualTotal);
      if(available===null)throw new Error(`O Bling não retornou saldo virtual para ${p.nome}.`);
      const now=new Date().toISOString();
      const{error}=await db.from("product_stock_snapshots").upsert({product_id:p.id,source:"bling",available_stock:available,virtual_stock:available,minimum_stock:numberOrNull(stock?.minimo),maximum_stock:numberOrNull(stock?.maximo),storage_location:String(stock?.localizacao||"")||null,crossdocking:numberOrNull(stock?.crossdocking),synced_at:now,metadata:stock,updated_at:now},{onConflict:"product_id,source"});
      if(error)throw error;
      refreshed.push({product_id:p.id,available_stock:available,synced_at:now});
      await sleep(320);
    }
    return json(req,{ok:true,items:refreshed});
  }catch(e){console.error("checkout_stock_refresh_error",e);return json(req,{error:"Não foi possível confirmar o estoque no Bling.",detail:err(e)},500)}
});
