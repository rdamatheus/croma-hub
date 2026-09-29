const ICONS={
  contatos:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/>',
  pedidos:'<path d="M6 2h12l1 4H5l1-4Z"/><path d="M5 6v16h14V6"/><path d="M9 10h6M9 14h6M9 18h4"/>',
  comercial:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  propostas:'<path d="M5 3h14v18H5z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
  nfse:'<path d="M6 2h9l3 3v17H6z"/><path d="M14 2v4h4M9 11h6M9 15h4"/>',
  whatsapp:'<path d="M21 11.5a8.5 8.5 0 0 1-12.7 7.4L3 20l1.1-4.6A8.5 8.5 0 1 1 21 11.5Z"/><path d="M8 10h8M8 14h5"/>',
  produtos:'<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="m3 8 9 5 9-5M3 8v8l9 5 9-5V8"/>',
  insumos:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="7" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  fornecedores:'<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9 21v-6h6v6M8 10h.01M12 10h.01M16 10h.01"/>',
  catalogoFornecedor:'<path d="M4 5h16v14H4z"/><path d="M8 9h8M8 13h5"/>',
  categorias:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  segmentos:'<circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2"/><path d="M2 20a6 6 0 0 1 12 0M14 20a4 4 0 0 1 8 0"/>',
  organizacao:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9zM7 10v2a2 2 0 0 0 2 2h3"/>',
  custos:'<circle cx="12" cy="12" r="9"/><path d="M16 8h-5a2 2 0 1 0 0 4h2a2 2 0 1 1 0 4H8M12 6v12"/>',
  precificacao:'<path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h3M8 16h8M15 11v3"/>',
  producao:'<path d="M3 20h18M5 20V9l5 3V9l5 3V5h4v15"/>',
  midias:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 15-5-5L5 20"/>',
  portfolio:'<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 5V3h8v2M3 11h18"/>',
  simulador:'<path d="M4 7h12a4 4 0 0 1 0 8H4z"/><circle cx="4" cy="11" r="3"/><path d="M8 9h4v4H8zM14 9h2v4h-2"/>',
  gestao:'<path d="M3 3v18h18"/><path d="m7 16 4-5 4 3 5-7"/>',
  rotinas:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 9h18"/>',
  operacao:'<path d="M4 6h16M4 12h16M4 18h10"/><path d="m17 16 3 3 4-5"/>',
  equipe:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  treinamento:'<path d="m2 9 10-5 10 5-10 5L2 9Z"/><path d="M6 11v5c3 3 9 3 12 0v-5"/>',
  formularios:'<path d="M6 2h12v20H6z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  marketing:'<path d="m3 11 15-6v14L3 13v-2Z"/><path d="M7 14v5a2 2 0 0 0 2 2h1"/>',
  vitrine:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h7M7 17h4"/>',
  aprovacoes:'<path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h5M8 16h8"/><path d="m16 14 2 2 3-4"/>',
  copiloto:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  pesquisa:'<path d="M9 2v6l-5 9a3 3 0 0 0 2.6 4.5h10.8A3 3 0 0 0 20 17l-5-9V2"/><path d="M7 13h10"/>',
  evolucao:'<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 8 6-4 6 7 6-5"/>',
  bling:'<path d="M20 7h-9M14 17H5M17 4l3 3-3 3M8 14l-3 3 3 3"/>'
};

const MANAGEMENT_ROLES=['owner','manager'];
const OWNER_ROLE=['owner'];

