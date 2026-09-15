import { supabase } from './croma-supabase.js';

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const brl = (value) => value == null || value === ''
  ? '—'
  : Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const statusLabel = (status) => status === 'ok' ? 'Validado' : status === 'reject' ? 'Rejeitado' : 'Revisar';
const statusClass = (status) => status === 'ok' ? 'ok' : status === 'reject' ? 'bad' : 'warn';
const fmt = (date) => date ? new Date(date).toLocaleString('pt-BR') : '—';

function injectStyle() {
  if (document.querySelector('#supplierValidationStyle')) return;
  const style = document.createElement('style');
  style.id = 'supplierValidationStyle';
  style.textContent = `.sv-card{margin:16px 0}.sv-head{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap}.sv-counts{display:flex;gap:8px;flex-wrap:wrap}.sv-count{border:1px solid var(--croma-line);background:#fff;border-radius:12px;padding:9px 12px;font-weight:900;color:var(--croma-deep);cursor:pointer}.sv-count b{margin-left:6px}.sv-bulk{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}.sv-check{width:17px;height:17px}.sv-pending{font-size:.74rem;color:#8a6500;font-weight:800;margin-top:3px}.sv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.sv-price{border:1px solid var(--croma-line);border-radius:12px;padding:12px}.sv-price small{display:block;color:var(--croma-muted)}.sv-price strong{display:block;color:var(--croma-deep);font-size:1.2rem;margin-top:4px}.sv-form{display:grid;grid-template-columns:220px 1fr;gap:12px;margin-top:14px}.sv-form textarea{min-height:76px}.sv-events{display:grid;gap:8px;margin-top:14px}.sv-event{border-left:3px solid #dcd9ee;padding:7px 0 7px 12px}.sv-event strong{display:block;color:var(--croma-deep)}.sv-event small{color:var(--croma-muted)}@media(max-width:800px){.sv-grid{grid-template-columns:1fr 1fr}.sv-form{grid-template-columns:1fr}}@media(max-width:520px){.sv-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
}

function rpcErrorMessage(error) {
  const parts = [error?.message, error?.details, error?.hint]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return parts.length ? [...new Set(parts)].join(' — ') : 'Não foi possível atualizar a validação.';
}

async function ensureSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Não foi possível validar a sessão.');
  if (!data?.session?.access_token) throw new Error('Sessão expirada. Entre novamente no Croma Hub.');
}

async function setValidation(itemId, status, note = '', approvedPrice = null) {
  await ensureSession();
  const { data, error } = await supabase.rpc('croma_set_supplier_catalog_validation', {
    p_item_id: itemId,
    p_status: status,
    p_note: note || null,
    p_approved_price: approvedPrice
  });
  if (error) throw new Error(rpcErrorMessage(error));
  if (!data?.ok) throw new Error('A validação não foi confirmada pelo servidor.');
  return data;
}

async function countStatus(supplierId, status) {
  const { count, error } = await supabase
    .from('supplier_catalog_items')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_id', supplierId)
    .eq('active', true)
    .eq('validation_status', status);
  if (error) throw error;
  return count || 0;
}

async function initCatalog() {
  const supplierId = new URLSearchParams(location.search).get('supplier');
  const tbody = document.querySelector('#catalogRows');
  if (!supplierId || !tbody) return;

  injectStyle();
  const anchor = document.querySelector('.supplier-kpis');
  const card = document.createElement('section');
  card.className = 'supplier-card sv-card';
  card.innerHTML = `<div class="sv-head"><div><h3 style="margin:0;color:var(--croma-deep)">Fila de validação</h3><div class="muted">Itens fora de “Validado” ficam sob consulta e não atualizam o custo operacional.</div></div><div class="sv-counts"><button class="sv-count" data-status="ok">Validado <b id="svOk">—</b></button><button class="sv-count" data-status="review">Revisar <b id="svReview">—</b></button><button class="sv-count" data-status="reject">Rejeitado <b id="svReject">—</b></button></div></div><div class="sv-bulk"><label class="supplier-toggle"><input id="svSelectVisible" type="checkbox"> Selecionar visíveis</label><span class="muted" id="svSelected">0 selecionado(s)</span><button class="btn light" id="svBulkOk">Validar</button><button class="btn light" id="svBulkReview">Revisar</button><button class="btn bad" id="svBulkReject">Rejeitar</button></div><p class="status" id="svStatus"></p>`;
  anchor?.after(card);

  const [ok, review, reject] = await Promise.all(['ok', 'review', 'reject'].map((status) => countStatus(supplierId, status)));
  document.querySelector('#svOk').textContent = ok.toLocaleString('pt-BR');
  document.querySelector('#svReview').textContent = review.toLocaleString('pt-BR');
  document.querySelector('#svReject').textContent = reject.toLocaleString('pt-BR');

  card.querySelectorAll('[data-status]').forEach((button) => {
    button.onclick = () => {
      const filter = document.querySelector('#validationFilter');
      if (!filter) return;
      filter.value = button.dataset.status;
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    };
  });

  let decorating = false;
  async function decorate() {
    if (decorating) return;
    decorating = true;
    try {
      const table = tbody.closest('table');
      const head = table?.querySelector('thead tr');
      if (head && !head.querySelector('.sv-col-head')) {
        const th = document.createElement('th');
        th.className = 'sv-col-head';
        head.prepend(th);
      }

      const rows = [...tbody.querySelectorAll('tr')]
        .filter((row) => row.querySelector('a[href*="/interno/fornecedores/item/"]'));
      const ids = rows.map((row) => {
        const link = row.querySelector('a[href*="/interno/fornecedores/item/"]');
        return new URL(link.href).searchParams.get('item');
      }).filter(Boolean);
      if (!ids.length) return;

      const { data, error } = await supabase
        .from('supplier_catalog_items')
        .select('id,validation_status,purchase_price,pending_purchase_price,validation_notes,validation_review_note')
        .in('id', ids);
      if (error) throw error;
      const map = new Map((data || []).map((item) => [item.id, item]));

      rows.forEach((row) => {
        const link = row.querySelector('a[href*="/interno/fornecedores/item/"]');
        const id = new URL(link.href).searchParams.get('item');
        const item = map.get(id);
        if (!item) return;
        if (!row.querySelector('.sv-row-check')) {
          const td = document.createElement('td');
          td.innerHTML = `<input class="sv-check sv-row-check" type="checkbox" data-id="${esc(id)}">`;
          row.prepend(td);
          td.querySelector('input').onchange = updateSelected;
        }
        const priceCell = row.children[4];
        if (priceCell && item.pending_purchase_price != null && !priceCell.querySelector('.sv-pending')) {
          priceCell.insertAdjacentHTML('beforeend', `<div class="sv-pending">Proposto: ${brl(item.pending_purchase_price)}</div>`);
        }
      });
      updateSelected();
    } catch (error) {
      console.error(error);
    } finally {
      decorating = false;
    }
  }

  function selectedIds() {
    return [...tbody.querySelectorAll('.sv-row-check:checked')].map((input) => input.dataset.id);
  }

  function updateSelected() {
    document.querySelector('#svSelected').textContent = `${selectedIds().length} selecionado(s)`;
  }

  const observer = new MutationObserver(() => setTimeout(decorate, 0));
  observer.observe(tbody, { childList: true, subtree: true });
  decorate();

  document.querySelector('#svSelectVisible').onchange = (event) => {
    tbody.querySelectorAll('.sv-row-check').forEach((checkbox) => { checkbox.checked = event.target.checked; });
    updateSelected();
  };

  async function bulk(status) {
    const ids = selectedIds();
    if (!ids.length) return alert('Selecione ao menos um item.');

    let note = '';
    if (status !== 'ok') {
      note = prompt(status === 'reject' ? 'Informe o motivo da rejeição:' : 'Observação da revisão (opcional):', '') ?? '';
      if (status === 'reject' && !note.trim()) return;
    }
    if (status === 'ok' && !confirm(`Validar ${ids.length} item(ns)? Quando houver preço proposto, ele passará a ser o preço aprovado.`)) return;

    const box = document.querySelector('#svStatus');
    box.textContent = 'Processando validação…';
    box.className = 'status';

    try {
      const results = [];
      for (let index = 0; index < ids.length; index += 20) {
        const chunk = ids.slice(index, index + 20);
        const part = await Promise.all(chunk.map(async (id) => {
          try {
            const result = await setValidation(id, status, note, null);
            return { id, ok: true, result };
          } catch (error) {
            return { id, ok: false, error: error?.message || String(error) };
          }
        }));
        results.push(...part);
      }

      const failed = results.filter((result) => !result.ok);
      if (failed.length) {
        const sample = failed.slice(0, 3).map((result) => result.error).filter(Boolean).join(' | ');
        throw new Error(sample
          ? `${failed.length} item(ns) não puderam ser processados: ${sample}`
          : `${failed.length} item(ns) não puderam ser processados.`);
      }

      box.textContent = 'Validação concluída.';
      box.className = 'status ok';
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      box.textContent = error?.message || 'Falha na validação.';
      box.className = 'status bad';
    }
  }

  document.querySelector('#svBulkOk').onclick = () => bulk('ok');
  document.querySelector('#svBulkReview').onclick = () => bulk('review');
  document.querySelector('#svBulkReject').onclick = () => bulk('reject');
}

async function initItem() {
  const itemId = new URLSearchParams(location.search).get('item');
  if (!itemId || !document.querySelector('#catalogDetails')) return;

  injectStyle();
  const { data: item, error } = await supabase
    .from('supplier_catalog_items')
    .select('id,sku,name,purchase_price,pending_purchase_price,validation_status,validation_reasons,validation_notes,validation_review_note,validation_reviewed_at')
    .eq('id', itemId)
    .maybeSingle();
  if (error || !item) return;

  const { data: events } = await supabase
    .from('supplier_catalog_validation_events')
    .select('id,event_type,from_status,to_status,previous_purchase_price,pending_purchase_price,approved_purchase_price,reasons,note,source,created_at,actor_id')
    .eq('catalog_item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(30);

  const current = Number(item.purchase_price || 0);
  const pending = item.pending_purchase_price == null ? null : Number(item.pending_purchase_price);
  const delta = current > 0 && pending != null ? ((pending - current) / current) * 100 : null;

  const panel = document.createElement('section');
  panel.className = 'supplier-card detail-card sv-card';
  panel.innerHTML = `<div class="sv-head"><div><h2 style="margin:0 0 6px">Validação comercial</h2><div class="muted">Enquanto o status estiver fora de “Validado”, produtos vinculados ficam sob consulta e o novo custo não é aplicado.</div></div><span class="pill ${statusClass(item.validation_status)}">${statusLabel(item.validation_status)}</span></div><div class="sv-grid" style="margin-top:14px"><div class="sv-price"><small>Preço aprovado atual</small><strong>${brl(item.purchase_price)}</strong></div><div class="sv-price"><small>Preço proposto</small><strong>${brl(item.pending_purchase_price)}</strong></div><div class="sv-price"><small>Variação</small><strong>${delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`}</strong></div><div class="sv-price"><small>Última revisão</small><strong style="font-size:.9rem">${fmt(item.validation_reviewed_at)}</strong></div></div>${(item.validation_reasons || []).length ? `<div class="notice warn" style="margin-top:12px"><strong>Motivos da revisão</strong><div style="margin-top:6px">${(item.validation_reasons || []).map((reason) => `• ${esc(reason.label || reason.code)}${reason.detail ? ` — ${esc(reason.detail)}` : ''}`).join('<br>')}</div></div>` : ''}<div class="sv-form"><div class="field"><label for="svApprovedPrice">Preço a aprovar</label><input id="svApprovedPrice" type="number" min="0.01" step="0.01" value="${esc(pending ?? (current || ''))}"></div><div class="field"><label for="svNote">Observação da validação</label><textarea id="svNote" placeholder="Ex.: conferido no site do fornecedor / tabela corrigida">${esc(item.validation_review_note || '')}</textarea></div></div><div class="sv-bulk"><button class="btn" id="svValidate">Validar e aplicar preço</button><button class="btn light" id="svKeepReview">Manter em revisão</button><button class="btn bad" id="svReject">Rejeitar</button></div><p class="status" id="svItemStatus"></p><div style="margin-top:18px"><h3 style="margin:0 0 8px;color:var(--croma-deep)">Histórico de validação</h3><div class="sv-events">${(events || []).length ? (events || []).map((event) => `<div class="sv-event"><small>${fmt(event.created_at)}</small><strong>${statusLabel(event.to_status)}${event.source ? ` · ${esc(event.source)}` : ''}</strong><div class="muted">${event.previous_purchase_price != null ? `Anterior ${brl(event.previous_purchase_price)} · ` : ''}${event.pending_purchase_price != null ? `Proposto ${brl(event.pending_purchase_price)} · ` : ''}${event.approved_purchase_price != null ? `Aprovado ${brl(event.approved_purchase_price)}` : ''}${event.note ? `<br>${esc(event.note)}` : ''}</div></div>`).join('') : '<span class="muted">Sem eventos de validação.</span>'}</div></div>`;

  document.querySelector('.detail-main')?.prepend(panel);

  async function action(status) {
    const note = document.querySelector('#svNote').value.trim();
    const price = Number(document.querySelector('#svApprovedPrice').value);
    const box = document.querySelector('#svItemStatus');

    if (status === 'reject' && !note) return alert('Informe o motivo da rejeição.');
    if (status === 'ok' && (!Number.isFinite(price) || price <= 0)) return alert('Informe um preço maior que zero.');

    box.textContent = 'Salvando…';
    box.className = 'status';
    try {
      await setValidation(
        itemId,
        status,
        note,
        status === 'ok' ? price : (Number.isFinite(price) && price >= 0 ? price : null)
      );
      box.textContent = 'Validação atualizada.';
      box.className = 'status ok';
      setTimeout(() => location.reload(), 500);
    } catch (error) {
      box.textContent = error?.message || 'Falha na validação.';
      box.className = 'status bad';
    }
  }

  document.querySelector('#svValidate').onclick = () => action('ok');
  document.querySelector('#svKeepReview').onclick = () => action('review');
  document.querySelector('#svReject').onclick = () => action('reject');
}

if (location.pathname.includes('/interno/fornecedores/catalogo')) initCatalog().catch(console.error);
if (location.pathname.includes('/interno/fornecedores/item')) initItem().catch(console.error);
