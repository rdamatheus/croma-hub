import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const allowedOrigins = new Set(["https://www.cromapel.com.br", "https://cromapel.com.br"]);

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://www.cromapel.com.br",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}
function authToken(req: Request) {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
async function requireOwner(req: Request) {
  const token = authToken(req);
  if (!token) throw new Response("Sessão ausente.", { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Response("Sessão inválida.", { status: 401 });
  const { data: profile, error: profileError } = await admin.from("profiles").select("id,role,ativo").eq("id", data.user.id).maybeSingle();
  if (profileError || !profile?.ativo || profile.role !== "owner") throw new Response("Acesso exclusivo do proprietário.", { status: 403 });
  return data.user;
}
async function blingGateway(req: Request, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/bling-erp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken(req)}`, ...(ANON_KEY ? { apikey: ANON_KEY } : {}), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await response.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { error: raw || "Resposta inválida." }; }
  if (!response.ok || payload?.error) {
    const message = payload?.detail || payload?.message || payload?.error || `Integração Bling respondeu ${response.status}.`;
    const error: any = new Error(typeof message === "string" ? message : "Falha na integração com o Bling.");
    error.status = response.status; error.payload = payload; throw error;
  }
  return payload;
}
function digits(value: unknown) { return String(value ?? "").replace(/\D/g, ""); }
function normalizeType(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (["servico", "service"].includes(raw)) return "service";
  if (["produto", "product"].includes(raw)) return "product";
  return "unknown";
}
function money(value: unknown) { const n = Number(value || 0); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function buildDescription(order: any) {
  const prefix = `Pedido Bling #${order?.numero || order?.id || ""} — `;
  const parts = (Array.isArray(order?.itens) ? order.itens : []).map((item: any) => {
    const qty = Number(item?.quantidade || 0);
    const desc = String(item?.descricao || item?.descricaoDetalhada || `Item ${item?.produto?.id || ""}`).trim();
    return `${qty > 0 ? `${qty}x ` : ""}${desc}`;
  });
  return (prefix + parts.join("; ")).slice(0, 1600);
}
async function loadFiscalProfiles() {
  const { data, error } = await admin.from("fiscal_service_profiles")
    .select("id,code,nome,descricao,codigo_tributacao_nacional,codigo_tributacao_municipal,nbs,indicador_operacao,natureza_operacao,aliquota_iss,reter_iss,descontar_iss,calcular_iss,ativo,padrao,metadata")
    .eq("ativo", true).order("padrao", { ascending: false }).order("nome");
  if (error) throw error; return data || [];
}
async function analyzeOrder(order: any) {
  const items = Array.isArray(order?.itens) ? order.itens : [];
  const blingIds = [...new Set(items.map((i: any) => Number(i?.produto?.id || 0)).filter((id: number) => id > 0))];
  const profiles = await loadFiscalProfiles();
  const profileById = new Map<string, any>(profiles.map((p: any) => [String(p.id), p] as [string, any]));
  const exactProducts = blingIds.length
    ? await admin.from("products").select("id,nome,sku,product_type,bling_product_id,bling_parent_id,ativo").in("bling_product_id", blingIds)
    : { data: [], error: null } as any;
  if (exactProducts.error) throw exactProducts.error;
  const exactByBling = new Map((exactProducts.data || []).map((p: any) => [Number(p.bling_product_id), p]));
  const parentBlingIds = [...new Set((exactProducts.data || []).map((p: any) => Number(p.bling_parent_id || 0)).filter((id: number) => id > 0))];
  const parentProducts = parentBlingIds.length
    ? await admin.from("products").select("id,nome,sku,product_type,bling_product_id,bling_parent_id,ativo").in("bling_product_id", parentBlingIds)
    : { data: [], error: null } as any;
  if (parentProducts.error) throw parentProducts.error;
  const parentByBling = new Map((parentProducts.data || []).map((p: any) => [Number(p.bling_product_id), p]));
  const allLocalIds = [...new Set([...(exactProducts.data || []).map((p: any) => p.id), ...(parentProducts.data || []).map((p: any) => p.id)])];
  const mappings = allLocalIds.length
    ? await admin.from("product_fiscal_profiles").select("product_id,fiscal_profile_id,ativo,source,classified_at").in("product_id", allLocalIds).eq("ativo", true)
    : { data: [], error: null } as any;
  if (mappings.error) throw mappings.error;
  const mappingByProduct = new Map((mappings.data || []).map((m: any) => [m.product_id, m]));
  let hasService=false,hasProduct=false,hasUnknown=false,hasUnclassified=false;
  const profileIds = new Set<string>();
  const analyzedItems = items.map((item: any) => {
    const blingProductId = Number(item?.produto?.id || 0);
    const local = exactByBling.get(blingProductId) as any;
    if (!local) { hasUnknown=true; return { id:item?.id||null,bling_product_id:blingProductId||null,descricao:item?.descricao||"Item sem descrição",quantidade:Number(item?.quantidade||0),valor_unitario:money(item?.valor),total_estimado:money(Number(item?.quantidade||0)*Number(item?.valor||0)),type:"unknown",classification:"product_not_found",local_product:null,fiscal_profile:null,fiscal_profile_source:null }; }
    const type = normalizeType(local.product_type);
    if(type==="service")hasService=true;else if(type==="product")hasProduct=true;else hasUnknown=true;
    let fiscalMapping = mappingByProduct.get(local.id) as any;
    let source: "direct"|"parent"|null = fiscalMapping ? "direct" : null;
    let parent:any=null;
    if(!fiscalMapping && Number(local.bling_parent_id||0)>0){ parent=parentByBling.get(Number(local.bling_parent_id)); if(parent){ fiscalMapping=mappingByProduct.get(parent.id); if(fiscalMapping)source="parent"; } }
    const fiscalProfile:any=fiscalMapping ? profileById.get(String(fiscalMapping.fiscal_profile_id))||null : null;
    if(type==="service"){ if(!fiscalProfile)hasUnclassified=true; else profileIds.add(fiscalProfile.id); }
    return { id:item?.id||null,bling_product_id:blingProductId,descricao:item?.descricao||local.nome||"Item",quantidade:Number(item?.quantidade||0),valor_unitario:money(item?.valor),total_estimado:money(Number(item?.quantidade||0)*Number(item?.valor||0)),type,classification:type==="service"?(fiscalProfile?"classified":"unclassified"):type,local_product:{id:local.id,nome:local.nome,sku:local.sku,product_type:local.product_type,bling_parent_id:local.bling_parent_id,parent_product_id:parent?.id||null,parent_product_name:parent?.nome||null},fiscal_profile:fiscalProfile,fiscal_profile_source:source };
  });
  const blingContactId=Number(order?.contato?.id||0); let customer:any=null;
  if(blingContactId>0){ const result=await admin.from("customer_profiles").select("id,nome,cpf,email,email_nota_fiscal,ativo,bling_contact_id,bling_raw").eq("bling_contact_id",blingContactId).maybeSingle(); if(result.error)throw result.error; customer=result.data; }
  let existingDocument:any=null;
  if(Number(order?.id||0)>0){ const existing=await admin.from("nfse_documents").select("id,status,bling_order_id,bling_order_number,bling_nfse_id,numero_nfse,numero_rps,codigo_verificacao,link_nfse,error_code,error_message,valor_servico,created_at,authorized_at").eq("bling_order_id",Number(order.id)).maybeSingle(); if(existing.error)throw existing.error; existingDocument=existing.data; }
  const errors:string[]=[],warnings:string[]=[]; let reason="eligible";
  if(!items.length){reason="empty_order";errors.push("O pedido não possui itens.");}
  else if(hasProduct&&hasService){reason="mixed_order";errors.push("O pedido mistura mercadorias e serviços. O faturamento NFS-e integral está bloqueado.");}
  else if(hasProduct){reason="product_order";errors.push("O pedido contém mercadorias e não deve ser faturado integralmente como NFS-e.");}
  else if(hasUnknown){reason="unknown_items";errors.push("Há itens do pedido que não foram localizados/classificados no catálogo da Croma.");}
  else if(hasUnclassified){reason="unclassified_services";errors.push("Há serviços sem perfil fiscal definido.");}
  else if(profileIds.size>1){reason="multiple_profiles";errors.push("O pedido possui serviços com perfis fiscais diferentes. A divisão fiscal ainda não está habilitada.");}
  const orderStatusText=String(order?.situacao?.valor||"").toLowerCase();
  if(orderStatusText.includes("cancel")){reason="cancelled_order";errors.push("O pedido está cancelado no Bling.");}
  if(Number(order?.notaFiscal?.id||0)>0){reason="linked_nfe";errors.push("O pedido já possui uma nota fiscal vinculada no Bling. Revise antes de gerar NFS-e.");}
  if(!customer?.ativo){reason="customer_not_synced";errors.push("O cliente do pedido não está vinculado a um cliente ativo da Croma.");}
  const customerDocument=digits(customer?.cpf||customer?.bling_raw?.numeroDocumento||order?.contato?.numeroDocumento||"");
  if(customer && ![11,14].includes(customerDocument.length)){reason="customer_document_invalid";errors.push("O CPF/CNPJ do cliente precisa ser corrigido antes do faturamento.");}
  const total=money(order?.total); if(!(total>0)){reason="invalid_total";errors.push("O valor total do pedido precisa ser maior que zero.");}
  if(existingDocument){reason="already_prepared";errors.push("Este pedido já possui um processo de NFS-e no Croma Hub.");}
  const totalProdutos=money(order?.totalProdutos); if(totalProdutos>0&&Math.abs(total-totalProdutos)>=0.01)warnings.push(`O total do pedido (${total.toFixed(2)}) difere do total dos produtos/serviços (${totalProdutos.toFixed(2)}).`);
  const resolvedProfileId=profileIds.size===1?[...profileIds][0]:null;
  const resolvedProfile:any=resolvedProfileId?profileById.get(resolvedProfileId)||null:null;
  return { eligible:errors.length===0,reason,errors,warnings,items:analyzedItems,fiscal_profile:resolvedProfile,customer:customer?{id:customer.id,nome:customer.nome,cpf:customer.cpf||customer.bling_raw?.numeroDocumento||order?.contato?.numeroDocumento||null,email:customer.email_nota_fiscal||customer.email||null,bling_contact_id:customer.bling_contact_id}:null,existing_document:existingDocument,summary:{services:analyzedItems.filter((i:any)=>i.type==="service").length,products:analyzedItems.filter((i:any)=>i.type==="product").length,unknown:analyzedItems.filter((i:any)=>i.type==="unknown").length,unclassified:analyzedItems.filter((i:any)=>i.type==="service"&&!i.fiscal_profile).length,profiles:profileIds.size} };
}
async function listOrders(req:Request,input:any){
  const page=Math.max(1,Number(input.page||1)),limit=Math.min(50,Math.max(10,Number(input.limit||30))); const query:Record<string,string>={pagina:String(page),limite:String(limit)}; const number=digits(input.numero||""); if(number)query.numero=number;
  const payload=await blingGateway(req,{action:"list",entity:"order",query}); const rows=Array.isArray(payload?.data)?payload.data:[]; const ids=rows.map((o:any)=>Number(o?.id||0)).filter((id:number)=>id>0);
  const documents=ids.length?await admin.from("nfse_documents").select("id,status,bling_order_id,bling_order_number,bling_nfse_id,numero_nfse,link_nfse,error_code,error_message,created_at,authorized_at").in("bling_order_id",ids):{data:[],error:null} as any; if(documents.error)throw documents.error;
  const byOrder=new Map((documents.data||[]).map((d:any)=>[Number(d.bling_order_id),d])); return {page,limit,data:rows.map((order:any)=>({...order,croma_nfse:byOrder.get(Number(order.id))||null}))};
}
async function getOrderAnalysis(req:Request,orderId:number){const payload=await blingGateway(req,{action:"get",entity:"order",id:String(orderId)});const order=payload?.data||payload;return{order,analysis:await analyzeOrder(order)}}
async function classifyProduct(user:any,input:any){
  const blingProductId=Number(input.bling_product_id||0),fiscalProfileId=String(input.fiscal_profile_id||"").trim(); if(!(blingProductId>0)||!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(fiscalProfileId))throw new Response("Produto ou perfil fiscal inválido.",{status:400});
  const [{data:product,error:productError},{data:profile,error:profileError}]=await Promise.all([admin.from("products").select("id,nome,product_type,bling_product_id").eq("bling_product_id",blingProductId).maybeSingle(),admin.from("fiscal_service_profiles").select("id,nome,ativo").eq("id",fiscalProfileId).maybeSingle()]); if(productError)throw productError;if(profileError)throw profileError;if(!product)throw new Response("Produto do Bling não localizado no catálogo Croma.",{status:404});if(normalizeType(product.product_type)!=="service")throw new Response("Somente itens cadastrados como serviço podem receber perfil fiscal de NFS-e.",{status:409});if(!profile?.ativo)throw new Response("Perfil fiscal inexistente ou inativo.",{status:409});
  const {data,error}=await admin.from("product_fiscal_profiles").upsert({product_id:product.id,fiscal_profile_id:profile.id,ativo:true,source:"manual",classified_by:user.id,classified_at:new Date().toISOString()},{onConflict:"product_id"}).select("product_id,fiscal_profile_id,ativo,source,classified_at").single(); if(error)throw error;return{mapping:data,product:{id:product.id,nome:product.nome,bling_product_id:product.bling_product_id},profile};
}
async function prepareOrder(req:Request,user:any,orderId:number){
  const {order,analysis}=await getOrderAnalysis(req,orderId); if(!analysis.eligible){const error:any=new Error(analysis.errors.join(" ")||"Pedido não está apto para faturamento NFS-e.");error.status=422;error.payload={analysis,order};throw error;} if(!analysis.customer?.id||!analysis.fiscal_profile?.id)throw new Response("Cliente ou perfil fiscal não resolvido.",{status:422});
  const description=buildDescription(order),total=money(order.total),snapshot={order,analysis,prepared_at:new Date().toISOString()};
  const {data:document,error}=await admin.from("nfse_documents").insert({customer_id:analysis.customer.id,fiscal_profile_id:analysis.fiscal_profile.id,source_type:"bling_order",bling_order_id:Number(order.id),bling_order_number:String(order.numero||""),bling_contact_id:Number(order?.contato?.id||analysis.customer.bling_contact_id||0)||null,status:"draft",valor_servico:total,descricao:description,serie:"1",order_snapshot:snapshot,created_by:user.id}).select("*").single();
  if(error){if(String(error.code||"")==="23505"){const existing=await admin.from("nfse_documents").select("*").eq("bling_order_id",orderId).maybeSingle();const conflict:any=new Error("Este pedido já possui um processo de NFS-e no Croma Hub.");conflict.status=409;conflict.payload={document:existing.data||null};throw conflict;}throw error;}
  await admin.from("nfse_events").insert({nfse_document_id:document.id,event_type:"prepared_from_bling_order",actor_id:user.id,payload:{bling_order_id:Number(order.id),bling_order_number:String(order.numero||""),warnings:analysis.warnings}});
  try{const validation=await blingGateway(req,{action:"nfse_validate",document_id:document.id});return{document:validation?.document||document,warnings:validation?.warnings||analysis.warnings,order,analysis};}
  catch(validationError:any){return{document,order,analysis,warnings:analysis.warnings,validation_error:validationError?.payload||validationError?.message||"Falha na validação fiscal."};}
}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});try{if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);const user=await requireOwner(req);const input=await req.json();const action=String(input.action||"");if(action==="orders_list")return json(req,{ok:true,...(await listOrders(req,input))});if(action==="order_analyze"){const id=Number(input.order_id||0);if(!(id>0))return json(req,{error:"Pedido do Bling inválido."},400);return json(req,{ok:true,...(await getOrderAnalysis(req,id))});}if(action==="classify_product")return json(req,{ok:true,...(await classifyProduct(user,input))});if(action==="order_prepare"){const id=Number(input.order_id||0);if(!(id>0))return json(req,{error:"Pedido do Bling inválido."},400);return json(req,{ok:true,...(await prepareOrder(req,user,id))});}return json(req,{error:"Ação inválida."},400);}catch(error:any){if(error instanceof Response)return json(req,{error:await error.text()},error.status);console.error("nfse_order_workflow_error",error);const status=Number(error?.status||500);return json(req,{error:"Não foi possível concluir o faturamento do pedido.",detail:error instanceof Error?error.message:String(error),...(error?.payload?{context:error.payload}:{})},status>=400&&status<600?status:500);}});
