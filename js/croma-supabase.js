import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm';

export const SUPABASE_URL = 'https://xtlubocepsbqanrjabog.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nCf37VOBL3JpxzL-SxNXxQ_VuxlKyAV';
export const STORAGE_BUCKET = 'croma-arquivos';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

window.__cromaSupabase = supabase;
if(location.pathname.replace(/\/+$/,'/')==='/interno/produtos/'){
  queueMicrotask(()=>import('/js/catalog-product-enhancer.js?v=20260830-1'));
}

export async function getSessionUser(){
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session?.user || null;
}

export async function requireUser(next = location.href){
  const user = await getSessionUser();
  if (user) return user;
  location.href = `/conta/?next=${encodeURIComponent(next)}`;
  return null;
}

export function onlyDigits(value=''){
  return String(value).replace(/\D/g,'');
}
