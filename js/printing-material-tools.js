import { supabase } from './croma-supabase.js';

const TARGET_INSUMOS='/interno/insumos/';
const TARGET_COMPOSICAO='/interno/composicao-custos/';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl=(v,d=4)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:d});
let cache=null;

function normalizedPath(){return (location.pathname.replace(/\/+$/,'')||'/')+'/'}
function paperProfile(p){return p?.metadata?.printing_material||null}
function consumableProfile(p){return p?.metadata?.printing_consumable||null}
function finishProfile(p){return p?.metadata?.printing_finish||null}
function stockUnits(p){
  const paper=paperProfile(p),cons=consumableProfile(p),finish=finishProfile(p);
  return Math.max(1,Number(
    paper?.sheets_per_stock_unit||
    cons?.units_per_stock_unit||
    finish?.units_per_stock_unit||
    p?.metadata?.input_configuration?.sheets_per_stock_unit||1
  ));
}
function technicalCost(p,costs){return Number(costs.get(p.id)||0)/stockUnits(p)}
function familyLabel(v){return ({fotografico:'Fotográfico',offset:'Offset / sulfite',vinil:'Vinil'})[v]||v||'Outro'}
function finishLabel(v){return ({brilho:'Brilho',fosco:'Fosco',liso:'Liso'})[v]||v||'—'}
function sidesLabel(v){return v==='dupla_face'?'Frente e verso':'Frente'}

async function fetchAll(table,select,apply){
  const out=[];
  for(let from=0;;from+=1000){
    let q=supabase.from(table).select(select).range(from,from+999);
    if(apply)q=apply(q);
    const {data,error}=await q;
    if(error)throw error;
    out.push(...(data||[]));
    if(!data||data.length<1000)break;
  }
  return out;
}

async function loadMatrixData(){
  if(cache)return cache;
  const all=(await fetchAll('products','id,nome,sku,unidade,metadata,bling_product_id,is_input,product_type,ativo',q=>q.eq('is_input',true).eq('product_type','produto')));
  const papers=all.filter(p=>paperProfile(p)?.enabled);
  const consumables=all.filter(p=>consumableProfile(p)?.enabled);
  const finishes=all.filter(p=>finishProfile(p)?.enabled);
  const ids=[...new Set([...papers,...consumables,...finishes].map(p=>p.id))];
  const costs=new Map(),suppliersByProduct=new Map();
  if(ids.length){
    const {data:costRows,error:ce}=await supabase.from('product_costs').select('product_id,cost').in('product_id',ids);
    if(ce)throw ce;
    (costRows||[]).forEach(r=>costs.set(r.product_id,Number(r.cost||0)));

    const {data:links,error:le}=await supabase.from('product_suppliers')
      .select('product_id,supplier_id,preferred,active,purchase_channel,purchase_url,purchase_price,effective_unit_cost,purchase_unit')
      .in('product_id',ids).eq('active',true);
    if(!le&&links?.length){
      const supplierIds=[...new Set(links.map(x=>x.supplier_id).filter(Boolean))];
      const nameMap=new Map();
      if(supplierIds.length){
        const {data:supplierRows,error:se}=await supabase.from('suppliers').select('id,name').in('id',supplierIds);
        if(!se)(supplierRows||[]).forEach(s=>nameMap.set(s.id,s.name));
      }
      links.sort((a,b)=>Number(b.preferred)-Number(a.preferred)).forEach(link=>{
        if(!suppliersByProduct.has(link.product_id))suppliersByProduct.set(link.product_id,{...link,supplier_name:nameMap.get(link.supplier_id)||'Fornecedor'});
      });
    }
  }

  papers.sort((a,b)=>{
    const pa=paperProfile(a),pb=paperProfile(b);
    return String(pa?.format||'').localeCompare(String(pb?.format||''),'pt-BR')
      || Number(pa?.sort_order||999)-Number(pb?.sort_order||999)
      || String(pa?.client_label||a.nome).localeCompare(String(pb?.client_label||b.nome),'pt-BR');
  });
  consumables.sort((a,b)=>String(consumableProfile(a)?.client_label||a.nome).localeCompare(String(consumableProfile(b)?.client_label||b.nome),'pt-BR'));
  finishes.sort((a,b)=>String(finishProfile(a)?.client_label||a.nome).localeCompare(String(finishProfile(b)?.client_label||b.nome),'pt-BR'));
  cache={papers,consumables,finishes,costs,suppliersByProduct};
  return cache;
}

