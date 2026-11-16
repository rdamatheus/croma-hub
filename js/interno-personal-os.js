import { protectInternalPage } from './interno-auth.js';
import { supabase } from './croma-supabase.js';

// Camada de integração do núcleo Personal OS. Mantém isolamento por usuário + RLS.
// Não conecta, importa nem replica registros da operação da Croma.
const session = await protectInternalPage({ roles: ['owner'] });
if (!session) throw new Error('Acesso restrito ao proprietário.');
const db = supabase.schema('personal_os');
const userId = session.user.id;
const el = id => document.getElementById(id);

const SPECS = {
  projects: {
    label: 'Projetos', singular: 'Projeto', description: 'Projetos pessoais e transversais, não o catálogo técnico de sistemas.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'status', label: 'Situação', type: 'select', options: [['active','Ativo'],['draft','Rascunho'],['paused','Pausado'],['completed','Concluído']] },
      { key: 'priority', label: 'Prioridade', type: 'select', options: [['medium','Média'],['low','Baixa'],['high','Alta']] },
      { key: 'target_date', label: 'Prazo-alvo', type: 'date' }
    ],
    summary: item => item.description || ''
  },
  tasks: {
    label: 'Tarefas', singular: 'Tarefa', description: 'Tarefas pessoais; tarefas da loja ficam no Centro Operacional.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'project_id', label: 'Projeto relacionado', type: 'project' },
      { key: 'status', label: 'Situação', type: 'select', options: [['todo','A fazer'],['doing','Em andamento'],['blocked','Bloqueado'],['done','Concluído']] },
      { key: 'priority', label: 'Prioridade', type: 'select', options: [['medium','Média'],['low','Baixa'],['high','Alta']] },
      { key: 'due_at', label: 'Data e hora', type: 'datetime-local' }
    ],
    summary: item => item.description || ''
  },
  goals: {
    label: 'Metas', singular: 'Meta', description: 'Metas e resultados pretendidos; jornadas e progresso avançado terão migração própria.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'success_criteria', label: 'Critério de sucesso', type: 'textarea' },
      { key: 'status', label: 'Situação', type: 'select', options: [['active','Ativa'],['draft','Rascunho'],['paused','Pausada'],['achieved','Alcançada']] },
      { key: 'priority', label: 'Prioridade', type: 'select', options: [['medium','Média'],['low','Baixa'],['high','Alta']] },
      { key: 'target_date', label: 'Data-alvo', type: 'date' }
    ],
    summary: item => item.description || item.success_criteria || ''
  },
  ideas: {
    label: 'Ideias', singular: 'Ideia', description: 'Capturar possibilidades sem convertê-las automaticamente em compromissos.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea' },
      { key: 'project_id', label: 'Projeto relacionado', type: 'project' },
      { key: 'status', label: 'Situação', type: 'select', options: [['inbox','Caixa de entrada'],['triaged','Avaliada'],['active','Em análise'],['discarded','Descartada']] }
    ],
    summary: item => item.description || ''
  },
  decisions: {
    label: 'Decisões', singular: 'Decisão', description: 'Decisões explícitas, justificativas e contexto — sem substituir a aprovação operacional.',
    fields: [
      { key: 'title', label: 'Título', required: true },
      { key: 'decision', label: 'Decisão aprovada', type: 'textarea', required: true },
      { key: 'rationale', label: 'Justificativa', type: 'textarea' },
      { key: 'project_id', label: 'Projeto relacionado', type: 'project' },
      { key: 'status', label: 'Situação', type: 'select', options: [['active','Vigente'],['superseded','Substituída'],['archived','Arquivada']] }
    ],
    summary: item => item.decision || ''
  }
};

let workspaceId = null;
let current = 'projects';
let rows = [];
let editingId = null;
let busy = false;

function message(content, error = false) {
  const node = el('message');
  node.textContent = content || '';
  node.classList.toggle('danger', error);
  node.setAttribute('role', error ? 'alert' : 'status');
}

function make(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (className) node.className = className;
  return node;
}

function config() { return SPECS[current]; }

