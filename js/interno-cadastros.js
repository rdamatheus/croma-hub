import { supabase, onlyDigits, STORAGE_BUCKET } from './croma-supabase.js';
import { protectInternalPage, signOutStaff } from './interno-auth.js';

const session = await protectInternalPage();
if (!session) throw new Error('auth');

const canManage = ['owner','manager'].includes(session.profile.role);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const brl = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const statusLabels = {recebido:'Recebido',em_analise:'Em análise',aguardando_pagamento:'Aguardando pagamento',pago:'Pago',em_producao:'Em produção',pronto:'Pronto',enviado:'Enviado',concluido:'Concluído',cancelado:'Cancelado'};

let clientes=[],enderecos=[],pedidos=[],produtos=[],custos=[],mode=null,current=null;

$('#logout').onclick = async () => { await signOutStaff(); location.href='/interno/'; };
if (!canManage) document.querySelectorAll('[data-manager-only]').forEach(el=>el.hidden=true);

document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===btn));
  document.querySelectorAll('.panel').forEach(x=>x.classList.toggle('active',x.id===btn.dataset.tab));
});

$('#qClientes').oninput=renderClientes;
$('#qPedidos').oninput=renderPedidos;
$('#qProdutos').oninput=renderProdutos;

function addrFor(id){return enderecos.find(x=>x.customer_id===id&&x.principal)||enderecos.find(x=>x.customer_id===id)}
function costFor(id){return custos.find(x=>x.product_id===id)||{}}

async function reloadAll(){
  const requests=[
    supabase.from('customer_profiles').select('*').order('nome'),
    supabase.from('customer_addresses').select('*'),
    supabase.from('orders').select('*,customer_profiles(nome,email),order_items(id,product_name,quantity,total,options),order_files(id,original_name,storage_path,order_item_id,bucket)').order('created_at',{ascending:false}),
    supabase.from('products').select('*').order('nome')
  ];
  if(canManage) requests.push(supabase.from('product_costs').select('*'));
  const [c,a,o,p,pc] = await Promise.all(requests);
  for(const r of [c,a,o,p]) if(r.error) console.error(r.error);
  clientes=c.data||[];enderecos=a.data||[];pedidos=o.data||[];produtos=p.data||[];custos=pc?.data||[];
  renderClientes();renderPedidos();renderProdutos();
  $('#kClientes').textContent=clientes.filter(x=>x.ativo).length;
  $('#kPedidos').textContent=pedidos.filter(x=>!['concluido','cancelado'].includes(x.status)).length;
  $('#kProdutos').textContent=produtos.filter(x=>x.ativo).length;
}

function renderClientes(){
  const q=$('#qClientes').value.toLowerCase();
  const list=clientes.filter(c=>[c.nome,c.cpf,c.telefone,c.email].join(' ').toLowerCase().includes(q));
  $('#clientesBody').innerHTML=list.length?list.map(c=>{const a=addrFor(c.id);return`<tr><td><strong>${esc(c.nome)}</strong><br><span class="muted">${esc(c.email)}</span></td><td>${esc(c.cpf)}</td><td>${esc(c.telefone)}</td><td>${a?`${esc(a.logradouro)}, ${esc(a.numero)}<br><span class="muted">${esc(a.cidade)}/${esc(a.estado)}</span>`:'—'}</td><td><span class="pill ${c.ativo?'ok':''}">${c.ativo?'Ativo':'Inativo'}</span></td><td><div class="actions">${canManage?`<button class="btn light" data-client-edit="${c.id}">Editar</button><button class="btn bad" data-client-toggle="${c.id}">${c.ativo?'Desativar':'Ativar'}</button>`:'Consulta'}</div></td></tr>`}).join(''):'<tr><td colspan="6" class="empty">Nenhum cliente encontrado.</td></tr>';
}

