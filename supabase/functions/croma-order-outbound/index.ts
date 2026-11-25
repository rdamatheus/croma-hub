
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SB=Deno.env.get("SUPABASE_URL")!, SK=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db=createClient(SB,SK,{auth:{persistSession:false}});
const API="https://api.bling.com.br/Api/v3";
const OUTBOUND_KEY=Deno.env.get("CROMA_OUTBOUND_KEY")||"";
const txt=(v:any)=>{const s=String(v??"").trim();return s||null};
const digits=(v:any)=>String(v??"").replace(/\D/g,"");
const round=(v:any,p=2)=>{const n=Number(v),f=10**p;return Number.isFinite(n)?Math.round(n*f)/f:0};

async function readSecret(name:string){const{data,error}=await db.rpc("erp_read_secret",{p_name:name});if(error)throw error;return String(data||"")}
async function writeSecret(name:string,value:string,description:string){const{error}=await db.rpc("erp_store_secret",{p_name:name,p_value:value,p_description:description});if(error)throw error}
const tokenName=(kind:string,id:string)=>`erp_bling_${kind}_token_${id.replaceAll("-","")}`;
async function connection(){const{data,error}=await db.from("erp_connections").select("*").eq("provider","bling").single();if(error)throw error;return data}
async function refresh(c:any,t:any){const[cid,cs,rt]=await Promise.all([readSecret("erp_bling_client_id"),readSecret("erp_bling_client_secret"),readSecret(t.refresh_token_secret_name)]);const r=await fetch(API+"/oauth/token",{method:"POST",headers:{Authorization:"Basic "+btoa(cid+":"+cs),"Content-Type":"application/x-www-form-urlencoded","enable-jwt":"1"},body:new URLSearchParams({grant_type:"refresh_token",refresh_token:rt})});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{}}catch{}if(!r.ok)throw new Error(p?.error?.description||p?.error_description||"Falha ao renovar token do Bling.");const an=tokenName("access",c.id),rn=tokenName("refresh",c.id);await Promise.all([writeSecret(an,String(p.access_token||""),"Access token OAuth do Bling"),writeSecret(rn,String(p.refresh_token||""),"Refresh token OAuth do Bling")]);await db.from("erp_private_tokens").update({access_token_secret_name:an,refresh_token_secret_name:rn,expires_at:new Date(Date.now()+Math.max(60,Number(p.expires_in||3600))*1000).toISOString(),updated_at:new Date().toISOString()}).eq("connection_id",c.id);await db.from("erp_connections").update({status:"connected",last_error:null,updated_at:new Date().toISOString()}).eq("id",c.id);return String(p.access_token||"")}
async function token(){const c=await connection();const{data:t,error}=await db.from("erp_private_tokens").select("*").eq("connection_id",c.id).single();if(error||!t)throw new Error("Bling sem token válido.");if(c.status==="connected"&&new Date(t.expires_at).getTime()>Date.now()+90000){const a=await readSecret(t.access_token_secret_name);if(a)return a}return await refresh(c,t)}
async function api(path:string,method="GET",body:any=null,query:Record<string,string>={}){const u=new URL(API+path);for(const[k,v]of Object.entries(query))if(v)u.searchParams.set(k,v);const r=await fetch(u,{method,headers:{Authorization:"Bearer "+await token(),Accept:"application/json","Content-Type":"application/json","enable-jwt":"1"},body:body&&method!=="GET"?JSON.stringify(body):undefined});const raw=await r.text();let p:any={};try{p=raw?JSON.parse(raw):{}}catch{p={raw}}if(!r.ok)throw new Error(p?.error?.description||p?.error?.message||p?.message||`Bling respondeu ${r.status}`);return p?.data??p}

