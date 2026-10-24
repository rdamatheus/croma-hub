import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const API="https://api.bling.com.br/Api/v3", PAGE=100;
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const txt=(v:any)=>{const s=String(v??"").trim();return s||null};
const num=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};
const pick=(o:any,paths:string[])=>{for(const p of paths){let x=o;for(const k of p.split("."))x=x?.[k];if(x!==undefined&&x!==null&&x!=="")return x}return null};
const err=(e:any)=>e instanceof Error?e.message:typeof e==="string"?e:JSON.stringify(e);
const service=(x:any)=>{const t=String(x?.tipo??"").toUpperCase();return t==="S"||t.includes("SERV")};
function taxonomyReadyMetadata(meta:any,hasCategory:boolean){const out={...(meta||{})},status=String(out.taxonomy_sync_status||"");if(hasCategory&&["error","waiting_baseline"].includes(status)){out.taxonomy_sync_status="pending";out.taxonomy_sync_error=null;out.taxonomy_sync_error_at=null;out.taxonomy_retry_count=0;out.taxonomy_next_retry_at=null}return out}
const origins=new Set(["https://www.cromapel.com.br","https://cromapel.com.br"]);
function cors(req:Request){const o=req.headers.get("Origin")||"";return{"Access-Control-Allow-Origin":origins.has(o)?o:"https://cromapel.com.br","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-croma-cron","Access-Control-Allow-Methods":"POST, OPTIONS",Vary:"Origin"}}
function json(req:Request,data:any,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors(req),"Content-Type":"application/json"}})}
function stable(v:any):any{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==="object"){const o:any={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o}return v}
async function hash(v:any){const b=new TextEncoder().encode(JSON.stringify(stable(v??null)));const d=await crypto.subtle.digest("SHA-256",b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function secret(name:string){const{data,error}=await db.rpc("erp_read_secret",{p_name:name});if(error)throw error;return String(data||"")}
async function store(name:string,value:string,description:string){const{error}=await db.rpc("erp_store_secret",{p_name:name,p_value:value,p_description:description});if(error)throw error}
function tokenName(k:string,id:string){return`erp_bling_${k}_token_${id.replaceAll("-","")}`}
async function auth(req:Request){const c=req.headers.get("x-croma-cron")||"";if(c){const expected=await secret("erp_bling_cron_secret");if(expected&&c===expected)return{cron:true,role:"cron"}}const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();if(!token)throw new Error("Sessão ausente.");const{data,error}=await db.auth.getUser(token);if(error||!data.user)throw new Error("Sessão inválida.");const{data:p}=await db.from("profiles").select("role,ativo").eq("id",data.user.id).maybeSingle();if(!p?.ativo||!["owner","manager"].includes(p.role))throw new Error("Acesso restrito à gestão.");return{cron:false,role:p.role,userId:data.user.id}}
async function connection(){const{data,error}=await db.from("erp_connections").select("*").eq("provider","bling").single();if(error)throw error;return data}
async function refresh(c:any,t:any){const cid=await secret("erp_bling_client_id"),cs=await secret("erp_bling_client_secret"),rt=await secret(t.refresh_token_secret_name);const r=await fetch(`${API}/oauth/token`,{method:"POST",headers:{Authorization:`Basic ${btoa(`${cid}:${cs}`)}`,"Content-Type":"application/x-www-form-urlencoded","enable-jwt":"1"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:rt})});const p=await r.json();if(!r.ok)throw new Error(p?.error_description||p?.error?.description||"Falha ao renovar token.");const an=tokenName("access",c.id),rn=tokenName("refresh",c.id);await Promise.all([store(an,String(p.access_token||""),"Access token OAuth do Bling"),store(rn,String(p.refresh_token||""),"Refresh token OAuth do Bling")]);await db.from("erp_private_tokens").update({access_token_secret_name:an,refresh_token_secret_name:rn,expires_at:new Date(Date.now()+Number(p.expires_in||3600)*1000).toISOString(),updated_at:new Date().toISOString()}).eq("connection_id",c.id);await db.from("erp_connections").update({status:"connected",last_error:null,updated_at:new Date().toISOString()}).eq("id",c.id);return String(p.access_token||"")}
async function token(){const c=await connection();const{data:t,error}=await db.from("erp_private_tokens").select("*").eq("connection_id",c.id).single();if(error)throw error;if(c.status==="connected"&&new Date(t.expires_at).getTime()>Date.now()+90000){const a=await secret(t.access_token_secret_name);if(a)return{token:a,c}}return{token:await refresh(c,t),c}}
async function api(t:string,path:string,method="GET",body?:any){for(let a=0;a<4;a++){const r=await fetch(`${API}${path}`,{method,headers:{Authorization:`Bearer ${t}`,Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{}}catch{throw new Error(`Resposta inválida do Bling (${r.status}).`)}if(r.ok)return p;if(r.status===429&&a<3){await sleep(1200*(a+1));continue}throw new Error(p?.error?.description||p?.error?.message||p?.message||`Bling respondeu ${r.status}.`)}throw new Error("Limite do Bling excedido.")}

// Regras estruturais gerais; nenhum cadastro é identificado por ID ou nome especial.
function formatOf(x:any){const f=String(x?.formato??"").trim().toUpperCase();if(f==="S")return"simple";if(f==="V")return"variation";if(f==="E")return"composition";throw new Error("Formato Bling desconhecido: revisão necessária.")}
function parentOf(x:any){const n=Number(x?.variacao?.produtoPai?.id??x?.produtoPai?.id??x?.idProdutoPai??0);return Number.isFinite(n)&&n>0?n:null}
function shapeOf(x:any){const e=x?.estrutura||{};return JSON.stringify(stable({formato:formatOf(x),pai:parentOf(x),variacao:x?.variacao?.nome??null,componentes:(e.componentes||[]).map((c:any)=>({id:Number(c?.produto?.id||0),quantidade:Number(c?.quantidade||0)})),tipoEstoque:e.tipoEstoque??null,lancamentoEstoque:e.lancamentoEstoque??null}))}
function structuralDirty(fields:any){return Array.isArray(fields)&&fields.some((x:any)=>/^(estrutura|compos|component|product_format|parent_product_id|bling_parent_id|variac|stock_type|stock_posting)/i.test(String(x)))}
function unit(v:any){const x=String(v??"un").toLowerCase().trim(),m:any={un:"un",unid:"un",unidade:"un",m:"m",mt:"m",m2:"m2","m²":"m2",kg:"kg",cx:"cx",caixa:"cx",pct:"pct",kit:"kit"};return m[x]||"un"}
function slug(v:string){return v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90)}
async function uniqueSlug(base:string,id?:string){const root=slug(base)||`produto-${Date.now()}`;for(let i=0;i<30;i++){const s=i?`${root}-${i+1}`:root;let q=db.from("products").select("id").eq("slug",s).limit(1);if(id)q=q.neq("id",id);const{data}=await q;if(!data?.length)return s}return`${root}-${Date.now()}`}
async function state(id:string){const{data}=await db.from("erp_product_sync_state").select("*").eq("product_id",id).maybeSingle();return data||null}
async function composition(id:string,remote:any){const{data:rows,error}=await db.from("product_components").select("component_product_id,quantity,position,external_component_id").eq("parent_product_id",id).eq("active",true).eq("sync_to_bling",true).order("position",{ascending:true});if(error)throw error;const{data:settings,error:se}=await db.from("product_composition_settings").select("stock_type,stock_posting").eq("product_id",id).maybeSingle();if(se)throw se;const ids=[...new Set((rows||[]).map((r:any)=>r.component_product_id).filter(Boolean))];const byId=new Map<string,any>();if(ids.length){const{data:parts,error:pe}=await db.from("products").select("id,nome,sku,bling_product_id").in("id",ids);if(pe)throw pe;for(const p of parts||[])byId.set(p.id,p)}const components=[];for(const row of rows||[]){const part=byId.get(row.component_product_id);const external=Number(part?.bling_product_id||row.external_component_id||0);if(!external)throw new Error(`Componente ${part?.nome||row.component_product_id} ainda não possui vínculo com o Bling.`);components.push({produto:{id:external},quantidade:Number(row.quantity)})}return{has:components.length>0,components,stockType:settings?.stock_type??remote?.estrutura?.tipoEstoque??null,stockPosting:settings?.stock_posting??remote?.estrutura?.lancamentoEstoque??null}}
async function compositionMatches(id:string,remote:any){
 const remoteRows=(remote?.estrutura?.componentes||[]).map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((a:any,b:any)=>a.id-b.id);
 const localRows=(await composition(id,remote)).components.map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((a:any,b:any)=>a.id-b.id);
 return JSON.stringify(remoteRows)===JSON.stringify(localRows);
}

async function resolveParent(ext:any,existing:any=null){
 const external=parentOf(ext);if(!external)return null;
 const{data,error}=await db.from("products").select("id").eq("bling_product_id",external).maybeSingle();if(error)throw error;
 if(data?.id)return data.id;
 return Number(existing?.bling_parent_id||0)===external?(existing?.parent_product_id??null):null;
}
async function missingComponents(ext:any):Promise<number[]>{
 if(formatOf(ext)!=="composition")return[];
 const rows=ext?.estrutura?.componentes;
 if(!Array.isArray(rows))throw new Error("Estrutura Bling sem lista de componentes.");
 const ids=rows.map((x:any)=>Number(x?.produto?.id||0));
 if(ids.some((x:number)=>!Number.isSafeInteger(x)||x<=0)||new Set(ids).size!==ids.length||
    rows.some((x:any)=>!Number.isFinite(Number(x?.quantidade))||Number(x.quantidade)<=0))throw new Error("Composição Bling inválida: ID, duplicidade ou quantidade.");
 if(!ids.length)return[];
 const{data,error}=await db.from("products").select("bling_product_id").in("bling_product_id",ids);
 if(error)throw error;
 const found=new Set((data||[]).map((x:any)=>Number(x.bling_product_id)));
 return ids.filter((id:number)=>!found.has(id));
}
async function structurePayload(p:any,remote:any,dirty:string[]){
 const fmt=String(p.product_format||"simple"),map:any={simple:"S",variation:"V",composition:"E"};
 if(!map[fmt])throw new Error("Formato local não reconhecido.");
 const x:any={};x.formato=map[fmt];
 if(fmt==="composition"){
  const c=await composition(p.id,remote||{});
  if(!c.components.length)throw new Error("Composição sem insumos vinculados: revisar antes de enviar ao Bling.");
  const ids=c.components.map((v:any)=>Number(v.produto.id));
  if(new Set(ids).size!==ids.length||c.components.some((v:any)=>Number(v.quantidade)<=0))throw new Error("Composição local duplicada ou inválida.");
  x.estrutura={...(remote?.estrutura||{}),componentes:c.components};
  if(c.stockType)x.estrutura.tipoEstoque=c.stockType;
  if(c.stockPosting!==null)x.estrutura.lancamentoEstoque=c.stockPosting;
 }else{x.estrutura=null}
 const currentParent=parentOf(remote);
 if(p.parent_product_id){
  const{data:parent,error}=await db.from("products").select("bling_product_id").eq("id",p.parent_product_id).single();
  if(error)throw error;
  const eid=Number(parent?.bling_product_id||0);
  if(!eid)throw new Error("Produto pai ainda não possui ID Bling.");
  if(eid===Number(p.bling_product_id))throw new Error("Produto não pode ser seu próprio pai.");
  x.parentId=eid;
 }else if(currentParent){throw new Error("Desvinculação de variação requer revisão de operação no Bling.")}
 else x.parentId=null;
 const desired=p.metadata?.bling_variation;
 if(desired!==undefined&&desired!==null){
  if(typeof desired!=="object"||Array.isArray(desired))throw new Error("Metadados da variação inválidos.");
  if(desired.nome!==undefined&&typeof desired.nome!=="string")throw new Error("Nome da variação inválido.");
  if(desired.ordem!==undefined&&(!Number.isSafeInteger(Number(desired.ordem))||Number(desired.ordem)<0))throw new Error("Ordem da variação inválida.");
 }
 if(!remote?.id&&x.parentId!==null&&(!desired||!String(desired.nome||"").trim()))throw new Error("Nova variação exige metadata.bling_variation.nome para criação no Bling.");
 x.variation=desired||null;
 return x;
}
function applyStructure(out:any,remote:any,desired:any){
 out.formato=desired.formato;
 if(desired.formato==="E")out.estrutura=desired.estrutura;
 else delete out.estrutura;
 if(desired.parentId!==null){
  out.variacao={...(remote?.variacao||{}),produtoPai:{...(remote?.variacao?.produtoPai||{}),id:desired.parentId}};
 }
 if(desired.variation){
  out.variacao={...(out.variacao||remote?.variacao||{})};
  if(desired.variation.nome!==undefined)out.variacao.nome=desired.variation.nome;
  if(desired.variation.ordem!==undefined)out.variacao.ordem=Number(desired.variation.ordem);
  if(desired.parentId!==null)out.variacao.produtoPai={...(out.variacao?.produtoPai||{}),id:desired.parentId};
 }
}
function sameComponents(a:any[],b:any[]){
 const norm=(arr:any[])=>arr.map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((x:any,y:any)=>x.id-y.id);
 return JSON.stringify(norm(a||[]))===JSON.stringify(norm(b||[]));
}
function verifyStructure(fresh:any,desired:any){
 if(formatOf(fresh)!==({S:"simple",V:"variation",E:"composition"} as any)[desired.formato])throw new Error("Bling não confirmou o formato estrutural.");
 if(Number(parentOf(fresh)||0)!==Number(desired.parentId||0))throw new Error("Bling não confirmou o vínculo pai/filho.");
 if(desired.formato==="E"&&!sameComponents(fresh?.estrutura?.componentes||[],desired.estrutura.componentes))throw new Error("Bling não confirmou os componentes e quantidades.");
 if(desired.formato==="E"&&desired.estrutura?.tipoEstoque&&String(fresh?.estrutura?.tipoEstoque||"")!==String(desired.estrutura.tipoEstoque))throw new Error("Bling não confirmou o tipo de estoque da composição.");
 if(desired.formato==="E"&&desired.estrutura?.lancamentoEstoque&&String(fresh?.estrutura?.lancamentoEstoque||"")!==String(desired.estrutura.lancamentoEstoque))throw new Error("Bling não confirmou o lançamento de estoque.");
 if(desired.variation?.nome!==undefined&&String(fresh?.variacao?.nome||"")!==desired.variation.nome)throw new Error("Bling não confirmou o nome da variação.");
 if(desired.variation?.ordem!==undefined&&Number(fresh?.variacao?.ordem)!==Number(desired.variation.ordem))throw new Error("Bling não confirmou a ordem da variação.");
}
async function saveState(id:string,remote:any,extra:any={}){const now=new Date().toISOString();const{error}=await db.from("erp_product_sync_state").upsert({product_id:id,sync_policy:"auto_bidirectional",baseline_payload:remote||null,baseline_hash:remote?await hash(remote):null,last_remote_check_at:now,updated_at:now,...extra},{onConflict:"product_id"});if(error)throw error}
async function findLocal(ext:any){let q=await db.from("products").select("*").eq("bling_product_id",String(ext.id)).maybeSingle();if(q.data)return q.data;const code=txt(ext.codigo);if(!code)return null;q=await db.from("products").select("*").or(`sku.eq.${code},bling_sku.eq.${code}`).limit(2);if((q.data?.length||0)>1)throw new Error(`Mais de um produto usa o SKU ${code}.`);return q.data?.[0]||null}

async function inbound(ext:any){
 if(service(ext))return{service:true};
 const fmt=formatOf(ext),now=new Date().toISOString(),code=txt(ext.codigo)||`BLING-${ext.id}`;
 let local=await findLocal(ext);const st=local?await state(local.id):null,remoteHash=await hash(ext);
 if(local&&st?.local_dirty){
  if(st.baseline_hash&&st.baseline_hash!==remoteHash){
   await saveState(local.id,st.baseline_payload||ext,{local_dirty:true,remote_change_detected:true,outbound_state:"conflict",last_error:"Alterado nos dois lados antes da sincronização."});
   return{conflict:true};
  }
  return{dirty:true};
 }
 const missing=await missingComponents(ext);
 if(missing.length){
  if(local)await saveState(local.id,st?.baseline_payload||local.metadata?.bling_raw||ext,{remote_change_detected:true,outbound_state:"structural_review",last_error:`Insumos do Bling sem cadastro local: ${missing.join(", ")}`});
  return{review:true,missing};
 }
 const parentId=parentOf(ext),localParent=await resolveParent(ext,local);
 const payload:any={nome:txt(ext.nome)||`Produto Bling ${ext.id}`,sku:local?.sku||code,descricao:txt(pick(ext,["descricaoCurta","descricao"]))||local?.descricao||null,
  unidade:unit(ext.unidade),preco:Math.max(0,num(ext.preco)||0),ativo:!["I","INATIVO"].includes(String(ext.situacao??"A").toUpperCase()),
  catalog_category_id:local?.catalog_category_id??null,slug:local?.slug||await uniqueSlug(`${ext.nome||"produto"}-${code}`,local?.id),
  product_type:"produto",product_format:fmt,parent_product_id:localParent,bling_product_id:num(ext.id),bling_parent_id:parentId,bling_sku:code,
  bling_sync_status:"sincronizado",bling_last_synced_at:now,bling_sync_error:null,
  short_description:txt(ext.descricaoCurta),complementary_description:txt(ext.descricaoComplementar),
  external_link:txt(ext.linkExterno),video_link:txt(pick(ext,["video.url","video"])),notes:txt(pick(ext,["observacoes","observacao"])),
  metadata:{...taxonomyReadyMetadata(local?.metadata,Boolean(local?.catalog_category_id)),bling_raw:ext,bling_seen_at:now}};
 let saved:any;
 if(local){const q=await db.from("products").update(payload).eq("id",local.id).select("*").single();if(q.error)throw q.error;saved=q.data}
 else{const q=await db.from("products").insert(payload).select("*").single();if(q.error)throw q.error;saved=q.data}
 const dim=ext.dimensoes||{},trib=ext.tributacao||{};
 const d={product_id:saved.id,brand:txt(pick(ext,["marca.nome","marca"])),model:txt(ext.modelo),
  gtin:txt(ext.gtin),gtin_tax:txt(pick(ext,["gtinEmbalagem","gtinTributavel"])),
  ncm:txt(pick(trib,["ncm"]))||txt(ext.ncm),origin:txt(pick(trib,["origem"]))||txt(ext.origem),
  gross_weight_kg:num(ext.pesoBruto),net_weight_kg:num(ext.pesoLiquido),
  width_cm:num(pick(dim,["largura"]))??num(ext.largura),height_cm:num(pick(dim,["altura"]))??num(ext.altura),
  depth_cm:num(pick(dim,["profundidade"]))??num(ext.profundidade),specifications:{bling_raw:ext}};
 const de=await db.from("product_details").upsert(d,{onConflict:"product_id"});if(de.error)throw de.error;
 const map=await db.from("erp_entity_mappings").upsert({provider:"bling",entity_type:"product",local_id:saved.id,external_id:String(ext.id),
  sync_status:"synced",last_synced_at:now,updated_at:now,metadata:{codigo:code,nome:ext.nome||null}},{onConflict:"provider,entity_type,external_id"});
 if(map.error)throw map.error;
 const review=Boolean(parentId&&!localParent)||(fmt==="composition"&&!(await compositionMatches(saved.id,ext)));
 await saveState(saved.id,ext,{last_inbound_at:now,local_dirty:false,dirty_fields:[],remote_change_detected:review,
  outbound_state:review?"structural_review":"clean",last_error:review?"Vínculo pai ou composição ainda não reconciliado.":null});
 return{created:!local,review};
}

function outbound(p:any,d:any,remote:any,structure:any,dirty:string[]=[]){
 const x=structuredClone(remote||{});
 for(const k of ["id","dataCriacao","dataAlteracao","loja"])delete x[k];
 x.nome=p.nome;x.codigo=p.bling_sku||p.sku||x.codigo;x.preco=Number(p.preco||0);x.unidade=p.unidade||x.unidade||"UN";
 x.situacao=p.ativo?"A":"I";x.tipo="P";
 if(p.short_description!==null)x.descricaoCurta=p.short_description;
 if(p.complementary_description!==null)x.descricaoComplementar=p.complementary_description;
 if(p.notes!==null)x.observacoes=p.notes;
 if(dirty.includes("ncm")){
  const ncm=String(d?.ncm??"").trim();
  if(!/^\d{4}\.?(?:\d{2})?\.?(?:\d{2})?$/.test(ncm)||ncm.replace(/\D/g,"").length!==8)throw new Error("NCM inválido para sincronização fiscal.");
  x.tributacao={...(x.tributacao||{}),ncm};
 }
 if(d?.gtin)x.gtin=d.gtin;if(d?.gtin_tax)x.gtinEmbalagem=d.gtin_tax;
 if(d?.net_weight_kg!=null)x.pesoLiquido=Number(d.net_weight_kg);
 if(d?.gross_weight_kg!=null)x.pesoBruto=Number(d.gross_weight_kg);
 if(d?.brand)x.marca=typeof x.marca==="object"?{...x.marca,nome:d.brand}:d.brand;
 return x;
}

async function push(t:string,p:any){
 if(!p||p.product_type!=="produto")return{skipped:true};
 const st=await state(p.id),{data:d}=await db.from("product_details").select("*").eq("product_id",p.id).maybeSingle();
 let remote:any=null;
 if(p.bling_product_id){
  remote=(await api(t,`/produtos/${p.bling_product_id}`))?.data||null;
  if(remote&&service(remote)){await saveState(p.id,remote,{local_dirty:false,dirty_fields:[],outbound_state:"manual_service",last_error:"Serviço tratado no sincronizador de serviços."});return{service:true}}
  if(st?.baseline_hash&&remote&&await hash(remote)!==st.baseline_hash){
   await saveState(p.id,st.baseline_payload||remote,{local_dirty:true,remote_change_detected:true,outbound_state:"conflict",last_error:"O Bling mudou antes do envio automático."});return{conflict:true}
  }
 }
 const desired=await structurePayload(p,remote||{},st?.dirty_fields||[]);
 const proposed=outbound(p,d||{},remote||{},null,st?.dirty_fields||[]);
 applyStructure(proposed,remote||{},desired);
 let external=p.bling_product_id;
 if(external)await api(t,`/produtos/${external}`,"PUT",proposed);
 else{const r=await api(t,"/produtos","POST",proposed);external=r?.data?.id||r?.id;if(!external)throw new Error("Bling não retornou o ID criado.")}
 await sleep(350);
 const fresh=(await api(t,`/produtos/${external}`))?.data;
 if(!fresh)throw new Error("Não foi possível reler o produto no Bling.");
 verifyStructure(fresh,desired);
 if((st?.dirty_fields||[]).includes("ncm")&&String(fresh?.tributacao?.ncm||"").replace(/\\D/g,"")!==String(d?.ncm||"").replace(/\\D/g,""))throw new Error("NCM não confirmado após releitura do Bling.");
 const now=new Date().toISOString();
 const update=await db.from("products").update({bling_product_id:Number(external),bling_sku:txt(fresh.codigo)||p.bling_sku||p.sku,
  bling_sync_status:"sincronizado",bling_last_synced_at:now,bling_sync_error:null,
  product_format:formatOf(fresh),bling_parent_id:parentOf(fresh),
  metadata:{...taxonomyReadyMetadata(p.metadata,Boolean(p.catalog_category_id)),bling_raw:fresh,bling_outbound_applied_at:now}}).eq("id",p.id);
 if(update.error)throw update.error;
 const mapping=await db.from("erp_entity_mappings").upsert({provider:"bling",entity_type:"product",local_id:p.id,external_id:String(external),
  sync_status:"synced",last_synced_at:now,updated_at:now,metadata:{codigo:fresh.codigo||null,nome:fresh.nome||null}},{onConflict:"provider,entity_type,external_id"});
 if(mapping.error)throw mapping.error;
 await saveState(p.id,fresh,{last_outbound_at:now,last_inbound_at:now,local_dirty:false,dirty_fields:[],remote_change_detected:false,outbound_state:"clean",last_error:null});
 return{pushed:true,external};
}
async function pushPending(t:string){const{data,error}=await db.from("erp_product_sync_state").select("product_id,updated_at").eq("local_dirty",true).in("outbound_state",["pending","review_required","error","structural_review"]).order("updated_at",{ascending:true}).limit(12);if(error)throw error;let pushed=0,conflicts=0,errors=0,skipped=0;for(const s of data||[]){const{data:p}=await db.from("products").select("*").eq("id",s.product_id).maybeSingle();if(!p||p.product_type!=="produto"){skipped++;continue}await db.from("erp_product_sync_state").update({outbound_state:"syncing",updated_at:new Date().toISOString()}).eq("product_id",p.id);try{const r=await push(t,p);if(r.conflict)conflicts++;else if(r.pushed)pushed++;else skipped++}catch(e){errors++;const m=err(e);await db.from("products").update({bling_sync_status:"erro",bling_sync_error:m}).eq("id",p.id);await db.from("erp_product_sync_state").update({outbound_state:"error",last_error:m,updated_at:new Date().toISOString()}).eq("product_id",p.id)}await sleep(300)}return{pushed,conflicts,push_errors:errors,skipped}}
async function parentsFor(externalIds:number[]){const ids=[...new Set(externalIds.filter(x=>Number.isFinite(x)&&x>0))];if(!ids.length)return 0;const{data:children,error}=await db.from("products").select("id,bling_product_id,bling_parent_id,parent_product_id").eq("product_type","produto").in("bling_product_id",ids).not("bling_parent_id","is",null);if(error)throw error;const parentExternal=[...new Set((children||[]).map((x:any)=>Number(x.bling_parent_id)).filter((x:number)=>Number.isFinite(x)&&x>0))];if(!parentExternal.length)return 0;const byExternal=new Map<number,string>();for(let i=0;i<parentExternal.length;i+=500){const{data:rows,error:e}=await db.from("products").select("id,bling_product_id").in("bling_product_id",parentExternal.slice(i,i+500));if(e)throw e;for(const p of rows||[])byExternal.set(Number(p.bling_product_id),p.id)}let updated=0;for(const child of children||[]){const target=byExternal.get(Number(child.bling_parent_id));if(target&&target!==child.parent_product_id){const{error:e}=await db.from("products").update({parent_product_id:target}).eq("id",child.id);if(e)throw e;updated++}}return updated}
async function pullPage(t:string,c:any,page:number,bootstrap:boolean){const started=new Date(),cfg=c.config||{},since=bootstrap?null:(cfg.products_incremental_since||cfg.products_auto_last_pull_at||new Date(Date.now()-24*60*60*1000).toISOString()),qs=new URLSearchParams({pagina:String(page),limite:String(PAGE)});if(!bootstrap&&since){qs.set("dataAlteracaoInicial",String(since).slice(0,10));qs.set("dataAlteracaoFinal",started.toISOString().slice(0,10))}const j=await db.from("erp_sync_jobs").insert({provider:"bling",entity_type:"product",operation:bootstrap?"reconcile":"incremental",direction:"bling_to_croma",status:"running",started_at:started.toISOString(),request_summary:{page,limit:PAGE,services:"manual",since:since||null}}).select("id").single();let ok=0,created=0,services=0,conflicts=0,errors=0;const failed:any[]=[];try{const items=(await api(t,`/produtos?${qs.toString()}`))?.data||[];for(const item of items){try{const full=(await api(t,`/produtos/${item.id}`))?.data;if(!full)throw new Error("Produto sem detalhe.");if(service(full)){services++;continue}const r=await inbound(full);if(r.conflict)conflicts++;else if(!r.dirty&&!r.review){ok++;if(r.created)created++}}catch(e){errors++;failed.push({id:item?.id,error:err(e)})}await sleep(300)}const parentsUpdated=await parentsFor(items.map((x:any)=>Number(x.id))),more=items.length===PAGE,now=new Date().toISOString(),nc={...cfg,products_auto_sync_enabled:true,products_auto_sync_services:false,products_auto_sync_interval_minutes:1440};if(bootstrap){nc.products_auto_bootstrap_active=more;nc.products_auto_bootstrap_page=more?page+1:1;if(!more)nc.products_auto_bootstrap_completed_at=now}else if(more){nc.products_auto_scan_page=page+1;nc.products_incremental_since=since}else{nc.products_auto_scan_page=1;nc.products_incremental_since=null;nc.products_auto_last_pull_at=started.toISOString()}await db.from("erp_connections").update({config:nc,last_sync_at:now,last_error:errors?`${errors} produto(s) com erro`:null,updated_at:now}).eq("id",c.id);c.config=nc;if(j.data?.id)await db.from("erp_sync_jobs").update({status:errors?"partial":"completed",processed_count:items.length,success_count:ok,error_count:errors,result_summary:{page,created,updated:ok-created,services_skipped:services,conflicts,errors,failed:failed.slice(0,20),has_more:more,next_page:more?page+1:1,parents_updated:parentsUpdated,since:since||null},finished_at:now}).eq("id",j.data.id);return{page,pulled:ok,created,services_skipped:services,conflicts,pull_errors:errors,has_more:more,next_page:more?page+1:1,parents_updated:parentsUpdated,since:since||null}}catch(e){if(j.data?.id)await db.from("erp_sync_jobs").update({status:"failed",error_count:1,error_message:err(e),finished_at:new Date().toISOString()}).eq("id",j.data.id);throw e}}
async function retryInboundReviews(t:string){
 const{data:states,error}=await db.from("erp_product_sync_state").select("product_id").eq("local_dirty",false).eq("outbound_state","structural_review").limit(5);
 if(error)throw error;let reconciled=0,pending=0,errors=0;
 for(const st of states||[]){
  const{data:p}=await db.from("products").select("bling_product_id,product_type").eq("id",st.product_id).maybeSingle();
  if(!p||p.product_type!=="produto"||!p.bling_product_id)continue;
  try{const remote=(await api(t,`/produtos/${p.bling_product_id}`))?.data;
   if(!remote){errors++;continue}
   const result=await inbound(remote);
   if(result.review)pending++;else if(!result.conflict&&!result.dirty)reconciled++;
  }catch(e){errors++;console.error("structural_reconcile_product",err(e))}
  await sleep(200);
 }
 return{reconciled,pending,errors};
}
async function automatic(t:string,c:any){const pushed=await pushPending(t),reviewRetry=await retryInboundReviews(t),cfg=c.config||{};if(cfg.products_auto_bootstrap_active)return{mode:"bootstrap",...pushed,review_retry:reviewRetry,...await pullPage(t,c,Number(cfg.products_auto_bootstrap_page||1),true)};const interval=Math.max(60,Number(cfg.products_auto_sync_interval_minutes||1440)),last=cfg.products_auto_last_pull_at?new Date(cfg.products_auto_last_pull_at).getTime():0;if(!cfg.products_incremental_since&&last&&Date.now()-last<interval*60000)return{mode:"push_only",...pushed,review_retry:reviewRetry,skipped_pull:true,next_pull_after:new Date(last+interval*60000).toISOString()};return{mode:"incremental",...pushed,review_retry:reviewRetry,...await pullPage(t,c,Number(cfg.products_auto_scan_page||1),false)}}
Deno.serve(async(req:Request)=>{if(req.method==="OPTIONS")return new Response("ok",{headers:cors(req)});if(req.method!=="POST")return json(req,{error:"Método não permitido."},405);try{const actor=await auth(req),input=await req.json().catch(()=>({})),action=String(input.action||"incremental_sync"),tk=await token();if(action==="full_sync"){if(!actor.cron&&actor.role!=="owner")return json(req,{error:"Apenas o proprietário pode iniciar sincronização completa."},403);const cfg={...(tk.c.config||{}),products_auto_sync_enabled:true,products_auto_sync_services:false,products_auto_bootstrap_active:true,products_auto_bootstrap_page:1,products_auto_bootstrap_started_at:new Date().toISOString(),products_auto_bootstrap_completed_at:null,products_auto_scan_page:1};await db.from("erp_connections").update({config:cfg,updated_at:new Date().toISOString()}).eq("id",tk.c.id);return json(req,{ok:true,...await automatic(tk.token,{...tk.c,config:cfg})})}if(action==="incremental_sync")return json(req,{ok:true,...await automatic(tk.token,tk.c)});if(action==="audit_structure"){
 const id=String(input.product_id||"");
 const{data:p,error:pe}=await db.from("products").select("*").eq("id",id).single();
 if(pe||!p||p.product_type!=="produto"||!p.bling_product_id)throw new Error("Produto vinculado ao Bling não encontrado.");
 const remote=(await api(tk.token,`/produtos/${p.bling_product_id}`))?.data;
 if(!remote)throw new Error("Produto não encontrado no Bling.");
 const local=await composition(p.id,remote);
 const localParent=p.parent_product_id?(await db.from("products").select("bling_product_id").eq("id",p.parent_product_id).single()).data?.bling_product_id:null;
 const structureMatches=formatOf(remote)===p.product_format&&Number(parentOf(remote)||0)===Number(localParent||0)&&
   sameComponents(local.components,remote?.estrutura?.componentes||[]);
 return json(req,{ok:true,read_only:true,product_id:p.id,bling_product_id:p.bling_product_id,
  format:{local:p.product_format,bling:formatOf(remote)},parent:{local_bling_id:localParent,bling_parent_id:parentOf(remote)},
  components:{local:local.components,bling:remote?.estrutura?.componentes||[]},structure_matches:structureMatches});
}
if(action==="push_product"){const id=String(input.product_id||"");const{data:p}=await db.from("products").select("*").eq("id",id).single();if(!p)throw new Error("Produto não encontrado.");if(p.product_type!=="produto")return json(req,{ok:false,skipped:true,reason:"service_manual"});return json(req,{ok:true,...await push(tk.token,p)})}if(action==="status"){const{count}=await db.from("products").select("id",{count:"exact",head:true}).eq("product_type","produto").not("bling_product_id","is",null);return json(req,{ok:true,linked_products:count||0,config:tk.c.config||{}})}return json(req,{error:"Ação inválida."},400)}catch(e){console.error("bling_product_auto_sync_error",e);return json(req,{error:"Não foi possível sincronizar os produtos.",detail:err(e)},500)}});