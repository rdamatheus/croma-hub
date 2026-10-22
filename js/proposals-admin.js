import { supabase } from '/js/croma-supabase.js';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statusLabel=status=>({draft:'Rascunho',sent:'Enviada',approved:'Aprovada',rejected:'Recusada',expired:'Expirada',cancelled:'Cancelada'})[status]||status||'Rascunho';
const pct=value=>Number.isFinite(value)?`${value.toFixed(2).replace('.',',')}%`:'—';
const multiplier=value=>Number.isFinite(value)&&value>0?`${value.toFixed(2).replace('.',',')}×`:'—';
const n=value=>{const x=Number(String(value??'').replace(',','.'));return Number.isFinite(x)?x:null};
let proposals=[];

function safeUrl(value){try{const url=new URL(value);return url.protocol==='https:'?url.href:null}catch{return null}}
function setModal(html=''){document.getElementById('proposalModalRoot').innerHTML=html}
function closeModal(){setModal('')}
function itemPricing(item){
  const cost=Number(item.total_cost||0), markup=Number(item.applied_markup||item.recommended_markup||0), markupPrice=Number(item.line_total||0);
  const market=item.market_reference_price==null?null:Number(item.market_reference_price);
  const suggested=item.suggested_price==null?null:Number(item.suggested_price);
  const final=item.final_offer_price==null?(suggested??markupPrice):Number(item.final_offer_price);
  const contribution=final==null?null:final-cost;
  const margin=final&&final>0?contribution/final*100:null;
  const finalMarkup=final&&cost>0?final/cost:null;
  return {cost,markup,markupPrice,market,suggested,final,contribution,margin,finalMarkup};
}

function renderItem(item){
  const p=itemPricing(item), sourceUrl=safeUrl(item.market_reference_metadata?.primary?.url), marketSource=item.market_reference_source||item.market_reference_metadata?.primary?.supplier||'';
  return `<section class="proposal-item">
    <div class="proposal-item-head"><div class="item-head-main">${item.image_url?`<img class="item-photo" src="${esc(item.image_url)}" alt="${esc(item.option_label||item.description)}">`:''}<div><strong>${esc(item.option_label||item.description)}</strong><small>${esc(item.description||'')}</small></div></div><span class="sku">${esc(item.supplier_sku||'sem SKU')}</span></div>
    <div class="analysis-strip"><span>Cadastro Croma: <b>${item.product_id?'Vinculado':'Não vinculado'}</b></span><button type="button" class="mini-btn alt" data-action="link-product" data-item-id="${esc(item.id)}">${item.product_id?'Revisar vínculo':'Vincular produto'}</button><button type="button" class="mini-btn alt" data-action="edit-item" data-item-id="${esc(item.id)}">Editar este item</button></div>
    <div class="price-grid">
      <div><span>Custo fornecedor</span><strong>${money.format(Number(item.base_cost||0))}</strong></div>
      <div><span>Frete</span><strong>${money.format(Number(item.freight_cost||0))}</strong></div>
      <div><span>Custo total</span><strong>${money.format(p.cost)}</strong></div>
      <div><span>Markup definido</span><strong>${multiplier(p.markup)}</strong></div>
      <div><span>Preço pelo markup</span><strong>${money.format(p.markupPrice)}</strong></div>
      <div class="market"><span>Valor de mercado</span><strong>${p.market==null?'Pesquisa pendente':money.format(p.market)}</strong></div>
      <div class="suggested"><span>Preço sugerido</span><strong>${p.suggested==null?'A definir':money.format(p.suggested)}</strong></div>
      <div class="final"><span>Preço final</span><strong>${p.final==null?'A definir':money.format(p.final)}</strong></div>
    </div>
    ${p.final!=null?`<div class="analysis-strip"><span>Markup efetivo final: <b>${multiplier(p.finalMarkup)}</b></span><span>Contribuição bruta: <b>${money.format(p.contribution)}</b></span><span>Margem sobre venda: <b>${pct(p.margin)}</b></span></div>`:''}
    ${marketSource?`<div class="market-source"><b>Referência:</b> ${esc(marketSource)}${sourceUrl?` · <a href="${esc(sourceUrl)}" target="_blank" rel="noopener">abrir fonte</a>`:''}${item.market_researched_at?` · pesquisado em ${esc(dateTime.format(new Date(item.market_researched_at)))}`:''}</div>`:''}
  </section>`;
}

