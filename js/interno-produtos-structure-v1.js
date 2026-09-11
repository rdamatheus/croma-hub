import { supabase } from './croma-supabase.js';

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const params=new URLSearchParams(location.search);
const productId=params.get('produto')||'';
const detailMode=params.get('modo')==='ficha'&&!!productId;

function variationText(p){
  const raw=p?.metadata?.bling_raw?.variacao?.nome;
  if(raw)return String(raw).trim();
  const parentName=String(p?.parent_name||'').trim();
  const own=String(p?.nome||'').trim();
  if(parentName&&own.toLowerCase().startsWith(parentName.toLowerCase()))return own.slice(parentName.length).trim();
  return '';
}
function normalizeKey(key,value=''){
  const k=String(key||'').trim().toUpperCase();
  const v=String(value||'').trim().replace(/[()]/g,'');
  if(['KIT','QUANTIDADE','QUANTIDADES','QUANT','UN'].includes(k))return 'Quantidade';
  if(['TAMANHO','TAM'].includes(k))return 'Tamanho';
  if(k==='TAM.ESTAMPA')return 'Tamanho da estampa';
  if(k==='GRAMAT.')return 'Gramatura';
  if(k==='ES')return 'Espessura';
  if(k==='CORTE')return 'Tipo de corte';
  if(k==='CERAMICA')return 'Cerâmica';
  if(k==='MATERIAL')return 'Material';
  if(['COR','CORES'].includes(k)&&/^(1\/0|1\/1|4\/0|4\/4)$/i.test(v))return 'Impressão';
  if(k==='COR')return 'Cor';
  if(k==='CORES')return 'Impressão';
  if(k==='TIPO')return 'Tipo';
  if(k==='ACABAMENTO')return 'Acabamento';
  if(k==='PAGINAS')return 'Páginas';
  if(k==='CAMADAS')return 'Camadas';
  if(k==='REVESTIMENTO')return 'Revestimento';
  return key?String(key).trim():'Opção';
}
function normalizeValue(label,value){
  let v=String(value??'').trim();
  if(label==='Impressão'){
    const c=v.replace(/[()\s]/g,'');
    if(c==='4/0')return 'Frente — 4/0';
    if(c==='4/4')return 'Frente e verso — 4/4';
    if(c==='1/0')return 'Preto e branco frente — 1/0';
    if(c==='1/1')return 'Preto e branco frente e verso — 1/1';
  }
  if(label==='Quantidade')v=v.replace(/\s*(UN|UNID\.?|UNIDADES?)$/i,'').trim();
  return v||'—';
}
function parseVariation(p){
  const raw=variationText(p);
  if(!raw)return[];
  return raw.split(';').map(x=>x.trim()).filter(Boolean).map(part=>{
    const pos=part.indexOf(':');
    if(pos<0)return{label:'Opção',value:part,raw:part};
    const key=part.slice(0,pos).trim(),value=part.slice(pos+1).trim();
    const label=normalizeKey(key,value);
    return{label,value:normalizeValue(label,value),raw:part};
  });
}
function priceInfo(item,children=[]){
  if(children.length){
    const positives=children.map(x=>Number(x.preco)).filter(x=>Number.isFinite(x)&&x>0);
    if(positives.length)return{label:`A partir de ${money(Math.min(...positives))}`,kind:'from'};
    return{label:'Sob consulta',kind:'consult'};
  }
  const n=Number(item?.preco);
  if(Number.isFinite(n)&&n>0)return{label:money(n),kind:'price'};
  return{label:'Sob consulta',kind:'consult'};
}
function childPrice(p){const n=Number(p?.preco);return Number.isFinite(n)&&n>0?{label:money(n),kind:'price'}:{label:'Sob consulta',kind:'consult'};}
function detailHref(id){return `/interno/produtos/?produto=${encodeURIComponent(id)}&modo=ficha`;}
function structureLabel(p,children=[]){
  if(p?.parent_product_id&&p?.product_format==='composition')return'Variação + composição';
  if(p?.parent_product_id)return'Variação';
  if(children.length)return'Produto pai';
  if(p?.product_format==='composition')return'Composição';
  return'Simples';
}
function blingComponents(p){
  const rows=p?.metadata?.bling_raw?.estrutura?.componentes;
  return Array.isArray(rows)?rows.map((row,index)=>({
    key:`bling:${row?.produto?.id||index}`,
    blingId:Number(row?.produto?.id)||null,
    quantity:row?.quantidade??null,
    source:'bling'
  })):[];
}
function componentMarkup(component,componentMap){
  const resolved=component.localId?componentMap.byLocal.get(component.localId):component.blingId?componentMap.byBling.get(component.blingId):null;
  const name=resolved?.nome||component.name||(component.blingId?`Componente Bling #${component.blingId}`:'Componente');
  const link=resolved?.id?`<a href="${detailHref(resolved.id)}">${esc(name)}</a>`:`<span>${esc(name)}</span>`;
  const qty=component.quantity===null||component.quantity===undefined?'—':Number(component.quantity).toLocaleString('pt-BR',{maximumFractionDigits:4});
  return `<div class="product-component">${link}<span>${esc(qty)} un.</span></div>`;
}
function compositionFor(p,directRows,componentMap){
  const rows=[];
  const seen=new Set();
  for(const row of directRows.filter(x=>x.parent_product_id===p.id&&x.active!==false)){
    const key=`local:${row.component_product_id||row.external_component_id||row.id}`;if(seen.has(key))continue;seen.add(key);rows.push({key,localId:row.component_product_id,blingId:row.external_component_id?Number(row.external_component_id):null,quantity:row.quantity,source:row.source||'croma'});
  }
  for(const row of blingComponents(p)){
    const key=row.blingId?`bling:${row.blingId}`:row.key;if(seen.has(key))continue;seen.add(key);rows.push(row);
  }
  if(!rows.length)return'';
  return `<div class="product-composition"><div class="product-composition-title">Composição (${rows.length})</div><div class="product-component-list">${rows.map(x=>componentMarkup(x,componentMap)).join('')}</div></div>`;
}
async function getProducts(ids){
  const unique=[...new Set(ids.filter(Boolean))];if(!unique.length)return[];
  const out=[];for(let i=0;i<unique.length;i+=180){const{data,error}=await supabase.from('products').select('id,nome,sku,preco,product_type,product_format,parent_product_id,published_on_site,ativo,bling_product_id,metadata').in('id',unique.slice(i,i+180));if(error)throw error;out.push(...(data||[]));}return out;
}

