import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BLING_CLIENT_ID = Deno.env.get("BLING_CLIENT_ID") || "";
const BLING_CLIENT_SECRET = Deno.env.get("BLING_CLIENT_SECRET") || "";
const REDIRECT_URI =
  Deno.env.get("BLING_REDIRECT_URI") ||
  `${SUPABASE_URL}/functions/v1/bling-erp`;
const SITE_URL =
  Deno.env.get("CROMA_SITE_URL") ||
  "https://www.cromapel.com.br/interno/bling/";
const BLING_API = "https://api.bling.com.br/Api/v3";
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const allowedOrigins = new Set([
  "https://www.cromapel.com.br",
  "https://cromapel.com.br",
]);

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin)
      ? origin
      : "https://www.cromapel.com.br",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

function json(req: Request, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function page(message: string, success: boolean) {
  const target = new URL(SITE_URL);
  target.searchParams.set("bling", success ? "connected" : "error");
  target.searchParams.set("message", message.slice(0, 240));
  return Response.redirect(target.toString(), 302);
}

async function requireOwner(req: Request) {
  const token = (req.headers.get("Authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token) throw new Response("Sessão ausente.", { status: 401 });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user)
    throw new Response("Sessão inválida.", { status: 401 });
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role,ativo")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !profile?.ativo || profile.role !== "owner")
    throw new Response("Acesso exclusivo do proprietário.", { status: 403 });
  return data.user;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function basicAuth() {
  return `Basic ${btoa(`${BLING_CLIENT_ID}:${BLING_CLIENT_SECRET}`)}`;
}

async function exchangeToken(params: URLSearchParams) {
  const response = await fetch(`${BLING_API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
      "enable-jwt": "1",
    },
    body: params,
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      payload?.error?.description ||
        payload?.error_description ||
        payload?.error ||
        "O Bling recusou a geração do token.",
    );
  return payload;
}

async function saveTokens(connectionId: string, payload: any) {
  const expiresAt = new Date(
    Date.now() + Math.max(60, Number(payload.expires_in || 3600)) * 1000,
  ).toISOString();
  const { error } = await admin.from("erp_private_tokens").upsert({
    connection_id: connectionId,
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    token_type: payload.token_type || "Bearer",
    scope: payload.scope || null,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function activeConnection() {
  const { data: connection, error } = await admin
    .from("erp_connections")
    .select("*")
    .eq("provider", "bling")
    .single();
  if (error) throw error;
  return connection;
}

async function accessToken() {
  const connection = await activeConnection();
  const { data: token, error } = await admin
    .from("erp_private_tokens")
    .select("*")
    .eq("connection_id", connection.id)
    .maybeSingle();
  if (error || !token) throw new Error("Bling ainda não conectado.");
  if (new Date(token.expires_at).getTime() > Date.now() + 90_000)
    return token.access_token;
  if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET)
    throw new Error("Credenciais do aplicativo Bling não configuradas.");
  const refreshed = await exchangeToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  );
  await saveTokens(connection.id, refreshed);
  return refreshed.access_token;
}

const resources = {
  product: { base: "/produtos", canDelete: true, canUpdate: true },
  customer: { base: "/contatos", canDelete: true, canUpdate: true },
  order: { base: "/pedidos/vendas", canDelete: true, canUpdate: true },
  stock: { base: "/estoques", canDelete: false, canUpdate: false },
} as const;

async function blingRequest(
  entity: keyof typeof resources,
  operation: string,
  id: string | null,
  query: Record<string, string>,
  body: unknown,
) {
  const resource = resources[entity];
  if (!resource) throw new Error("Cadastro da integração inválido.");
  let method = "GET";
  let path = resource.base;
  if (operation === "get") {
    if (!id) throw new Error("Identificador não informado.");
    path = entity === "stock" ? `/estoques/saldos/${id}` : `${path}/${id}`;
  } else if (operation === "create") {
    method = "POST";
  } else if (operation === "update") {
    if (!resource.canUpdate || !id)
      throw new Error("Esta operação não é permitida para este cadastro.");
    method = "PUT";
    path = `${path}/${id}`;
  } else if (operation === "delete") {
    if (!resource.canDelete || !id)
      throw new Error("Esta operação não é permitida para este cadastro.");
    method = "DELETE";
    path = `${path}/${id}`;
  } else if (operation !== "list") {
    throw new Error("Operação do Bling inválida.");
  }
  const url = new URL(`${BLING_API}${path}`);
  if (operation === "list") {
    url.searchParams.set("pagina", query.pagina || "1");
    url.searchParams.set("limite", query.limite || "100");
    Object.entries(query).forEach(([key, value]) => {
      if (!["pagina", "limite"].includes(key) && value)
        url.searchParams.set(key, value);
    });
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${await accessToken()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "enable-jwt": "1",
    },
    body: ["POST", "PUT"].includes(method) ? JSON.stringify(body || {}) : null,
  });
  const raw = await response.text();
  const payload = raw ? JSON.parse(raw) : { data: null };
  if (!response.ok)
    throw new Error(
      payload?.error?.description ||
        payload?.error?.message ||
        payload?.message ||
        `Bling respondeu com código ${response.status}.`,
    );
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  const url = new URL(req.url);

  try {
    if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("error"))) {
      if (url.searchParams.get("error"))
        return page("A autorização foi cancelada ou recusada.", false);
      if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET)
        return page("Credenciais do aplicativo não configuradas.", false);
      const state = url.searchParams.get("state") || "";
      const code = url.searchParams.get("code") || "";
      const { data: oauthState, error: stateError } = await admin
        .from("erp_oauth_states")
        .select("*")
        .eq("state", state)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (stateError || !oauthState || !code)
        return page("Autorização inválida ou expirada.", false);
      await admin
        .from("erp_oauth_states")
        .update({ used_at: new Date().toISOString() })
        .eq("state", state);
      const connection = await activeConnection();
      const tokens = await exchangeToken(
        new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: REDIRECT_URI,
        }),
      );
      await saveTokens(connection.id, tokens);
      await admin
        .from("erp_connections")
        .update({
          status: "connected",
          connected_by: oauthState.created_by,
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connection.id);
      return page("Bling conectado com segurança.", true);
    }

    if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
    const user = await requireOwner(req);
    const input = await req.json();
    const action = String(input.action || "status");

    if (action === "status") {
      const connection = await activeConnection();
      const [mappings, conflicts, jobs] = await Promise.all([
        admin.from("erp_entity_mappings").select("entity_type,sync_status"),
        admin
          .from("erp_sync_conflicts")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        admin
          .from("erp_sync_jobs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      const counts: Record<string, number> = {};
      (mappings.data || []).forEach((item: any) => {
        counts[item.entity_type] = (counts[item.entity_type] || 0) + 1;
      });
      return json(req, {
        connection,
        credentials_configured: Boolean(BLING_CLIENT_ID && BLING_CLIENT_SECRET),
        redirect_uri: REDIRECT_URI,
        mappings: counts,
        open_conflicts: conflicts.count || 0,
        recent_jobs: jobs.data || [],
      });
    }

    if (action === "authorize") {
      if (!BLING_CLIENT_ID || !BLING_CLIENT_SECRET)
        return json(
          req,
          {
            error: "BLING_CREDENTIALS_NOT_CONFIGURED",
            message:
              "Configure BLING_CLIENT_ID, BLING_CLIENT_SECRET e BLING_REDIRECT_URI nos segredos das Edge Functions.",
            redirect_uri: REDIRECT_URI,
          },
          503,
        );
      const state = randomState();
      const { error } = await admin.from("erp_oauth_states").insert({
        state,
        provider: "bling",
        created_by: user.id,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw error;
      await admin
        .from("erp_connections")
        .update({ status: "awaiting_authorization", updated_at: new Date().toISOString() })
        .eq("provider", "bling");
      const authorizeUrl = new URL("https://www.bling.com.br/Api/v3/oauth/authorize");
      authorizeUrl.searchParams.set("response_type", "code");
      authorizeUrl.searchParams.set("client_id", BLING_CLIENT_ID);
      authorizeUrl.searchParams.set("state", state);
      return json(req, { authorize_url: authorizeUrl.toString() });
    }

    if (!["list", "get", "create", "update", "delete"].includes(action))
      return json(req, { error: "Ação inválida." }, 400);
    const entity = input.entity as keyof typeof resources;
    if (!resources[entity]) return json(req, { error: "Cadastro inválido." }, 400);
    const { data: job, error: jobError } = await admin
      .from("erp_sync_jobs")
      .insert({
        provider: "bling",
        entity_type: entity,
        operation: action,
        direction:
          action === "list" || action === "get" ? "bling_to_croma" : "croma_to_bling",
        status: "running",
        requested_by: user.id,
        started_at: new Date().toISOString(),
        request_summary: { id: input.id || null },
      })
      .select("id")
      .single();
    if (jobError) throw jobError;
    try {
      const payload = await blingRequest(
        entity,
        action,
        input.id ? String(input.id) : null,
        input.query || {},
        input.body || null,
      );
      const externalId = payload?.data?.id;
      if (externalId && input.local_id) {
        await admin.from("erp_entity_mappings").upsert(
          {
            provider: "bling",
            entity_type: entity,
            local_id: input.local_id,
            external_id: String(externalId),
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider,entity_type,external_id" },
        );
      }
      const count = Array.isArray(payload?.data) ? payload.data.length : payload?.data ? 1 : 0;
      await admin
        .from("erp_sync_jobs")
        .update({
          status: "completed",
          processed_count: count,
          success_count: count,
          result_summary: { count, external_id: externalId || null },
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      return json(req, payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await admin
        .from("erp_sync_jobs")
        .update({
          status: "failed",
          error_count: 1,
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      throw error;
    }
  } catch (error) {
    if (error instanceof Response)
      return json(req, { error: await error.text() }, error.status);
    console.error("bling_erp_error", error);
    return json(
      req,
      {
        error: "Não foi possível concluir a operação do Bling.",
        detail: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});
