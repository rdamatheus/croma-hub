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
const credentialState = {
  configured: false,
  clientIdMasked: null,
  updatedAt: null,
  invitationUrl: null,
};
let editingCredentials = false;

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke("bling-erp", { body });
  if (error) {
    let message = readableError(error);
    try {
      const response = error.context;
      if (response?.json) {
        const detail = await response.json();
        message = readableError(detail) || message;
      }
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(readableError(data));
  return data;
}

function readableError(value) {
  if (!value) return "Falha inesperada na integração.";
  if (typeof value === "string") return value;
  for (const key of ["message", "detail", "error"]) {
    if (typeof value[key] === "string") return value[key];
    if (value[key] && value[key] !== value) {
      const nested = readableError(value[key]);
      if (nested) return nested;
    }
  }
  return "Não foi possível concluir a operação do Bling.";
}

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      })
    : "—";
}

function setCredentialMessage(message, ok = false) {
  $("credentialsMessage").textContent = message;
  $("credentialsMessage").className = `notice ${ok ? "ok" : ""}`;
}

function clearCredentialMessage() {
  $("credentialsMessage").textContent = "";
  $("credentialsMessage").className = "notice hidden";
}

function setCredentialEditing(enabled) {
  editingCredentials = enabled;
  $("clientId").disabled = !enabled;
  $("clientSecret").disabled = !enabled;
  $("invitationUrl").disabled = !enabled;
  $("toggleSecret").disabled = !enabled;
  $("saveCredentials").classList.toggle("hidden", !enabled);
  $("cancelCredentials").classList.toggle("hidden", !enabled);
  $("editCredentials").classList.toggle("hidden", enabled);
  if (enabled) {
    $("clientId").value = "";
    $("clientSecret").value = "";
    $("invitationUrl").value = credentialState.invitationUrl || "";
    $("clientSecret").type = "password";
    $("toggleSecret").textContent = "Mostrar";
    $("clientId").placeholder = credentialState.configured
      ? "Deixe em branco para manter o Client ID atual"
      : "Cole o Client ID fornecido pelo Bling";
    $("clientSecret").placeholder = credentialState.configured
      ? "Deixe em branco para manter o segredo atual"
      : "Cole o Client Secret fornecido pelo Bling";
    $("clientId").focus();
  }
}

function renderCredentialStatus(data) {
  credentialState.configured = Boolean(data.credentials_configured);
  credentialState.clientIdMasked = data.client_id_masked || null;
  credentialState.updatedAt = data.credentials_updated_at || null;
  credentialState.invitationUrl = data.invitation_url || null;

  $("credentialsBadge").textContent = credentialState.configured
    ? "🔒 Credenciais protegidas"
    : "🔒 Não configurado";
  $("credentialsBadge").classList.toggle("ready", credentialState.configured);
  $("clientIdHint").textContent = credentialState.clientIdMasked
    ? `Client ID salvo: ${credentialState.clientIdMasked}`
    : "Nenhum Client ID salvo.";
  $("secretHint").textContent = credentialState.configured
    ? "Segredo configurado. Deixe o campo vazio para mantê-lo."
    : "O valor nunca será devolvido ao navegador.";
  $("credentialsMeta").textContent = credentialState.updatedAt
    ? `Última alteração: ${formatDate(credentialState.updatedAt)}. O valor secreto permanece oculto.`
    : "Nenhuma credencial foi cadastrada neste ambiente.";
  $("validateCredentials").disabled = !credentialState.configured;
  $("connect").disabled = !credentialState.configured;
  $("copyInvitation").disabled = !credentialState.invitationUrl;
  $("invitationUrl").value = credentialState.invitationUrl || "";
  $("invitationHint").textContent = credentialState.invitationUrl
    ? "Link do Bling salvo. Ao conectar, o sistema usará um state temporário novo."
    : "O sistema validará o domínio e o Client ID antes de salvar.";
  if (!editingCredentials) setCredentialEditing(!credentialState.configured);
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
    $("redirectUriInput").value = data.redirect_uri || "";
    $("connect").textContent = connected ? "Reautorizar Bling" : "Conectar ao Bling";
    renderCredentialStatus(data);
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
          : "Cadastre o Client ID e o Client Secret na configuração da conexão.";
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
$("editCredentials").onclick = () => {
  clearCredentialMessage();
  setCredentialEditing(true);
};
$("cancelCredentials").onclick = () => {
  clearCredentialMessage();
  $("clientId").value = "";
  $("clientSecret").value = "";
  $("invitationUrl").value = credentialState.invitationUrl || "";
  setCredentialEditing(false);
};
$("toggleSecret").onclick = () => {
  const showing = $("clientSecret").type === "text";
  $("clientSecret").type = showing ? "password" : "text";
  $("toggleSecret").textContent = showing ? "Mostrar" : "Ocultar";
};
$("copyRedirect").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("redirectUriInput").value);
    setCredentialMessage("URL de redirecionamento copiada.", true);
  } catch {
    setCredentialMessage("Não foi possível copiar automaticamente. Selecione a URL e copie.");
  }
};
$("copyInvitation").onclick = async () => {
  try {
    await navigator.clipboard.writeText(credentialState.invitationUrl || "");
    setCredentialMessage("Link de convite do Bling copiado.", true);
  } catch {
    setCredentialMessage("Não foi possível copiar automaticamente. Selecione o link e copie.");
  }
};
$("credentialsForm").onsubmit = async (event) => {
  event.preventDefault();
  if (!editingCredentials) return;
  const clientId = $("clientId").value.trim();
  const clientSecret = $("clientSecret").value.trim();
  const invitationUrl = $("invitationUrl").value.trim();
  if (!credentialState.configured && (!clientId || !clientSecret || !invitationUrl)) {
    setCredentialMessage(
      "Informe o Client ID, o Client Secret e o link de convite fornecidos pelo Bling.",
    );
    return;
  }
  $("saveCredentials").disabled = true;
  $("cancelCredentials").disabled = true;
  setCredentialMessage("Protegendo e salvando as credenciais…");
  try {
    const data = await invoke({
      action: "save_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      invitation_url: invitationUrl,
    });
    $("clientId").value = "";
    $("clientSecret").value = "";
    setCredentialEditing(false);
    setCredentialMessage(data.message || "Configuração salva com segurança.", true);
    await load();
  } catch (error) {
    setCredentialMessage(error.message || "Não foi possível salvar a configuração.");
  } finally {
    $("saveCredentials").disabled = false;
    $("cancelCredentials").disabled = false;
  }
};
$("validateCredentials").onclick = async () => {
  $("validateCredentials").disabled = true;
  setCredentialMessage("Validando a configuração protegida…");
  try {
    const data = await invoke({ action: "validate_credentials" });
    setCredentialMessage(data.message || "Configuração validada.", true);
  } catch (error) {
    setCredentialMessage(error.message || "A configuração não pôde ser validada.");
  } finally {
    $("validateCredentials").disabled = !credentialState.configured;
  }
};
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
