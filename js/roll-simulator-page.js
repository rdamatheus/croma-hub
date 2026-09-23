import { supabase } from './croma-supabase.js';
import { protectInternalPage, roleLabel } from './interno-auth.js';
import { LABEL_RULE_KEY, loadLabelRules, normalizeLabelRules } from './production-rules.js';
import { optimizeRollLayout, calculateRollFinancials } from './roll-optimizer.js';
import { optimizeSheetLayout, calculateSheetFinancials, DEFAULT_SHEET_CONFIG } from './sheet-optimizer.js';

const PREF_KEY='roll_simulator_preferences';
const $=id=>document.getElementById(id);
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const decimal=(value,digits=2)=>Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const uid=()=>globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const esc=value=>String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

const session=await protectInternalPage({roles:['owner','manager','equipe']});
if(!session) throw new Error('Acesso não autorizado.');
$('who').textContent=`${session.profile.nome || session.user.email} · ${roleLabel(session.profile.role)}`;
const canLinkProposal=['owner','manager'].includes(session.profile.role);

let rules=await loadLabelRules();
let mode='roll';
let currentResult=null;
let currentSimulation=null;
let proposals=[];
let items=[];

async function loadPrivatePreferences(){
  const {data,error}=await supabase.from('internal_module_state').select('data').eq('module_key',PREF_KEY).maybeSingle();
  if(error){console.warn(error);return {}}
  return data?.data && typeof data.data==='object' && !Array.isArray(data.data)?data.data:{};
}
let prefs=await loadPrivatePreferences();
function rollPrefs(){return {
  price_per_m2:Number(prefs.roll?.price_per_m2 ?? prefs.price_per_m2 ?? 0)||0,
  markup_pct:Number(prefs.roll?.markup_pct ?? prefs.markup_pct ?? 0)||0
}}
function sheetPrefs(){return {
  price_per_sheet:Number(prefs.sheet?.price_per_sheet ?? 0)||0,
  markup_pct:Number(prefs.sheet?.markup_pct ?? prefs.markup_pct ?? 0)||0,
  config:prefs.sheet?.config||{}
}}