function renderProposal(proposal){
  const items=[...(proposal.sales_proposal_items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  return `<article class="proposal-card" data-proposal-id="${esc(proposal.id)}" data-search="${esc(`${proposal.proposal_no} ${proposal.customer_name} ${proposal.customer_phone||''}`.toLowerCase())}">
    <header class="proposal-head"><div><span class="proposal-number">Proposta #${esc(proposal.proposal_no)}</span><h2>${esc(proposal.customer_name)}</h2><p>${esc(proposal.customer_phone||'Sem telefone')} · Contato: ${proposal.customer_id?'vinculado':'não vinculado'}</p></div><div class="proposal-head-side"><span class="status">${esc(statusLabel(proposal.status))}</span><button class="mini-btn alt" data-action="link-customer">Vincular contato</button><button class="mini-btn alt" data-action="edit">Editar</button><button class="mini-btn share" data-action="share">Encaminhar proposta</button></div></header>
    ${proposal.notes?`<p class="notes">${esc(proposal.notes)}</p>`:''}<div class="proposal-items">${items.length?items.map(renderItem).join(''):'<p class="empty">Sem itens nesta proposta.</p>'}</div>
    <footer>Criada em ${esc(dateTime.format(new Date(proposal.created_at)))}</footer>
  </article>`;
}

async function loadProposals(){
  const {data,error}=await supabase.from('sales_proposals').select('id,proposal_no,customer_id,customer_name,customer_phone,status,notes,created_at,bling_proposal_id,bling_sync_status,sales_proposal_items(id,product_id,supplier_id,supplier_catalog_item_id,description,share_description,option_label,quantity,unit,supplier_sku,base_cost,freight_cost,total_cost,recommended_markup,applied_markup,unit_price,line_total,sort_order,market_reference_price,suggested_price,final_offer_price,image_url,market_reference_source,market_researched_at,market_reference_metadata,metadata)').order('created_at',{ascending:false}).limit(200);
  if(error) throw error; proposals=data||[]; return proposals;
}

async function searchCustomers(term,currentId=''){
  const clean=String(term||'').trim().replace(/[,%()]/g,' ').replace(/\s+/g,' ').slice(0,80);
  if(clean.length<3)return [];
  const {data,error}=await supabase.from('customer_profiles').select('id,nome,nome_fantasia,telefone,celular,bling_contact_id,ativo').eq('ativo',true).or(`nome.ilike.%${clean}%,nome_fantasia.ilike.%${clean}%,telefone.ilike.%${clean}%,celular.ilike.%${clean}%`).order('nome').limit(30);
  if(error)throw error;
  const rows=[...(data||[])];
  if(currentId&&!rows.some(row=>row.id===currentId)){
    const {data:current,error:currentError}=await supabase.from('customer_profiles').select('id,nome,nome_fantasia,telefone,celular,bling_contact_id,ativo').eq('id',currentId).maybeSingle();
    if(currentError)throw currentError;if(current)rows.unshift(current);
  }
  return rows;
}
function customerOptions(rows,currentId){
  return rows.map(row=>`<option value="${esc(row.id)}" ${row.id===currentId?'selected':''}>${esc(row.nome||row.nome_fantasia||'Sem nome')} · ${esc(row.telefone||row.celular||'sem telefone')} · ${row.bling_contact_id?'Bling #'+esc(row.bling_contact_id):'sem ID Bling'}</option>`).join('');
}
async function openLinkCustomer(proposal){
  if(proposal.bling_proposal_id||proposal.bling_sync_status==='synced'){
    alert('Esta proposta já possui vínculo com o Bling. Revise o contato no fluxo de sincronização antes de alterar o cadastro interno; a alteração isolada poderia causar divergência.');
    return;
  }
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="linkCustomerTitle">
    <h2 id="linkCustomerTitle">Vincular contato — proposta #${esc(proposal.proposal_no)}</h2>
    <p class="modal-lead">Cliente da proposta: <b>${esc(proposal.customer_name)}</b>. Confira nome e telefone antes de escolher. A vinculação não altera a proposta enviada nem cria contato no Bling.</p>
    <div class="field"><label for="linkCustomerSearch">Buscar no cadastro Croma</label><input id="linkCustomerSearch" autocomplete="off" placeholder="Nome ou telefone (mínimo 3 caracteres)" value="${esc(proposal.customer_name||'')}"></div>
    <div class="field" style="margin-top:12px"><label for="linkCustomerSelect">Contato correspondente</label><select id="linkCustomerSelect"><option value="">Selecione um contato</option></select></div>
    <p class="share-note">Um nome parecido não garante correspondência. Se não encontrar o cliente correto, deixe a proposta sem vínculo e revise o cadastro de contatos.</p>
    <div id="linkCustomerFeedback" class="modal-feedback" aria-live="polite"></div>
    <div class="modal-actions"><button type="button" class="mini-btn alt" data-close>Cancelar</button><button type="button" class="mini-btn" id="linkCustomerSave">Confirmar contato</button></div>
  </section></div>`);
  const root=document.getElementById('proposalModalRoot'),search=root.querySelector('#linkCustomerSearch'),select=root.querySelector('#linkCustomerSelect'),feedback=root.querySelector('#linkCustomerFeedback'),save=root.querySelector('#linkCustomerSave');
  const initialId=proposal.customer_id||'';
  let rows=[],timer=null,seq=0;
  const load=async()=>{
    const current=++seq;
    feedback.textContent='Buscando contatos…';feedback.dataset.type='';
    try{
      const found=await searchCustomers(search.value,initialId);
      if(current!==seq)return;
      rows=found;select.innerHTML='<option value="">Selecione um contato</option>'+customerOptions(rows,initialId);
      feedback.textContent=found.length?`${found.length} contato(s) encontrado(s). Confira a identidade.`:'Nenhum contato encontrado. Use ao menos três caracteres.';
    }catch(error){if(current===seq){feedback.textContent=error.message||'Falha ao buscar contatos.';feedback.dataset.type='error'}}
  };
  search.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,350)});
  root.querySelector('[data-close]').onclick=closeModal;
  root.querySelector('[data-modal-close]').addEventListener('click',event=>{if(event.target===event.currentTarget)closeModal()});
  save.addEventListener('click',async()=>{
    const selectedId=select.value,selected=rows.find(row=>row.id===selectedId);
    if(!selected){feedback.textContent='Selecione e confira um contato existente.';feedback.dataset.type='error';return}
    if(selectedId===initialId){closeModal();return}
    const description=`${selected.nome||selected.nome_fantasia||'Contato'} — ${selected.telefone||selected.celular||'sem telefone'}`;
    if(!window.confirm(`Vincular a proposta #${proposal.proposal_no} ao contato "${description}"? Os dados comerciais e o Bling não serão alterados.`))return;
    save.disabled=true;feedback.textContent='Verificando dados atuais…';feedback.dataset.type='';
    try{
      const {data:current,error:readError}=await supabase.from('sales_proposals').select('customer_id,bling_proposal_id,bling_sync_status').eq('id',proposal.id).single();
      if(readError)throw readError;
      if((current.customer_id||'')!==initialId||current.bling_proposal_id||current.bling_sync_status==='synced')throw new Error('A proposta foi modificada ou sincronizada. Recarregue antes de vincular.');
      let update=supabase.from('sales_proposals').update({customer_id:selectedId}).eq('id',proposal.id).is('bling_proposal_id',null).neq('bling_sync_status','synced');
      update=initialId?update.eq('customer_id',initialId):update.is('customer_id',null);
      const {data:changed,error:writeError}=await update.select('id,customer_id');
      if(writeError)throw writeError;
      if(changed?.length!==1)throw new Error('O vínculo não foi confirmado. Atualize e confira o estado da proposta.');
      closeModal();await refreshList('Contato vinculado sem alterar a proposta ou o Bling.');
    }catch(error){feedback.textContent=error.message||'Falha ao vincular contato.';feedback.dataset.type='error';save.disabled=false}
  });
  await load();
}

