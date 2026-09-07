import { loadPublicCatalog, loadPrimaryMedia, categoryPath } from './public-catalog-data.js';

const DEFAULT_HOME_LIMIT=8;
const asMeta=row=>row&&row.metadata&&typeof row.metadata==='object'?row.metadata:{};

function stripHtml(value){
  return String(value??'').replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,' ').replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
}

function mapCanonical(row,mediaUrl='',taxonomy={families:[],categories:[]}){
  const meta=asMeta(row),isService=row.product_type==='servico',slug=row.slug||meta.slug||row.sku||row.id;
  const path=categoryPath(taxonomy.categories||[],taxonomy.families||[],row.catalog_category_id).map(x=>x.nome);
  return{
    id:slug,sourceId:row.id,tipo:isService?'servico':'produto',nome:row.nome,
    categoria:path.slice(1).join(' › ')||(isService?'Serviços':'Produtos'),
    descricao:stripHtml(row.short_description||row.descricao||''),icone:meta.icone||(isService?'◆':'◼'),
    imagem:mediaUrl||meta.imagem||meta.image_url||meta.imagem_principal||'',
    href:isService?`/servicos/?categoria=${encodeURIComponent((taxonomy.categories||[]).find(c=>c.id===row.catalog_category_id)?.slug||'')}`:'/produtos/',
    destaques:Array.isArray(meta.destaques)?meta.destaques:[],quantidadePreco:Number(meta.quantidadePreco||1),
    precoVenda:Number(row.preco||0)||null,
    homeFeatured:meta.home_featured===true||meta.featured_home===true,
    homeOrder:Number(meta.home_order??meta.featured_order??9999)
  };
}

function mapFamily(row){return{id:`family-${row.id}`,sourceId:row.id,tipo:'familia',nome:row.nome,categoria:'Serviços',descricao:stripHtml(row.descricao||''),imagem:row.image_url||'',href:`/servicos/?familia=${encodeURIComponent(row.slug)}`,destaques:[],quantidadePreco:1,precoVenda:null,homeFeatured:true,homeOrder:Number(row.ordem||9999)}}
function sortHome(items){return[...items].sort((a,b)=>{if(a.homeFeatured!==b.homeFeatured)return a.homeFeatured?-1:1;if((a.homeOrder??9999)!==(b.homeOrder??9999))return(a.homeOrder??9999)-(b.homeOrder??9999);return String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR')})}

async function mappedItems(scope){
  const taxonomy=await loadPublicCatalog(scope);
  const media=await loadPrimaryMedia(taxonomy.items.map(x=>x.id));
  return {taxonomy,items:taxonomy.items.map(row=>mapCanonical(row,media.get(row.id)?.url||'',taxonomy))};
}

export async function carregarVitrineHome(limit=DEFAULT_HOME_LIMIT){
  const [productsResult,servicesResult]=await Promise.allSettled([mappedItems('produto'),loadPublicCatalog('servico')]);
  const produtos=productsResult.status==='fulfilled'?sortHome(productsResult.value.items.filter(item=>Boolean(item.imagem))).slice(0,limit):[];
  const servicos=servicesResult.status==='fulfilled'?servicesResult.value.families.filter(f=>servicesResult.value.categories.some(c=>c.family_id===f.id)).map(mapFamily).slice(0,limit):[];
  if(productsResult.status==='rejected')console.warn('Não foi possível carregar produtos públicos da vitrine.',productsResult.reason);
  if(servicesResult.status==='rejected')console.warn('Não foi possível carregar famílias públicas de serviços.',servicesResult.reason);
  return{produtos,servicos};
}

export async function carregarCatalogo(){
  const [products,services]=await Promise.all([mappedItems('produto'),mappedItems('servico')]);
  const itens=[...products.items,...services.items];
  const categorias=['Todos',...new Set(itens.map(item=>item.categoria).filter(Boolean))];
  return{categorias,itens};
}
