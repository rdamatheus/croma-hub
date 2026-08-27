import { supabase } from "./croma-supabase.js";
import { protectInternalPage } from "./interno-auth.js";

const session = await protectInternalPage();
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
const iso = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const today = () => iso(new Date());
const fmt = (value) =>
  value ? value.split("-").reverse().join("/") : "Sem prazo";
const statusMap = {
  pendente: "todo",
  em_andamento: "doing",
  concluida: "done",
};
const priorityLabel = {
  baixa: "Baixa",
  normal: "Média",
  alta: "Alta",
  critica: "Crítica",
};
const visibilityLabel = {
  all_staff: "Toda a equipe",
  management: "Gerência",
  owner: "Somente owner",
  assignee: "Responsável",
};
let tasks = [],
  departments = [],
  profiles = [],
  routines = [],
  viewDate = new Date();

function department(id) {
  return departments.find((item) => item.id === id)?.label || "Sem setor";
}
function responsible(id) {
  return profiles.find((item) => item.id === id)?.nome || "Sem responsável";
}
function status(task) {
  return statusMap[task.status] || "todo";
}

async function load() {
  const [taskResult, departmentResult, profileResult, routineResult] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .order("data_limite", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("departments")
        .select("id,code,label,description")
        .eq("active", true)
        .order("sort_order"),
      supabase
        .from("profiles")
        .select("id,nome,cargo,role,ativo")
        .eq("ativo", true)
        .order("nome"),
      supabase
        .from("routines")
        .select("*,categories(nome)")
        .eq("ativa", true)
        .order("ordem"),
    ]);
  for (const result of [
    taskResult,
    departmentResult,
    profileResult,
    routineResult,
  ])
    if (result.error) throw result.error;
  tasks = taskResult.data || [];
  departments = departmentResult.data || [];
  profiles = profileResult.data || [];
  routines = routineResult.data || [];
  renderSelects();
  render();
}

function card(task) {
  const late =
    task.data_limite && task.data_limite < today() && status(task) !== "done";
  return `<div class="task"><strong>${esc(task.titulo)}</strong><small>${esc(department(task.department_id))} · ${esc(responsible(task.responsavel_id))}${task.descricao ? " · " + esc(task.descricao) : ""}</small><div class="meta"><span class="pill ${late ? "late" : ""}">${fmt(task.data_limite)}</span><span class="pill ${task.prioridade === "alta" || task.prioridade === "critica" ? "warn" : ""}">${esc(priorityLabel[task.prioridade] || task.prioridade)}</span><span class="pill">${esc(visibilityLabel[task.visibility_level] || task.visibility_level)}</span></div><div class="actions">${status(task) !== "todo" ? `<button class="btn alt" data-move="${task.id}:pendente">A fazer</button>` : ""}${status(task) !== "doing" ? `<button class="btn alt" data-move="${task.id}:em_andamento">Em andamento</button>` : ""}${status(task) !== "done" ? `<button class="btn" data-move="${task.id}:concluida">Concluir</button>` : ""}<button class="btn danger" data-del="${task.id}">Excluir</button></div></div>`;
}

function renderBoard() {
  ["todo", "doing", "done"].forEach(
    (column) =>
      ($(column).innerHTML =
        tasks
          .filter((task) => status(task) === column)
          .map(card)
          .join("") || "<small>Nenhuma tarefa.</small>"),
  );
  const current = today(),
    todayTasks = tasks.filter((task) => task.data_limite === current),
    open = tasks.filter(
      (task) => !["concluida", "cancelada"].includes(task.status),
    ),
    late = open.filter(
      (task) => task.data_limite && task.data_limite < current,
    );
  $("kToday").textContent = todayTasks.length;
  $("kDone").textContent = todayTasks.filter(
    (task) => task.status === "concluida",
  ).length;
  $("kOpen").textContent = open.length;
  $("kLate").textContent = late.length;
  const next = [...open].sort((a, b) =>
    (a.data_limite || "9999").localeCompare(b.data_limite || "9999"),
  )[0];
  $("nextTitle").textContent = next?.titulo || "Nenhuma tarefa pendente";
  $("nextMeta").textContent = next
    ? `${department(next.department_id)} · ${fmt(next.data_limite)} · ${responsible(next.responsavel_id)}`
    : "O dia está em dia.";
}