async function load(orderId:string){
  const {data:o,error}=await db.from("orders").select("*").eq("id",orderId).single();if(error||!o)throw new Error("Pedido local não encontrado.");
  const [{data:c,error:ce},{data:a,error:ae},{data:items,error:ie},{data:m,error:me}]=await Promise.all([
    db.from("customer_profiles").select("*").eq("id",o.customer_id).single(),
    db.from("customer_addresses").select("*").eq("customer_id",o.customer_id).order("principal",{ascending:false}).limit(1).maybeSingle(),
    db.from("order_items").select("*,products(bling_product_id,sku,nome)").eq("order_id",orderId).order("created_at"),
    db.from("erp_entity_mappings").select("*").eq("provider","bling").eq("entity_type","order").eq("local_id",orderId).maybeSingle()
  ]);
  if(ce||!c)throw new Error("Cliente local não encontrado.");if(ae)throw ae;if(ie)throw ie;if(me)throw me;if(!items?.length)throw new Error("Pedido sem itens.");
  return {o,c,a,items,m};
}
function contactBody(c:any,a:any){
  const body:any={nome:c.nome,tipo:c.tipo_pessoa||((digits(c.cpf).length===14)?"J":"F"),situacao:c.ativo===false?"I":"A",numeroDocumento:digits(c.cpf),telefone:digits(c.telefone),celular:digits(c.celular),email:c.email||"",emailNotaFiscal:c.email_nota_fiscal||"",indicadorIe:Number(c.indicador_ie||9)};
  if(a)body.endereco={geral:{endereco:a.logradouro||"",cep:digits(a.cep),bairro:a.bairro||"",municipio:a.cidade||"",uf:a.estado||"",numero:a.numero||"",complemento:a.complemento||""}};
  return body;
}
async function ensureContact(c:any,a:any){
  let id=Number(c.bling_contact_id||0);
  if(id>0){await api("/contatos/"+id,"PUT",contactBody(c,a));const full=await api("/contatos/"+id);await db.from("customer_profiles").update({bling_raw:full,bling_last_synced_at:new Date().toISOString(),bling_sync_status:"sincronizado",bling_sync_error:null,sync_source:"bling"}).eq("id",c.id);return id}
  const created=await api("/contatos","POST",contactBody(c,a));id=Number(created?.id||0);if(!(id>0))throw new Error("Bling não retornou ID do contato.");const full=await api("/contatos/"+id);await db.from("customer_profiles").update({bling_contact_id:id,bling_raw:full,bling_last_synced_at:new Date().toISOString(),bling_sync_status:"sincronizado",bling_sync_error:null,sync_source:"bling"}).eq("id",c.id);return id;
}
function orderBody(ctx:any,contactId:number){
  const subtotal=round(ctx.o.subtotal), total=round(ctx.o.total), discount=Math.max(0,round(subtotal-total));
  const itens=ctx.items.map((i:any)=>{
    const bp=Number(i.products?.bling_product_id||0);
    if(!(bp>0))throw new Error("Item sem produto vinculado ao Bling: "+i.product_name);
    return {produto:{id:bp},unidade:"UN",quantidade:Number(i.quantity),desconto:0,valor:round(i.unit_price,6),descricaoDetalhada:txt(i.options?.descricao_detalhada)||i.product_name};
  });
  return {
    data:new Date().toISOString().slice(0,10),
    contato:{id:contactId},
    itens,
    desconto:{valor:discount,unidade:"REAL"},
    outrasDespesas:round(ctx.o.delivery_fee||0),
    observacoes:ctx.o.notes||"",
    observacoesInternas:`CROMA_ORDER_ID=${ctx.o.id}; CROMA_ORDER_CODE=${ctx.o.order_code}`
  };
}
const canonical = (s:string) => s.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();

async function receiptForms() {
  const forms = [];
  for (let page = 1; ; page++) {
    const rows = await api("/formas-pagamentos", "GET", null, {situacao:"1", pagina:String(page), limite:"100"});
    if (!Array.isArray(rows)) throw new Error("Resposta inválida na consulta de formas de pagamento.");
    forms.push(...rows.filter(f => Number(f.situacao) === 1 && [2,3].includes(Number(f.finalidade)) && Number(f.id)>0 && f.descricao));
    if (rows.length < 100) return forms;
  }
}

