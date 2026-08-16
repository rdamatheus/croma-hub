import { carregarCatalogo } from "./data-service.js";

const state={data:null,categoria:"Todos",termo:""};
const WHATSAPP_NUMBER="553230253588";
const WHATSAPP_MESSAGE="Olá! Vim pelo Croma Hub e gostaria de solicitar um orçamento.";
const grid=document.querySelector("#catalogGrid"),filters=document.querySelector("#catalogFilters"),search=document.querySelector("#catalogSearch"),modal=document.querySelector("#productModal"),modalClose=document.querySelector("#modalClose"),whatsappCta=document.querySelector("#whatsappCta"),whatsappFloat=document.querySelector("#whatsappFloat"),whatsappClose=document.querySelector("#whatsappClose");
function normalizar(t=""){return t.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g,"")}
function itensFiltrados(){if(!state.data)return[];const termo=normalizar(state.termo.trim());return state.data.itens.filter(item=>(state.categoria==="Todos"||item.categoria===state.categoria)&&(!termo||normalizar(`${item.nome} ${item.categoria} ${item.descricao}`).includes(termo)))}
function renderFilters(){if(!filters||!state.data)return;filters.innerHTML=state.data.categorias.map(c=>`<button class="filter-btn ${c===state.categoria?"active":""}" data-category="${c}">${c}</button>`).join("")}
function moeda(v){return Number(v).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function renderCatalog(){if(!grid)return;const itens=itensFiltrados();if(!itens.length){grid.innerHTML='<div class="empty-state">Nenhum item encontrado. Tente outra busca ou categoria.</div>';return}grid.innerHTML=itens.map(item=>`<a class="product-card" href="${item.href||'#'}" aria-label="Ver ${item.nome}"><div class="product-media ${item.imagem?'has-image':''}">${item.imagem?`<img src="${item.imagem}" alt="${item.nome}" loading="lazy">`:(item.icone||'•')}</div><div class="product-body"><span class="product-category">${item.categoria}</span><h3>${item.nome}</h3><p>${item.descricao}</p>${item.precoVenda?`<div class="catalog-price"><small>${item.quantidadePreco||1} unidades a partir de</small><strong>${moeda(item.precoVenda)}</strong></div>`:''}<span class="product-more">Ver opções →</span></div></a>`).join("")}
if(filters)filters.addEventListener("click",e=>{const b=e.target.closest("[data-category]");if(!b)return;state.categoria=b.dataset.category;renderFilters();renderCatalog()});
if(search)search.addEventListener("input",e=>{state.termo=e.target.value;renderCatalog()});
if(modal&&modalClose)modalClose.addEventListener("click",()=>modal.close());
if(whatsappCta)whatsappCta.addEventListener("click",e=>{e.preventDefault();window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`,"_blank","noopener,noreferrer")});
if(whatsappFloat&&whatsappClose){const hiddenUntil=Number(localStorage.getItem("cromaWhatsappHiddenUntil")||0);if(hiddenUntil>Date.now())whatsappFloat.hidden=true;whatsappClose.addEventListener("click",()=>{whatsappFloat.hidden=true;localStorage.setItem("cromaWhatsappHiddenUntil",String(Date.now()+86400000))})}

function injectMobileMenuStyles(){
  if(document.querySelector('#cromaMobileMenuStyles'))return;
  const style=document.createElement('style');
  style.id='cromaMobileMenuStyles';
  style.textContent=`
    .mobile-menu-toggle,.mobile-nav{display:none}
    @media(max-width:760px){
      .site-header{padding:10px 12px!important;flex-wrap:nowrap!important;overflow:visible!important}
      .site-header>.nav,.site-header>.btn-small,.mobile-quick-nav{display:none!important}
      .site-header>.brand{max-width:calc(100% - 58px)!important}
      .mobile-menu-toggle{display:grid!important;place-items:center;width:44px;height:44px;flex:none;padding:10px;border:1px solid rgba(48,41,127,.14);border-radius:14px;background:#fff;color:var(--croma-navy-deep);box-shadow:0 8px 22px rgba(48,41,127,.08);cursor:pointer}
      .mobile-menu-toggle span{display:block;width:21px;height:2px;margin:2px 0;border-radius:99px;background:currentColor;transition:.2s ease}
      .mobile-menu-open .mobile-menu-toggle span:nth-child(1){transform:translateY(6px) rotate(45deg)}
      .mobile-menu-open .mobile-menu-toggle span:nth-child(2){opacity:0}
      .mobile-menu-open .mobile-menu-toggle span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}
      .mobile-nav{display:none!important;position:absolute;top:100%;left:0;right:0;max-height:calc(100vh - 68px);overflow-y:auto;padding:8px 14px 18px;background:#fff;border-top:1px solid var(--line);border-bottom:1px solid var(--line);box-shadow:0 22px 50px rgba(33,28,92,.16);z-index:130}
      .mobile-menu-open .mobile-nav{display:block!important}
      .mobile-nav-link,.mobile-nav-trigger{display:flex;align-items:center;justify-content:space-between;min-height:52px;width:100%;padding:13px 6px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--croma-navy-deep);font-size:.98rem;font-weight:850;text-align:left;list-style:none}
      .mobile-nav-trigger::-webkit-details-marker{display:none}
      .mobile-nav-group[open] .mobile-nav-trigger span{transform:rotate(180deg)}
      .mobile-submenu{padding:0 0 2px 14px}
      .mobile-submenu a{display:block;padding:11px 10px;border-left:2px solid #eceaf5;color:#5c5970;font-size:.91rem;font-weight:720}
      .mobile-submenu a+a{border-top:1px solid #f0eef6}
      .mobile-submenu .mobile-submenu-all{color:var(--croma-navy);font-weight:900;border-left-color:var(--croma-magenta)}
      .mobile-nav-cta{display:flex;align-items:center;justify-content:center;min-height:50px;margin-top:14px;padding:12px 18px;border-radius:999px;background:var(--croma-navy);color:#fff;font-weight:900}
    }`;
  document.head.appendChild(style);
}

function setupMobileMenu(){
  injectMobileMenuStyles();
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
async function init(){state.data=await carregarCatalogo();try{const saved=JSON.parse(localStorage.getItem('croma_catalog_price_overrides')||'{}');state.data.itens.forEach(item=>Object.assign(item,saved[item.id]||{}))}catch(e){}renderFilters();renderCatalog()}init();