function renderCalendar() {
  const year = viewDate.getFullYear(),
    month = viewDate.getMonth();
  $("monthTitle").textContent = new Date(year, month, 1).toLocaleDateString(
    "pt-BR",
    { month: "long", year: "numeric" },
  );
  const first = new Date(year, month, 1),
    start = new Date(year, month, 1 - first.getDay());
  let output = "";
  for (let index = 0; index < 42; index++) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateString = iso(date),
      events = tasks.filter(
        (task) =>
          task.data_limite === dateString && task.status !== "cancelada",
      );
    output += `<div class="day ${date.getMonth() !== month ? "muted" : ""} ${dateString === today() ? "today" : ""}"><b>${date.getDate()}</b>${events
      .slice(0, 4)
      .map((task) => `<div class="event">${esc(task.titulo)}</div>`)
      .join(
        "",
      )}${events.length > 4 ? `<div class="event">+${events.length - 4}</div>` : ""}</div>`;
  }
  $("cal").innerHTML = output;
}

function renderRoutines() {
  $("routineGrid").innerHTML = routines.length
    ? routines
        .map(
          (routine) =>
            `<div class="routine"><strong>${esc(routine.titulo)}</strong><p>${esc(routine.descricao || "")}</p><div class="meta"><span class="pill">${esc(routine.categories?.nome || "Geral")}</span><span class="pill">${esc(routine.frequencia)}</span><span class="pill">${esc(priorityLabel[routine.prioridade] || routine.prioridade)}</span></div></div>`,
        )
        .join("")
    : '<p class="internal-muted">Nenhuma rotina padronizada cadastrada ainda.</p>';
}
function renderDepartments() {
  $("catGrid").innerHTML = departments
    .map(
      (item) =>
        `<div class="cat"><strong>${esc(item.label)}</strong><p>${esc(item.description || "")}</p></div>`,
    )
    .join("");
}
function render() {
  renderBoard();
  renderCalendar();
  renderRoutines();
  renderDepartments();
}

function renderSelects() {
  $("tDepartment").innerHTML =
    '<option value="">Sem setor</option>' +
    departments
      .map((item) => `<option value="${item.id}">${esc(item.label)}</option>`)
      .join("");
  $("tResponsible").innerHTML =
    '<option value="">Sem responsável</option>' +
    profiles
      .map(
        (profile) =>
          `<option value="${profile.id}">${esc(profile.nome)}${profile.cargo ? " · " + esc(profile.cargo) : ""}</option>`,
      )
      .join("");
}

document.body.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.move) {
    const separator = button.dataset.move.lastIndexOf(":"),
      id = button.dataset.move.slice(0, separator),
      nextStatus = button.dataset.move.slice(separator + 1);
    const { error } = await supabase
      .from("tasks")
      .update({
        status: nextStatus,
        concluida_em:
          nextStatus === "concluida" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) return alert(error.message);
    await load();
  }
  if (button.dataset.del && confirm("Excluir esta tarefa?")) {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", button.dataset.del);
    if (error) return alert(error.message);
    await load();
  }
});

document.querySelectorAll(".tab").forEach(
  (button) =>
    (button.onclick = () => {
      document
        .querySelectorAll(".tab")
        .forEach((item) => item.classList.remove("active"));
      document
        .querySelectorAll(".panel")
        .forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      $(button.dataset.tab).classList.add("active");
    }),
);
$("prev").onclick = () => {
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderCalendar();
};
$("next").onclick = () => {
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderCalendar();
};
$("tDate").value = today();
$("addTask").onclick = async () => {
  const title = $("tTitle").value.trim();
  if (!title) return alert("Informe a tarefa.");
  const payload = {
    titulo: title,
    descricao: $("tObs").value.trim() || null,
    status: "pendente",
    prioridade: $("tPri").value,
    responsavel_id: $("tResponsible").value || null,
    data_inicio: today(),
    data_limite: $("tDate").value || null,
    origem: "pontual",
    visibility_level: $("tVisibility").value,
    department_id: $("tDepartment").value || null,
    created_by: session.user.id,
  };
  const { error } = await supabase.from("tasks").insert(payload);
  if (error) return alert(error.message);
  $("tTitle").value = $("tObs").value = "";
  await load();
  alert("Tarefa adicionada.");
};

await load();
