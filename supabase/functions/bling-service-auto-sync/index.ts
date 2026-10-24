import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
const db=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
const API="https://api.bling.com.br/Api/v3",PAGE=100;const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const txt=(v:any)=>{const s=String(v??'').trim();return s||null},num=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null},err=(e:any)=>e instanceof Error?e.message:typeof e==='string'?e:JSON.stringify(e);
function stable(v:any):any{if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){const o:any={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o}return v}async function hash(v:any){const b=new TextEncoder().encode(JSON.stringify(stable(v??null))),d=await crypto.subtle.digest('SHA-256',b);return[...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function secret(n:string){const{data,error}=await db.rpc('erp_read_secret',{p_name:n});if(error)throw error;return String(data||'')}async function store(n:string,v:string,d:string){const{error}=await db.rpc('erp_store_secret',{p_name:n,p_value:v,p_description:d});if(error)throw error}function tokenName(k:string,id:string){return`erp_bling_${k}_token_${id.replaceAll('-','')}`}
async function authorize(req:Request){const c=req.headers.get('x-croma-cron')||'';if(c){const ex=await secret('erp_bling_cron_secret');if(ex&&c===ex)return}const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'').trim();if(!token)throw new Error('Sessão ausente.');const{data,error}=await db.auth.getUser(token);if(error||!data.user)throw new Error('Sessão inválida.');const{data:p}=await db.from('profiles').select('role,ativo').eq('id',data.user.id).maybeSingle();if(!p?.ativo||!['owner','manager'].includes(p.role))throw new Error('Acesso restrito à gestão.')}
async function conn(){const{data,error}=await db.from('erp_connections').select('*').eq('provider','bling').single();if(error)throw error;return data}async function refresh(c:any,t:any){const cid=await secret('erp_bling_client_id'),cs=await secret('erp_bling_client_secret'),rt=await secret(t.refresh_token_secret_name);const r=await fetch(`${API}/oauth/token`,{method:'POST',headers:{Authorization:`Basic ${btoa(`${cid}:${cs}`)}`,'Content-Type':'application/x-www-form-urlencoded','enable-jwt':'1'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:rt})}),p=await r.json();if(!r.ok)throw new Error(p?.error_description||'Falha ao renovar token.');const an=tokenName('access',c.id),rn=tokenName('refresh',c.id);await Promise.all([store(an,String(p.access_token||''),'Access token OAuth do Bling'),store(rn,String(p.refresh_token||''),'Refresh token OAuth do Bling')]);await db.from('erp_private_tokens').update({access_token_secret_name:an,refresh_token_secret_name:rn,expires_at:new Date(Date.now()+Number(p.expires_in||3600)*1000).toISOString(),updated_at:new Date().toISOString()}).eq('connection_id',c.id);return String(p.access_token||'')}async function access(){const c=await conn(),{data:t,error}=await db.from('erp_private_tokens').select('*').eq('connection_id',c.id).single();if(error)throw error;if(c.status==='connected'&&new Date(t.expires_at).getTime()>Date.now()+90000){const a=await secret(t.access_token_secret_name);if(a)return{a,c}}return{a:await refresh(c,t),c}}
async function api(t:string,path:string,method='GET',body?:any){for(let i=0;i<4;i++){const r=await fetch(`${API}${path}`,{method,headers:{Authorization:`Bearer ${t}`,Accept:'application/json','Content-Type':'application/json','enable-jwt':'1'},body:body===undefined?undefined:JSON.stringify(body)});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{}}catch{throw new Error(`Resposta inválida do Bling (${r.status}).`)}if(r.ok)return p;if(r.status===429&&i<3){await sleep(1200*(i+1));continue}throw new Error(p?.error?.description||p?.error?.message||p?.message||`Bling respondeu ${r.status}.`)}throw new Error('Limite do Bling excedido.')}
async function composition(id:string,remote:any){const{data:rows,error}=await db.from('product_components').select('component_product_id,quantity,position,external_component_id').eq('parent_product_id',id).eq('active',true).eq('sync_to_bling',true).order('position',{ascending:true});if(error)throw error;const{data:settings,error:se}=await db.from('product_composition_settings').select('stock_type,stock_posting').eq('product_id',id).maybeSingle();if(se)throw se;const ids=[...new Set((rows||[]).map((r:any)=>r.component_product_id).filter(Boolean))];const byId=new Map<string,any>();if(ids.length){const{data:parts,error:pe}=await db.from('products').select('id,nome,sku,bling_product_id').in('id',ids);if(pe)throw pe;for(const p of parts||[])byId.set(p.id,p)}const components=[];for(const row of rows||[]){const part=byId.get(row.component_product_id);const external=Number(part?.bling_product_id||row.external_component_id||0);if(!external)throw new Error(`Componente ${part?.nome||row.component_product_id} ainda não possui vínculo com o Bling.`);components.push({produto:{id:external},quantidade:Number(row.quantity)})}return{has:components.length>0,components,stockType:settings?.stock_type??remote?.estrutura?.tipoEstoque??null,stockPosting:settings?.stock_posting??remote?.estrutura?.lancamentoEstoque??null}}
async function media(pid:string,ext:any,name:string){const u=txt(ext.imagemURL);if(!u)return;const{data:e}=await db.from('product_media').select('id').eq('product_id',pid).eq('url',u).limit(1);if(e?.length)return;const{count}=await db.from('product_media').select('id',{count:'exact',head:true}).eq('product_id',pid).eq('ativo',true).eq('kind','image');await db.from('product_media').insert({product_id:pid,kind:'image',url:u,alt_text:name,is_primary:(count||0)===0,ordem:count||0,ativo:true})}

