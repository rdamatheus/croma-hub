import { supabase } from './croma-supabase.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const money = value => Number(value || 0).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

function optionLabel(optionsByGroup, groupId, code) {
  return (optionsByGroup.get(groupId) || []).find(option => option.code === code)?.nome || code || '';
}

function variantMatches(variant, groups, selected, untilIndex = groups.length) {
  return groups.slice(0, untilIndex).every(group => {
    const value = selected[group.code];
    return !value || variant.option_values?.[group.code] === value;
  });
}

function selectedQuantity(groups, optionsByGroup, selected) {
  const group = groups.find(item => item.code === 'quantidade');
  if (!group) return null;
  const code = selected[group.code];
  if (!code) return null;
  const direct = Number(String(code).replace(',', '.'));
  if (Number.isFinite(direct) && direct > 0) return direct;
  const label = optionLabel(optionsByGroup, group.id, code);
  const match = String(label).replace(/\./g, '').match(/\d+(?:[,.]\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0].replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export async function mountPublicItemConfigurator({
  productId,
  productName,
  mount,
  quoteBase = 'https://wa.me/553230253588?text='
}) {
  if (!productId || !mount) return false;

  mount.innerHTML = '<div class="pic-loading">Carregando opções...</div>';

  try {
    const [groupsResult, variantsResult] = await Promise.all([
      supabase.from('product_option_groups')
        .select('id,code,nome,selection_type,required,ordem,ativo')
        .eq('product_id', productId)
        .eq('ativo', true)
        .order('ordem')
        .order('nome'),
      supabase.from('product_variants')
        .select('id,nome,option_values,base_price,ativo')
        .eq('product_id', productId)
        .eq('ativo', true)
        .order('base_price')
    ]);

    if (groupsResult.error) throw groupsResult.error;
    if (variantsResult.error) throw variantsResult.error;

    const groups = groupsResult.data || [];
    const variants = (variantsResult.data || []).filter(variant => variant.option_values && typeof variant.option_values === 'object');
    if (!groups.length || !variants.length) {
      mount.innerHTML = '';
      return false;
    }

    const groupIds = groups.map(group => group.id);
    const { data: optionsData, error: optionsError } = await supabase.from('product_options')
      .select('id,group_id,code,nome,ordem,ativo,metadata')
      .in('group_id', groupIds)
      .eq('ativo', true)
      .order('ordem')
      .order('nome');
    if (optionsError) throw optionsError;

    const optionsByGroup = new Map(groupIds.map(id => [id, []]));
    for (const option of optionsData || []) {
      if (optionsByGroup.has(option.group_id)) optionsByGroup.get(option.group_id).push(option);
    }

    const selected = {};

    function exactVariant() {
      const requiredComplete = groups.every(group => !group.required || selected[group.code]);
      if (!requiredComplete) return null;
      return variants.find(variant => groups.every(group => {
        const choice = selected[group.code];
        return !choice || variant.option_values?.[group.code] === choice;
      })) || null;
    }

    function render() {
      const controls = groups.map((group, index) => {
        const priorComplete = groups.slice(0, index).every(item => !item.required || selected[item.code]);
        const compatible = variants.filter(variant => variantMatches(variant, groups, selected, index));
        const availableCodes = new Set(compatible.map(variant => variant.option_values?.[group.code]).filter(Boolean));
        const options = (optionsByGroup.get(group.id) || []).filter(option => availableCodes.has(option.code));
        const current = availableCodes.has(selected[group.code]) ? selected[group.code] : '';
        if (!current) delete selected[group.code];
        const disabled = !priorComplete || !options.length;
        return `<label class="pic-field">
          <span>${esc(group.nome)}</span>
          <select data-config-group="${esc(group.code)}" data-config-index="${index}" ${disabled ? 'disabled' : ''}>
            <option value="">${disabled ? 'Escolha a opção anterior' : `Escolha ${esc(group.nome.toLowerCase())}`}</option>
            ${options.map(option => `<option value="${esc(option.code)}" ${current === option.code ? 'selected' : ''}>${esc(option.nome)}</option>`).join('')}
          </select>
        </label>`;
      }).join('');

      const variant = exactVariant();
      const minPrice = variants.map(item => Number(item.base_price || 0)).filter(value => value > 0).sort((a, b) => a - b)[0] || 0;
      let result = `<div class="pic-result is-pending"><strong>Monte sua configuração</strong><p>As opções seguintes são liberadas conforme a combinação disponível.</p>${minPrice > 0 ? `<span>A partir de ${esc(money(minPrice))}</span>` : ''}</div>`;

      if (variant) {
        const total = Number(variant.base_price || 0);
        const qty = selectedQuantity(groups, optionsByGroup, selected);
        const summary = groups.filter(group => selected[group.code]).map(group => ({
          label: group.nome,
          value: optionLabel(optionsByGroup, group.id, selected[group.code])
        }));
        const unit = total > 0 && qty ? total / qty : null;
        const text = [
          `Olá! Vim pelo site da Croma e gostaria de solicitar ${productName}.`,
          ...summary.map(item => `${item.label}: ${item.value}.`),
          total > 0 ? `Valor exibido: ${money(total)}.` : 'Gostaria de consultar o valor desta configuração.'
        ].join(' ');
        result = `<div class="pic-result is-ready">
          <span class="pic-result-eyebrow">Sua configuração</span>
          <div class="pic-summary">${summary.map(item => `<div><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong></div>`).join('')}</div>
          ${total > 0 ? `<div class="pic-total"><span>Valor</span><strong>${esc(money(total))}</strong>${unit ? `<small>${esc(money(unit))} por unidade</small>` : ''}</div>` : `<div class="pic-total"><strong>Sob consulta</strong></div>`}
          <a class="sc-cta pic-cta" href="${quoteBase}${encodeURIComponent(text)}" target="_blank" rel="noopener noreferrer">Solicitar pelo WhatsApp →</a>
        </div>`;
      }

      mount.innerHTML = `<section class="pic-card">
        <div class="pic-head"><p class="sc-eyebrow">Configure seu pedido</p><h2>Escolha as opções</h2><p>Mostramos somente combinações disponíveis para produção.</p></div>
        <div class="pic-grid">${controls}</div>
        ${result}
      </section>`;

      mount.querySelectorAll('[data-config-group]').forEach(select => {
        select.addEventListener('change', event => {
          const index = Number(event.currentTarget.dataset.configIndex || 0);
          const code = event.currentTarget.dataset.configGroup;
          if (event.currentTarget.value) selected[code] = event.currentTarget.value;
          else delete selected[code];
          groups.slice(index + 1).forEach(group => delete selected[group.code]);
          render();
        });
      });
    }

    render();
    return true;
  } catch (error) {
    console.error('Falha ao carregar configurador público do item.', error);
    mount.innerHTML = '';
    return false;
  }
}