export const INTERNAL_GROUPS=[
  {id:'vendas',label:'Atendimento e vendas',description:'Clientes, pedidos, propostas, faturamento e relacionamento.',tag:'Comercial',items:[
    {key:'contatos',label:'Contatos',href:'/interno/contatos/',description:'Clientes, fornecedores, transportadores e demais contatos.',icon:ICONS.contatos},
    {key:'pedidos',label:'Pedidos',href:'/interno/pedidos/',description:'Pedidos, clientes, status, pagamentos, prazos e valores.',icon:ICONS.pedidos},
    {key:'comercial',label:'Comercial',href:'/interno/comercial/',description:'Oportunidades, retornos, prospecção e acompanhamento comercial.',icon:ICONS.comercial},
    {key:'propostas',label:'Propostas',href:'/interno/propostas/',description:'Cotações e propostas comerciais vinculadas à operação.',icon:ICONS.propostas},
    {key:'nfse',label:'NFS-e',href:'/interno/nfse/',description:'Faturamento, documentos fiscais e acompanhamento da emissão.',icon:ICONS.nfse,roles:OWNER_ROLE},
    {key:'whatsapp',label:'Laboratório WhatsApp',href:'/interno/whatsapp-lab/',description:'Conversa, mídia e testes para atendimento assistido.',icon:ICONS.whatsapp}
  ]},
  {id:'produtos',label:'Produtos, compras e produção',description:'Cadastro mestre, custos, fornecedores, materiais e ferramentas de produção.',tag:'Operação',items:[
    {key:'produtos',label:'Produtos',href:'/interno/produtos/',description:'Cadastro mestre único de produtos e serviços.',icon:ICONS.produtos,roles:MANAGEMENT_ROLES},
    {key:'insumos',label:'Insumos',href:'/interno/insumos/',description:'Produtos habilitados para uso em composições.',icon:ICONS.insumos,roles:MANAGEMENT_ROLES},
    {key:'fornecedores',label:'Fornecedores',href:'/interno/fornecedores/',description:'Cadastro e relacionamento com fornecedores.',icon:ICONS.fornecedores,roles:MANAGEMENT_ROLES},
    {key:'catalogos-fornecedores',label:'Catálogos de fornecedores',href:'/interno/fornecedores/catalogo/',description:'Importação, conferência e vínculo de catálogos de fornecedores.',icon:ICONS.catalogoFornecedor,roles:MANAGEMENT_ROLES},
    {key:'categorias',label:'Categorias',href:'/interno/categorias/',description:'Famílias, categorias e classificação do catálogo.',icon:ICONS.categorias,roles:MANAGEMENT_ROLES},
    {key:'segmentos',label:'Segmentos',href:'/interno/segmentos/',description:'Segmentação comercial e organização por público.',icon:ICONS.segmentos,roles:MANAGEMENT_ROLES},
    {key:'organizacao',label:'Organização do catálogo',href:'/interno/catalogo/',description:'Visão estrutural e organização do catálogo interno.',icon:ICONS.organizacao,roles:MANAGEMENT_ROLES},
    {key:'composicao-custos',label:'Composição e custos',href:'/interno/composicao-custos/',description:'Componentes, insumos, custos e composição dos itens.',icon:ICONS.custos,roles:MANAGEMENT_ROLES},
    {key:'precificacao-impressoes',label:'Precificação de impressões',href:'/interno/precificacao-impressoes/',description:'Referências e cálculo comercial para impressões.',icon:ICONS.precificacao,roles:MANAGEMENT_ROLES},
    {key:'configuracoes-producao',label:'Configurações de produção',href:'/interno/configuracoes-producao/',description:'Parâmetros técnicos e regras usadas na produção.',icon:ICONS.producao,roles:MANAGEMENT_ROLES},
    {key:'midias-produtos',label:'Mídias de produtos',href:'/interno/midias-produtos/',description:'Fotos e mídias associadas aos produtos e serviços.',icon:ICONS.midias,roles:MANAGEMENT_ROLES},
    {key:'portfolio',label:'Portfólio',href:'/interno/portfolio/',description:'Biblioteca de trabalhos reais e materiais do portfólio.',icon:ICONS.portfolio,roles:MANAGEMENT_ROLES},
    {key:'simulador-bobina',label:'Simulador de Bobina',href:'/interno/simulador-bobina/',description:'Encaixe, metragem, área, custo e revenda de materiais em bobina.',icon:ICONS.simulador}
  ]},
  {id:'operacao',label:'Operação e equipe',description:'Rotinas, gestão, treinamento, marketing e execução diária da loja.',tag:'Equipe',items:[
    {key:'gestao',label:'Gestão',href:'/interno/gestao/',description:'Prioridades, acompanhamento gerencial e visão da operação.',icon:ICONS.gestao},
    {key:'rotinas',label:'Centro operacional',href:'/interno/rotinas/',description:'Tarefas, calendário, rotinas e acompanhamento do trabalho.',icon:ICONS.rotinas},
    {key:'operacao',label:'Rotina operacional',href:'/interno/operacao/',description:'Checklist de abertura, atendimento, cobertura e fechamento.',icon:ICONS.operacao},
    {key:'integracao-equipe',label:'Integração da equipe',href:'/interno/integracao/',description:'Onboarding e checklist do primeiro dia de funcionários.',icon:ICONS.equipe},
    {key:'treinamento',label:'Treinamento',href:'/interno/treinamento/',description:'Materiais e rotinas de capacitação da equipe.',icon:ICONS.treinamento},
    {key:'formularios',label:'Formulários',href:'/interno/formularios/',description:'Formulários internos de apoio à operação.',icon:ICONS.formularios},
    {key:'marketing',label:'Marketing',href:'/interno/marketing/',description:'Conteúdo, calendário editorial e comunicação.',icon:ICONS.marketing},
    {key:'vitrine-campanhas',label:'Vitrine & Campanhas',href:'/interno/vitrine-campanhas/',description:'Banners, destaques e campanhas do site público.',icon:ICONS.vitrine,roles:MANAGEMENT_ROLES},
    {key:'vitrine-aprovacoes',label:'Central de Aprovações',href:'/interno/vitrine-aprovacoes/',description:'Propostas, previews, comentários e decisões da vitrine.',icon:ICONS.aprovacoes,roles:MANAGEMENT_ROLES}
  ]},
  {id:'sistema',label:'Conhecimento e sistema',description:'Conhecimento operacional, evolução e integrações técnicas.',tag:'Croma Hub',items:[
    {key:'copiloto',label:'Copiloto Croma',href:'/interno/copiloto/',description:'Insights, decisões, roadmap, tarefas e memória operacional.',icon:ICONS.copiloto},
    {key:'pesquisa',label:'P&D e conhecimento',href:'/interno/pesquisa-desenvolvimento/',description:'Fichas técnicas, testes, materiais, problemas e soluções.',icon:ICONS.pesquisa},
    {key:'evolucao',label:'Evolução Croma Hub',href:'/interno/evolucao-croma-hub/',description:'Roadmap vivo, prioridades, entregas e melhorias do sistema.',icon:ICONS.evolucao},
    {key:'bling',label:'Integração Bling',href:'/interno/bling/',description:'Conexão, sincronização, diagnóstico e controles do ERP.',icon:ICONS.bling,roles:OWNER_ROLE}
  ]}
];

