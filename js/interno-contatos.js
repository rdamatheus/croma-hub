import { supabase, onlyDigits } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';

const session=await protectInternalPage();
if(!session) throw new Error('auth');
const isOwner=session.profile.role==='owner';
const canManage=['owner','manager'].includes(session.profile.role);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const labels={nao_sincronizado:'Não sincronizado',pendente:'Pendente',sincronizando:'Sincronizando',sincronizado:'Sincronizado',erro:'Erro',conflito:'Conflito'};
const PAGE_SIZE=50;
let page=1,total=0,currentRows=[],editing=null;

$('#logout').onclick=async()=>{await signOutStaff();location.href='/interno/'};
if(!isOwner) document.querySelectorAll('[data-owner-only]').forEach(el=>el.hidden=true);
if(!canManage) document.querySelectorAll('[data-manage-only]').forEach(el=>el.hidden=true);
for(const id of ['q','role','person','sync']) $('#'+id).addEventListener(id==='q'?'input':'change',()=>{page=1;load()});

function syncClass(v){return v==='sincronizado'?'ok':v==='erro'||v==='conflito'?'bad':'warn'}
function roles(c){const rows=c.contact_roles||[];if(rows.length)return rows.map(x=>x.role_label||x.role_code).filter(Boolean).join(', ');const raw=Array.isArray(c.tipos_contato)?c.tipos_contato:[];return raw.map(x=>typeof x==='string'?x:(x.label||x.descricao||x.nome||x.code)).filter(Boolean).join(', ')}
function initials(name=''){return String(name).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'?'}
function setSyncMsg(text,type=''){const el=$('#syncMsg');el.textContent=text;el.className=`sync-note${type?' '+type:''}`}
function render(list){
  currentRows=list;
  $('#body').innerHTML=list.length?list.map(c=>{
    const sync=c.bling_sync_status||'nao_sincronizado';
    const kind=c.tipo_pessoa==='J'?'PJ':c.tipo_pessoa==='F'?'PF':c.tipo_pessoa==='E'?'Exterior':'—';
    const actions=canManage?`<div class="row-actions"><button class="btn light" data-edit="${c.id}">Editar</button><button class="btn ${c.ativo?'danger':'light'}" data-toggle="${c.id}" data-active="${c.ativo?'1':'0'}">${c.ativo?'Desativar':'Reativar'}</button></div>`:'—';
    return `<tr><td><div class="contact-main"><span class="avatar">${esc(initials(c.nome))}</span><div><strong>${esc(c.nome)}</strong>${c.nome_fantasia?`<br><span class="muted">${esc(c.nome_fantasia)}</span>`:''}<br><span class="muted">${esc(c.email||'—')}</span></div></div></td><td><span class="pill">${kind}</span>${roles(c)?`<br><span class="muted">${esc(roles(c))}</span>`:''}</td><td>${esc(c.cpf||'—')}</td><td>${esc(c.celular||c.telefone||'—')}</td><td>${c.bling_contact_id?`#${esc(c.bling_contact_id)}`:'—'}</td><td><span class="pill ${syncClass(sync)}">${esc(labels[sync]||sync)}</span>${c.bling_sync_error?`<br><span class="muted">${esc(c.bling_sync_error)}</span>`:''}</td><td><span class="pill ${c.ativo?'ok':''}">${c.ativo?'Ativo':'Inativo'}</span></td><td>${actions}</td></tr>`
  }).join(''):'<tr><td colspan="8" style="padding:28px;color:var(--croma-muted)">Nenhum contato encontrado.</td></tr>';
  $('#summary').textContent=`${total.toLocaleString('pt-BR')} contato(s) · 50 por página`;
  renderPager();
}
function renderPager(){const pages=Math.max(1,Math.ceil(total/PAGE_SIZE));const box=$('#pager');const start=Math.max(1,page-2),end=Math.min(pages,page+2);let html=`<button ${page<=1?'disabled':''} data-page="${page-1}">← Anterior</button>`;if(start>1)html+=`<button data-page="1">1</button>${start>2?'<span>…</span>':''}`;for(let p=start;p<=end;p++)html+=`<button class="${p===page?'active':''}" data-page="${p}">${p}</button>`;if(end<pages)html+=`${end<pages-1?'<span>…</span>':''}<button data-page="${pages}">${pages}</button>`;html+=`<button ${page>=pages?'disabled':''} data-page="${page+1}">Próxima →</button>`;box.innerHTML=html;box.querySelectorAll('button[data-page]').forEach(b=>b.onclick=()=>{const p=Number(b.dataset.page);if(p>=1&&p<=pages&&p!==page){page=p;load();scrollTo({top:0,behavior:'smooth'})}})}
async function loadKpis(){const [t,a,c,s]=await Promise.all([supabase.from('customer_profiles').select('id',{count:'exact',head:true}),supabase.from('customer_profiles').select('id',{count:'exact',head:true}).eq('ativo',true),supabase.from('contact_roles').select('id',{count:'exact',head:true}).ilike('role_label','%cliente%'),supabase.from('contact_roles').select('id',{count:'exact',head:true}).ilike('role_label','%fornecedor%')]);$('#kTotal').textContent=(t.count||0).toLocaleString('pt-BR');$('#kActive').textContent=(a.count||0).toLocaleString('pt-BR');$('#kClients').textContent=(c.count||0).toLocaleString('pt-BR');$('#kSuppliers').textContent=(s.count||0).toLocaleString('pt-BR')}
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
  if(error){console.error(error);$('#body').innerHTML='<tr><td colspan="8" style="padding:28px">Não foi possível carregar os contatos.</td></tr>';$('#summary').textContent='Erro ao carregar';return}
  total=count||0;render(data||[]);
}
function resetForm(){const f=$('#editForm');f.reset();f.tipo_pessoa.value='F';f.ativo.value='true'}
function openNew(){editing=null;resetForm();$('#editTitle').textContent='Novo contato';$('#saveContact').textContent='Criar contato';$('#editDialog').showModal()}
function openEdit(c){editing=c;const f=$('#editForm');f.nome.value=c.nome||'';f.nome_fantasia.value=c.nome_fantasia||'';f.tipo_pessoa.value=c.tipo_pessoa||'F';f.cpf.value=c.cpf||'';f.telefone.value=c.telefone||'';f.celular.value=c.celular||'';f.email.value=c.email||'';f.ativo.value=String(c.ativo!==false);$('#editTitle').textContent=`Editar ${c.nome}`;$('#saveContact').textContent='Salvar alterações';$('#editDialog').showModal()}
function syncFailureMessage(data){return data?.sync?.detail||data?.sync?.error||data?.contact?.bling_sync_error||'A alteração ficou pendente para nova tentativa.'}
async function savePayload(payload){
  const {data,error}=await supabase.functions.invoke('admin-update-customer',{body:payload});
  if(error||data?.error) throw new Error(data?.error||error?.message||'Não foi possível salvar.');
  return data;
}

