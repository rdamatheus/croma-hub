import { supabase } from '/js/croma-supabase.js';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const statusLabel = (status) => ({
  draft: 'Rascunho',
  sent: 'Enviada',
  approved: 'Aprovada',
  rejected: 'Recusada',
  expired: 'Expirada',
  cancelled: 'Cancelada'
})[status] || status || 'Rascunho';

function setFeedback(element, message, type = '') {
  if (!element) return;
  element.textContent = message || '';
  element.dataset.type = type;
}

function renderProposalCard(proposal) {
  const items = [...(proposal.sales_proposal_items || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const options = items.length > 1 ? `${items.length} opções` : `${items.length} item`;
  const itemRows = items.length
    ? items.map((item) => {
        const label = item.option_label || (item.quantity ? `${Number(item.quantity).toLocaleString('pt-BR')} ${item.unit || 'un'}` : 'Opção');
        return `<div class="proposal-item-row"><div><strong>${esc(label)}</strong><small>${esc(item.description || '')}</small></div><div class="proposal-price">${money.format(Number(item.line_total || 0))}</div></div>`;
      }).join('')
    : '<small class="proposal-empty">Sem itens vinculados.</small>';

  return `<article class="proposal-card">
    <div class="proposal-card-head">
      <div><strong>Proposta #${esc(proposal.proposal_no)}</strong><small>${esc(proposal.customer_name)} · ${esc(proposal.customer_phone || 'sem telefone')}</small></div>
      <div class="proposal-card-meta"><span class="pill">${esc(statusLabel(proposal.status))}</span><small>${esc(options)}</small></div>
    </div>
    <div class="proposal-items">${itemRows}</div>
    <div class="proposal-card-foot"><small>Criada em ${esc(dateTime.format(new Date(proposal.created_at)))}</small></div>
  </article>`;
}

async function loadProducts(select) {
  const { data, error } = await supabase
    .from('products')
    .select('id,nome,sku,preco,default_markup')
    .eq('ativo', true)
    .eq('is_sellable', true)
    .order('nome', { ascending: true })
    .limit(1000);

  if (error) throw error;
  select.innerHTML = '<option value="">Selecione um produto</option>' + (data || []).map((product) =>
    `<option value="${esc(product.id)}" data-markup="${esc(product.default_markup || '')}">${esc(product.nome)}${product.sku ? ` · ${esc(product.sku)}` : ''}</option>`
  ).join('');
  return data || [];
}

async function loadProposals(list, feedback) {
  setFeedback(feedback, 'Carregando propostas…');
  const { data, error } = await supabase
    .from('sales_proposals')
    .select('id,proposal_no,customer_name,customer_phone,status,created_at,sales_proposal_items(id,description,option_label,quantity,unit,line_total,sort_order)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    const denied = /permission|policy|row-level|rls|not authorized/i.test(error.message || '');
    list.innerHTML = denied
      ? '<p class="proposal-empty">Propostas disponíveis para usuários de gestão.</p>'
      : '<p class="proposal-empty">Não foi possível carregar as propostas.</p>';
    setFeedback(feedback, denied ? '' : error.message, denied ? '' : 'error');
    return;
  }

  list.innerHTML = data?.length
    ? data.map(renderProposalCard).join('')
    : '<p class="proposal-empty">Nenhuma proposta registrada ainda.</p>';
  setFeedback(feedback, '');
}

async function getSupplierSnapshot(productId) {
  const { data, error } = await supabase
    .from('product_suppliers')
    .select('id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,preferred,active')
    .eq('product_id', productId)
    .eq('active', true)
    .order('preferred', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function createProposal({ session, name, phone, product, value }) {
  const { data: proposal, error: proposalError } = await supabase
    .from('sales_proposals')
    .insert({
      customer_name: name,
      customer_phone: phone || null,
      status: 'draft',
      created_by: session?.user?.id || null
    })
    .select('id,proposal_no')
    .single();
  if (proposalError) throw proposalError;

  try {
    const supplier = await getSupplierSnapshot(product.id);
    const effectiveCost = Number(supplier?.effective_unit_cost || 0);
    const recommendedMarkup = Number(product.default_markup || 0) || null;
    const appliedMarkup = effectiveCost > 0 ? Number((value / effectiveCost).toFixed(4)) : recommendedMarkup;

    const { error: itemError } = await supabase.from('sales_proposal_items').insert({
      proposal_id: proposal.id,
      product_id: product.id,
      supplier_id: supplier?.supplier_id || null,
      supplier_catalog_item_id: supplier?.supplier_catalog_item_id || null,
      description: product.nome,
      option_label: 'Proposta principal',
      quantity: 1,
      unit: 'lote',
      supplier_sku: supplier?.supplier_sku || null,
      base_cost: Number(supplier?.purchase_price || 0),
      freight_cost: Number(supplier?.freight_cost || 0),
      total_cost: effectiveCost,
      recommended_markup: recommendedMarkup,
      applied_markup: appliedMarkup,
      unit_price: value,
      line_total: value,
      sort_order: 1,
      is_selected: true,
      metadata: { source: 'commercial_ui', price_mode: 'manual' }
    });
    if (itemError) throw itemError;
  } catch (error) {
    await supabase.from('sales_proposals').delete().eq('id', proposal.id);
    throw error;
  }

  return proposal;
}

export async function initCommercialProposals(session) {
  const section = document.getElementById('proposalSection');
  if (!section) return;

  const nameInput = document.getElementById('proposalCustomerName');
  const phoneInput = document.getElementById('proposalCustomerPhone');
  const productSelect = document.getElementById('proposalProduct');
  const valueInput = document.getElementById('proposalValue');
  const saveButton = document.getElementById('proposalSave');
  const refreshButton = document.getElementById('proposalsRefresh');
  const feedback = document.getElementById('proposalFeedback');
  const list = document.getElementById('proposalsList');

  let products = [];
  try {
    products = await loadProducts(productSelect);
  } catch (error) {
    productSelect.innerHTML = '<option value="">Falha ao carregar produtos</option>';
    setFeedback(feedback, error.message || 'Não foi possível carregar produtos.', 'error');
  }

  await loadProposals(list, feedback);

  refreshButton?.addEventListener('click', () => loadProposals(list, feedback));
  saveButton?.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    const phone = phoneInput.value.trim();
    const productId = productSelect.value;
    const value = Number(String(valueInput.value || '').replace(',', '.'));
    const product = products.find((item) => item.id === productId);

    if (!name) return setFeedback(feedback, 'Informe o nome da pessoa ou empresa.', 'error');
    if (!product) return setFeedback(feedback, 'Selecione um produto.', 'error');
    if (!Number.isFinite(value) || value <= 0) return setFeedback(feedback, 'Informe um valor válido.', 'error');

    saveButton.disabled = true;
    setFeedback(feedback, 'Salvando proposta…');
    try {
      const proposal = await createProposal({ session, name, phone, product, value });
      nameInput.value = '';
      phoneInput.value = '';
      productSelect.value = '';
      valueInput.value = '';
      setFeedback(feedback, `Proposta #${proposal.proposal_no} salva.`, 'success');
      await loadProposals(list, null);
    } catch (error) {
      const denied = /permission|policy|row-level|rls|not authorized/i.test(error.message || '');
      setFeedback(feedback, denied ? 'Seu perfil não possui permissão de gestão para criar propostas.' : (error.message || 'Não foi possível salvar a proposta.'), 'error');
    } finally {
      saveButton.disabled = false;
    }
  });
}
