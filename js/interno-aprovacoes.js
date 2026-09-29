import { supabase } from './croma-supabase.js';
import { protectInternalPage } from './interno-auth.js';

const session = await protectInternalPage({ roles: ['owner', 'manager'] });
if (!session) throw new Error('auth');

const TYPE_LABELS = {
  product_image: 'Foto/imagem de produto',
  product_related: 'Conteúdo relacionado ao produto',
  banner: 'Banner',
  featured_item: 'Destaque de produto/serviço',
  campaign: 'Campanha',
  seasonal: 'Calendário sazonal'
};
const STATUS_LABELS = {
  draft: 'Rascunho',
  pending: 'Aguardando aprovação',
  changes_requested: 'Alterações solicitadas',
  approved: 'Aprovado',
  rejected: 'Recusado',
  published: 'Publicado',
  archived: 'Arquivado'
};

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const formatDate = value => {
  if (!value) return 'Sem data';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sem data' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
};
const formatShortDate = value => {
  if (!value) return 'Sem data';
  const date = new Date(value + 'T12:00:00');
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date);
};

let proposals = [];
let products = [];
let productMap = new Map();
let selectedId = null;
let versions = [];
let comments = [];

function setStatus(id, message, type = '') {
  const element = $(id);
  if (!element) return;
  element.textContent = message || '';
  element.className = 'status' + (type ? ' ' + type : '');
}

function statusPill(status) {
  return '<span class="pill ' + esc(status || '') + '">' + esc(STATUS_LABELS[status] || status || 'Sem status') + '</span>';
}

function updateCounts() {
  $('countPending').textContent = proposals.filter(row => row.status === 'pending').length;
  $('countChanges').textContent = proposals.filter(row => row.status === 'changes_requested').length;
  $('countApproved').textContent = proposals.filter(row => row.status === 'approved').length;
  $('countAll').textContent = proposals.length;
}

function filteredProposals() {
  const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
  const wantedStatus = $('statusFilter').value;
  const wantedType = $('typeFilter').value;
  return proposals.filter(row => {
    const product = productMap.get(row.product_id);
    const haystack = [row.title, row.area, row.summary, row.rationale, product?.nome, product?.sku].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
    return (!term || haystack.includes(term))
      && (wantedStatus === 'all' || row.status === wantedStatus)
      && (wantedType === 'all' || row.proposal_type === wantedType);
  });
}

function renderList() {
  const rows = filteredProposals();
  $('resultLabel').textContent = rows.length + (rows.length === 1 ? ' item' : ' itens');
  if (!rows.length) {
    $('proposalList').innerHTML = '<div class="empty">Nenhuma proposta corresponde aos filtros atuais.</div>';
    return;
  }
  $('proposalList').innerHTML = rows.map(row => {
    const product = productMap.get(row.product_id);
    const selected = row.id === selectedId ? ' selected' : '';
    const date = row.proposed_for ? 'Data: ' + formatShortDate(row.proposed_for) : 'Atualizada: ' + formatDate(row.updated_at);
    return '<article class="proposal' + selected + '" data-proposal="' + esc(row.id) + '">'
      + '<div class="proposal-head"><strong>' + esc(row.title) + '</strong>' + statusPill(row.status) + '</div>'
      + '<div class="proposal-meta">' + esc(TYPE_LABELS[row.proposal_type] || row.proposal_type) + (row.area ? ' · ' + esc(row.area) : '') + '<br>' + esc(date) + (product ? '<br>Produto: ' + esc(product.nome) : '') + '</div>'
      + '</article>';
  }).join('');
  $('proposalList').querySelectorAll('[data-proposal]').forEach(card => {
    card.addEventListener('click', () => selectProposal(card.dataset.proposal));
  });
}

function renderMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length) return '<p>Sem dados complementares.</p>';
  return '<div class="json-list">' + Object.entries(metadata).map(([key, value]) => {
    const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return '<div><span>' + esc(key.replaceAll('_', ' ')) + ':</span> ' + esc(rendered) + '</div>';
  }).join('') + '</div>';
}