function addStyles(){
  if(document.querySelector('#printingMaterialToolsStyle'))return;
  const style=document.createElement('style');
  style.id='printingMaterialToolsStyle';
  style.textContent=`
  .print-matrix{background:#fff;border:1px solid var(--croma-line,#e5e2ed);border-radius:18px;padding:18px;margin-top:16px}
  .print-matrix-head{display:flex;justify-content:space-between;align-items:end;gap:14px;flex-wrap:wrap}
  .print-matrix-head h2{margin:0;color:var(--croma-deep,#211c5c)}
  .print-matrix-head p{margin:5px 0 0;color:var(--croma-muted,#6e6a7e);font-size:.86rem}
  .print-matrix-filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
  .print-matrix-filters select{padding:9px 10px;border:1px solid #d8d6e4;border-radius:10px;background:#fff;font:inherit}
  .print-matrix-table{overflow:auto;margin-top:12px}
  .print-matrix-table table{width:100%;border-collapse:collapse;min-width:900px}
  .print-matrix-table th,.print-matrix-table td{padding:10px;border-bottom:1px solid #efedf4;text-align:left;vertical-align:middle}
  .print-matrix-table th{font-size:.7rem;text-transform:uppercase;color:var(--croma-purple,#30297f)}
  .print-matrix-name{font-weight:900;color:var(--croma-deep,#211c5c)}
  .print-matrix-muted{font-size:.76rem;color:var(--croma-muted,#6e6a7e)}
  .print-matrix-cost{font-weight:950;color:#245f44;white-space:nowrap}
  .print-matrix-pill{display:inline-flex;padding:4px 7px;border-radius:999px;background:#f0eef8;color:var(--croma-purple,#30297f);font-size:.7rem;font-weight:900}
  .quick-cost-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
  .quick-cost{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:end;padding:13px;border:1px solid #e4e0ed;background:#faf9fc;border-radius:14px}
  .quick-cost label{display:block;font-size:.7rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple,#30297f);margin-bottom:6px}
  .quick-cost select,.quick-cost input{width:100%;padding:9px;border:1px solid #d8d6e4;border-radius:9px;background:#fff;font:inherit}
  .quick-cost small{display:block;margin-top:5px;color:var(--croma-muted,#6e6a7e)}
  .quick-qty{display:grid;grid-template-columns:1fr 74px;gap:6px}
  @media(max-width:980px){.quick-cost-grid{grid-template-columns:1fr}.quick-cost{grid-template-columns:1fr auto}}
  @media(max-width:680px){.quick-cost{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function mountInsumos(){
  if(document.querySelector('#printingMaterialMatrix'))return;
  const anchor=document.querySelector('.stats')||document.querySelector('main');
  if(!anchor)return;
  addStyles();
  const box=document.createElement('section');
  box.className='print-matrix';box.id='printingMaterialMatrix';
  box.innerHTML=`<div class="print-matrix-head"><div><h2>Matriz de materiais para impressão</h2><p>Base objetiva de custo por folha. Embalagens são convertidas automaticamente para a unidade consumida na composição.</p></div><a class="btn light" href="../composicao-custos/">Usar em composição →</a></div>
  <div class="print-matrix-filters"><select id="pmFormat"><option value="">Todos os formatos</option></select><select id="pmFamily"><option value="">Todas as famílias</option></select><select id="pmFinish"><option value="">Todos os acabamentos</option></select></div>
  <div class="print-matrix-table"><table><thead><tr><th>Opção de papel</th><th>Formato</th><th>Gramatura</th><th>Acabamento</th><th>Adesivo</th><th>Impressão</th><th>Custo / folha</th><th>Fornecedor atual</th></tr></thead><tbody id="pmRows"><tr><td colspan="8">Carregando…</td></tr></tbody></table></div>`;
  anchor.insertAdjacentElement('afterend',box);
  try{
    const {papers,costs,suppliersByProduct}=await loadMatrixData();
    const formats=[...new Set(papers.map(p=>paperProfile(p).format).filter(Boolean))].sort();
    const families=[...new Set(papers.map(p=>paperProfile(p).family).filter(Boolean))].sort();
    const finishes=[...new Set(papers.map(p=>paperProfile(p).finish).filter(Boolean))].sort();
    box.querySelector('#pmFormat').insertAdjacentHTML('beforeend',formats.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''));
    box.querySelector('#pmFamily').insertAdjacentHTML('beforeend',families.map(v=>`<option value="${esc(v)}">${esc(familyLabel(v))}</option>`).join(''));
    box.querySelector('#pmFinish').insertAdjacentHTML('beforeend',finishes.map(v=>`<option value="${esc(v)}">${esc(finishLabel(v))}</option>`).join(''));
    const render=()=>{
      const f=box.querySelector('#pmFormat').value,fa=box.querySelector('#pmFamily').value,fi=box.querySelector('#pmFinish').value;
      const visible=papers.filter(p=>{const m=paperProfile(p);return(!f||m.format===f)&&(!fa||m.family===fa)&&(!fi||m.finish===fi)});
      box.querySelector('#pmRows').innerHTML=visible.length?visible.map(p=>{
        const m=paperProfile(p),s=suppliersByProduct.get(p.id),unit=technicalCost(p,costs);
        return `<tr><td><div class="print-matrix-name">${esc(m.client_label||p.nome)}</div><div class="print-matrix-muted">${esc(p.sku||'Sem SKU')} · ${esc(familyLabel(m.family))}</div></td><td><span class="print-matrix-pill">${esc(m.format||'—')}</span></td><td>${Number(m.grammage_gsm||0)||'—'} g</td><td>${esc(finishLabel(m.finish))}</td><td>${m.adhesive?'Sim':'Não'}</td><td>${esc(sidesLabel(m.print_sides))}</td><td><span class="print-matrix-cost">${brl(unit)}</span><div class="print-matrix-muted">${stockUnits(p)>1?`embalagem ÷ ${stockUnits(p)} folhas`:'custo unitário'}</div></td><td>${s?`<strong>${esc(s.supplier_name)}</strong><div class="print-matrix-muted">${esc(String(s.purchase_channel||'direto').replaceAll('_',' '))}</div>`:'<span class="print-matrix-muted">Sem fornecedor preferencial</span>'}</td></tr>`;
      }).join(''):'<tr><td colspan="8">Nenhum material com esses filtros.</td></tr>';
    };
    ['#pmFormat','#pmFamily','#pmFinish'].forEach(sel=>box.querySelector(sel).addEventListener('change',render));
    render();
  }catch(error){
    console.error('Falha na matriz de materiais',error);
    box.querySelector('#pmRows').innerHTML='<tr><td colspan="8">Não foi possível carregar a matriz de materiais.</td></tr>';
  }
}

function optionsFor(items,profileFn,costs,unitLabel){
  return items.map(p=>{
    const m=profileFn(p),cost=technicalCost(p,costs);
    return `<option value="${p.id}">${esc(m.client_label||p.nome)} — ${brl(cost)}/${unitLabel(m)}</option>`;
  }).join('');
}

function addComponentFromQuick(product,consumedUnits){
  const addButton=document.querySelector('#addComponent');if(!addButton)return;
  addButton.click();
  let selects=[...document.querySelectorAll('select[data-comp$=":component_product_id"]')];
  let sel=selects.at(-1);if(!sel)return;
  sel.value=product.id;sel.dispatchEvent(new Event('change',{bubbles:true}));
  selects=[...document.querySelectorAll('select[data-comp$=":component_product_id"]')];
  sel=selects.at(-1);
  const row=sel?.closest('tr');if(!row)return;
  const qty=row.querySelector('input[data-comp$=":quantity"]');
  if(qty){qty.value=String(Number(consumedUnits||0)/stockUnits(product));qty.dispatchEvent(new Event('input',{bubbles:true}))}
  const sync=row.querySelector('input[data-comp$=":sync_to_bling"]');
  if(sync){const desired=!!product.bling_product_id;if(sync.checked!==desired){sync.checked=desired;sync.dispatchEvent(new Event('change',{bubbles:true}))}}
  row.scrollIntoView({behavior:'smooth',block:'center'});
}

async function mountCompositionQuickPicker(){
  if(document.querySelector('#quickPrintingCosts'))return;
  const tableWrap=document.querySelector('.table-wrap');
  if(!document.querySelector('#addComponent')||!tableWrap)return;
  addStyles();
  try{
    const {papers,consumables,finishes,costs}=await loadMatrixData();
    const wrap=document.createElement('div');wrap.className='quick-cost-grid';wrap.id='quickPrintingCosts';

    const paperGroups=[...new Set(papers.map(p=>paperProfile(p).format||'Outros'))];
    const paperOptions=paperGroups.map(format=>`<optgroup label="${esc(format)}">${papers.filter(p=>(paperProfile(p).format||'Outros')===format).map(p=>{
      const m=paperProfile(p),cost=technicalCost(p,costs);
      return `<option value="${p.id}">${esc(m.client_label||p.nome)} — ${brl(cost)}/folha</option>`;
    }).join('')}</optgroup>`).join('');

    const inkOptions=optionsFor(consumables,consumableProfile,costs,()=> 'ml');
    const finishOptions=optionsFor(finishes,finishProfile,costs,m=>m.usage_unit||'un');

    wrap.innerHTML=`
      <div class="quick-cost"><div><label>Papel</label><div class="quick-qty"><select id="quickPaper">${paperOptions}</select><input id="quickPaperQty" type="number" min="0.01" step="0.01" value="1" title="Folhas"></div><small>Informe quantas folhas serão consumidas.</small></div><button class="btn light" id="quickPaperAdd" type="button">+ Papel</button></div>
      <div class="quick-cost"><div><label>Tinta</label><div class="quick-qty"><select id="quickInk">${inkOptions}</select><input id="quickInkQty" type="number" min="0.001" step="0.001" value="1" title="mL"></div><small>Custo por mL calculado pelo preço do frasco. Consumo por impressão ainda precisa ser calibrado.</small></div><button class="btn light" id="quickInkAdd" type="button">+ Tinta</button></div>
      <div class="quick-cost"><div><label>Acabamento</label><div class="quick-qty"><select id="quickFinish">${finishOptions}</select><input id="quickFinishQty" type="number" min="0.001" step="0.001" value="1"></div><small id="quickFinishHint">Informe o consumo do acabamento.</small></div><button class="btn light" id="quickFinishAdd" type="button">+ Acabamento</button></div>
    `;
    tableWrap.parentElement.insertBefore(wrap,tableWrap);

    const paperById=id=>papers.find(x=>x.id===id),inkById=id=>consumables.find(x=>x.id===id),finishById=id=>finishes.find(x=>x.id===id);
    wrap.querySelector('#quickPaperAdd').onclick=()=>addComponentFromQuick(paperById(wrap.querySelector('#quickPaper').value),Number(wrap.querySelector('#quickPaperQty').value||1));
    wrap.querySelector('#quickInkAdd').onclick=()=>addComponentFromQuick(inkById(wrap.querySelector('#quickInk').value),Number(wrap.querySelector('#quickInkQty').value||1));
    const refreshFinish=()=>{const p=finishById(wrap.querySelector('#quickFinish').value);if(!p)return;const m=finishProfile(p);wrap.querySelector('#quickFinishQty').value=String(Number(m.default_consumption||1));wrap.querySelector('#quickFinishHint').textContent=m.default_consumption_label||`Consumo em ${m.usage_unit||'unidade'} por item.`};
    wrap.querySelector('#quickFinish').addEventListener('change',refreshFinish);refreshFinish();
    wrap.querySelector('#quickFinishAdd').onclick=()=>addComponentFromQuick(finishById(wrap.querySelector('#quickFinish').value),Number(wrap.querySelector('#quickFinishQty').value||1));
  }catch(error){console.error('Falha ao carregar atalhos de composição',error)}
}

let started=false;
async function start(){
  if(started)return;started=true;
  const path=normalizedPath();
  if(path===TARGET_INSUMOS)await mountInsumos();
  if(path===TARGET_COMPOSICAO)await mountCompositionQuickPicker();
}

function schedule(){
  const path=normalizedPath();
  if(path!==TARGET_INSUMOS&&path!==TARGET_COMPOSICAO)return;
  if(document.body.dataset.staffRole){start();return}
  window.addEventListener('croma:staff-role',e=>{if(e.detail?.role)start()},{once:true});
  setTimeout(()=>{if(document.body.dataset.staffRole)start()},600);
}
document.readyState==='loading'?document.addEventListener('DOMContentLoaded',schedule):schedule();
