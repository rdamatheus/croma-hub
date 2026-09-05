import './croma-brand.js';
import './interno-polish.js';
import { supabase } from './croma-supabase.js';

if (location.pathname.startsWith('/interno/produtos')) {
  import('./interno-produtos-supplier-enhancer.js?v=20260905-4').catch(console.error);
  import('./supplier-catalog-importer.js?v=20260905-4').catch(console.error);
  import('./supplier-catalog-browser.js?v=20260905-1').catch(console.error);
  import('./bling-product-catalog-v2.js?v=20260905-1').catch(console.error);
  import('./interno-produtos-modal.js').catch(console.error);
}

export const INTERNAL_ROLES = ['owner','manager','equipe'];

export async function getStaffSession(){
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if(userError || !userData.user) return { user:null, profile:null };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id,nome,cargo,role,ativo')
    .eq('id', userData.user.id)
    .maybeSingle();

  if(profileError) throw profileError;
  if(!profile?.ativo || !INTERNAL_ROLES.includes(profile.role)) return { user:userData.user, profile:null };
  return { user:userData.user, profile };
}

export async function requireStaff(options={}){
  const { roles=INTERNAL_ROLES, redirect=true } = options;
  const session = await getStaffSession();
  const allowed = session.profile && roles.includes(session.profile.role);
  if(allowed) return session;
  if(redirect){
    const next = location.pathname + location.search + location.hash;
    location.href = `/interno/?next=${encodeURIComponent(next)}`;
  }
  return null;
}

export async function protectInternalPage(options={}){
  const session = await requireStaff(options);
  if(session) document.body.hidden=false;
  return session;
}

export async function signInStaff(email,password){
  const { error } = await supabase.auth.signInWithPassword({ email:email.trim(), password });
  if(error) throw error;
  const session = await getStaffSession();
  if(!session.profile){
    await supabase.auth.signOut();
    throw new Error('Conta sem acesso à área interna.');
  }
  return session;
}

export async function signOutStaff(){
  await supabase.auth.signOut();
}

export function roleLabel(role){
  return ({owner:'Proprietário',manager:'Gerência',equipe:'Equipe'})[role] || role;
}
