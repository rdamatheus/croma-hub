import { getStaffSession } from './interno-auth.js';
import { supabase } from './croma-supabase.js';

const el = id => document.getElementById(id);
const allowed = new Set(['owner', 'manager']);
const fmtDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const priorityLabel = { alta: 'Alta', media: 'Média', baixa: 'Baixa', revisar: 'Revisar classificação' };

function cell(row, value) {
  const td = document.createElement('td');
  td.textContent = String(value ?? '—');
  row.appendChild(td);
}

async function load() {
  el('demandStatus').textContent = 'Carregando ranking…';
  const { data, error } = await supabase.from('supplier_demand_priority_90d')
    .select('product_family,quotes_7d,quotes_30d,quotes_90d,last_quote_date,research_priority,suggested_interval_days')
    .order('quotes_30d', { ascending: false })
    .order('quotes_90d', { ascending: false });
  if (error) throw error;
  const tbody = el('demandRows');
  tbody.replaceChildren();
  for (const item of data || []) {
    const tr = document.createElement('tr');
    cell(tr, item.product_family);
    cell(tr, item.quotes_7d);
    cell(tr, item.quotes_30d);
    cell(tr, item.quotes_90d);
    cell(tr, fmtDate(item.last_quote_date));
    cell(tr, priorityLabel[item.research_priority] || item.research_priority);
    cell(tr, item.suggested_interval_days ? item.suggested_interval_days + ' dias' : 'Manual');
    tbody.appendChild(tr);
  }
  if (!data?.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Não há propostas classificáveis nos últimos 90 dias.';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
  el('demandStatus').textContent = (data?.length || 0) + ' famílias encontradas. Ranking atualizado.';
}

async function init() {
  try {
    const session = await getStaffSession();
    if (!session?.user) {
      location.replace('/interno/?next=' + encodeURIComponent(location.pathname));
      return;
    }
    if (!allowed.has(session.profile?.role)) {
      el('demandStatus').textContent = 'Acesso restrito à gestão.';
      el('refreshDemand').disabled = true;
      el('demandRows').replaceChildren();
      return;
    }
    await load();
  } catch (error) {
    console.error('Erro ao carregar ranking de demanda:', error);
    el('demandStatus').textContent = 'Não foi possível carregar o ranking. Tente novamente.';
  }
}
el('refreshDemand').addEventListener('click', () => load().catch(error => {
  console.error(error);
  el('demandStatus').textContent = 'Erro ao atualizar. Tente novamente.';
}));
init();
