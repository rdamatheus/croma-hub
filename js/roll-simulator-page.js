import { supabase } from './croma-supabase.js';
import { protectInternalPage, roleLabel } from './interno-auth.js';
import { LABEL_RULE_KEY, loadLabelRules, normalizeLabelRules } from './production-rules.js';
import { optimizeRollLayout, calculateRollFinancials } from './roll-optimizer.js';

const PREF_KEY='roll_simulator_preferences';
const $=id=>document.getElementById(id);
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const decimal=(value,digits=2)=>Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const uid=()=>globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const session=await protectInternalPage({roles:['owner','manager','equipe']});
if(!session) throw new Error('Acesso não autorizado.');
$('who').textContent=`${session.profile.nome || session.user.email} · ${roleLabel(session.profile.role)}`;

let rules=await loadLabelRules();
let currentResult=null;
let items=[
  {id:uid(),name:'Adesivo 1',width_cm:5,height_cm:3,quantity:1000},
  {id:uid(),name:'Adesivo 2',width_cm:4,height_cm:4,quantity:500}
];

async function loadPrivatePreferences(){
  const {data,error}=await supabase.from('internal_module_state').select('data').eq('module_key',PREF_KEY).maybeSingle();
  if(error){console.warn('Não foi possível carregar preferências do simulador.',error);return {}}
  return data?.data && typeof data.data==='object' && !Array.isArray(data.data) ? data.data : {};
}

const prefs=await loadPrivatePreferences();
const rollDefaults=rules.roll || {};
$('rollWidthCm').value=(Number(rollDefaults.roll_width_mm)||1200)/10;
$('marginCm').value=(Number(rollDefaults.margin_mm)||5)/10;
$('gapCm').value=(Number(rollDefaults.gap_mm)||3)/10;
$('allowRotation').checked=rollDefaults.allow_rotation!==false;
$('maxSegments').value=Number(rollDefaults.max_segments)||4;
$('pricePerM2').value=Number(prefs.price_per_m2)||0;
$('freight').value=0;
$('markup').value=Number(prefs.markup_pct)||0;
$('saveDefaults').hidden=!['owner','manager'].includes(session.profile.role);

