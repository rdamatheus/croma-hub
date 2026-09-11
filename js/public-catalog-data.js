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
