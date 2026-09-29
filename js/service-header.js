(() => {
  if (!document.querySelector('link[data-public-header-style]')) {
    const link=document.createElement('link');
    link.rel='stylesheet';link.href='/css/public-header-v2.css?v=20260928-1';link.dataset.publicHeaderStyle='1';
    document.head.appendChild(link);
  }
  if (!window.CromaCart && !document.querySelector('script[data-croma-cart]')) {
    const s=document.createElement('script');s.src='/js/cart.js?v=20260912-3';s.dataset.cromaCart='1';document.head.appendChild(s);
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
  const nextPath=`${location.pathname}${location.search}${location.hash}`||'/';
  const loginHref=`/conta/?next=${encodeURIComponent(nextPath)}`;
  const path=(location.pathname.replace(/\/+$/,'/')||'/');
  const current=path.startsWith('/comunicacao-marketing/')?'comunicacao'
    :path.startsWith('/papelaria-presentes-eletronicos/')?'varejo'
    :location.hash==='#promocoes'?'promocoes'
    :null;
  const items=[
    ['comunicacao','Comunicação & Marketing','/comunicacao-marketing/'],
    ['varejo','Papelaria, Presentes & Eletrônicos','/papelaria-presentes-eletronicos/'],
    ['promocoes','Promoções','/#promocoes']
  ];
  const links=items.map(([id,label,href])=>`<a class="${id===current?'active':''}" href="${href}">${label}</a>`).join('');
  header.className='croma-standard-header';
  header.innerHTML=`<a class="service-brand" href="/" aria-label="Croma — início"><img src="/assets/logo/croma-horizontal-web.png?v=20260811-1" alt="Croma"></a><nav class="service-desktop-nav" aria-label="Navegação principal">${links}</nav><div class="service-header-actions"><a class="service-search" href="/busca/" aria-label="Buscar no site"><span class="service-search-icon">⌕</span><span class="service-search-label">Buscar</span></a><a class="service-account" data-account-link href="${loginHref}">Minha conta</a><button class="service-cart" data-header-cart type="button" aria-label="Abrir carrinho"><span class="service-cart-label">Carrinho</span><span class="service-cart-count" data-header-cart-count>0</span></button><button class="service-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="serviceMobileNav"><span></span><span></span><span></span></button></div><nav class="service-mobile-nav" id="serviceMobileNav" aria-label="Navegação mobile">${links}<a href="/busca/">Buscar no site</a><div class="service-mobile-tools"><a data-mobile-account href="${loginHref}">Minha conta</a><a data-mobile-orders href="/meus-pedidos/" hidden>Meus pedidos</a></div></nav>`;
  const toggle=header.querySelector('.service-menu-toggle');
  const mobileNav=header.querySelector('.service-mobile-nav');
  const close=()=>{header.classList.remove('menu-open');toggle?.setAttribute('aria-expanded','false')};
  toggle?.addEventListener('click',()=>{const open=!header.classList.contains('menu-open');header.classList.toggle('menu-open',open);toggle.setAttribute('aria-expanded',String(open))});
  mobileNav?.querySelectorAll('a').forEach(link=>link.addEventListener('click',close));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
  window.addEventListener('resize',()=>{if(window.innerWidth>900)close()});
  const readLocalCartCount=()=>{try{const parsed=JSON.parse(localStorage.getItem('croma_cart_v2')||'[]');const cartItems=Array.isArray(parsed)?parsed:Array.isArray(parsed?.items)?parsed.items:[];return cartItems.reduce((sum,item)=>sum+Number(item.qty||0),0)}catch{return 0}};
  const setCartCount=value=>header.querySelectorAll('[data-header-cart-count]').forEach(el=>{el.textContent=String(Math.max(0,Number(value)||0))});
  function syncCartCount(){if(window.CromaCart&&typeof window.CromaCart.count==='function'){try{setCartCount(window.CromaCart.count());return}catch{}}const source=document.querySelector('[data-cart-count]');setCartCount(source?source.textContent||0:readLocalCartCount())}
  syncCartCount();
  let cartTries=0;const cartTimer=setInterval(()=>{cartTries++;syncCartCount();if(window.CromaCart||cartTries>=24)clearInterval(cartTimer)},250);
  window.addEventListener('storage',event=>{if(event.key==='croma_cart_v2')syncCartCount()});document.addEventListener('croma:cart-updated',syncCartCount);
  header.querySelectorAll('[data-header-cart]').forEach(button=>button.addEventListener('click',()=>{const fab=document.querySelector('.croma-cart-fab');if(fab){fab.click();close();return}location.href='/carrinho/'}));
  function applyPublicSession(user){const accountHref=user?'/minha-conta/':loginHref;const accountLabel=user?'Minha conta':'Entrar';const desktop=header.querySelector('[data-account-link]'),mobile=header.querySelector('[data-mobile-account]'),orders=header.querySelector('[data-mobile-orders]');if(desktop){desktop.href=accountHref;desktop.textContent=accountLabel}if(mobile){mobile.href=accountHref;mobile.textContent=accountLabel}if(orders)orders.hidden=!user}
  import('/js/croma-supabase.js?v=20260821-2').then(async({supabase})=>{const{data}=await supabase.auth.getSession();applyPublicSession(data.session?.user||null);supabase.auth.onAuthStateChange((_event,session)=>applyPublicSession(session?.user||null))}).catch(()=>applyPublicSession(null));
  function setupStickerQuotationFlow(){if(!location.pathname.includes('/servicos/adesivos/'))return;const finish=document.querySelector('#finish'),continueButton=document.querySelector('#continue');if(!finish||!continueButton)return;finish.innerHTML='<option value="meio-corte">Meio corte — recorta apenas o adesivo, sem recortar o liner</option><option value="stick">Stick — corte inteiro do adesivo e do liner no formato desejado</option>';const goToQuotation=()=>{const product=document.querySelector('.sticker-card.selected')?.dataset.product||'',w=document.querySelector('#w')?.value||'',h=document.querySelector('#h')?.value||'',q=document.querySelector('#q')?.value||'',format=document.querySelector('.format-option.active')?.dataset.format||'personalizado',cut=finish.value,status=document.querySelector('#status');if(!product||!Number(w)||!Number(h)||!Number(q)){if(status)status.textContent='Preencha largura, altura e quantidade para continuar.';return}const params=new URLSearchParams({produto:product,formato:format,largura:w,altura:h,quantidade:q,corte:cut});sessionStorage.setItem('cromaStickerQuote',JSON.stringify(Object.fromEntries(params.entries())));location.href=`/servicos/adesivos/cotacao/?${params.toString()}`};const replacement=continueButton.cloneNode(true);continueButton.replaceWith(replacement);replacement.addEventListener('click',goToQuotation)}
  setupStickerQuotationFlow();
})();
