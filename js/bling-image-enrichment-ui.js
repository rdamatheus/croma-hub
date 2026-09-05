import { supabase } from './croma-supabase.js';

const shell = document.querySelector('.internal-shell');
if (!shell || document.querySelector('[data-image-enrichment-panel]')) {
  // página incompatível ou painel já carregado
} else {
  const panel = document.createElement('section');
  panel.className = 'internal-card';
  panel.dataset.imageEnrichmentPanel = '1';
  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap">
      <div>
        <span class="internal-eyebrow">Catálogo inteligente</span>
        <h2 style="margin:6px 0 8px">Enriquecimento automático de imagens</h2>
        <p class="internal-muted" style="max-width:780px;margin:0">
          Consulta os detalhes do produto no Bling, aproveita imagens já existentes e, quando necessário,
          procura uma correspondência pública no Mercado Livre. Só aprova automaticamente quando a
          validação atingir confiança alta. A cópia final fica no Storage da Croma e pode ser enviada de volta ao Bling.
        </p>
      </div>
      <span id="imageEnrichmentBadge" class="security-badge">Aguardando teste</span>
    </div>

    <div class="toolbar" style="margin-top:18px">
      <button class="internal-btn" id="runImageEnrichment">Testar 10 produtos</button>
      <button class="internal-btn secondary" id="refreshImageEnrichment">Atualizar resumo</button>
    </div>

    <p class="notice" id="imageEnrichmentMessage" style="margin-top:14px">
      O teste trabalha somente com até 10 produtos já vinculados ao Croma Hub. Itens abaixo de 95% de confiança vão para revisão e não são enviados ao Bling.
    </p>

    <div id="imageEnrichmentSummary" style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:16px"></div>
    <div class="table-wrap" style="margin-top:16px">
      <table>
        <thead><tr><th>Produto</th><th>Origem</th><th>Confiança</th><th>Situação</th><th>Bling</th></tr></thead>
        <tbody id="imageEnrichmentResults"><tr><td colspan="5">Nenhum teste executado nesta sessão.</td></tr></tbody>
      </table>
    </div>
  `;

  const jobsSection = [...shell.querySelectorAll('section.internal-card')].find((section) => section.querySelector('#jobs'));
  if (jobsSection) shell.insertBefore(panel, jobsSection);
  else shell.appendChild(panel);

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  async function invokeImage(body) {
    const { data, error } = await supabase.functions.invoke('product-image-enrich', { body });
    if (error) {
      let message = error.message || 'Falha ao executar enriquecimento.';
      try {
        if (error.context?.json) {
          const payload = await error.context.json();
          message = payload?.detail || payload?.error || message;
        }
      } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.detail || data.error);
    return data;
  }

  function summaryCard(label, value) {
    return `<div style="border:1px solid var(--croma-line);border-radius:14px;padding:14px;background:#fff"><small class="internal-muted">${esc(label)}</small><strong style="display:block;font-size:1.5rem;color:var(--croma-purple);margin-top:4px">${esc(value)}</strong></div>`;
  }

  async function refreshSummary() {
    try {
      const data = await invokeImage({ action: 'status' });
      const s = data.summary || {};
      $('imageEnrichmentSummary').innerHTML = [
        summaryCard('Processados', s.total || 0),
        summaryCard('Aprovados', s.approved || 0),
        summaryCard('Revisão', s.needs_review || 0),
        summaryCard('Enviados ao Bling', s.bling_updated || 0),
      ].join('');
      $('imageEnrichmentBadge').textContent = `${s.approved || 0} aprovado(s)`;
      $('imageEnrichmentBadge').classList.toggle('ready', (s.approved || 0) > 0);
    } catch (error) {
      $('imageEnrichmentMessage').className = 'notice';
      $('imageEnrichmentMessage').textContent = error.message || 'Não foi possível carregar o resumo.';
    }
  }

  function renderResults(results = []) {
    $('imageEnrichmentResults').innerHTML = results.length ? results.map((item) => `
      <tr>
        <td><strong>${esc(item.product_name || item.external_id)}</strong><br><small>${esc(item.sku || '')}</small></td>
        <td>${esc(item.source_type || '—')}</td>
        <td>${esc(`${Number(item.confidence || 0).toFixed(0)}%`)}</td>
        <td>${esc(item.status || '—')}</td>
        <td>${item.bling_updated ? 'Atualizado' : (item.status === 'approved' && item.source_type === 'bling' ? 'Já possuía imagem' : 'Não alterado')}</td>
      </tr>`).join('') : '<tr><td colspan="5">Nenhum resultado.</td></tr>';
  }

  $('runImageEnrichment').onclick = async () => {
    const button = $('runImageEnrichment');
    button.disabled = true;
    $('imageEnrichmentMessage').className = 'notice';
    $('imageEnrichmentMessage').textContent = 'Consultando Bling, validando imagens e processando até 10 produtos…';
    try {
      const data = await invokeImage({ action: 'run', limit: 10, sync_bling: true });
      renderResults(data.results || []);
      const ok = (data.results || []).filter((x) => x.status === 'approved').length;
      const review = (data.results || []).filter((x) => x.status === 'needs_review').length;
      $('imageEnrichmentMessage').className = 'notice ok';
      $('imageEnrichmentMessage').textContent = `Teste concluído: ${data.processed || 0} produto(s), ${ok} aprovado(s) automaticamente e ${review} aguardando revisão.`;
      await refreshSummary();
    } catch (error) {
      $('imageEnrichmentMessage').className = 'notice';
      $('imageEnrichmentMessage').textContent = error.message || 'Falha no teste de enriquecimento.';
    } finally {
      button.disabled = false;
    }
  };

  $('refreshImageEnrichment').onclick = refreshSummary;
  refreshSummary();
}