function defaultItems(kind=mode){
  return kind==='roll'
    ? [{id:uid(),name:'Adesivo 1',width_cm:5,height_cm:5,quantity:100,metadata:{}}]
    : [{id:uid(),name:'Placa 1',width_cm:30,height_cm:42,quantity:1,metadata:{}}];
}
function setStatus(message,type='info'){
  $('status').textContent=message;
  $('status').className=`status ${type}`;
}
function colorFor(index,alpha=1){
  const colors=[[48,41,127],[0,156,223],[195,0,121],[128,176,61],[232,150,25],[91,67,168],[0,126,105],[183,76,63]];
  const c=colors[index%colors.length];return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

function setMode(next,{resetItems=false}={}){
  mode=next==='sheet'?'sheet':'roll';
  document.querySelectorAll('.mode-card').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  $('rollConfig').classList.toggle('hidden',mode!=='roll');
  $('sheetConfig').classList.toggle('hidden',mode!=='sheet');
  $('configTitle').textContent=mode==='roll'?'Configuração da bobina':'Configuração da chapa';
  $('itemsTitle').textContent=mode==='roll'?'Adesivos da simulação':'Placas / peças da simulação';
  $('preLimitLabel').textContent=mode==='roll'?'Largura útil':'Área útil da chapa';
  $('metricPrimaryLabel').textContent=mode==='roll'?'Comprimento total':'Quantidade de chapas';
  $('metricContainersLabel').textContent=mode==='roll'?'Segmentos':'Chapas';
  $('priceBasisLabel').textContent=mode==='roll'?'Valor por m² (R$)':'Custo por chapa (R$)';
  const rp=rollPrefs(),sp=sheetPrefs();
  $('priceBasisValue').value=mode==='roll'?rp.price_per_m2:sp.price_per_sheet;
  $('markup').value=mode==='roll'?rp.markup_pct:sp.markup_pct;
  if(resetItems){items=defaultItems(mode);renderItems();currentResult=null;$('resultSection').hidden=true;}
  updatePreliminary();
}
function initDefaults(){
  const roll=rules.roll||{};
  $('rollWidthCm').value=(Number(roll.roll_width_mm)||1200)/10;
  $('rollMarginCm').value=(Number(roll.margin_mm)||5)/10;
  $('rollGapCm').value=(Number(roll.gap_mm)||3)/10;
  $('rollRotation').checked=roll.allow_rotation!==false;
  $('maxSegments').value=Number(roll.max_segments)||4;
  const sheet={...DEFAULT_SHEET_CONFIG,...sheetPrefs().config};
  $('sheetWidthCm').value=sheet.sheet_width_mm/10;
  $('sheetHeightCm').value=sheet.sheet_height_mm/10;
  $('sheetMarginCm').value=sheet.margin_mm/10;
  $('sheetGapCm').value=sheet.gap_mm/10;
  $('sheetRotation').checked=sheet.allow_rotation!==false;
  $('freight').value=0;
  $('saveDefaults').hidden=!canLinkProposal;
}

function renderItems(){
  $('itemsBody').innerHTML=items.map((item,index)=>`
    <tr class="item-row" data-id="${esc(item.id)}">
      <td><strong>${index+1}</strong></td>
      <td><input class="item-name" value="${esc(item.name)}"></td>
      <td><input class="item-width" type="number" min="0.1" step="0.1" value="${item.width_cm}"></td>
      <td><input class="item-height" type="number" min="0.1" step="0.1" value="${item.height_cm}"></td>
      <td><input class="item-quantity" type="number" min="1" step="1" value="${item.quantity}"></td>
      <td><button class="icon-btn duplicate-item" title="Duplicar">⧉</button> <button class="icon-btn remove-item" title="Excluir">×</button></td>
    </tr>`).join('');
  document.querySelectorAll('.item-row input').forEach(i=>i.addEventListener('input',updatePreliminary));
  document.querySelectorAll('.duplicate-item').forEach(btn=>btn.onclick=e=>{
    syncItemsFromDom();const id=e.currentTarget.closest('tr').dataset.id,index=items.findIndex(x=>x.id===id),src=items[index];
    items.splice(index+1,0,{...src,id:uid(),name:`${src.name} (cópia)`,metadata:{...(src.metadata||{})}});
    renderItems();updatePreliminary();
  });
  document.querySelectorAll('.remove-item').forEach(btn=>btn.onclick=e=>{
    if(items.length===1){setStatus('A simulação precisa ter pelo menos um item.','error');return}
    const id=e.currentTarget.closest('tr').dataset.id;items=items.filter(x=>x.id!==id);renderItems();updatePreliminary();
  });
}
function syncItemsFromDom(){
  const previous=new Map(items.map(i=>[i.id,i]));
  items=[...document.querySelectorAll('.item-row')].map((row,index)=>{
    const old=previous.get(row.dataset.id)||{};
    return {id:row.dataset.id,name:row.querySelector('.item-name').value.trim()||`${mode==='roll'?'Adesivo':'Placa'} ${index+1}`,
      width_cm:Number(row.querySelector('.item-width').value),height_cm:Number(row.querySelector('.item-height').value),
      quantity:Math.floor(Number(row.querySelector('.item-quantity').value)||0),metadata:old.metadata||{},proposal_item_id:old.proposal_item_id||null};
  });
}
function optimizerItems(){
  syncItemsFromDom();
  return items.map(i=>({id:i.id,name:i.name,width_mm:i.width_cm*10,height_mm:i.height_cm*10,quantity:i.quantity,metadata:i.metadata||{}}));
}
function currentConfig(){
  if(mode==='roll')return {
    roll_width_mm:Number($('rollWidthCm').value)*10,margin_mm:Number($('rollMarginCm').value)*10,gap_mm:Number($('rollGapCm').value)*10,
    allow_rotation:$('rollRotation').checked,max_segments:Number($('maxSegments').value)||4,min_segment_width_mm:1
  };
  return {
    sheet_width_mm:Number($('sheetWidthCm').value)*10,sheet_height_mm:Number($('sheetHeightCm').value)*10,
    margin_mm:Number($('sheetMarginCm').value)*10,gap_mm:Number($('sheetGapCm').value)*10,allow_rotation:$('sheetRotation').checked
  };
}
function applyConfig(cfg={}){
  if(mode==='roll'){
    $('rollWidthCm').value=Number(cfg.roll_width_mm||1200)/10;$('rollMarginCm').value=Number(cfg.margin_mm||0)/10;$('rollGapCm').value=Number(cfg.gap_mm||0)/10;
    $('rollRotation').checked=cfg.allow_rotation!==false;$('maxSegments').value=Number(cfg.max_segments)||4;
  }else{
    $('sheetWidthCm').value=Number(cfg.sheet_width_mm||2000)/10;$('sheetHeightCm').value=Number(cfg.sheet_height_mm||1000)/10;
    $('sheetMarginCm').value=Number(cfg.margin_mm||0)/10;$('sheetGapCm').value=Number(cfg.gap_mm||0)/10;$('sheetRotation').checked=cfg.allow_rotation!==false;
  }
}
function updatePreliminary(){
  syncItemsFromDom();
  $('preItems').textContent=String(items.length);
  $('preUnits').textContent=items.reduce((s,i)=>s+Math.max(0,i.quantity||0),0).toLocaleString('pt-BR');
  const cfg=currentConfig();
  if(mode==='roll') $('preLimit').textContent=`${decimal((cfg.roll_width_mm-cfg.margin_mm*2)/10,1)} cm`;
  else $('preLimit').textContent=`${decimal((cfg.sheet_width_mm-cfg.margin_mm*2)/10,1)} × ${decimal((cfg.sheet_height_mm-cfg.margin_mm*2)/10,1)} cm`;
  $('preRotation').textContent=(mode==='roll'?cfg.allow_rotation:cfg.allow_rotation)?'Ativada':'Desativada';
}

function currentFinancials(){
  const basis=Number($('priceBasisValue').value)||0,freight=Number($('freight').value)||0,markup=Number($('markup').value)||0;
  return mode==='roll'
    ? calculateRollFinancials(currentResult,{price_per_m2:basis,freight,markup_pct:markup})
    : calculateSheetFinancials(currentResult,{price_per_sheet:basis,freight,markup_pct:markup});
}
function financialSnapshot(){
  const fin=currentFinancials();
  return {basis_type:mode==='roll'?'price_per_m2':'price_per_sheet',basis_value:Number($('priceBasisValue').value)||0,freight:Number($('freight').value)||0,markup_pct:Number($('markup').value)||0,...fin};
}
function updateFinancials(){
  if(!currentResult)return;
  const f=currentFinancials();$('materialCost').textContent=money(f.material_cost);$('totalCost').textContent=money(f.total_cost);$('resalePrice').textContent=money(f.resale_price);
}

function renderResult(result){
  currentResult=result;$('resultSection').hidden=false;
  $('metricPrimary').textContent=mode==='roll'?`${decimal(result.total_linear_m,2)} m`:`${result.sheet_count} chapa(s)`;
  $('metricOrderedArea').textContent=`${decimal(result.ordered_area_m2,3)} m²`;
  $('metricUtilization').textContent=`${decimal(result.utilization_pct,1)}%`;
  $('metricLoss').textContent=`${decimal(result.loss_pct,1)}%`;
  $('metricUnits').textContent=result.total_units.toLocaleString('pt-BR');
  const containers=mode==='roll'?result.segments:result.sheets;
  $('metricContainers').textContent=String(containers.length);
  $('metricGeometric').textContent=`${decimal(result.geometric_area_m2,3)} m²`;
  $('metricBlank').textContent=`${decimal(result.paid_blank_area_m2,3)} m²`;
  if(mode==='roll'){
    $('layoutNote').innerHTML=result.segmentation_saving_m2>0.0005
      ? `O sistema dividiu em <strong>${result.segments.length} segmentos</strong> e economizou <strong>${decimal(result.segmentation_saving_m2,3)} m²</strong> em relação a uma faixa única.`
      : 'A segmentação não trouxe economia relevante; o melhor encaixe ficou em uma única faixa.';
  }else $('layoutNote').innerHTML=`Melhor arranjo encontrado em <strong>${result.sheet_count} chapa(s)</strong> de ${decimal(result.config.sheet_width_mm/10,1)} × ${decimal(result.config.sheet_height_mm/10,1)} cm.`;
  renderLayouts();renderDetail();updateFinancials();
}
function renderLayouts(){
  const result=currentResult;if(!result)return;
  const containers=mode==='roll'?result.segments:result.sheets;
  const index=new Map(result.items.map((i,k)=>[i.id,k]));
  $('layoutsContainer').innerHTML=containers.map(c=>{
    const label=mode==='roll'?`Segmento ${c.index}`:`Chapa ${c.index}`;
    const dims=mode==='roll'?`${decimal(c.width_mm/10,1)} cm × ${decimal(c.height_mm/1000,2)} m`:`${decimal(c.width_mm/10,1)} × ${decimal(c.height_mm/10,1)} cm`;
    return `<article class="layout-card"><div class="layout-head"><div><strong>${label}</strong><br><span>${dims}</span></div><strong>${decimal(c.area_m2,3)} m²</strong></div><div class="canvas-wrap"><canvas class="layout-canvas" id="layoutCanvas${c.index}"></canvas></div></article>`;
  }).join('');
  requestAnimationFrame(()=>containers.forEach(c=>drawContainer($(`layoutCanvas${c.index}`),c,index)));
}
function drawContainer(canvas,c,itemIndex){
  if(!canvas)return;
  const cssWidth=Math.max(580,canvas.parentElement.clientWidth||580),cssHeight=mode==='roll'?300:420,dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.floor(cssWidth*dpr);canvas.height=Math.floor(cssHeight*dpr);canvas.style.width='100%';canvas.style.height=`${cssHeight}px`;
  const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);const pad=34,aw=cssWidth-pad*2,ah=cssHeight-pad*2;
  if(mode==='roll'){
    const scale=Math.min(aw/Math.max(1,c.height_mm),ah/Math.max(1,c.width_mm)),dw=c.height_mm*scale,dh=c.width_mm*scale,ox=pad,oy=(cssHeight-dh)/2;
    ctx.fillStyle='#fbfbfe';ctx.strokeStyle='#c9c7d8';ctx.fillRect(ox,oy,dw,dh);ctx.strokeRect(ox,oy,dw,dh);
    for(const p of c.placements){const k=itemIndex.get(p.item_id)||0,x=ox+p.y*scale,y=oy+p.x*scale,w=p.h*scale,h=p.w*scale;ctx.fillStyle=colorFor(k,.42);ctx.strokeStyle=colorFor(k,.95);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
  }else{
    const scale=Math.min(aw/c.width_mm,ah/c.height_mm),dw=c.width_mm*scale,dh=c.height_mm*scale,ox=(cssWidth-dw)/2,oy=(cssHeight-dh)/2;
    ctx.fillStyle='#fbfbfe';ctx.strokeStyle='#c9c7d8';ctx.fillRect(ox,oy,dw,dh);ctx.strokeRect(ox,oy,dw,dh);
    for(const p of c.placements){const k=itemIndex.get(p.item_id)||0,x=ox+p.x*scale,y=oy+p.y*scale,w=p.w*scale,h=p.h*scale;ctx.fillStyle=colorFor(k,.42);ctx.strokeStyle=colorFor(k,.95);ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);}
  }
}
function renderDetail(){
  const result=currentResult,containers=mode==='roll'?result.segments:result.sheets,allocated={},rotated={};
  for(const c of containers)for(const p of c.placements){allocated[p.item_id]=(allocated[p.item_id]||0)+1;if(p.rotated)rotated[p.item_id]=(rotated[p.item_id]||0)+1;}
  $('detailBody').innerHTML=result.items.map((i,k)=>`<tr><td><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${colorFor(k)};margin-right:6px"></span>${esc(i.name)}</td><td>${decimal(i.width_mm/10,1)} × ${decimal(i.height_mm/10,1)} cm</td><td>${i.quantity}</td><td>${allocated[i.id]||0}</td><td>${rotated[i.id]||0}</td><td>${decimal(i.width_mm*i.height_mm*i.quantity/1e6,3)} m²</td></tr>`).join('');
}

