(() => {
  if (!location.pathname.includes('/servicos/adesivos/')) return;
  if (window.__cromaStickerMediaV2) return;
  window.__cromaStickerMediaV2 = true;

  const photos = [
    {keys:['rótulos em bobina','rotulos em bobina'], url:'/assets/produtos/rotulos-bobina-flor-de-liz.jpg', alt:'Rótulos adesivos impressos em bobina', fit:'contain'},
    {keys:['rótulos em folha','rotulos em folha'], url:'https://images.pexels.com/photos/16605271/pexels-photo-16605271.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Folhas com adesivos impressos'},
    {keys:['adesivo papel'], url:'https://images.pexels.com/photos/7123558/pexels-photo-7123558.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos de papel impressos em folha'},
    {keys:['casca de ovo'], url:'https://images.pexels.com/photos/9999871/pexels-photo-9999871.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos de segurança impressos'},
    {keys:['vinil branco brilho','vinil brilho'], url:'https://images.pexels.com/photos/15241084/pexels-photo-15241084.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos de vinil aplicados em superfície'},
    {keys:['vinil branco fosco','vinil fosco'], url:'https://images.pexels.com/photos/2783837/pexels-photo-2783837.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos impressos com acabamento fosco'},
    {keys:['blockout brilho'], url:'https://images.pexels.com/photos/28726705/pexels-photo-28726705.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Vinil opaco aplicado em comunicação de vitrine'},
    {keys:['blockout fosco'], url:'https://images.pexels.com/photos/12100414/pexels-photo-12100414.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Comunicação adesiva opaca em fachada comercial'},
    {keys:['vinil transparente','transparente'], url:'https://images.pexels.com/photos/10558429/pexels-photo-10558429.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos aplicados em superfície de vidro'},
    {keys:['vinil jateado','jateado'], url:'https://images.pexels.com/photos/1985598/pexels-photo-1985598.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Vidro com efeito fosco semelhante ao vinil jateado'},
    {keys:['microperfurado','micro'], url:'https://images.pexels.com/photos/4930944/pexels-photo-4930944.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Vidraça comercial com privacidade e comunicação visual'},
    {keys:['vinil automotivo','automotivo'], url:'https://images.pexels.com/photos/10126657/pexels-photo-10126657.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Aplicação profissional de vinil automotivo'},
    {keys:['holográfico','holografico'], url:'https://images.pexels.com/photos/7123564/pexels-photo-7123564.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos com acabamento holográfico e especial'},
    {keys:['resinado'], url:'https://images.pexels.com/photos/11441227/pexels-photo-11441227.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Rótulo em destaque sobre embalagem de produto'},
    {keys:['adesivo de piso','piso'], url:'https://images.pexels.com/photos/5418952/pexels-photo-5418952.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivo de sinalização aplicado no piso'},
    {keys:['cor sólida','cor solida','recorte'], url:'https://images.pexels.com/photos/16605272/pexels-photo-16605272.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos de recorte em formatos variados'},
    {keys:['refletivo'], url:'https://images.pexels.com/photos/9418047/pexels-photo-9418047.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Sinalização de alta visibilidade em ambiente comercial'},
    {keys:['dtf uv'], url:'https://images.pexels.com/photos/9271446/pexels-photo-9271446.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Aplicação gráfica em superfície rígida'},
    {keys:['dtf têxtil','dtf textil'], url:'https://images.pexels.com/photos/33650428/pexels-photo-33650428.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Personalização têxtil com prensa térmica'},
    {keys:['termocolante'], url:'https://images.pexels.com/photos/33650433/pexels-photo-33650433.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Produção personalizada em tecido'},
    {keys:['metalizado'], url:'https://images.pexels.com/photos/29049940/pexels-photo-29049940.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Embalagem com acabamento de rótulo brilhante e sofisticado'},
    {keys:['hot stamping','hot'], url:'https://images.pexels.com/photos/14537173/pexels-photo-14537173.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Embalagem premium com rótulo em destaque'},
    {keys:['soft touch','soft'], url:'https://images.pexels.com/photos/8450216/pexels-photo-8450216.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Aplicação manual de rótulo em embalagem'}
  ];

  const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const selectPhoto = title => {
    const t = normalize(title);
    return photos.find(p => p.keys.some(k => t.includes(normalize(k))));
  };

  const apply = () => {
    document.querySelectorAll('.sticker-card').forEach(card => {
      const title = card.querySelector('h2')?.textContent || card.dataset.product || '';
      const photo = selectPhoto(title);
      const media = card.querySelector('.sticker-photo');
      if (!media) return;
      if (!photo) {
        media.replaceChildren();
        media.classList.add('sticker-photo-missing');
        media.textContent = 'Imagem em atualização';
        return;
      }
      if (card.dataset.mediaEnhanced === photo.url) return;
      media.classList.remove('sticker-photo-missing','sticker-photo-contain');
      media.classList.toggle('sticker-photo-contain', photo.fit === 'contain');
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.alt || title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.onerror = () => {
        img.remove();
        media.classList.add('sticker-photo-missing');
        media.textContent = 'Imagem em atualização';
      };
      media.replaceChildren(img);
      card.dataset.mediaEnhanced = photo.url;
    });
  };

  if (!document.querySelector('style[data-sticker-media-enhancer]')) {
    const style = document.createElement('style');
    style.dataset.stickerMediaEnhancer = '1';
    style.textContent = '.sticker-photo{font-size:0!important}.sticker-photo-missing{display:grid!important;place-items:center!important;font-size:.8rem!important;font-weight:800;color:#77748a;text-align:center;padding:16px;background:linear-gradient(135deg,#f1f0f6,#e8e6f0)!important;box-sizing:border-box}.sticker-photo-contain{background:#fff!important;padding:10px;box-sizing:border-box}.sticker-photo-contain img{object-fit:contain!important;object-position:center!important;border-radius:12px}.sticker-photo img{width:100%;height:100%;object-fit:cover;display:block}';
    document.head.appendChild(style);
  }

  apply();
  const grid = document.querySelector('#grid');
  if (grid) {
    const observer = new MutationObserver(apply);
    observer.observe(grid,{childList:true,subtree:true});
    setTimeout(() => observer.disconnect(), 10000);
  }
})();