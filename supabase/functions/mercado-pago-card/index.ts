import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const ALLOWED_ORIGINS = ["https://www.cromapel.com.br", "https://cromapel.com.br"];

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin",
  };
}
function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors(req) });
}
const env = () => String(Deno.env.get("MERCADO_PAGO_ENVIRONMENT") || "test").toLowerCase();
const publicKey = () => Deno.env.get("MERCADO_PAGO_PUBLIC_KEY") || "";
const accessToken = () => Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
const enabled = () => env() === "test" && Boolean(publicKey()) && Boolean(accessToken());
const clean = (value: unknown, max = 180) => String(value ?? "").trim().slice(0, max);
const digits = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));

async function testManager(req: Request) {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Response("Sessão ausente.", { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Response("Sessão inválida.", { status: 401 });
  const { data: profile } = await admin.from("profiles").select("role,ativo").eq("id", data.user.id).maybeSingle();
  if (!profile?.ativo || !["owner", "manager"].includes(profile.role)) {
    throw new Response("Checkout Mercado Pago está disponível somente para validação interna nesta fase.", { status: 403 });
  }
  return data.user;
}

function transaction(providerOrder: any) { return providerOrder?.transactions?.payments?.[0] || null; }
function challengeUrl(providerOrder: any) { return transaction(providerOrder)?.payment_method?.transaction_security?.url || null; }
function localStatus(providerStatus: string, detail: string) {
  if (providerStatus === "processed" && detail === "accredited") return "approved";
  if (providerStatus === "failed") return "rejected";
  if (["canceled", "expired"].includes(providerStatus)) return "canceled";
  if (providerStatus === "refunded") return "refunded";
  if (providerStatus === "charged_back") return "charged_back";
  if (providerStatus === "action_required") return "action_required";
  if (providerStatus === "processing") return "processing";
  return "created";
}
function orderStatus(paymentStatus: string, current: string) {
  if (paymentStatus === "approved") return "pago";
  if (paymentStatus === "charged_back") return "em_analise";
  if (paymentStatus === "refunded") return "cancelado";
  if (current === "pago") return "pago";
  return "aguardando_pagamento";
}
function providerSummary(providerOrder: any, requestId?: string | null) {
  const tx = transaction(providerOrder);
  return {
    provider_order_id: clean(providerOrder?.id, 120) || null,
    provider_payment_id: clean(tx?.id, 120) || null,
    provider_status: clean(tx?.status || providerOrder?.status, 80) || null,
    provider_status_detail: clean(tx?.status_detail || providerOrder?.status_detail, 120) || null,
    amount: tx?.amount ?? providerOrder?.total_amount ?? null,
    payment_method_id: clean(tx?.payment_method?.id, 80) || null,
    installments: Number(tx?.payment_method?.installments || 0) || null,
    challenge_required: Boolean(challengeUrl(providerOrder)),
    request_id: requestId || null,
  };
}
async function event(payment: any, order: any, type: string, providerOrder: any, requestId?: string | null, providerEventId?: string | null) {
  const tx = transaction(providerOrder);
  const { error } = await admin.from("payment_events").insert({
    payment_id: payment?.id || null,
    order_id: order.id,
    customer_id: order.customer_id,
    provider_event_id: providerEventId || null,
    event_type: type,
    provider_status: clean(tx?.status || providerOrder?.status, 80) || null,
    provider_status_detail: clean(tx?.status_detail || providerOrder?.status_detail, 120) || null,
    provider_request_id: requestId || null,
    payload_summary: providerSummary(providerOrder, requestId),
  });
  if (error) console.error("payment event", error);
}
async function applyProvider(paymentRow: any, order: any, providerOrder: any, requestId?: string | null, type = "api_response") {
  const tx = transaction(providerOrder) || {};
  const method = tx?.payment_method || {};
  const providerStatus = clean(tx.status || providerOrder?.status, 80);
  const detail = clean(tx.status_detail || providerOrder?.status_detail, 120);
  const mapped = localStatus(providerStatus, detail);
  const lastFour = clean(method?.card?.last_four_digits || method?.last_four_digits, 8) || null;
  const { data: updated, error } = await admin.from("payments").update({
    provider_order_id: clean(providerOrder?.id, 120) || null,
    provider_payment_id: clean(tx?.id, 120) || null,
    status: mapped,
    provider_status: providerStatus || null,
    provider_status_detail: detail || null,
    provider_request_id: requestId || null,
    installments: Number(method?.installments || paymentRow.installments || 0) || null,
    card_brand: clean(method?.id, 80) || paymentRow.card_brand || null,
    card_last_four: lastFour,
  }).eq("id", paymentRow.id).select("*").single();
  if (error) throw error;
  const next = orderStatus(mapped, order.status);
  if (next !== order.status) {
    const { error: orderError } = await admin.from("orders").update({ status: next }).eq("id", order.id);
    if (orderError) throw orderError;
    order.status = next;
  }
  await event(updated, order, type, providerOrder, requestId);
  return {
    payment_id: updated.id,
    order_id: order.id,
    order_code: order.order_code,
    order_status: order.status,
    payment_status: mapped,
    provider_status: providerStatus || null,
    status_detail: detail || null,
    provider_order_id: updated.provider_order_id,
    provider_payment_id: updated.provider_payment_id,
    installments: updated.installments,
    card_brand: updated.card_brand,
    challenge_url: challengeUrl(providerOrder),
  };
}
async function ownOrder(userId: string, orderId: string) {
  const { data, error } = await admin.from("orders").select("id,order_code,customer_id,status,payment_method,total,checkout_reference").eq("id", orderId).eq("customer_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}
async function refresh(paymentRow: any, order: any) {
  if (!paymentRow?.provider_order_id || !enabled()) {
    return {
      payment_id: paymentRow?.id || null, order_id: order.id, order_code: order.order_code,
      order_status: order.status, payment_status: paymentRow?.status || null,
      provider_status: paymentRow?.provider_status || null, status_detail: paymentRow?.provider_status_detail || null,
      provider_order_id: paymentRow?.provider_order_id || null, provider_payment_id: paymentRow?.provider_payment_id || null,
      installments: paymentRow?.installments || null, card_brand: paymentRow?.card_brand || null, challenge_url: null,
    };
  }
  const response = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(paymentRow.provider_order_id)}`, { headers: { "Authorization": `Bearer ${accessToken()}` } });
  const requestId = response.headers.get("x-request-id");
  const providerOrder = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Não foi possível consultar o pagamento no Mercado Pago.");
  return await applyProvider(paymentRow, order, providerOrder, requestId, "status_refresh");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  try {
    if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
    const user = await testManager(req);
    const body = await req.json().catch(() => ({}));
    const action = clean(body?.action, 40) || "config";

    if (action === "config") return json(req, { enabled: enabled(), environment: env(), public_key: enabled() ? publicKey() : null, production_enabled: false });
    if (action === "status") {
      const orderId = clean(body?.order_id, 60);
      if (!uuid(orderId)) return json(req, { error: "Pedido inválido." }, 400);
      const order = await ownOrder(user.id, orderId);
      if (!order) return json(req, { error: "Pedido não encontrado." }, 404);
      const { data: payment, error } = await admin.from("payments").select("*").eq("order_id", order.id).eq("customer_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      if (!payment) return json(req, { order_id: order.id, order_code: order.order_code, order_status: order.status, payment_status: null });
      return json(req, await refresh(payment, order));
    }
    if (action !== "pay") return json(req, { error: "Ação inválida." }, 400);
    if (!enabled()) return json(req, { error: "Mercado Pago de teste ainda não está configurado.", code: "MP_NOT_CONFIGURED" }, 503);

    const orderId = clean(body?.order_id, 60);
    const attemptId = clean(body?.attempt_id, 60);
    const cardToken = clean(body?.token, 300);
    const paymentMethodId = clean(body?.payment_method_id, 80);
    const paymentTypeId = clean(body?.payment_type_id, 40);
    const installments = Math.max(1, Math.floor(Number(body?.installments || 1)));
    if (!uuid(orderId) || !uuid(attemptId)) return json(req, { error: "Identificação de pagamento inválida." }, 400);
    if (!cardToken || !paymentMethodId) return json(req, { error: "Dados do cartão incompletos." }, 400);
    if (paymentTypeId && paymentTypeId !== "credit_card") return json(req, { error: "Esta integração aceita somente cartão de crédito." }, 400);

    const order = await ownOrder(user.id, orderId);
    if (!order) return json(req, { error: "Pedido não encontrado." }, 404);
    if (order.payment_method !== "credito") return json(req, { error: "O pedido não está configurado para cartão de crédito." }, 409);
    if (order.status === "pago") return json(req, { order_id: order.id, order_code: order.order_code, order_status: "pago", payment_status: "approved" });

    let { data: paymentRow, error: paymentError } = await admin.from("payments").select("*").eq("idempotency_key", attemptId).maybeSingle();
    if (paymentError) throw paymentError;
    if (paymentRow && paymentRow.order_id !== order.id) return json(req, { error: "Chave de tentativa já utilizada." }, 409);
    if (paymentRow?.provider_order_id) return json(req, await refresh(paymentRow, order));

    if (!paymentRow) {
      const { data: created, error } = await admin.from("payments").insert({
        order_id: order.id, customer_id: user.id, provider: "mercado_pago", environment: "test",
        method: "credit_card", status: "created", amount: Number(order.total || 0), installments,
        card_brand: paymentMethodId, idempotency_key: attemptId,
      }).select("*").single();
      if (error) throw error;
      paymentRow = created;
    }

    const { data: profile } = await admin.from("customer_profiles").select("email,cpf,nome").eq("id", user.id).maybeSingle();
    const payerEmail = clean(body?.payer?.email || profile?.email || user.email, 180);
    const idType = clean(body?.payer?.identification?.type || "CPF", 20).toUpperCase();
    const idNumber = digits(body?.payer?.identification?.number || profile?.cpf);
    const providerPayload: any = {
      type: "online", processing_mode: "automatic", total_amount: Number(order.total || 0).toFixed(2), external_reference: order.order_code,
      payer: { email: payerEmail },
      transactions: { payments: [{ amount: Number(order.total || 0).toFixed(2), payment_method: { id: paymentMethodId, type: "credit_card", token: cardToken, installments } }] },
    };
    if (idNumber) providerPayload.payer.identification = { type: idType || "CPF", number: idNumber };

    const response = await fetch("https://api.mercadopago.com/v1/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken()}`, "X-Idempotency-Key": attemptId },
      body: JSON.stringify(providerPayload),
    });
    const requestId = response.headers.get("x-request-id");
    const providerOrder = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = clean(providerOrder?.message || providerOrder?.error || providerOrder?.cause?.[0]?.description || "Falha no processamento do Mercado Pago.", 240);
      await admin.from("payments").update({ status: "error", provider_status: clean(providerOrder?.status, 80) || null, provider_status_detail: detail || null, provider_request_id: requestId || null }).eq("id", paymentRow.id);
      await event(paymentRow, order, "api_error", providerOrder, requestId);
      return json(req, { error: detail || "Não foi possível processar o cartão.", code: "MP_PAYMENT_ERROR", request_id: requestId || null }, response.status >= 400 && response.status < 500 ? 400 : 502);
    }
    return json(req, await applyProvider(paymentRow, order, providerOrder, requestId, "api_response"));
  } catch (error) {
    if (error instanceof Response) return json(req, { error: await error.text() }, error.status);
    console.error(error);
    return json(req, { error: "Não foi possível concluir o pagamento com cartão.", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