function renderPedidos(){
  const q=$('#qPedidos').value.toLowerCase();
  const list=pedidos.filter(o=>[o.order_code,o.status,o.customer_profiles?.nome].join(' ').toLowerCase().includes(q));
  $('#pedidosBody').innerHTML=list.length?list.map(o=>`<tr><td><strong>${esc(o.order_code)}</strong><br><span class="muted">${new Date(o.created_at).toLocaleString('pt-BR')}</span></td><td>${esc(o.customer_profiles?.nome||'—')}</td><td><span class="pill">${esc(statusLabels[o.status]||o.status)}</span></td><td>${o.fulfillment==='entrega'?'Entrega':'Retirada'}</td><td>${o.payment_method==='pix'?'Pix':o.payment_method==='credito'?'Crédito':'Débito'}</td><td>${brl(o.total)}</td><td><div class="actions"><button class="btn light" data-order-view="${o.id}">Detalhes</button><button class="btn light" data-order-edit="${o.id}">Editar</button>${canManage?`<button class="btn bad" data-order-del="${o.id}">Excluir</button>`:''}</div></td></tr>`).join(''):'<tr><td colspan="7" class="empty">Nenhum pedido encontrado.</td></tr>';
}

function renderProdutos(){
  const q=$('#qProdutos').value.toLowerCase();
  const list=produtos.filter(p=>[p.sku,p.nome,p.categoria].join(' ').toLowerCase().includes(q));
  $('#produtosBody').innerHTML=list.length?list.map(p=>{const c=costFor(p.id);return`<tr><td>${esc(p.sku||'—')}</td><td><strong>${esc(p.nome)}</strong><br><span class="muted">${esc(p.unidade)}</span></td><td>${esc(p.categoria||'—')}</td><td>${brl(p.preco)}</td>${canManage?`<td>${c.cost==null?'—':brl(c.cost)}</td>`:''}<td><span class="pill ${p.ativo?'ok':''}">${p.ativo?'Ativo':'Inativo'}</span></td><td><div class="actions">${canManage?`<button class="btn light" data-product-edit="${p.id}">Editar</button><button class="btn bad" data-product-del="${p.id}">Excluir</button>`:'Consulta'}</div></td></tr>`}).join(''):`<tr><td colspan="${canManage?7:6}" class="empty">Nenhum produto cadastrado.</td></tr>`;
}

function field(name,label,type='text',value='',wide=false,extra=''){return`<div class="field ${wide?'wide':''}"><label>${label}</label><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`}
function select(name,label,options,value,wide=false){return`<div class="field ${wide?'wide':''}"><label>${label}</label><select name="${name}">${options.map(([v,l])=>`<option value="${v}" ${String(v)===String(value)?'selected':''}>${l}</option>`).join('')}</select></div>`}
function textarea(name,label,value=''){return`<div class="field wide"><label>${label}</label><textarea name="${name}" rows="4">${esc(value)}</textarea></div>`}
function openModal(title,fields,newMode,item=null){mode=newMode;current=item;$('#modalTitle').textContent=title;$('#modalFields').innerHTML=fields;$('#modalMsg').textContent='';$('#dlg').showModal()}

$('#novoCliente').onclick=()=>openModal('Novo cliente',field('nome','Nome completo','text','',true,'required')+field('cpf','CPF','text','','', 'required')+field('telefone','Celular','text','','','required')+field('email','E-mail','email','',false,'required')+field('data_nascimento','Data de nascimento','date')+field('password','Senha inicial','password','',false,'minlength="6" required')+'<div class="wide"><strong>Endereço principal</strong></div>'+field('cep','CEP')+field('logradouro','Logradouro')+field('numero','Número')+field('complemento','Complemento')+field('bairro','Bairro')+field('cidade','Cidade')+field('estado','UF'),'client-create');

$('#novoProduto').onclick=()=>openModal('Novo produto',field('sku','SKU')+field('nome','Nome','text','',true,'required')+field('categoria','Categoria')+field('unidade','Unidade','text','un')+field('preco','Preço de venda','number','0',false,'step="0.01" min="0"')+field('cost','Custo interno','number','',false,'step="0.01" min="0"')+field('supplier_reference','Referência interna')+select('ativo','Status',[['true','Ativo'],['false','Inativo']],'true')+textarea('descricao','Descrição pública'),'product-create');