// Regras gerais para preservar hierarquia e composições de qualquer cadastro Bling.
function formatOf(x:any){const v=String(x?.formato??"").toUpperCase();if(v==="S")return"simple";if(v==="V")return"variation";if(v==="E")return"composition";throw new Error("Formato Bling desconhecido: revisão necessária.");}
function parentOf(x:any){const n=Number(x?.variacao?.produtoPai?.id??x?.produtoPai?.id??x?.idProdutoPai??0);return Number.isFinite(n)&&n>0?n:null}
function shapeOf(x:any){const e=x?.estrutura||{};return JSON.stringify(stable({formato:formatOf(x),pai:parentOf(x),variacao:x?.variacao?.nome??null,componentes:(e.componentes||[]).map((c:any)=>({id:Number(c?.produto?.id||0),quantidade:Number(c?.quantidade||0)})),tipoEstoque:e.tipoEstoque??null,lancamentoEstoque:e.lancamentoEstoque??null}))}
function structuralDirty(fields:any){return Array.isArray(fields)&&fields.some((x:any)=>/^(estrutura|compos|component|product_format|parent_product_id|bling_parent_id|variac|stock_type|stock_posting)/i.test(String(x)))}
async function reviewStructure(id:string,message:string,remoteChanged=false){const{error}=await db.from('erp_product_sync_state').upsert({product_id:id,sync_policy:'auto_bidirectional',outbound_state:'structural_review',remote_change_detected:remoteChanged,last_error:message,updated_at:new Date().toISOString()},{onConflict:'product_id'});if(error)throw error}
async function compositionMatches(id:string,ext:any){
 const remote=(ext?.estrutura?.componentes||[]).map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((a:any,b:any)=>a.id-b.id);
 const local=(await composition(id,ext)).components.map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((a:any,b:any)=>a.id-b.id);
 return JSON.stringify(remote)===JSON.stringify(local);
}