function productSearchTerm(value){return String(value||'').trim().replace(/[,%()]/g,' ').replace(/\s+/g,' ').slice(0,80)}
async function searchProducts(term='',currentId=''){
  const clean=productSearchTerm(term);
  let query=supabase.from('products').select('id,nome,sku,descricao,short_description,default_markup').eq('ativo',true).eq('is_sellable',true).order('nome').limit(40);
  if(clean)query=query.or(`nome.ilike.%${clean}%,sku.ilike.%${clean}%`);
  const {data,error}=await query;if(error)throw error;
  const rows=[...(data||[])];
  if(currentId&&!rows.some(p=>p.id===currentId)){
    const {data:current,error:cErr}=await supabase.from('products').select('id,nome,sku,descricao,short_description,default_markup').eq('id',currentId).maybeSingle();
    if(cErr)throw cErr;if(current)rows.unshift(current);
  }
  return rows;
}
async function getProductSnapshot(productId){
  const [{data:product,error:pErr},{data:supplier,error:sErr},{data:media,error:mErr}]=await Promise.all([
    supabase.from('products').select('id,nome,sku,descricao,short_description,default_markup').eq('id',productId).maybeSingle(),
    supabase.from('product_suppliers').select('supplier_id,supplier_catalog_item_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,preferred,active').eq('product_id',productId).eq('active',true).order('preferred',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('product_media').select('url').eq('product_id',productId).eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem',{ascending:true}).limit(1).maybeSingle()
  ]);
  if(pErr)throw pErr;if(sErr)throw sErr;if(mErr)throw mErr;return {product:product||null,supplier:supplier||null,imageUrl:media?.url||null};
}

function optionProductHtml(products,currentId){return products.map(p=>`<option value="${esc(p.id)}" ${p.id===currentId?'selected':''}>${esc(p.nome)}${p.sku?` · ${esc(p.sku)}`:''}</option>`).join('')}


// Vinculação assistida: não altera valores, descrições, imagens, fornecedor ou dados do Bling.
async function openLinkProduct(proposal,item){
  let rows;
  try{rows=await searchProducts('',item.product_id||'')}catch(error){alert(error.message||'Falha ao buscar produtos.');return}
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true" aria-labelledby="linkProductTitle">
    <h2 id="linkProductTitle">Vincular produto — proposta #${esc(proposal.proposal_no)}</h2>
    <p class="modal-lead">Item: ${esc(item.option_label||item.description)}. A vinculação organiza o cadastro, sem atualizar os valores e as condições que foram cotados ao cliente.</p>
    <div class="form-grid"><div class="field full"><label for="linkProductSearch">Buscar produto por nome ou SKU</label><input id="linkProductSearch" autocomplete="off" placeholder="Digite o nome ou SKU"></div>
    <div class="field full"><label for="linkProductSelect">Produto correspondente</label><select id="linkProductSelect"><option value="">Sem produto vinculado</option>${optionProductHtml(rows,item.product_id)}</select></div></div>
    <p class="share-note">Confira se o produto corresponde ao material, tamanho e acabamento da proposta. Não vincule apenas pela semelhança do nome. O histórico comercial e a sincronização com o Bling não serão modificados.</p>
    <div id="linkProductFeedback" class="modal-feedback" aria-live="polite"></div>
    <div class="modal-actions"><button type="button" class="mini-btn alt" data-close>Cancelar</button><button type="button" class="mini-btn" id="linkProductSave">Confirmar vínculo</button></div>
  </section></div>`);
  const root=document.getElementById('proposalModalRoot');
  const select=root.querySelector('#linkProductSelect'),search=root.querySelector('#linkProductSearch'),feedback=root.querySelector('#linkProductFeedback'),save=root.querySelector('#linkProductSave');
  const initialId=item.product_id||'';
  let timer=null,sequence=0;
  search.addEventListener('input',()=>{
    clearTimeout(timer);
    const request=++sequence;
    timer=setTimeout(async()=>{
      const selected=select.value;
      try{
        const found=await searchProducts(search.value,selected||initialId);
        if(request!==sequence)return;
        select.innerHTML='<option value="">Sem produto vinculado</option>'+optionProductHtml(found,selected);
        feedback.textContent=found.length?'Confira o produto selecionado.':'Nenhum produto encontrado; refine a busca.';
        feedback.dataset.type='';
      }catch(error){if(request===sequence){feedback.textContent=error.message||'Erro na busca.';feedback.dataset.type='error'}}
    },300);
  });
  select.addEventListener('change',()=>{feedback.textContent='';feedback.dataset.type=''});
  root.querySelector('[data-close]').onclick=closeModal;
  root.querySelector('[data-modal-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  save.addEventListener('click',async()=>{
    const productId=select.value||null;
    if(!productId&&!initialId){feedback.textContent='Selecione um produto correspondente para vincular.';feedback.dataset.type='error';return}
    if(productId===initialId){closeModal();return}
    if(initialId&&!window.confirm(productId?'Confirma substituir o vínculo anterior? O histórico comercial e os valores da proposta serão preservados.':'Confirma remover o vínculo? O histórico comercial e os valores da proposta serão preservados.'))return;
    save.disabled=true;feedback.textContent='Verificando vínculo…';feedback.dataset.type='';
    try{
      const {data:current,error:readError}=await supabase.from('sales_proposal_items').select('id,product_id').eq('id',item.id).eq('proposal_id',proposal.id).single();
      if(readError)throw readError;
      if((current.product_id||'')!==initialId)throw new Error('Este item foi alterado desde a abertura. Recarregue a proposta antes de continuar.');
      let update=supabase.from('sales_proposal_items').update({product_id:productId}).eq('id',item.id).eq('proposal_id',proposal.id);
      update=initialId?update.eq('product_id',initialId):update.is('product_id',null);
      const {data:updated,error:writeError}=await update.select('id,product_id');
      if(writeError)throw writeError;
      if(!updated||updated.length!==1)throw new Error('Vínculo não confirmado; atualize a lista e revise o item.');
      closeModal();await refreshList('Vínculo do produto atualizado sem alterar os valores da proposta.');
    }catch(error){feedback.textContent=error.message||'Não foi possível vincular.';feedback.dataset.type='error';save.disabled=false}
  });
}

async function openEdit(proposal,selectedItem=null){
  const items=[...(proposal.sales_proposal_items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const item=selectedItem||items[0]; if(!item)return;
  
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true"><h2>Editar proposta #${esc(proposal.proposal_no)}</h2><p class="modal-lead">Editando item: <b>${esc(item.option_label||item.description)}</b>. As alterações ficam somente nesta cotação e não mudam automaticamente o cadastro mestre do produto. ${proposal.status==='sent'?'Esta proposta já foi enviada ao cliente; confirme qualquer alteração comercial e revise a sincronização com o Bling.':''}</p>
    <div class="form-grid"><div class="field"><label>Cliente</label><input id="editCustomer" value="${esc(proposal.customer_name)}"></div><div class="field"><label>Telefone</label><input id="editPhone" value="${esc(proposal.customer_phone||'')}"></div><div class="field"><label>Status</label><select id="editStatus">${['draft','sent','approved','rejected','expired','cancelled'].map(s=>`<option value="${s}" ${s===proposal.status?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div><div class="field full"><label>Observações internas</label><textarea id="editNotes">${esc(proposal.notes||'')}</textarea></div></div>
    <div class="form-section"><h3>Item da proposta</h3><div class="form-grid"><div class="field full"><label>Produto vinculado</label><p class="share-note">${item.product_id?'Produto já associado. Use “Revisar vínculo” no item para corrigir.':'Sem produto associado. Use “Vincular produto” no item após salvar.'}</p></div><div class="field full"><label>Descrição comercial</label><textarea id="editDescription">${esc(item.share_description||item.description||'')}</textarea></div><div class="field"><label>Quantidade</label><input id="editQuantity" type="number" min="0.01" step="0.01" value="${esc(item.quantity)}"></div><div class="field"><label>Markup desta cotação</label><input id="editMarkup" type="number" min="0.01" step="0.01" value="${esc(item.applied_markup||item.recommended_markup||'')}"></div><div class="field"><label>Custo fornecedor</label><input id="editBaseCost" type="number" min="0" step="0.01" value="${esc(item.base_cost)}"></div><div class="field"><label>Frete</label><input id="editFreight" type="number" min="0" step="0.01" value="${esc(item.freight_cost)}"></div><div class="field"><label>Preço de mercado</label><input id="editMarket" type="number" min="0" step="0.01" value="${esc(item.market_reference_price??'')}"></div><div class="field"><label>Preço sugerido</label><input id="editSuggested" type="number" min="0" step="0.01" value="${esc(item.suggested_price??'')}"></div><div class="field"><label>Preço final ao cliente</label><input id="editFinal" type="number" min="0" step="0.01" value="${esc(item.final_offer_price??item.suggested_price??item.line_total)}"></div><div class="field"><label>Imagem da proposta (URL)</label><input id="editImage" value="${esc(item.image_url||'')}"></div></div><div id="editCalc" class="analysis-strip"></div></div>
    <div id="editFeedback" class="modal-feedback"></div><div class="modal-actions"><button class="mini-btn alt" data-close>Cancelar</button><button class="mini-btn" id="saveEdit">Salvar alterações</button></div></section></div>`);
  const root=document.getElementById('proposalModalRoot');
  const calc=()=>{const base=n(root.querySelector('#editBaseCost').value)||0, freight=n(root.querySelector('#editFreight').value)||0, markup=n(root.querySelector('#editMarkup').value)||0, cost=base+freight, price=cost*markup;root.querySelector('#editCalc').innerHTML=`<span>Custo total: <b>${money.format(cost)}</b></span><span>Preço pelo markup: <b>${money.format(price)}</b></span>`};
  ['#editBaseCost','#editFreight','#editMarkup'].forEach(sel=>root.querySelector(sel).addEventListener('input',calc));calc();
  root.querySelector('[data-close]').onclick=closeModal;root.querySelector('[data-modal-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  root.querySelector('#saveEdit').onclick=async()=>{
    const fb=root.querySelector('#editFeedback'),btn=root.querySelector('#saveEdit');
    const base=n(root.querySelector('#editBaseCost').value)||0,freight=n(root.querySelector('#editFreight').value)||0,markup=n(root.querySelector('#editMarkup').value)||0,qty=n(root.querySelector('#editQuantity').value);
    const market=n(root.querySelector('#editMarket').value),suggested=n(root.querySelector('#editSuggested').value),finalPrice=n(root.querySelector('#editFinal').value);
    if(!root.querySelector('#editCustomer').value.trim()||!qty||qty<=0||markup<=0||finalPrice==null||finalPrice<0){fb.textContent='Revise cliente, quantidade, markup e preço final.';fb.dataset.type='error';return}
    if(proposal.bling_proposal_id||proposal.bling_sync_status==='synced'){fb.textContent='Proposta já sincronizada com o Bling. Revise o fluxo de sincronização antes de editar condições comerciais.';fb.dataset.type='error';return}
    if(proposal.status==='sent'&&!window.confirm('Esta proposta já foi enviada. Confirma a edição deste item? As alterações podem exigir nova sincronização e reenvio ao cliente.'))return;
    btn.disabled=true;fb.textContent='Salvando…';
    try{
      const supplierData={}; // Preserva o fornecedor histórico da cotação, mesmo ao revisar o vínculo.
      const totalCost=base+freight,markupTotal=Number((totalCost*markup).toFixed(2));
      const {error:pError}=await supabase.from('sales_proposals').update({customer_name:root.querySelector('#editCustomer').value.trim(),customer_phone:root.querySelector('#editPhone').value.trim()||null,status:root.querySelector('#editStatus').value,notes:root.querySelector('#editNotes').value.trim()||null,updated_at:new Date().toISOString()}).eq('id',proposal.id);if(pError)throw pError;
      const {error:iError}=await supabase.from('sales_proposal_items').update({description:root.querySelector('#editDescription').value.trim(),share_description:root.querySelector('#editDescription').value.trim(),quantity:qty,base_cost:base,freight_cost:freight,total_cost:totalCost,applied_markup:markup,line_total:markupTotal,unit_price:markupTotal/qty,market_reference_price:market,suggested_price:suggested,final_offer_price:finalPrice,image_url:root.querySelector('#editImage').value.trim()||null,...supplierData}).eq('id',item.id);if(iError)throw iError;
      closeModal();await refreshList('Proposta atualizada.');
    }catch(error){fb.textContent=error.message||'Não foi possível salvar.';fb.dataset.type='error'}finally{btn.disabled=false}
  };
}

function whatsappPhone(phone){let digits=String(phone||'').replace(/\D/g,'');if(!digits)return'';if(!digits.startsWith('55')&&digits.length<=11)digits=`55${digits}`;return digits}
function shareMessage(proposal,items){
  const sorted=[...(items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  if(!sorted.length)return `Proposta #${proposal.proposal_no} · Croma Gráfica e Papelaria`;
  const common=sorted.filter(i=>i.metadata?.proposal_mode==='common');
  const alternatives=sorted.filter(i=>i.metadata?.proposal_mode==='alternative');
  const commonTotal=common.reduce((s,i)=>s+Number(itemPricing(i).final||i.line_total||0),0);
  const lines=[`*Proposta #${proposal.proposal_no} — ${proposal.customer_name}*`];
  if(common.length){
    lines.push('');
    common.forEach(i=>lines.push(`• ${(i.share_description||i.description||'Serviço').trim()}: *${money.format(Number(itemPricing(i).final||i.line_total||0))}*`));
  }
  if(alternatives.length){
    alternatives.forEach((i,index)=>{
      const p=itemPricing(i),value=Number(p.final||i.line_total||0),total=value+commonTotal;
      lines.push('',`*${i.option_label||`Opção ${index+1}`}*`,(i.share_description||i.description||'').trim(),`Quantidade: ${Number(i.quantity||1).toLocaleString('pt-BR')} ${i.unit||'un'}`,`Valor da opção: *${money.format(value)}*`);
      if(commonTotal>0)lines.push(`Total com serviços comuns: *${money.format(total)}*`);
    });
  }else{
    sorted.filter(i=>!common.includes(i)).forEach(i=>{
      const p=itemPricing(i);lines.push('',`*${i.option_label||i.description||'Item'}*`,`${Number(i.quantity||1).toLocaleString('pt-BR')} ${i.unit||'un'} · *${money.format(Number(p.final||i.line_total||0))}*`);
    });
  }
  lines.push('','Croma Gráfica e Papelaria');
  return lines.join('\n');
}
async function loadImage(url){if(!url)return null;try{const res=await fetch(url,{mode:'cors'});if(!res.ok)throw new Error('imagem');const blob=await res.blob(),obj=URL.createObjectURL(blob),img=new Image();await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=obj});URL.revokeObjectURL(obj);return img}catch{return null}}
async function buildCard(proposal,items,canvas){
  const sorted=[...(items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const ctx=canvas.getContext('2d'),W=1080,H=1350;canvas.width=W;canvas.height=H;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#30297F';ctx.fillRect(0,0,W,150);ctx.fillStyle='#fff';ctx.font='bold 60px Arial';ctx.fillText('CROMA',70,95);ctx.font='28px Arial';ctx.fillText('Gráfica e Papelaria',330,94);
  ctx.fillStyle='#211c5c';ctx.font='bold 48px Arial';ctx.fillText(`Proposta #${proposal.proposal_no}`,70,235);ctx.font='bold 38px Arial';wrapText(ctx,proposal.customer_name||'Cliente',70,290,940,48,2);
  const common=sorted.filter(i=>i.metadata?.proposal_mode==='common'),alternatives=sorted.filter(i=>i.metadata?.proposal_mode==='alternative'),commonTotal=common.reduce((s,i)=>s+Number(itemPricing(i).final||i.line_total||0),0);
  let y=395;
  if(common.length){ctx.fillStyle='#706d80';ctx.font='28px Arial';common.forEach(i=>{wrapText(ctx,`+ ${i.option_label||i.description}: ${money.format(Number(itemPricing(i).final||i.line_total||0))}`,70,y,940,38,2);y+=70;});}
  const cards=alternatives.length?alternatives:sorted.filter(i=>!common.includes(i));
  cards.forEach((i,index)=>{const p=itemPricing(i),value=Number(p.final||i.line_total||0),total=value+(alternatives.length?commonTotal:0);ctx.fillStyle='#f4f3f9';ctx.fillRect(70,y,940,230);ctx.fillStyle='#30297F';ctx.font='bold 34px Arial';wrapText(ctx,i.option_label||`Opção ${index+1}`,95,y+52,890,42,2);ctx.fillStyle='#211c5c';ctx.font='28px Arial';wrapText(ctx,(i.share_description||i.description||'').replace(/\s+/g,' ').trim(),95,y+112,890,34,2);ctx.fillStyle='#30297F';ctx.font='bold 40px Arial';ctx.fillText(money.format(total),95,y+205);y+=255;});
  ctx.fillStyle='#706d80';ctx.font='24px Arial';ctx.fillText('Valores sujeitos à validade informada na proposta.',70,1280);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
}
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines){const words=text.split(' ');let line='',lines=0;for(let i=0;i<words.length;i++){const test=line+words[i]+' ';if(ctx.measureText(test).width>maxWidth&&i>0){ctx.fillText(line.trim(),x,y);line=words[i]+' ';y+=lineHeight;lines++;if(lines>=maxLines-1)break}else line=test}if(lines<maxLines)ctx.fillText(line.trim(),x,y)}

async function openShare(proposal){
  const items=[...(proposal.sales_proposal_items||[])].sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));if(!items.length)return;const message=shareMessage(proposal,items);
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true"><h2>Encaminhar proposta #${esc(proposal.proposal_no)}</h2><p class="modal-lead">Revise a imagem e a mensagem antes de compartilhar.</p><div class="share-layout"><div class="share-card-wrap"><canvas id="shareCanvas"></canvas></div><div><div class="field"><label>Mensagem</label><textarea id="shareMessage" class="share-message">${esc(message)}</textarea></div><p class="share-note">O link do WhatsApp consegue preencher o texto, mas não anexar uma imagem automaticamente. No computador, use “Copiar imagem” e depois cole no WhatsApp. No celular compatível, “Compartilhar imagem + mensagem” abre o compartilhamento nativo.</p><div id="shareFeedback" class="modal-feedback"></div><div class="modal-actions"><button class="mini-btn alt" id="copyMessage">Copiar mensagem</button><button class="mini-btn alt" id="copyImage">Copiar imagem</button><button class="mini-btn" id="nativeShare">Compartilhar imagem + mensagem</button><button class="mini-btn share" id="openWhatsApp">Abrir WhatsApp</button><button class="mini-btn alt" data-close>Fechar</button></div></div></div></section></div>`);
  const root=document.getElementById('proposalModalRoot'),canvas=root.querySelector('#shareCanvas'),fb=root.querySelector('#shareFeedback');fb.textContent='Gerando imagem…';const blob=await buildCard(proposal,items,canvas);fb.textContent='Prévia pronta.';fb.dataset.type='success';
  root.querySelector('[data-close]').onclick=closeModal;root.querySelector('[data-modal-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  root.querySelector('#copyMessage').onclick=async()=>{try{await navigator.clipboard.writeText(root.querySelector('#shareMessage').value);fb.textContent='Mensagem copiada.';fb.dataset.type='success'}catch{fb.textContent='Não foi possível copiar a mensagem.';fb.dataset.type='error'}};
  root.querySelector('#copyImage').onclick=async()=>{try{if(!blob||!window.ClipboardItem)throw new Error();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);fb.textContent='Imagem copiada. Cole no WhatsApp com Ctrl+V.';fb.dataset.type='success'}catch{fb.textContent='Este navegador não permitiu copiar a imagem. Use o compartilhamento nativo ou salve pela prévia.';fb.dataset.type='error'}};
  root.querySelector('#nativeShare').onclick=async()=>{try{if(!blob||!navigator.share)throw new Error();const file=new File([blob],`proposta-${proposal.proposal_no}.png`,{type:'image/png'}),payload={title:`Proposta #${proposal.proposal_no}`,text:root.querySelector('#shareMessage').value,files:[file]};if(navigator.canShare&&!navigator.canShare({files:[file]}))throw new Error();await navigator.share(payload)}catch(error){if(error?.name!=='AbortError'){fb.textContent='Compartilhamento de arquivo não disponível neste navegador.';fb.dataset.type='error'}}};
  root.querySelector('#openWhatsApp').onclick=()=>{const phone=whatsappPhone(proposal.customer_phone),text=encodeURIComponent(root.querySelector('#shareMessage').value),url=phone?`https://wa.me/${phone}?text=${text}`:`https://wa.me/?text=${text}`;window.open(url,'_blank','noopener')};
}