$('#novoPedido').onclick=()=>openModal('Novo pedido',`<div class="field wide"><label>Cliente</label><select name="customer_id">${clientes.map(c=>`<option value="${c.id}">${esc(c.nome)} — ${esc(c.email)}</option>`).join('')}</select></div>`+select('status','Status',Object.entries(statusLabels),'recebido')+select('fulfillment','Recebimento',[['retirada','Retirada'],['entrega','Entrega']],'retirada')+select('payment_method','Pagamento',[['pix','Pix'],['credito','Cartão de crédito'],['debito','Cartão de débito']],'pix')+field('total','Total','number','0',false,'step="0.01" min="0"')+textarea('notes','Observações'),'order-create');

document.body.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.clientEdit){const c=clientes.find(x=>x.id===b.dataset.clientEdit),a=addrFor(c.id)||{};openModal('Editar cliente',field('nome','Nome completo','text',c.nome,true,'required')+field('cpf','CPF','text',c.cpf)+field('telefone','Celular','text',c.telefone)+field('email','E-mail','email',c.email,false,'required')+field('data_nascimento','Data de nascimento','date',c.data_nascimento||'')+select('ativo','Status',[['true','Ativo'],['false','Inativo']],c.ativo)+'<div class="wide"><strong>Endereço principal</strong></div>'+field('cep','CEP','text',a.cep||'')+field('logradouro','Logradouro','text',a.logradouro||'')+field('numero','Número','text',a.numero||'')+field('complemento','Complemento','text',a.complemento||'')+field('bairro','Bairro','text',a.bairro||'')+field('cidade','Cidade','text',a.cidade||'')+field('estado','UF','text',a.estado||''),'client-edit',c)}
  if(b.dataset.clientToggle){const c=clientes.find(x=>x.id===b.dataset.clientToggle);await supabase.from('customer_profiles').update({ativo:!c.ativo}).eq('id',c.id);await reloadAll()}
  if(b.dataset.productEdit){const p=produtos.find(x=>x.id===b.dataset.productEdit),c=costFor(p.id),m=p.metadata||{};openModal('Editar produto',field('sku','SKU','text',p.sku||'')+field('nome','Nome','text',p.nome,true,'required')+field('categoria','Categoria','text',p.categoria||'')+field('unidade','Unidade','text',p.unidade||'un')+field('preco','Preço de venda','number',p.preco,false,'step="0.01" min="0"')+field('cost','Custo interno','number',c.cost??'',false,'step="0.01" min="0"')+field('supplier_reference','Referência interna','text',c.supplier_reference||'')+field('href','Link público','text',m.href||'',true)+select('ativo','Status',[['true','Ativo'],['false','Inativo']],p.ativo)+textarea('descricao','Descrição pública',p.descricao||''),'product-edit',p)}
  if(b.dataset.productDel&&confirm('Excluir este produto?')){await supabase.from('products').delete().eq('id',b.dataset.productDel);await reloadAll()}
  if(b.dataset.orderEdit){const o=pedidos.find(x=>x.id===b.dataset.orderEdit);openModal('Editar pedido',select('status','Status',Object.entries(statusLabels),o.status)+select('fulfillment','Recebimento',[['retirada','Retirada'],['entrega','Entrega']],o.fulfillment)+select('payment_method','Pagamento',[['pix','Pix'],['credito','Cartão de crédito'],['debito','Cartão de débito']],o.payment_method)+field('total','Total','number',o.total,false,'step="0.01" min="0"')+textarea('notes','Observações',o.notes||''),'order-edit',o)}
  if(b.dataset.orderDel&&confirm('Excluir este pedido e seus itens?')){await supabase.from('orders').delete().eq('id',b.dataset.orderDel);await reloadAll()}
  if(b.dataset.orderView){const o=pedidos.find(x=>x.id===b.dataset.orderView);const items=(o.order_items||[]).map(i=>`<div class="detail-line"><strong>${i.quantity}× ${esc(i.product_name)}</strong><span>${brl(i.total)}</span></div>`).join('')||'<p class="muted">Sem itens.</p>';const files=(o.order_files||[]).map(f=>`<button class="btn light" data-file="${esc(f.storage_path)}" data-name="${esc(f.original_name)}">Abrir ${esc(f.original_name)}</button>`).join('');openModal(`Pedido ${o.order_code}`,`<div class="wide">${items}<div class="actions" style="margin-top:12px">${files}</div></div>`,'view',o)}
  if(b.dataset.file){const{data,error}=await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(b.dataset.file,120);if(error)return alert('Não foi possível abrir o arquivo.');window.open(data.signedUrl,'_blank','noopener')}
});

