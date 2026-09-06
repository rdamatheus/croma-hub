import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[m]));
let proposalMap=new Map();

function installContext(){
  const batch=document.querySelector('#processBatch');
  if(batch)batch.textContent='Analisar próximos 20';
  const card=document.querySelector('#panel-moderation .tx-card');
  if(card&&!card.querySelector('.tx-market-context')){
    const p=document.createElement('p');
    p.className='tx-help tx-market-context';
    p.innerHTML='<strong>Base comercial:</strong> as sugestões são comparadas com referências de mercado de Kalunga, Mercado Livre e FuturaIM. A IA propõe; você continua aprovando antes de criar ou aplicar categorias.';
    const status=card.querySelector('#moderationStatus');
    if(status)card.insertBefore(p,status);else card.appendChild(p);
  }
}

async function load(){
  const {data,error}=await supabase.from('taxonomy_category_proposals').select('id,evidence').order('created_at',{ascending:false}).limit(1000);
  if(error)throw error;
  proposalMap=new Map((data||[]).map(x=>[x.id,x]));
  enhance();
}

function enhance(){
  document.querySelectorAll('#categoryProposals .tx-proposal').forEach(card=>{
    if(card.querySelector('.tx-market-basis'))return;
    const source=card.querySelector('[data-approve-cat],[data-merge-cat],[data-reject-cat]');
    const id=source?.dataset.approveCat||source?.dataset.mergeCat||source?.dataset.rejectCat;
    if(!id)return;
    const basis=proposalMap.get(id)?.evidence?.market_basis;
    if(!Array.isArray(basis)||!basis.length)return;
    const box=document.createElement('div');
    box.className='tx-market-basis tx-reason';
    box.innerHTML=`<strong>Base comercial:</strong> ${basis.slice(0,4).map(esc).join(' · ')}`;
    const actions=card.querySelector('.tx-actions');
    if(actions)card.insertBefore(box,actions);else card.appendChild(box);
  });
}

installContext();
const root=document.querySelector('#categoryProposals');
if(root)new MutationObserver(()=>{enhance();setTimeout(load,120)}).observe(root,{childList:true,subtree:true});
load().catch(e=>console.error('taxonomy_market_basis_ui',e));
