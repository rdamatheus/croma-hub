(() => {
  if (!window.CromaCart && !document.querySelector('script[data-croma-cart]')) {
    const s = document.createElement('script');
    s.src = '/js/cart.js?v=20260821-1';
    s.dataset.cromaCart = '1';
    document.head.appendChild(s);
  }

  const header = document.querySelector('.topbar');
  if (!header) return;

  header.classList.add('croma-standard-header');
  header.innerHTML = `
    <a class="service-brand" href="/" aria-label="Croma Hub — início">
      <img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma">
      <span class="service-brand-tag">HUB</span>
    </a>
    <nav class="service-desktop-nav" aria-label="Navegação principal">
      <a href="/#catalogo">Produtos</a>
      <a href="/servicos/">Serviços</a>
      <a href="/#portfolio">Portfólio</a>
      <a href="/#sobre">Sobre</a>
    </nav>
    <a class="service-quote" href="/#orcamento">Pedir orçamento</a>
    <button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav">
      <span></span><span></span><span></span>
    </button>
    <nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">
      <a href="/#catalogo">Produtos</a>
      <details>
        <summary>Serviços <span aria-hidden="true">⌄</span></summary>
        <div class="service-mobile-submenu">
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
          <a class="service-mobile-all" href="/servicos/">Ver todos os serviços →</a>
        </div>
      </details>
      <a href="/#portfolio">Portfólio</a>
      <a href="/#sobre">Sobre</a>
      <a class="service-mobile-cta" href="/#orcamento">Pedir orçamento</a>
    </nav>`;

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
