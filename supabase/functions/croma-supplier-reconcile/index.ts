import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const URL=Deno.env.get('SUPABASE_URL')!;
const KEY=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin=createClient(URL,KEY,{auth:{persistSession:false}});

function cors(req:Request){
  const origin=req.headers.get('Origin')||'';
  const allowed=['https://www.cromapel.com.br','https://cromapel.com.br'];
  return {
    'Access-Control-Allow-Origin':allowed.includes(origin)?origin:'https://cromapel.com.br',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Content-Type':'application/json',
    'Vary':'Origin'
  };
}
function json(req:Request,data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:cors(req)})}
async function requireManager(req:Request){
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();
  if(!token)throw new Response('Sessão ausente.',{status:401});
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw new Response('Sessão inválida.',{status:401});
  const {data:profile}=await admin.from('profiles').select('role,ativo').eq('id',data.user.id).maybeSingle();
  if(!profile?.ativo||!['owner','manager'].includes(profile.role))throw new Response('Acesso restrito à gestão.',{status:403});
  return data.user;
}

Deno.serve(async(req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  try{
    if(req.method!=='POST')return json(req,{error:'Método não permitido.'},405);
    await requireManager(req);
    const input=await req.json().catch(()=>({}));
    const productId=String(input?.product_id||'').trim();
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId))return json(req,{error:'Produto inválido.'},400);
    const {data:product,error:pe}=await admin.from('products').select('id,nome').eq('id',productId).maybeSingle();
    if(pe)throw pe;
    if(!product)return json(req,{error:'Produto não encontrado.'},404);
    const {data:result,error}=await admin.rpc('croma_reconcile_bling_supplier_catalog',{p_product_id:productId});
    if(error)throw error;
    return json(req,{ok:true,result,product:{id:product.id,nome:product.nome}});
  }catch(e){
    if(e instanceof Response)return json(req,{error:await e.text()},e.status);
    console.error(e);
    return json(req,{error:'Não foi possível reprocessar o vínculo do fornecedor.',detail:e instanceof Error?e.message:String(e)},500);
  }
});