async function sendReceivable(ctx:any, saleDate?:string) {
  const o = ctx.o;
  if (o.status !== "aguardando_pagamento" || !o.payment_due_date) throw new Error("Confira a situação a receber e o vencimento no pedido.");
  const contactId = Number(ctx.c.bling_contact_id);
  if (!(contactId > 0) || ctx.c.bling_sync_status !== "sincronizado") throw new Error("Cliente sem vínculo confirmado com o Bling.");
  const forms = await receiptForms();
  const matching = forms.filter(f => o.payment_method === "crediario"
    ? canonical(f.descricao) === "crediario" : "bling:"+f.id === o.payment_method);
  if (matching.length !== 1) throw new Error("Forma de recebimento ativa ausente ou ambígua no Bling.");
  const formId = Number(matching[0].id);
  const body:any = orderBody(ctx,contactId);
  body.data = saleDate || new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(o.created_at));
  body.numeroLoja = o.order_code;
  body.parcelas = [{dataVencimento:o.payment_due_date,valor:round(o.total),formaPagamento:{id:formId}}];
  let ext = Number(ctx.m?.external_id || String(o.checkout_reference || "").match(/^bling:(\d+)$/)?.[1]);
  if (!ext) {
    
    const existing = await api("/pedidos/vendas","GET",null,{"numerosLojas[]":o.order_code,idContato:String(contactId)});
    if (!Array.isArray(existing)) throw new Error("Falha ao conferir duplicidade no Bling.");
    const matches = existing.filter((r:any)=>String(r.numeroLoja)===o.order_code && Number(r.contato?.id)===contactId);
    if (matches.length>1) throw new Error("Mais de um pedido no Bling com esta referência.");
    ext = Number(matches[0]?.id);
    if (!ext) {
      if (o.checkout_reference) throw new Error("Envio pendente de conferência no Bling.");
      // Evita também duplicatas lançadas manualmente no ERP, sem referência Croma.
      const shift=(n:number)=>{const d=new Date(body.data+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
      for(let page=1;page<=20;page++){
        const rows=await api("/pedidos/vendas","GET",null,{idContato:String(contactId),dataInicial:shift(-1),dataFinal:shift(1),pagina:String(page),limite:"100"});
        if(!Array.isArray(rows))throw new Error("Falha ao conferir duplicidade.");
        if(rows.some((r:any)=>Number(r.contato?.id)===contactId&&round(r.total)===round(o.total)))throw new Error("Existe venda de mesmo valor para este contato em data próxima; conferir antes de enviar.");
        if(rows.length<100)break;
        if(page===20)throw new Error("Consulta de duplicidade incompleta.");
      }
      const {data:claim,error} = await db.from("orders").update({checkout_reference:"bling-pendente:"+o.id}).eq("id",o.id).eq("status","aguardando_pagamento").is("checkout_reference",null).select("id").maybeSingle();
      if (error || !claim) throw new Error("Pedido já em envio ou alterado. Recarregue os detalhes.");
      const result = await api("/pedidos/vendas","POST",body);
      ext = Number(result?.id);
      if (!ext) throw new Error("Envio em conferência: Bling não retornou o ID.");
    }
    const {error} = await db.from("orders").update({checkout_reference:"bling:"+ext}).eq("id",o.id);
    if (error) throw error;
  }
  const remote = await api("/pedidos/vendas/"+ext);
  const parcel = remote?.parcelas?.[0];
  const expectedItems=body.itens.map((i:any)=>[Number(i.produto.id),Number(i.quantidade),round(i.valor,6)].join(":")).sort();
  const actualItems=(Array.isArray(remote?.itens)?remote.itens:[]).map((i:any)=>[Number(i.produto?.id),Number(i.quantidade),round(i.valor,6)].join(":")).sort();
  if (!remote?.numero || String(remote.numeroLoja)!==o.order_code || Number(remote.contato?.id)!==contactId || round(remote.total)!==round(o.total)
    || JSON.stringify(expectedItems)!==JSON.stringify(actualItems) || remote.parcelas?.length!==1
    || Number(parcel?.formaPagamento?.id)!==formId || parcel.dataVencimento!==o.payment_due_date || round(parcel.valor)!==round(o.total)) {
    throw new Error("Pedido localizado no Bling. Confira cliente, itens, total, forma e vencimento antes de prosseguir.");
  }
  const mapping = {provider:"bling",entity_type:"order",local_id:o.id,external_id:String(ext),sync_status:"synced",last_synced_at:new Date().toISOString(),metadata:{...ctx.m?.metadata,remote_order_number:remote.numero,remote_validated:true,remote_total:round(remote.total),payment_form_id:formId,due_date:o.payment_due_date,commercial_payment_status:"receivable",financial_status:ctx.m?.metadata?.financial_status||"pending_verification"}};
  const {data:linked,error:le}=await db.from("erp_entity_mappings").select("id,local_id").eq("provider","bling").eq("entity_type","order").eq("external_id",String(ext)).maybeSingle();
  if(le)throw le;
  if(linked&&linked.local_id!==o.id)throw new Error("Pedido Bling já vinculado a outro pedido local.");
  const saved=linked?await db.from("erp_entity_mappings").update(mapping).eq("id",linked.id).eq("local_id",o.id).select("id").single():await db.from("erp_entity_mappings").insert(mapping).select("id").single();
  if(saved.error||!saved.data)throw new Error("Vínculo não confirmado; não reenviar.");
  return {external_id:ext,number:remote.numero,item_count:remote.itens.length,total:round(remote.total),financial_status:mapping.metadata.financial_status};
}


/** Pix externo recebido: a confirmação gerencial é independente da produção.
 * Não cria cobrança, não altera o contato, nem lança contas automaticamente.
 * O lançamento financeiro no Bling deve ser conferido separadamente. */
async function sendReceivedPix(ctx:any, saleDate?:string, approvedJob?:any) {
  const o=ctx.o;
  const methods:Record<string,{label:string;types:number[]}>= {pix:{label:"pix",types:[17,20]},dinheiro:{label:"dinheiro",types:[1]},credito:{label:"c.crédito",types:[3]},debito:{label:"c.débito",types:[4]}};
  const expectedMethod=methods[o.payment_method];
  if(!expectedMethod)throw new Error("Forma interna não suportada.");
  const normalizeLabel=(v:any)=>String(v||"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if (!["pago","em_analise","em_producao","pronto","enviado","concluido"].includes(o.status))
    throw new Error("Pedido não está em etapa definitiva de venda.");
  const [{data:events,error:ee},{data:payments,error:pe}]=await Promise.all([
    db.from("order_activity_events").select("amount,payment_method,financial_review").eq("order_id",o.id).eq("action","manual_payment_confirmed"),
    db.from("payments").select("status").eq("order_id",o.id)
  ]);
  if (ee) throw ee; if (pe) throw pe;
  if (payments?.length) throw new Error("Pedido com registro de pagamento online: concilie pelo fluxo original.");
  const validEvent=events?.length===1 && events[0].payment_method===o.payment_method && round(events[0].amount)===round(o.total) && events[0].financial_review===true;
  // A tarefa de integração é gravada apenas por serviço autorizado; não infere recebimento de observações.
  const validJob=["operator_confirmed_chat","internal_sale_finalized"].includes(approvedJob?.source) && approvedJob.order_id===o.id &&
    approvedJob.payment_method===o.payment_method && approvedJob.payment_confirmed===true &&
    Number.isInteger(approvedJob.amount_cents) && approvedJob.amount_cents===Math.round(Number(o.total)*100) &&
    typeof approvedJob.confirmation_ref==="string" && approvedJob.confirmation_ref.length>=10;
  if (!validEvent && (!validJob || events?.length))
    throw new Error("Venda interna sem origem autorizada ou confirmação rastreável.");
  const contactId=Number(ctx.c.bling_contact_id);
  if (!(contactId>0) || ctx.c.bling_sync_status!=="sincronizado") throw new Error("Sincronize o contato antes de enviar.");
  if(!Number.isFinite(Number(o.total)) || Number(o.total)<=0)throw new Error("Total inválido.");
  const date=saleDate || new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo"}).format(new Date(o.created_at));
  // Regra comercial: usar a modalidade ativa já cadastrada. O destino financeiro
  // não determina se a venda interna foi recebida. Não lançar contas nem gerar Pix.
  const all:any[]=[];
  for(let page=1;page<=20;page++){
    const rows=await api("/formas-pagamentos","GET",null,{situacao:"1",pagina:String(page),limite:"100"});
    if(!Array.isArray(rows))throw new Error("Não foi possível consultar formas de pagamento.");
    all.push(...rows);
    if(rows.length<100)break;
    if(page===20)throw new Error("Consulta de formas incompleta.");
  }
  const eligible=[];
  for(const f of all.filter(f=>Number(f.id)>0&&Number(f.situacao)===1&&normalizeLabel(f.descricao)===normalizeLabel(expectedMethod.label)&&expectedMethod.types.includes(Number(f.tipoPagamento)))){
    const detail=await api("/formas-pagamentos/"+f.id);
    if(Number(detail?.id)===Number(f.id)&&Number(detail?.situacao)===1&&normalizeLabel(detail.descricao)===normalizeLabel(expectedMethod.label)&&expectedMethod.types.includes(Number(detail.tipoPagamento))&&[2,3].includes(Number(detail.finalidade))) eligible.push(detail);
  }
  if(eligible.length!==1)throw new Error("Forma de pagamento existente ausente ou ambígua: "+expectedMethod.label+". Nenhum pedido foi enviado.");
  const formId=Number(eligible[0].id);
  const body:any=orderBody(ctx,contactId);
  body.data=date; body.numeroLoja=o.order_code;
  body.parcelas=[{dataVencimento:date,valor:round(o.total),formaPagamento:{id:formId},observacoes:"Venda interna recebida; não emitir nova cobrança."}];
  let ext=Number(ctx.m?.external_id||String(o.checkout_reference||"").match(/^bling:(\d+)$/)?.[1]||0);
  let created=false;
  if(!ext){
    const existing=await api("/pedidos/vendas","GET",null,{"numerosLojas[]":o.order_code,idContato:String(contactId)});
    if(!Array.isArray(existing))throw new Error("Falha ao conferir referência no Bling.");
    const matches=existing.filter((r:any)=>String(r.numeroLoja)===o.order_code&&Number(r.contato?.id)===contactId);
    if(matches.length>1)throw new Error("Mais de um pedido com a mesma referência no Bling.");
    ext=Number(matches[0]?.id||0);
    if(!ext){
      if(o.checkout_reference)throw new Error("Envio anterior ainda em conferência. Não reenviar.");
      // Detecta também uma venda manual sem referência Croma na janela próxima à venda.
      const shift=(n:number)=>{const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
      for(let page=1;page<=20;page++){
        const rows=await api("/pedidos/vendas","GET",null,{idContato:String(contactId),dataInicial:shift(-1),dataFinal:shift(1),pagina:String(page),limite:"100"});
        if(!Array.isArray(rows))throw new Error("Falha na verificação de duplicidade.");
        if(rows.some((r:any)=>Number(r.contato?.id)===contactId&&round(r.total)===round(o.total)))
          throw new Error("Existe venda de mesmo valor para este contato em data próxima. Confira o Bling antes de criar outro pedido.");
        if(rows.length<100)break;
        if(page===20)throw new Error("Consulta de duplicidade incompleta.");
      }
      const {data:claim,error}=await db.from("orders").update({checkout_reference:"bling-pendente:"+o.id}).eq("id",o.id).eq("status",o.status).is("checkout_reference",null).select("id").maybeSingle();
      if(error||!claim)throw new Error("Pedido já em envio ou alterado; recarregue.");
      const result=await api("/pedidos/vendas","POST",body);
      ext=Number(result?.id||0);
      if(!(ext>0))throw new Error("Envio em conferência: o Bling não retornou um ID. Não reenviar.");
      created=true;
    }
    const {error}=await db.from("orders").update({checkout_reference:"bling:"+ext}).eq("id",o.id);
    if(error)throw error;
  }
  const remote=await api("/pedidos/vendas/"+ext);
  const parcel=remote?.parcelas?.[0];
  const expectedItems=body.itens.map((i:any)=>[Number(i.produto.id),Number(i.quantidade),round(i.valor,6)].join(":")).sort();
  const actualItems=(Array.isArray(remote?.itens)?remote.itens:[]).map((i:any)=>[Number(i.produto?.id),Number(i.quantidade),round(i.valor,6)].join(":")).sort();
  if(!remote?.numero||Number(remote.contato?.id)!==contactId||String(remote.numeroLoja)!==o.order_code||round(remote.total)!==round(o.total)||JSON.stringify(actualItems)!==JSON.stringify(expectedItems)||remote.parcelas?.length!==1||Number(parcel?.formaPagamento?.id)!==formId||round(parcel.valor)!==round(o.total)||parcel.dataVencimento!==date)
    throw new Error("Pedido localizado, mas dados divergem. Não criar outro; conferir no Bling.");
  const now=new Date().toISOString();
  const mapping={provider:"bling",entity_type:"order",local_id:o.id,external_id:String(ext),sync_status:"synced",last_synced_at:now,metadata:{...(ctx.m?.metadata||{}),remote_order_number:remote.numero,remote_validated:true,remote_total:round(remote.total),payment_form_id:formId,payment_method:o.payment_method,commercial_payment_status:"received",financial_status:"pending_verification",source:"croma_internal_received_v2"}};
  const {data:linked,error:linkError}=await db.from("erp_entity_mappings").select("id,local_id").eq("provider","bling").eq("entity_type","order").eq("external_id",String(ext)).maybeSingle();
  if(linkError)throw linkError;
  if(linked&&linked.local_id!==o.id)throw new Error("Pedido Bling já vinculado a outro pedido local.");
  const saved=linked?await db.from("erp_entity_mappings").update(mapping).eq("id",linked.id).eq("local_id",o.id).select("id").single():await db.from("erp_entity_mappings").insert(mapping).select("id").single();
  if(saved.error||!saved.data)throw new Error("Vínculo não confirmado; não reenviar.");
  return {created,external_id:ext,number:remote.numero,item_count:remote.itens.length,total:round(remote.total),financial_status:"pending_verification"};
}

async function syncOrder(orderId:string, options:{preserve_customer:boolean;sale_date?:string}){
  const ctx=await load(orderId);
  if(ctx.o.payment_method==="pix")return await sendReceivedPix(ctx,options.sale_date);
  if (ctx.o.payment_method==="crediario" || ctx.o.payment_method.startsWith("bling:")) return await sendReceivable(ctx, options.sale_date);
  const contactId=options.preserve_customer?Number(ctx.c.bling_contact_id||0):await ensureContact(ctx.c,ctx.a);
  if(!(contactId>0))throw new Error('Este pedido exige um contato já vinculado ao Bling para preservar o cadastro.');
  const body:any=orderBody(ctx,contactId);
  if(options.sale_date)body.data=options.sale_date;
  // A venda presencial já foi recebida: registrar uma parcela à vista em Dinheiro,
  // usando exclusivamente a forma de pagamento existente na conta Bling.
  if(ctx.o.payment_method==="dinheiro"){
    const available=await api("/formas-pagamentos","GET",null,{descricao:"Dinheiro",situacao:"1",limite:"100"});
    const forms=Array.isArray(available)?available:[];
    const matching=forms.filter((f:any)=>String(f?.descricao||"").trim().toLowerCase()==="dinheiro"&&Number(f?.id)>0);
    if(matching.length!==1)throw new Error("Bling: forma de pagamento Dinheiro ativa indisponível ou ambígua. Não foi gerado pedido externo.");
    body.parcelas=[{dataVencimento:body.data,valor:round(ctx.o.total),formaPagamento:{id:Number(matching[0].id)},observacoes:"Recebido integralmente em dinheiro na data da venda; não gerar cobrança adicional."}];
  }
  let ext=Number(ctx.m?.external_id||0),created=false;
  if(ext>0)await api("/pedidos/vendas/"+ext,"PUT",body);else{const res=await api("/pedidos/vendas","POST",body);ext=Number(res?.id||0);if(!(ext>0))throw new Error("Bling não retornou ID do pedido.");created=true}
  const remote=await api("/pedidos/vendas/"+ext);
  const expected=round(ctx.o.total),actual=round(remote?.total);
  if(Math.abs(expected-actual)>.02)throw new Error(`Validação falhou: total no Croma R$ ${expected.toFixed(2)} e no Bling R$ ${actual.toFixed(2)}.`);
  if(Number(remote?.contato?.id)!==contactId)throw new Error("Validação falhou: contato divergente no Bling.");
  if(!Array.isArray(remote?.itens)||remote.itens.length!==ctx.items.length)throw new Error("Validação falhou: quantidade de itens divergente no Bling.");
  const now=new Date().toISOString(),meta={remote_order_number:remote?.numero||null,source:"croma_order_outbound_v2",manager_discount:Math.max(0,round(Number(ctx.o.subtotal)-Number(ctx.o.total))),contact_id:contactId,remote_validated:true,remote_total:actual};
  if(ctx.m?.id)await db.from("erp_entity_mappings").update({external_id:String(ext),sync_status:"synced",last_synced_at:now,metadata:{...(ctx.m.metadata||{}),...meta},updated_at:now}).eq("id",ctx.m.id);
  else await db.from("erp_entity_mappings").insert({provider:"bling",entity_type:"order",local_id:orderId,external_id:String(ext),sync_status:"synced",last_synced_at:now,metadata:meta,updated_at:now});
  await db.from("orders").update({checkout_reference:"bling:"+ext,updated_at:now}).eq("id",orderId);
  return {created,external_id:ext,number:remote?.numero,total:actual,discount:remote?.desconto,contact_id:contactId,item_count:remote.itens.length};
}

// Contrato da fila: apenas origens internas autorizadas, nunca status isolado.
function validInternalSaleJob(a:any){
  const methods=["pix","dinheiro","credito","debito","crediario"];
  const date=(s:any)=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T00:00:00Z"))&&new Date(s+"T00:00:00Z").toISOString().slice(0,10)===s;
  if(!a||!["operator_confirmed_chat","internal_sale_finalized"].includes(a.source)||!methods.includes(a.payment_method)||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(a.order_id||""))||
    !date(a.sale_date)||!Number.isSafeInteger(a.amount_cents)||a.amount_cents<=0||
    typeof a.confirmation_ref!=="string"||a.confirmation_ref.trim().length<10||a.confirmation_ref.length>500)return false;
  if(a.payment_method==="crediario")return a.source==="internal_sale_finalized"&&a.payment_confirmed===false&&date(a.due_date)&&a.due_date>=a.sale_date;
  return a.payment_confirmed===true;
}

// Despacho administrativo em fila existente. A credencial de cron já é utilizada
// pelos trabalhadores Bling. Não autoriza ações gerais nem fabrica sessão humana.
async function dispatchApprovedOrder(jobId:string) {
  if(!/^[0-9a-f-]{36}$/i.test(jobId))throw new Error("job_id inválido.");
  const {data:j,error}=await db.from("erp_sync_jobs").select("*").eq("id",jobId)
    .eq("provider","bling").eq("entity_type","order").eq("operation","create")
    .eq("direction","croma_to_bling").eq("status","queued").maybeSingle();
  if(error||!j)throw new Error("Tarefa de envio indisponível.");
  const a=j.request_summary||{};
  if(!validInternalSaleJob(a))throw new Error("Tarefa sem aprovação estruturada.");
  const claim=await db.from("erp_sync_jobs").update({status:"running",started_at:new Date().toISOString()})
    .eq("id",jobId).eq("status","queued").select("id").maybeSingle();
  if(claim.error||!claim.data)throw new Error("Tarefa já em processamento.");
  try{
    const ctx=await load(a.order_id);
    if(ctx.o.payment_method!==a.payment_method||Math.round(Number(ctx.o.total)*100)!==a.amount_cents)
      throw new Error("Pedido diverge da aprovação.");
    // Referência de checkout é reservada a pedidos públicos, não uma autorização de venda interna.
    if(a.source==="internal_sale_finalized"&&ctx.o.checkout_reference&&!/^bling(?:-pendente)?:/.test(ctx.o.checkout_reference))
      throw new Error("Origem de checkout incompatível com a fila de vendas internas.");
    let result;
    if(a.payment_method==="crediario"){
      if(ctx.o.payment_due_date!==a.due_date||ctx.o.status!=="aguardando_pagamento")throw new Error("Crediário diverge do vencimento ou situação aprovada.");
      const {data:online,error:oe}=await db.from("payments").select("id").eq("order_id",ctx.o.id).limit(1);
      if(oe)throw oe;
      if(online?.length)throw new Error("Pedido de checkout online não pode entrar no despacho interno.");
      result=await sendReceivable(ctx,a.sale_date);
    }else result=await sendReceivedPix(ctx,a.sale_date,a);
    const done=await db.from("erp_sync_jobs").update({status:"completed",finished_at:new Date().toISOString(),
      processed_count:1,success_count:1,result_summary:result}).eq("id",jobId).eq("status","running").select("id").single();
    if(done.error||!done.data)throw new Error("Pedido enviado; tarefa sem confirmação de encerramento. Não reenviar.");
    return result;
  }catch(e){
    await db.from("erp_sync_jobs").update({status:"failed",finished_at:new Date().toISOString(),processed_count:1,error_count:1,
      error_message:e instanceof Error?e.message:String(e)}).eq("id",jobId).eq("status","running");
    throw e;
  }
}

Deno.serve(async(req)=>{
  const origin=req.headers.get("Origin")||"";
  const allowed=new Set(["https://www.cromapel.com.br","https://cromapel.com.br","https://www.cromahub.com.br","https://cromahub.com.br"]);
  const cors={"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://www.cromapel.com.br",
    "Access-Control-Allow-Methods":"POST, OPTIONS",
    "Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type, x-croma-outbound-key",
    "Vary":"Origin"};
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  const response=(payload:any,status=200)=>new Response(JSON.stringify(payload),{status,headers:{...cors,"Content-Type":"application/json"}});
  if(req.method!=="POST")return response({error:"method_not_allowed"},405);
  const cron=req.headers.get("x-croma-cron")||"";
  if(cron){
    try{
      const expected=await readSecret("erp_bling_cron_secret");
      if(!expected||cron!==expected)return response({error:"unauthorized"},401);
      const input=await req.json();
      if(input.action!=="dispatch_approved_order")return response({error:"forbidden"},403);
      return response({ok:true,...await dispatchApprovedOrder(String(input.job_id||""))});
    }catch(e){return response({ok:false,error:e instanceof Error?e.message:String(e)},500)}
  }
  // Compatibilidade: aceita a chave operacional existente; a interface de gestão usa JWT autenticado.
  if(!OUTBOUND_KEY || req.headers.get("x-croma-outbound-key")!==OUTBOUND_KEY){
    const auth=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
    if(!auth)return response({error:"unauthorized"},401);
    const {data:authData,error:authError}=await db.auth.getUser(auth);
    if(authError||!authData?.user)return response({error:"unauthorized"},401);
    const {data:staff}=await db.from("profiles").select("role,ativo").eq("id",authData.user.id).maybeSingle();
    if(!staff?.ativo||!["owner","manager"].includes(staff.role))return response({error:"forbidden"},403);
  }
  try{const input=await req.json();if(input.action==="receipt_forms"){return response({ok:true,forms:(await receiptForms()).map(f=>({id:f.id,descricao:f.descricao}))})}const id=String(input.order_id||"");if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("order_id inválido");const saleDate=String(input.sale_date||'');if(saleDate&&!/^\d{4}-\d{2}-\d{2}$/.test(saleDate))throw new Error('Data inválida.');const result=await syncOrder(id,{preserve_customer:input.preserve_customer===true,sale_date:saleDate||undefined});return response({ok:true,...result})}
  catch(e){return response({ok:false,error:e instanceof Error?e.message:String(e)},500)}
});
