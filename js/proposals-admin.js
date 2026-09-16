import { supabase } from '/js/croma-supabase.js';

const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const dateTime=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'});
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const statusLabel=status=>({draft:'Rascunho',sent:'Enviada',approved:'Aprovada',rejected:'Recusada',expired:'Expirada',cancelled:'Cancelada'})[status]||status||'Rascunho';
const pct=value=>Number.isFinite(value)?`${value.toFixed(2).replace('.',',')}%`:'—';
const multiplier=value=>Number.isFinite(value)&&value>0?`${value.toFixed(2).replace('.',',')}×`:'—';
const n=value=>{const x=Number(String(value??'').replace(',','.'));return Number.isFinite(x)?x:null};
let proposals=[];
let productsCache=null;

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
    <header class="proposal-head"><div><span class="proposal-number">Proposta #${esc(proposal.proposal_no)}</span><h2>${esc(proposal.customer_name)}</h2><p>${esc(proposal.customer_phone||'Sem telefone')}</p></div><div class="proposal-head-side"><span class="status">${esc(statusLabel(proposal.status))}</span><button class="mini-btn alt" data-action="edit">Editar</button><button class="mini-btn share" data-action="share">Encaminhar proposta</button></div></header>
    ${proposal.notes?`<p class="notes">${esc(proposal.notes)}</p>`:''}<div class="proposal-items">${items.length?items.map(renderItem).join(''):'<p class="empty">Sem itens nesta proposta.</p>'}</div>
    <footer>Criada em ${esc(dateTime.format(new Date(proposal.created_at)))}</footer>
  </article>`;
}

async function loadProposals(){
  const {data,error}=await supabase.from('sales_proposals').select('id,proposal_no,customer_name,customer_phone,status,notes,created_at,sales_proposal_items(id,product_id,supplier_id,supplier_catalog_item_id,description,share_description,option_label,quantity,unit,supplier_sku,base_cost,freight_cost,total_cost,recommended_markup,applied_markup,unit_price,line_total,sort_order,market_reference_price,suggested_price,final_offer_price,image_url,market_reference_source,market_researched_at,market_reference_metadata)').order('created_at',{ascending:false}).limit(200);
  if(error) throw error; proposals=data||[]; return proposals;
}
async function loadProducts(){
  if(productsCache)return productsCache;
  const {data,error}=await supabase.from('products').select('id,nome,sku,descricao,short_description,default_markup').eq('ativo',true).eq('is_sellable',true).order('nome').limit(3500);
  if(error)throw error; productsCache=data||[]; return productsCache;
}
async function getProductSnapshot(productId){
  const product=(await loadProducts()).find(p=>p.id===productId)||null;
  const [{data:supplier,error:sErr},{data:media,error:mErr}]=await Promise.all([
    supabase.from('product_suppliers').select('supplier_id,supplier_catalog_item_id,supplier_sku,purchase_price,freight_cost,effective_unit_cost,preferred,active').eq('product_id',productId).eq('active',true).order('preferred',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('product_media').select('url').eq('product_id',productId).eq('ativo',true).eq('kind','image').order('is_primary',{ascending:false}).order('ordem',{ascending:true}).limit(1).maybeSingle()
  ]);
  if(sErr)throw sErr;if(mErr)throw mErr;return {product,supplier:supplier||null,imageUrl:media?.url||null};
}

function optionProductHtml(products,currentId){return products.map(p=>`<option value="${esc(p.id)}" ${p.id===currentId?'selected':''}>${esc(p.nome)}${p.sku?` · ${esc(p.sku)}`:''}</option>`).join('')}

async function openEdit(proposal){
  const item=proposal.sales_proposal_items?.[0]; if(!item)return;
  let products=[]; try{products=await loadProducts()}catch(error){alert(error.message);return}
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true"><h2>Editar proposta #${esc(proposal.proposal_no)}</h2><p class="modal-lead">As alterações ficam somente nesta cotação e não mudam automaticamente o cadastro mestre do produto.</p>
    <div class="form-grid"><div class="field"><label>Cliente</label><input id="editCustomer" value="${esc(proposal.customer_name)}"></div><div class="field"><label>Telefone</label><input id="editPhone" value="${esc(proposal.customer_phone||'')}"></div><div class="field"><label>Status</label><select id="editStatus">${['draft','sent','approved','rejected','expired','cancelled'].map(s=>`<option value="${s}" ${s===proposal.status?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></div><div class="field full"><label>Observações internas</label><textarea id="editNotes">${esc(proposal.notes||'')}</textarea></div></div>
    <div class="form-section"><h3>Item da proposta</h3><div class="form-grid"><div class="field full"><label>Produto vinculado</label><select id="editProduct"><option value="">Sem produto vinculado</option>${optionProductHtml(products,item.product_id)}</select></div><div class="field full"><label>Descrição comercial</label><textarea id="editDescription">${esc(item.share_description||item.description||'')}</textarea></div><div class="field"><label>Quantidade</label><input id="editQuantity" type="number" min="0.01" step="0.01" value="${esc(item.quantity)}"></div><div class="field"><label>Markup desta cotação</label><input id="editMarkup" type="number" min="0.01" step="0.01" value="${esc(item.applied_markup||item.recommended_markup||'')}"></div><div class="field"><label>Custo fornecedor</label><input id="editBaseCost" type="number" min="0" step="0.01" value="${esc(item.base_cost)}"></div><div class="field"><label>Frete</label><input id="editFreight" type="number" min="0" step="0.01" value="${esc(item.freight_cost)}"></div><div class="field"><label>Preço de mercado</label><input id="editMarket" type="number" min="0" step="0.01" value="${esc(item.market_reference_price??'')}"></div><div class="field"><label>Preço sugerido</label><input id="editSuggested" type="number" min="0" step="0.01" value="${esc(item.suggested_price??'')}"></div><div class="field"><label>Preço final ao cliente</label><input id="editFinal" type="number" min="0" step="0.01" value="${esc(item.final_offer_price??item.suggested_price??item.line_total)}"></div><div class="field"><label>Imagem da proposta (URL)</label><input id="editImage" value="${esc(item.image_url||'')}"></div></div><div id="editCalc" class="analysis-strip"></div></div>
    <div id="editFeedback" class="modal-feedback"></div><div class="modal-actions"><button class="mini-btn alt" data-close>Cancelar</button><button class="mini-btn" id="saveEdit">Salvar alterações</button></div></section></div>`);
  const root=document.getElementById('proposalModalRoot');
  const calc=()=>{const base=n(root.querySelector('#editBaseCost').value)||0, freight=n(root.querySelector('#editFreight').value)||0, markup=n(root.querySelector('#editMarkup').value)||0, cost=base+freight, price=cost*markup;root.querySelector('#editCalc').innerHTML=`<span>Custo total: <b>${money.format(cost)}</b></span><span>Preço pelo markup: <b>${money.format(price)}</b></span>`};
  ['#editBaseCost','#editFreight','#editMarkup'].forEach(sel=>root.querySelector(sel).addEventListener('input',calc));calc();
  root.querySelector('#editProduct').addEventListener('change',async e=>{if(!e.target.value)return;const fb=root.querySelector('#editFeedback');fb.textContent='Carregando dados do produto…';try{const snap=await getProductSnapshot(e.target.value);if(snap.product){root.querySelector('#editDescription').value=snap.product.short_description||snap.product.nome;root.querySelector('#editMarkup').value=snap.product.default_markup||root.querySelector('#editMarkup').value}if(snap.supplier){root.querySelector('#editBaseCost').value=snap.supplier.purchase_price||0;root.querySelector('#editFreight').value=snap.supplier.freight_cost||0}if(snap.imageUrl)root.querySelector('#editImage').value=snap.imageUrl;calc();fb.textContent='Dados do produto carregados. Revise antes de salvar.'}catch(error){fb.textContent=error.message;fb.dataset.type='error'}});
  root.querySelector('[data-close]').onclick=closeModal;root.querySelector('[data-modal-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  root.querySelector('#saveEdit').onclick=async()=>{
    const fb=root.querySelector('#editFeedback'),btn=root.querySelector('#saveEdit'),productId=root.querySelector('#editProduct').value||null;
    const base=n(root.querySelector('#editBaseCost').value)||0,freight=n(root.querySelector('#editFreight').value)||0,markup=n(root.querySelector('#editMarkup').value)||0,qty=n(root.querySelector('#editQuantity').value);
    const market=n(root.querySelector('#editMarket').value),suggested=n(root.querySelector('#editSuggested').value),finalPrice=n(root.querySelector('#editFinal').value);
    if(!root.querySelector('#editCustomer').value.trim()||!qty||qty<=0||markup<=0||finalPrice==null||finalPrice<0){fb.textContent='Revise cliente, quantidade, markup e preço final.';fb.dataset.type='error';return}
    btn.disabled=true;fb.textContent='Salvando…';
    try{
      let supplierData={};if(productId&&productId!==item.product_id){const snap=await getProductSnapshot(productId);supplierData={supplier_id:snap.supplier?.supplier_id||null,supplier_catalog_item_id:snap.supplier?.supplier_catalog_item_id||null,supplier_sku:snap.supplier?.supplier_sku||null};}
      const totalCost=base+freight,markupTotal=Number((totalCost*markup).toFixed(2));
      const {error:pError}=await supabase.from('sales_proposals').update({customer_name:root.querySelector('#editCustomer').value.trim(),customer_phone:root.querySelector('#editPhone').value.trim()||null,status:root.querySelector('#editStatus').value,notes:root.querySelector('#editNotes').value.trim()||null,updated_at:new Date().toISOString()}).eq('id',proposal.id);if(pError)throw pError;
      const {error:iError}=await supabase.from('sales_proposal_items').update({product_id:productId,description:root.querySelector('#editDescription').value.trim(),share_description:root.querySelector('#editDescription').value.trim(),quantity:qty,base_cost:base,freight_cost:freight,total_cost:totalCost,applied_markup:markup,line_total:markupTotal,unit_price:markupTotal/qty,market_reference_price:market,suggested_price:suggested,final_offer_price:finalPrice,image_url:root.querySelector('#editImage').value.trim()||null,...supplierData}).eq('id',item.id);if(iError)throw iError;
      closeModal();await refreshList('Proposta atualizada.');
    }catch(error){fb.textContent=error.message||'Não foi possível salvar.';fb.dataset.type='error'}finally{btn.disabled=false}
  };
}

function whatsappPhone(phone){let digits=String(phone||'').replace(/\D/g,'');if(!digits)return'';if(!digits.startsWith('55')&&digits.length<=11)digits=`55${digits}`;return digits}
function shareMessage(proposal,item){const p=itemPricing(item),desc=(item.share_description||item.description||'Produto').trim();return `*${desc}*\nQuantidade: ${Number(item.quantity||1).toLocaleString('pt-BR')} ${item.unit||'un'}\nValor: *${money.format(p.final||p.suggested||p.markupPrice)}*\n\nProposta #${proposal.proposal_no} · Croma Gráfica e Papelaria`;}
async function loadImage(url){if(!url)return null;try{const res=await fetch(url,{mode:'cors'});if(!res.ok)throw new Error('imagem');const blob=await res.blob(),obj=URL.createObjectURL(blob),img=new Image();await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=obj});URL.revokeObjectURL(obj);return img}catch{return null}}
async function buildCard(proposal,item,canvas){
  const ctx=canvas.getContext('2d'),W=1080,H=1350;canvas.width=W;canvas.height=H;ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#30297F';ctx.fillRect(0,0,W,150);ctx.fillStyle='#fff';ctx.font='bold 60px Arial';ctx.fillText('CROMA',70,95);ctx.font='28px Arial';ctx.fillText('Gráfica e Papelaria',330,94);
  const img=await loadImage(item.image_url);ctx.fillStyle='#f4f3f9';ctx.fillRect(70,200,940,600);if(img){const scale=Math.min(900/img.width,560/img.height),w=img.width*scale,h=img.height*scale;ctx.drawImage(img,540-w/2,500-h/2,w,h)}else{ctx.fillStyle='#706d80';ctx.font='32px Arial';ctx.textAlign='center';ctx.fillText('Imagem do produto',540,500);ctx.textAlign='left'}
  const title=(item.share_description||item.description||'Produto').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();ctx.fillStyle='#211c5c';ctx.font='bold 44px Arial';wrapText(ctx,title,70,875,940,56,3);ctx.fillStyle='#706d80';ctx.font='34px Arial';ctx.fillText(`Quantidade: ${Number(item.quantity||1).toLocaleString('pt-BR')} ${item.unit||'un'}`,70,1090);ctx.fillStyle='#30297F';ctx.font='bold 64px Arial';ctx.fillText(money.format(itemPricing(item).final),70,1195);ctx.fillStyle='#706d80';ctx.font='24px Arial';ctx.fillText(`Proposta #${proposal.proposal_no}`,70,1280);
  return new Promise(resolve=>canvas.toBlob(resolve,'image/png',0.95));
}
function wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines){const words=text.split(' ');let line='',lines=0;for(let i=0;i<words.length;i++){const test=line+words[i]+' ';if(ctx.measureText(test).width>maxWidth&&i>0){ctx.fillText(line.trim(),x,y);line=words[i]+' ';y+=lineHeight;lines++;if(lines>=maxLines-1)break}else line=test}if(lines<maxLines)ctx.fillText(line.trim(),x,y)}