function renderTabs() {
  const root = el('tabs');
  root.replaceChildren();
  Object.entries(SPECS).forEach(([key, spec]) => {
    const button = make('button', spec.label);
    button.type = 'button';
    button.setAttribute('aria-selected', String(key === current));
    button.addEventListener('click', () => {
      if (busy || key === current) return;
      current = key;
      editingId = null;
      el('editor').hidden = true;
      renderTabs();
      void reload();
    });
    root.appendChild(button);
  });
}

function labelValue(field, value) {
  const found = field?.options?.find(option => option[0] === value);
  return found ? found[1] : value;
}

function action(label, callback, variant = 'alt') {
  const button = make('button', label, 'btn ' + variant);
  button.type = 'button';
  button.disabled = busy;
  button.addEventListener('click', callback);
  return button;
}

function renderItems() {
  el('sectionName').textContent = config().label;
  el('sectionInfo').textContent = config().description;
  const root = el('items');
  root.replaceChildren();
  const visible = rows.filter(row => el('showArchived').checked || !row.archived_at);
  if (!visible.length) {
    root.appendChild(make('p', 'Nenhum registro encontrado nesta seção.', 'muted'));
    return;
  }
  for (const row of visible) {
    const card = make('article', null, 'item' + (row.archived_at ? ' archived' : ''));
    card.appendChild(make('h3', row.title || '(sem título)'));
    const detail = config().summary(row);
    if (detail) card.appendChild(make('p', detail));
    const meta = make('div', null, 'meta');
    const statusField = config().fields.find(field => field.key === 'status');
    for (const value of [labelValue(statusField, row.status), row.priority, row.target_date || (row.due_at ? String(row.due_at).slice(0,10) : ''), row.archived_at ? 'Arquivado' : '']) {
      if (value) meta.appendChild(make('span', value, 'pill'));
    }
    card.appendChild(meta);
    const actions = make('div', null, 'actions');
    if (row.archived_at) {
      actions.appendChild(action('Restaurar', () => void archive(row, false)));
    } else {
      actions.appendChild(action('Editar', () => void openForm(row)));
      actions.appendChild(action('Arquivar', () => void archive(row, true)));
    }
    card.appendChild(actions);
    root.appendChild(card);
  }
}

async function reload() {
  if (!workspaceId) return;
  message('Carregando ' + config().label.toLowerCase() + '…');
  el('add').disabled = true;
  const { data, error } = await db.from(current).select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(500);
  el('add').disabled = false;
  if (error) { message('Erro de leitura: ' + error.message, true); return; }
  rows = data || [];
  renderItems();
  message(rows.length >= 500 ? 'Primeiros 500 registros; paginação será necessária para o restante.' : '');
}

async function projectChoices() {
  const { data, error } = await db.from('projects')
    .select('id,title').eq('workspace_id', workspaceId).is('archived_at', null).order('title').limit(300);
  if (error) throw error;
  return (data || []).map(row => [row.id, row.title]);
}

function inputField(field, value, projects) {
  const container = make('div', null, 'field' + (field.type === 'textarea' ? ' full' : ''));
  const label = make('label', field.label);
  label.htmlFor = 'field-' + field.key;
  const options = field.type === 'project' ? [['','Nenhum projeto'], ...projects] : field.options;
  let input;
  if (options) {
    input = make('select');
    for (const option of options) {
      const opt = make('option', option[1]);
      opt.value = option[0];
      input.appendChild(opt);
    }
  } else if (field.type === 'textarea') {
    input = make('textarea');
    input.rows = 3;
  } else {
    input = make('input');
    input.type = field.type || 'text';
  }
  input.id = label.htmlFor;
  input.name = field.key;
  input.required = Boolean(field.required);
  if (field.key === 'due_at' && value) {
    // Supabase guarda UTC; o controle datetime-local recebe horário local.
    const date = new Date(value);
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    input.value = local.toISOString().slice(0, 16);
  } else input.value = value === null || value === undefined ? '' : String(value);
  container.append(label, input);
  return container;
}

