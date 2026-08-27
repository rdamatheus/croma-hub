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
let roles = [],
  departments = [],
  users = [],
  editing = null;

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke("admin-staff-users", {
    body,
  });
  if (error) throw error;
  if (data?.error) {
    const labels = {
      OWNER_REQUIRED: "Somente o proprietário pode executar esta ação.",
      LAST_OWNER_PROTECTED:
        "O último proprietário ativo não pode ser desativado ou rebaixado.",
    };
    throw new Error(labels[data.error] || data.error);
  }
  return data;
}

async function load() {
  const [roleResult, departmentResult, userResult] = await Promise.all([
    supabase
      .from("access_roles")
      .select("code,label,description,hierarchy_level")
      .eq("active", true)
      .order("hierarchy_level", { ascending: false }),
    supabase
      .from("departments")
      .select("id,code,label")
      .eq("active", true)
      .order("sort_order"),
    invoke({ action: "list" }),
  ]);
  if (roleResult.error) throw roleResult.error;
  if (departmentResult.error) throw departmentResult.error;
  roles = roleResult.data || [];
  departments = departmentResult.data || [];
  users = userResult.users || [];
  $("role").innerHTML = roles
    .map(
      (role) => `<option value="${esc(role.code)}">${esc(role.label)}</option>`,
    )
    .join("");
  $("departments").innerHTML = departments
    .map(
      (department) =>
        `<label><input type="checkbox" name="department_ids" value="${esc(department.id)}"> ${esc(department.label)}</label>`,
    )
    .join("");
  render();
}

function userDepartments(user) {
  return (user.profile_departments || [])
    .map((item) => item.departments?.label)
    .filter(Boolean);
}
function render() {
  const query = $("search").value.trim().toLowerCase();
  const list = users.filter((user) =>
    [user.nome, user.email, user.cargo, user.role, ...userDepartments(user)]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
  $("userRows").innerHTML = list.length
    ? list
        .map(
          (user) =>
            `<tr><td><strong>${esc(user.nome)}</strong><br><small>${esc(user.email)}</small><br><small>${esc(user.cargo || "Sem cargo informado")}</small></td><td><span class="role">${esc(roles.find((role) => role.code === user.role)?.label || user.role)}</span></td><td>${esc(userDepartments(user).join(", ") || "Não definido")}</td><td><span class="status ${user.ativo ? "active" : ""}">${user.ativo ? "Ativo" : "Inativo"}</span></td><td><button class="internal-btn secondary" data-edit="${esc(user.id)}">Configurar</button></td></tr>`,
        )
        .join("")
    : '<tr><td colspan="5" class="internal-muted">Nenhum usuário encontrado.</td></tr>';
}

function open(user = null) {
  editing = user;
  $("dialogTitle").textContent = user ? "Configurar usuário" : "Novo usuário";
  const form = $("userForm");
  form.reset();
  form.nome.value = user?.nome || "";
  form.email.value = user?.email || "";
  form.cargo.value = user?.cargo || "";
  form.role.value = user?.role || "equipe";
  form.ativo.value = String(user?.ativo ?? true);
  form.password.required = !user;
  $("passwordHint").textContent = user
    ? "(deixe vazio para manter)"
    : "(obrigatória)";
  const selected = new Set(
    (user?.profile_departments || []).map((item) => item.department_id),
  );
  form
    .querySelectorAll('[name="department_ids"]')
    .forEach((input) => (input.checked = selected.has(input.value)));
  $("message").textContent = "";
  $("dialog").showModal();
}

$("search").addEventListener("input", render);
$("newUser").onclick = () => open();
$("close").onclick = $("cancel").onclick = () => $("dialog").close();
$("userRows").addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit]");
  if (button) open(users.find((user) => user.id === button.dataset.edit));
});
$("userForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  $("message").textContent = "Salvando...";
  const payload = {
    action: editing ? "update" : "create",
    id: editing?.id,
    nome: data.get("nome"),
    email: data.get("email"),
    cargo: data.get("cargo"),
    role: data.get("role"),
    ativo: data.get("ativo") === "true",
    password: data.get("password"),
    department_ids: data.getAll("department_ids"),
  };
  try {
    await invoke(payload);
    $("dialog").close();
    await load();
  } catch (error) {
    $("message").textContent = error.message || "Não foi possível salvar.";
  }
});

await load();