async function openShare(proposal){
  const item=proposal.sales_proposal_items?.[0];if(!item)return;const message=shareMessage(proposal,item);
  setModal(`<div class="modal-backdrop" data-modal-close><section class="modal" role="dialog" aria-modal="true"><h2>Encaminhar proposta #${esc(proposal.proposal_no)}</h2><p class="modal-lead">Revise a imagem e a mensagem antes de compartilhar.</p><div class="share-layout"><div class="share-card-wrap"><canvas id="shareCanvas"></canvas></div><div><div class="field"><label>Mensagem</label><textarea id="shareMessage" class="share-message">${esc(message)}</textarea></div><p class="share-note">O link do WhatsApp consegue preencher o texto, mas não anexar uma imagem automaticamente. No computador, use “Copiar imagem” e depois cole no WhatsApp. No celular compatível, “Compartilhar imagem + mensagem” abre o compartilhamento nativo.</p><div id="shareFeedback" class="modal-feedback"></div><div class="modal-actions"><button class="mini-btn alt" id="copyMessage">Copiar mensagem</button><button class="mini-btn alt" id="copyImage">Copiar imagem</button><button class="mini-btn" id="nativeShare">Compartilhar imagem + mensagem</button><button class="mini-btn share" id="openWhatsApp">Abrir WhatsApp</button><button class="mini-btn alt" data-close>Fechar</button></div></div></div></section></div>`);
  const root=document.getElementById('proposalModalRoot'),canvas=root.querySelector('#shareCanvas'),fb=root.querySelector('#shareFeedback');fb.textContent='Gerando imagem…';const blob=await buildCard(proposal,item,canvas);fb.textContent='Prévia pronta.';fb.dataset.type='success';
  root.querySelector('[data-close]').onclick=closeModal;root.querySelector('[data-modal-close]').addEventListener('click',e=>{if(e.target===e.currentTarget)closeModal()});
  root.querySelector('#copyMessage').onclick=async()=>{try{await navigator.clipboard.writeText(root.querySelector('#shareMessage').value);fb.textContent='Mensagem copiada.';fb.dataset.type='success'}catch{fb.textContent='Não foi possível copiar a mensagem.';fb.dataset.type='error'}};
  root.querySelector('#copyImage').onclick=async()=>{try{if(!blob||!window.ClipboardItem)throw new Error();await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);fb.textContent='Imagem copiada. Cole no WhatsApp com Ctrl+V.';fb.dataset.type='success'}catch{fb.textContent='Este navegador não permitiu copiar a imagem. Use o compartilhamento nativo ou salve pela prévia.';fb.dataset.type='error'}};
  root.querySelector('#nativeShare').onclick=async()=>{try{if(!blob||!navigator.share)throw new Error();const file=new File([blob],`proposta-${proposal.proposal_no}.png`,{type:'image/png'}),payload={title:`Proposta #${proposal.proposal_no}`,text:root.querySelector('#shareMessage').value,files:[file]};if(navigator.canShare&&!navigator.canShare({files:[file]}))throw new Error();await navigator.share(payload)}catch(error){if(error?.name!=='AbortError'){fb.textContent='Compartilhamento de arquivo não disponível neste navegador.';fb.dataset.type='error'}}};
  root.querySelector('#openWhatsApp').onclick=()=>{const phone=whatsappPhone(proposal.customer_phone),text=encodeURIComponent(root.querySelector('#shareMessage').value),url=phone?`https://wa.me/${phone}?text=${text}`:`https://wa.me/?text=${text}`;window.open(url,'_blank','noopener')};
}

