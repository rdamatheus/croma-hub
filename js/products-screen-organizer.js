const norm=s=>String(s||'').trim().toLowerCase();
const byText=(text)=>[...document.querySelectorAll('button,a')].find(el=>norm(el.textContent)===norm(text));

function injectStyles(){if(document.querySelector('#productOrganizerStyles'))return;const s=document.createElement('style');s.id='productOrganizerStyles';s.textContent=`
#productUnifiedToolbar{display:grid;grid-template-columns:minmax(320px,1fr) auto;gap:14px;align-items:start;margin-bottom:14px}
#productUnifiedToolbar .pu-search{display:grid;gap:6px}.pu-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.pu-meta{font-size:.82rem;color:var(--croma-muted)}
.pu-menu{position:relative}.pu-menu>summary{list-style:none;cursor:pointer}.pu-menu>summary::-webkit-details-marker{display:none}.pu-pop{position:absolute;right:0;top:calc(100% + 7px);z-index:40;min-width:270px;padding:8px;background:#fff;border:1px solid var(--croma-line);border-radius:12px;box-shadow:0 16px 40px #211c5c24;display:grid;gap:6px}.pu-pop button{width:100%;text-align:left}.pu-pop small{display:block;font-weight:500;color:var(--croma-muted);margin-top:2px}
@media(max-width:850px){#productUnifiedToolbar{grid-template-columns:1fr}.pu-actions{justify-content:flex-start}.pu-pop{left:0;right:auto}}
`;document.head.appendChild(s)}

function proxyClick(label){const el=byText(label);if(el){el.click();return true}return false}
function hideOriginals(){
  document.querySelectorAll('.list-head h2').forEach(h=>{if(norm(h.textContent)==='produtos cadastrados')h.style.display='none'});
  [...document.querySelectorAll('button,a')].forEach(el=>{
    const t=norm(el.textContent);
    if(['novo cadastro local','importar do bling','importar catálogo de fornecedor','catálogos de fornecedores'].includes(t))el.style.display='none';
  });
  // remove dropdown redundante no topo, mas não mexe nos filtros laterais
  document.querySelectorAll('.list-head select').forEach(s=>s.style.display='none');
}

function organize(){
  const head=document.querySelector('.list-head');const search=document.querySelector('#productSearch');if(!head||!search)return false;
  injectStyles();hideOriginals();
  if(document.querySelector('#productUnifiedToolbar'))return true;
  const wrap=document.createElement('div');wrap.id='productUnifiedToolbar';
  const searchBox=document.createElement('div');searchBox.className='pu-search';searchBox.innerHTML='<label style="font-weight:900;color:var(--croma-purple);font-size:.78rem">Buscar produtos</label>';
  search.placeholder='Buscar por nome, código Croma, SKU, categoria ou Bling';searchBox.appendChild(search);
  const count=document.querySelector('#productCount');if(count){count.classList.add('pu-meta');searchBox.appendChild(count)}
  const actions=document.createElement('div');actions.className='pu-actions';
  actions.innerHTML=`<button class="btn" id="puNewProduct" type="button">+ Novo produto</button>
  <details class="pu-menu" id="puImportMenu"><summary class="btn light">Importar ▾</summary><div class="pu-pop">
    <button class="btn light" data-pu="bling">Produtos do Bling<small>Escolher produtos já sincronizados no catálogo local.</small></button>
    <button class="btn light" data-pu="supplier-import">Catálogo de fornecedor<small>Enviar XML padrão Croma e atualizar SKUs e custos.</small></button>
  </div></details>
  <details class="pu-menu" id="puIntegrationMenu"><summary class="btn light">Integrações e catálogos ▾</summary><div class="pu-pop">
    <button class="btn light" data-pu="supplier-browser">Catálogos de fornecedores<small>Consultar catálogo atual e histórico de importações.</small></button>
    <button class="btn light" data-pu="bling">Catálogo do Bling<small>Consultar e atualizar o espelho local do Bling.</small></button>
  </div></details>`;
  wrap.append(searchBox,actions);head.parentNode.insertBefore(wrap,head);head.style.display='none';
  document.querySelector('#puNewProduct').onclick=()=>{if(!proxyClick('+ Novo produto'))proxyClick('Novo produto')};
  wrap.querySelectorAll('[data-pu]').forEach(b=>b.onclick=()=>{const a=b.dataset.pu;if(a==='bling')proxyClick('Importar do Bling');if(a==='supplier-import')proxyClick('Importar catálogo de fornecedor');if(a==='supplier-browser')proxyClick('Catálogos de fornecedores');b.closest('details')?.removeAttribute('open')});
  return true;
}

let tries=0;const timer=setInterval(()=>{tries++;if(organize()||tries>40)clearInterval(timer)},250);
const mo=new MutationObserver(()=>{hideOriginals();if(!document.querySelector('#productUnifiedToolbar'))organize()});mo.observe(document.documentElement,{childList:true,subtree:true});
