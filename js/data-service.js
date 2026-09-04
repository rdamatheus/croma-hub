import { supabase } from './croma-supabase.js';

const FALLBACK_DATA = {
  categorias: ['Todos', 'Comunicação Visual', 'Gráfica', 'Eventos', 'Papelaria', 'Presentes', 'Eletrônicos', 'Digital'],
  itens: []
};

function mapProduct(row) {
  const meta = row.metadata || {};
  return {
    id: meta.slug || row.sku || row.id,
    nome: row.nome,
    categoria: row.categoria || 'Outros',
    descricao: row.descricao || '',
    icone: meta.icone || '◼',
    imagem: meta.imagem || '',
    href: meta.href || '',
    destaques: Array.isArray(meta.destaques) ? meta.destaques : [],
    quantidadePreco: Number(meta.quantidadePreco || 1),
    precoVenda: Number(row.preco || 0) || null
  };
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
