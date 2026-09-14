import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const clean = (v: unknown, max = 180) => String(v ?? "").trim().slice(0, max);
const accessToken = () => Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN") || "";
const webhookSecret = () => Deno.env.get("MERCADO_PAGO_WEBHOOK_SECRET") || "";
const environment = () => String(Deno.env.get("MERCADO_PAGO_ENVIRONMENT") || "test").toLowerCase();

function hex(bytes: ArrayBuffer) { return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join(""); }
function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function validSignature(req: Request, dataId: string) {
  const signature = req.headers.get("x-signature") || "";
  const requestId = req.headers.get("x-request-id") || "";
  const ts = /(?:^|,)\s*ts=([^,]+)/i.exec(signature)?.[1]?.trim() || "";
  const v1 = /(?:^|,)\s*v1=([^,]+)/i.exec(signature)?.[1]?.trim().toLowerCase() || "";
  if (!ts || !v1 || !requestId || !dataId || !webhookSecret()) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  return timingSafeEqual(hex(digest), v1);
}
function tx(order: any) { return order?.transactions?.payments?.[0] || null; }
function localStatus(status: string, detail: string) {
  if (status === "processed" && detail === "accredited") return "approved";
  if (status === "failed") return "rejected";
  if (["canceled", "expired"].includes(status)) return "canceled";
  if (status === "refunded") return "refunded";
  if (status === "charged_back") return "charged_back";
  if (status === "action_required") return "action_required";
  if (status === "processing") return "processing";
  return "created";
}
function orderStatus(paymentStatus: string, current: string) {
  if (paymentStatus === "approved") return "pago";
  if (paymentStatus === "charged_back") return "em_analise";
  if (paymentStatus === "refunded") return "cancelado";
  if (current === "pago") return "pago";
  return "aguardando_pagamento";
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });
  try {
    if (environment() !== "test" || !accessToken() || !webhookSecret()) return new Response("ok", { status: 200 });
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    if (body?.live_mode === true) return new Response("ok", { status: 200 });
    const dataId = clean(url.searchParams.get("data.id") || body?.data?.id || body?.id, 140);
    if (!dataId) return new Response("ok", { status: 200 });
    if (!(await validSignature(req, dataId))) return new Response("invalid signature", { status: 401 });

    const providerResponse = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(dataId)}`, { headers: { "Authorization": `Bearer ${accessToken()}` } });
    const requestId = providerResponse.headers.get("x-request-id");
    const providerOrder = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) return new Response("retry", { status: 503 });

    const orderCode = clean(providerOrder?.external_reference, 160);
    if (!orderCode) return new Response("ok", { status: 200 });
    const { data: order, error: orderError } = await admin.from("orders").select("id,order_code,customer_id,status,total").eq("order_code", orderCode).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return new Response("ok", { status: 200 });

    const paymentTx = tx(providerOrder) || {};
    const method = paymentTx?.payment_method || {};
    const providerStatus = clean(paymentTx?.status || providerOrder?.status, 80);
    const detail = clean(paymentTx?.status_detail || providerOrder?.status_detail, 120);
    const mapped = localStatus(providerStatus, detail);
    const providerPaymentId = clean(paymentTx?.id, 120) || null;
    let { data: payment } = await admin.from("payments").select("*").eq("provider_order_id", dataId).maybeSingle();
    if (!payment && providerPaymentId) ({ data: payment } = await admin.from("payments").select("*").eq("provider_payment_id", providerPaymentId).maybeSingle());

    if (!payment) {
      const { data: created, error } = await admin.from("payments").insert({
        order_id: order.id, customer_id: order.customer_id, provider: "mercado_pago", environment: "test", method: "credit_card",
        status: mapped, provider_status: providerStatus || null, provider_status_detail: detail || null,
        amount: Number(order.total || 0), installments: Number(method?.installments || 0) || null,
        card_brand: clean(method?.id, 80) || null, card_last_four: clean(method?.card?.last_four_digits || method?.last_four_digits, 8) || null,
        idempotency_key: crypto.randomUUID(), provider_order_id: dataId, provider_payment_id: providerPaymentId, provider_request_id: requestId || null,
      }).select("*").single();
      if (error) throw error;
      payment = created;
    } else {
      const { data: updated, error } = await admin.from("payments").update({
        provider_order_id: dataId, provider_payment_id: providerPaymentId, status: mapped,
        provider_status: providerStatus || null, provider_status_detail: detail || null, provider_request_id: requestId || null,
        installments: Number(method?.installments || payment.installments || 0) || null,
        card_brand: clean(method?.id, 80) || payment.card_brand || null,
        card_last_four: clean(method?.card?.last_four_digits || method?.last_four_digits, 8) || payment.card_last_four || null,
      }).eq("id", payment.id).select("*").single();
      if (error) throw error;
      payment = updated;
    }

    const nextOrderStatus = orderStatus(mapped, order.status);
    if (nextOrderStatus !== order.status) await admin.from("orders").update({ status: nextOrderStatus }).eq("id", order.id);

    await admin.from("payment_events").insert({
      payment_id: payment.id, order_id: order.id, customer_id: order.customer_id, provider: "mercado_pago",
      provider_event_id: dataId, event_type: "webhook", provider_status: providerStatus || null,
      provider_status_detail: detail || null, provider_request_id: requestId || null,
      payload_summary: { provider_order_id: dataId, provider_payment_id: providerPaymentId, provider_status: providerStatus || null, provider_status_detail: detail || null, installments: payment.installments || null },
    });
    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error(error);
    return new Response("retry", { status: 500 });
  }
});
