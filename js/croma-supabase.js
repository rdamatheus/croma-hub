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

export async function getCustomerContext({claim=true}={}){
  const user=await getSessionUser();
  if(!user)return{user:null,customer:null,customerId:null,status:'signed_out',message:null};

  const readProfile=async()=>{
    const {data,error}=await supabase
      .from('customer_profiles')
      .select('id,nome,email,cpf,telefone,data_nascimento,auth_user_id')
      .eq('auth_user_id',user.id)
      .maybeSingle();
    if(error)throw error;
    return data||null;
  };

  let customer=await readProfile();
  let status=customer?'linked':'not_linked';
  let message=null;

  if(!customer&&claim){
    const {data,error}=await supabase.rpc('claim_customer_profile');
    if(error)throw error;
    const result=Array.isArray(data)?data[0]:data;
    status=result?.status||status;
    message=result?.message||null;
    if(result?.customer_id)customer=await readProfile();
  }

  return{user,customer,customerId:customer?.id||null,status,message};
}

export function onlyDigits(value=''){
  return String(value).replace(/\D/g,'');
}