async function loadStructure(id){
  const {data:current,error}=await supabase.from('products').select('id,nome,sku,preco,descricao,short_description,product_type,product_format,parent_product_id,published_on_site,ativo,bling_product_id,metadata').eq('id',id).single();
  if(error)throw error;
  const childrenResult=await supabase.from('products').select('id,nome,sku,preco,product_type,product_format,parent_product_id,published_on_site,ativo,bling_product_id,metadata').eq('parent_product_id',id).order('nome');
  if(childrenResult.error)throw childrenResult.error;
  const children=childrenResult.data||[];
  let parent=null;if(current.parent_product_id){const{data,error:pe}=await supabase.from('products').select('id,nome,sku,preco,product_type,product_format,parent_product_id,published_on_site,ativo,bling_product_id,metadata').eq('id',current.parent_product_id).maybeSingle();if(pe)throw pe;parent=data||null;}
  const structureIds=[current.id,...children.map(x=>x.id)];
  const componentsResult=await supabase.from('product_components').select('id,parent_product_id,component_product_id,quantity,position,active,source,external_component_id').in('parent_product_id',structureIds).eq('active',true).order('position');
  const directRows=componentsResult.error?[]:(componentsResult.data||[]);
  const localIds=directRows.map(x=>x.component_product_id).filter(Boolean);
  const rawBlingIds=[...blingComponents(current),...children.flatMap(blingComponents)].map(x=>x.blingId).filter(Boolean);
  const localProducts=await getProducts(localIds);
  let blingProducts=[];if(rawBlingIds.length){for(let i=0;i<rawBlingIds.length;i+=180){const{data,error:be}=await supabase.from('products').select('id,nome,sku,bling_product_id').in('bling_product_id',rawBlingIds.slice(i,i+180));if(!be)blingProducts.push(...(data||[]));}}
  return{current,children,parent,directRows,componentMap:{byLocal:new Map(localProducts.map(x=>[x.id,x])),byBling:new Map(blingProducts.map(x=>[Number(x.bling_product_id),x]))}};
}
function renderChild(p,directRows,componentMap){
  const options=parseVariation(p),price=childPrice(p),composition=compositionFor(p,directRows,componentMap);
  return `<article class="product-child-card"><div class="product-child-head"><div><strong>${esc(p.nome)}</strong><div class="product-meta">SKU: ${esc(p.sku||'—')}</div></div><span class="product-child-price ${price.kind==='consult'?'consult':''}">${esc(price.label)}</span></div>${options.length?`<div class="product-option-chips">${options.map(o=>`<span class="product-option-chip"><b>${esc(o.label)}:</b> ${esc(o.value)}</span>`).join('')}</div>`:'<div class="product-meta">Variação sem atributos estruturados identificados.</div>'}${composition}<div class="product-child-actions"><a class="btn light" href="${detailHref(p.id)}">Editar variação</a></div></article>`;
}
function activateSection(sectionId,button){
  document.querySelectorAll('.subnav button').forEach(x=>x.classList.toggle('active',x===button));
  document.querySelectorAll('#editor>.section').forEach(x=>x.classList.toggle('active',x.id===sectionId));
}
async function mountDetail(){
  const editor=$('#editor'),subnav=editor?.querySelector('.subnav');if(!editor||!subnav||$('#estruturaRelacionada'))return;
  const button=document.createElement('button');button.type='button';button.dataset.section='estruturaRelacionada';button.textContent='Visão comercial';subnav.insertBefore(button,subnav.querySelector('[data-section="variacoes"]')||null);
  const section=document.createElement('div');section.className='section';section.id='estruturaRelacionada';section.innerHTML='<div class="card"><div class="muted">Carregando estrutura comercial…</div></div>';const variationSection=$('#variacoes');variationSection?.parentNode?.insertBefore(section,variationSection);
  button.addEventListener('click',()=>activateSection('estruturaRelacionada',button));
  try{
    const data=await loadStructure(productId),{current,children,parent,directRows,componentMap}=data,price=priceInfo(current,children),ownComposition=compositionFor(current,directRows,componentMap),publicText=current.short_description||current.descricao||'Sem descrição comercial cadastrada.';
    section.innerHTML=`<div class="product-structure-panel"><div class="product-commercial-preview"><div class="product-commercial-preview-header"><div><span class="internal-eyebrow">Como o cliente deve enxergar</span><h2>${esc(current.nome)}</h2><p>${esc(publicText)}</p></div><span class="product-commercial-price ${price.kind}">${esc(price.label)}</span></div><div class="product-structure-summary"><span class="product-structure-badge">${esc(structureLabel(current,children))}</span>${children.length?`<span class="product-structure-badge">${children.length} variação(ões)</span>`:''}${current.published_on_site?'<span class="product-structure-badge">Publicado no site</span>':'<span class="product-structure-badge internal">Não publicado</span>'}</div></div>${parent?`<section class="product-structure-section"><h3>Produto pai</h3><span class="muted">Este cadastro é uma variação vinculada ao item abaixo.</span><div class="product-parent-context"><div><strong>${esc(parent.nome)}</strong><span class="product-meta">${esc(parent.sku||'Sem SKU')}</span></div><a class="btn light" href="${detailHref(parent.id)}">Abrir produto pai</a></div></section>`:''}${ownComposition?`<section class="product-structure-section"><h3>Composição deste item</h3><span class="muted">Componentes do cadastro Croma e/ou estrutura recebida do Bling.</span>${ownComposition.replace('class="product-composition"','class="product-composition" style="border-top:0;padding-top:0"')}</section>`:''}<section class="product-structure-section"><h3>${children.length?'Variações vinculadas':'Variações vinculadas'}</h3><span class="muted">Atributos são interpretados do padrão do Bling (ATRIBUTO:VALOR;ATRIBUTO:VALOR). Cada variação continua editável na própria ficha.</span>${children.length?`<div class="product-children-grid">${children.map(p=>renderChild({...p,parent_name:current.nome},directRows,componentMap)).join('')}</div>`:'<div class="product-structure-empty">Este item não possui produtos filhos vinculados.</div>'}</section><section class="product-structure-section"><h3>Campos internos</h3><span class="muted">Custos, fornecedor, tributação, estoque e integração continuam restritos ao painel. A visualização comercial acima não altera nem expõe esses dados.</span><div class="product-child-actions"><button class="btn light" type="button" id="editCommercialFields">Editar cadastro comercial</button><button class="btn light" type="button" id="editPriceFields">Editar precificação</button></div></section></div>`;
    $('#editCommercialFields')?.addEventListener('click',()=>{const b=subnav.querySelector('[data-section="cadastro"]');if(b)activateSection('cadastro',b);});
    $('#editPriceFields')?.addEventListener('click',()=>{const b=subnav.querySelector('[data-section="precos"]');if(b)activateSection('precos',b);});
  }catch(e){console.error('Falha ao montar estrutura do produto',e);section.innerHTML='<div class="product-structure-error">Não foi possível montar a estrutura relacionada deste item. Os dados originais não foram alterados.</div>';}
}

