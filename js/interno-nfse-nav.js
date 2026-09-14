import { supabase } from './croma-supabase.js';

async function install(){
  if(!/^\/interno\/?$/.test(location.pathname)||document.querySelector('[data-nfse-admin-link]'))return;
  const {data:userData}=await supabase.auth.getUser(); if(!userData?.user)return;
  const {data:profile}=await supabase.from('profiles').select('role,ativo').eq('id',userData.user.id).maybeSingle();
  if(!profile?.ativo||profile.role!=='owner')return;
  const grid=document.querySelector('.category .internal-grid'); if(!grid)return;
  const card=document.createElement('a'); card.className='module owner-only'; card.href='nfse/'; card.dataset.nfseAdminLink='1';
  card.innerHTML='<span class="visual"><svg viewBox="0 0 24 24"><path d="M6 2h9l4 4v16H6z"/><path d="M14 2v5h5M9 11h6M9 15h6M9 19h4"/></svg></span><h3>NFS-e</h3><p>Prepare, valide e emita notas de serviço pelo Bling no Ambiente Nacional, com auditoria.</p><span class="go">Abrir NFS-e →</span>';
  const bling=[...grid.querySelectorAll('.module')].find(x=>x.getAttribute('href')==='bling/'); if(bling)grid.insertBefore(card,bling);else grid.appendChild(card);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
