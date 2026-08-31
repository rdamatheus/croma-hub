(() => {
  if (!location.pathname.includes('/servicos/adesivos/')) return;

  const photos = [
    {keys:['rótulos em bobina','rotulos em bobina'], url:'/assets/produtos/rotulos-bobina-flor-de-liz.jpg', alt:'Rótulos adesivos em bobina'},
    {keys:['rótulos em folha','rotulos em folha'], url:'https://images.pexels.com/photos/16605271/pexels-photo-16605271.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Folhas com adesivos impressos'},
    {keys:['adesivo papel'], url:'https://images.pexels.com/photos/7123558/pexels-photo-7123558.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Folha de adesivos em papel'},
    {keys:['casca de ovo'], url:'https://images.pexels.com/photos/9999871/pexels-photo-9999871.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos redondos impressos'},
    {keys:['vinil branco brilho','vinil brilho'], url:'https://images.pexels.com/photos/15241084/pexels-photo-15241084.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos de vinil aplicados em superfície'},
    {keys:['vinil branco fosco','vinil fosco'], url:'https://images.pexels.com/photos/2783837/pexels-photo-2783837.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Coleção de adesivos impressos'},
    {keys:['vinil transparente','transparente'], url:'https://images.pexels.com/photos/10535623/pexels-photo-10535623.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos impressos em folha'},
    {keys:['recorte','contorno'], url:'https://images.pexels.com/photos/16605272/pexels-photo-16605272.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos com recortes variados'},
    {keys:['holográfico','holografico','metalizado'], url:'https://images.pexels.com/photos/7123564/pexels-photo-7123564.jpeg?auto=compress&cs=tinysrgb&w=1200', alt:'Adesivos coloridos com acabamento especial'}
  ];

  const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const selectPhoto = title => {
    const t = normalize(title);
    return photos.find(p => p.keys.some(k => t.includes(normalize(k))));
  };

  const apply = () => {
    document.querySelectorAll('.sticker-card').forEach(card => {
      if (card.dataset.mediaEnhanced === '1') return;
      const title = card.querySelector('h2')?.textContent || card.dataset.product || '';
      const photo = selectPhoto(title);
      if (!photo) return;
      const media = card.querySelector('.sticker-photo');
      if (!media) return;
      const img = document.createElement('img');
      img.src = photo.url;
      img.alt = photo.alt || title;
      img.loading = 'lazy';
      img.decoding = 'async';
      img.onerror = () => {
        img.remove();
        media.classList.add('sticker-photo-missing');
        media.textContent = 'Imagem em atualização';
      };
      media.replaceChildren(img);
      card.dataset.mediaEnhanced = '1';
    });
  };

  if (!document.querySelector('style[data-sticker-media-enhancer]')) {
    const style = document.createElement('style');
    style.dataset.stickerMediaEnhancer = '1';
    style.textContent = '.sticker-photo-missing{font-size:.8rem!important;font-weight:800;color:#77748a;text-align:center;padding:16px;background:#f1f0f6!important}';
    document.head.appendChild(style);
  }

  apply();
  const grid = document.querySelector('#grid');
  if (grid) {
    const observer = new MutationObserver(apply);
    observer.observe(grid,{childList:true,subtree:true});
    setTimeout(() => observer.disconnect(), 8000);
  }
})();