(() => {
  if (!window.CromaCart && !document.querySelector('script[data-croma-cart]')) {
    const s = document.createElement('script');
    s.src = '/js/cart.js?v=20260821-2';
    s.dataset.cromaCart = '1';
    document.head.appendChild(s);
  }

  if (!document.querySelector('script[data-croma-product-gallery]')) {
    const g = document.createElement('script');
    g.src = '/js/product-media-gallery.js?v=20260828-1';
    g.dataset.cromaProductGallery = '1';
    g.defer = true;
    document.head.appendChild(g);
  }

  const header = document.querySelector('.topbar, .site-header');
  if (!header) return;

  if (!document.querySelector('style[data-public-header]')) {
    const style = document.createElement('style');
    style.dataset.publicHeader = '1';
    style.textContent = `
      .croma-public-promo{background:#30297f;color:#fff;min-height:46px;display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 20px;font-size:.84rem;font-weight:700;text-align:center}
      .croma-public-promo a{background:#fff;color:#30297f;border-radius:999px;padding:7px 14px;font-weight:900;white-space:nowrap}
      .croma-standard-header{position:sticky;top:0;z-index:120;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px clamp(20px,4vw,64px)!important;min-height:86px;background:rgba(255,255,255,.97);backdrop-filter:blur(16px);border-bottom:1px solid #e6e4ef;box-shadow:0 8px 24px rgba(33,28,92,.035)}
      .croma-standard-header .service-brand{display:flex;align-items:center;gap:12px;min-width:235px}.croma-standard-header .service-brand img{display:block;width:auto;height:50px;max-width:205px;object-fit:contain}.service-brand-tag{padding-left:10px;border-left:1px solid #e6e4ef;font-size:.66rem;font-weight:900;letter-spacing:.25em;color:#30297f}
      .service-desktop-nav{display:flex!important;align-items:center;gap:22px;font-size:.88rem;color:#514f67}.service-desktop-nav a{position:relative;padding:10px 0;white-space:nowrap}.service-desktop-nav a:hover{color:#c30079}.service-desktop-nav a.active{color:#30297f;font-weight:900}.service-desktop-nav a.active::after{content:'';position:absolute;left:0;right:0;bottom:3px;height:2px;border-radius:99px;background:#c30079}
      .service-quote{display:inline-flex;align-items:center;justify-content:center;padding:11px 18px;border-radius:999px;background:#30297f;color:#fff;font-size:.88rem;font-weight:900;white-space:nowrap;box-shadow:0 10px 24px rgba(48,41,127,.14)}.service-menu-toggle,.service-mobile-nav{display:none!important}
      @media(max-width:1120px){.service-desktop-nav{gap:14px!important;font-size:.79rem!important}.croma-standard-header .service-brand{min-width:190px!important}.croma-standard-header .service-brand img{height:43px!important;max-width:172px!important}.service-quote{padding:10px 14px;font-size:.8rem}}
      @media(max-width:860px){.service-desktop-nav,.service-quote{display:none!important}.service-menu-toggle{display:grid!important;place-items:center;width:44px;height:44px;flex:none;padding:10px;border:1px solid rgba(48,41,127,.14);border-radius:14px;background:#fff;color:#211c5c;box-shadow:0 8px 22px rgba(48,41,127,.08);cursor:pointer}.service-menu-toggle span{display:block;width:21px;height:2px;margin:2px 0;border-radius:99px;background:currentColor}.service-mobile-nav{position:absolute;top:100%;left:0;right:0;max-height:calc(100vh - 68px);overflow-y:auto;padding:8px 14px 18px;background:#fff;border-top:1px solid #e6e4ef;border-bottom:1px solid #e6e4ef;box-shadow:0 22px 50px rgba(33,28,92,.16)}.croma-standard-header.menu-open .service-mobile-nav{display:block!important}.service-mobile-nav>a{display:flex;align-items:center;min-height:50px;padding:12px 6px;border-bottom:1px solid #e6e4ef;color:#211c5c;font-size:.96rem;font-weight:850}.service-mobile-nav>a.active{color:#c30079}.service-mobile-nav .service-mobile-cta{justify-content:center;margin-top:14px;border:0;border-radius:999px;background:#30297f;color:#fff}}
      @media(max-width:760px){.croma-public-promo{font-size:.74rem;min-height:42px;padding:7px 10px}.croma-public-promo a{padding:6px 10px}.croma-standard-header{min-height:68px!important;padding:10px 12px!important}.croma-standard-header .service-brand{min-width:0!important;max-width:calc(100% - 58px)}.croma-standard-header .service-brand img{height:38px!important;max-width:164px!important}}
    `;
    document.head.appendChild(style);
  }

  const existingPromo = document.querySelector('.promo-bar, .croma-public-promo');
  if (!existingPromo) {
    const promo = document.createElement('div');
    promo.className = 'croma-public-promo';
    promo.innerHTML = '<span><strong>Solicite seu orçamento com a Croma.</strong> Atendimento rápido pelo WhatsApp.</span><a href="/#orcamento">Pedir orçamento</a>';
    header.parentNode.insertBefore(promo, header);
  }

  const path = location.pathname.replace(/\/+$/, '/') || '/';
  const hash = location.hash;
  const current = path.startsWith('/produtos/') ? 'produtos'
    : path.startsWith('/segmentos/') ? 'segmentos'
    : path.startsWith('/sobre/') ? 'sobre'
    : path.startsWith('/servicos/') && hash === '#comunicacao-visual' ? 'comunicacao'
    : path.startsWith('/servicos/') ? 'graficos'
    : path === '/' && hash === '#portfolio' ? 'portfolio'
    : null;

  const items = [
    ['produtos','Produtos','/produtos/'],
    ['graficos','Serviços Gráficos','/servicos/#servicos-graficos'],
    ['comunicacao','Comunicação Visual','/servicos/#comunicacao-visual'],
    ['segmentos','Soluções por segmento','/segmentos/'],
    ['portfolio','Portfólio','/#portfolio'],
    ['sobre','Sobre a Croma','/sobre/']
  ];
  const links = items.map(([id,label,href]) => `<a class="${id===current?'active':''}" href="${href}">${label}</a>`).join('');

  header.className = 'croma-standard-header';
  header.innerHTML = `
    <a class="service-brand" href="/" aria-label="Croma — início">
      <img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma">
      <span class="service-brand-tag">HUB</span>
    </a>
    <nav class="service-desktop-nav" aria-label="Navegação principal">${links}</nav>
    <a class="service-quote" href="/#orcamento">Pedir orçamento</a>
    <button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav"><span></span><span></span><span></span></button>
    <nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">${links}<a class="service-mobile-cta" href="/#orcamento">Pedir orçamento</a></nav>`;

  const toggle = header.querySelector('.service-menu-toggle');
  const mobileNav = header.querySelector('.service-mobile-nav');
  const close = () => { header.classList.remove('menu-open'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','Abrir menu'); };
  toggle.addEventListener('click', () => { const open=!header.classList.contains('menu-open'); header.classList.toggle('menu-open',open); toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu'); });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) close(); });

  function setupStickerQuotationFlow() {
    if (!location.pathname.includes('/servicos/adesivos/')) return;
    const finish = document.querySelector('#finish');
    const continueButton = document.querySelector('#continue');
    if (!finish || !continueButton) return;
    finish.innerHTML = '<option value="meio-corte">Meio corte — recorta apenas o adesivo, sem recortar o liner</option><option value="stick">Stick — corte inteiro do adesivo e do liner no formato desejado</option>';
    const finishLabel = finish.closest('label');
    if (finishLabel) {
      finishLabel.childNodes[0].textContent = 'Tipo de corte';
      const help = document.createElement('small'); help.className='finish-help'; help.textContent='O formato já foi definido acima. Aqui você escolhe apenas como o adesivo será entregue no liner.'; finishLabel.appendChild(help);
    }
    const goToQuotation=()=>{const product=document.querySelector('.sticker-card.selected')?.dataset.product||'',w=document.querySelector('#w')?.value||'',h=document.querySelector('#h')?.value||'',q=document.querySelector('#q')?.value||'',format=document.querySelector('.format-option.active')?.dataset.format||'personalizado',cut=finish.value,status=document.querySelector('#status');if(!product||!Number(w)||!Number(h)||!Number(q)){if(status)status.textContent='Preencha largura, altura e quantidade para continuar.';return}const params=new URLSearchParams({produto:product,formato:format,largura:w,altura:h,quantidade:q,corte:cut});sessionStorage.setItem('cromaStickerQuote',JSON.stringify(Object.fromEntries(params.entries())));location.href=`/servicos/adesivos/cotacao/?${params.toString()}`};
    const replacement=continueButton.cloneNode(true);continueButton.replaceWith(replacement);replacement.addEventListener('click',goToQuotation);
  }
  setupStickerQuotationFlow();
})();