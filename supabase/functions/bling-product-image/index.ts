import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = "https://api.bling.com.br/Api/v3";
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const txt = (value: unknown) => {
  const text = String(value ?? "").trim();
  return text || null;
};
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const isProxyUrl = (value: string | null | undefined) => {
  const url = String(value || "");
  return url.includes("/functions/v1/bling-product-image") || url.includes("orgbling.s3.amazonaws.com");
};

async function secret(name: string) {
  const { data, error } = await db.rpc("erp_read_secret", { p_name: name });
  if (error) throw error;
  return String(data || "");
}

async function store(name: string, value: string, description: string) {
  const { error } = await db.rpc("erp_store_secret", {
    p_name: name,
    p_value: value,
    p_description: description,
  });
  if (error) throw error;
}

function tokenName(kind: string, id: string) {
  return `erp_bling_${kind}_token_${id.replaceAll("-", "")}`;
}

async function connection() {
  const { data, error } = await db.from("erp_connections").select("*").eq("provider", "bling").single();
  if (error) throw error;
  return data;
}

async function refresh(connectionRow: any, tokenRow: any) {
  const clientId = await secret("erp_bling_client_id");
  const clientSecret = await secret("erp_bling_client_secret");
  const refreshToken = await secret(tokenRow.refresh_token_secret_name);
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "enable-jwt": "1",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error_description || payload?.error?.description || "Falha ao renovar token do Bling.");
  const accessName = tokenName("access", connectionRow.id);
  const refreshName = tokenName("refresh", connectionRow.id);
  await Promise.all([
    store(accessName, String(payload.access_token || ""), "Access token OAuth do Bling"),
    store(refreshName, String(payload.refresh_token || ""), "Refresh token OAuth do Bling"),
  ]);
  await db.from("erp_private_tokens").update({
    access_token_secret_name: accessName,
    refresh_token_secret_name: refreshName,
    expires_at: new Date(Date.now() + Number(payload.expires_in || 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("connection_id", connectionRow.id);
  return String(payload.access_token || "");
}

async function token() {
  const currentConnection = await connection();
  const { data: tokenRow, error } = await db.from("erp_private_tokens").select("*").eq("connection_id", currentConnection.id).single();
  if (error) throw error;
  if (new Date(tokenRow.expires_at).getTime() > Date.now() + 90_000) {
    const current = await secret(tokenRow.access_token_secret_name);
    if (current) return current;
  }
  return refresh(currentConnection, tokenRow);
}

async function blingGet(path: string, query: Record<string, string> = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const url = new URL(`${API}${path}`);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${await token()}`,
        Accept: "application/json",
        "enable-jwt": "1",
      },
    });
    const raw = await response.text();
    let payload: any = {};
    try { payload = raw ? JSON.parse(raw) : {}; } catch { /* noop */ }
    if (response.ok) return payload?.data ?? payload;
    if (response.status === 429 && attempt < 3) {
      await sleep(900 * (attempt + 1));
      continue;
    }
    throw new Error(payload?.error?.description || payload?.message || `Bling respondeu ${response.status}.`);
  }
  return null;
}

function imageSrc(remote: any) {
  const internals = remote?.midia?.imagens?.internas || [];
  const externals = remote?.midia?.imagens?.externas || [];
  const urls = remote?.midia?.imagens?.imagensURL || [];
  return txt(internals?.[0]?.link) || txt(externals?.[0]?.link) || txt(urls?.[0]) || txt(remote?.imagemURL) || txt(remote?.imagemUrl) || txt(remote?.imagem) || null;
}

async function freshProductListImage(product: any) {
  try {
    const rows = await blingGet("/produtos", { pagina: "1", limite: "100", criterio: String(product.nome || "") });
    const list = Array.isArray(rows) ? rows : [];
    const exact = list.find((row: any) => Number(row?.id) === Number(product.bling_product_id));
    return imageSrc(exact) || null;
  } catch (error) {
    console.warn("bling_product_list_image_error", product?.bling_product_id, error);
    return null;
  }
}

async function integrationImage(blingId: number) {
  const { data } = await db.from("integration_catalog_items").select("payload").eq("external_id", String(blingId)).maybeSingle();
  return imageSrc(data?.payload) || null;
}

async function permanentMedia(productId: string) {
  const { data } = await db.from("product_media")
    .select("url")
    .eq("product_id", productId)
    .eq("kind", "image")
    .eq("ativo", true)
    .order("is_primary", { ascending: false })
    .order("ordem", { ascending: true })
    .limit(10);
  return (data || []).map((row: any) => txt(row.url)).find((url: string | null) => url && !isProxyUrl(url)) || null;
}

async function productSources(product: any) {
  const candidates: string[] = [];
  const push = (value: string | null | undefined) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };

  push(await permanentMedia(product.id));
  push(imageSrc(product.metadata?.bling_raw));
  push(await integrationImage(Number(product.bling_product_id)));
  try { push(imageSrc(await blingGet(`/produtos/${product.bling_product_id}`))); } catch (error) { console.warn("bling_product_detail_image_error", product.bling_product_id, error); }
  push(await freshProductListImage(product));
  return candidates;
}

async function fetchImage(src: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(src, { redirect: "follow" });
      if (response.ok) {
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength && (contentType.startsWith("image/") || looksLikeImage(new Uint8Array(buffer)))) {
          return { buffer, contentType: detectContentType(new Uint8Array(buffer), contentType) };
        }
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) await sleep(500 * (attempt + 1));
      else return null;
    } catch {
      if (attempt < 2) await sleep(500 * (attempt + 1));
    }
  }
  return null;
}

function looksLikeImage(bytes: Uint8Array) {
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
    (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP");
}

function detectContentType(bytes: Uint8Array, header: string) {
  if (header.startsWith("image/")) return header.split(";")[0];
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "image/jpeg";
}

async function getStored(path: string) {
  const { data, error } = await db.storage.from("product-media").download(path);
  if (error || !data) return null;
  return data;
}

async function updateMedia(productId: string, publicUrl: string, name: string) {
  const { data: rows } = await db.from("product_media")
    .select("id,url,is_primary,ordem")
    .eq("product_id", productId)
    .eq("kind", "image")
    .eq("ativo", true)
    .order("is_primary", { ascending: false })
    .order("ordem", { ascending: true })
    .limit(10);
  const target = (rows || []).find((row: any) => isProxyUrl(row.url));
  if (target?.id) {
    await db.from("product_media").update({ url: publicUrl, alt_text: name, is_primary: true, ativo: true }).eq("id", target.id);
  } else if (!(rows || []).length) {
    await db.from("product_media").insert({ product_id: productId, kind: "image", url: publicUrl, alt_text: name, is_primary: true, ordem: 0, ativo: true });
  }
}

async function updateProposalSnapshots(productId: string, publicUrl: string) {
  await db.from("sales_proposal_items")
    .update({ image_url: publicUrl })
    .eq("product_id", productId)
    .or("image_url.is.null,image_url.like.%/functions/v1/bling-product-image%,image_url.like.%orgbling.s3.amazonaws.com%");
}

async function findSource(product: any) {
  for (const source of await productSources(product)) {
    const image = await fetchImage(source);
    if (image) return image;
  }

  if (product.parent_product_id) {
    const { data: parent } = await db.from("products")
      .select("id,nome,bling_product_id,parent_product_id,ativo,metadata")
      .eq("id", product.parent_product_id)
      .maybeSingle();
    if (parent?.ativo && parent?.bling_product_id) {
      for (const source of await productSources(parent)) {
        const image = await fetchImage(source);
        if (image) return image;
      }
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "GET") return new Response("Método não permitido", { status: 405, headers: cors });

  try {
    const url = new URL(req.url);
    const productId = url.searchParams.get("product_id");
    if (!productId) return new Response("Imagem não encontrada", { status: 404, headers: cors });

    const { data: product, error } = await db.from("products")
      .select("id,nome,bling_product_id,parent_product_id,ativo,metadata")
      .eq("id", productId)
      .maybeSingle();
    if (error || !product?.bling_product_id || !product.ativo) return new Response("Imagem não encontrada", { status: 404, headers: cors });

    const path = `bling/${product.bling_product_id}/primary`;
    const stored = await getStored(path);
    if (stored) {
      return new Response(await stored.arrayBuffer(), {
        headers: {
          ...cors,
          "Content-Type": stored.type || "image/jpeg",
          "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
        },
      });
    }

    const image = await findSource(product);
    if (!image) return new Response("Imagem não encontrada", { status: 404, headers: { ...cors, "Cache-Control": "no-store" } });

    const upload = await db.storage.from("product-media").upload(path, image.buffer, {
      upsert: true,
      contentType: image.contentType,
      cacheControl: "31536000",
    });
    if (upload.error) throw upload.error;

    const publicUrl = db.storage.from("product-media").getPublicUrl(path).data.publicUrl;
    await Promise.all([
      updateMedia(product.id, publicUrl, product.nome),
      updateProposalSnapshots(product.id, publicUrl),
    ]);

    return new Response(image.buffer, {
      headers: {
        ...cors,
        "Content-Type": image.contentType,
        "Cache-Control": "public, max-age=604800, stale-while-revalidate=2592000",
      },
    });
  } catch (error) {
    console.error("bling_product_image_error", error);
    return new Response("Imagem indisponível", { status: 404, headers: { ...cors, "Cache-Control": "no-store" } });
  }
});
