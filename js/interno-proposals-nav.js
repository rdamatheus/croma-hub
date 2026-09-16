function injectProposalsModule(){
  const categories=[...document.querySelectorAll('.category')];
  const target=categories.find(section=>section.querySelector('.category-head h2')?.textContent?.trim()==='Cadastros e operação comercial');
  const grid=target?.querySelector('.internal-grid');
  if(!grid||grid.querySelector('[data-proposals-module]')) return;

  const card=document.createElement('a');
  card.className='module';
  card.href='propostas/';
  card.dataset.proposalsModule='true';
  card.innerHTML=`<span class="visual"><svg viewBox="0 0 24 24"><path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/><path d="m15 16 2 2 3-4"/></svg></span><h3>Propostas</h3><p>Cotações com cliente, custo, frete, markup, referência de mercado e preço sugerido.</p><span class="go">Abrir propostas →</span>`;

  const productsCard=[...grid.children].find(el=>el.querySelector('h3')?.textContent?.trim()==='Produtos');
  if(productsCard) grid.insertBefore(card,productsCard);
  else grid.prepend(card);
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',injectProposalsModule,{once:true});
else injectProposalsModule();
