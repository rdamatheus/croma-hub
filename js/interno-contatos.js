import { supabase } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';

const session=await protectInternalPage();
if(!session) throw new Error('auth');
const isOwner=session.profile.role==='owner';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const labels={nao_sincronizado:'Não sincronizado',pendente:'Pendente',sincronizando:'Sincronizando',sincronizado:'Sincronizado',erro:'Erro',conflito:'Conflito'};
const PAGE_SIZE=50;
let page=1,total=0;

$('#logout').onclick=async()=>{await signOutStaff();location.href='/interno/'};
if(!isOwner) document.querySelectorAll('[data-owner-only]').forEach(el=>el.hidden=true);
for(const id of ['q','role','person','sync']) $('#'+id).addEventListener(id==='q'?'input':'change',()=>{page=1;load()});

function syncClass(v){return v==='sincronizado'?'ok':v==='erro'||v==='conflito'?'bad':'warn'}
function roles(c){const rows=c.contact_roles||[];if(rows.length)return rows.map(x=>x.role_label||x.role_code).filter(Boolean).join(', ');const raw=Array.isArray(c.tipos_contato)?c.tipos_contato:[];return raw.map(x=>typeof x==='string'?x:(x.label||x.descricao||x.nome||x.code)).filter(Boolean).join(', ')}
function render(list){
  $('#body').innerHTML=list.length?list.map(c=>{const sync=c.bling_sync_status||'nao_sincronizado';const kind=c.tipo_pessoa==='J'?'PJ':c.tipo_pessoa==='F'?'PF':c.tipo_pessoa==='E'?'Exterior':'—';return `<tr><td><strong>${esc(c.nome)}</strong>${c.nome_fantasia?`<br><span class="muted">${esc(c.nome_fantasia)}</span>`:''}<br><span class="muted">${esc(c.email||'—')}</span></td><td><span class="pill">${kind}</span>${roles(c)?`<br><span class="muted">${esc(roles(c))}</span>`:''}</td><td>${esc(c.cpf||'—')}</td><td>${esc(c.celular||c.telefone||'—')}</td><td>${c.bling_contact_id?`#${esc(c.bling_contact_id)}`:'—'}</td><td><span class="pill ${syncClass(sync)}">${esc(labels[sync]||sync)}</span>${c.bling_sync_error?`<br><span class="muted">${esc(c.bling_sync_error)}</span>`:''}</td><td><span class="pill ${c.ativo?'ok':''}">${c.ativo?'Ativo':'Inativo'}</span></td></tr>`}).join(''):'<tr><td colspan="7" style="padding:28px;color:var(--croma-muted)">Nenhum contato encontrado.</td></tr>';
  $('#summary').textContent=`${total.toLocaleString('pt-BR')} contato(s) · 50 por página`;
  renderPager();
}
function renderPager(){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));const box=$('#pager');const start=Math.max(1,page-2),end=Math.min(pages,page+2);let html=`<button ${page<=1?'disabled':''} data-page="${page-1}">← Anterior</button>`;if(start>1)html+=`<button data-page="1">1</button>${start>2?'<span>…</span>':''}`;for(let p=start;p<=end;p++)html+=`<button class="${p===page?'active':''}" data-page="${p}">${p}</button>`;if(end<pages)html+=`${end<pages-1?'<span>…</span>':''}<button data-page="${pages}">${pages}</button>`;html+=`<button ${page>=pages?'disabled':''} data-page="${page+1}">Próxima →</button>`;box.innerHTML=html;box.querySelectorAll('button[data-page]').forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=pages&&p!==page){page=p;load();scrollTo({top:0,behavior:'smooth'})}})}

async function load(){
  $('#summary').textContent='Carregando…';
  const role=$('#role').value,person=$('#person').value,sync=$('#sync').value,q=$('#q').value.trim();
  const select=role?'*,contact_roles!inner(role_label,role_code)':'*,contact_roles(role_label,role_code)';
  let req=supabase.from('customer_profiles').select(select,{count:'exact'}).order('nome',{ascending:true});
  if(role) req=req.or(`role_label.ilike.%${role}%,role_code.ilike.%${role}%`,{referencedTable:'contact_roles'});
  if(person) req=req.eq('tipo_pessoa',person);
  if(sync) req=req.eq('bling_sync_status',sync);
  if(q){const safe=q.replaceAll(',',' ');if(/^\d+$/.test(q)&&q.length>10) req=req.or(`cpf.eq.${q},bling_contact_id.eq.${q}`);else req=req.or(`nome.ilike.%${safe}%,nome_fantasia.ilike.%${safe}%,email.ilike.%${safe}%,cpf.ilike.%${safe}%,telefone.ilike.%${safe}%,celular.ilike.%${safe}%`)}
  const from=(page-1)*PAGE_SIZE,to=from+PAGE_SIZE-1;const {data,error,count}=await req.range(from,to);
  if(error){console.error(error);$('#body').innerHTML='<tr><td colspan="7" style="padding:28px">Não foi possível carregar os contatos.</td></tr>';$('#summary').textContent='Erro ao carregar';return}
  total=count||0;render(data||[]);
}

$('#syncNow')?.addEventListener('click',async()=>{const btn=$('#syncNow'),msg=$('#syncMsg');btn.disabled=true;msg.textContent='Iniciando reconciliação com o Bling…';try{const {data,error}=await supabase.functions.invoke('bling-contact-sync',{body:{action:'full_sync'}});if(error||data?.error)throw new Error(data?.detail||data?.error||error.message);msg.textContent=data?.has_more?'Carga iniciada. O primeiro lote foi processado e os próximos continuarão automaticamente.':'Reconciliação concluída.';page=1;await load()}catch(e){msg.textContent=e.message||'Não foi possível iniciar a sincronização.'}finally{btn.disabled=false}});

await load();