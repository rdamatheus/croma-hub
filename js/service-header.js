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

  const header = document.querySelector('.topbar');
  if (!header) return;

  if (!document.querySelector('style[data-public-header]')) {
    const style = document.createElement('style');
    style.dataset.publicHeader = '1';
    style.textContent = `
      .croma-public-promo{background:#30297f;color:#fff;min-height:50px;display:flex;align-items:center;justify-content:center;gap:14px;padding:8px 20px;font-size:.86rem;font-weight:700;text-align:center}
      .croma-public-promo a{background:#fff;color:#30297f;border-radius:999px;padding:7px 14px;font-weight:900;white-space:nowrap}
      .croma-standard-header{padding:14px clamp(20px,4vw,64px)!important;min-height:86px}
      .croma-standard-header .service-brand img{height:50px!important;max-width:205px!important}
      .croma-standard-header .service-brand{min-width:235px!important}
      .croma-standard-header .service-desktop-nav{gap:28px!important;font-size:.92rem!important}
      @media(max-width:760px){.croma-public-promo{font-size:.76rem;min-height:42px;padding:7px 10px}.croma-public-promo a{padding:6px 10px}.croma-standard-header{min-height:68px!important;padding:10px 12px!important}.croma-standard-header .service-brand{min-width:0!important}.croma-standard-header .service-brand img{height:38px!important;max-width:164px!important}}
    `;
    document.head.appendChild(style);
  }

  if (!document.querySelector('.croma-public-promo')) {
    const promo = document.createElement('div');
    promo.className = 'croma-public-promo';
    promo.innerHTML = '<span><strong>Solicite seu orçamento com a Croma.</strong> Atendimento rápido pelo WhatsApp.</span><a href="/#orcamento">Pedir orçamento</a>';
    header.parentNode.insertBefore(promo, header);
  }

  if (location.pathname.replace(/\/+$/,'/') === '/servicos/') {
    const cards = [...document.querySelectorAll('.service-card')];
    const graficos = cards.find(card => /Gráfica|Impressão Digital/i.test(card.querySelector('.cat')?.textContent || ''));
    const comunicacao = cards.find(card => /Comunicação Visual/i.test(card.querySelector('.cat')?.textContent || ''));
    if (graficos && !document.getElementById('servicos-graficos')) graficos.id = 'servicos-graficos';
    if (comunicacao && !document.getElementById('comunicacao-visual')) comunicacao.id = 'comunicacao-visual';
  }

  const path = location.pathname.replace(/\/+$/, '/') || '/';
  const hash = location.hash;
  const current = path.startsWith('/produtos/') ? 'produtos'
    : path.startsWith('/servicos/') && hash === '#comunicacao-visual' ? 'comunicacao'
    : path.startsWith('/servicos/') && hash === '#servicos-graficos' ? 'graficos'
    : null;
  const items = [
    ['produtos','Produtos','/produtos/'],
    ['graficos','Serviços Gráficos','/servicos/#servicos-graficos'],
    ['comunicacao','Comunicação Visual','/servicos/#comunicacao-visual'],
    ['portfolio','Portfólio','/#portfolio'],
    ['sobre','Sobre','/#sobre']
  ].filter(([id]) => id !== current);
  const links = items.map(([,label,href]) => `<a href="${href}">${label}</a>`).join('');

  header.classList.add('croma-standard-header');
  header.innerHTML = `
    <a class="service-brand" href="/" aria-label="Croma Hub — início">
      <img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma">
      <span class="service-brand-tag">HUB</span>
    </a>
    <nav class="service-desktop-nav" aria-label="Navegação principal">${links}</nav>
    <a class="service-quote" href="/#orcamento">Pedir orçamento</a>
    <button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav"><span></span><span></span><span></span></button>
    <nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">${links}<a class="service-mobile-cta" href="/#orcamento">Pedir orçamento</a></nav>`;

  const toggle = header.querySelector('.service-menu-toggle');
  const mobileNav = header.querySelector('.service-mobile-nav');
  const close = () => {
    header.classList.remove('menu-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Abrir menu');
  };
  toggle.addEventListener('click', () => {
    const open = !header.classList.contains('menu-open');
    header.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  window.addEventListener('resize', () => { if (window.innerWidth > 760) close(); });

  function setupStickerQuotationFlow() {
    if (!location.pathname.includes('/servicos/adesivos/')) return;
    const finish = document.querySelector('#finish');
    const continueButton = document.querySelector('#continue');
    if (!finish || !continueButton) return;

    finish.innerHTML = `
      <option value="meio-corte">Meio corte — recorta apenas o adesivo, sem recortar o liner</option>
      <option value="stick">Stick — corte inteiro do adesivo e do liner no formato desejado</option>`;

    const finishLabel = finish.closest('label');
    if (finishLabel) {
      finishLabel.childNodes[0].textContent = 'Tipo de corte';
      const help = document.createElement('small');
      help.className = 'finish-help';
      help.textContent = 'O formato já foi definido acima. Aqui você escolhe apenas como o adesivo será entregue no liner.';
      finishLabel.appendChild(help);
    }

    const goToQuotation = () => {
      const product = document.querySelector('.sticker-card.selected')?.dataset.product || '';
      const w = document.querySelector('#w')?.value || '';
      const h = document.querySelector('#h')?.value || '';
      const q = document.querySelector('#q')?.value || '';
      const format = document.querySelector('.format-option.active')?.dataset.format || 'personalizado';
      const cut = finish.value;
      const status = document.querySelector('#status');
      if (!product || !Number(w) || !Number(h) || !Number(q)) {
        if (status) status.textContent = 'Preencha largura, altura e quantidade para continuar.';
        return;
      }
      const params = new URLSearchParams({ produto: product, formato: format, largura: w, altura: h, quantidade: q, corte: cut });
      sessionStorage.setItem('cromaStickerQuote', JSON.stringify(Object.fromEntries(params.entries())));
      location.href = `/servicos/adesivos/cotacao/?${params.toString()}`;
    };

    const replacement = continueButton.cloneNode(true);
    continueButton.replaceWith(replacement);
    replacement.addEventListener('click', goToQuotation);
  }

  setupStickerQuotationFlow();
})();