const qs=new URLSearchParams(location.search);
const detailMode=qs.get('modo')==='ficha'&&!!qs.get('produto');

function norm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()}
function findLegacyFilterPanel(){
  const headings=[...document.querySelectorAll('h1,h2,h3,strong')];
  const h=headings.find(el=>norm(el.textContent).includes('filtros do cadastro'));
  if(!h)return null;
  let node=h.parentElement;
  for(let i=0;node&&i<6;i++,node=node.parentElement){
    const txt=norm(node.textContent);
    if(node.querySelectorAll('select').length>=3&&txt.includes('integracao bling'))return node;
  }
  return h.parentElement;
}
function ensureStyle(){
  if(document.querySelector('#productsListDetailControllerStyle'))return;
  const s=document.createElement('style');s.id='productsListDetailControllerStyle';s.textContent=`
  .products-filter-integrated{position:sticky;top:86px}.products-filter-integrated .products-filters{position:static;border:0;padding:0;background:transparent}.products-filter-integrated .products-filters h3{margin-top:0}.products-workspace.products-no-inner-filter{grid-template-columns:minmax(0,1fr)!important}.product-detail-mode #productsWorkspace,.product-detail-mode #importCard,.product-detail-mode #corePager{display:none!important}.product-detail-mode #editor{display:block!important}.product-detail-mode .products-detail-back{display:inline-flex;margin-bottom:14px}.product-detail-mode .list-head{display:none!important}
  `;document.head.appendChild(s);
}
function detailHref(id){return `/interno/produtos/?produto=${encodeURIComponent(id)}&modo=ficha`}
function rewriteOpenLinks(){
  document.querySelectorAll('[data-open-id]').forEach(row=>{
    const id=row.dataset.openId;if(!id)return;
    const a=row.querySelector('.core-open');if(a)a.href=detailHref(id);
  });
}
function integrateFilters(){
  const inner=document.querySelector('#productsWorkspace .products-filters');
  const workspace=document.querySelector('#productsWorkspace');
  const legacy=findLegacyFilterPanel();
  if(!inner||!workspace||!legacy||legacy.dataset.coreIntegrated==='1')return false;
  legacy.dataset.coreIntegrated='1';
  legacy.classList.add('products-filter-integrated');
  legacy.innerHTML='';
  legacy.appendChild(inner);
  workspace.classList.add('products-no-inner-filter');
  return true;
}
function addBackButton(){
  const editor=document.querySelector('#editor');if(!editor)return;
  if(!editor.querySelector('.products-detail-back')){
    const a=document.createElement('a');a.className='btn light products-detail-back';a.href='/interno/produtos/';a.textContent='← Voltar para produtos';editor.prepend(a);
  }
}
function hideListPageChrome(){
  if(!detailMode)return;
  document.body.classList.add('product-detail-mode');
  const legacy=findLegacyFilterPanel();if(legacy)legacy.style.display='none';
  const tabs=[...document.querySelectorAll('a,button')].filter(el=>['produtos','categorias','segmentos'].includes(norm(el.textContent)));
  tabs.forEach(el=>{const wrap=el.parentElement;if(wrap&&tabs.every(x=>x.parentElement===wrap))wrap.style.display='none'});
  addBackButton();
  const wanted=qs.get('produto');
  const u=new URL(location.href);if(u.searchParams.get('modo')!=='ficha'){u.searchParams.set('modo','ficha');history.replaceState(null,'',u.pathname+u.search+u.hash)}
  const editor=document.querySelector('#editor');if(editor?.classList.contains('open'))editor.scrollIntoView({block:'start'});
}
function routeRowClick(e){
  const row=e.target.closest?.('[data-open-id]');if(!row)return;
  const id=row.dataset.openId;if(!id)return;
  if(e.target.closest('a,button,input,select,textarea')){
    const open=e.target.closest('.core-open');if(open){e.preventDefault();e.stopImmediatePropagation();location.href=detailHref(id)}
    return;
  }
  e.preventDefault();e.stopImmediatePropagation();location.href=detailHref(id);
}
function routeRowKey(e){if(e.key!=='Enter'&&e.key!==' ')return;const row=e.target.closest?.('[data-open-id]');if(!row)return;e.preventDefault();e.stopImmediatePropagation();location.href=detailHref(row.dataset.openId)}
function sync(){ensureStyle();integrateFilters();rewriteOpenLinks();hideListPageChrome()}
document.addEventListener('click',routeRowClick,true);
document.addEventListener('keydown',routeRowKey,true);
const obs=new MutationObserver(sync);obs.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
setTimeout(sync,300);setTimeout(sync,1200);