async function openForm(row = null) {
  if (busy || !workspaceId) return;
  editingId = row?.id || null;
  message('');
  const root = el('fields');
  root.replaceChildren();
  try {
    const projects = config().fields.some(field => field.type === 'project') ? await projectChoices() : [];
    for (const field of config().fields) root.appendChild(inputField(field, row?.[field.key], projects));
    el('editorTitle').textContent = editingId ? 'Editar ' + config().singular.toLowerCase() : 'Novo registro: ' + config().singular.toLowerCase();
    el('editor').hidden = false;
    el('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    message('Falha ao preparar formulário: ' + error.message, true);
  }
}

async function writeAudit(actionName, entityId) {
  const { error } = await db.from('activity_log').insert({
    workspace_id: workspaceId, actor_user_id: userId,
    action: actionName, entity_type: current, entity_id: entityId,
    metadata: { source: 'croma-hub-interno-personal-os' }
  });
  return error;
}

async function save(event) {
  event.preventDefault();
  if (busy || !workspaceId) return;
  const payload = {};
  const values = new FormData(el('editForm'));
  for (const field of config().fields) {
    const value = String(values.get(field.key) || '').trim();
    if (field.required && !value) { message('Preencha: ' + field.label, true); return; }
    payload[field.key] = value || null;
  }
  if (payload.due_at) {
    const value = new Date(payload.due_at);
    if (Number.isNaN(value.valueOf())) { message('Data e hora inválidas.', true); return; }
    payload.due_at = value.toISOString();
  }
  const targetTable = current;
  const updating = Boolean(editingId);
  busy = true;
  el('save').disabled = true;
  message('Gravando…');
  try {
    let query;
    if (updating) {
      query = db.from(targetTable).update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editingId).eq('workspace_id', workspaceId).select('id').single();
    } else {
      query = db.from(targetTable).insert({ ...payload, workspace_id: workspaceId, user_id: userId })
        .select('id').single();
    }
    const { data, error } = await query;
    if (error) throw error;
    const auditError = await writeAudit(targetTable + (updating ? '_updated' : '_created'), data.id);
    el('editor').hidden = true;
    editingId = null;
    await reload();
    message(auditError ? 'Registro gravado, mas a auditoria falhou: ' + auditError.message : 'Registro gravado e auditoria confirmada.', Boolean(auditError));
  } catch (error) { message('Não foi possível gravar: ' + error.message, true); }
  finally { busy = false; el('save').disabled = false; }
}

async function archive(row, shouldArchive) {
  if (busy || !workspaceId) return;
  if (shouldArchive && !window.confirm('Arquivar este registro? Ele poderá ser restaurado depois.')) return;
  busy = true;
  message(shouldArchive ? 'Arquivando…' : 'Restaurando…');
  try {
    const { error } = await db.from(current).update({
      archived_at: shouldArchive ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    }).eq('workspace_id', workspaceId).eq('id', row.id).select('id').single();
    if (error) throw error;
    const auditError = await writeAudit(current + (shouldArchive ? '_archived' : '_restored'), row.id);
    await reload();
    message(auditError ? 'Estado alterado, mas auditoria falhou: ' + auditError.message : 'Estado atualizado e auditado.', Boolean(auditError));
  } catch (error) { message('Não foi possível atualizar: ' + error.message, true); }
  finally { busy = false; }
}

async function initialize() {
  message('Consultando workspace da conta autenticada…');
  try {
    const { data, error } = await db.from('workspaces')
      .select('id,name').eq('owner_user_id', userId).eq('kind', 'personal').is('archived_at', null).maybeSingle();
    if (error) throw error;
    workspaceId = data?.id || null;
    el('activation').hidden = Boolean(data);
    el('workspace').hidden = !data;
    if (!data) {
      message('Nenhum workspace pessoal localizado. A criação não será automática.');
      return;
    }
    el('workspaceName').textContent = data.name;
    renderTabs();
    await reload();
  } catch (error) {
    message('Não foi possível consultar Personal OS: ' + error.message + '. Verifique exposição do schema e políticas de acesso.', true);
  }
}

el('activate').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  el('activate').disabled = true;
  message('Inicializando workspace solicitado…');
  try {
    const { error } = await db.rpc('ensure_personal_workspace');
    if (error) throw error;
    await initialize();
  } catch (error) {
    message('Não foi possível inicializar: ' + error.message, true);
  } finally { busy = false; el('activate').disabled = false; }
});
el('refresh').addEventListener('click', () => { if (!busy) void reload(); });
el('showArchived').addEventListener('change', renderItems);
el('add').addEventListener('click', () => void openForm());
el('cancel').addEventListener('click', () => { editingId = null; el('editor').hidden = true; });
el('editForm').addEventListener('submit', save);

await initialize();
