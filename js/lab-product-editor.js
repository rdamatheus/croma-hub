import { supabase } from '/js/croma-supabase.js';
import { getStaffSession } from '/js/interno-auth.js?v=20260822-1';

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const state = { products:[], categories:[], segments:[], selected:null, draft:null, source:null, media:[], variants:[], tiers:[], components:[], segmentIds:[], user:null };

const productSelect = $('#productSelect');
const search = $('#productSearch');
const statusEl = $('#labStatus');
const draftBadge = $('#draftBadge');
const qualityList = $('#qualityList');
const editor = $('#editor');
const sourceMeta = $('#sourceMeta');

function text(v=''){ return v == null ? '' : String(v); }
function num(v){ return v === '' || v == null ? null : Number(v); }
function bool(v){ return v === true || v === 'true'; }
function money(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function escapeHtml(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}

function setStatus(msg='',kind=''){ statusEl.textContent=msg; statusEl.className='status '+kind; }
function productLabel(p){ return `${p.nome || 'Sem nome'} · ${p.sku || 'sem SKU'}`; }

async function loadBase(){
  const session = await getStaffSession();
  if(!session?.profile || !['owner','manager'].includes(session.profile.role)){
    location.href='/interno/?next='+encodeURIComponent(location.pathname); return;
  }
  state.user=session.user;
  const [pr,cr,sr] = await Promise.all([
    supabase.from('products').select('*').order('nome'),
    supabase.from('catalog_categories').select('id,parent_id,nome,slug,catalog_scope,ativo').order('nome'),
    supabase.from('catalog_segments').select('id,parent_id,nome,slug,ativo').order('nome')
  ]);
  if(pr.error) throw pr.error; if(cr.error) throw cr.error; if(sr.error) throw sr.error;
  state.products=pr.data||[]; state.categories=cr.data||[]; state.segments=sr.data||[];
  renderProductOptions();
}

function renderProductOptions(){
  const q=(search.value||'').trim().toLowerCase();
  const filtered=state.products.filter(p=>!q || [p.nome,p.sku,p.bling_sku,p.categoria].some(x=>text(x).toLowerCase().includes(q)));
  productSelect.innerHTML='<option value="">Selecione um produto…</option>'+filtered.map(p=>`<option value="${p.id}">${escapeHtml(productLabel(p))}</option>`).join('');
  if(state.selected && filtered.some(p=>p.id===state.selected.id)) productSelect.value=state.selected.id;
}

function treeLabel(list,id){
  const byId=new Map(list.map(x=>[x.id,x])); const parts=[]; let cur=byId.get(id),guard=0;
  while(cur&&guard++<8){ parts.unshift(cur.nome); cur=cur.parent_id?byId.get(cur.parent_id):null; }
  return parts.join(' › ');
}

function fillClassifications(){
  const p=state.draft;
  const scope=p.product_type==='servico'?'servico':'produto';
  const cats=state.categories.filter(c=>!c.catalog_scope || c.catalog_scope===scope);
  $('#catalogCategory').innerHTML='<option value="">Sem categoria</option>'+cats.map(c=>`<option value="${c.id}">${escapeHtml(treeLabel(state.categories,c.id))}</option>`).join('');
  $('#catalogCategory').value=p.catalog_category_id||'';
  $('#segmentsGrid').innerHTML=state.segments.filter(s=>s.ativo!==false).map(s=>`<label class="chip-check"><input type="checkbox" value="${s.id}" ${state.segmentIds.includes(s.id)?'checked':''}><span>${escapeHtml(treeLabel(state.segments,s.id))}</span></label>`).join('');
}

function baselineDraft(p){
  const md=p.metadata||{};
  return {
    id:p.id, sku:p.sku, nome:p.nome, slug:p.slug, product_type:p.product_type||'produto', product_format:p.product_format||'simple',
    catalog_category_id:p.catalog_category_id, descricao:p.descricao, short_description:p.short_description, complementary_description:p.complementary_description,
    unidade:p.unidade, preco:p.preco, ativo:p.ativo, product_line:p.product_line, condition:p.condition, external_link:p.external_link, video_link:p.video_link, notes:p.notes,
    is_sellable:p.is_sellable, is_purchasable:p.is_purchasable, is_input:p.is_input, controls_stock:p.controls_stock,
    bling_product_id:p.bling_product_id, bling_sku:p.bling_sku, bling_sync_status:p.bling_sync_status, bling_last_synced_at:p.bling_last_synced_at,
    marketing:{
      headline:md.marketing?.headline||'', sales_description:md.marketing?.sales_description||'', how_to_sell:md.marketing?.how_to_sell||'',
      ideal_for:md.marketing?.ideal_for||'', benefits:md.marketing?.benefits||'', cross_sell:md.marketing?.cross_sell||'', catalog_note:md.marketing?.catalog_note||''
    },
    production:{
      mode:md.production?.mode||'', lead_time:md.production?.lead_time||'', supplier:md.production?.supplier||'', internal_notes:md.production?.internal_notes||''
    }
  };
}

async function selectProduct(id){
  if(!id){ editor.hidden=true; return; }
  setStatus('Carregando produto e vínculos…');
  const p=state.products.find(x=>x.id===id); if(!p) return;
  const [dr,seg,med,varr,tier,comp] = await Promise.all([
    supabase.from('lab_product_drafts').select('*').eq('product_id',id).eq('user_id',state.user.id).maybeSingle(),
    supabase.from('product_segments').select('segment_id').eq('product_id',id),
    supabase.from('product_media').select('*').eq('product_id',id).order('ordem'),
    supabase.from('product_variants').select('*').eq('product_id',id).order('nome'),
    supabase.from('product_price_tiers').select('*').eq('product_id',id).order('min_qty'),
    supabase.from('product_components').select('*').eq('parent_product_id',id).order('position')
  ]);
  [dr,seg,med,varr,tier,comp].forEach(r=>{if(r.error) throw r.error});
  state.selected=p; state.source=p; state.segmentIds=(seg.data||[]).map(x=>x.segment_id); state.media=med.data||[]; state.variants=varr.data||[]; state.tiers=tier.data||[]; state.components=comp.data||[];
  const saved=dr.data?.draft||null; state.draft=saved?{...baselineDraft(p),...saved,marketing:{...baselineDraft(p).marketing,...(saved.marketing||{})},production:{...baselineDraft(p).production,...(saved.production||{})}}:baselineDraft(p);
  renderEditor(Boolean(saved),dr.data);
  editor.hidden=false; setStatus('');
}

function setVal(id,v){ const el=$('#'+id); if(!el)return; if(el.type==='checkbox')el.checked=bool(v); else el.value=v??''; }
function renderEditor(hasDraft,draftRow){
  const p=state.draft;
  $('#editorTitle').textContent=p.nome||'Produto';
  sourceMeta.innerHTML=`Base oficial: <strong>${escapeHtml(state.source.nome||'')}</strong> · atualização ${state.source.updated_at?new Date(state.source.updated_at).toLocaleString('pt-BR'):'—'}`;
  draftBadge.textContent=hasDraft?'Rascunho salvo':'Sem rascunho'; draftBadge.className='badge '+(hasDraft?'warn':'ok');
  ['sku','nome','slug','descricao','short_description','complementary_description','unidade','preco','product_line','condition','external_link','video_link','notes'].forEach(id=>setVal(id,p[id]));
  setVal('productType',p.product_type); setVal('productFormat',p.product_format); setVal('ativo',p.ativo); setVal('isSellable',p.is_sellable); setVal('isPurchasable',p.is_purchasable); setVal('isInput',p.is_input); setVal('controlsStock',p.controls_stock);
  setVal('headline',p.marketing.headline); setVal('salesDescription',p.marketing.sales_description); setVal('howToSell',p.marketing.how_to_sell); setVal('idealFor',p.marketing.ideal_for); setVal('benefits',p.marketing.benefits); setVal('crossSell',p.marketing.cross_sell); setVal('catalogNote',p.marketing.catalog_note);
  setVal('productionMode',p.production.mode); setVal('leadTime',p.production.lead_time); setVal('supplier',p.production.supplier); setVal('productionNotes',p.production.internal_notes);
  $('#blingSummary').innerHTML=`<div><span>ID Bling</span><strong>${p.bling_product_id||'—'}</strong></div><div><span>SKU Bling</span><strong>${escapeHtml(p.bling_sku||'—')}</strong></div><div><span>Status</span><strong>${escapeHtml(p.bling_sync_status||'não vinculado')}</strong></div><div><span>Última sincronização</span><strong>${p.bling_last_synced_at?new Date(p.bling_last_synced_at).toLocaleString('pt-BR'):'—'}</strong></div>`;
  fillClassifications(); renderMedia(); renderVariants(); renderTiers(); renderComponents(); updateSummary();
}

function renderMedia(){
  const box=$('#mediaGrid');
  if(!state.media.length){box.innerHTML='<div class="empty">Sem imagens próprias cadastradas.</div>';return;}
  box.innerHTML=state.media.map(m=>`<article class="media-card"><div class="media-img">${m.url?`<img src="${escapeHtml(m.url)}" alt="${escapeHtml(m.alt_text||'')}">`:''}</div><div><strong>${m.is_primary?'Principal':'Imagem'}</strong><small>${escapeHtml(m.alt_text||'Sem texto alternativo')}</small></div></article>`).join('');
}
function renderVariants(){ $('#variantsTable').innerHTML=state.variants.length?state.variants.map(v=>`<tr><td>${escapeHtml(v.nome||'')}</td><td>${escapeHtml(v.sku||v.code||'—')}</td><td>${money(v.base_price)}</td><td>${v.ativo?'Ativa':'Inativa'}</td></tr>`).join(''):'<tr><td colspan="4">Sem variações.</td></tr>'; }
function renderTiers(){ $('#tiersTable').innerHTML=state.tiers.length?state.tiers.map(t=>`<tr><td>A partir de ${t.min_qty}</td><td>${money(t.unit_price)}</td><td>${t.ativo?'Ativa':'Inativa'}</td></tr>`).join(''):'<tr><td colspan="3">Sem faixas de preço.</td></tr>'; }
function renderComponents(){ $('#componentsTable').innerHTML=state.components.length?state.components.map(c=>`<tr><td>${escapeHtml(c.component_product_id)}</td><td>${c.quantity}</td><td>${c.waste_percent||0}%</td></tr>`).join(''):'<tr><td colspan="3">Sem composição cadastrada.</td></tr>'; }

function collect(){
  const p={...state.draft};
  const ids=['sku','nome','slug','descricao','short_description','complementary_description','unidade','product_line','condition','external_link','video_link','notes']; ids.forEach(id=>p[id]=$('#'+id).value.trim());
  p.preco=num($('#preco').value); p.product_type=$('#productType').value; p.product_format=$('#productFormat').value; p.catalog_category_id=$('#catalogCategory').value||null; p.ativo=$('#ativo').checked;
  p.is_sellable=$('#isSellable').checked;p.is_purchasable=$('#isPurchasable').checked;p.is_input=$('#isInput').checked;p.controls_stock=$('#controlsStock').checked;
  p.marketing={headline:$('#headline').value.trim(),sales_description:$('#salesDescription').value.trim(),how_to_sell:$('#howToSell').value.trim(),ideal_for:$('#idealFor').value.trim(),benefits:$('#benefits').value.trim(),cross_sell:$('#crossSell').value.trim(),catalog_note:$('#catalogNote').value.trim()};
  p.production={mode:$('#productionMode').value,lead_time:$('#leadTime').value.trim(),supplier:$('#supplier').value.trim(),internal_notes:$('#productionNotes').value.trim()};
  p.segment_ids=$$('#segmentsGrid input:checked').map(x=>x.value);
  return p;
}

async function saveDraft(){
  if(!state.selected)return;
  const draft=collect(); setStatus('Salvando rascunho no Lab…');
  const payload={product_id:state.selected.id,user_id:state.user.id,draft,base_product_updated_at:state.source.updated_at,status:'draft',updated_at:new Date().toISOString()};
  const {error}=await supabase.from('lab_product_drafts').upsert(payload,{onConflict:'product_id,user_id'}); if(error) throw error;
  state.draft=draft; state.segmentIds=draft.segment_ids||[]; draftBadge.textContent='Rascunho salvo'; draftBadge.className='badge warn'; setStatus('Rascunho salvo. Nenhuma informação oficial foi alterada.','ok'); updateSummary();
}

async function discardDraft(){
  if(!state.selected || !confirm('Descartar o rascunho deste produto? O cadastro oficial não será alterado.'))return;
  const {error}=await supabase.from('lab_product_drafts').delete().eq('product_id',state.selected.id).eq('user_id',state.user.id); if(error)throw error;
  await selectProduct(state.selected.id); setStatus('Rascunho descartado.','ok');
}

function updateSummary(){
  if(!state.draft)return; const p=collect(); const issues=[];
  if(!p.nome)issues.push('Nome ausente'); if(!p.sku)issues.push('SKU Croma ausente'); if(!p.catalog_category_id)issues.push('Categoria não definida'); if(!(p.segment_ids||[]).length)issues.push('Nenhum segmento vinculado'); if(!state.media.some(m=>m.ativo!==false&&m.is_primary))issues.push('Sem foto principal'); if(!p.descricao&&!p.short_description)issues.push('Sem descrição comercial'); if(!p.marketing?.how_to_sell)issues.push('Sem orientação “Como vender”'); if(p.preco==null||p.preco<=0)issues.push('Preço de venda não definido');
  qualityList.innerHTML=issues.length?issues.map(x=>`<li class="q-warn">${escapeHtml(x)}</li>`).join(''):'<li class="q-ok">Cadastro essencial completo</li>';
  $('#summaryPrice').textContent=money(p.preco); $('#summarySegments').textContent=(p.segment_ids||[]).length; $('#summaryMedia').textContent=state.media.filter(m=>m.ativo!==false).length; $('#summarySync').textContent=p.bling_sync_status||'não vinculado';
}

$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>{ $$('[data-tab]').forEach(x=>x.classList.toggle('active',x===b)); $$('.tab-panel').forEach(p=>p.classList.toggle('active',p.id===b.dataset.tab)); }));
search.addEventListener('input',renderProductOptions); productSelect.addEventListener('change',()=>selectProduct(productSelect.value)); $('#saveDraft').addEventListener('click',()=>saveDraft().catch(e=>setStatus(e.message,'bad'))); $('#discardDraft').addEventListener('click',()=>discardDraft().catch(e=>setStatus(e.message,'bad'))); $('#productType').addEventListener('change',()=>{state.draft=collect();fillClassifications();}); editor.addEventListener('input',updateSummary); editor.addEventListener('change',updateSummary);

loadBase().catch(e=>setStatus('Erro ao carregar o Lab: '+e.message,'bad'));