export function iconSvg(body,className=''){
  return `<svg${className?` class="${className}"`:''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function canAccess(item,role){return !item.roles||item.roles.includes(role)}

export function visibleGroups(role){
  return INTERNAL_GROUPS.map(group=>({...group,items:group.items.filter(item=>canAccess(item,role))})).filter(group=>group.items.length);
}

export function activeModuleKey(pathname=location.pathname){
  const path=(pathname.replace(/\/+$/,'')||'/')+'/';
  const items=INTERNAL_GROUPS.flatMap(group=>group.items).filter(item=>path.startsWith(item.href));
  return items.sort((a,b)=>b.href.length-a.href.length)[0]?.key||null;
}

export function renderModuleDirectory(container,role,query=''){
  if(!container)return;
  const term=String(query||'').trim().toLocaleLowerCase('pt-BR');
  const groups=visibleGroups(role).map(group=>({...group,items:group.items.filter(item=>!term||`${item.label} ${item.description} ${group.label}`.toLocaleLowerCase('pt-BR').includes(term))})).filter(group=>group.items.length);
  container.innerHTML=groups.length?groups.map(group=>`<section class="category" data-module-group="${group.id}"><div class="category-head"><div><h2>${group.label}</h2><p>${group.description}</p></div><span class="tag">${group.tag}</span></div><div class="internal-grid">${group.items.map(item=>`<a class="module" href="${item.href}" data-module-key="${item.key}"><span class="visual">${iconSvg(item.icon)}</span><h3>${item.label}</h3><p>${item.description}</p><span class="go">Abrir →</span></a>`).join('')}</div></section>`).join(''):`<section class="module-empty"><strong>Nenhuma funcionalidade encontrada.</strong><span>Tente outro termo de busca.</span></section>`;
}