async function optimize({silent=false}={}){
  if(!silent){setStatus('Calculando diferentes encaixes e rotações…','info');$('optimizeBtn').disabled=true;}
  try{
    const raw=optimizerItems(),cfg=currentConfig();
    const result=mode==='roll'?optimizeRollLayout(raw,cfg):optimizeSheetLayout(raw,cfg);
    renderResult(result);if(!silent)setStatus('Encaixe calculado e validado: todas as unidades foram alocadas.','ok');
    return result;
  }catch(error){currentResult=null;$('resultSection').hidden=true;setStatus(error.message||'Não foi possível calcular o encaixe.','error');throw error}
  finally{if(!silent)$('optimizeBtn').disabled=false}
}

async function loadProposals(){
  if(!canLinkProposal){$('proposalSelect').disabled=true;$('proposalHelp').textContent='O vínculo com propostas fica disponível para gestão.';return}
  const {data,error}=await supabase.from('sales_proposals').select('id,proposal_no,customer_id,customer_name,customer_phone,status').order('created_at',{ascending:false}).limit(200);
  if(error)throw error;proposals=data||[];
  $('proposalSelect').innerHTML='<option value="">Sem proposta vinculada</option>'+proposals.map(p=>`<option value="${p.id}">#${p.proposal_no} · ${esc(p.customer_name)}</option>`).join('');
}
function selectedProposal(){return proposals.find(p=>p.id===$('proposalSelect').value)||null}

