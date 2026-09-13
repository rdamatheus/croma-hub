import { supabase } from './croma-supabase.js';

async function install(){
  if(!/^\/interno\/?$/.test(location.pathname)||document.querySelector('[data-supplier-admin-link]'))return;
  const {data:userData}=await supabase.auth.getUser();
  if(!userData?.user)return;
  const {data:profile}=await supabase.from('profiles').select('role,ativo').eq('id',userData.user.id).maybeSingle();
  if(!profile?.ativo||!['owner','manager'].includes(profile.role))return;
  const grid=document.querySelector('.category .internal-grid');
  if(!grid)return;
  const card=document.createElement('a');
  card.className='module';card.href='fornecedores/';card.dataset.supplierAdminLink='1';
  card.innerHTML='<span class="visual"><svg viewBox="0 0 24 24"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></svg></span><h3>Fornecedores</h3><p>Fornecedores cadastrados, catálogos atuais, vínculos, custos e divergências com o Bling.</p><span class="go">Abrir fornecedores →</span>';
  const productCard=[...grid.querySelectorAll('.module')].find(x=>x.getAttribute('href')==='produtos/');
  if(productCard?.nextSibling)grid.insertBefore(card,productCard.nextSibling);else grid.appendChild(card);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
