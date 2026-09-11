(() => {
  if (!document.querySelector('link[data-public-header-style]')) {
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='/css/public-header.css?v=20260907-1';link.dataset.publicHeaderStyle='1';
    document.head.appendChild(link);
  }

  if (!window.CromaCart && !document.querySelector('script[data-croma-cart]')) {
    const s=document.createElement('script');s.src='/js/cart.js?v=20260910-1';s.dataset.cromaCart='1';document.head.appendChild(s);
  }
  if (!document.querySelector('script[data-croma-product-gallery]')) {
    const g=document.createElement('script');g.src='/js/product-media-gallery.js?v=20260828-1';g.dataset.cromaProductGallery='1';g.defer=true;document.head.appendChild(g);
  }

  const currentPath=location.pathname.replace(/\/+$/,'/');
  if (currentPath.includes('/servicos/adesivos/') && !document.querySelector('script[data-croma-sticker-media]')) {
    const sm=document.createElement('script');sm.src='/js/sticker-media-enhancer.js?v=20260903-2';sm.dataset.cromaStickerMedia='1';sm.defer=true;document.head.appendChild(sm);
  }

  const header=document.querySelector('.topbar, .site-header');
  if(!header)return;
  const quoteUrl='https://wa.me/553230253588?text=Ol%C3%A1%21%20Vim%20pelo%20site%20da%20Croma%20e%20gostaria%20de%20solicitar%20um%20or%C3%A7amento.';

  const existingPromo=document.querySelector('.promo-bar, .croma-public-promo');
  if(!existingPromo){
    const promo=document.createElement('div');promo.className='croma-public-promo';
    promo.innerHTML=`<span><strong>Atendimento Croma em Juiz de Fora.</strong> Orçamentos e dúvidas pelo WhatsApp.</span><a href="${quoteUrl}" target="_blank" rel="noopener noreferrer">Chamar agora</a>`;
    header.parentNode.insertBefore(promo,header);
  }

  const path=location.pathname.replace(/\/+$/,'/')||'/';
  const hash=location.hash;
  const current=path.startsWith('/produtos/')?'produtos'
    :path.startsWith('/digital/')||path.startsWith('/servicos/sites-catalogos/')?'digital'
    :path.startsWith('/sobre/')?'sobre'
    :path.startsWith('/servicos/')?'servicos'
    :path==='/'&&hash==='#portfolio'?'trabalhos'
    :null;

  const items=[
    ['produtos','Produtos','/produtos/'],
    ['servicos','Serviços','/servicos/'],
    ['trabalhos','Trabalhos','/#portfolio'],
    ['digital','Croma Digital','/digital/'],
    ['sobre','Sobre','/sobre/']
  ];
  const links=items.map(([id,label,href])=>`<a class="${id===current?'active':''}" href="${href}">${label}</a>`).join('');

  header.className='croma-standard-header';
  header.innerHTML=`<a class="service-brand" href="/" aria-label="Croma — início"><img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma"></a><nav class="service-desktop-nav" aria-label="Navegação principal">${links}</nav><a class="service-quote" href="${quoteUrl}" target="_blank" rel="noopener noreferrer">Pedir orçamento</a><button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav"><span></span><span></span><span></span></button><nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">${links}<a class="service-mobile-cta" href="${quoteUrl}" target="_blank" rel="noopener noreferrer">Pedir orçamento</a></nav>`;

  const toggle=header.querySelector('.service-menu-toggle');
  const mobileNav=header.querySelector('.service-mobile-nav');
  const close=()=>{header.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','Abrir menu')};
  toggle.addEventListener('click',()=>{const open=!header.classList.contains('menu-open');header.classList.toggle('menu-open',open);toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Fechar menu':'Abrir menu')});
  mobileNav.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>860)close()});

  function setupStickerQuotationFlow(){
    if(!location.pathname.includes('/servicos/adesivos/'))return;
    const finish=document.querySelector('#finish'),continueButton=document.querySelector('#continue');
    if(!finish||!continueButton)return;
    finish.innerHTML='<option value="meio-corte">Meio corte — recorta apenas o adesivo, sem recortar o liner</option><option value="stick">Stick — corte inteiro do adesivo e do liner no formato desejado</option>';
    const finishLabel=finish.closest('label');
    if(finishLabel){finishLabel.childNodes[0].textContent='Tipo de corte';const help=document.createElement('small');help.className='finish-help';help.textContent='O formato já foi definido acima. Aqui você escolhe apenas como o adesivo será entregue no liner.';finishLabel.appendChild(help)}
    const goToQuotation=()=>{const product=document.querySelector('.sticker-card.selected')?.dataset.product||'',w=document.querySelector('#w')?.value||'',h=document.querySelector('#h')?.value||'',q=document.querySelector('#q')?.value||'',format=document.querySelector('.format-option.active')?.dataset.format||'personalizado',cut=finish.value,status=document.querySelector('#status');if(!product||!Number(w)||!Number(h)||!Number(q)){if(status)status.textContent='Preencha largura, altura e quantidade para continuar.';return}const params=new URLSearchParams({produto:product,formato:format,largura:w,altura:h,quantidade:q,corte:cut});sessionStorage.setItem('cromaStickerQuote',JSON.stringify(Object.fromEntries(params.entries())));location.href=`/servicos/adesivos/cotacao/?${params.toString()}`};
    const replacement=continueButton.cloneNode(true);continueButton.replaceWith(replacement);replacement.addEventListener('click',goToQuotation);
  }
  setupStickerQuotationFlow();
})();
