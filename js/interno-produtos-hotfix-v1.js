import { supabase } from './croma-supabase.js';

const $ = selector => document.querySelector(selector);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const pageParams = new URLSearchParams(location.search);
const initialProductId = pageParams.get('produto') || '';
const isProductDetail = pageParams.get('modo') === 'ficha' && !!initialProductId;
const currentProductId = () => new URLSearchParams(location.search).get('produto') || '';

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
let inputControlsProductId = '';
let inputControlsMounting = null;
let detailObserver = null;

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
  if (isProductDetail) return;
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

function loadStructureEnhancement() {
  if (!document.querySelector('link[data-product-structure-style]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/interno-produtos-structure.css?v=20260910-1';
    link.dataset.productStructureStyle = '1';
    document.head.appendChild(link);
  }
  import('/js/interno-produtos-structure-v1.js?v=20260910-1').catch(error => console.error('Falha ao carregar visão estrutural de produtos', error));
}

function loadSupplierEnhancement() {
  import('/js/interno-produtos-supplier-enhancer.js?v=20260928-2').catch(error => console.error('Falha ao carregar fornecedores do produto', error));
}

function mountInputsShortcut() {
  if ($('#inputsShortcut')) return;
  const host = document.querySelector('.list-head') || document.querySelector('.editor-head');
  if (!host) return;
  const a = document.createElement('a');
  a.id = 'inputsShortcut';
  a.className = 'btn light';
  a.href = '/interno/insumos/';
  a.textContent = 'Insumos';
  const search = host.querySelector('#productSearch,.search');
  if (search?.parentElement === host) host.insertBefore(a, search);
  else host.appendChild(a);
}

async function mountInputControls() {
  const id = currentProductId();
  if (!id) return;
  if (inputControlsProductId === id && $('#inputRoleToggle')?.dataset.productId === id) return;
  if (inputControlsMounting) return inputControlsMounting;
  inputControlsMounting = (async () => {
    for (let i = 0; i < 80; i++) {
      const actions = document.querySelector('.editor-actions');
      if (actions && document.querySelector('#editor.open')) {
        const { data, error } = await supabase.from('products').select('id,is_input,product_format').eq('id', id).maybeSingle();
        if (error || !data) return;
        const costsLink = $('#costsLink');
        if (costsLink) {
          costsLink.href = `/interno/composicao-custos/?produto=${encodeURIComponent(id)}`;
          costsLink.textContent = 'Composição / insumos';
        }
        let button = $('#inputRoleToggle');
        if (!button) {
          button = document.createElement('button');
          button.id = 'inputRoleToggle';
          button.type = 'button';
          button.className = 'btn light';
          actions.prepend(button);
        }
        button.dataset.productId = id;
        const paint = value => {
          button.dataset.enabled = value ? '1' : '0';
          button.textContent = value ? '✓ Usado como insumo' : 'Marcar como insumo';
          button.title = value ? 'Este produto pode ser usado como componente de outros produtos/serviços.' : 'Habilita este mesmo produto para uso em composições, sem criar cadastro duplicado.';
        };
        paint(!!data.is_input);
        button.onclick = async () => {
          const targetId = button.dataset.productId;
          const next = button.dataset.enabled !== '1';
          button.disabled = true;
          try {
            const { error: updateError } = await supabase.from('products').update({ is_input: next, updated_at: new Date().toISOString() }).eq('id', targetId);
            if (updateError) throw updateError;
            paint(next);
          } catch (e) {
            alert(e.message || 'Não foi possível alterar a classificação de insumo.');
          } finally {
            button.disabled = false;
          }
        };
        inputControlsProductId = id;
        return;
      }
      await wait(50);
    }
  })();
  try {
    return await inputControlsMounting;
  } finally {
    inputControlsMounting = null;
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

function observeDetailEditor() {
  const editor = $('#editor');
  if (!editor) {
    setTimeout(observeDetailEditor, 100);
    return;
  }
  detailObserver?.disconnect();
  detailObserver = new MutationObserver(() => {
    if (editor.classList.contains('open')) mountInputControls();
  });
  detailObserver.observe(editor, { attributes: true, attributeFilter: ['class'] });
  if (editor.classList.contains('open')) mountInputControls();
}

window.addEventListener('popstate', () => {
  inputControlsProductId = '';
  observeDetailEditor();
});

refreshPresentation();
mountInputsShortcut();
loadStructureEnhancement();
loadSupplierEnhancement();
observeDetailEditor();