function renderDetail() {
  const row = proposals.find(item => item.id === selectedId);
  if (!row) {
    $('detail').innerHTML = '<div class="detail-empty">Selecione uma proposta para revisar.</div>';
    return;
  }
  const product = productMap.get(row.product_id);
  const preview = row.preview_url
    ? '<img src="' + esc(row.preview_url) + '" alt="Preview da proposta">'
    : '<div class="preview-placeholder">Esta proposta ainda não tem preview visual.</div>';
  const versionHtml = versions.length
    ? versions.map(version => '<div class="version"><strong>Versão ' + esc(version.version_number) + '</strong>'
      + (version.change_summary ? '<div>' + esc(version.change_summary) + '</div>' : '')
      + '<small>' + esc(formatDate(version.created_at)) + '</small></div>').join('')
    : '<div class="muted">Nenhuma versão detalhada registrada ainda.</div>';
  const commentHtml = comments.length
    ? comments.map(comment => '<div class="comment"><strong>' + esc(comment.comment_type === 'decision' ? 'Decisão' : comment.comment_type === 'system' ? 'Sistema' : 'Comentário') + '</strong>'
      + '<div>' + esc(comment.body) + '</div><small>' + esc(formatDate(comment.created_at)) + '</small></div>').join('')
    : '<div class="muted">Nenhum comentário ainda.</div>';
  const canDecide = ['pending', 'changes_requested'].includes(row.status);
  $('detail').innerHTML = '<div class="detail-head"><div><strong>' + esc(row.title) + '</strong><div class="detail-sub">' + esc(TYPE_LABELS[row.proposal_type] || row.proposal_type) + (row.area ? ' · ' + esc(row.area) : '') + '</div></div><div class="detail-badges">' + statusPill(row.status) + '<span class="pill">v' + esc(row.current_version || 1) + '</span></div></div>'
    + '<div class="preview">' + preview + '</div>'
    + '<div class="detail-grid">'
    + '<div class="detail-block"><small>Resumo</small><p>' + esc(row.summary || 'Sem resumo informado.') + '</p></div>'
    + '<div class="detail-block"><small>Produto relacionado</small><p>' + esc(product ? product.nome + (product.sku ? ' · SKU ' + product.sku : '') : 'Nenhum produto vinculado.') + '</p></div>'
    + '<div class="detail-block full"><small>Por que a proposta foi sugerida</small><p>' + esc(row.rationale || 'O agente ainda não registrou o motivo.') + '</p></div>'
    + '<div class="detail-block"><small>Destino</small><p>' + esc([row.target_type, row.target_ref].filter(Boolean).join(' · ') || 'Sem destino definido') + '</p></div>'
    + '<div class="detail-block"><small>Período / data</small><p>' + esc(row.proposed_for ? formatShortDate(row.proposed_for) : [row.starts_at && formatDate(row.starts_at), row.ends_at && formatDate(row.ends_at)].filter(Boolean).join(' → ') || 'Sem período') + '</p></div>'
    + '<div class="detail-block full"><small>Dados complementares</small>' + renderMetadata(row.metadata) + '</div>'
    + '</div>'
    + '<div class="section"><div class="section-title"><h3>Histórico de versões</h3><span class="muted">' + versions.length + '</span></div><div class="versions">' + versionHtml + '</div></div>'
    + '<div class="section"><div class="section-title"><h3>Comentários e decisões</h3><span class="muted">' + comments.length + '</span></div><div class="comments">' + commentHtml + '</div></div>'
    + '<div class="decision"><h3>Seu comentário</h3><p class="decision-note">Registre sempre o motivo. Ele será usado para orientar a próxima versão e as próximas sugestões.</p><textarea id="decisionComment" placeholder="Ex.: Gostei, mas use menos roxo e troque o site por bloco de receituário."></textarea><div class="actions">'
    + (canDecide ? '<button class="btn good" data-decision="approved" type="button">Aprovar</button><button class="btn warn" data-decision="changes_requested" type="button">Pedir revisão</button><button class="btn bad" data-decision="rejected" type="button">Recusar</button>' : '<span class="muted">Esta proposta já recebeu uma decisão. Você ainda pode adicionar um comentário.</span>')
    + '<button class="btn light" id="addComment" type="button">Adicionar comentário</button></div><p class="status" id="detailStatus"></p></div>';
  $('detail').querySelectorAll('[data-decision]').forEach(button => button.addEventListener('click', () => decide(button.dataset.decision)));
  $('addComment').addEventListener('click', addComment);
}

async function loadDetail(id) {
  selectedId = id;
  const [versionResult, commentResult] = await Promise.all([
    supabase.from('site_approval_versions').select('*').eq('proposal_id', id).order('version_number', { ascending: false }),
    supabase.from('site_approval_comments').select('*').eq('proposal_id', id).order('created_at', { ascending: false })
  ]);
  if (versionResult.error) throw versionResult.error;
  if (commentResult.error) throw commentResult.error;
  versions = versionResult.data || [];
  comments = commentResult.data || [];
  renderList();
  renderDetail();
}

async function selectProposal(id) {
  try {
    await loadDetail(id);
  } catch (error) {
    console.error(error);
    $('detail').innerHTML = '<div class="detail-empty">Não foi possível carregar o histórico desta proposta.</div>';
  }
}

async function load() {
  const [proposalResult, productResult] = await Promise.all([
    supabase.from('site_approval_proposals').select('*').order('updated_at', { ascending: false }),
    supabase.from('products').select('id,nome,sku,slug').eq('ativo', true).order('nome')
  ]);
  if (proposalResult.error) throw proposalResult.error;
  proposals = proposalResult.data || [];
  products = productResult.error ? [] : (productResult.data || []);
  productMap = new Map(products.map(product => [product.id, product]));
  $('newProduct').innerHTML = '<option value="">Nenhum</option>' + products.map(product => '<option value="' + esc(product.id) + '">' + esc(product.nome) + (product.sku ? ' · ' + esc(product.sku) : '') + '</option>').join('');
  updateCounts();
  renderList();
  if (selectedId && proposals.some(row => row.id === selectedId)) await loadDetail(selectedId);
  else if (proposals[0]) await loadDetail(proposals[0].id);
  else renderDetail();
}

