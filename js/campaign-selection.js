import { supabase } from './croma-supabase.js';
import { loadPrimaryMedia } from './public-catalog-data.js';
const selected = [
  {id:'b7cb09f8-1949-4d91-a3bc-dcf584580c0e',label:'Cartão de visita'},
  {id:'c89ab487-a081-4733-bbd4-2c6f3a5fab28',label:'Adesivo vinil'},
  {id:'bc444bb7-e0df-4d34-b364-6e117ef56f2f',label:'Panfleto A4'},
  {id:'c086cd87-507a-4d00-b7c5-df21656a2802',label:'Bloco autocopiativo'}
];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
export async function renderCampaignSelection(root){
  const {data,error}=await supabase.from('public_catalog_products').select('id,nome,short_description').in('id',selected.map(x=>x.id));
  if(error)throw error;
  const media=await loadPrimaryMedia((data||[]).map(x=>x.id)).catch(()=>new Map());
  const rows=selected.map(x=>({...x,product:data?.find(p=>p.id===x.id)})).filter(x=>x.product);
  root.innerHTML=`<div class="ca-shell"><div class="ca-section-head"><div><span class="ca-eyebrow">Seleção da campanha</span><h2>Sua empresa precisa aparecer.</h2></div><p>Escolha o material e conte o que precisa. Confirmaremos preço, produção e recebimento no orçamento.</p></div><div class="ca-product-grid">${rows.map(({id,label,product})=>`<article class="ca-product-card"><div class="ca-product-copy">${media.get(id)?.url?`<img src="${esc(media.get(id).url)}" alt="${esc(label)}" loading="lazy" style="width:100%;height:180px;object-fit:contain">`:''}<h3>${esc(label)}</h3><p>${esc(product.nome)}</p><details><summary>Ver opções e solicitar orçamento</summary><form data-campaign-quote="${esc(id)}"><label>Quantidade desejada<input name="quantity" type="number" min="1" step="1" required></label><label>Medidas e acabamento<input name="finish" placeholder="Ex.: frente e verso, tamanho, laminação"></label><label>Prazo desejado<input name="deadline" type="date"></label><label>Arte<select name="art"><option>Já tenho a arte</option><option>Preciso criar a arte</option><option>Preciso ajustar a arte</option></select></label><p>O prazo será confirmado após avaliação da arte. Envie o arquivo no atendimento; criação e ajustes serão cotados quando necessários.</p><button class="ca-action" type="submit">Solicitar orçamento no WhatsApp</button></form></details></div></article>`).join('')||'<p>Consulte nossa equipe sobre os materiais da campanha.</p>'}</div></div>`;
  root.querySelectorAll('[data-campaign-quote]').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();
    const row=rows.find(x=>x.id===form.dataset.campaignQuote),values=new FormData(form);
    const text=[`Olá! Vim pela campanha Sua empresa precisa aparecer.`, `Produto: ${row.product.nome}`, `Referência: ${row.id}`, `Quantidade: ${values.get('quantity')}`, `Medidas/acabamento: ${values.get('finish')||'A definir'}`, `Prazo desejado: ${values.get('deadline')||'A combinar'}`, `Arte: ${values.get('art')}`].join('\n');
    window.open(`https://wa.me/553230253588?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
  }));
}
