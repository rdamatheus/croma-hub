(()=>{
  const icon=d=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const stripProductDelete=()=>{
    document.querySelector('#deleteLocal')?.remove();
    document.querySelector('#syncOperation option[value="delete"]')?.remove();
    document.querySelectorAll('[data-action="delete"],button[data-product-del]').forEach(el=>el.remove());
  };
  const enhanceProducts=()=>{
    if(!location.pathname.startsWith('/interno/produtos/'))return;
    const wait=()=>{
      const list=document.querySelector('#productList');
      if(!list){setTimeout(wait,250);return}
      const head=list.closest('.card')?.querySelector('.list-head');
      if(head&&!head.querySelector('.croma-product-tools')){
        const tools=document.createElement('div');
        tools.className='croma-product-tools';
        tools.innerHTML='<button class="btn" type="button" id="cromaNewProduct">+ Novo produto</button><select id="cromaProductStatus" aria-label="Filtrar status"><option value="all">Todos</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>';
        head.appendChild(tools);
        tools.querySelector('#cromaNewProduct').onclick=()=>{
          const proper=document.querySelector('#newLocalProduct');
          if(proper){proper.click();return}
          document.querySelector('#editor')?.scrollIntoView({behavior:'smooth'});
        };
        tools.querySelector('#cromaProductStatus').onchange=e=>{
          document.querySelectorAll('.product-row').forEach(r=>{
            const inactive=r.textContent.toLowerCase().includes('inativo');
            const v=e.target.value;
            r.style.display=v==='all'||(v==='inactive'&&inactive)||(v==='active'&&!inactive)?'':'none';
          });
        };
      }
      const decorate=()=>{
        document.querySelectorAll('.product-row').forEach(r=>{
          if(!r.querySelector('.croma-edit-chip')){
            const x=document.createElement('span');x.className='croma-edit-chip';x.textContent='Editar';r.appendChild(x);
          }
        });
        stripProductDelete();
      };
      decorate();
      new MutationObserver(decorate).observe(document.body,{childList:true,subtree:true});
      const editor=document.querySelector('#editor');
      if(editor&&!editor.querySelector('#cromaToggleProduct')){
        const actions=editor.querySelector('.editor-actions');
        if(actions){
          const b=document.createElement('button');b.type='button';b.id='cromaToggleProduct';b.className='btn croma-deactivate';b.textContent='Ativar / Desativar produto';
          b.onclick=()=>{
            const ativo=document.querySelector('#ativo');if(!ativo)return;
            ativo.value=ativo.value==='false'?'true':'false';
            ativo.dispatchEvent(new Event('change',{bubbles:true}));
            const status=document.querySelector('#status');
            if(status)status.textContent=ativo.value==='false'?'Produto marcado como inativo. Clique em Salvar para confirmar.':'Produto reativado. Clique em Salvar para confirmar.';
          };
          actions.appendChild(b);
        }
      }
      stripProductDelete();
    };
    wait();
  };
  const add=()=>{
    document.body.classList.add('croma-modern');
    if(!document.querySelector('link[data-croma-modern]')){const l=document.createElement('link');l.rel='stylesheet';l.href='/css/interno-modern.css?v=20260831-3';l.dataset.cromaModern='1';document.head.appendChild(l)}
    const normalized=location.pathname.replace(/\/+$/,'/')||'/';
    if(normalized==='/interno/'){return}
    if(!document.querySelector('.croma-sidebar')){
      const path=location.pathname;
      const items=[
        ['/interno/contatos/','Contatos','<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'],
        ['/interno/pedidos/','Pedidos','<path d="M6 2h9l3 3v17H6z"/><path d="M14 2v4h4M9 11h6M9 15h6"/>'],
        ['/interno/produtos/','Produtos','<path d="m21 8-9 5-9-5 9-5 9 5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8"/>'],
        ['/interno/categorias/','Categorias','<path d="M20 13V7a2 2 0 0 0-2-2h-6l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6"/><circle cx="17" cy="17" r="3"/>'],
        ['/interno/gestao/','Gestão','<path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/>'],
        ['/interno/bling/','Bling','<path d="M20 7h-9M14 17H5M17 4l3 3-3 3M8 14l-3 3 3 3"/>'],
        ['/interno/copiloto/','Copiloto','<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M2 12h3M19 12h3M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12"/>']
      ];
      const nav=items.map(([href,label,d])=>`<a href="${href}" class="${path.startsWith(href)?'active':''}">${icon(d)}<span>${label}</span></a>`).join('');
      const side=document.createElement('aside');side.className='croma-sidebar';side.innerHTML=`<a class="brand" href="/interno/"><img src="/favicon.svg?v=20260831-3" alt=""><span><strong>Croma Hub</strong><small>Administração</small></span></a><div class="croma-nav-group">Painel</div>${nav}<div class="croma-sidebar-spacer"></div><a href="/">${icon('<path d="M3 12h18M3 12l7-7M3 12l7 7"/>')}<span>Ver site</span></a>`;document.body.appendChild(side);
      const header=document.querySelector('.internal-header');
      if(header&&!header.querySelector('.croma-mobile-menu')){const b=document.createElement('button');b.type='button';b.className='croma-mobile-menu';b.textContent='☰';b.onclick=()=>document.body.classList.toggle('nav-open');header.prepend(b)}
    }
    enhanceProducts();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',add);else add();
})();