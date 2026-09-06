import { supabase } from './croma-supabase.js';

const root=document.querySelector('#segmentCatalogRoot');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

try{
  const[s,p,l]=await Promise.all([
    supabase.from('catalog_segments').select('*').eq('ativo',true).order('home_order').order('nome'),
    supabase.from('products').select('id,nome,slug,metadata,product_type,ativo').eq('ativo',true),
    supabase.from('product_segments').select('*')
  ]);
  if(s.error||p.error||l.error)throw s.error||p.error||l.error;
  const segs=s.data||[],products=p.data||[],links=l.data||[],roots=segs.filter(x=>!x.parent_id);
  root.innerHTML=`<div class="public-breadcrumb"><a href="/">Início</a><span>›</span><strong>Soluções por segmento</strong></div><div class="public-intro"><span class="public-eyebrow">Soluções por segmento</span><h1>Encontre soluções para o seu negócio ou ocasião.</h1><p class="public-lead">Os segmentos funcionam como uma camada transversal: um mesmo produto ou serviço pode aparecer em mais de um contexto sem duplicar cadastros.</p></div>${roots.length?`<div class="public-card-grid">${roots.map(r=>{const children=segs.filter(x=>x.parent_id===r.id),segmentIds=new Set([r.id,...children.map(x=>x.id)]),productIds=new Set(links.filter(x=>segmentIds.has(x.segment_id)).map(x=>x.product_id)),items=products.filter(x=>productIds.has(x.id)).slice(0,6);return `<article class="public-card"><div class="public-card-media">${r.image_url?`<img src="${esc(r.image_url)}" alt="${esc(r.image_alt||r.nome)}" loading="lazy">`:''}</div><div class="public-card-copy"><span class="public-eyebrow">Segmento</span><h2>${esc(r.nome)}</h2><p>${esc(r.descricao||'Soluções relacionadas a este contexto.')}</p>${children.length?`<div class="public-chip-row">${children.map(c=>`<span class="public-chip" title="${esc(c.descricao||'')}">${esc(c.nome)}</span>`).join('')}</div>`:''}${items.length?`<div style="display:grid;gap:7px;margin-top:14px">${items.map(x=>{const href=x.metadata?.href||(x.product_type==='servico'?`/servicos/${x.slug}/`:`/produtos/?q=${encodeURIComponent(x.nome)}`);return `<a href="${esc(href)}" style="display:flex;justify-content:space-between;gap:10px;padding:10px 11px;border-radius:11px;background:#f6f5fb;color:var(--pc-deep);font-weight:850">${esc(x.nome)}<span>→</span></a>`}).join('')}</div>`:'<div class="public-empty" style="margin-top:14px">Nenhum item vinculado ainda.</div>'}</div></article>`}).join('')}</div>`:'<div class="public-empty">Nenhum segmento ativo cadastrado.</div>'}`;
}catch(e){console.error(e);root.innerHTML='<div class="public-empty">Não foi possível carregar os segmentos agora.</div>'}
