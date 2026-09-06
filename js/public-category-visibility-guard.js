import { supabase } from './croma-supabase.js';

async function loadVisible(){
  const {data,error}=await supabase.from('catalog_categories').select('id,slug,public_visible').eq('ativo',true);
  if(error)throw error;
  return new Map((data||[]).map(c=>[c.slug,{id:c.id,visible:!!c.public_visible}]));
}

function applyGuard(map){
  document.querySelectorAll('[data-category-slug]').forEach(el=>{
    const slug=el.dataset.categorySlug;
    if(slug&&map.has(slug)&&!map.get(slug).visible)el.remove();
  });
  document.querySelectorAll('a[href*="categoria="]').forEach(a=>{
    try{const u=new URL(a.href,location.origin),slug=u.searchParams.get('categoria');if(slug&&map.has(slug)&&!map.get(slug).visible)a.remove()}catch{}
  });
  const current=new URL(location.href).searchParams.get('categoria');
  if(current&&map.has(current)&&!map.get(current).visible){
    const u=new URL(location.href);u.searchParams.delete('categoria');history.replaceState({},'',u.pathname+(u.search?u.search:''));location.reload();
  }
}

try{
  const map=await loadVisible();
  applyGuard(map);
  new MutationObserver(()=>applyGuard(map)).observe(document.body,{childList:true,subtree:true});
}catch(e){console.error('public_category_visibility_guard_error',e)}
