import { supabase } from './croma-supabase.js';
import { loadPrimaryMedia } from './public-catalog-data.js';

const publicItemFields='id,nome,sku,slug,descricao,short_description,preco,catalog_category_id,product_type,ativo,published_on_site,is_sellable,is_input,metadata,child_count,commercial_min_price';
const commercialCache=globalThis.__CROMA_COMMERCIAL_AREAS_CACHE__ ||= {
  areasPromise:null,
  areaPromises:new Map()
};

function cleanSearch(value){
  return String(value||'').trim().replace(/[,%()]/g,' ').replace(/\s+/g,' ').slice(0,80);
}

export async function loadCommercialAreas({refresh=false}={}){
  if(refresh){commercialCache.areasPromise=null;commercialCache.areaPromises.clear()}
  if(commercialCache.areasPromise)return commercialCache.areasPromise;
  const promise=(async()=>{
    const [areasResult,mappingResult,familiesResult]=await Promise.all([
      supabase.from('site_commercial_areas').select('id,slug,name,menu_label,description,public_path,sort_order,featured_home').eq('active',true).order('sort_order'),
      supabase.from('site_area_families').select('area_id,family_id,display_order,is_primary').order('display_order'),
      supabase.from('catalog_families').select('id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt').eq('ativo',true)
    ]);
    if(areasResult.error)throw areasResult.error;
    if(mappingResult.error)throw mappingResult.error;
    if(familiesResult.error)throw familiesResult.error;
    const familiesById=new Map((familiesResult.data||[]).map(f=>[f.id,f]));
    const mappings=mappingResult.data||[];
    return (areasResult.data||[]).map(area=>({
      ...area,
      families:mappings.filter(m=>m.area_id===area.id).map(m=>({
        ...familiesById.get(m.family_id),
        display_order:m.display_order,
        is_primary:m.is_primary
      })).filter(Boolean)
    }));
  })();
  commercialCache.areasPromise=promise;
  try{return await promise}catch(error){if(commercialCache.areasPromise===promise)commercialCache.areasPromise=null;throw error}
}

export async function loadCommercialActions(productIds=[]){
  const ids=[...new Set((productIds||[]).filter(Boolean))];
  const map=new Map();
  for(let i=0;i<ids.length;i+=180){
    const chunk=ids.slice(i,i+180);
    if(!chunk.length)continue;
    const {data,error}=await supabase.from('public_product_commercial_actions').select('product_id,commercial_action').in('product_id',chunk);
    if(error)throw error;
    for(const row of data||[])map.set(row.product_id,row.commercial_action);
  }
  return map;
}

export async function loadCommercialArea(slug,{itemLimit=32,refresh=false}={}){
  const limit=Math.max(1,Math.min(80,Number(itemLimit)||32));
  const key=`${slug}:${limit}`;
  if(refresh)commercialCache.areaPromises.delete(key);
  if(commercialCache.areaPromises.has(key))return commercialCache.areaPromises.get(key);
  const promise=(async()=>{
    const areas=await loadCommercialAreas();
    const area=areas.find(x=>x.slug===slug);
    if(!area)return null;
    const familyIds=area.families.map(f=>f.id).filter(Boolean);
    if(!familyIds.length)return {...area,categories:[],items:[],media:new Map(),actions:new Map()};
    const {data:categories,error:categoryError}=await supabase.from('catalog_categories')
      .select('id,parent_id,family_id,catalog_scope,nome,slug,descricao,ordem,ativo,image_url,image_alt,public_visible,show_in_navigation,featured_home')
      .in('family_id',familyIds).eq('ativo',true).eq('public_visible',true).order('ordem').order('nome');
    if(categoryError)throw categoryError;
    const categoryIds=(categories||[]).map(c=>c.id);
    let items=[];
    if(categoryIds.length){
      const {data,error}=await supabase.from('public_catalog_products').select(publicItemFields).in('catalog_category_id',categoryIds).order('nome').limit(limit);
      if(error)throw error;
      items=data||[];
    }
    const [media,actions]=await Promise.all([loadPrimaryMedia(items.map(x=>x.id)),loadCommercialActions(items.map(x=>x.id))]);
    return {...area,categories:categories||[],items,media,actions};
  })();
  commercialCache.areaPromises.set(key,promise);
  try{return await promise}catch(error){if(commercialCache.areaPromises.get(key)===promise)commercialCache.areaPromises.delete(key);throw error}
}

export async function searchCommercialCatalog(term,{limit=60}={}){
  const q=cleanSearch(term);
  if(!q)return {query:'',items:[],categories:[],families:[],media:new Map(),actions:new Map()};
  const {data:items,error}=await supabase.from('public_catalog_products')
    .select(publicItemFields)
    .or(`nome.ilike.%${q}%,sku.ilike.%${q}%,short_description.ilike.%${q}%`)
    .order('nome').limit(Math.max(1,Math.min(100,Number(limit)||60)));
  if(error)throw error;
  const rows=items||[];
  const categoryIds=[...new Set(rows.map(x=>x.catalog_category_id).filter(Boolean))];
  let categories=[];
  if(categoryIds.length){
    const result=await supabase.from('catalog_categories').select('id,parent_id,family_id,catalog_scope,nome,slug').in('id',categoryIds);
    if(result.error)throw result.error;
    categories=result.data||[];
  }
  const familyIds=[...new Set(categories.map(x=>x.family_id).filter(Boolean))];
  let families=[];
  if(familyIds.length){
    const result=await supabase.from('catalog_families').select('id,catalog_scope,nome,slug').in('id',familyIds);
    if(result.error)throw result.error;
    families=result.data||[];
  }
  const [media,actions]=await Promise.all([loadPrimaryMedia(rows.map(x=>x.id)),loadCommercialActions(rows.map(x=>x.id))]);
  return {query:q,items:rows,categories,families,media,actions};
}