async function missingComponents(ext:any):Promise<number[]>{
 if(formatOf(ext)!=='composition')return[];
 const rows=ext?.estrutura?.componentes;
 if(!Array.isArray(rows))throw new Error('Estrutura Bling sem lista de componentes.');
 const ids=rows.map((x:any)=>Number(x?.produto?.id||0));
 if(ids.some((x:number)=>!Number.isSafeInteger(x)||x<=0)||new Set(ids).size!==ids.length||
    rows.some((x:any)=>!Number.isFinite(Number(x?.quantidade))||Number(x.quantidade)<=0))throw new Error('Composição Bling inválida.');
 if(!ids.length)return[];
 const{data,error}=await db.from('products').select('bling_product_id').in('bling_product_id',ids);
 if(error)throw error;
 const found=new Set((data||[]).map((x:any)=>Number(x.bling_product_id)));
 return ids.filter((id:number)=>!found.has(id));
}
async function structurePayload(p:any,remote:any){
 const fmt=String(p.product_format||'simple'),map:any={simple:'S',variation:'V',composition:'E'};
 if(!map[fmt])throw new Error('Formato local desconhecido.');
 const out:any={formato:map[fmt],parentId:null,variation:p.metadata?.bling_variation??null};
 if(fmt==='composition'){
  const c=await composition(p.id,remote||{});
  if(!c.components.length)throw new Error('Composição sem insumos vinculados.');
  const ids=c.components.map((v:any)=>Number(v.produto.id));
  if(new Set(ids).size!==ids.length||c.components.some((v:any)=>Number(v.quantidade)<=0))throw new Error('Composição duplicada ou inválida.');
  out.estrutura={...(remote?.estrutura||{}),componentes:c.components};
  if(c.stockType)out.estrutura.tipoEstoque=c.stockType;
  if(c.stockPosting!==null)out.estrutura.lancamentoEstoque=c.stockPosting;
 }
 if(p.parent_product_id){
  const{data:parent,error}=await db.from('products').select('bling_product_id').eq('id',p.parent_product_id).single();
  if(error)throw error;
  out.parentId=Number(parent?.bling_product_id||0);
  if(!out.parentId||out.parentId===Number(p.bling_product_id))throw new Error('Pai sem vínculo válido no Bling.');
 }else if(parentOf(remote))throw new Error('Desvinculação de variação exige revisão.');
 if(out.variation!==null&&(typeof out.variation!=='object'||Array.isArray(out.variation)))throw new Error('Metadados da variação inválidos.');
 if(out.variation?.nome!==undefined&&typeof out.variation.nome!=='string')throw new Error('Nome da variação inválido.');
 if(out.variation?.ordem!==undefined&&(!Number.isSafeInteger(Number(out.variation.ordem))||Number(out.variation.ordem)<0))throw new Error('Ordem da variação inválida.');
 return out;
}
function applyStructure(x:any,remote:any,d:any){
 x.formato=d.formato;
 if(d.formato==='E')x.estrutura=d.estrutura;else delete x.estrutura;
 if(d.parentId!==null)x.variacao={...(remote?.variacao||{}),produtoPai:{...(remote?.variacao?.produtoPai||{}),id:d.parentId}};
 if(d.variation){
  x.variacao={...(x.variacao||remote?.variacao||{})};if(d.variation.nome!==undefined)x.variacao.nome=d.variation.nome;if(d.variation.ordem!==undefined)x.variacao.ordem=Number(d.variation.ordem);
  if(d.parentId!==null)x.variacao.produtoPai={...(x.variacao?.produtoPai||{}),id:d.parentId};
 }
}
function sameComponents(a:any[],b:any[]){
 const norm=(arr:any[])=>arr.map((c:any)=>({id:Number(c?.produto?.id||0),quantity:Number(c?.quantidade||0)})).sort((x:any,y:any)=>x.id-y.id);
 return JSON.stringify(norm(a||[]))===JSON.stringify(norm(b||[]));
}
function verifyStructure(fresh:any,d:any){
 if(formatOf(fresh)!==({S:'simple',V:'variation',E:'composition'} as any)[d.formato])throw new Error('Bling não confirmou formato.');
 if(Number(parentOf(fresh)||0)!==Number(d.parentId||0))throw new Error('Bling não confirmou vínculo pai/filho.');
 if(d.formato==='E'&&!sameComponents(fresh?.estrutura?.componentes||[],d.estrutura.componentes))throw new Error('Bling não confirmou insumos e quantidades.');
 if(d.formato==='E'&&d.estrutura?.tipoEstoque&&String(fresh?.estrutura?.tipoEstoque||'')!==String(d.estrutura.tipoEstoque))throw new Error('Bling não confirmou tipo de estoque.');
 if(d.formato==='E'&&d.estrutura?.lancamentoEstoque&&String(fresh?.estrutura?.lancamentoEstoque||'')!==String(d.estrutura.lancamentoEstoque))throw new Error('Bling não confirmou lançamento de estoque.');
 if(d.variation?.nome!==undefined&&String(fresh?.variacao?.nome||'')!==d.variation.nome)throw new Error('Bling não confirmou nome da variação.');
 if(d.variation?.ordem!==undefined&&Number(fresh?.variacao?.ordem)!==Number(d.variation.ordem))throw new Error('Bling não confirmou ordem da variação.');
}
async function localParentOf(ext:any){const pid=parentOf(ext);if(!pid)return null;const{data,error}=await db.from('products').select('id').eq('bling_product_id',pid).maybeSingle();if(error)throw error;return data?.id??null}

