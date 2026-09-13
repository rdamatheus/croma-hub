(() => {
  const root = document.querySelector('#productCatalogRoot');
  if (!root) return;

  function plainText(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    try {
      const doc = new DOMParser().parseFromString(raw, 'text/html');
      return (doc.body.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\s+([,.;:!?])/g, '$1')
        .trim();
    } catch (_) {
      return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function polishProductDetail() {
    if (!new URLSearchParams(location.search).get('produto')) return false;

    const hero = root.querySelector('.public-editorial-hero');
    if (!hero) return false;

    const media = hero.firstElementChild;
    if (media) media.classList.add('public-product-media');

    const lead = hero.querySelector('.public-lead');
    if (lead) {
      const cleaned = plainText(lead.textContent);
      if (cleaned) lead.textContent = cleaned;
    }

    return true;
  }

  if (polishProductDetail()) return;

  const observer = new MutationObserver(() => {
    if (polishProductDetail()) observer.disconnect();
  });

  observer.observe(root, { childList: true, subtree: true });
})();
