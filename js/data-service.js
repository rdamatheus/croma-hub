import { supabase } from './croma-supabase.js';

const FALLBACK_DATA = {
  categorias: ['Todos', 'Comunicação Visual', 'Gráfica', 'Eventos', 'Papelaria', 'Presentes', 'Eletrônicos', 'Digital'],
  itens: []
};

const DEFAULT_HOME_LIMIT = 8;

function asMeta(row) {
  return row && row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
}

function mapCanonical(row) {
  const meta = asMeta(row);
  const isService = row.product_type === 'servico';
  const slug = row.slug || meta.slug || row.sku || row.id;
  return {
    id: slug,
    sourceId: row.id,
    tipo: isService ? 'servico' : 'produto',
    nome: row.nome,
    categoria: row.categoria || (isService ? 'Serviços' : 'Produtos'),
    descricao: row.short_description || row.descricao || '',
    icone: meta.icone || (isService ? '◆' : '◼'),
    imagem: meta.imagem || meta.image_url || meta.imagem_principal || '',
    href: meta.href || (isService ? `/servicos/${slug}/` : '/produtos/'),
    destaques: Array.isArray(meta.destaques) ? meta.destaques : [],
    quantidadePreco: Number(meta.quantidadePreco || 1),
    precoVenda: Number(row.preco || 0) || null,
    homeFeatured: meta.home_featured === true || meta.featured_home === true,
    homeOrder: Number(meta.home_order ?? meta.featured_order ?? 9999)
  };
}

function mapBlingProduct(row) {
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const stock = Number(payload?.estoque?.saldoVirtualTotal || 0);
  return {
    id: row.external_id || row.sku || row.id,
    sourceId: row.linked_product_id || row.id,
    integrationId: row.id,
    tipo: 'produto',
    nome: row.name || payload.nome || 'Produto Croma',
    categoria: 'Papelaria & Presentes',
    descricao: payload.descricaoCurta || '',
    imagem: payload.imagemURL || '',
    href: '/produtos/',
    destaques: stock > 0 ? ['Disponível na loja'] : [],
    quantidadePreco: 1,
    precoVenda: Number(row.price || payload.preco || 0) || null,
    stock,
    hasImage: Boolean(payload.imagemURL),
    linked: Boolean(row.linked_product_id)
  };
}

function sortHome(items) {
  return [...items].sort((a, b) => {
    if (a.homeFeatured !== b.homeFeatured) return a.homeFeatured ? -1 : 1;
    if ((a.homeOrder ?? 9999) !== (b.homeOrder ?? 9999)) return (a.homeOrder ?? 9999) - (b.homeOrder ?? 9999);
    return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
  });
}

async function catalogoSupabase() {
  const { data, error } = await supabase
    .from('products')
    .select('id,sku,nome,categoria,descricao,short_description,unidade,preco,ativo,published_on_site,metadata,slug,product_type')
    .eq('ativo', true)
    .eq('published_on_site', true)
    .order('categoria')
    .order('nome');

  if (error) throw error;
  if (!data?.length) throw new Error('Catálogo sem itens publicados.');

  const itens = data.map(mapCanonical);
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
    .from('integration_catalog_items')
    .select('id,external_id,sku,name,price,status,payload,linked_product_id,last_refreshed_at')
    .eq('provider', 'bling')
    .eq('entity_type', 'product')
    .eq('status', 'A')
    .order('last_refreshed_at', { ascending: false })
    .limit(250);

  if (error) throw error;

  const produtos = (data || [])
    .map(mapBlingProduct)
    .filter(item => {
      const raw = (data || []).find(row => row.id === item.integrationId);
      const tipo = raw?.payload?.tipo;
      return (!tipo || tipo === 'P') && item.precoVenda;
    })
    .sort((a, b) => {
      if (a.linked !== b.linked) return a.linked ? -1 : 1;
      if (a.hasImage !== b.hasImage) return a.hasImage ? -1 : 1;
      if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });

  const withImageAndStock = produtos.filter(item => item.hasImage && item.stock > 0);
  const selected = [...withImageAndStock, ...produtos.filter(item => !withImageAndStock.includes(item))];
  return selected.slice(0, limit);
}

async function carregarServicosHome(limit = DEFAULT_HOME_LIMIT) {
  const { data, error } = await supabase
    .from('products')
    .select('id,sku,nome,categoria,descricao,short_description,preco,ativo,published_on_site,metadata,slug,product_type')
    .eq('ativo', true)
    .eq('published_on_site', true)
    .eq('product_type', 'servico')
    .limit(80);

  if (error) throw error;
  return sortHome((data || []).map(mapCanonical)).slice(0, limit);
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
