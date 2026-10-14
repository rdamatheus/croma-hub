import { supabase } from './croma-supabase.js';

const TARGET_INSUMOS='/interno/insumos/';
const TARGET_COMPOSICAO='/interno/composicao-custos/';
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl=(v,d=4)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',minimumFractionDigits:2,maximumFractionDigits:d});
let cache=null;

function normalizedPath(){return (location.pathname.replace(/\/+$/,'')||'/')+'/'}
function profileOf(p){return p?.metadata?.printing_material||null}
function sheetsPerStockUnit(p){return Math.max(1,Number(profileOf(p)?.sheets_per_stock_unit||p?.metadata?.input_configuration?.sheets_per_stock_unit||1))}
function usageCost(p,costs){return Number(costs.get(p.id)||0)/sheetsPerStockUnit(p)}
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
  const products=(await fetchAll('products','id,nome,sku,unidade,metadata,bling_product_id,is_input,product_type,ativo',q=>q.eq('is_input',true).eq('product_type','produto')))
    .filter(p=>profileOf(p)?.enabled);
  const ids=products.map(p=>p.id);
  const costs=new Map();
  const suppliersByProduct=new Map();
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
  products.sort((a,b)=>{
    const pa=profileOf(a),pb=profileOf(b);
    return String(pa?.format||'').localeCompare(String(pb?.format||''),'pt-BR')
      || Number(pa?.sort_order||999)-Number(pb?.sort_order||999)
      || String(pa?.client_label||a.nome).localeCompare(String(pb?.client_label||b.nome),'pt-BR');
  });
  cache={products,costs,suppliersByProduct};
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
  .paper-quick{display:grid;grid-template-columns:minmax(240px,1fr) auto;gap:10px;align-items:end;padding:14px;border:1px solid #e4e0ed;background:#faf9fc;border-radius:14px;margin:12px 0}
  .paper-quick label{display:block;font-size:.7rem;font-weight:900;text-transform:uppercase;color:var(--croma-purple,#30297f);margin-bottom:6px}
  .paper-quick select{width:100%;padding:10px;border:1px solid #d8d6e4;border-radius:10px;background:#fff;font:inherit}
  .paper-quick small{display:block;margin-top:5px;color:var(--croma-muted,#6e6a7e)}
  @media(max-width:680px){.paper-quick{grid-template-columns:1fr}}
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
  box.innerHTML=`<div class="print-matrix-head"><div><h2>Matriz de materiais para impressão</h2><p>Base objetiva de custo por folha. O custo de embalagens é convertido automaticamente para a unidade consumida na composição.</p></div><a class="btn light" href="../composicao-custos/">Usar em composição →</a></div>
  <div class="print-matrix-filters"><select id="pmFormat"><option value="">Todos os formatos</option></select><select id="pmFamily"><option value="">Todas as famílias</option></select><select id="pmFinish"><option value="">Todos os acabamentos</option></select></div>
  <div class="print-matrix-table"><table><thead><tr><th>Opção de papel</th><th>Formato</th><th>Gramatura</th><th>Acabamento</th><th>Adesivo</th><th>Impressão</th><th>Custo / folha</th><th>Fornecedor atual</th></tr></thead><tbody id="pmRows"><tr><td colspan="8">Carregando…</td></tr></tbody></table></div>`;
  anchor.insertAdjacentElement('afterend',box);
  try{
    const {products,costs,suppliersByProduct}=await loadMatrixData();
    const formats=[...new Set(products.map(p=>profileOf(p).format).filter(Boolean))].sort();
    const families=[...new Set(products.map(p=>profileOf(p).family).filter(Boolean))].sort();
    const finishes=[...new Set(products.map(p=>profileOf(p).finish).filter(Boolean))].sort();
    box.querySelector('#pmFormat').insertAdjacentHTML('beforeend',formats.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join(''));
    box.querySelector('#pmFamily').insertAdjacentHTML('beforeend',families.map(v=>`<option value="${esc(v)}">${esc(familyLabel(v))}</option>`).join(''));
    box.querySelector('#pmFinish').insertAdjacentHTML('beforeend',finishes.map(v=>`<option value="${esc(v)}">${esc(finishLabel(v))}</option>`).join(''));
    const render=()=>{
      const f=box.querySelector('#pmFormat').value,fa=box.querySelector('#pmFamily').value,fi=box.querySelector('#pmFinish').value;
      const visible=products.filter(p=>{const m=profileOf(p);return(!f||m.format===f)&&(!fa||m.family===fa)&&(!fi||m.finish===fi)});
      box.querySelector('#pmRows').innerHTML=visible.length?visible.map(p=>{
        const m=profileOf(p),s=suppliersByProduct.get(p.id),unit=usageCost(p,costs);
        return `<tr><td><div class="print-matrix-name">${esc(m.client_label||p.nome)}</div><div class="print-matrix-muted">${esc(p.sku||'Sem SKU')} · ${esc(familyLabel(m.family))}</div></td><td><span class="print-matrix-pill">${esc(m.format||'—')}</span></td><td>${Number(m.grammage_gsm||0)||'—'} g</td><td>${esc(finishLabel(m.finish))}</td><td>${m.adhesive?'Sim':'Não'}</td><td>${esc(sidesLabel(m.print_sides))}</td><td><span class="print-matrix-cost">${brl(unit)}</span><div class="print-matrix-muted">${sheetsPerStockUnit(p)>1?`embalagem ÷ ${sheetsPerStockUnit(p)} folhas`:'custo unitário'}</div></td><td>${s?`<strong>${esc(s.supplier_name)}</strong><div class="print-matrix-muted">${esc(String(s.purchase_channel||'direto').replaceAll('_',' '))}</div>`:'<span class="print-matrix-muted">Sem fornecedor preferencial</span>'}</td></tr>`;
      }).join(''):'<tr><td colspan="8">Nenhum material com esses filtros.</td></tr>';
    };
    ['#pmFormat','#pmFamily','#pmFinish'].forEach(sel=>box.querySelector(sel).addEventListener('change',render));
    render();
  }catch(error){
    console.error('Falha na matriz de materiais',error);
    box.querySelector('#pmRows').innerHTML='<tr><td colspan="8">Não foi possível carregar a matriz de materiais.</td></tr>';
  }
}

async function mountCompositionQuickPicker(){
  if(document.querySelector('#paperQuickPicker'))return;
  const addButton=document.querySelector('#addComponent');
  const tableWrap=document.querySelector('.table-wrap');
  if(!addButton||!tableWrap)return;
  addStyles();
  try{
    const {products,costs}=await loadMatrixData();
    if(!products.length)return;
    const wrap=document.createElement('div');
    wrap.className='paper-quick';wrap.id='paperQuickPicker';
    const groups=[...new Set(products.map(p=>profileOf(p).format||'Outros'))];
    const options=groups.map(format=>`<optgroup label="${esc(format)}">${products.filter(p=>(profileOf(p).format||'Outros')===format).map(p=>{
      const m=profileOf(p),cost=usageCost(p,costs);
      return `<option value="${p.id}">${esc(m.client_label||p.nome)} — ${brl(cost)}/folha</option>`;
    }).join('')}</optgroup>`).join('');
    wrap.innerHTML=`<div><label>Adicionar papel rapidamente</label><select id="paperQuickSelect">${options}</select><small>Adiciona 1 folha à composição e converte automaticamente embalagens de 20/50 folhas em fração do pacote.</small></div><button class="btn light" id="paperQuickAdd" type="button">+ Adicionar 1 folha</button>`;
    tableWrap.parentElement.insertBefore(wrap,tableWrap);

    wrap.querySelector('#paperQuickAdd').addEventListener('click',()=>{
      const id=wrap.querySelector('#paperQuickSelect').value;
      const p=products.find(x=>x.id===id);if(!p)return;
      addButton.click();
      let selects=[...document.querySelectorAll('select[data-comp$=":component_product_id"]')];
      let sel=selects.at(-1);if(!sel)return;
      sel.value=id;sel.dispatchEvent(new Event('change',{bubbles:true}));
      selects=[...document.querySelectorAll('select[data-comp$=":component_product_id"]')];
      sel=selects.at(-1);
      const row=sel?.closest('tr');if(!row)return;
      const qty=row.querySelector('input[data-comp$=":quantity"]');
      if(qty){qty.value=String(1/sheetsPerStockUnit(p));qty.dispatchEvent(new Event('input',{bubbles:true}))}
      const sync=row.querySelector('input[data-comp$=":sync_to_bling"]');
      if(sync&&!p.bling_product_id&&sync.checked){sync.checked=false;sync.dispatchEvent(new Event('change',{bubbles:true}))}
      row.scrollIntoView({behavior:'smooth',block:'center'});
    });
  }catch(error){console.error('Falha ao carregar seletor rápido de papel',error)}
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