let listAnnotating=false;
async function annotateVisibleRows(){
  if(detailMode||listAnnotating)return;const rows=[...document.querySelectorAll('#productList [data-open-id]')];if(!rows.length)return;listAnnotating=true;
  try{
    const ids=rows.map(r=>r.dataset.openId).filter(Boolean),items=await getProducts(ids),byId=new Map(items.map(x=>[x.id,x])),parentIds=[...new Set(items.map(x=>x.parent_product_id).filter(Boolean))],parents=await getProducts(parentIds),parentMap=new Map(parents.map(x=>[x.id,x]));
    let childRows=[];for(let i=0;i<ids.length;i+=180){const{data,error}=await supabase.from('products').select('id,parent_product_id').in('parent_product_id',ids.slice(i,i+180));if(!error)childRows.push(...(data||[]));}
    const counts=new Map();for(const c of childRows)counts.set(c.parent_product_id,(counts.get(c.parent_product_id)||0)+1);
    for(const row of rows){const p=byId.get(row.dataset.openId);if(!p)continue;row.classList.toggle('is-child-row',!!p.parent_product_id);row.classList.toggle('is-parent-row',(counts.get(p.id)||0)>0);let host=row.querySelector('.product-list-relationship');if(host)host.remove();host=document.createElement('div');host.className='product-list-relationship';if(p.parent_product_id){const par=parentMap.get(p.parent_product_id);host.innerHTML+=`<span class="product-structure-badge">↳ Variação${par?` de ${esc(par.nome)}`:''}</span>`;}if(counts.get(p.id))host.innerHTML+=`<span class="product-structure-badge">${counts.get(p.id)} filho(s)</span>`;if(p.product_format==='composition')host.innerHTML+='<span class="product-structure-badge internal">Composição</span>';if(host.childNodes.length)row.querySelector('.product-name')?.parentElement?.appendChild(host);}
  }finally{listAnnotating=false;}
}
function observeList(){if(detailMode)return;const list=$('#productList');if(!list)return;let timer;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(annotateVisibleRows,80);}).observe(list,{childList:true,subtree:false});annotateVisibleRows();}

if(detailMode){let tries=0;const timer=setInterval(()=>{tries++;if($('#editor')&&$('#editor .subnav')){clearInterval(timer);mountDetail();}else if(tries>80)clearInterval(timer);},50);}else{let tries=0;const timer=setInterval(()=>{tries++;if($('#productList')){clearInterval(timer);observeList();}else if(tries>80)clearInterval(timer);},50);}
