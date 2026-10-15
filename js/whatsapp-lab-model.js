export const CATEGORIES = {
  orcamento: 'Or\u00e7amento',
  arte_arquivo: 'Arte / arquivo',
  prazo_producao: 'Prazo / produ\u00e7\u00e3o',
  aprovacao_pagamento: 'Aprova\u00e7\u00e3o / pagamento',
  retirada_entrega: 'Retirada / entrega',
  problema_reclamacao: 'Problema / reclama\u00e7\u00e3o'
};

export const PRIORITIES = {normal: 'Normal', alta: 'Alta', urgente: 'Urgente'};
export const WORKFLOW_STATUSES = {
  novo: 'Novo', em_analise: 'Em an\u00e1lise', aguardando_cliente: 'Aguardando cliente',
  aguardando_producao: 'Aguardando produ\u00e7\u00e3o', orcamento_enviado: 'Or\u00e7amento enviado',
  aprovado: 'Aprovado', finalizado: 'Finalizado', cancelado: 'Cancelado'
};
export const TAGS = {
  cliente_novo: 'Cliente novo', cliente_recorrente: 'Cliente recorrente', empresa_b2b: 'Empresa / B2B',
  urgente: 'Urgente', falta_informacao: 'Falta informa\u00e7\u00e3o', arquivo_recebido: 'Arquivo recebido',
  nota_fiscal_dados: 'Nota fiscal / dados', recompra: 'Recompra', fora_do_escopo: 'Fora do escopo'
};
export const DATA_FIELDS = {
  produto: 'Produto', quantidade: 'Quantidade', medidas: 'Medidas', material: 'Material',
  acabamento: 'Acabamento', prazo_solicitado: 'Prazo solicitado', forma_recebimento: 'Recebimento'
};

export const EXAMPLES = {
  orcamento: 'Quero fazer 500 cart\u00f5es igual da outra vez. Consegue para amanh\u00e3?',
  arte_arquivo: 'Enviei a arte do banner em PDF. Pode conferir se o tamanho est\u00e1 certo antes de imprimir?',
  prazo_producao: 'Bom dia! Como est\u00e1 a produ\u00e7\u00e3o dos meus panfletos? Preciso deles na sexta.',
  aprovacao_pagamento: 'A arte ficou boa, pode aprovar. Me envie o Pix para eu fazer o pagamento.',
  retirada_entrega: 'Meu pedido est\u00e1 pronto? Quero buscar na loja hoje \u00e0 tarde.',
  problema_reclamacao: 'Recebi os cart\u00f5es, mas o telefone saiu errado. Preciso que voc\u00eas confiram.'
};

export function canEditAtendimento(session, atendimento) {
  return !!session?.user?.id && !!session?.profile?.ativo && ['owner', 'manager', 'equipe'].includes(session.profile.role)
    && (atendimento.created_by === session.user.id || ['owner', 'manager'].includes(session.profile.role));
}

export function manualTestInput({name = '', phone = '', body = '', source = 'manual', inputKey}) {
  const contactName = name.trim() || 'Contato de teste';
  const digits = phone.replace(/\D/g, '');
  if (contactName.length > 120) throw new Error('O nome deve ter at\u00e9 120 caracteres.');
  if (phone.trim() && (!/^[+\d\s().-]+$/.test(phone) || !/^\d{8,15}$/.test(digits))) {
    throw new Error('Confira o telefone com pa\u00eds e DDD.');
  }
  if (!body.trim()) throw new Error('Escreva uma mensagem para o teste.');
  if (body.length > 8000) throw new Error('A mensagem deve ter at\u00e9 8.000 caracteres.');
  if (!['manual', 'simulador'].includes(source)) throw new Error('Origem de teste inv\u00e1lida.');
  return {p_input_key: inputKey, p_contact_name: contactName, p_contact_phone: digits || null, p_body: body, p_source: source};
}

const stringList = {type: 'array', items: {type: 'string'}};
export const ANALYSIS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    resumo: {type: 'string'}, pedido_cliente: stringList, especificacoes: stringList,
    pendencias: stringList, resposta_sugerida: {type: 'string'}, tarefas_internas: stringList,
    arquivos_analisados: stringList,
    categoria_sugerida: {type: ['string', 'null'], enum: [...Object.keys(CATEGORIES), null]},
    prioridade_sugerida: {type: 'string', enum: Object.keys(PRIORITIES)},
    tags: {type: 'array', items: {type: 'string', enum: Object.keys(TAGS)}},
    dados_extraidos: {
      type: 'object', additionalProperties: false,
      properties: Object.fromEntries(Object.keys(DATA_FIELDS).map(key => [key, {type: [key === 'quantidade' ? 'number' : 'string', 'null']} ])),
      required: Object.keys(DATA_FIELDS)
    },
    dados_faltantes: stringList
  },
  required: ['resumo', 'pedido_cliente', 'especificacoes', 'pendencias', 'resposta_sugerida',
    'tarefas_internas', 'arquivos_analisados', 'categoria_sugerida', 'prioridade_sugerida',
    'tags', 'dados_extraidos', 'dados_faltantes']
};

export function validateAnalysis(value) {
  const fail = () => {throw new Error('A IA retornou uma an\u00e1lise incompleta ou inv\u00e1lida. Tente novamente.');};
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail();
  if (Object.keys(value).some(key => !Object.hasOwn(ANALYSIS_SCHEMA.properties,key)) || ANALYSIS_SCHEMA.required.some(key => !(key in value))) fail();
  for (const key of ['resumo', 'resposta_sugerida']) if (typeof value[key] !== 'string') fail();
  for (const key of ['pedido_cliente', 'especificacoes', 'pendencias', 'tarefas_internas', 'arquivos_analisados', 'dados_faltantes']) {
    if (!Array.isArray(value[key]) || value[key].some(item => typeof item !== 'string')) fail();
  }
  if (value.categoria_sugerida !== null && !Object.hasOwn(CATEGORIES, value.categoria_sugerida)) fail();
  if (!Object.hasOwn(PRIORITIES, value.prioridade_sugerida)) fail();
  if (!Array.isArray(value.tags) || value.tags.some(tag => !Object.hasOwn(TAGS, tag))) fail();
  const fields = value.dados_extraidos;
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) fail();
  if (Object.keys(fields).some(key => !Object.hasOwn(DATA_FIELDS, key))) fail();
  for (const key of Object.keys(DATA_FIELDS)) {
    if (!(key in fields)) fail();
    if (fields[key] === null) continue;
    if (key === 'quantidade') {
      if (!Number.isFinite(fields[key]) || fields[key] < 0) fail();
    } else if (typeof fields[key] !== 'string') fail();
  }
  return {...value, tags: [...new Set(value.tags)]};
}
