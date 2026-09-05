import { supabase } from './croma-supabase.js';

const FALLBACK_DATA = {
  categorias: ['Todos', 'Comunicação Visual', 'Gráfica', 'Eventos', 'Papelaria', 'Presentes', 'Eletrônicos', 'Digital'],
  itens: []
};

const DEFAULT_HOME_LIMIT = 8;

function asMeta(row) {
  return row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
}

function mapProduct(row) {
  const meta = asMeta(row);
  return {
    id: meta.slug || row.sku || row.id,
    sourceId: row.id,
    tipo: 'produto',
    nome: row.nome,
    categoria: row.categoria || 'Outros',
    descricao: row.descricao || '',
    icone: meta.icone || '◼',
    imagem: meta.imagem || meta.image_url || meta.imagem_principal || '',
    href: meta.href || `/produtos/?id=${encodeURIComponent(row.id)}`,
    destaques: Array.isArray(meta.destaques) ? meta.destaques : [],
    quantidadePreco: Number(meta.quantidadePreco || 1),
    precoVenda: Number(row.preco || 0) || null,
    homeFeatured: meta.home_featured === true || meta.featured_home === true,
    homeOrder: Number(meta.home_order ?? meta.featured_order ?? 9999)
  };
}

function mapService(row) {
  const meta = asMeta(row);
  const slug = row.slug || meta.slug || row.id;
  const preco = Number(row.preco ?? row.preco_base ?? row.price ?? meta.preco ?? 0) || null;
  return {
    id: slug,
    sourceId: row.id,
    tipo: 'servico',
    nome: row.nome || row.name || row.titulo || 'Serviço Croma',
    categoria: row.categoria || row.category || meta.categoria || 'Serviços',
    descricao: row.descricao || row.description || meta.descricao || '',
    icone: meta.icone || '◆',
    imagem: row.image_url || row.imagem || meta.imagem || meta.image_url || meta.imagem_principal || '',
    href: meta.href || (slug ? `/servicos/${slug}/` : '/servicos/'),
    destaques: Array.isArray(meta.destaques) ? meta.destaques : [],
    quantidadePreco: Number(meta.quantidadePreco || 1),
    precoVenda: preco,
    homeFeatured: meta.home_featured === true || meta.featured_home === true,
    homeOrder: Number(meta.home_order ?? meta.featured_order ?? 9999)
  };
}

function sortHome(items) {
  return [...items].sort((a, b) => {
    if (a.homeFeatured !== b.homeFeatured) return a.homeFeatured ? -1 : 1;
    if (a.homeOrder !== b.homeOrder) return a.homeOrder - b.homeOrder;
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

async function catalogoSupabase() {
  const { data, error } = await supabase
    .from('products')
    .select('id,sku,nome,categoria,descricao,unidade,preco,ativo,published_on_site,metadata')
    .eq('ativo', true)
    .eq('published_on_site', true)
    .order('categoria')
    .order('nome');

  if (error) throw error;
  if (!data?.length) throw new Error('Catálogo sem produtos publicados.');

  const itens = data.map(mapProduct);
  const categorias = ['Todos', ...new Set(itens.map(item => item.categoria).filter(Boolean))];
  return { categorias, itens };
}

async function catalogoLocal() {
  const response = await fetch('/data/catalogo.json', { cache: 'no-store' });
  if (!response.ok) throw new Error(`Falha ao carregar fallback: ${response.status}`);
  return response.json();
}

async function carregarProdutosHome(limit = DEFAULT_HOME_LIMIT) {
  const { data, error } = await supabase
    .from('products')
    .select('id,sku,nome,categoria,descricao,preco,ativo,published_on_site,metadata')
    .eq('ativo', true)
    .eq('published_on_site', true)
    .limit(80);

  if (error) throw error;
  return sortHome((data || []).map(mapProduct)).slice(0, limit);
}

async function tryServicesQuery(selectExpr) {
  return supabase
    .from('services')
    .select(selectExpr)
    .limit(80);
}

async function carregarServicosHome(limit = DEFAULT_HOME_LIMIT) {
  const attempts = [
    'id,slug,nome,categoria,descricao,preco,ativo,published_on_site,image_url,metadata',
    'id,slug,nome,categoria,descricao,preco,ativo,image_url,metadata',
    'id,slug,nome,categoria,descricao,preco,ativo,metadata',
    'id,slug,nome,categoria,descricao,ativo,metadata',
    '*'
  ];

  let lastError = null;
  for (const selectExpr of attempts) {
    const { data, error } = await tryServicesQuery(selectExpr);
    if (error) {
      lastError = error;
      continue;
    }
    const ativos = (data || []).filter(row => row.ativo !== false && row.active !== false && row.published_on_site !== false);
    return sortHome(ativos.map(mapService)).slice(0, limit);
  }
  throw lastError || new Error('Serviços indisponíveis.');
}

export async function carregarVitrineHome(limit = DEFAULT_HOME_LIMIT) {
  const [productsResult, servicesResult] = await Promise.allSettled([
    carregarProdutosHome(limit),
    carregarServicosHome(limit)
  ]);

  const produtos = productsResult.status === 'fulfilled' ? productsResult.value : [];
  const servicos = servicesResult.status === 'fulfilled' ? servicesResult.value : [];

  if (productsResult.status === 'rejected') console.warn('Não foi possível carregar produtos da vitrine.', productsResult.reason);
  if (servicesResult.status === 'rejected') console.warn('Não foi possível carregar serviços da vitrine.', servicesResult.reason);

  return { produtos, servicos };
}

export async function carregarCatalogo() {
  try {
    return await catalogoSupabase();
  } catch (supabaseError) {
    console.warn('Catálogo principal indisponível; usando cópia local.', supabaseError);
    try {
      return await catalogoLocal();
    } catch (fallbackError) {
      console.warn('Cópia local do catálogo indisponível.', fallbackError);
      return FALLBACK_DATA;
    }
  }
}