document.body.addEventListener('click',async e=>{
  const edit=e.target.closest('[data-edit]');
  if(edit){const c=currentRows.find(x=>x.id===edit.dataset.edit);if(c)openEdit(c);return}
  const toggle=e.target.closest('[data-toggle]');
  if(toggle){
    const c=currentRows.find(x=>x.id===toggle.dataset.toggle);if(!c)return;
    const action=c.ativo?'deactivate':'reactivate';
    if(c.ativo&&!confirm(`Desativar ${c.nome}? O cadastro e o histórico serão preservados.`))return;
    toggle.disabled=true;
    try{
      const data=await savePayload({id:c.id,action});
      if(data.sync_ok)setSyncMsg(`${c.nome} foi ${c.ativo?'desativado':'reativado'} no Croma e no Bling.`,'ok');
      else setSyncMsg(`${c.nome} foi ${c.ativo?'desativado':'reativado'} no Croma, mas ficou pendente no Bling: ${syncFailureMessage(data)}`,'warn');
      await Promise.all([load(),loadKpis()]);
    }catch(err){setSyncMsg(err.message||'Não foi possível alterar o status.','bad')}
    finally{toggle.disabled=false}
  }
});
$('#newContact')?.addEventListener('click',openNew);
$('#closeEdit').onclick=$('#cancelEdit').onclick=()=>$('#editDialog').close();
$('#editForm').onsubmit=async e=>{
  e.preventDefault();
  const btn=$('#saveContact');btn.disabled=true;
  const f=new FormData(e.currentTarget);
  const base=editing||{};
  const payload={action:'save',...(editing?.id?{id:editing.id}:{}),nome:String(f.get('nome')||'').trim(),nome_fantasia:String(f.get('nome_fantasia')||'').trim()||null,tipo_pessoa:String(f.get('tipo_pessoa')||'F'),tipos_contato:Array.isArray(base.tipos_contato)?base.tipos_contato:[],cpf:onlyDigits(f.get('cpf'))||null,telefone:onlyDigits(f.get('telefone'))||null,celular:onlyDigits(f.get('celular'))||null,email:String(f.get('email')||'').trim()||null,email_nota_fiscal:base.email_nota_fiscal||null,data_nascimento:base.data_nascimento||null,rg:base.rg||null,inscricao_estadual:base.inscricao_estadual||null,indicador_ie:base.indicador_ie||null,orgao_emissor:base.orgao_emissor||null,sexo:base.sexo||null,situacao:String(f.get('ativo'))==='false'?'I':'A',observacoes:base.observacoes||null,ativo:String(f.get('ativo'))!=='false'};
  try{
    const data=await savePayload(payload);
    $('#editDialog').close();
    if(data.sync_ok)setSyncMsg(`${data.created?'Contato criado':'Alteração salva'} no Croma e sincronizada com o Bling.`,'ok');
    else setSyncMsg(`${data.created?'Contato criado':'Alteração salva'} no Croma, mas o Bling ainda não confirmou: ${syncFailureMessage(data)}`,'warn');
    page=1;await Promise.all([load(),loadKpis()]);
  }catch(err){alert(err.message||'Não foi possível salvar.');}
  finally{btn.disabled=false}
};
$('#syncNow')?.addEventListener('click',async()=>{const btn=$('#syncNow');btn.disabled=true;setSyncMsg('Iniciando reconciliação com o Bling…');try{const {data,error}=await supabase.functions.invoke('bling-contact-sync',{body:{action:'full_sync'}});if(error||data?.error)throw new Error(data?.detail||data?.error||error.message);setSyncMsg(data?.has_more?'Carga iniciada. Os próximos lotes continuarão automaticamente.':'Reconciliação concluída.','ok');page=1;await Promise.all([load(),loadKpis()])}catch(e){setSyncMsg(e.message||'Não foi possível iniciar a sincronização.','bad')}finally{btn.disabled=false}});
await Promise.all([load(),loadKpis()]);