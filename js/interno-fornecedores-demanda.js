import { getStaffSession } from './interno-auth.js';
import { supabase } from './croma-supabase.js';

const el = id => document.getElementById(id);
const allowed = new Set(['owner', 'manager']);
const fmtDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const priorityLabel = { alta: 'Alta', media: 'Média', baixa: 'Baixa', revisar: 'Revisar classificação' };
let detailRequest = 0;
let allRows = [];
const columns = ['Família','7 dias','30 dias','90 dias','Última cotação','Prioridade','Revisar a cada'];
function showAccess(title,message,retry=false){
  el('demandAccessTitle').textContent=title;
  el('demandAccessMessage').textContent=message;
  el('demandRetry').hidden=!retry;
}

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = String(value ?? '—');
  row.appendChild(td);
  return td;
}

function renderRanking() {
  const query = el('demandSearch').value.trim().toLocaleLowerCase('pt-BR');
  const priority = el('demandPriority').value;
  const data = allRows.filter(item => (!priority || item.research_priority === priority) &&
    (!query || item.product_family.toLocaleLowerCase('pt-BR').includes(query)));
  const tbody = el('demandRows');
  tbody.replaceChildren();
  for (const item of data) {
    const tr = document.createElement('tr');
    const values = [
      item.product_family, item.quotes_7d, item.quotes_30d, item.quotes_90d,
      fmtDate(item.last_quote_date), priorityLabel[item.research_priority] || item.research_priority,
      item.suggested_interval_days ? item.suggested_interval_days + ' dias' : 'Manual'
    ];
    values.forEach((value,index) => cell(tr,value).setAttribute('data-label',columns[index]));
    const action = document.createElement('button');
    action.type = 'button';
    action.className = 'btn light';
    action.textContent = 'Ver propostas';
    action.setAttribute('aria-label', 'Ver propostas de ' + item.product_family);
    action.addEventListener('click', () => showDetails(item.product_family));
    const td = document.createElement('td');
    td.setAttribute('data-label','Origem');
    td.appendChild(action);
    if (item.product_family === 'Adesivos e etiquetas') {
      const compare = document.createElement('a');
      compare.className = 'btn light';
      compare.href = '/interno/fornecedores/demanda/comparador/';
      compare.textContent = 'Comparar opções';
      compare.style.marginLeft = '6px';
      td.appendChild(compare);
    }
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  if (!data.length) {
    const tr = document.createElement('tr');
    const td = cell(tr, allRows.length ? 'Nenhuma família corresponde aos filtros.' : 'Não há propostas classificáveis nos últimos 90 dias.');
    td.colSpan = 8;
    tbody.appendChild(tr);
  }
  el('demandStatus').textContent = data.length + ' de ' + allRows.length + ' famílias exibidas.';
}

async function load() {
  el('demandStatus').textContent = 'Carregando ranking…';
  const { data, error } = await supabase.from('supplier_demand_priority_90d')
    .select('product_family,quotes_7d,quotes_30d,quotes_90d,last_quote_date,research_priority,suggested_interval_days')
    .order('quotes_30d', { ascending: false })
    .order('quotes_90d', { ascending: false });
  if (error) throw error;
  allRows = data || [];
  el('demandFamilies').textContent = String(allRows.length);
  el('demandHigh').textContent = String(allRows.filter(item => item.research_priority === 'alta').length);
  el('demandQuotes').textContent = String(allRows.reduce((total,item)=>total + Number(item.quotes_30d || 0),0));
  renderRanking();
}

async function showDetails(family) {
  const request = ++detailRequest;
  el('demandDetails').hidden = false;
  el('detailsTitle').textContent = family;
  el('detailsSummary').textContent = 'Cada proposta conta uma única vez no ranking por família, mesmo com múltiplas quantidades ou acabamentos.';
  el('detailsStatus').textContent = 'Carregando propostas…';
  el('detailsRows').replaceChildren();
  el('demandDetails').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const { data, error } = await supabase.from('supplier_demand_quote_lines_90d')
      .select('proposal_no,quote_date,description,proposal_item_id')
      .eq('product_family', family)
      .order('quote_date', { ascending: false })
      .limit(500);
    if (error) throw error;
    if (request !== detailRequest) return;
    const proposals = new Map();
    for (const item of data || []) {
      const key = String(item.proposal_no);
      if (!proposals.has(key)) proposals.set(key, { date: item.quote_date, descriptions: [] });
      proposals.get(key).descriptions.push(item.description || 'Sem descrição');
    }
    for (const [number, item] of proposals) {
      const tr = document.createElement('tr');
      cell(tr, '#' + number);
      cell(tr, fmtDate(item.date));
      const unique = [...new Set(item.descriptions)];
      cell(tr, unique.slice(0, 3).join(' | ') + (unique.length > 3 ? ' | +' + (unique.length - 3) + ' outras descrições' : ''));
      cell(tr, item.descriptions.length);
      el('detailsRows').appendChild(tr);
    }
    el('detailsStatus').textContent = proposals.size + ' propostas distintas, ' + (data?.length || 0) + ' opções/itens' +
      (data?.length === 500 ? ' (limite de exibição atingido; resultados podem estar incompletos)' : '') + '.';
    if (!data?.length) el('detailsStatus').textContent = 'Nenhuma proposta encontrada para esta família.';
  } catch (error) {
    if (request !== detailRequest) return;
    console.error('Erro ao consultar origem das propostas:', error);
    el('detailsStatus').textContent = 'Não foi possível consultar as propostas. Tente novamente.';
  }
}

async function init() {
  showAccess('Validando acesso…','Confirmando sua sessão de gestão.');
  try {
    const session = await Promise.race([
      getStaffSession(),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('Tempo limite da sessão.')),10000))
    ]);
    if (!session?.user) {
      location.replace('/interno/?next=' + encodeURIComponent(location.pathname));
      return;
    }
    if (!allowed.has(session.profile?.role)) {
      showAccess('Acesso restrito','Esta funcionalidade está disponível para Proprietário e Gerência.');
      return;
    }
    el('demandAccess').hidden = true;
    el('demandMain').hidden = false;
    await load();
  } catch (error) {
    console.error('Erro na inteligência de fornecedores:', error);
    if (el('demandMain').hidden) {
      showAccess('Não foi possível validar o acesso','A sessão não foi confirmada. Tente novamente.',true);
    } else {
      el('demandStatus').textContent = 'Não foi possível carregar o ranking. Tente novamente.';
    }
  }
}
el('demandRetry').addEventListener('click',init);
el('demandSearch').addEventListener('input',renderRanking);
el('demandPriority').addEventListener('change',renderRanking);
el('refreshDemand').addEventListener('click', () => load().catch(error => {
  console.error(error);
  el('demandStatus').textContent = 'Erro ao atualizar. Tente novamente.';
}));
el('showExcluded').addEventListener('click', () => showDetails('Serviços / fora da pesquisa'));
el('closeDetails').addEventListener('click', () => {
  ++detailRequest;
  el('demandDetails').hidden = true;
});
init();
