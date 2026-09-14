import { supabase, requireUser, onlyDigits } from '/js/croma-supabase.js?v=20260821-2';

const PENDING_KEY='croma_pending_card_checkout_v1';
const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const byId=id=>document.getElementById(id);
const readPending=()=>{try{return JSON.parse(sessionStorage.getItem(PENDING_KEY)||'null')}catch{return null}};
const savePending=value=>sessionStorage.setItem(PENDING_KEY,JSON.stringify(value));
const clearPending=()=>sessionStorage.removeItem(PENDING_KEY);
const makeUuid=()=>globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2,14).padEnd(12,'0')}`;

const user=await requireUser(location.href);
if(!user)throw new Error('auth');

let pending=readPending();
let activeCart=window.CromaCart?.read?.()||[];
let cart=activeCart.length?activeCart:(Array.isArray(pending?.cart)?pending.cart:[]);
let primary=null;
let profile=null;
let mpConfig=null;
let brickController=null;
let pollToken=0;

const items=byId('items'),total=byId('total'),total2=byId('total2'),to2=byId('to2'),to3=byId('to3'),finish=byId('finish');
const deliveryBox=byId('deliveryBox'),otherAddress=byId('otherAddress'),principalAddress=byId('principalAddress'),msg=byId('msg');
const cardArea=byId('cardPaymentArea'),manualInfo=byId('manualPaymentInfo'),mpStatus=byId('mpStatus'),mpChallenge=byId('mpChallenge'),challengeFrame=byId('mpChallengeFrame'),paymentLocked=byId('paymentLocked');
const sum=cart.reduce((acc,item)=>acc+Number(item.qty||1)*Number(item.unitPrice||0),0);

total.textContent=total2.textContent=brl(pending?.order?.total??sum);
items.innerHTML=cart.length?cart.map(item=>`<div class="item"><div><strong>${esc(item.name)}</strong><div class="muted">${esc(Object.entries(item.options||{}).map(([key,value])=>`${key}: ${value}`).join(' · '))}</div>${item.files?.length?`<div class="muted">Arquivos: ${item.files.map(file=>esc(file.name)).join(', ')}</div>`:''}</div><div class="price">${item.qty||1} × ${brl(item.unitPrice)}<br>${brl(Number(item.qty||1)*Number(item.unitPrice||0))}</div></div>`).join(''):'<div><p>Seu carrinho está vazio.</p><div class="empty-actions"><a href="/produtos/">Escolher produtos</a><a href="/servicos/">Ver serviços</a></div></div>';
if(!cart.length&&!pending)to2.disabled=true;

const [{data:addr},{data:customer}]=await Promise.all([
  supabase.from('customer_addresses').select('*').eq('customer_id',user.id).eq('principal',true).maybeSingle(),
  supabase.from('customer_profiles').select('nome,email,cpf').eq('id',user.id).maybeSingle()
]);
primary=addr||null;profile=customer||null;
if(primary)principalAddress.textContent=`${primary.logradouro}, ${primary.numero}${primary.complemento?' - '+primary.complemento:''} · ${primary.bairro} · ${primary.cidade}/${primary.estado} · CEP ${primary.cep}`;
else principalAddress.innerHTML='Nenhum endereço principal encontrado. <a href="/minha-conta/" style="color:#30297F;font-weight:900">Cadastrar endereço na minha conta</a>.';

function go(step){
  document.querySelectorAll('.panel').forEach(panel=>panel.classList.toggle('active',panel.dataset.panel==step));
  document.querySelectorAll('.step').forEach(mark=>mark.classList.toggle('active',mark.dataset.stepmark==step));
  scrollTo({top:0,behavior:'smooth'});
}
function selectedPayment(){return document.querySelector('[name="payment"]:checked')?.value||'pix'}
function setStatus(text='',type=''){
  mpStatus.textContent=text;mpStatus.className=`mp-status${type?' '+type:''}`;
}
function selectedDelivery(){
  const fulfillment=document.querySelector('[name="fulfillment"]:checked')?.value||'retirada';
  const mode=document.querySelector('[name="addressMode"]:checked')?.value||'principal';
  const address=fulfillment==='entrega'?(mode==='principal'?(primary?{zip:primary.cep,street:primary.logradouro,number:primary.numero,complement:primary.complemento,neighborhood:primary.bairro,city:primary.cidade,state:primary.estado}:null):{zip:onlyDigits(byId('cep').value),street:byId('logradouro').value.trim(),number:byId('numero').value.trim(),complement:byId('complemento').value.trim()||null,neighborhood:byId('bairro').value.trim(),city:byId('cidade').value.trim(),state:byId('estado').value.trim().toUpperCase()}):{};
  return {fulfillment,mode,address};
}
function validateDelivery(){
  const {fulfillment,mode,address}=selectedDelivery();
  if(fulfillment==='entrega'&&mode==='principal'&&!primary){alert('Cadastre um endereço principal ou escolha outro endereço para esta entrega.');return false}
  if(fulfillment==='entrega'&&mode==='outro'){
    if(!address||String(address.zip||'').length!==8||!address.street||!address.number||!address.neighborhood||!address.city||String(address.state||'').length!==2){alert('Preencha um endereço de entrega válido, incluindo CEP com 8 dígitos e UF com 2 letras.');return false}
  }
  return true;
}
function checkoutPayload(payment){
  const {fulfillment,address}=selectedDelivery();
  return {p_checkout_reference:window.CromaCart.cartRef(),p_fulfillment:fulfillment,p_payment_method:payment,p_delivery_fee:0,p_notes:byId('notes').value.trim()||null,p_delivery_street:address?.street||null,p_delivery_number:address?.number||null,p_delivery_complement:address?.complement||null,p_delivery_neighborhood:address?.neighborhood||null,p_delivery_city:address?.city||null,p_delivery_state:address?.state||null,p_delivery_zip:address?.zip||null};
}
async function invokeMp(body){
  const {data,error}=await supabase.functions.invoke('mercado-pago-card',{body});
  if(error){const e=new Error(error.message||'Mercado Pago indisponível.');e.cause=error;throw e}
  if(data?.error)throw new Error(data.error);
  return data||{};
}
async function ensureMpSdk(){
  if(window.MercadoPago)return true;
  const existing=document.querySelector('script[data-mercado-pago-sdk]');
  if(existing){await new Promise((resolve,reject)=>{existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true})});return Boolean(window.MercadoPago)}
  const script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.dataset.mercadoPagoSdk='1';
  const loaded=new Promise((resolve,reject)=>{script.onload=resolve;script.onerror=reject});document.head.appendChild(script);await loaded;return Boolean(window.MercadoPago);
}
async function loadMpConfig(){
  try{
    const data=await invokeMp({action:'config'});
    if(data.enabled&&data.environment==='test'&&data.public_key&&await ensureMpSdk())mpConfig=data;
  }catch(error){console.info('Mercado Pago de teste não ativo; mantendo confirmação manual.',error?.message||error)}
  await renderPaymentMode();
}
function lockPendingOrder(){
  if(!pending?.order)return;
  document.querySelector('[name="payment"][value="credito"]').checked=true;
  document.querySelectorAll('[name="payment"]').forEach(input=>input.disabled=input.value!=='credito');
  document.querySelectorAll('[name="fulfillment"],[name="addressMode"],#otherAddress input').forEach(input=>input.disabled=true);
  document.querySelectorAll('[data-back]').forEach(button=>button.disabled=true);
  paymentLocked.classList.remove('hidden');
  paymentLocked.textContent=`O pedido ${pending.order.order_code} já foi registrado. Conclua ou tente novamente o pagamento deste mesmo pedido.`;
}
async function destroyBrick(){
  if(brickController?.unmount){try{await brickController.unmount()}catch{}}
  brickController=null;byId('cardPaymentBrick_container').innerHTML='';
}
async function mountBrick(){
  if(brickController||!mpConfig?.enabled||!window.MercadoPago)return;
  setStatus('Carregando formulário seguro do Mercado Pago...','wait');
  const mp=new window.MercadoPago(mpConfig.public_key,{locale:'pt-BR'});
  const builder=mp.bricks();
  const amount=Number(pending?.order?.total??sum);
  const initialization={amount,payer:{email:profile?.email||user.email||''}};
  const cpf=onlyDigits(profile?.cpf||'');
  if(cpf.length===11)initialization.payer.identification={type:'CPF',number:cpf};
  brickController=await builder.create('cardPayment','cardPaymentBrick_container',{
    initialization,
    customization:{paymentMethods:{maxInstallments:12}},
    callbacks:{
      onReady:()=>setStatus('Ambiente de teste pronto. Use somente cartões de teste do Mercado Pago.','wait'),
      onSubmit:formData=>handleCardSubmit(formData),
      onError:error=>{console.error(error);setStatus('Não foi possível carregar o formulário do cartão.','error')}
    }
  });
}
async function renderPaymentMode(){
  const credit=selectedPayment()==='credito';
  const online=credit&&Boolean(mpConfig?.enabled)&&Boolean(window.MercadoPago);
  cardArea.classList.toggle('hidden',!online);
  manualInfo.classList.toggle('hidden',online);
  finish.classList.toggle('hidden',online);
  if(credit&&!online){manualInfo.innerHTML='<p class="muted mp-manual-note">O cartão online está em validação. Enquanto não estiver ativo para esta sessão, o pedido é registrado e a cobrança é confirmada pela Croma no atendimento.</p>'}
  else if(!credit){manualInfo.innerHTML='<p class="muted mp-manual-note">A forma escolhida fica registrada no pedido e a confirmação é feita pela Croma no atendimento pelo WhatsApp.</p>'}
  if(online)await mountBrick();
  else await destroyBrick();
}
async function createCreditOrder(){
  if(pending?.order)return pending.order;
  if(!activeCart.length)throw new Error('Carrinho vazio.');
  setStatus('Registrando seu pedido antes do pagamento...','wait');
  await window.CromaCart.syncNow();
  const {data,error}=await supabase.rpc('checkout_active_cart',checkoutPayload('credito'));
  if(error)throw error;
  const order=data?.[0];if(!order)throw new Error('Pedido não retornado.');
  const state={order:{order_id:order.order_id,order_code:order.order_code,total:Number(order.total)},cart:[...activeCart],created_at:new Date().toISOString()};
  pending=state;savePending(state);cart=state.cart;
  window.CromaCart.afterCheckout();activeCart=[];
  lockPendingOrder();
  return state.order;
}
async function finalizeApproved(result){
  pollToken++;
  setStatus(`Pagamento aprovado. Pedido ${result.order_code||pending?.order?.order_code||''} confirmado.`,'ok');
  clearPending();pending=null;
  mpChallenge.classList.add('hidden');
  await sleep(900);
  location.href=`/meus-pedidos/?pedido=${encodeURIComponent(result.order_code||'')}`;
}
async function pollPayment(orderId){
  const token=++pollToken;
  for(let i=0;i<40&&token===pollToken;i++){
    await sleep(3000);
    let result;try{result=await invokeMp({action:'status',order_id:orderId})}catch{continue}
    if(result.payment_status==='approved'){await finalizeApproved(result);return}
    if(['rejected','canceled','refunded'].includes(result.payment_status)){
      setStatus('O pagamento não foi aprovado. Você pode tentar novamente com outro cartão.','error');return;
    }
    if(result.challenge_url)showChallenge(result.challenge_url);
  }
  if(token===pollToken)setStatus('Pagamento ainda em análise. O pedido permanece registrado e será atualizado automaticamente.','wait');
}
function showChallenge(url){
  if(!url)return;challengeFrame.src=url;mpChallenge.classList.remove('hidden');setStatus('Confirme a autenticação do cartão para continuar.','wait');
}
async function handleCardSubmit(formData){
  try{
    const order=await createCreditOrder();
    setStatus('Enviando pagamento ao Mercado Pago...','wait');
    const result=await invokeMp({action:'pay',order_id:order.order_id,attempt_id:makeUuid(),token:formData.token,payment_method_id:formData.payment_method_id,payment_type_id:formData.payment_type_id||'credit_card',installments:Number(formData.installments||1),payer:formData.payer||{}});
    if(result.payment_status==='approved'){await finalizeApproved(result);return result}
    if(result.challenge_url){showChallenge(result.challenge_url);pollPayment(order.order_id);return result}
    if(['processing','action_required','created'].includes(result.payment_status)){setStatus('Pagamento em processamento. O pedido já está registrado.','wait');pollPayment(order.order_id);return result}
    setStatus('O pagamento não foi aprovado. Confira os dados ou tente outro cartão.','error');
    throw new Error(result.status_detail||'Pagamento não aprovado.');
  }catch(error){console.error(error);setStatus(error?.message||'Não foi possível processar o cartão. Tente novamente.','error');throw error}
}
async function manualFinish(){
  if(!activeCart.length)return;
  finish.disabled=true;msg.className='msg ok';msg.textContent='Salvando carrinho e registrando o pedido...';
  const wa=window.open('about:blank','_blank');
  try{
    await window.CromaCart.syncNow();
    const payment=selectedPayment();
    const {fulfillment}=selectedDelivery();
    const {data,error}=await supabase.rpc('checkout_active_cart',checkoutPayload(payment));
    if(error)throw error;
    const order=data?.[0];if(!order)throw new Error('Pedido não retornado');
    const lines=[`Olá! Acabei de registrar o pedido ${order.order_code} no site da Croma.`,``,...activeCart.map(item=>`${item.qty||1}x ${item.name} — ${brl(Number(item.qty||1)*Number(item.unitPrice||0))}${Object.keys(item.options||{}).length?`\n${Object.entries(item.options).map(([key,value])=>`${key}: ${value}`).join(' | ')}`:''}${item.files?.length?`\nArquivos: ${item.files.map(file=>file.name).join(', ')}`:''}`),``,`Total: ${brl(order.total)}`,`Recebimento: ${fulfillment==='entrega'?'Entrega':'Retirada'}`,`Pagamento: ${payment==='pix'?'Pix':payment==='credito'?'Cartão de crédito':'Cartão de débito'}`];
    window.CromaCart.afterCheckout();
    const url=`https://wa.me/553230253588?text=${encodeURIComponent(lines.join('\n'))}`;
    if(wa)wa.location.href=url;else location.href=url;
    setTimeout(()=>{location.href=`/meus-pedidos/?pedido=${encodeURIComponent(order.order_code)}`},700);
  }catch(error){console.error(error);if(wa)wa.close();msg.className='msg';msg.textContent='Não foi possível concluir o pedido. Seu carrinho foi mantido; tente novamente.';finish.disabled=false}
}

to2.onclick=()=>cart.length&&go(2);
document.querySelectorAll('[data-back]').forEach(button=>button.onclick=()=>go(button.dataset.back));
document.querySelectorAll('[name="fulfillment"]').forEach(radio=>radio.onchange=()=>deliveryBox.classList.toggle('hidden',document.querySelector('[name="fulfillment"]:checked').value!=='entrega'));
document.querySelectorAll('[name="addressMode"]').forEach(radio=>radio.onchange=()=>otherAddress.classList.toggle('hidden',document.querySelector('[name="addressMode"]:checked').value!=='outro'));
document.querySelectorAll('[name="payment"]').forEach(radio=>radio.addEventListener('change',renderPaymentMode));
to3.onclick=()=>{if(validateDelivery())go(3)};
finish.onclick=manualFinish;

if(pending?.order){lockPendingOrder();go(3)}
await loadMpConfig();
if(pending?.order&&mpConfig?.enabled){try{const status=await invokeMp({action:'status',order_id:pending.order.order_id});if(status.payment_status==='approved')await finalizeApproved(status);else if(status.challenge_url){showChallenge(status.challenge_url);pollPayment(pending.order.order_id)}}catch{}}
