import './croma-brand.js';
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
const currentPath=location.pathname.replace(/\/+$/,'/');
if(currentPath==='/interno/segmentos/'){
  queueMicrotask(()=>import('/js/catalog-admin-list-filters.js?v=20260831-1'));
}
if(currentPath==='/interno/produtos/'){
  const productParams=new URLSearchParams(location.search);
  if(productParams.get('modo')==='ficha'&&productParams.get('produto')==='e63f590f-df39-4450-bcfd-8beaf781e119'){
    queueMicrotask(()=>import('/js/interno-produtos-panfletos-configurator-v1.js?v=20260930-1').catch(error=>console.error('Falha ao carregar configurador de panfletos',error)));
  }
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