async function syncIn(ext:any){
 if(String(ext?.tipo||'').toUpperCase()!=='S')return{skip:true};
 const fmt=formatOf(ext),now=new Date().toISOString(),eid=Number(ext.id),code=txt(ext.codigo)||`BLING-S-${ext.id}`;
 let{data:p,error:findError}=await db.from('products').select('*').eq('bling_product_id',eid).maybeSingle();if(findError)throw findError;
 const{data:st}=p?await db.from('erp_product_sync_state').select('*').eq('product_id',p.id).maybeSingle():{data:null};
 const rh=await hash(ext);
 if(p&&st?.local_dirty){
  if(st.baseline_hash&&st.baseline_hash!==rh){
   await db.from('erp_product_sync_state').update({remote_change_detected:true,outbound_state:'conflict',last_error:'Alterado nos dois lados antes da sincronização.',updated_at:now}).eq('product_id',p.id);return{conflict:true}
  }
  return{dirty:true};
 }
 const missing=await missingComponents(ext);
 if(missing.length){
  if(p)await reviewStructure(p.id,`Insumos do Bling sem cadastro local: ${missing.join(', ')}`,true);
  return{review:true,missing};
 }
 const parent=parentOf(ext),localParent=(await localParentOf(ext))??(Number(p?.bling_parent_id||0)===Number(parent||0)?p?.parent_product_id??null:null);
 const payload:any={nome:txt(ext.nome)||p?.nome||`Serviço Bling ${eid}`,descricao:txt(ext.descricaoCurta)||p?.descricao||null,
  unidade:'serv',preco:Math.max(0,num(ext.preco)||0),ativo:String(ext.situacao||'A').toUpperCase()!=='I',
  product_type:'servico',product_format:fmt,bling_parent_id:parent,parent_product_id:localParent,
  bling_sku:code,bling_sync_status:'sincronizado',bling_last_synced_at:now,bling_sync_error:null,
  metadata:{...(p?.metadata||{}),bling_raw:ext,bling_seen_at:now}};
 const created=!p;
 if(!p){
  let sku=code;const{data:dup}=await db.from('products').select('id').eq('sku',sku).limit(1);
  if(dup?.length)sku=`BLING-S-${eid}`;
  const{data:newp,error}=await db.from('products').insert({...payload,sku,slug:`bling-servico-${eid}`,catalog_category_id:null,
    bling_product_id:eid,published_on_site:false}).select('*').single();if(error)throw error;p=newp;
 }else{
  const{data:up,error}=await db.from('products').update({...payload,catalog_category_id:p.catalog_category_id??null}).eq('id',p.id).select('*').single();if(error)throw error;p=up;
 }
 await media(p.id,ext,p.nome);
 const map=await db.from('erp_entity_mappings').upsert({provider:'bling',entity_type:'product',local_id:p.id,external_id:String(eid),
  sync_status:'synced',last_synced_at:now,updated_at:now,metadata:{codigo:code,nome:p.nome,tipo:'servico'}},{onConflict:'provider,entity_type,external_id'});if(map.error)throw map.error;
 const review=Boolean(parent&&!localParent)||(fmt==='composition'&&!(await compositionMatches(p.id,ext)));
 const saved=await db.from('erp_product_sync_state').upsert({product_id:p.id,sync_policy:'auto_bidirectional',baseline_payload:ext,baseline_hash:rh,
  last_inbound_at:now,last_remote_check_at:now,local_dirty:false,dirty_fields:[],remote_change_detected:review,
  outbound_state:review?'structural_review':'clean',last_error:review?'Vínculo pai ou composição ainda não reconciliado.':null,updated_at:now},{onConflict:'product_id'});
 if(saved.error)throw saved.error;
 return{ok:!review,review,created};
}