async function refreshList(successMessage=''){
  const list=document.getElementById('proposalsList'),feedback=document.getElementById('proposalFeedback');feedback.textContent='Carregando propostas…';feedback.dataset.type='';
  try{await loadProposals();list.innerHTML=proposals.length?proposals.map(renderProposal).join(''):'<p class="empty">Nenhuma proposta cadastrada.</p>';feedback.textContent=successMessage||`${proposals.length} proposta(s) encontrada(s).`;feedback.dataset.type=successMessage?'success':''}catch(error){list.innerHTML='<p class="empty">Não foi possível carregar as propostas.</p>';feedback.textContent=error.message||'Falha ao carregar propostas.';feedback.dataset.type='error'}
}

export async function initProposalsAdmin(){
  const list=document.getElementById('proposalsList'),search=document.getElementById('proposalSearch'),feedback=document.getElementById('proposalFeedback');await refreshList();
  search?.addEventListener('input',()=>{const term=search.value.trim().toLowerCase();let visible=0;list.querySelectorAll('.proposal-card').forEach(card=>{const show=!term||card.dataset.search.includes(term);card.hidden=!show;if(show)visible++});feedback.textContent=term?`${visible} proposta(s) encontrada(s).`:`${proposals.length} proposta(s) encontrada(s).`});
  list.addEventListener('click',async event=>{const card=event.target.closest('.proposal-card'),button=event.target.closest('[data-action]');if(!card||!button)return;const proposal=proposals.find(p=>p.id===card.dataset.proposalId);if(!proposal)return;if(button.dataset.action==='edit')await openEdit(proposal);if(button.dataset.action==='share')await openShare(proposal)});
}
