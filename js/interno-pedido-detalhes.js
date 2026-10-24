import {supabase} from './croma-supabase.js';
import {protectInternalPage} from './interno-auth.js?v=20261024-1';
const session=await protectInternalPage();if(!session)throw new Error('auth');
const box=document.getElementById('detail'),feedback=document.getElementById('feedback');
const orderId=new URLSearchParams(location.search).get('id');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date=v=>new Date(v).toLocaleString('pt-BR');
const labels={recebido:'Recebido',aguardando_pagamento:'Aguardando pagamento',pago:'Pago',cancelado:'Cancelado',em_analise:'Em análise',em_producao:'Em produção',pronto:'Pronto',enviado:'Enviado',concluido:'Concluído'};
const methods={pix:'Pix',credito:'Crédito',debito:'Débito'};
let current=null,busy=false;
async function load(){
 const {data,error}=await supabase.rpc('internal_order_detail',{p_order_id:orderId});
 if(error)throw error;current=data;
 const o=data.order,c=data.customer||{},manager=['owner','manager'].includes(session.profile.role);
 const address=[o.delivery_street,o.delivery_number,o.delivery_complement,o.delivery_neighborhood,o.delivery_city,o.delivery_state,o.delivery_zip].filter(Boolean).join(', ');
 const awaiting=['recebido','aguardando_pagamento'].includes(o.status);
 box.innerHTML=`<h1>${esc(o.order_code)}</h1><p>${esc(labels[o.status]||o.status)} · ${money(o.total)} · ${date(o.created_at)}</p>
 <section class="card grid"><div><h2>Cliente</h2><strong>${esc(c.nome)}</strong><p>${esc(c.email)}<br>${esc(c.telefone)}</p></div><div><h2>Recebimento e pagamento</h2><p>${o.fulfillment==='entrega'?'Entrega':'Retirada na Croma'}<br>${esc(address)}</p><p>${esc(methods[o.payment_method]||o.payment_method)}</p><p>Produtos: ${money(o.subtotal)} · Frete: ${money(o.delivery_fee)}</p></div></section>
 <section class="card"><h2>Itens</h2>${data.items.map(i=>`<div class="row"><strong>${Number(i.quantity)} × ${esc(i.name)}</strong><p>${money(i.unit_price)} cada · ${money(i.total)}</p>${(i.options||[]).map(x=>esc(x.name)+': '+esc(x.value)).join(' · ')}</div>`).join('')}<p>Observações: ${esc(o.notes||'Nenhuma')}</p></section>
 <section class="card grid"><div><h2>Reserva de estoque</h2>${data.reservations.map(r=>`<p>${Number(r.quantity)} unidade(s) · ${esc(({active:'Reservada',released:'Liberada',consumed:'Consumida'})[r.status]||r.status)}</p>`).join('')||'<p>Sem reserva registrada.</p>'}</div><div><h2>Pagamentos online</h2>${data.payments.map(p=>`<p>${esc(p.status)} · ${money(p.amount)} · ${esc(p.environment)} · ${date(p.created_at)}</p>`).join('')||'<p>Nenhum pagamento online registrado.</p>'}<p>Confirmações manuais aparecem no histórico abaixo.</p><h3>Bling</h3>${data.bling.map(m=>`<p>ID ${esc(m.external_id)} · ${esc(m.sync_status)}</p>`).join('')||'<p>Sem vínculo registrado.</p>'}</div></section>
 ${manager&&['recebido','aguardando_pagamento','pago','em_analise'].includes(o.status)?`<section class="card"><h2>Ações da gestão</h2><p>Confirme somente valores já recebidos. O cancelamento libera a reserva local, mas não executa estorno nem cancela pedidos no Bling.</p><label for="actionNote">Motivo ou referência do recebimento (obrigatório)</label><textarea id="actionNote" minlength="5" maxlength="1000"></textarea><label><input type="checkbox" id="financialReview"> Já verifiquei o pagamento e tratei eventual devolução ou estorno fora desta ação.</label><div class="actions">${awaiting?'<button type="button" data-action="confirm_manual_payment">Confirmar pagamento recebido</button>':''}<button type="button" data-action="cancel">Cancelar internamente</button></div></section>`:''}
 <section class="card"><h2>Histórico de ações</h2>${data.history.map(e=>`<div class="row"><strong>${e.action==='manual_payment_confirmed'?'Pagamento confirmado manualmente':'Cancelamento interno'}</strong><p>${esc(e.actor)} · ${date(e.created_at)} · ${money(e.amount)}</p><p>${esc(labels[e.from_status]||e.from_status)} → ${esc(labels[e.to_status]||e.to_status)}</p><p>${esc(e.note)}</p>${e.financial_review?'<p>Tratamento financeiro declarado pela gestão.</p>':''}</div>`).join('')||'<p>Nenhuma ação interna registrada nesta tela.</p>'}</section>`;
 box.setAttribute('aria-busy','false');
}
box.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button||busy)return;
 const note=document.getElementById('actionNote').value.trim(),review=document.getElementById('financialReview').checked;
 if(note.length<5){feedback.textContent='Informe o motivo ou a referência com pelo menos 5 caracteres.';return;}
 const action=button.dataset.action;
 const message=action==='cancel'?'Cancelar este pedido e liberar a reserva local? Esta ação não faz estorno.':'Confirmar o recebimento integral de '+money(current.order.total)+'? Confirme somente após conferir o recebimento.';
 if(!confirm(message))return;
 busy=true;box.querySelectorAll('[data-action]').forEach(b=>b.disabled=true);feedback.textContent='Salvando…';
 try{
 const {error}=await supabase.rpc('manage_internal_order',{p_order_id:orderId,p_action:action,p_note:note,p_financial_review:review});
 if(error)throw error;
 await load();feedback.textContent='Alteração registrada no histórico.';
 }catch(error){feedback.textContent=error.message||'Não foi possível registrar a ação.';}
 finally{busy=false;box.querySelectorAll('[data-action]').forEach(b=>b.disabled=false);}
});
try{if(!/^[0-9a-f-]{36}$/i.test(orderId||''))throw new Error('Pedido inválido.');await load();}
catch(error){box.textContent='Não foi possível carregar o pedido.';box.setAttribute('aria-busy','false');feedback.textContent=error.message;}