async function saveDefaults(){
  setStatus('Salvando padrões…','info');
  try{
    const rp=rollPrefs(),sp=sheetPrefs();
    const cfg=currentConfig();
    if(mode==='roll'){
      rules=normalizeLabelRules({...rules,roll:{...rules.roll,...cfg}});
      rp.price_per_m2=Number($('priceBasisValue').value)||0;rp.markup_pct=Number($('markup').value)||0;
    }else{
      sp.price_per_sheet=Number($('priceBasisValue').value)||0;sp.markup_pct=Number($('markup').value)||0;sp.config=cfg;
    }
    prefs={...prefs,roll:rp,sheet:sp,price_per_m2:rp.price_per_m2,markup_pct:rp.markup_pct};
    const writes=[supabase.from('internal_module_state').upsert({module_key:PREF_KEY,data:prefs,updated_by:session.user.id},{onConflict:'module_key'})];
    if(mode==='roll')writes.push(supabase.from('public_config').upsert({config_key:LABEL_RULE_KEY,data:rules,updated_by:session.user.id},{onConflict:'config_key'}));
    const res=await Promise.all(writes);for(const x of res)if(x.error)throw x.error;setStatus('Padrões salvos.','ok');
  }catch(error){setStatus(`Não foi possível salvar os padrões: ${error.message}`,'error')}
}
function versionItems(){
  syncItemsFromDom();
  return items.map(i=>({id:i.id,name:i.name,width_mm:i.width_cm*10,height_mm:i.height_cm*10,quantity:i.quantity,proposal_item_id:i.proposal_item_id||null,metadata:i.metadata||{}}));
}
async function saveSimulation(){
  try{
    if(!currentResult)await optimize({silent:true});
    const title=$('simulationTitle').value.trim();if(title.length<2)throw new Error('Informe um nome para a simulação.');
    const proposal=selectedProposal(),now=new Date().toISOString();
    let sim=currentSimulation;
    if(!sim){
      const {data,error}=await supabase.from('production_simulations').insert({
        simulation_type:mode,title,proposal_id:proposal?.id||null,customer_id:proposal?.customer_id||null,customer_name:proposal?.customer_name||null,
        source:'manual',created_by:session.user.id,updated_by:session.user.id,current_version:0
      }).select('*').single();if(error)throw error;sim=data;
    }else{
      const {data,error}=await supabase.from('production_simulations').update({
        title,proposal_id:proposal?.id||null,customer_id:proposal?.customer_id||null,customer_name:proposal?.customer_name||null,updated_by:session.user.id,updated_at:now
      }).eq('id',sim.id).select('*').single();if(error)throw error;sim=data;
    }
    const version=Number(sim.current_version||0)+1;
    const {error:vError}=await supabase.from('production_simulation_versions').insert({
      simulation_id:sim.id,version_number:version,config:currentConfig(),items:versionItems(),result:currentResult,financials:financialSnapshot(),
      notes:$('simulationNotes').value.trim()||null,created_by:session.user.id
    });if(vError)throw vError;
    const {data:updated,error:uError}=await supabase.from('production_simulations').update({current_version:version,updated_by:session.user.id,updated_at:now}).eq('id',sim.id).select('*').single();
    if(uError)throw uError;currentSimulation=updated;
    updateSimulationBadges();setStatus(`Simulação #${updated.simulation_no} salva como versão ${version}.`,'ok');
  }catch(error){setStatus(error.message||'Não foi possível salvar a simulação.','error')}
}
function updateSimulationBadges(){
  $('currentSimulationLabel').textContent=currentSimulation?`Simulação #${currentSimulation.simulation_no}`:'Nova simulação';
  $('currentVersionLabel').textContent=currentSimulation?`Versão ${currentSimulation.current_version}`:'Sem versão';
  $('saveSimulation').textContent=currentSimulation?'Salvar nova versão':'Salvar simulação';
}
function hydrateItems(raw=[]){
  items=raw.map((i,k)=>({id:String(i.id||uid()),name:i.name||`${mode==='roll'?'Adesivo':'Placa'} ${k+1}`,width_cm:Number(i.width_mm)/10,height_cm:Number(i.height_mm)/10,quantity:Number(i.quantity)||1,proposal_item_id:i.proposal_item_id||null,metadata:i.metadata||{}}));
}
async function loadSimulation(id){
  const {data:sim,error}=await supabase.from('production_simulations').select('*').eq('id',id).single();if(error)throw error;
  const {data:ver,error:vErr}=await supabase.from('production_simulation_versions').select('*').eq('simulation_id',id).eq('version_number',sim.current_version).single();if(vErr)throw vErr;
  currentSimulation=sim;setMode(sim.simulation_type,{resetItems:false});$('simulationTitle').value=sim.title;$('simulationNotes').value=ver.notes||'';
  if(canLinkProposal&&sim.proposal_id)$('proposalSelect').value=sim.proposal_id;
  applyConfig(ver.config||{});hydrateItems(ver.items||[]);renderItems();
  const f=ver.financials||{};$('priceBasisValue').value=Number(f.basis_value)||0;$('freight').value=Number(f.freight)||0;$('markup').value=Number(f.markup_pct)||0;
  currentResult=ver.result&&Object.keys(ver.result).length?ver.result:null;
  if(currentResult)renderResult(currentResult);else await optimize({silent:true});
  updateSimulationBadges();updatePreliminary();setStatus(`Simulação #${sim.simulation_no} carregada.`,'ok');
}
function newSimulation(kind=mode){
  currentSimulation=null;currentResult=null;mode=kind;setMode(mode,{resetItems:true});$('simulationTitle').value='';$('simulationNotes').value='';$('proposalSelect').value='';$('freight').value=0;$('resultSection').hidden=true;updateSimulationBadges();setStatus('Nova simulação iniciada.','info');
}
async function openSavedModal(){
  const {data,error}=await supabase.from('production_simulations').select('id,simulation_no,simulation_type,title,proposal_id,customer_name,current_version,updated_at').order('updated_at',{ascending:false}).limit(100);if(error){setStatus(error.message,'error');return}
  $('savedModalRoot').innerHTML=`<div class="modal-backdrop" id="savedBackdrop"><section class="modal"><div class="modal-head"><div><h2>Simulações salvas</h2><p>Abra uma simulação para revisar ou criar uma nova versão.</p></div><button class="btn secondary" id="closeSaved">Fechar</button></div><div class="saved-list">${(data||[]).map(s=>`<div class="saved-item"><div><strong>#${s.simulation_no} · ${esc(s.title)}</strong><small>${s.simulation_type==='roll'?'Bobina de adesivos':'Placas / chapas'} · versão ${s.current_version}${s.customer_name?` · ${esc(s.customer_name)}`:''}</small></div><button class="btn primary open-saved-item" data-id="${s.id}">Abrir</button></div>`).join('')||'<p>Nenhuma simulação salva.</p>'}</div></section></div>`;
  $('closeSaved').onclick=()=>{$('savedModalRoot').innerHTML=''};
  document.querySelectorAll('.open-saved-item').forEach(b=>b.onclick=async()=>{const id=b.dataset.id;$('savedModalRoot').innerHTML='';history.replaceState(null,'',`?simulation=${encodeURIComponent(id)}`);await loadSimulation(id)});
}

