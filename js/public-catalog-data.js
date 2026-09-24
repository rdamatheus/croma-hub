import { supabase } from './croma-supabase.js';

const PAGE_SIZE=1000;

async function fetchPaged(build){
  const rows=[];
  for(let from=0;;from+=PAGE_SIZE){
    const {data,error}=await build().range(from,from+PAGE_SIZE-1);
    if(error)throw error;
    const chunk=data||[];
    rows.push(...chunk);
    if(chunk.length<PAGE_SIZE)break;
  }
  return rows;
}


function sanitizeCatalogSearch(value){
  return String(value||'').trim().replace(/[,%()]/g,' ').replace(/\s+/g,' ').slice(0,80);
}

export async function loadPublicCatalogMeta(scope,{requirePublished=scope==='servico'}={}){
  const [familiesResult,categoriesResult,statsResult]=await Promise.all([
    supabase.from('catalog_families')
      .select('id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt')
      .eq('catalog_scope',scope).eq('ativo',true).order('ordem').order('nome'),
    supabase.from('catalog_categories')
      .select('id,parent_id,family_id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt,public_visible,show_in_navigation,featured_home')
      .eq('catalog_scope',scope).eq('ativo',true).eq('public_visible',true).order('ordem').order('nome'),
    supabase.rpc('public_catalog_category_stats',{p_scope:scope,p_require_published:!!requirePublished})
  ]);
  if(familiesResult.error)throw familiesResult.error;
  if(categoriesResult.error)throw categoriesResult.error;
  if(statsResult.error)throw statsResult.error;
  const counts=new Map((statsResult.data||[]).map(x=>[x.category_id,{direct:Number(x.direct_count||0),subtree:Number(x.subtree_count||0)}]));
  return {families:familiesResult.data||[],categories:categoriesResult.data||[],counts};
}

export async function loadPublicCatalogPage(scope,{
  requirePublished=scope==='servico',
  categoryIds=[],
  search='',
  page=1,
  pageSize=48
}={}){
  const size=Math.max(1,Math.min(100,Number(pageSize)||48));
  const current=Math.max(1,Number(page)||1);
  const from=(current-1)*size;
  let query=supabase.from('public_catalog_products')
    .select('id,nome,sku,slug,descricao,short_description,preco,catalog_category_id,product_type,ativo,published_on_site,is_sellable,is_input,metadata,child_count,commercial_min_price',{count:'exact'})
    .eq('product_type',scope);
  if(requirePublished)query=query.eq('published_on_site',true);
  if(Array.isArray(categoryIds)&&categoryIds.length)query=query.in('catalog_category_id',categoryIds);
  const clean=sanitizeCatalogSearch(search);
  if(clean)query=query.or(`nome.ilike.%${clean}%,sku.ilike.%${clean}%`);
  const {data,error,count}=await query.order('nome').range(from,from+size-1);
  if(error)throw error;
  return {items:data||[],total:Number(count||0),page:current,pageSize:size};
}

export async function loadPublicCatalogItems(scope,{
  requirePublished=scope==='servico',
  categoryIds=[],
  pageSize=100
}={}){
  const out=[];
  let page=1,total=Infinity;
  while(out.length<total){
    const result=await loadPublicCatalogPage(scope,{requirePublished,categoryIds,page,pageSize});
    out.push(...result.items);
    total=result.total;
    if(!result.items.length||out.length>=total)break;
    page++;
  }
  return out;
}

export async function loadPublicCatalogItem(scope,ref,{requirePublished=scope==='servico'}={}){
  const value=String(ref||'').trim();
  if(!value)return null;
  let query=supabase.from('public_catalog_products')
    .select('id,nome,sku,slug,descricao,short_description,preco,catalog_category_id,product_type,ativo,published_on_site,is_sellable,is_input,metadata,child_count,commercial_min_price')
    .eq('product_type',scope);
  if(requirePublished)query=query.eq('published_on_site',true);
  const isUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  query=isUuid?query.eq('id',value):query.eq('slug',value);
  const {data,error}=await query.limit(1).maybeSingle();
  if(error)throw error;
  return data||null;
}

export async function loadPublicCatalog(scope,{requirePublished=scope==='servico'}={}){
  const buildItems=()=>{
    let query=supabase.from('public_catalog_products')
      .select('id,nome,sku,slug,descricao,short_description,preco,catalog_category_id,product_type,ativo,published_on_site,is_sellable,is_input,metadata,child_count,commercial_min_price')
      .eq('product_type',scope);
    if(requirePublished)query=query.eq('published_on_site',true);
    return query.order('nome');
  };

  const [familiesResult,categoriesResult,items]=await Promise.all([
    supabase.from('catalog_families')
      .select('id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt')
      .eq('catalog_scope',scope)
      .eq('ativo',true)
      .order('ordem')
      .order('nome'),
    supabase.from('catalog_categories')
      .select('id,parent_id,family_id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt,public_visible,show_in_navigation,featured_home')
      .eq('catalog_scope',scope)
      .eq('ativo',true)
      .eq('public_visible',true)
      .order('ordem')
      .order('nome'),
    fetchPaged(buildItems)
  ]);

  if(familiesResult.error)throw familiesResult.error;
  if(categoriesResult.error)throw categoriesResult.error;

  const families=familiesResult.data||[];
  const categories=categoriesResult.data||[];
  const visibleCategoryIds=new Set(categories.map(c=>c.id));
  const publicItems=(items||[]).filter(item=>item.catalog_category_id&&visibleCategoryIds.has(item.catalog_category_id));

  return {families,categories,items:publicItems};
}

export function categoryChildren(categories,parentId){
  return categories.filter(c=>c.parent_id===parentId).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}

export function rootCategories(categories,familyId){
  return categories.filter(c=>c.family_id===familyId&&!c.parent_id).sort((a,b)=>(a.ordem||0)-(b.ordem||0)||String(a.nome).localeCompare(String(b.nome),'pt-BR'));
}

export function descendantIds(categories,categoryId){
  const out=new Set([categoryId]);
  let changed=true;
  while(changed){
    changed=false;
    for(const c of categories){
      if(c.parent_id&&out.has(c.parent_id)&&!out.has(c.id)){
        out.add(c.id);
        changed=true;
      }
    }
  }
  return out;
}

export function categoryPath(categories,families,categoryId){
  const byId=new Map(categories.map(c=>[c.id,c]));
  const cat=byId.get(categoryId);
  if(!cat)return[];
  const path=[];
  let current=cat;
  let guard=0;
  while(current&&guard++<4){
    path.unshift(current);
    current=current.parent_id?byId.get(current.parent_id):null;
  }
  const family=families.find(f=>f.id===cat.family_id)||null;
  return family?[family,...path]:path;
}

export async function loadPrimaryMedia(productIds){
  const map=new Map();
  for(let i=0;i<productIds.length;i+=180){
    const chunk=productIds.slice(i,i+180);
    if(!chunk.length)continue;
    const {data,error}=await supabase.from('product_media')
      .select('product_id,url,alt_text,is_primary,ordem,ativo,kind')
      .in('product_id',chunk)
      .eq('ativo',true)
      .eq('kind','image')
      .order('is_primary',{ascending:false})
      .order('ordem');
    if(error)throw error;
    for(const row of data||[])if(row.product_id&&row.url&&!map.has(row.product_id))map.set(row.product_id,row);
  }
  return map;
}