function proposalAudit(){
  const items=proposals.flatMap(p=>p.sales_proposal_items||[]);
  const withoutProduct=items.filter(i=>!i.product_id).length;
  const withoutCustomer=proposals.filter(p=>!p.customer_id).length;
  const notSynced=proposals.filter(p=>p.bling_sync_status!=='synced').length;
  const host=document.getElementById('proposalAudit');
  if(host)host.textContent=`Revisão: ${withoutProduct} de ${items.length} itens sem produto · ${withoutCustomer} de ${proposals.length} propostas sem contato · ${notSynced} propostas não sincronizadas com o Bling. Estes indicadores não significam que os registros sejam duplicados ou incorretos.`;
}
function applyProposalFilters(message=''){
  const list=document.getElementById('proposalsList'),feedback=document.getElementById('proposalFeedback');
  const term=(document.getElementById('proposalSearch')?.value||'').trim().toLowerCase();
  const mode=document.getElementById('proposalReviewFilter')?.value||'all';
  let visible=0;
  list.querySelectorAll('.proposal-card').forEach(card=>{
    const p=proposals.find(row=>row.id===card.dataset.proposalId);
    if(!p)return;
    const match=!term||card.dataset.search.includes(term);
    const review=mode==='all'||(mode==='product'&&(p.sales_proposal_items||[]).some(i=>!i.product_id))||(mode==='customer'&&!p.customer_id)||(mode==='bling'&&p.bling_sync_status!=='synced');
    card.hidden=!(match&&review);if(match&&review)visible++;
  });
  feedback.textContent=message||`${visible} proposta(s) exibida(s) de ${proposals.length}.`;
  feedback.dataset.type=message?'success':'';
}
async function refreshList(successMessage=''){
  const list=document.getElementById('proposalsList'),feedback=document.getElementById('proposalFeedback');feedback.textContent='Carregando propostas…';feedback.dataset.type='';
  try{
    await loadProposals();
    list.innerHTML=proposals.length?proposals.map(renderProposal).join(''):'<p class="empty">Nenhuma proposta cadastrada.</p>';
    proposalAudit();applyProposalFilters(successMessage);
  }catch(error){list.innerHTML='<p class="empty">Não foi possível carregar as propostas.</p>';feedback.textContent=error.message||'Falha ao carregar propostas.';feedback.dataset.type='error'}
}

export async function initProposalsAdmin(){
  const list=document.getElementById('proposalsList'),search=document.getElementById('proposalSearch'),filter=document.getElementById('proposalReviewFilter');await refreshList();
  search?.addEventListener('input',()=>applyProposalFilters());
  filter?.addEventListener('change',()=>applyProposalFilters());
  list.addEventListener('click',async event=>{const card=event.target.closest('.proposal-card'),button=event.target.closest('[data-action]');if(!card||!button)return;const proposal=proposals.find(p=>p.id===card.dataset.proposalId);if(!proposal)return;if(button.dataset.action==='edit')await openEdit(proposal);if(button.dataset.action==='link-customer')await openLinkCustomer(proposal);if(button.dataset.action==='link-product'){const item=proposal.sales_proposal_items?.find(i=>i.id===button.dataset.itemId);if(item)await openLinkProduct(proposal,item)}if(button.dataset.action==='edit-item'){const item=proposal.sales_proposal_items?.find(i=>i.id===button.dataset.itemId);if(item)await openEdit(proposal,item)}if(button.dataset.action==='share')await openShare(proposal)});
}