function copySummary(){
  if(!currentResult)return;
  const f=currentFinancials(),containers=mode==='roll'?currentResult.segments:currentResult.sheets;
  const lines=items.map(i=>`• ${i.name}: ${decimal(i.width_cm,1)} × ${decimal(i.height_cm,1)} cm — ${i.quantity} un.`).join('\n');
  const text=`${mode==='roll'?'BOBINA DE ADESIVOS':'PLANO DE CHAPAS'}\n\n${lines}\n\n${mode==='roll'?`Comprimento total: ${decimal(currentResult.total_linear_m,2)} m`:`Chapas: ${currentResult.sheet_count}`}\nÁrea considerada: ${decimal(currentResult.ordered_area_m2,3)} m²\nAproveitamento: ${decimal(currentResult.utilization_pct,1)}%\nCusto total: ${money(f.total_cost)}\nPreço de revenda: ${money(f.resale_price)}\nVolumes/segmentos: ${containers.length}`;
  navigator.clipboard.writeText(text).then(()=>setStatus('Resumo copiado.','ok')).catch(()=>setStatus('Não foi possível copiar.','error'));
}

document.querySelectorAll('.mode-card').forEach(b=>b.onclick=()=>newSimulation(b.dataset.mode));
$('addItem').onclick=()=>{syncItemsFromDom();items.push({id:uid(),name:`${mode==='roll'?'Adesivo':'Placa'} ${items.length+1}`,width_cm:mode==='roll'?5:30,height_cm:mode==='roll'?5:42,quantity:1,metadata:{}});renderItems();updatePreliminary()};
$('clearBtn').onclick=()=>{items=defaultItems(mode);renderItems();currentResult=null;$('resultSection').hidden=true;updatePreliminary();setStatus('Itens limpos.','info')};
$('optimizeBtn').onclick=()=>optimize();
$('saveDefaults').onclick=saveDefaults;
$('saveSimulation').onclick=saveSimulation;
$('saveSimulationBottom').onclick=saveSimulation;
$('newSimulation').onclick=()=>newSimulation(mode);
$('openSaved').onclick=openSavedModal;
$('copySummary').onclick=copySummary;
['rollWidthCm','rollMarginCm','rollGapCm','rollRotation','maxSegments','sheetWidthCm','sheetHeightCm','sheetMarginCm','sheetGapCm','sheetRotation'].forEach(id=>$(id).addEventListener('input',updatePreliminary));
['priceBasisValue','freight','markup'].forEach(id=>$(id).addEventListener('input',updateFinancials));
window.addEventListener('resize',()=>{if(currentResult)renderLayouts()});

initDefaults();items=defaultItems('roll');renderItems();
try{await loadProposals()}catch(error){$('proposalHelp').textContent='Não foi possível carregar propostas.'}
const params=new URLSearchParams(location.search),requestedType=params.get('type'),proposalId=params.get('proposal'),simulationId=params.get('simulation');
if(requestedType==='sheet')setMode('sheet',{resetItems:true});else setMode('roll',{resetItems:false});
if(proposalId&&canLinkProposal){$('proposalSelect').value=proposalId;const p=selectedProposal();if(p&&!$('simulationTitle').value)$('simulationTitle').value=`${p.customer_name} — ${mode==='roll'?'adesivos':'placas'}`;}
updateSimulationBadges();updatePreliminary();
if(simulationId){try{await loadSimulation(simulationId)}catch(error){setStatus(`Não foi possível abrir a simulação: ${error.message}`,'error')}}
