import { carregarCatalogo } from "./data-service.js";

const state={data:null,categoria:"Todos",termo:""};
const WHATSAPP_NUMBER="553230253588";
const WHATSAPP_MESSAGE="Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.";
const grid=document.querySelector("#catalogGrid"),filters=document.querySelector("#catalogFilters"),search=document.querySelector("#catalogSearch"),modal=document.querySelector("#productModal"),modalClose=document.querySelector("#modalClose"),whatsappCta=document.querySelector("#whatsappCta"),whatsappFloat=document.querySelector("#whatsappFloat"),whatsappClose=document.querySelector("#whatsappClose");
function normalizar(t=""){return t.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function itensFiltrados(){if(!state.data)return[];const termo=normalizar(state.termo.trim());return state.data.itens.filter(item=>(state.categoria==="Todos"||item.categoria===state.categoria)&&(!termo||normalizar(`${item.nome} ${item.categoria} ${item.descricao}`).includes(termo)))}
function renderFilters(){filters.innerHTML=state.data.categorias.map(c=>`<button class="filter-btn ${c===state.categoria?"active":""}" data-category="${c}">${c}</button>`).join("")}
function renderCatalog(){const itens=itensFiltrados();if(!itens.length){grid.innerHTML='<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>';return}grid.innerHTML=itens.map(item=>`<a class="product-card" href="${item.href||'#'}" aria-label="Ver ${item.nome}"><div class="product-media">${item.icone||'•'}</div><div class="product-body"><span class="product-category">${item.categoria}</span><h3>${item.nome}</h3><p>${item.descricao}</p><span class="product-more">Ver opções →</span></div></a>`).join("")}
filters.addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;state.categoria=b.dataset.category;renderFilters();renderCatalog()});
search.addEventListener("input",e=>{state.termo=e.target.value;renderCatalog()});
if(modal&&modalClose)modalClose.addEventListener("click",()=>modal.close());
if(whatsappCta)whatsappCta.addEventListener("click",e=>{e.preventDefault();window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,"_blank","noopener,noreferrer")});
if(whatsappFloat&&whatsappClose){const hiddenUntil=Number(localStorage.getItem("cromaWhatsappHiddenUntil")||0);if(hiddenUntil>Date.now())whatsappFloat.hidden=true;whatsappClose.addEventListener("click",()=>{whatsappFloat.hidden=true;localStorage.setItem("cromaWhatsappHiddenUntil",String(Date.now()+86400000))})}
const servicesNav=document.querySelector('.nav a[href="#servicos"]');if(servicesNav)servicesNav.href="servicos/";
document.querySelectorAll('.service-card').forEach(card=>{card.style.cursor='pointer';card.setAttribute('tabindex','0');const go=()=>location.href='servicos/';card.addEventListener('click',go);card.addEventListener('keydown',e=>{if(e.key==='Enter'){go()}})});
async function init(){state.data=await carregarCatalogo();renderFilters();renderCatalog()}init();
