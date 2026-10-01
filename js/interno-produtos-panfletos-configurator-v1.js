import { supabase } from './croma-supabase.js';

const PRODUCT_ID = 'e63f590f-df39-4450-bcfd-8beaf781e119';
const SUPPLIER_ID = '3fee83e7-8b01-46cc-8b00-01f9e9268e3e';
const GROUP_ORDER = ['tamanho', 'papel', 'impressao', 'acabamento', 'quantidade'];
const params = new URLSearchParams(location.search);

if (params.get('produto') === PRODUCT_ID && params.get('modo') === 'ficha') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

const number = value => Number(value || 0).toLocaleString('pt-BR', {
  maximumFractionDigits: 3
});

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function injectStyles() {
  if (document.getElementById('panfletoConfiguratorStyles')) return;
  const style = document.createElement('style');
  style.id = 'panfletoConfiguratorStyles';
  style.textContent = `
    .panfleto-config-card{border:1px solid #dad6ea;background:linear-gradient(180deg,#fff 0%,#fbfaff 100%)}
    .panfleto-config-head{display:flex;gap:16px;justify-content:space-between;align-items:start;flex-wrap:wrap;margin-bottom:14px}
    .panfleto-config-head h2{margin-bottom:5px!important}
    .panfleto-config-badges{display:flex;gap:7px;flex-wrap:wrap}
    .panfleto-config-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#f0eef8;color:var(--croma-purple);font-size:.72rem;font-weight:900}
    .panfleto-config-grid{display:grid;grid-template-columns:repeat(5,minmax(145px,1fr));gap:10px}
    .panfleto-config-grid .field select{width:100%}
    .panfleto-config-result{margin-top:14px;border:1px solid #e4e0ef;border-radius:14px;background:#fff;padding:14px}
    .panfleto-config-result.empty{color:var(--croma-muted);font-size:.86rem}
    .panfleto-price-grid{display:grid;grid-template-columns:repeat(6,minmax(120px,1fr));gap:10px;margin-top:12px}
    .panfleto-price-box{padding:10px 11px;border-radius:11px;background:#f8f7fc;border:1px solid #ece9f4}
    .panfleto-price-box span{display:block;font-size:.68rem;text-transform:uppercase;font-weight:900;color:var(--croma-muted);margin-bottom:4px}
    .panfleto-price-box strong{color:var(--croma-deep);font-size:.98rem}
    .panfleto-price-box.primary{background:#f0eef8;border-color:#d7d2ea}
    .panfleto-price-box.primary strong{font-size:1.15rem;color:var(--croma-purple)}
    .panfleto-config-summary{display:flex;gap:8px;align-items:center;flex-wrap:wrap;color:#4f4962;font-size:.82rem}
    .panfleto-config-summary strong{color:var(--croma-deep)}
    .panfleto-config-note{margin:10px 0 0;color:var(--croma-muted);font-size:.78rem;line-height:1.45}
    .panfleto-source-link{font-size:.78rem;font-weight:900;color:var(--croma-purple);text-decoration:none}
    @media(max-width:1100px){.panfleto-config-grid{grid-template-columns:repeat(3,1fr)}.panfleto-price-grid{grid-template-columns:repeat(3,1fr)}}
    @media(max-width:700px){.panfleto-config-grid,.panfleto-price-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

async function init() {
  if (document.getElementById('panfletoConfigurator')) return;
  injectStyles();

  const editor = document.getElementById('editor');
  if (!editor) return;

  const panel = document.createElement('section');
  panel.id = 'panfletoConfigurator';
  panel.className = 'card panfleto-config-card';
  panel.innerHTML = `
    <div class="panfleto-config-head">
      <div>
        <h2>Configurador de Panfletos</h2>
        <p class="section-note" style="margin:0">Escolha a configuração comercial. O custo é vinculado ao SKU da Zap e o preço parte do markup padrão da Croma.</p>
      </div>
      <div class="panfleto-config-badges">
        <span class="panfleto-config-badge" id="panfletoSupplierBadge">Zap Gráfica</span>
        <span class="panfleto-config-badge" id="panfletoMarkupBadge">Markup 2,5x</span>
        <span class="panfleto-config-badge" id="panfletoFreightBadge">Frete R$ 18,00</span>
      </div>
    </div>
    <div class="panfleto-config-grid" id="panfletoConfigFields"></div>
    <div class="panfleto-config-result empty" id="panfletoConfigResult">Carregando combinações da Zap…</div>
  `;

  const headerCard = editor.querySelector(':scope > .card');
  if (headerCard) headerCard.insertAdjacentElement('afterend', panel);
  else editor.prepend(panel);

  try {
    const [productRes, supplierRes, groupsRes, variantsRes, linksRes] = await Promise.all([
      supabase.from('products').select('id,default_markup,metadata').eq('id', PRODUCT_ID).single(),
      supabase.from('suppliers').select('id,name,default_order_freight').eq('id', SUPPLIER_ID).single(),
      supabase.from('product_option_groups').select('id,code,nome,ordem,ativo').eq('product_id', PRODUCT_ID).eq('ativo', true).order('ordem'),
      supabase.from('product_variants').select('id,sku,code,nome,option_values,base_price,ativo').eq('product_id', PRODUCT_ID).eq('ativo', true),
      supabase.from('product_suppliers').select('variant_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,minimum_order_quantity,lead_time_days,purchase_url,supplier_catalog_item_id,active').eq('product_id', PRODUCT_ID).eq('supplier_id', SUPPLIER_ID).eq('active', true).not('variant_id', 'is', null)
    ]);

    for (const response of [productRes, supplierRes, groupsRes, variantsRes, linksRes]) {
      if (response.error) throw response.error;
    }

    const groups = (groupsRes.data || []).filter(group => GROUP_ORDER.includes(group.code));
    const groupIds = groups.map(group => group.id);
    const optionsRes = groupIds.length
      ? await supabase.from('product_options').select('id,group_id,code,nome,ordem,ativo,metadata').in('group_id', groupIds).eq('ativo', true).order('ordem')
      : { data: [], error: null };
    if (optionsRes.error) throw optionsRes.error;

    const state = {
      product: productRes.data || {},
      supplier: supplierRes.data || {},
      groups,
      options: optionsRes.data || [],
      variants: variantsRes.data || [],
      links: linksRes.data || [],
      selected: {}
    };

    renderConfigurator(state);
  } catch (error) {
    console.error('[Panfletos] Falha ao carregar configurador', error);
    const result = document.getElementById('panfletoConfigResult');
    if (result) {
      result.className = 'panfleto-config-result';
      result.innerHTML = '<strong>Não foi possível carregar o configurador.</strong><p class="panfleto-config-note">Os dados do produto continuam preservados; recarregue a ficha para tentar novamente.</p>';
    }
  }
}

function renderConfigurator(state) {
  const fields = document.getElementById('panfletoConfigFields');
  const result = document.getElementById('panfletoConfigResult');
  if (!fields || !result) return;

  const markup = Number(state.product.default_markup || state.product.metadata?.panfleto_configurator?.default_markup || 2.5);
  const freight = Number(state.supplier.default_order_freight ?? state.product.metadata?.panfleto_configurator?.order_freight ?? 18);
  document.getElementById('panfletoMarkupBadge').textContent = `Markup ${number(markup)}x`;
  document.getElementById('panfletoFreightBadge').textContent = `Frete ${money(freight)}`;
  document.getElementById('panfletoSupplierBadge').textContent = state.supplier.name || 'Zap Gráfica';

  const optionMap = new Map();
  for (const group of state.groups) {
    optionMap.set(group.code, state.options.filter(option => option.group_id === group.id).sort((a, b) => a.ordem - b.ordem));
  }
  const linkMap = new Map(state.links.map(link => [link.variant_id, link]));
  const orderedGroups = GROUP_ORDER.map(code => state.groups.find(group => group.code === code)).filter(Boolean);

  fields.innerHTML = orderedGroups.map(group => `
    <div class="field">
      <label for="panfleto_${escapeHtml(group.code)}">${escapeHtml(group.nome)}</label>
      <select id="panfleto_${escapeHtml(group.code)}" data-group="${escapeHtml(group.code)}"><option value="">Selecione…</option></select>
    </div>
  `).join('');

  const matches = variant => orderedGroups.every(group => {
    const selected = state.selected[group.code];
    return !selected || variant.option_values?.[group.code] === selected;
  });

  function refreshFrom(changedIndex = -1) {
    if (changedIndex >= 0) {
      for (let index = changedIndex + 1; index < orderedGroups.length; index += 1) {
        delete state.selected[orderedGroups[index].code];
      }
    }

    orderedGroups.forEach((group, index) => {
      const select = document.getElementById(`panfleto_${group.code}`);
      if (!select) return;

      const priorSelections = {};
      for (let prior = 0; prior < index; prior += 1) {
        const code = orderedGroups[prior].code;
        if (state.selected[code]) priorSelections[code] = state.selected[code];
      }

      const viableVariants = state.variants.filter(variant => Object.entries(priorSelections).every(([code, value]) => variant.option_values?.[code] === value));
      const viableValues = new Set(viableVariants.map(variant => variant.option_values?.[group.code]).filter(Boolean));
      const options = (optionMap.get(group.code) || []).filter(option => viableValues.has(option.code));
      const current = state.selected[group.code] || '';

      select.innerHTML = '<option value="">Selecione…</option>' + options.map(option => `<option value="${escapeHtml(option.code)}">${escapeHtml(option.nome)}</option>`).join('');
      if (current && viableValues.has(current)) select.value = current;
      else if (current) delete state.selected[group.code];
      select.disabled = index > 0 && !state.selected[orderedGroups[index - 1].code];
    });

    const matched = state.variants.filter(matches);
    renderResult(state, matched, linkMap, markup, freight, orderedGroups);
  }

  orderedGroups.forEach((group, index) => {
    document.getElementById(`panfleto_${group.code}`)?.addEventListener('change', event => {
      if (event.target.value) state.selected[group.code] = event.target.value;
      else delete state.selected[group.code];
      refreshFrom(index);
    });
  });

  refreshFrom();
}

function renderResult(state, matched, linkMap, markup, freight, orderedGroups) {
  const result = document.getElementById('panfletoConfigResult');
  if (!result) return;

  const complete = orderedGroups.every(group => state.selected[group.code]);
  if (!complete) {
    const nextGroup = orderedGroups.find(group => !state.selected[group.code]);
    result.className = 'panfleto-config-result empty';
    result.textContent = nextGroup ? `Selecione ${nextGroup.nome.toLowerCase()} para continuar.` : 'Selecione a configuração.';
    return;
  }

  if (matched.length !== 1) {
    result.className = 'panfleto-config-result';
    result.innerHTML = matched.length === 0
      ? '<strong>Combinação indisponível.</strong><p class="panfleto-config-note">Essa combinação não possui SKU ativo da Zap no catálogo vinculado.</p>'
      : `<strong>${matched.length} combinações encontradas.</strong><p class="panfleto-config-note">Revise os filtros; a seleção deveria resolver um único SKU da Zap.</p>`;
    return;
  }

  const variant = matched[0];
  const link = linkMap.get(variant.id);
  if (!link) {
    result.className = 'panfleto-config-result';
    result.innerHTML = '<strong>SKU encontrado, mas sem vínculo de fornecedor.</strong>';
    return;
  }

  const cost = Number(link.purchase_price || 0);
  const totalCost = cost + freight;
  const sale = Number(variant.base_price || (totalCost * markup));
  const quantity = Number(link.minimum_order_quantity || variant.option_values?.quantidade || 1);
  const unitSale = quantity > 0 ? sale / quantity : sale;
  const grossProfit = sale - totalCost;
  const grossMargin = sale > 0 ? (grossProfit / sale) * 100 : 0;
  const sourceLink = link.purchase_url ? `<a class="panfleto-source-link" href="${escapeHtml(link.purchase_url)}" target="_blank" rel="noopener">Abrir referência do fornecedor ↗</a>` : '';

  result.className = 'panfleto-config-result';
  result.innerHTML = `
    <div class="panfleto-config-summary">
      <strong>${escapeHtml(variant.nome)}</strong>
      <span>SKU Zap: <strong>${escapeHtml(link.supplier_sku || variant.sku)}</strong></span>
      <span>Prazo fornecedor: <strong>${escapeHtml(link.lead_time_days ?? '—')} dia(s)</strong></span>
      ${sourceLink}
    </div>
    <div class="panfleto-price-grid">
      <div class="panfleto-price-box"><span>Custo Zap</span><strong>${money(cost)}</strong></div>
      <div class="panfleto-price-box"><span>Frete do pedido</span><strong>${money(freight)}</strong></div>
      <div class="panfleto-price-box"><span>Custo considerado</span><strong>${money(totalCost)}</strong></div>
      <div class="panfleto-price-box"><span>Markup padrão</span><strong>${number(markup)}x</strong></div>
      <div class="panfleto-price-box primary"><span>Venda recomendada</span><strong>${money(sale)}</strong></div>
      <div class="panfleto-price-box"><span>Preço unitário</span><strong>${money(unitSale)}</strong></div>
    </div>
    <p class="panfleto-config-note">Lucro bruto estimado: <strong>${money(grossProfit)}</strong> · margem bruta: <strong>${number(grossMargin)}%</strong>. O frete de ${money(freight)} é considerado uma vez na simulação de um pedido isolado da Zap; ao juntar vários itens no mesmo pedido, ele deve ser consolidado na cotação para não ser cobrado repetidamente.</p>
  `;
}
