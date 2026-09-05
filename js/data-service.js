import { supabase } from './croma-supabase.js';

const FALLBACK_DATA={categorias:['Todos','Comunicação Visual','Gráfica','Eventos','Papelaria','Presentes','Eletrônicos','Digital'],itens:[]};
const DEFAULT_HOME_LIMIT=8;
const asMeta=row=>row&&row.metadata&&typeof row.metadata==='object'?row.metadata:{};

function mapCanonical(row,mediaUrl=''){
  const meta=asMeta(row),isService=row.product_type==='servico',slug=row.slug||meta.slug||row.sku||row.id;
  return{
    id:slug,sourceId:row.id,tipo:isService?'servico':'produto',nome:row.nome,
    categoria:row.categoria||(isService?'Serviços':'Produtos'),
    descricao:row.short_description||row.descricao||'',icone:meta.icone||(isService?'◆':'◼'),
    imagem:mediaUrl||meta.imagem||meta.image_url||meta.imagem_principal||'',
    href:meta.href||(isService?'/servicos/':'/produtos/'),
    destaques:Array.isArray(meta.destaques)?meta.destaques:[],quantidadePreco:Number(meta.quantidadePreco||1),
    precoVenda:Number(row.preco||0)||null,
    homeFeatured:meta.home_featured===true||meta.featured_home===true,
    homeOrder:Number(meta.home_order??meta.featured_order??9999)
  };
}

function sortHome(items){return[...items].sort((a,b)=>{if(a.homeFeatured!==b.homeFeatured)return a.homeFeatured?-1:1;if((a.homeOrder??9999)!==(b.homeOrder??9999))return(a.homeOrder??9999)-(b.homeOrder??9999);return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')})}

async function mediaMap(productIds){
  if(!productIds.length)return new Map();
  const out=new Map();
  for(let i=0;i<productIds.length;i+=200){
    const ids=productIds.slice(i,i+200);
    const{data,error}=await supabase.from('product_media').select('product_id,url,is_primary,ordem,ativo,kind').in('product_id',ids).eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem');
    if(error)throw error;
    for(const row of data||[])if(!out.has(row.product_id)&&row.url)out.set(row.product_id,row.url);
  }
  return out;
}

async function catalogoSupabase(){
  const{data,error}=await supabase.from('products').select('id,sku,nome,categoria,descricao,short_description,unidade,preco,ativo,published_on_site,metadata,slug,product_type').eq('ativo',true).eq('published_on_site',true).order('categoria').order('nome');
  if(error)throw error;if(!data?.length)throw new Error('Catálogo sem itens publicados.');
  const mm=await mediaMap(data.map(x=>x.id));
  const itens=data.map(row=>mapCanonical(row,mm.get(row.id)||''));
  const categorias=['Todos',...new Set(itens.map(item=>item.categoria).filter(Boolean))];return{categorias,itens};
}

async function catalogoLocal(){const response=await fetch('/data/catalogo.json',{cache:'no-store'});if(!response.ok)throw new Error(`Falha ao carregar fallback: ${response.status}`);return response.json()}

async function carregarHomePorTipo(tipo,limit=DEFAULT_HOME_LIMIT){
  // A Home usa a base oficial ativa. Publicação completa do catálogo continua controlada separadamente.
  const{data,error}=await supabase.from('products').select('id,sku,nome,categoria,descricao,short_description,preco,ativo,published_on_site,metadata,slug,product_type').eq('ativo',true).eq('product_type',tipo).limit(500);
  if(error)throw error;
  const rows=data||[],mm=await mediaMap(rows.map(x=>x.id));
  const withImage=rows.map(row=>mapCanonical(row,mm.get(row.id)||'')).filter(item=>Boolean(item.imagem));
  return sortHome(withImage).slice(0,limit);
}

async function carregarProdutosHome(limit=DEFAULT_HOME_LIMIT){return carregarHomePorTipo('produto',limit)}
async function carregarServicosHome(limit=DEFAULT_HOME_LIMIT){return carregarHomePorTipo('servico',limit)}

export async function carregarVitrineHome(limit=DEFAULT_HOME_LIMIT){
  const[productsResult,servicesResult]=await Promise.allSettled([carregarProdutosHome(limit),carregarServicosHome(limit)]);
  const produtos=productsResult.status==='fulfilled'?productsResult.value:[],servicos=servicesResult.status==='fulfilled'?servicesResult.value:[];
  if(productsResult.status==='rejected')console.warn('Não foi possível carregar produtos da vitrine.',productsResult.reason);
  if(servicesResult.status==='rejected')console.warn('Não foi possível carregar serviços da vitrine.',servicesResult.reason);
  return{produtos,servicos};
}

export async function carregarCatalogo(){try{return await catalogoSupabase()}catch(supabaseError){console.warn('Catálogo principal indisponível; usando cópia local.',supabaseError);try{return await catalogoLocal()}catch(fallbackError){console.warn('Cópia local do catálogo indisponível.',fallbackError);return FALLBACK_DATA}}}
