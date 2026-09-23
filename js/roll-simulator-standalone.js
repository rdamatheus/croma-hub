import { optimizeRollLayout, calculateRollFinancials } from './roll-optimizer.js';
import { optimizeSheetLayout } from './sheet-optimizer.js';
import { IN_HOUSE_PRODUCTION } from '../data/in-house-production.js';
import { enrichInHouseItems, buildCorelCsv, buildCorelManifest, downloadTextFile, safeFileStem } from './corel-layout-export.js';

const PREF_KEY='croma_roll_simulator_standalone_preferences_v1';
const TYPE_CONFIG={
  straight:{
    label:'ADESIVOS CORTE RETO',mode:'roll',itemSingular:'Adesivo',itemPlural:'Adesivos',
    configTitle:'Adesivos Corte Reto',
    configDescription:'Organização de peças retangulares para melhor aproveitamento da largura de produção.',
    widthLabel:'Largura máxima da área/bobina (cm)',
    widthHelp:'Informe a largura útil máxima disponível para produção.',
    marginLabel:'Margem lateral (cm)',
    marginHelp:'A mesma margem é aplicada dos dois lados.',
    providerNote:'Otimização retangular para adesivos com corte reto, respeitando margem, espaçamento e rotação.'
  },
  contour:{
    label:'ADESIVOS CORTE ESPECIAL',mode:'roll',itemSingular:'Adesivo',itemPlural:'Adesivos',
    configTitle:'Adesivos Corte Especial',
    configDescription:'Organização das peças com recorte especial dentro da largura de produção.',
    widthLabel:'Largura máxima da área/bobina (cm)',
    widthHelp:'Informe a largura útil máxima disponível para produção.',
    marginLabel:'Margem lateral (cm)',
    marginHelp:'A mesma margem é aplicada dos dois lados.',
    providerNote:'O encaixe usa o retângulo envolvente de cada arte. O contorno vetorial real ainda não é usado no nesting.'
  },
  hollow:{
    label:'ADESIVOS CORTE VAZADO',mode:'roll',itemSingular:'Adesivo',itemPlural:'Adesivos',
    configTitle:'Adesivos Corte Vazado',
    configDescription:'Organização das artes vazadas dentro da largura de produção.',
    widthLabel:'Largura máxima da área/bobina (cm)',
    widthHelp:'Informe a largura útil máxima disponível para produção.',
    marginLabel:'Margem lateral (cm)',
    marginHelp:'A mesma margem é aplicada dos dois lados.',
    providerNote:'O encaixe usa a caixa envolvente de cada arte vazada. O vazado interno não reduz a área geométrica considerada.'
  },
  pvc:{
    label:'PLACAS PVC',mode:'sheet',itemSingular:'Peça',itemPlural:'Peças',
    configTitle:'Placas PVC',
    configDescription:'Defina o tamanho máximo da chapa e distribua as peças no menor número de placas.',
    widthLabel:'Largura máxima da placa (cm)',
    widthHelp:'Padrão inicial de 200 cm; pode ser alterado conforme o material disponível.',
    marginLabel:'Margem da placa (cm)',
    marginHelp:'Aplicada nos quatro lados da placa.',
    providerNote:'O cálculo considera placas inteiras no tamanho informado e mostra quantas são necessárias, o aproveitamento e a sobra.'
  }
};
const $=id=>document.getElementById(id);
const money=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const decimal=(value,digits=2)=>Number(value||0).toLocaleString('pt-BR',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const uid=()=>globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;

function encodePreset(payload){
  const bytes=new TextEncoder().encode(JSON.stringify(payload));
  let binary='';
  for(const byte of bytes) binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

function decodePreset(raw){
  const normalized=String(raw||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'='.repeat((4-normalized.length%4)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function readPresetFromUrl(){
  try{
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const raw=params.get('sim');
    if(!raw) return null;
    const preset=decodePreset(raw);
    if(!preset || typeof preset!=='object' || Number(preset.v||1)!==1) throw new Error('versão do preset não suportada');
    return preset;
  }catch(error){
    console.warn('Preset da URL inválido.',error);
    return {__error:true};
  }
}

$('who').textContent='Modo local · sem banco de dados';

let simulationType='straight';
let currentResult=null;
let items=[
  {id:uid(),name:'Adesivo 1',width_cm:5,height_cm:3,quantity:1000},
  {id:uid(),name:'Adesivo 2',width_cm:4,height_cm:4,quantity:500}
];

function loadLocalPreferences(){
  try{
    const raw=localStorage.getItem(PREF_KEY);
    const parsed=raw?JSON.parse(raw):{};
    return parsed && typeof parsed==='object' && !Array.isArray(parsed) ? parsed : {};
  }catch(error){
    console.warn('Não foi possível carregar preferências locais do simulador.',error);
    return {};
  }
}

const prefs=loadLocalPreferences();
const rollDefaults=prefs.roll || {};
$('rollWidthCm').value=(Number(rollDefaults.roll_width_mm)||1200)/10;
$('marginCm').value=(Number(rollDefaults.margin_mm)||5)/10;
$('gapCm').value=(Number(rollDefaults.gap_mm)||3)/10;
$('allowRotation').checked=rollDefaults.allow_rotation!==false;
$('maxSegments').value=Number(rollDefaults.max_segments)||4;
$('sheetHeightCm').value=Number(prefs.sheet_height_cm)||100;
simulationType=prefs.simulation_type==='roll'?'straight':(TYPE_CONFIG[prefs.simulation_type]?prefs.simulation_type:'straight');
$('pricePerM2').value=Number(prefs.price_per_m2)||0;
$('freight').value=0;
$('markup').value=Number(prefs.markup_pct)||0;

const urlPreset=readPresetFromUrl();
if(urlPreset && !urlPreset.__error){
  const presetType=urlPreset.type==='roll'?'straight':urlPreset.type;
  if(TYPE_CONFIG[presetType]) simulationType=presetType;
  const cfg=urlPreset.config||{};
  if(Number(cfg.roll_width_cm)>0) $('rollWidthCm').value=Number(cfg.roll_width_cm);
  if(Number(cfg.sheet_height_cm)>0) $('sheetHeightCm').value=Number(cfg.sheet_height_cm);
  if(Number(cfg.margin_cm)>=0 && cfg.margin_cm!=='' && cfg.margin_cm!=null) $('marginCm').value=Number(cfg.margin_cm);
  if(Number(cfg.gap_cm)>=0 && cfg.gap_cm!=='' && cfg.gap_cm!=null) $('gapCm').value=Number(cfg.gap_cm);
  if(typeof cfg.allow_rotation==='boolean') $('allowRotation').checked=cfg.allow_rotation;
  if(Number(cfg.max_segments)>=1) $('maxSegments').value=Math.min(8,Math.max(1,Math.floor(Number(cfg.max_segments))));
  const fin=urlPreset.financials||{};
  if(Number(fin.price_per_m2)>=0 && fin.price_per_m2!=='' && fin.price_per_m2!=null) $('pricePerM2').value=Number(fin.price_per_m2);
  if(Number(fin.freight)>=0 && fin.freight!=='' && fin.freight!=null) $('freight').value=Number(fin.freight);
  if(Number(fin.markup_pct)>=0 && fin.markup_pct!=='' && fin.markup_pct!=null) $('markup').value=Number(fin.markup_pct);
  if(Array.isArray(urlPreset.items) && urlPreset.items.length){
    items=urlPreset.items.slice(0,200).map((item,index)=>({
      id:uid(),
      name:String(item.name||`${itemBaseName()} ${index+1}`),
      width_cm:Number(item.width_cm),
      height_cm:Number(item.height_cm),
      quantity:Math.max(1,Math.floor(Number(item.quantity)||1)),
      source_folder:String(item.source_folder||''),
      source_file_name:String(item.source_file_name||''),
      source_mime_type:String(item.source_mime_type||'')
    })).filter(item=>item.width_cm>0 && item.height_cm>0);
  }
}

function loadInHouseProduction(){
  const source=IN_HOUSE_PRODUCTION.groups?.[simulationType]||[];
  if(!source.length){
    setStatus('Não há itens sincronizados do In House para este tipo.','error');
    return;
  }
  items=enrichInHouseItems(source.map((item,index)=>({
    id:uid(),
    name:String(item.name||`${itemBaseName()} ${index+1}`),
    width_cm:Number(item.width_cm),
    height_cm:Number(item.height_cm),
    quantity:Math.max(1,Math.floor(Number(item.quantity)||1)),
    source_folder:item.source_folder||'',
    source_file_name:item.source_file_name||'',
    source_mime_type:item.source_mime_type||''
  })),IN_HOUSE_PRODUCTION);
  renderItems();
  updatePreliminary();
  currentResult=null;
  $('resultSection').hidden=true;
  const total=items.reduce((sum,item)=>sum+item.quantity,0);
  setStatus(`In House carregado: ${items.length} artes, ${total} unidades. Calculando encaixe…`,'info');
  optimize();
}

function activeType(){return TYPE_CONFIG[simulationType]||TYPE_CONFIG.straight;}

function itemBaseName(){return activeType().itemSingular;}

function applySimulationType(type,{preserveValues=true}={}){
  if(!TYPE_CONFIG[type]) return;
  simulationType=type;
  const cfg=activeType();
  document.querySelectorAll('[data-sim-type]').forEach(btn=>btn.classList.toggle('active',btn.dataset.simType===type));
  $('configTitle').textContent=cfg.configTitle;
  $('configDescription').textContent=cfg.configDescription;
  $('widthLabel').textContent=cfg.widthLabel;
  $('widthHelp').textContent=cfg.widthHelp;
  $('marginLabel').textContent=cfg.marginLabel;
  $('marginHelp').textContent=cfg.marginHelp;
  $('providerNote').textContent=cfg.providerNote;
  $('itemsTitle').textContent=`${cfg.itemPlural} da simulação`;
  $('itemsDescription').textContent=type==='pvc'
    ?'Adicione todas as peças que precisam ser distribuídas nas placas.'
    :'Adicione todos os tamanhos e quantidades desta cotação.';
  $('addItem').textContent=`＋ Adicionar ${cfg.itemSingular.toLowerCase()}`;
  $('sheetHeightField').hidden=cfg.mode!=='sheet';
  $('advancedRoll').hidden=cfg.mode==='sheet';
  if($('rollIllustration')) $('rollIllustration').hidden=cfg.mode==='sheet';
  if(!preserveValues && type==='pvc'){
    $('rollWidthCm').value=200;
    $('sheetHeightCm').value=100;
  }
  currentResult=null;
  $('resultSection').hidden=true;
  renderItems();
  updatePreliminary();
}

function renderItems(){
  $('itemsBody').innerHTML=items.map((item,index)=>`
    <tr class="item-row" data-id="${item.id}">
      <td class="item-number">${index+1}</td>
      <td><input class="item-name" value="${escapeHtml(item.name)}" aria-label="Descrição da peça ${index+1}"></td>
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
  const previous=new Map(items.map(item=>[String(item.id),item]));
  items=[...document.querySelectorAll('.item-row')].map((row,index)=>{
    const old=previous.get(String(row.dataset.id))||{};
    return {
      id:row.dataset.id,
      name:row.querySelector('.item-name').value.trim() || `${itemBaseName()} ${index+1}`,
      width_cm:Number(row.querySelector('.item-width').value),
      height_cm:Number(row.querySelector('.item-height').value),
      quantity:Math.floor(Number(row.querySelector('.item-quantity').value)||0),
      source_folder:old.source_folder||'',
      source_file_name:old.source_file_name||'',
      source_mime_type:old.source_mime_type||''
    };
  });
}

function currentConfig(){
  const base={
    margin_mm:Number($('marginCm').value)*10,
    gap_mm:Number($('gapCm').value)*10,
    allow_rotation:$('allowRotation').checked
  };
  if(activeType().mode==='sheet'){
    return {
      ...base,
      sheet_width_mm:Number($('rollWidthCm').value)*10,
      sheet_height_mm:Number($('sheetHeightCm').value)*10
    };
  }
  return {
    ...base,
    roll_width_mm:Number($('rollWidthCm').value)*10,
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
    const usable=(cfg.roll_width_mm??cfg.sheet_width_mm)-(cfg.margin_mm*2);
    $('preItems').textContent=String(items.length);
    $('preUnits').textContent=items.reduce((sum,item)=>sum+(Math.max(0,item.quantity)||0),0).toLocaleString('pt-BR');
    $('preUsable').textContent=usable>0
      ?(activeType().mode==='sheet'
        ?`${decimal(usable/10,1)} × ${decimal((cfg.sheet_height_mm-cfg.margin_mm*2)/10,1)} cm`
        :`${decimal(usable/10,1)} cm`)
      :'—';
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
  const isSheet=result.mode==='sheet';
  $('metricLinearLabel').textContent=isSheet?'Placas necessárias':'Soma dos comprimentos';
  $('metricAreaLabel').textContent=isSheet?'Área total das placas':'Área efetivamente encomendada';
  $('metricLinear').textContent=isSheet?`${result.sheet_count} placa${result.sheet_count===1?'':'s'}`:`${decimal(result.total_linear_m,2)} m`;
  $('metricOrderedArea').textContent=`${decimal(result.ordered_area_m2,3)} m²`;
  $('metricUtilization').textContent=`${decimal(result.utilization_pct,1)}%`;
  $('metricLoss').textContent=`${decimal(result.loss_pct,1)}%`;
  $('metricUnits').textContent=result.total_units.toLocaleString('pt-BR');
  $('metricSegments').textContent=String(result.segments.length);
  $('metricGeometric').textContent=`${decimal(result.geometric_area_m2,3)} m²`;
  $('metricBlank').textContent=`${decimal(result.paid_blank_area_m2,3)} m²`;

  if(isSheet){
    $('segmentationNote').innerHTML=`As peças foram distribuídas em <strong>${result.sheet_count} placa${result.sheet_count===1?'':'s'}</strong> de <strong>${decimal(result.config.sheet_width_mm/10,1)} × ${decimal(result.config.sheet_height_mm/10,1)} cm</strong>.`;
  } else if(result.segmentation_saving_m2>0.0005){
    const pct=result.single_segment_area_m2>0?(result.segmentation_saving_m2/result.single_segment_area_m2)*100:0;
    $('segmentationNote').innerHTML=`A solução foi dividida em <strong>${result.segments.length} segmentos</strong> porque isso reduz a área encomendada em <strong>${decimal(result.segmentation_saving_m2,3)} m² (${decimal(pct,1)}%)</strong> em comparação com manter tudo em uma única faixa.`;
  } else {
    $('segmentationNote').textContent='A segmentação não trouxe economia relevante de área; o melhor encaixe encontrado permanece em uma única faixa.';
  }

  renderSegments(result);
  renderDetailTable(result);
  renderPlacementMap(result);
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
      <div class="segment-head"><div><strong>${result.mode==='sheet'?'Placa':'Segmento'} ${segment.index}</strong><span>${result.mode==='sheet'?`${decimal(segment.width_mm/10,1)} × ${decimal(segment.height_mm/10,1)} cm`:`${decimal(segment.width_mm/10,1)} cm × ${decimal(segment.height_mm/1000,2)} m`}</span></div><b>${decimal(segment.area_m2,3)} m²</b></div>
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
  const isSheet=result.mode==='sheet';
  const physicalW=isSheet?segment.width_mm:segment.height_mm;
  const physicalH=isSheet?segment.height_mm:segment.width_mm;
  const scale=Math.min(availableW/Math.max(1,physicalW),availableH/Math.max(1,physicalH));
  const drawW=physicalW*scale, drawH=physicalH*scale;
  const ox=pad+(availableW-drawW)/2, oy=(cssHeight-drawH)/2;
  ctx.fillStyle='#fbfbfe';ctx.strokeStyle='#c9c7d8';ctx.lineWidth=1;ctx.fillRect(ox,oy,drawW,drawH);ctx.strokeRect(ox,oy,drawW,drawH);

  if(isSheet){
    const margin=result.config.margin_mm*scale;
    if(margin>0.5){
      ctx.strokeStyle='#c30079';ctx.setLineDash([4,4]);
      ctx.strokeRect(ox+margin,oy+margin,Math.max(0,drawW-margin*2),Math.max(0,drawH-margin*2));
      ctx.setLineDash([]);
    }
    for(const p of segment.placements){
      const idx=itemIndex.get(p.item_id)||0;
      const x=ox+p.x*scale,y=oy+p.y*scale,w=Math.max(.7,p.w*scale),h=Math.max(.7,p.h*scale);
      ctx.fillStyle=colorFor(idx,.42);ctx.strokeStyle=colorFor(idx,.9);ctx.lineWidth=.7;ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);
      if(w>28&&h>16){ctx.fillStyle=colorFor(idx,1);ctx.font='600 10px Inter, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(idx+1),x+w/2,y+h/2);}
    }
    ctx.fillStyle='#706d80';ctx.font='11px Inter, Arial';ctx.textAlign='left';ctx.fillText(`${decimal(segment.width_mm/10,1)} cm`,ox,cssHeight-10);
    ctx.textAlign='right';ctx.fillText(`${decimal(segment.height_mm/10,1)} cm`,ox+drawW,cssHeight-10);
    return;
  }

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

function renderPlacementMap(result){
  syncItemsFromDom();
  items=enrichInHouseItems(items,IN_HOUSE_PRODUCTION);
  const itemMap=new Map(items.map(item=>[String(item.id),item]));
  let piece=0;
  const rows=[];
  for(const segment of result.segments){
    for(const placement of segment.placements){
      piece++;
      const source=itemMap.get(String(placement.item_id))||{};
      const fileCell=source.source_file_name
        ?escapeHtml(source.source_file_name)
        :'<span style="color:#a63838">não vinculado</span>';
      rows.push(`<tr>
        <td>${segment.index}</td>
        <td>${piece}</td>
        <td>${escapeHtml(placement.name)}</td>
        <td>${escapeHtml(source.source_folder||'—')}</td>
        <td>${fileCell}</td>
        <td>${decimal(placement.x/10,1)} cm</td>
        <td>${decimal(placement.y/10,1)} cm</td>
        <td>${decimal(placement.w/10,1)} cm</td>
        <td>${decimal(placement.h/10,1)} cm</td>
        <td>${placement.rotated?'90°':'0°'}</td>
      </tr>`);
    }
  }
  $('placementBody').innerHTML=rows.join('');
}

function currentPresetPayload(){
  syncItemsFromDom();
  items=enrichInHouseItems(items,IN_HOUSE_PRODUCTION);
  return {
    v:1,
    type:simulationType,
    config:{
      roll_width_cm:Number($('rollWidthCm').value),
      sheet_height_cm:Number($('sheetHeightCm').value),
      margin_cm:Number($('marginCm').value),
      gap_cm:Number($('gapCm').value),
      allow_rotation:$('allowRotation').checked,
      max_segments:Number($('maxSegments').value)||4
    },
    items:items.map(item=>({
      name:item.name,
      width_cm:item.width_cm,
      height_cm:item.height_cm,
      quantity:item.quantity,
      source_folder:item.source_folder||'',
      source_file_name:item.source_file_name||''
    })),
    financials:{
      price_per_m2:Number($('pricePerM2').value)||0,
      freight:Number($('freight').value)||0,
      markup_pct:Number($('markup').value)||0
    },
    auto:true
  };
}

function buildShareUrl(){
  const base=`${location.origin}${location.pathname}`;
  return `${base}#sim=${encodePreset(currentPresetPayload())}`;
}

function copyShareLink(){
  try{
    const url=buildShareUrl();
    navigator.clipboard.writeText(url)
      .then(()=>setStatus('Link da simulação copiado. Ao abrir, os dados serão preenchidos e otimizados automaticamente.','ok'))
      .catch(()=>setStatus('Não foi possível copiar o link automaticamente.','error'));
  }catch(error){
    setStatus(`Não foi possível gerar o link: ${error.message}`,'error');
  }
}

function copyPlacementMap(){
  if(!currentResult) return;
  let piece=0;
  const lines=[];
  for(const segment of currentResult.segments){
    lines.push(`${currentResult.mode==='sheet'?'PLACA':'SEGMENTO'} ${segment.index} — ${decimal(segment.width_mm/10,1)} cm × ${decimal(segment.height_mm/10,1)} cm`);
    for(const p of segment.placements){
      piece++;
      lines.push(`#${piece} · ${p.name} · X ${decimal(p.x/10,1)} cm · Y ${decimal(p.y/10,1)} cm · ${decimal(p.w/10,1)} × ${decimal(p.h/10,1)} cm · rotação ${p.rotated?'90°':'0°'}`);
    }
    lines.push('');
  }
  const text=`MAPA DE MONTAGEM — ORIGEM X/Y NO CANTO SUPERIOR ESQUERDO DE CADA SEGMENTO\n\n${lines.join('\n')}`;
  navigator.clipboard.writeText(text)
    .then(()=>setStatus('Mapa de montagem copiado para a área de transferência.','ok'))
    .catch(()=>setStatus('Não foi possível copiar o mapa automaticamente.','error'));
}

function exportCorelCsv(){
  if(!currentResult){
    setStatus('Calcule o encaixe antes de exportar para o CorelDRAW.','error');
    return;
  }
  syncItemsFromDom();
  items=enrichInHouseItems(items,IN_HOUSE_PRODUCTION);
  const manifest=buildCorelManifest(currentResult,items,{
    simulation_type:simulationType,
    source_root:'In House / PRODUÇÃO'
  });
  const csv=buildCorelCsv(currentResult,items);
  const stamp=new Date().toISOString().slice(0,10);
  const stem=`croma-${safeFileStem(activeType().label)}-${stamp}`;
  downloadTextFile(`${stem}-corel.csv`,csv,'text/csv;charset=utf-8');
  const missing=manifest.missing_source_files.length;
  if(missing){
    setStatus(`CSV exportado. Atenção: ${missing} peça(s) estão sem arquivo de origem vinculado e serão ignoradas pela macro até o vínculo ser corrigido.`,'error');
  }else{
    setStatus('Mapa para CorelDRAW exportado. No Corel, execute CromaImportarMapa e selecione este CSV e a pasta local PRODUÇÃO.','ok');
  }
}

function exportCorelManifest(){
  if(!currentResult){
    setStatus('Calcule o encaixe antes de exportar o manifesto.','error');
    return;
  }
  syncItemsFromDom();
  items=enrichInHouseItems(items,IN_HOUSE_PRODUCTION);
  const manifest=buildCorelManifest(currentResult,items,{
    simulation_type:simulationType,
    source_root:'In House / PRODUÇÃO'
  });
  const stamp=new Date().toISOString().slice(0,10);
  const stem=`croma-${safeFileStem(activeType().label)}-${stamp}`;
  downloadTextFile(`${stem}-manifest.json`,JSON.stringify(manifest,null,2),'application/json;charset=utf-8');
  setStatus('Manifesto técnico JSON exportado.','ok');
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
    const result=activeType().mode==='sheet'
      ?optimizeSheetLayout(currentItemsForOptimizer(),currentConfig())
      :optimizeRollLayout(currentItemsForOptimizer(),currentConfig());
    renderResult(result);
    setStatus('Encaixe calculado e validado: todas as unidades foram alocadas.','ok');
  }catch(error){
    currentResult=null; $('resultSection').hidden=true; setStatus(error.message||'Não foi possível calcular o encaixe.','error');
  }finally{$('optimizeBtn').disabled=false;$('optimizeBtn').textContent='Otimizar encaixe';}
}

function saveDefaults(){
  setStatus('Salvando preferências neste navegador…','info');
  try{
    const cfg=currentConfig();
    const payload={
      simulation_type:simulationType,
      sheet_height_cm:Number($('sheetHeightCm').value)||100,
      roll:{
        roll_width_mm:cfg.roll_width_mm,
        margin_mm:cfg.margin_mm,
        gap_mm:cfg.gap_mm,
        allow_rotation:cfg.allow_rotation,
        max_segments:cfg.max_segments,
        min_segment_width_mm:1
      },
      price_per_m2:Number($('pricePerM2').value)||0,
      markup_pct:Number($('markup').value)||0,
      saved_at:new Date().toISOString()
    };
    localStorage.setItem(PREF_KEY,JSON.stringify(payload));
    setStatus('Preferências salvas somente neste navegador. Nenhum dado foi enviado ao Supabase.','ok');
  }catch(error){
    setStatus(`Não foi possível salvar neste navegador: ${error.message}`,'error');
  }
}

function copySummary(){
  if(!currentResult) return;
  const fin=calculateRollFinancials(currentResult,{price_per_m2:Number($('pricePerM2').value),freight:Number($('freight').value),markup_pct:Number($('markup').value)});
  const segmentLines=currentResult.segments.map(s=>currentResult.mode==='sheet'
    ?`• Placa ${s.index}: ${decimal(s.width_mm/10,1)} × ${decimal(s.height_mm/10,1)} cm = ${decimal(s.area_m2,3)} m²`
    :`• Segmento ${s.index}: ${decimal(s.width_mm/10,1)} cm × ${decimal(s.linear_m,2)} m = ${decimal(s.area_m2,3)} m²`).join('\n');
  const itemLines=currentResult.items.map(i=>`• ${i.name}: ${decimal(i.width_mm/10,1)} × ${decimal(i.height_mm/10,1)} cm — ${i.quantity.toLocaleString('pt-BR')} un.`).join('\n');
  const text=`SIMULAÇÃO — ${activeType().label.toUpperCase()}\n\n${itemLines}\n\n${segmentLines}\n\nÁrea geométrica: ${decimal(currentResult.geometric_area_m2,3)} m²\nÁrea encomendada: ${decimal(currentResult.ordered_area_m2,3)} m²\nAproveitamento: ${decimal(currentResult.utilization_pct,1)}%\nSoma dos comprimentos: ${decimal(currentResult.total_linear_m,2)} m\n\nMaterial: ${money(fin.material_cost)}\nFrete: ${money(fin.freight)}\nCusto total: ${money(fin.total_cost)}\nPreço de revenda: ${money(fin.resale_price)}`;
  navigator.clipboard.writeText(text).then(()=>setStatus('Resumo copiado para a área de transferência.','ok')).catch(()=>setStatus('Não foi possível copiar automaticamente.','error'));
}

$('addItem').addEventListener('click',()=>{syncItemsFromDom();items.push({id:uid(),name:`${itemBaseName()} ${items.length+1}`,width_cm:5,height_cm:5,quantity:100});renderItems();updatePreliminary();});
$('optimizeBtn').addEventListener('click',optimize);
$('saveDefaults').addEventListener('click',saveDefaults);
$('loadInHouseBtn').addEventListener('click',loadInHouseProduction);
$('copySummary').addEventListener('click',copySummary);
$('copyShareLink').addEventListener('click',copyShareLink);
$('copyPlacementMap').addEventListener('click',copyPlacementMap);
$('exportCorelCsv').addEventListener('click',exportCorelCsv);
$('exportCorelManifest').addEventListener('click',exportCorelManifest);
$('clearBtn').addEventListener('click',()=>{items=[{id:uid(),name:`${itemBaseName()} 1`,width_cm:5,height_cm:5,quantity:100}];renderItems();currentResult=null;$('resultSection').hidden=true;$('freight').value=0;updatePreliminary();setStatus('Simulação limpa.','info');});
['rollWidthCm','sheetHeightCm','marginCm','gapCm','allowRotation','maxSegments'].forEach(id=>$(id).addEventListener('input',updatePreliminary));
document.querySelectorAll('[data-sim-type]').forEach(btn=>btn.addEventListener('click',()=>applySimulationType(btn.dataset.simType)));
['pricePerM2','freight','markup'].forEach(id=>$(id).addEventListener('input',updateFinancials));
window.addEventListener('resize',()=>{if(currentResult)renderSegments(currentResult)});

applySimulationType(simulationType);
if(urlPreset?.__error){
  setStatus('O link contém um preset inválido. A simulação foi aberta com os valores locais.','error');
}else if(urlPreset){
  setStatus('Simulação carregada pelo link. Calculando o melhor encaixe…','info');
  optimize();
}