function renderItems(){
  $('itemsBody').innerHTML=items.map((item,index)=>`
    <tr class="item-row" data-id="${item.id}">
      <td class="item-number">${index+1}</td>
      <td><input class="item-name" value="${escapeHtml(item.name)}" aria-label="Descrição do adesivo ${index+1}"></td>
      <td><input class="item-width" type="number" min="0.1" step="0.1" value="${item.width_cm}" aria-label="Largura em centímetros"></td>
      <td><input class="item-height" type="number" min="0.1" step="0.1" value="${item.height_cm}" aria-label="Altura em centímetros"></td>
      <td><input class="item-quantity" type="number" min="1" step="1" value="${item.quantity}" aria-label="Quantidade"></td>
      <td class="row-actions"><button class="icon-btn duplicate-item" title="Duplicar" aria-label="Duplicar adesivo">⧉</button><button class="icon-btn danger remove-item" title="Excluir" aria-label="Excluir adesivo">×</button></td>
    </tr>`).join('');
  document.querySelectorAll('.item-row input').forEach(input=>input.addEventListener('input',updatePreliminary));
  document.querySelectorAll('.duplicate-item').forEach(btn=>btn.addEventListener('click',event=>{
    const row=event.currentTarget.closest('.item-row'); syncItemsFromDom();
    const source=items.find(i=>i.id===row.dataset.id); const index=items.findIndex(i=>i.id===row.dataset.id);
    items.splice(index+1,0,{...source,id:uid(),name:`${source.name} (cópia)`}); renderItems(); updatePreliminary();
  }));
  document.querySelectorAll('.remove-item').forEach(btn=>btn.addEventListener('click',event=>{
    if(items.length===1){setStatus('A simulação precisa ter pelo menos um adesivo.','error');return}
    items=items.filter(i=>i.id!==event.currentTarget.closest('.item-row').dataset.id); renderItems(); updatePreliminary();
  }));
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

function syncItemsFromDom(){
  items=[...document.querySelectorAll('.item-row')].map((row,index)=>({
    id:row.dataset.id,
    name:row.querySelector('.item-name').value.trim() || `Adesivo ${index+1}`,
    width_cm:Number(row.querySelector('.item-width').value),
    height_cm:Number(row.querySelector('.item-height').value),
    quantity:Math.floor(Number(row.querySelector('.item-quantity').value)||0)
  }));
}

function currentConfig(){
  return {
    roll_width_mm:Number($('rollWidthCm').value)*10,
    margin_mm:Number($('marginCm').value)*10,
    gap_mm:Number($('gapCm').value)*10,
    allow_rotation:$('allowRotation').checked,
    max_segments:Number($('maxSegments').value)||4,
    min_segment_width_mm:1
  };
}

function currentItemsForOptimizer(){
  syncItemsFromDom();
  return items.map(item=>({id:item.id,name:item.name,width_mm:item.width_cm*10,height_mm:item.height_cm*10,quantity:item.quantity}));
}

function updatePreliminary(){
  try{
    syncItemsFromDom();
    const cfg=currentConfig();
    const usable=cfg.roll_width_mm-(cfg.margin_mm*2);
    $('preItems').textContent=String(items.length);
    $('preUnits').textContent=items.reduce((sum,item)=>sum+(Math.max(0,item.quantity)||0),0).toLocaleString('pt-BR');
    $('preUsable').textContent=usable>0?`${decimal(usable/10,1)} cm`:'—';
    $('preRotation').textContent=cfg.allow_rotation?'Ativada':'Desativada';
  }catch{}
}

function setStatus(message,type='info'){
  const el=$('status'); el.textContent=message; el.className=`status ${type}`;
}

function colorFor(index,alpha=1){
  const colors=[[48,41,127],[0,156,223],[195,0,121],[128,176,61],[232,150,25],[91,67,168],[0,126,105],[183,76,63]];
  const c=colors[index%colors.length]; return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

function renderResult(result){
  currentResult=result;
  $('resultSection').hidden=false;
  $('metricLinear').textContent=`${decimal(result.total_linear_m,2)} m`;
  $('metricOrderedArea').textContent=`${decimal(result.ordered_area_m2,3)} m²`;
  $('metricUtilization').textContent=`${decimal(result.utilization_pct,1)}%`;
  $('metricLoss').textContent=`${decimal(result.loss_pct,1)}%`;
  $('metricUnits').textContent=result.total_units.toLocaleString('pt-BR');
  $('metricSegments').textContent=String(result.segments.length);
  $('metricGeometric').textContent=`${decimal(result.geometric_area_m2,3)} m²`;
  $('metricBlank').textContent=`${decimal(result.paid_blank_area_m2,3)} m²`;

  if(result.segmentation_saving_m2>0.0005){
    const pct=result.single_segment_area_m2>0?(result.segmentation_saving_m2/result.single_segment_area_m2)*100:0;
    $('segmentationNote').innerHTML=`A solução foi dividida em <strong>${result.segments.length} segmentos</strong> porque isso reduz a área encomendada em <strong>${decimal(result.segmentation_saving_m2,3)} m² (${decimal(pct,1)}%)</strong> em comparação com manter tudo em uma única faixa.`;
  } else {
    $('segmentationNote').textContent='A segmentação não trouxe economia relevante de área; o melhor encaixe encontrado permanece em uma única faixa.';
  }

  renderSegments(result);
  renderDetailTable(result);
  updateFinancials();
  $('resultSection').scrollIntoView({behavior:'smooth',block:'start'});
}

function renderSegments(result){
  const itemIndex=new Map(result.items.map((item,index)=>[item.id,index]));
  $('segmentsContainer').innerHTML=result.segments.map(segment=>{
    const counts=Object.entries(segment.counts).filter(([,qty])=>qty>0).map(([id,qty])=>{
      const item=result.items.find(i=>i.id===id); return `${escapeHtml(item?.name||id)}: ${Number(qty).toLocaleString('pt-BR')} un.`;
    }).join(' · ');
    return `<article class="segment-card">
      <div class="segment-head"><div><strong>Segmento ${segment.index}</strong><span>${decimal(segment.width_mm/10,1)} cm × ${decimal(segment.height_mm/1000,2)} m</span></div><b>${decimal(segment.area_m2,3)} m²</b></div>
      <div class="canvas-wrap"><canvas id="segmentCanvas${segment.index}" class="segment-canvas" aria-label="Representação visual do segmento ${segment.index}"></canvas></div>
      <small>${counts}</small>
    </article>`;
  }).join('');
  requestAnimationFrame(()=>result.segments.forEach(segment=>drawSegment($(`segmentCanvas${segment.index}`),segment,result,itemIndex)));
}

function drawSegment(canvas,segment,result,itemIndex){
  if(!canvas) return;
  const cssWidth=Math.max(600,canvas.parentElement.clientWidth||600);
  const cssHeight=310;
  const dpr=Math.min(2,window.devicePixelRatio||1);
  canvas.width=Math.floor(cssWidth*dpr); canvas.height=Math.floor(cssHeight*dpr);
  canvas.style.width='100%'; canvas.style.height=`${cssHeight}px`;
  const ctx=canvas.getContext('2d'); ctx.scale(dpr,dpr);
  const pad=38, availableW=cssWidth-pad*2, availableH=cssHeight-pad*2;
  const scale=Math.min(availableW/Math.max(1,segment.height_mm),availableH/Math.max(1,segment.width_mm));
  const drawW=segment.height_mm*scale, drawH=segment.width_mm*scale;
  const ox=pad, oy=(cssHeight-drawH)/2;
  ctx.fillStyle='#fbfbfe';ctx.strokeStyle='#c9c7d8';ctx.lineWidth=1;ctx.fillRect(ox,oy,drawW,drawH);ctx.strokeRect(ox,oy,drawW,drawH);
  const margin=result.config.margin_mm*scale;
  if(margin>0.5){ctx.strokeStyle='#c30079';ctx.setLineDash([4,4]);ctx.beginPath();ctx.moveTo(ox,oy+margin);ctx.lineTo(ox+drawW,oy+margin);ctx.moveTo(ox,oy+drawH-margin);ctx.lineTo(ox+drawW,oy+drawH-margin);ctx.stroke();ctx.setLineDash([]);}
  for(const p of segment.placements){
    const idx=itemIndex.get(p.item_id)||0;
    const x=ox+p.y*scale, y=oy+p.x*scale, w=Math.max(.7,p.h*scale), h=Math.max(.7,p.w*scale);
    ctx.fillStyle=colorFor(idx,.42);ctx.strokeStyle=colorFor(idx,.9);ctx.lineWidth=.7;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
    if(w>28&&h>16){ctx.fillStyle=colorFor(idx,1);ctx.font='600 10px Inter, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(idx+1),x+w/2,y+h/2);}
  }
  ctx.fillStyle='#706d80';ctx.font='11px Inter, Arial';ctx.textAlign='left';ctx.fillText(`${decimal(segment.height_mm/1000,2)} m de comprimento`,ox,cssHeight-10);
  ctx.textAlign='right';ctx.fillText(`${decimal(segment.width_mm/10,1)} cm de largura`,ox+drawW,cssHeight-10);
}

function renderDetailTable(result){
  const allocated={}; const rotated={};
  for(const segment of result.segments){
    for(const [id,qty] of Object.entries(segment.counts)) allocated[id]=(allocated[id]||0)+qty;
    for(const p of segment.placements) if(p.rotated) rotated[p.item_id]=(rotated[p.item_id]||0)+1;
  }
  $('detailBody').innerHTML=result.items.map((item,index)=>`
    <tr><td><span class="legend-dot" style="background:${colorFor(index)}"></span>${escapeHtml(item.name)}</td><td>${decimal(item.width_mm/10,1)} × ${decimal(item.height_mm/10,1)} cm</td><td>${item.quantity.toLocaleString('pt-BR')}</td><td>${(allocated[item.id]||0).toLocaleString('pt-BR')}</td><td>${(rotated[item.id]||0).toLocaleString('pt-BR')}</td><td>${decimal((item.width_mm*item.height_mm*item.quantity)/1e6,3)} m²</td></tr>`).join('');
}

function updateFinancials(){
  if(!currentResult) return;
  const fin=calculateRollFinancials(currentResult,{price_per_m2:Number($('pricePerM2').value),freight:Number($('freight').value),markup_pct:Number($('markup').value)});
  $('materialCost').textContent=money(fin.material_cost);
  $('totalCost').textContent=money(fin.total_cost);
  $('resalePrice').textContent=money(fin.resale_price);
  $('markupResult').textContent=fin.markup_pct>0?`Markup aplicado: ${decimal(fin.markup_pct,1)}%`:'Sem markup aplicado';
}

async function optimize(){
  setStatus('Calculando diferentes encaixes, rotações e possibilidades de segmentação…','info');
  $('optimizeBtn').disabled=true; $('optimizeBtn').textContent='Otimizando…';
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,20)));
  try{
    const result=optimizeRollLayout(currentItemsForOptimizer(),currentConfig());
    renderResult(result);
    setStatus('Encaixe calculado e validado: todas as unidades foram alocadas.','ok');
  }catch(error){
    currentResult=null; $('resultSection').hidden=true; setStatus(error.message||'Não foi possível calcular o encaixe.','error');
  }finally{$('optimizeBtn').disabled=false;$('optimizeBtn').textContent='Otimizar encaixe';}
}

