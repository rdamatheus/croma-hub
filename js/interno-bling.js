import { supabase } from "./croma-supabase.js";
import { protectInternalPage } from "./interno-auth.js";

const session = await protectInternalPage({ roles: ["owner"] });
if (!session) throw new Error("auth");

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const labels = {
  not_configured: "Aguardando configuração",
  awaiting_authorization: "Aguardando autorização",
  connected: "Conectado",
  expired: "Autorização expirada",
  error: "Erro de conexão",
  disconnected: "Desconectado",
};

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke("bling-erp", { body });
  if (error) {
    let message = error.message;
    try {
      const response = error.context;
      if (response?.json) {
        const detail = await response.json();
        message = detail.message || detail.detail || detail.error || message;
      }
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.message || data.detail || data.error);
  return data;
}

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
}

function showUrlMessage() {
  const params = new URLSearchParams(location.search);
  const status = params.get("bling");
  const message = params.get("message");
  if (!status || !message) return false;
  $("message").textContent = message;
  $("message").className = `notice ${status === "connected" ? "ok" : ""}`;
  history.replaceState({}, "", location.pathname);
  return true;
}

async function load() {
  const preserveMessage = showUrlMessage();
  try {
    const data = await invoke({ action: "status" });
    const connection = data.connection || {};
    const connected = connection.status === "connected";
    $("statusLabel").textContent = labels[connection.status] || connection.status;
    $("statusDot").classList.toggle("connected", connected);
    $("lastSync").textContent = connection.last_sync_at
      ? `Última sincronização: ${formatDate(connection.last_sync_at)}`
      : "Nenhuma sincronização realizada.";
    $("redirectUri").textContent = data.redirect_uri || "—";
    $("connect").textContent = connected ? "Reautorizar Bling" : "Conectar ao Bling";
    ["product", "customer", "order", "stock"].forEach((entity) => {
      $(`count${entity[0].toUpperCase()}${entity.slice(1)}`).textContent =
        data.mappings?.[entity] || 0;
    });
    if (!preserveMessage) {
      $("message").className = `notice ${connected ? "ok" : ""}`;
      $("message").textContent = connected
        ? `Conexão ativa. ${data.open_conflicts || 0} conflito(s) aguardando revisão.`
        : data.credentials_configured
          ? "Credenciais prontas. Clique em Conectar ao Bling para autorizar a conta."
          : "A estrutura está pronta. Falta cadastrar as credenciais do aplicativo Bling nos segredos do Supabase.";
    }
    const jobs = data.recent_jobs || [];
    $("jobs").innerHTML = jobs.length
      ? jobs
          .map(
            (job) =>
              `<tr><td>${esc(formatDate(job.created_at))}</td><td>${esc(job.entity_type)}</td><td>${esc(job.operation)}</td><td>${esc(job.status)}</td><td>${esc(job.error_message || `${job.success_count || 0} concluído(s)`)}</td></tr>`,
          )
          .join("")
      : '<tr><td colspan="5">Nenhuma operação registrada.</td></tr>';
  } catch (error) {
    $("message").className = "notice";
    $("message").textContent = error.message || "Falha ao carregar a integração.";
  }
}

$("refresh").onclick = load;
$("connect").onclick = async () => {
  $("connect").disabled = true;
  $("message").textContent = "Preparando autorização segura…";
  try {
    const data = await invoke({ action: "authorize" });
    location.href = data.authorize_url;
  } catch (error) {
    $("message").className = "notice";
    $("message").textContent = error.message || "Não foi possível iniciar a conexão.";
    $("connect").disabled = false;
  }
};

await load();