function outbound(p:any,remote:any,structure:any,dirty:string[]=[]){
 const x=structuredClone(remote||{});
 for(const k of ['id','dataCriacao','dataAlteracao','loja'])delete x[k];
 x.nome=p.nome;x.codigo=p.bling_sku||p.sku;x.preco=Number(p.preco||0);
 const unit=String(p.unidade||'').trim().toUpperCase();
 x.unidade=unit&&unit!=='SERV'?unit:(remote?.unidade||'UN');
 x.situacao=p.ativo?'A':'I';x.tipo='S';
 if(p.short_description!==null)x.descricaoCurta=p.short_description;
 if(p.complementary_description!==null)x.descricaoComplementar=p.complementary_description;
 if(p.notes!==null)x.observacoes=p.notes;
 return x;
}

async function pushDirty(t:string){
 const{data:states,error:se}=await db.from('erp_product_sync_state').select('product_id').eq('local_dirty',true).in('outbound_state',['pending','review_required','error','structural_review']).limit(10);if(se)throw se;
 let pushed=0,conflicts=0,errors=0,reviewed=0;
 for(const st of states||[]){
  const{data:p}=await db.from('products').select('*').eq('id',st.product_id).eq('product_type','servico').maybeSingle();
  if(!p)continue;
  try{
   let remote:any=null;
   if(p.bling_product_id)remote=(await api(t,`/produtos/${p.bling_product_id}`))?.data||null;
   const{data:ss}=await db.from('erp_product_sync_state').select('*').eq('product_id',p.id).single();
   if(remote&&ss?.baseline_hash&&await hash(remote)!==ss.baseline_hash){
    await db.from('erp_product_sync_state').update({remote_change_detected:true,outbound_state:'conflict',
      last_error:'O Bling mudou antes do envio.',updated_at:new Date().toISOString()}).eq('product_id',p.id);
    conflicts++;continue;
   }
   const desired=await structurePayload(p,remote||{});
   const proposed=outbound(p,remote||{},null,ss?.dirty_fields||[]);
   applyStructure(proposed,remote||{},desired);
   let eid=p.bling_product_id;
   if(eid)await api(t,`/produtos/${eid}`,'PUT',proposed);
   else{const rr=await api(t,'/produtos','POST',proposed);eid=rr?.data?.id||rr?.id;if(!eid)throw new Error('Bling não retornou ID.')}
   await sleep(250);
   const fresh=(await api(t,`/produtos/${eid}`))?.data;if(!fresh)throw new Error('Bling não retornou produto após gravação.');
   verifyStructure(fresh,desired);
   const now=new Date().toISOString();
   const up=await db.from('products').update({bling_product_id:Number(eid),bling_sku:txt(fresh?.codigo)||p.sku,
    product_format:formatOf(fresh),bling_parent_id:parentOf(fresh),bling_sync_status:'sincronizado',bling_last_synced_at:now,bling_sync_error:null,
    metadata:{...(p.metadata||{}),bling_raw:fresh,bling_outbound_applied_at:now}}).eq('id',p.id);if(up.error)throw up.error;
   await media(p.id,fresh,p.nome);
   const map=await db.from('erp_entity_mappings').upsert({provider:'bling',entity_type:'product',local_id:p.id,external_id:String(eid),
    sync_status:'synced',last_synced_at:now,updated_at:now,metadata:{codigo:fresh.codigo||null,nome:fresh.nome||null,tipo:'servico'}},{onConflict:'provider,entity_type,external_id'});if(map.error)throw map.error;
   const save=await db.from('erp_product_sync_state').upsert({product_id:p.id,sync_policy:'auto_bidirectional',baseline_payload:fresh,
    baseline_hash:await hash(fresh),last_inbound_at:now,last_outbound_at:now,last_remote_check_at:now,local_dirty:false,dirty_fields:[],
    remote_change_detected:false,outbound_state:'clean',last_error:null,updated_at:now},{onConflict:'product_id'});if(save.error)throw save.error;
   pushed++;
  }catch(e){
   const message=err(e),structural=/composi|insumo|vincul|pai|variaç|estrutura|formato/i.test(message);
   if(structural){reviewed++;await reviewStructure(p.id,message)}
   else{errors++;await db.from('erp_product_sync_state').update({outbound_state:'error',last_error:message,updated_at:new Date().toISOString()}).eq('product_id',p.id)}
  }
 }
 return{pushed,conflicts,errors,reviewed};
}
async function retryInboundReviews(t:string){
 const{data:states,error}=await db.from('erp_product_sync_state').select('product_id').eq('local_dirty',false).eq('outbound_state','structural_review').limit(5);
 if(error)throw error;let reconciled=0,pending=0,errors=0;
 for(const st of states||[]){
  const{data:p}=await db.from('products').select('bling_product_id,product_type').eq('id',st.product_id).maybeSingle();
  if(!p||p.product_type!=='servico'||!p.bling_product_id)continue;
  try{const remote=(await api(t,`/produtos/${p.bling_product_id}`))?.data;
   if(!remote){errors++;continue}
   const result=await syncIn(remote);
   if(result.review)pending++;else if(result.ok)reconciled++;
  }catch(e){errors++;console.error('structural_reconcile_service',err(e))}
  await sleep(200);
 }
 return{reconciled,pending,errors};
}
async function busy(){const cut=new Date(Date.now()-180000).toISOString();await db.from('erp_sync_jobs').update({status:'failed',error_message:'Execução excedeu o tempo limite.',finished_at:new Date().toISOString()}).eq('provider','bling').eq('entity_type','service').eq('status','running').lt('started_at',cut);const{data}=await db.from('erp_sync_jobs').select('id').eq('provider','bling').eq('entity_type','service').eq('status','running').gte('started_at',cut).limit(1);return Boolean(data?.length)}
async function reconcileServiceParents(ids:number[]){
 const unique=[...new Set(ids.filter((id:number)=>Number.isSafeInteger(id)&&id>0))];if(!unique.length)return 0;
 const{data:children,error}=await db.from('products').select('id,bling_parent_id,parent_product_id').eq('product_type','servico')
  .in('bling_product_id',unique).not('bling_parent_id','is',null);if(error)throw error;
 const parentIds=[...new Set((children||[]).map((x:any)=>Number(x.bling_parent_id)).filter((x:number)=>x>0))];
 if(!parentIds.length)return 0;
 const{data:parents,error:pe}=await db.from('products').select('id,bling_product_id').in('bling_product_id',parentIds);if(pe)throw pe;
 const map=new Map((parents||[]).map((x:any)=>[Number(x.bling_product_id),x.id]));let updated=0;
 for(const child of children||[]){const pid=map.get(Number(child.bling_parent_id));if(pid&&pid!==child.parent_product_id){
  const{error:e}=await db.from('products').update({parent_product_id:pid}).eq('id',child.id);if(e)throw e;updated++;
 }}
 return updated;
}
async function pull(t:string,c:any){const cfg=c.config||{},page=Math.max(1,Number(cfg.services_auto_scan_page||1)),started=new Date(),since=cfg.services_incremental_since||cfg.services_auto_last_pull_at||new Date(Date.now()-24*60*60*1000).toISOString(),qs=new URLSearchParams({pagina:String(page),limite:String(PAGE),tipo:"S",dataAlteracaoInicial:String(since).slice(0,10),dataAlteracaoFinal:started.toISOString().slice(0,10)}),{data:j}=await db.from('erp_sync_jobs').insert({provider:'bling',entity_type:'service',operation:'incremental',direction:'bling_to_croma',status:'running',started_at:started.toISOString(),request_summary:{page,limit:PAGE,since}}).select('id').single();let synced=0,errors=0,services=0;const failed:any[]=[];try{const items=(await api(t,`/produtos?${qs.toString()}`))?.data||[];for(const x of items){if(String(x?.tipo||'').toUpperCase()!=='S')continue;services++;try{const full=(await api(t,`/produtos/${x.id}`))?.data;if(full){const r=await syncIn(full);if(r.ok)synced++}}catch(e){errors++;failed.push({id:x.id,error:err(e)})}await sleep(250)}const parentsUpdated=await reconcileServiceParents(items.map((x:any)=>Number(x.id))),more=items.length===PAGE,next=more?page+1:1,now=new Date().toISOString(),nc={...cfg,services_auto_sync_enabled:true,services_auto_scan_page:next,services_auto_sync_interval_minutes:1440};if(more)nc.services_incremental_since=since;else{nc.services_incremental_since=null;nc.services_auto_last_pull_at=started.toISOString();nc.services_auto_full_cycle_at=now}await db.from('erp_connections').update({config:nc,updated_at:now}).eq('id',c.id);c.config=nc;await db.from('erp_sync_jobs').update({status:errors?'partial':'completed',processed_count:services,success_count:synced,error_count:errors,result_summary:{page,services,synced,errors,parents_updated:parentsUpdated,failed:failed.slice(0,20),next_page:next,has_more:more,since},finished_at:now}).eq('id',j.id);return{page,services,synced,errors,next_page:next,has_more:more,since}}catch(e){await db.from('erp_sync_jobs').update({status:'failed',error_count:1,error_message:err(e),finished_at:new Date().toISOString()}).eq('id',j.id);throw e}}
const origins=new Set(['https://www.cromapel.com.br','https://cromapel.com.br']);function cors(req:Request){const o=req.headers.get('Origin')||'';return{'Access-Control-Allow-Origin':origins.has(o)?o:'https://cromapel.com.br','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-croma-cron','Access-Control-Allow-Methods':'POST, OPTIONS',Vary:'Origin'}}function json(req:Request,d:any,s=200){return new Response(JSON.stringify(d),{status:s,headers:{...cors(req),'Content-Type':'application/json'}})}
Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});try{await authorize(req);
 const input=await req.json().catch(()=>({}));
 if(input.action==='audit_structure'){
  const id=String(input.product_id||'');
  const{data:p,error:pe}=await db.from('products').select('*').eq('id',id).single();
  if(pe||!p||p.product_type!=='servico'||!p.bling_product_id)throw new Error('Serviço vinculado ao Bling não encontrado.');
  const{a}=await access(),remote=(await api(a,`/produtos/${p.bling_product_id}`))?.data;
  if(!remote)throw new Error('Serviço não encontrado no Bling.');
  const local=await composition(p.id,remote);
  const localParent=p.parent_product_id?(await db.from('products').select('bling_product_id').eq('id',p.parent_product_id).single()).data?.bling_product_id:null;
  const matches=formatOf(remote)===p.product_format&&Number(parentOf(remote)||0)===Number(localParent||0)&&sameComponents(local.components,remote?.estrutura?.componentes||[]);
  return json(req,{ok:true,read_only:true,product_id:p.id,bling_product_id:p.bling_product_id,
   format:{local:p.product_format,bling:formatOf(remote)},parent:{local_bling_id:localParent,bling_parent_id:parentOf(remote)},
   components:{local:local.components,bling:remote?.estrutura?.componentes||[]},structure_matches:matches});
 }
if(await busy())return json(req,{ok:true,skipped:true,reason:'sync_running'});const{a,c}=await access(),pushed=await pushDirty(a),reviewRetry=await retryInboundReviews(a),cfg=c.config||{},interval=Math.max(60,Number(cfg.services_auto_sync_interval_minutes||1440)),last=cfg.services_auto_last_pull_at?new Date(cfg.services_auto_last_pull_at).getTime():0;if(!cfg.services_incremental_since&&last&&Date.now()-last<interval*60000)return json(req,{ok:true,mode:'push_only',...pushed,review_retry:reviewRetry,skipped_pull:true,next_pull_after:new Date(last+interval*60000).toISOString()});const pulled=await pull(a,c);return json(req,{ok:true,mode:'incremental',...pushed,review_retry:reviewRetry,...pulled})}catch(e){return json(req,{ok:false,error:'Falha na sincronização automática de serviços.',detail:err(e)},500)}});
