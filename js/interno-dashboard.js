import { supabase } from "./croma-supabase.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export async function loadDashboard() {
  const today = new Date().toISOString().slice(0, 10);
  const [ordersResult, tasksResult, stockResult] = await Promise.all([
    supabase
      .from("orders")
      .select("id,order_code,status,created_at,customer_profiles(nome)")
      .not("status", "in", "(concluido,cancelado)")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("tasks")
      .select("id,titulo,status,prioridade,data_limite")
      .not("status", "in", "(concluida,cancelada)")
      .order("data_limite", { ascending: true })
      .limit(20),
    supabase
      .from("inventory_replenishment_report")
      .select(
        "product_name,variant_name,stock_level,suggested_purchase_quantity",
      )
      .limit(20),
  ]);
  const orders = ordersResult.data || [],
    tasks = tasksResult.data || [],
    stock = stockResult.data || [];
  document.getElementById("metricOrders").textContent = orders.length;
  document.getElementById("metricProduction").textContent = orders.filter(
    (order) => order.status === "em_producao",
  ).length;
  document.getElementById("metricTasks").textContent = tasks.filter(
    (task) => task.data_limite && task.data_limite < today,
  ).length;
  document.getElementById("metricStock").textContent = stock.length;
  const attention = [];
  tasks
    .filter((task) => task.data_limite && task.data_limite < today)
    .slice(0, 3)
    .forEach((task) =>
      attention.push([
        `Tarefa atrasada: ${task.titulo}`,
        task.data_limite.split("-").reverse().join("/"),
      ]),
    );
  orders
    .filter((order) => order.status === "em_producao")
    .slice(0, 3)
    .forEach((order) =>
      attention.push([
        `${order.order_code} · ${order.customer_profiles?.nome || "Cliente"}`,
        "Em produção",
      ]),
    );
  stock
    .slice(0, 3)
    .forEach((item) =>
      attention.push([
        `Comprar: ${item.product_name}${item.variant_name ? " · " + item.variant_name : ""}`,
        `${item.suggested_purchase_quantity} sugerido`,
      ]),
    );
  document.getElementById("attentionList").innerHTML = attention.length
    ? attention
        .map(
          ([title, meta]) =>
            `<div class="attention-item"><strong>${esc(title)}</strong><span class="internal-muted">${esc(meta)}</span></div>`,
        )
        .join("")
    : '<span class="internal-muted">Nenhum alerta crítico neste momento.</span>';
}
