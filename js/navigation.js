function ensureStyles(){
  if(document.querySelector('link[data-croma-navigation]')) return;
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href='/css/navigation.css?v=20260822-1';
  link.dataset.cromaNavigation='1';
  document.head.appendChild(link);
}

function adjustDesktopNavigation(){
  const nav=document.querySelector('.site-header>.nav');
  if(!nav)return;
  nav.innerHTML='<a href="#catalogo">Produtos</a><a href="/servicos/">Serviços</a><a href="#portfolio">Portfólio</a><a href="#sobre">Sobre</a>';
}

function setupMobileMenu(){
  const header=document.querySelector('.site-header');
  if(!header)return;
  header.querySelector('.mobile-quick-nav')?.remove();
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
    <a class="mobile-nav-link" href="#catalogo">Produtos</a>
    <details class="mobile-nav-group">
      <summary class="mobile-nav-trigger">Serviços <span aria-hidden="true">⌄</span></summary>
      <div class="mobile-submenu">
        <a href="/servicos/impressoes-copias/">Impressão digital e documentos</a>
        <a href="/servicos/foto-produtos/">Foto Produtos</a>
        <a href="/servicos/adesivos/">Adesivos personalizados</a>
        <a href="/servicos/banner-lona/">Banner em lona</a>
        <a href="/servicos/placas-acm/">Placas e ACM</a>
        <a href="/servicos/cartoes/">Cartões de visita</a>
        <a href="/servicos/folders/">Folders e panfletos</a>
        <a href="/servicos/blocos/">Blocos e receituários</a>
        <a href="/servicos/papelaria-personalizada/">Papelaria personalizada</a>
        <a href="/servicos/sites-catalogos/">Sites e catálogos digitais</a>
        <a class="mobile-submenu-all" href="/servicos/">Ver todos os serviços →</a>
      </div>
    </details>
    <a class="mobile-nav-link" href="#portfolio">Portfólio</a>
    <a class="mobile-nav-link" href="#sobre">Sobre</a>
    <a class="mobile-nav-cta" href="/conta/">Minha conta</a>`;

  header.append(toggle,nav);
  const close=()=>{
    header.classList.remove('mobile-menu-open');
    toggle.setAttribute('aria-expanded','false');
    toggle.setAttribute('aria-label','Abrir menu');
  };
  toggle.addEventListener('click',()=>{
    const open=!header.classList.contains('mobile-menu-open');
    header.classList.toggle('mobile-menu-open',open);
    toggle.setAttribute('aria-expanded',String(open));
    toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu');
  });
  nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>760)close()});
}

export function setupNavigation(){
  ensureStyles();
  adjustDesktopNavigation();
  setupMobileMenu();
}