$('#modalForm').addEventListener('submit',async e=>{
  if(e.submitter?.value==='cancel'||mode==='view')return;
  e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));$('#modalMsg').textContent='Salvando...';
  try{
    if(mode==='client-create'){
      const payload={nome:d.nome,cpf:onlyDigits(d.cpf),telefone:onlyDigits(d.telefone),email:d.email,data_nascimento:d.data_nascimento||null,password:d.password,endereco:d.cep?{cep:d.cep,logradouro:d.logradouro,numero:d.numero,complemento:d.complemento,bairro:d.bairro,cidade:d.cidade,estado:d.estado}:null};
      const{data,error}=await supabase.functions.invoke('admin-create-customer',{body:payload});if(error||data?.error)throw new Error(data?.error||error.message);
    }else if(mode==='client-edit'){
      const payload={id:current.id,nome:d.nome,cpf:onlyDigits(d.cpf),telefone:onlyDigits(d.telefone),email:d.email,data_nascimento:d.data_nascimento||null,ativo:d.ativo==='true',endereco:d.cep?{cep:d.cep,logradouro:d.logradouro,numero:d.numero,complemento:d.complemento,bairro:d.bairro,cidade:d.cidade,estado:d.estado}:null};
      const{data,error}=await supabase.functions.invoke('admin-update-customer',{body:payload});if(error||data?.error)throw new Error(data?.error||error.message);
    }else if(mode==='product-create'||mode==='product-edit'){
      const oldMeta=current?.metadata||{};const payload={sku:d.sku||null,nome:d.nome,categoria:d.categoria||null,unidade:d.unidade||'un',preco:Number(d.preco||0),ativo:d.ativo==='true',descricao:d.descricao||null,metadata:{...oldMeta,...(d.href?{href:d.href}:{})}};
      let productId=current?.id;
      if(mode==='product-create'){const{data,error}=await supabase.from('products').insert(payload).select('id').single();if(error)throw error;productId=data.id}else{const{error}=await supabase.from('products').update(payload).eq('id',current.id);if(error)throw error}
      if(canManage){const cost=d.cost===''?null:Number(d.cost);const{error}=await supabase.from('product_costs').upsert({product_id:productId,cost,supplier_reference:d.supplier_reference||null,updated_at:new Date().toISOString()},{onConflict:'product_id'});if(error)throw error}
    }else if(mode==='order-create'){
      const total=Number(d.total||0);const{error}=await supabase.from('orders').insert({customer_id:d.customer_id,status:d.status,fulfillment:d.fulfillment,payment_method:d.payment_method,subtotal:total,delivery_fee:0,total,notes:d.notes||null,delivery_address:d.fulfillment==='entrega'?{}:null});if(error)throw error;
    }else if(mode==='order-edit'){
      const total=Number(d.total||0);const{error}=await supabase.from('orders').update({status:d.status,fulfillment:d.fulfillment,payment_method:d.payment_method,subtotal:total,total,notes:d.notes||null,delivery_address:d.fulfillment==='entrega'?(current.delivery_address||{}):null}).eq('id',current.id);if(error)throw error;
    }
    $('#dlg').close();await reloadAll();
  }catch(error){console.error(error);$('#modalMsg').textContent=error?.message||'Não foi possível salvar.'}
});

await reloadAll();
