import { carregarCatalogo } from "./data-service.js";

const state={data:null,categoria:"Todos",termo:""};
const WHATSAPP_NUMBER="553230253588";
const WHATSAPP_MESSAGE="Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.";
const grid=document.querySelector("#catalogGrid"),filters=document.querySelector("#catalogFilters"),search=document.querySelector("#catalogSearch"),modal=document.querySelector("#productModal"),modalClose=document.querySelector("#modalClose"),whatsappCta=document.querySelector("#whatsappCta"),whatsappFloat=document.querySelector("#whatsappFloat"),whatsappClose=document.querySelector("#whatsappClose");
function normalizar(t=""){return t.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function itensFiltrados(){if(!state.data)return[];const termo=normalizar(state.termo.trim());return state.data.itens.filter(item=>(state.categoria==="Todos"||item.categoria===state.categoria)&&(!termo||normalizar(`${item.nome} ${item.categoria} ${item.descricao}`).includes(termo)))}
function renderFilters(){if(!filters||!state.data)return;filters.innerHTML=state.data.categorias.map(c=>`<button class="filter-btn ${c===state.categoria?"active":""}" data-category="${c}">${c}</button>`).join("")}
function renderCatalog(){if(!grid)return;const itens=itensFiltrados();if(!itens.length){grid.innerHTML='<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>';return}grid.innerHTML=itens.map(item=>`<a class="product-card" href="${item.href||'#'}" aria-label="Ver ${item.nome}"><div class="product-media">${item.icone||'•'}</div><div class="product-body"><span class="product-category">${item.categoria}</span><h3>${item.nome}</h3><p>${item.descricao}</p><span class="product-more">Ver opções →</span></div></a>`).join("")}
if(filters)filters.addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;state.categoria=b.dataset.category;renderFilters();renderCatalog()});
if(search)search.addEventListener("input",e=>{state.termo=e.target.value;renderCatalog()});
if(modal&&modalClose)modalClose.addEventListener("click",()=>modal.close());
if(whatsappCta)whatsappCta.addEventListener("click",e=>{e.preventDefault();window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,"_blank","noopener,noreferrer")});
if(whatsappFloat&&whatsappClose){const hiddenUntil=Number(localStorage.getItem("cromaWhatsappHiddenUntil")||0);if(hiddenUntil>Date.now())whatsappFloat.hidden=true;whatsappClose.addEventListener("click",()=>{whatsappFloat.hidden=true;localStorage.setItem("cromaWhatsappHiddenUntil",String(Date.now()+86400000))})}

function setupMobileMenu(){
  const header=document.querySelector('.site-header');
  if(!header)return;
  const old=header.querySelector('.mobile-quick-nav');
  if(old)old.remove();
  if(header.querySelector('.mobile-menu-toggle'))return;

  const toggle=document.createElement('button');
  toggle.className='mobile-menu-toggle';
  toggle.type='button';
  toggle.setAttribute('aria-label','Abrir menu');
  toggle.setAttribute('aria-expanded','false');
  toggle.setAttribute('aria-controls','mobileMainNav');
  toggle.innerHTML='<span></span><span></span><span></span>';

  const nav=document.createElement('nav');
  nav.className='mobile-nav';
  nav.id='mobileMainNav';
  nav.setAttribute('aria-label','Navegação mobile');
  nav.innerHTML=`
    <a class="mobile-nav-link" href="#ambientes">Ambientes</a>
    <details class="mobile-nav-group">
      <summary class="mobile-nav-trigger">Serviços <span aria-hidden="true">⌄</span></summary>
      <div class="mobile-submenu">
        <a href="servicos/adesivos/">Adesivos personalizados</a>
        <a href="servicos/banner-lona/">Banner em lona</a>
        <a href="servicos/placas-acm/">Placas e ACM</a>
        <a href="servicos/cartoes/">Cartões de visita</a>
        <a href="servicos/folders/">Folders e panfletos</a>
        <a href="servicos/blocos/">Blocos e receituários</a>
        <a href="servicos/papelaria-personalizada/">Papelaria personalizada</a>
        <a href="servicos/sites-catalogos/">Sites e catálogos digitais</a>
        <a class="mobile-submenu-all" href="servicos/">Ver todos os serviços →</a>
      </div>
    </details>
    <a class="mobile-nav-link" href="#catalogo">Catálogo</a>
    <a class="mobile-nav-link" href="#portfolio">Portfólio</a>
    <a class="mobile-nav-link" href="#sobre">Sobre</a>
    <a class="mobile-nav-cta" href="#orcamento">Pedir orçamento</a>`;

  header.append(toggle,nav);
  const close=()=>{header.classList.remove('mobile-menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menu')};
  toggle.addEventListener('click',()=>{const open=!header.classList.contains('mobile-menu-open');header.classList.toggle('mobile-menu-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>760)close()});
}
setupMobileMenu();

document.querySelectorAll('.service-card').forEach(card=>{card.style.cursor='pointer';card.setAttribute('tabindex','0');const go=()=>location.href='servicos/';card.addEventListener('click',go);card.addEventListener('keydown',e=>{if(e.key==='Enter'){go()}})});
async function init(){state.data=await carregarCatalogo();renderFilters();renderCatalog()}init();
