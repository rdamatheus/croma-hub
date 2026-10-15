import { getStaffSession } from './interno-auth.js';
import { supabase } from './croma-supabase.js';

const el = id => document.getElementById(id);
const SUPPLIER_ID = '3fee83e7-8b01-46cc-8b00-01f9e9268e3e';
const allowed = new Set(['owner','manager']);
const brl = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const number = n => Number(n).toLocaleString('pt-BR',{maximumFractionDigits:2});
const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const state = {items:[],quotes:[],filtered:[],selected:new Map(),page:1,pageSize:20,catalogDate:null,freight:18};
function setAccess(title,message,retry=false){el('compareAccessTitle').textContent=title;el('compareAccessMessage').textContent=message;el('compareRetry').hidden=!retry}
function td(tr,value){const cell=document.createElement('td');cell.textContent=String(value ?? '—');tr.appendChild(cell);return cell}
function materialOf(row){const name=norm(row.name);if(name.includes('bopp'))return 'bopp';if(name.includes('vinil')||name.includes('pvc'))return 'vinil';if(name.includes('papel')||name.includes('couche')||name.includes('couchê'))return 'papel';return 'outros'}
function qty(row){const n=Number(row.base_quantity||row.minimum_order_quantity);return Number.isFinite(n)&&n>0?n:null}
function isLot(row){return row.price_basis==='lot' && qty(row)!==null}
function perUnit(row){if(isLot(row))return Number(row.purchase_price)/qty(row);if(row.price_basis==='unit')return Number(row.purchase_price);return null}
function total(row){return Number(row.purchase_price)+state.freight}
function printSpecs(row){const a=row.attributes||{};return [a.printMode ? 'Impressão '+a.printMode : null,a.sourceSize ? 'Formato de impressão '+a.sourceSize : null].filter(Boolean).join(' · ')||'Especificações complementares não cadastradas'}
function specsKey(row){const a=row.attributes||{};return [norm(row.name),norm(a.printMode),norm(a.sourceSize),String(row.price_basis||''),String(qty(row)||'')].join('|')}
function dateText(value){if(!value)return 'Sem data';const date=new Date(value.length===10?value+'T12:00:00':value);return Number.isNaN(date.getTime())?'Sem data':date.toLocaleDateString('pt-BR')}
function refreshFreight(){const raw=el('compareFreight').value;const f=raw===''?NaN:Number(raw);if(!Number.isFinite(f)||f<0){el('compareStatus').textContent='Informe um frete válido, maior ou igual a zero.';return false}state.freight=f;return true}
function fillQuotes(){
  const select=el('compareQuote');
  for(const q of state.quotes){const option=document.createElement('option');option.value=q.proposal_item_id;option.textContent='#'+q.proposal_no+' · '+number(q.quantity)+' un. · '+String(q.description||'').slice(0,100);select.appendChild(option)}
}
function quoteChanged(){
  const q=state.quotes.find(item=>item.proposal_item_id===el('compareQuote').value);
  if(!q){el('compareQuoteContext').textContent='';return}
  const d=norm(q.description);
  el('compareMaterial').value=d.includes('bopp')?'bopp':d.includes('vinil')?'vinil':d.includes('papel')||d.includes('couche')?'papel':'';
  el('compareSearch').value='';
  const n=Number(q.quantity);
  el('compareQuantity').value=Number.isInteger(n)&&n>0?n:'';
  el('compareQuoteContext').textContent='Proposta #'+q.proposal_no+': '+q.description+' — confira manualmente dimensões, acabamento e substrato com cada SKU.';
  apply();
}
function apply(){
  if(!refreshFreight())return;
  const search=norm(el('compareSearch').value);
  const material=el('compareMaterial').value;
  const input=el('compareQuantity').value.trim();
  const quantity=input?Number(input):null;
  if(quantity!==null&&(!Number.isSafeInteger(quantity)||quantity<1)){el('compareStatus').textContent='Quantidade deve ser um número inteiro positivo.';return}
  state.filtered=state.items.filter(row=>{
    if(material&&materialOf(row)!==material)return false;
    if(search&&!norm([row.sku,row.name,row.description].join(' ')).includes(search))return false;
    if(quantity!==null&&qty(row)!==quantity)return false;
    return true;
  });
  const sort=el('compareSort').value;
  state.filtered.sort((a,b)=>{
    if(sort==='sku')return String(a.sku).localeCompare(String(b.sku));
    if(sort==='time')return (a.lead_time_days??999)-(b.lead_time_days??999)||total(a)-total(b);
    if(sort==='unit')return (perUnit(a)??Infinity)-(perUnit(b)??Infinity)||total(a)-total(b);
    return total(a)-total(b);
  });
  state.page=1;render();renderSelected();
}
function render(){
  const tbody=el('compareRows');tbody.replaceChildren();
  const rows=state.filtered.slice((state.page-1)*state.pageSize,state.page*state.pageSize);
  for(const item of rows){
    const tr=document.createElement('tr');
    const first=document.createElement('td');
    const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=state.selected.has(item.id);checkbox.setAttribute('aria-label','Comparar SKU '+item.sku);
    checkbox.addEventListener('change',()=>{if(checkbox.checked&&state.selected.size>=3){checkbox.checked=false;el('compareStatus').textContent='Selecione no máximo três SKUs.';return}if(checkbox.checked)state.selected.set(item.id,item);else state.selected.delete(item.id);renderSelected()});
    first.appendChild(checkbox);tr.appendChild(first);
    const name=td(tr,item.sku+' — '+item.name);
    const detail=document.createElement('small');detail.textContent=printSpecs(item);name.appendChild(detail);
    td(tr,qty(item)?number(qty(item))+(isLot(item)?' por lote':' base'):'A confirmar');
    td(tr,brl(item.purchase_price));
    td(tr,perUnit(item)!==null?brl(perUnit(item)):'Base indefinida');
    td(tr,brl(state.freight));
    td(tr,brl(total(item)));
    td(tr,item.lead_time_days===null?'A confirmar':item.lead_time_days+' dia(s) úteis*');
    const source=td(tr,dateText(item.catalog_date||item.source_updated_at));
    const link=document.createElement('a');link.href='/interno/fornecedores/item/?item='+encodeURIComponent(item.id);link.textContent='Ver ficha';source.appendChild(document.createElement('br'));source.appendChild(link);
    tbody.appendChild(tr);
  }
  if(!rows.length){const tr=document.createElement('tr');const cell=td(tr,'Nenhum SKU corresponde aos filtros. Tente outra grade ou material.');cell.colSpan=9;tbody.appendChild(tr)}
  const pages=Math.max(1,Math.ceil(state.filtered.length/state.pageSize));
  el('compareCount').textContent=number(state.filtered.length)+' opções';
  el('comparePageInfo').textContent='Página '+state.page+' de '+pages;
  el('comparePrev').disabled=state.page<=1;el('compareNext').disabled=state.page>=pages;
  el('compareStatus').textContent=number(state.filtered.length)+' opções do catálogo da Zap. Valores importados, não confirmados em tempo real. *Prazo cadastrado: confirme unidade e condições com a Zap.';
}
function renderSelected(){
  const root=el('compareSelected');root.replaceChildren();
  const selected=[...state.selected.values()];
  if(!selected.length){el('compareCompatibility').textContent='Nenhum SKU selecionado.';return}
  const same=selected.length>1&&selected.every(item=>specsKey(item)===specsKey(selected[0]));
  el('compareCompatibility').textContent=selected.length===1?'Selecione outra opção para confrontar os dados.':same?'Campos principais coincidem, mas acabamento, dimensões finais e outras especificações ainda exigem conferência manual.':'Atenção: as opções possuem diferenças ou dados incompletos de material, formato de impressão, quantidade ou base de preço. Não trate os custos como equivalentes.';
  for(const item of selected){
    const card=document.createElement('article');
    const heading=document.createElement('strong');heading.textContent=item.sku+' · '+item.name;card.appendChild(heading);
    for(const line of ['Grade: '+(qty(item)?number(qty(item)):'a confirmar'),'Base: '+(item.price_basis||'indefinida'),'Preço cadastrado: '+brl(item.purchase_price),'Frete estimado: '+brl(state.freight),'Total estimado: '+brl(total(item)),'Por unidade: '+(perUnit(item)!==null?brl(perUnit(item)):'não comparável'),'Produção cadastrada: '+(item.lead_time_days??'a confirmar')+' dia(s)','Origem: '+dateText(item.catalog_date||item.source_updated_at),printSpecs(item)]){
      const p=document.createElement('p');p.textContent=line;card.appendChild(p);
    }
    root.appendChild(card);
  }
}
async function load(){
  el('compareStatus').textContent='Carregando opções…';
  const [catalog,quotes]=await Promise.all([
    supabase.from('supplier_catalog_items').select('id,sku,name,description,category,purchase_price,minimum_order_quantity,lead_time_days,attributes,price_basis,base_quantity,source_updated_at,catalog_date').eq('supplier_id',SUPPLIER_ID).eq('category','ADESIVOS').eq('active',true).eq('validation_status','ok').not('purchase_price','is',null).order('sku').limit(1000),
    supabase.from('supplier_demand_quote_lines_90d').select('proposal_no,proposal_item_id,description,quantity,quote_date').eq('product_family','Adesivos e etiquetas').eq('research_eligible',true).order('quote_date',{ascending:false}).limit(300)
  ]);
  if(catalog.error)throw catalog.error;
  state.items=(catalog.data||[]).filter(item=>Number.isFinite(Number(item.purchase_price))&&Number(item.purchase_price)>=0);
  if(quotes.error){console.warn('Não foi possível carregar propostas de adesivos:',quotes.error)}else{state.quotes=quotes.data||[];fillQuotes()}
  apply();
}
async function init(){
  setAccess('Validando acesso…','Confirmando sua sessão de gestão.');
  try{
    const session=await Promise.race([getStaffSession(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo limite de autenticação.')),10000))]);
    if(!session?.user){location.replace('/interno/?next='+encodeURIComponent(location.pathname));return}
    if(!allowed.has(session.profile?.role)){setAccess('Acesso restrito','Disponível apenas para Proprietário e Gerência.');return}
    el('compareAccess').hidden=true;el('compareMain').hidden=false;
    await load();
  }catch(error){console.error('Comparador:',error);if(el('compareMain').hidden)setAccess('Não foi possível carregar','Falha na validação de acesso. Tente novamente.',true);else el('compareStatus').textContent='Erro ao carregar catálogo. Atualize a página e tente novamente.'}
}
el('compareRetry').addEventListener('click',init);
el('compareQuote').addEventListener('change',quoteChanged);
el('compareApply').addEventListener('click',apply);
el('compareClear').addEventListener('click',()=>{el('compareQuote').value='';el('compareSearch').value='';el('compareMaterial').value='';el('compareQuantity').value='';el('compareFreight').value='18.00';el('compareSort').value='price';el('compareQuoteContext').textContent='';apply()});
el('comparePrev').addEventListener('click',()=>{if(state.page>1){state.page--;render()}});
el('compareNext').addEventListener('click',()=>{if(state.page*state.pageSize<state.filtered.length){state.page++;render()}});
el('compareResetSelection').addEventListener('click',()=>{state.selected.clear();render();renderSelected()});
init();