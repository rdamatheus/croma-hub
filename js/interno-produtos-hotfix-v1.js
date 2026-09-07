import { supabase } from './croma-supabase.js';

const $ = selector => document.querySelector(selector);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const chipTranslations = new Map([
  ['Status: active', 'Status: Ativos'],
  ['Status: inactive', 'Status: Inativos'],
  ['Estrutura: simple', 'Estrutura: Simples'],
  ['Estrutura: parent', 'Estrutura: Pais com variações'],
  ['Estrutura: variation', 'Estrutura: Variações'],
  ['Estrutura: composition', 'Estrutura: Com composição'],
  ['Estoque: positive', 'Estoque: Com saldo'],
  ['Estoque: zero', 'Estoque: Saldo zero'],
  ['Estoque: negative', 'Estoque: Saldo negativo'],
  ['Estoque: below_min', 'Estoque: Abaixo do mínimo'],
  ['Estoque: unknown', 'Estoque: Sem saldo sincronizado'],
  ['Origem: producao_interna', 'Origem: Produção interna'],
  ['Origem: terceirizado', 'Origem: Terceirizado'],
  ['Origem: revenda', 'Origem: Revenda'],
  ['Origem: misto', 'Origem: Misto'],
  ['Origem: unknown', 'Origem: Não informado'],
  ['Bling: linked', 'Bling: Vinculados'],
  ['Bling: unlinked', 'Bling: Sem vínculo'],
  ['Bling: synced', 'Bling: Sincronizados'],
  ['Bling: error', 'Bling: Com erro'],
  ['Tipo: produto', 'Tipo: Produtos'],
  ['Tipo: servico', 'Tipo: Serviços'],
  ['Conteúdo: image', 'Conteúdo: Com imagem'],
  ['Conteúdo: no_image', 'Conteúdo: Sem imagem'],
  ['Conteúdo: gtin', 'Conteúdo: Com GTIN'],
  ['Conteúdo: no_gtin', 'Conteúdo: Sem GTIN'],
  ['Conteúdo: ncm', 'Conteúdo: Com NCM'],
  ['Conteúdo: no_ncm', 'Conteúdo: Sem NCM'],
  ['Uso: commercial', 'Uso: Comercial'],
  ['Uso: input', 'Uso: Insumo interno'],
  ['Uso: site', 'Uso: Elegível para catálogo']
]);

function translateChips() {
  document.querySelectorAll('#filterChips .filter-chip').forEach(chip => {
    const text = chip.textContent || '';
    const suffix = text.endsWith(' ×') ? ' ×' : '';
    const base = suffix ? text.slice(0, -2) : text;
    const translated = chipTranslations.get(base);
    if (translated) chip.textContent = translated + suffix;
  });
}

let productTotal = null;
let serviceTotal = null;

async function loadTypeTotals() {
  const [productsResult, servicesResult] = await Promise.all([
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('product_type', 'produto'),
    supabase.from('products').select('id', { count: 'exact', head: true }).eq('product_type', 'servico')
  ]);
  if (!productsResult.error) productTotal = productsResult.count ?? null;
  if (!servicesResult.error) serviceTotal = servicesResult.count ?? null;
}

function normalizeCountLabel() {
  const el = $('#productCount');
  const type = $('#filterType')?.value || '';
  if (!el) return;
  const current = String(el.textContent || '');
  const match = current.match(/^(\d+) encontrado\(s\)/);
  if (!match) return;
  const found = Number(match[1]);
  let desired = current;
  if (type === 'produto' && productTotal !== null) desired = `${found} encontrado(s) · ${productTotal} produtos no total`;
  else if (type === 'servico' && serviceTotal !== null) desired = `${found} encontrado(s) · ${serviceTotal} serviços no total`;
  else if (productTotal !== null && serviceTotal !== null) desired = `${found} encontrado(s) · ${productTotal + serviceTotal} itens no total`;
  if (desired !== current) el.textContent = desired;
}

function refreshPresentation() {
  translateChips();
  normalizeCountLabel();
}

async function checkOperationalReads() {
  const checks = [
    ['estoque', supabase.from('product_stock_snapshots').select('product_id').eq('source', 'bling').limit(1)],
    ['detalhes', supabase.from('product_details').select('product_id').limit(1)],
    ['fornecedores', supabase.from('product_suppliers').select('product_id').limit(1)]
  ];
  const results = await Promise.all(checks.map(async ([name, query]) => {
    const { error } = await query;
    return error ? { name, error } : null;
  }));
  const failures = results.filter(Boolean);
  if (!failures.length) return;
  console.error('Falha ao carregar dados auxiliares de produtos', failures);
  if ($('#productDataWarning')) return;
  const warning = document.createElement('div');
  warning.id = 'productDataWarning';
  warning.className = 'notice bad';
  warning.textContent = `Alguns dados do cadastro não puderam ser carregados (${failures.map(x => x.name).join(', ')}). Atualize a página ou verifique a integração antes de confiar nos valores exibidos.`;
  const workspace = $('#productsWorkspace');
  workspace?.parentElement?.insertBefore(warning, workspace);
}

async function applyDefaultProductFilter() {
  for (let i = 0; i < 80; i++) {
    const select = $('#filterType');
    if (select) {
      if (!select.value) {
        select.value = 'produto';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return;
    }
    await wait(50);
  }
}

await loadTypeTotals();
await applyDefaultProductFilter();
await checkOperationalReads();

const chips = $('#filterChips');
if (chips) new MutationObserver(refreshPresentation).observe(chips, { childList: true, subtree: true, characterData: true });
const count = $('#productCount');
if (count) new MutationObserver(normalizeCountLabel).observe(count, { childList: true, subtree: true, characterData: true });

$('#filterType')?.addEventListener('change', () => setTimeout(refreshPresentation, 0));
$('#clearProductFilters')?.addEventListener('click', () => setTimeout(() => {
  const select = $('#filterType');
  if (select && select.value !== 'produto') {
    select.value = 'produto';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}, 0));

refreshPresentation();
