import { supabase } from './croma-supabase.js';
import { requireStaff } from './interno-auth.js';

let staffPromise;
function ensureStaff(){
  staffPromise ||= requireStaff();
  return staffPromise;
}

export async function loadModuleState(moduleKey, fallback=[]){
  const staff = await ensureStaff();
  if(!staff) return fallback;
  const { data, error } = await supabase
    .from('internal_module_state')
    .select('data')
    .eq('module_key', moduleKey)
    .maybeSingle();
  if(error) throw error;
  return data?.data ?? fallback;
}

export async function saveModuleState(moduleKey, value){
  const staff = await ensureStaff();
  if(!staff) return;
  const { error } = await supabase
    .from('internal_module_state')
    .upsert({
      module_key: moduleKey,
      data: value,
      updated_by: staff.user.id,
      updated_at: new Date().toISOString()
    }, { onConflict:'module_key' });
  if(error) throw error;
}

export async function migrateLocalState(moduleKey, localStorageKey, fallback=[]){
  const cloud = await loadModuleState(moduleKey, null);
  if(cloud !== null) return cloud;
  let local = fallback;
  try {
    const raw = localStorage.getItem(localStorageKey);
    if(raw !== null) local = JSON.parse(raw);
  } catch {}
  await saveModuleState(moduleKey, local);
  return local;
}