async function decide(status) {
  const comment = $('decisionComment')?.value.trim();
  if (!comment) {
    setStatus('detailStatus', 'Escreva o comentário antes de registrar a decisão.', 'bad');
    return;
  }
  const now = new Date().toISOString();
  const label = STATUS_LABELS[status] || status;
  const { error: commentError } = await supabase.from('site_approval_comments').insert({
    proposal_id: selectedId,
    author_id: session.user.id,
    comment_type: 'decision',
    body: '[' + label + '] ' + comment
  });
  if (commentError) {
    setStatus('detailStatus', commentError.message || 'Não foi possível salvar o comentário.', 'bad');
    return;
  }
  const { error } = await supabase.from('site_approval_proposals').update({
    status,
    updated_by: session.user.id,
    decided_by: session.user.id,
    decided_at: now,
    updated_at: now
  }).eq('id', selectedId);
  if (error) {
    setStatus('detailStatus', error.message || 'Não foi possível atualizar a proposta.', 'bad');
    return;
  }
  await load();
  setStatus('detailStatus', 'Decisão registrada. A proposta ficou disponível para a próxima revisão do agente.', 'ok');
}

async function addComment() {
  const comment = $('decisionComment')?.value.trim();
  if (!comment) {
    setStatus('detailStatus', 'Escreva um comentário antes de salvar.', 'bad');
    return;
  }
  const { error } = await supabase.from('site_approval_comments').insert({
    proposal_id: selectedId,
    author_id: session.user.id,
    comment_type: 'feedback',
    body: comment
  });
  if (error) {
    setStatus('detailStatus', error.message || 'Não foi possível salvar o comentário.', 'bad');
    return;
  }
  await loadDetail(selectedId);
  setStatus('detailStatus', 'Comentário salvo no histórico.', 'ok');
}

async function createProposal(event) {
  event.preventDefault();
  const title = $('newTitle').value.trim();
  if (!title) {
    setStatus('newStatus', 'Informe um título.', 'bad');
    return;
  }
  const now = new Date().toISOString();
  const payload = {
    proposal_type: $('newType').value,
    status: 'pending',
    title,
    area: $('newArea').value,
    summary: $('newSummary').value.trim() || null,
    rationale: $('newRationale').value.trim() || null,
    preview_url: $('newPreview').value.trim() || null,
    target_type: 'reference',
    target_ref: $('newTarget').value.trim() || null,
    product_id: $('newProduct').value || null,
    metadata: { created_from: 'central_manual' },
    current_version: 1,
    source: 'manual',
    proposed_for: $('newDate').value || null,
    created_by: session.user.id,
    updated_by: session.user.id,
    updated_at: now
  };
  setStatus('newStatus', 'Salvando…');
  const { data, error } = await supabase.from('site_approval_proposals').insert(payload).select().single();
  if (error) {
    setStatus('newStatus', error.message || 'Não foi possível criar a proposta.', 'bad');
    return;
  }
  const { error: versionError } = await supabase.from('site_approval_versions').insert({
    proposal_id: data.id,
    version_number: 1,
    preview_url: payload.preview_url,
    content: {
      title: payload.title,
      summary: payload.summary,
      rationale: payload.rationale,
      target_ref: payload.target_ref
    },
    change_summary: 'Versão inicial criada manualmente.',
    created_by: session.user.id
  });
  if (versionError) {
    setStatus('newStatus', versionError.message || 'Proposta criada, mas a versão inicial falhou.', 'bad');
    return;
  }
  await supabase.from('site_approval_comments').insert({
    proposal_id: data.id,
    author_id: session.user.id,
    comment_type: 'system',
    body: 'Proposta criada manualmente na Central de Aprovações.'
  });
  $('newForm').reset();
  setStatus('newStatus', 'Proposta adicionada à fila.', 'ok');
  selectedId = data.id;
  await load();
}

$('search').addEventListener('input', renderList);
$('statusFilter').addEventListener('change', renderList);
$('typeFilter').addEventListener('change', renderList);
$('refresh').addEventListener('click', () => load().catch(error => {
  console.error(error);
  $('proposalList').innerHTML = '<div class="empty">Não foi possível atualizar a fila.</div>';
}));
$('newForm').addEventListener('submit', createProposal);

try {
  await load();
  document.body.hidden = false;
} catch (error) {
  console.error('approval_center_load_error', error);
  document.body.hidden = false;
  $('proposalList').innerHTML = '<div class="empty">Não foi possível carregar a Central de Aprovações.</div>';
}