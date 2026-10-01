import { supabase } from './croma-supabase.js';
import { loadPrimaryMedia } from './public-catalog-data.js';
import { loadCommercialActions } from './commercial-areas-data.js?v=20261001-lot1';
import { getPublicCampaign } from './campaigns-public-data.js?v=20261001-lot1';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const quoteBase='https://wa.me/553230253588?text=';

function productHref(product){return `/produtos/?produto=${encodeURIComponent(product.slug||product.id)}`}
function validPrice(product){return Number(product.preco||product.commercial_min_price||0)>0}
function effectiveAction(product,action){return validPrice(product)&&['buy','configure'].includes(action)?action:'quote'}
function actionLabel(action){return action==='configure'?'Configurar e comprar':action==='buy'?'Comprar':'Solicitar orçamento'}

function quoteForm(row){
  const materialValue=row.materialDefault?` value="${esc(row.materialDefault)}"`:'';
  const materialPlaceholder=row.materialPlaceholder?` placeholder="${esc(row.materialPlaceholder)}"`:'';
  const finishPlaceholder=row.finishPlaceholder?` placeholder="${esc(row.finishPlaceholder)}"`:'';
  return `<details><summary>Ver opções e solicitar orçamento</summary><form data-campaign-quote="${esc(row.id)}"><label>Quantidade desejada<input name="quantity" type="number" min="1" step="1" required></label><label>Material<input name="material" required${materialValue}${materialPlaceholder}></label><label>Medidas e acabamento<input name="finish"${finishPlaceholder}></label><label>Prazo desejado<input name="deadline" type="date"></label><label>Arte<select name="art"><option>Já tenho a arte</option><option>Preciso criar a arte</option><option>Preciso ajustar a arte</option></select></label><p>O prazo será confirmado após avaliação da arte. Envie o arquivo no atendimento; criação e ajustes serão cotados quando necessários.</p><button class="ca-action quote" type="submit">Solicitar orçamento no WhatsApp</button></form></details>`;
}

function directAction(row){
  const price=Number(row.product.preco||row.product.commercial_min_price||0);
  return `<div class="ca-product-price">${esc(money(price))}</div><a class="ca-action ${row.action==='configure'?'configure':''}" href="${esc(productHref(row.product))}">${esc(actionLabel(row.action))}</a>`;
}

export async function renderCampaignSelection(root,{campaignKey='empresa-v2'}={}){
  const campaign=getPublicCampaign(campaignKey);
  if(!campaign)throw new Error(`Campanha pública não encontrada: ${campaignKey}`);
  const ids=campaign.products.map(item=>item.id);
  const [{data,error},media,actions]=await Promise.all([
    supabase.from('public_catalog_products').select('id,slug,nome,preco,commercial_min_price,product_type,ativo,published_on_site,is_sellable').in('id',ids),
    loadPrimaryMedia(ids).catch(()=>new Map()),
    loadCommercialActions(ids)
  ]);
  if(error)throw error;
  const byId=new Map((data||[]).map(product=>[product.id,product]));
  const rows=campaign.products.map(config=>{
    const product=byId.get(config.id);
    if(!product)return null;
    const action=effectiveAction(product,actions.get(config.id));
    return {...config,product,action};
  }).filter(Boolean);
  root.innerHTML=`<div class="ca-shell"><div class="ca-section-head"><div><span class="ca-eyebrow">Seleção da campanha</span><h2>${esc(campaign.title)}</h2></div><p>${esc(campaign.intro)}</p></div><div class="ca-product-grid">${rows.map(row=>`<article class="ca-product-card"><div class="ca-product-media">${media.get(row.id)?.url?`<img src="${esc(media.get(row.id).url)}" alt="${esc(row.label)}" loading="lazy">`:'<div class="ca-empty">Imagem em atualização</div>'}</div><div class="ca-product-copy"><small>Comunicação & Marketing</small><h3>${esc(row.label)}</h3><p>${esc(row.summary)}</p>${row.action==='quote'?quoteForm(row):directAction(row)}</div></article>`).join('')||'<p>Consulte nossa equipe sobre os materiais da campanha.</p>'}</div></div>`;
  root.querySelectorAll('[data-campaign-quote]').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();
    const row=rows.find(item=>item.id===form.dataset.campaignQuote);
    if(!row)return;
    const values=new FormData(form);
    const text=[`Olá! Vim pela campanha ${campaign.title}`,`Produto: ${row.label}`,`Referência: ${row.id}`,`Quantidade: ${values.get('quantity')}`,`Material: ${values.get('material')}`,`Medidas/acabamento: ${values.get('finish')||'A definir'}`,`Prazo desejado: ${values.get('deadline')||'A combinar'}`,`Arte: ${values.get('art')}`].join('\n');
    window.open(`${quoteBase}${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  }));
}
