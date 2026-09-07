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

  const currentPath = location.pathname.replace(/\/+$/,'/');

  if (currentPath.includes('/servicos/adesivos/') && !document.querySelector('script[data-croma-sticker-media]')) {
    const sm = document.createElement('script');
    sm.src = '/js/sticker-media-enhancer.js?v=20260903-2';
    sm.dataset.cromaStickerMedia = '1';
    sm.defer = true;
    document.head.appendChild(sm);
  }

  const header = document.querySelector('.topbar, .site-header');
  if (!header) return;

  for (const name of ['public-navigation','commercial']) {
    if (!document.querySelector('link[data-croma-'+name+']')) {const link=document.createElement('link');link.rel='stylesheet';link.href='/css/'+name+'.css?v=20260907-1';link.setAttribute('data-croma-'+name,'');document.head.appendChild(link);}
  }
  const path = location.pathname.replace(/\/+$/, '/') || '/';
  const hash = location.hash;
  const current = path.startsWith('/produtos/') ? 'produtos' : path.startsWith('/digital/') || path.startsWith('/servicos/sites-catalogos/') ? 'digital' : path.startsWith('/sobre/') ? 'sobre' : path.startsWith('/portfolio/') ? 'portfolio' : path.startsWith('/servicos/') ? 'graficos' : null;
  const items = [
    ['graficos','Gráfica','/servicos/'],
    ['produtos','Papelaria & Presentes','/produtos/'],
    ['digital','Croma Digital','/digital/'],
    ['portfolio','Portfólio','/portfolio/'],
    ['sobre','Sobre','/sobre/']
  ];
  const links = items.map(([id,label,href]) => `<a class="${id===current?'active':''}" href="${href}" ${id===current?'aria-current="page"':''}>${label}</a>`).join('');

  header.className = 'croma-standard-header';
  header.innerHTML = `
    <a class="service-brand" href="/" aria-label="Croma — início">
      <img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma">
      <span class="service-brand-tag">HUB</span>
    </a>
    <nav class="service-desktop-nav" aria-label="Navegação principal">${links}</nav>
    <a class="service-quote" href="https://wa.me/553230253588?text=Ol%C3%A1!%20Gostaria%20de%20solicitar%20um%20or%C3%A7amento.">WhatsApp</a>
    <button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav"><span></span><span></span><span></span></button>
    <nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">${links}<a class="service-mobile-cta" href="https://wa.me/553230253588?text=Ol%C3%A1!%20Gostaria%20de%20solicitar%20um%20or%C3%A7amento.">WhatsApp</a></nav>`;

  const toggle = header.querySelector('.service-menu-toggle');
  const mobileNav = header.querySelector('.service-mobile-nav');
  const close = () => { header.classList.remove('menu-open'); toggle.setAttribute('aria-expanded','false'); toggle.setAttribute('aria-label','Abrir menu'); };
  toggle.addEventListener('click', () => { const open=!header.classList.contains('menu-open'); header.classList.toggle('menu-open',open); toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu'); });
  mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', close));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && header.classList.contains('menu-open')) { close(); toggle.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 860) close(); });

  document.addEventListener('click', e => { if (!header.contains(e.target)) close(); });
  header.addEventListener('focusout', () => setTimeout(() => {if (!header.contains(document.activeElement)) close();}, 0));
  const main=document.querySelector('main');
  if(main){if(!main.id)main.id='conteudo';main.tabIndex=-1;const skip=document.createElement('a');skip.className='cm-skip';skip.href='#'+main.id;skip.textContent='Pular para o conteúdo';document.body.prepend(skip);}
  if(!document.querySelector('footer')){const footer=document.createElement('footer');footer.className='cm-footer';footer.innerHTML=`<div class="cm-footer-grid"><div><a href="/"><img src="/assets/logo/croma-horizontal-web.png" width="180" height="42" alt="Croma — início"></a><p>Gráfica, Papelaria & Presentes e Digital.<br>Juiz de Fora • MG</p><a href="/contato/">Contato e orçamento</a><a href="https://wa.me/553230253588">WhatsApp: (32) 3025-3588</a></div><nav aria-label="Explore a Croma"><strong>Explore a Croma</strong><a href="/servicos/">Gráfica</a><a href="/produtos/">Papelaria & Presentes</a><a href="/digital/">Croma Digital</a><a href="/portfolio/">Portfólio</a><a href="/sobre/">Sobre</a><a href="/segmentos/">Soluções por segmento</a></nav><nav aria-label="Canais e pedidos"><strong>Canais e pedidos</strong><a href="/conta/">Minha conta</a><a href="/meus-pedidos/">Meus pedidos</a><a href="/carrinho/">Carrinho</a><a href="https://www.instagram.com/croma_papelaria/">Instagram Papelaria</a><a href="https://www.instagram.com/croma_grafica_/">Instagram Gráfica</a><a href="https://linktr.ee/cromapel">Outros canais oficiais</a></nav></div>`;document.body.appendChild(footer);}

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