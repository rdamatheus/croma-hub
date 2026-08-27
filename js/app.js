import { renderProductVisual } from "./product-visual.js";
import { carregarCatalogo } from "./data-service.js";
import { setupNavigation } from "./navigation.js";

if (!document.querySelector("script[data-croma-cart]")) {
  const script = document.createElement("script");
  script.src = "/js/cart.js?v=20260821-2";
  script.dataset.cromaCart = "1";
  document.head.appendChild(script);
}

setupNavigation();

const state = { data: null, categoria: "Todos", termo: "" };
const CATEGORY_ORDER = [
  "Todos",
  "Comunicação Visual",
  "Gráfica",
  "Eventos",
  "Papelaria",
  "Presentes",
  "Eletrônicos",
  "Digital",
];
const WHATSAPP_NUMBER = "553230253588";
const WHATSAPP_MESSAGE =
  "Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.";

const grid = document.querySelector("#catalogGrid");
const filters = document.querySelector("#catalogFilters");
const search = document.querySelector("#catalogSearch");
const modal = document.querySelector("#productModal");
const modalClose = document.querySelector("#modalClose");
const whatsappCta = document.querySelector("#whatsappCta");
const whatsappFloat = document.querySelector("#whatsappFloat");
const whatsappClose = document.querySelector("#whatsappClose");

const normalizar = (text = "") =>
  text
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
const moeda = (value) =>
  Number(value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

function itensFiltrados() {
  if (!state.data) return [];
  const termo = normalizar(state.termo.trim());
  return state.data.itens.filter(
    (item) =>
      (state.categoria === "Todos" || item.categoria === state.categoria) &&
      (!termo ||
        normalizar(`${item.nome} ${item.categoria} ${item.descricao}`).includes(
          termo,
        )),
  );
}

function categoriasDisponiveis() {
  const available = new Set([
    ...(state.data?.categorias || []),
    ...(state.data?.itens || []).map((item) => item.categoria).filter(Boolean),
  ]);
  return CATEGORY_ORDER.filter((category) => available.has(category)).concat(
    [...available].filter((category) => !CATEGORY_ORDER.includes(category)),
  );
}

function renderFilters() {
  if (!filters || !state.data) return;
  filters.innerHTML = categoriasDisponiveis()
    .map(
      (category) =>
        `<button class="filter-btn ${category === state.categoria ? "active" : ""}" data-category="${esc(category)}">${esc(category)}</button>`,
    )
    .join("");
}

function renderCatalog() {
  if (!grid) return;
  const itens = itensFiltrados();
  if (!itens.length) {
    grid.innerHTML =
      '<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>';
    return;
  }
  grid.innerHTML = itens
    .map(
      (item) => `
    <article class="product-card" aria-label="${esc(item.nome)}">
      ${renderProductVisual(item)}
      <div class="product-body">
        <span class="product-category">${esc(item.categoria)}</span>
        <h3>${esc(item.nome)}</h3>
        <p>${esc(item.descricao)}</p>
        ${item.precoVenda ? `<div class="catalog-price"><small>${item.quantidadePreco || 1} unidades a partir de</small><strong>${moeda(item.precoVenda)}</strong></div>` : ""}
        <span class="product-more">Vitrine Croma</span>
      </div>
    </article>`,
    )
    .join("");
}

filters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.categoria = button.dataset.category;
  renderFilters();
  renderCatalog();
});

search?.addEventListener("input", (event) => {
  state.termo = event.target.value;
  renderCatalog();
});

modalClose?.addEventListener("click", () => modal?.close());

whatsappCta?.addEventListener("click", (event) => {
  event.preventDefault();
  window.open(
    `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,
    "_blank",
    "noopener,noreferrer",
  );
});

if (whatsappFloat && whatsappClose) {
  const hiddenUntil = Number(
    localStorage.getItem("cromaWhatsappHiddenUntil") || 0,
  );
  if (hiddenUntil > Date.now()) whatsappFloat.hidden = true;
  whatsappClose.addEventListener("click", () => {
    whatsappFloat.hidden = true;
    localStorage.setItem(
      "cromaWhatsappHiddenUntil",
      String(Date.now() + 86400000),
    );
  });
}

document.querySelectorAll(".service-card").forEach((card) => {
  card.style.cursor = "pointer";
  card.setAttribute("tabindex", "0");
  const go = () => (location.href = "/servicos/");
  card.addEventListener("click", go);
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter") go();
  });
});

async function init() {
  state.data = await carregarCatalogo();
  renderFilters();
  renderCatalog();
}

init();
