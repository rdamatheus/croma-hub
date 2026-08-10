import { carregarCatalogo } from "./data-service.js";

const state = {
  data: null,
  categoria: "Todos",
  termo: ""
};

const WHATSAPP_NUMBER = "553230253588";
const WHATSAPP_MESSAGE = "Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.";

const grid = document.querySelector("#catalogGrid");
const filters = document.querySelector("#catalogFilters");
const search = document.querySelector("#catalogSearch");
const modal = document.querySelector("#productModal");
const modalContent = document.querySelector("#modalContent");
const modalClose = document.querySelector("#modalClose");
const whatsappCta = document.querySelector("#whatsappCta");
const whatsappFloat = document.querySelector("#whatsappFloat");
const whatsappClose = document.querySelector("#whatsappClose");

function normalizar(texto = "") {
  return texto
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function itensFiltrados() {
  if (!state.data) return [];
  const termo = normalizar(state.termo.trim());

  return state.data.itens.filter((item) => {
    const bateCategoria = state.categoria === "Todos" || item.categoria === state.categoria;
    const alvo = normalizar(`${item.nome} ${item.categoria} ${item.descricao}`);
    const bateTermo = !termo || alvo.includes(termo);
    return bateCategoria && bateTermo;
  });
}

function renderFilters() {
  filters.innerHTML = state.data.categorias.map((categoria) => `
    <button class="filter-btn ${categoria === state.categoria ? "active" : ""}" data-category="${categoria}">
      ${categoria}
    </button>
  `).join("");
}

function renderCatalog() {
  const itens = itensFiltrados();

  if (!itens.length) {
    grid.innerHTML = `<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>`;
    return;
  }

  grid.innerHTML = itens.map((item) => `
    <article class="product-card" data-id="${item.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${item.nome}">
      <div class="product-media">${item.icone || "•"}</div>
      <div class="product-body">
        <span class="product-category">${item.categoria}</span>
        <h3>${item.nome}</h3>
        <p>${item.descricao}</p>
        <span class="product-more">Ver detalhes →</span>
      </div>
    </article>
  `).join("");
}

function abrirProduto(id) {
  const item = state.data.itens.find((produto) => produto.id === id);
  if (!item) return;

  const destaques = (item.destaques || []).map((d) => `<li>${d}</li>`).join("");
  modalContent.innerHTML = `
    <div class="modal-inner">
      <span class="modal-badge">${item.categoria}</span>
      <h3>${item.nome}</h3>
      <p>${item.descricao}</p>
      ${destaques ? `<ul>${destaques}</ul>` : ""}
      <a class="btn" href="#orcamento" data-close-modal>Solicitar orçamento</a>
    </div>
  `;
  modal.showModal();
}

function abrirWhatsApp() {
  const mensagem = encodeURIComponent(WHATSAPP_MESSAGE);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${mensagem}`, "_blank", "noopener,noreferrer");
}

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.categoria = button.dataset.category;
  renderFilters();
  renderCatalog();
});

search.addEventListener("input", (event) => {
  state.termo = event.target.value;
  renderCatalog();
});

grid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-id]");
  if (card) abrirProduto(card.dataset.id);
});

grid.addEventListener("keydown", (event) => {
  const card = event.target.closest("[data-id]");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    abrirProduto(card.dataset.id);
  }
});

modalClose.addEventListener("click", () => modal.close());
modal.addEventListener("click", (event) => {
  if (event.target === modal || event.target.closest("[data-close-modal]")) modal.close();
});

whatsappCta.addEventListener("click", (event) => {
  event.preventDefault();
  abrirWhatsApp();
});

if (whatsappFloat && whatsappClose) {
  const hiddenUntil = Number(localStorage.getItem("cromaWhatsappHiddenUntil") || 0);
  if (hiddenUntil > Date.now()) whatsappFloat.hidden = true;

  whatsappClose.addEventListener("click", () => {
    whatsappFloat.hidden = true;
    localStorage.setItem("cromaWhatsappHiddenUntil", String(Date.now() + 24 * 60 * 60 * 1000));
  });
}

async function init() {
  state.data = await carregarCatalogo();
  renderFilters();
  renderCatalog();
}

init();