async function saveDefaults(){
  setStatus('Salvando parâmetros padrão…','info');
  try{
    const cfg=currentConfig();
    const technical={roll_width_mm:cfg.roll_width_mm,margin_mm:cfg.margin_mm,gap_mm:cfg.gap_mm,allow_rotation:cfg.allow_rotation,max_segments:cfg.max_segments,min_segment_width_mm:1};
    rules=normalizeLabelRules({...rules,roll:{...rules.roll,...technical}});
    const [publicSave,privateSave]=await Promise.all([
      supabase.from('public_config').upsert({config_key:LABEL_RULE_KEY,data:rules,updated_by:session.user.id},{onConflict:'config_key'}),
      supabase.from('internal_module_state').upsert({module_key:PREF_KEY,data:{price_per_m2:Number($('pricePerM2').value)||0,markup_pct:Number($('markup').value)||0},updated_by:session.user.id},{onConflict:'module_key'})
    ]);
    if(publicSave.error) throw publicSave.error; if(privateSave.error) throw privateSave.error;
    setStatus('Parâmetros técnicos e valores internos salvos como padrão. O frete continua específico de cada cotação.','ok');
  }catch(error){setStatus(`Não foi possível salvar os padrões: ${error.message}`,'error')}
}

function copySummary(){
  if(!currentResult) return;
  const fin=calculateRollFinancials(currentResult,{price_per_m2:Number($('pricePerM2').value),freight:Number($('freight').value),markup_pct:Number($('markup').value)});
  const segmentLines=currentResult.segments.map(s=>`• Segmento ${s.index}: ${decimal(s.width_mm/10,1)} cm × ${decimal(s.linear_m,2)} m = ${decimal(s.area_m2,3)} m²`).join('\n');
  const itemLines=currentResult.items.map(i=>`• ${i.name}: ${decimal(i.width_mm/10,1)} × ${decimal(i.height_mm/10,1)} cm — ${i.quantity.toLocaleString('pt-BR')} un.`).join('\n');
  const text=`SIMULAÇÃO DE BOBINA DE ADESIVOS\n\n${itemLines}\n\n${segmentLines}\n\nÁrea geométrica: ${decimal(currentResult.geometric_area_m2,3)} m²\nÁrea encomendada: ${decimal(currentResult.ordered_area_m2,3)} m²\nAproveitamento: ${decimal(currentResult.utilization_pct,1)}%\nSoma dos comprimentos: ${decimal(currentResult.total_linear_m,2)} m\n\nMaterial: ${money(fin.material_cost)}\nFrete: ${money(fin.freight)}\nCusto total: ${money(fin.total_cost)}\nPreço de revenda: ${money(fin.resale_price)}`;
  navigator.clipboard.writeText(text).then(()=>setStatus('Resumo copiado para a área de transferência.','ok')).catch(()=>setStatus('Não foi possível copiar automaticamente.','error'));
}

$('addItem').addEventListener('click',()=>{syncItemsFromDom();items.push({id:uid(),name:`Adesivo ${items.length+1}`,width_cm:5,height_cm:5,quantity:100});renderItems();updatePreliminary();});
$('optimizeBtn').addEventListener('click',optimize);
$('saveDefaults').addEventListener('click',saveDefaults);
$('copySummary').addEventListener('click',copySummary);
$('clearBtn').addEventListener('click',()=>{items=[{id:uid(),name:'Adesivo 1',width_cm:5,height_cm:5,quantity:100}];renderItems();currentResult=null;$('resultSection').hidden=true;$('freight').value=0;updatePreliminary();setStatus('Simulação limpa.','info');});
['rollWidthCm','marginCm','gapCm','allowRotation','maxSegments'].forEach(id=>$(id).addEventListener('input',updatePreliminary));
['pricePerM2','freight','markup'].forEach(id=>$(id).addEventListener('input',updateFinancials));
window.addEventListener('resize',()=>{if(currentResult)renderSegments(currentResult)});

renderItems();updatePreliminary();
