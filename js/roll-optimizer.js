export const DEFAULT_ROLL_CONFIG = Object.freeze({
  roll_width_mm: 1200,
  margin_mm: 5,
  gap_mm: 3,
  allow_rotation: true,
  max_segments: 4,
  min_segment_width_mm: 1
});

const EPS = 1e-7;

export function normalizeRollConfig(input={}){
  const cfg={...DEFAULT_ROLL_CONFIG,...input};
  cfg.roll_width_mm=Math.max(1,Number(cfg.roll_width_mm)||DEFAULT_ROLL_CONFIG.roll_width_mm);
  cfg.margin_mm=Math.max(0,Number(cfg.margin_mm)||0);
  cfg.gap_mm=Math.max(0,Number(cfg.gap_mm)||0);
  cfg.allow_rotation=cfg.allow_rotation!==false;
  cfg.max_segments=Math.max(1,Math.min(8,Math.floor(Number(cfg.max_segments)||1)));
  cfg.min_segment_width_mm=Math.max(1,Number(cfg.min_segment_width_mm)||1);
  cfg.usable_width_mm=cfg.roll_width_mm-(cfg.margin_mm*2);
  if(cfg.usable_width_mm<=0) throw new Error('A margem lateral deixa a bobina sem largura útil.');
  return cfg;
}

export function normalizeRollItems(items=[]){
  if(!Array.isArray(items)||!items.length) throw new Error('Adicione pelo menos um adesivo à simulação.');
  return items.map((item,index)=>{
    const width=Math.max(0,Number(item.width_mm ?? item.widthMm));
    const height=Math.max(0,Number(item.height_mm ?? item.heightMm));
    const quantity=Math.floor(Number(item.quantity)||0);
    if(!(width>0)||!(height>0)) throw new Error(`Adesivo ${index+1}: informe largura e altura válidas.`);
    if(quantity<1) throw new Error(`Adesivo ${index+1}: informe uma quantidade válida.`);
    return {
      id:String(item.id ?? `item-${index+1}`),
      name:String(item.name ?? item.description ?? `Adesivo ${index+1}`),
      width_mm:width,
      height_mm:height,
      quantity
    };
  });
}

function fitAtNode(skyline,index,width,limit){
  const x=skyline[index].x;
  if(x+width>limit+EPS) return null;
  let y=skyline[index].y;
  let remaining=width;
  let i=index;
  while(remaining>EPS){
    if(i>=skyline.length) return null;
    y=Math.max(y,skyline[i].y);
    remaining-=skyline[i].width;
    i++;
  }
  return {x,y,index};
}

function findPosition(skyline,width,height,limit){
  let best=null;
  for(let i=0;i<skyline.length;i++){
    const pos=fitAtNode(skyline,i,width,limit);
    if(!pos) continue;
    const top=pos.y+height;
    const score=[top,pos.y,pos.x];
    if(!best || score[0]<best.score[0]-EPS ||
      (Math.abs(score[0]-best.score[0])<EPS && (score[1]<best.score[1]-EPS ||
      (Math.abs(score[1]-best.score[1])<EPS && score[2]<best.score[2]-EPS)))){
      best={...pos,score};
    }
  }
  return best;
}

function addSkylineLevel(skyline,index,x,y,width,height){
  skyline.splice(index,0,{x,y:y+height,width});
  for(let i=index+1;i<skyline.length;i++){
    const prev=skyline[i-1];
    const node=skyline[i];
    const overlap=(prev.x+prev.width)-node.x;
    if(overlap<=EPS) break;
    node.x+=overlap;
    node.width-=overlap;
    if(node.width<=EPS){skyline.splice(i,1);i--;}
    else break;
  }
  for(let i=0;i<skyline.length-1;i++){
    if(Math.abs(skyline[i].y-skyline[i+1].y)<EPS){
      skyline[i].width+=skyline[i+1].width;
      skyline.splice(i+1,1);i--;
    }
  }
}

function orientationCandidates(item,cfg,skyline){
  const options=[{w:item.width_mm,h:item.height_mm,rotated:false}];
  if(cfg.allow_rotation && Math.abs(item.width_mm-item.height_mm)>EPS){
    options.push({w:item.height_mm,h:item.width_mm,rotated:true});
  }
  const candidates=[];
  for(const option of options){
    const packW=option.w+cfg.gap_mm;
    const packH=option.h+cfg.gap_mm;
    if(option.w>cfg.usable_width_mm+EPS) continue;
    const pos=findPosition(skyline,packW,packH,cfg.usable_width_mm+cfg.gap_mm);
    if(!pos) continue;
    candidates.push({...option,packW,packH,...pos});
  }
  return candidates;
}

function lexicographicLess(a,b){
  for(let i=0;i<Math.max(a.length,b.length);i++){
    const av=a[i]??0,bv=b[i]??0;
    if(av<bv-EPS) return true;
    if(av>bv+EPS) return false;
  }
  return false;
}

function chooseOrientation(candidates,currentWidth,currentHeight,cfg,mode='balanced'){
  let best=null;
  for(const c of candidates){
    const newW=Math.max(currentWidth,c.x+c.w);
    const newH=Math.max(currentHeight,c.y+c.h);
    const physicalW=Math.min(cfg.roll_width_mm,newW+cfg.margin_mm*2);
    const newArea=physicalW*newH;
    let score;
    if(mode==='height') score=[newH,newArea,c.y,c.x];
    else if(mode==='bottom') score=[c.y,newH,newArea,c.x];
    else score=[newArea,newH,c.y,c.x];
    if(!best || lexicographicLess(score,best.score)) best={...c,score,newW,newH,newArea};
  }
  return best;
}

function finalizePack(placements,cfg){
  const contentWidth=placements.reduce((m,p)=>Math.max(m,p.x+p.w),0);
  const height=placements.reduce((m,p)=>Math.max(m,p.y+p.h),0);
  const width=Math.max(cfg.min_segment_width_mm,Math.min(cfg.roll_width_mm,contentWidth+cfg.margin_mm*2));
  return {
    placements,
    content_width_mm:contentWidth,
    width_mm:width,
    height_mm:height,
    area_mm2:width*height,
    area_m2:(width*height)/1e6,
    linear_m:height/1000
  };
}

function packFixedOrder(items,counts,cfg,sorter,orientationMode){
  const skyline=[{x:0,y:0,width:cfg.usable_width_mm+cfg.gap_mm}];
  const placements=[];
  let currentWidth=0,currentHeight=0;
  const ordered=items.filter(i=>(counts[i.id]||0)>0).slice().sort(sorter);
  for(const item of ordered){
    const qty=counts[item.id]||0;
    for(let n=0;n<qty;n++){
      const candidates=orientationCandidates(item,cfg,skyline);
      if(!candidates.length) throw new Error(`“${item.name}” não cabe na largura útil da bobina em nenhuma orientação.`);
      const chosen=chooseOrientation(candidates,currentWidth,currentHeight,cfg,orientationMode);
      placements.push({item_id:item.id,name:item.name,x:chosen.x,y:chosen.y,w:chosen.w,h:chosen.h,rotated:chosen.rotated});
      addSkylineLevel(skyline,chosen.index,chosen.x,chosen.y,chosen.packW,chosen.packH);
      currentWidth=Math.max(currentWidth,chosen.x+chosen.w);
      currentHeight=Math.max(currentHeight,chosen.y+chosen.h);
    }
  }
  return finalizePack(placements,cfg);
}

function packDynamic(items,counts,cfg,mode='area'){
  const skyline=[{x:0,y:0,width:cfg.usable_width_mm+cfg.gap_mm}];
  const remaining={...counts};
  const placements=[];
  let total=Object.values(remaining).reduce((a,b)=>a+b,0);
  let currentWidth=0,currentHeight=0;
  while(total>0){
    let best=null;
    for(const item of items){
      if((remaining[item.id]||0)<=0) continue;
      const candidates=orientationCandidates(item,cfg,skyline);
      if(!candidates.length) continue;
      const chosen=chooseOrientation(candidates,currentWidth,currentHeight,cfg,mode==='bottom'?'bottom':mode==='height'?'height':'balanced');
      const delta=chosen.newArea-(Math.min(cfg.roll_width_mm,currentWidth+cfg.margin_mm*2)*currentHeight);
      const fillBias=-(chosen.w*chosen.h);
      const score=mode==='bottom'?[chosen.y,chosen.newH,delta,fillBias]:mode==='height'?[chosen.newH,delta,chosen.y,fillBias]:[delta,chosen.newArea,chosen.newH,chosen.y,fillBias];
      if(!best||lexicographicLess(score,best.score)) best={item,chosen,score};
    }
    if(!best){
      const offender=items.find(i=>(remaining[i.id]||0)>0);
      throw new Error(`“${offender?.name||'Adesivo'}” não cabe na largura útil da bobina em nenhuma orientação.`);
    }
    const {item,chosen}=best;
    placements.push({item_id:item.id,name:item.name,x:chosen.x,y:chosen.y,w:chosen.w,h:chosen.h,rotated:chosen.rotated});
    addSkylineLevel(skyline,chosen.index,chosen.x,chosen.y,chosen.packW,chosen.packH);
    currentWidth=Math.max(currentWidth,chosen.x+chosen.w);
    currentHeight=Math.max(currentHeight,chosen.y+chosen.h);
    remaining[item.id]--;
    total--;
  }
  return finalizePack(placements,cfg);
}

function countsFromItems(items){return Object.fromEntries(items.map(i=>[i.id,i.quantity]));}
function countPlacements(placements){
  const counts={};
  for(const p of placements) counts[p.item_id]=(counts[p.item_id]||0)+1;
  return counts;
}

function optimizeSingleSegment(items,counts,cfg){
  const sorters=[
    (a,b)=>(b.width_mm*b.height_mm)-(a.width_mm*a.height_mm),
    (a,b)=>Math.max(b.width_mm,b.height_mm)-Math.max(a.width_mm,a.height_mm),
    (a,b)=>b.width_mm-a.width_mm || b.height_mm-a.height_mm,
    (a,b)=>b.height_mm-a.height_mm || b.width_mm-a.width_mm,
    (a,b)=>(counts[b.id]||0)-(counts[a.id]||0)
  ];
  const candidates=[];
  for(const sorter of sorters){
    candidates.push(packFixedOrder(items,counts,cfg,sorter,'balanced'));
    candidates.push(packFixedOrder(items,counts,cfg,sorter,'height'));
  }
  const total=Object.values(counts).reduce((a,b)=>a+b,0);
  if(total<=30000){
    candidates.push(packDynamic(items,counts,cfg,'area'));
    candidates.push(packDynamic(items,counts,cfg,'height'));
    candidates.push(packDynamic(items,counts,cfg,'bottom'));
  }
  candidates.sort((a,b)=>a.area_mm2-b.area_mm2 || a.height_mm-b.height_mm || a.width_mm-b.width_mm);
  return candidates[0];
}

function sampleCuts(placements,maxCuts=40){
  const levels=[...new Set(placements.map(p=>Number(p.y.toFixed(6))).filter(v=>v>EPS))].sort((a,b)=>a-b);
  if(levels.length<=maxCuts) return levels;
  const out=[];
  for(let i=1;i<=maxCuts;i++) out.push(levels[Math.floor((i*(levels.length-1))/(maxCuts+1))]);
  return [...new Set(out)];
}

function quickPackSingleSegment(items,counts,cfg){
  const sorter=(a,b)=>(b.width_mm*b.height_mm)-(a.width_mm*a.height_mm) || Math.max(b.width_mm,b.height_mm)-Math.max(a.width_mm,a.height_mm);
  return packFixedOrder(items,counts,cfg,sorter,'balanced');
}

function subtractCounts(base,part){
  const out={...base};
  for(const [id,count] of Object.entries(part)) out[id]=Math.max(0,(out[id]||0)-count);
  return out;
}
function nonZeroCounts(counts){return Object.fromEntries(Object.entries(counts).filter(([,v])=>v>0));}
function countTotal(counts){return Object.values(counts).reduce((a,b)=>a+b,0);}
function splitKey(a,b){
  const norm=o=>Object.entries(o).filter(([,v])=>v>0).sort(([x],[y])=>x.localeCompare(y)).map(([k,v])=>`${k}:${v}`).join(',');
  const x=norm(a),y=norm(b); return x<y?`${x}|${y}`:`${y}|${x}`;
}

function bestSplitForSegment(items,segment,cfg){
  const {pack,counts}=segment;
  if(pack.placements.length<2) return null;
  const proposals=[];
  const seen=new Set();
  const add=(c1,c2,label)=>{
    c1=nonZeroCounts(c1); c2=nonZeroCounts(c2);
    if(!countTotal(c1)||!countTotal(c2)) return;
    const key=splitKey(c1,c2); if(seen.has(key)) return; seen.add(key);
    proposals.push({c1,c2,label});
  };

  for(const cut of sampleCuts(pack.placements)){
    let crosses=false;
    const below=[],above=[];
    for(const p of pack.placements){
      const top=p.y+p.h;
      if(p.y<cut-EPS && top>cut+EPS){crosses=true;break;}
      if(top<=cut+EPS) below.push(p);
      else if(p.y>=cut-EPS) above.push(p);
      else {crosses=true;break;}
    }
    if(!crosses&&below.length&&above.length) add(countPlacements(below),countPlacements(above),`corte-${cut}`);
  }

  const present=items.filter(i=>(counts[i.id]||0)>0);
  if(present.length<=6){
    const maxMask=(1<<present.length)-1;
    for(let mask=1;mask<maxMask;mask++){
      if(mask>(maxMask^mask)) continue;
      const part={};
      for(let i=0;i<present.length;i++) if(mask&(1<<i)) part[present[i].id]=counts[present[i].id];
      add(subtractCounts(counts,part),part,`tipos-${mask}`);
    }
  } else {
    for(const item of present){
      const part={[item.id]:counts[item.id]};
      add(subtractCounts(counts,part),part,`tipo-${item.id}`);
    }
  }

  for(const item of present){
    const qty=counts[item.id]||0;
    const widths=[item.width_mm];
    if(cfg.allow_rotation && Math.abs(item.width_mm-item.height_mm)>EPS) widths.push(item.height_mm);
    const ks=new Set([1]);
    for(const width of widths){
      if(width>cfg.usable_width_mm+EPS) continue;
      const cap=Math.max(1,Math.floor((cfg.usable_width_mm+cfg.gap_mm)/(width+cfg.gap_mm)));
      const rem=qty%cap;
      if(rem>0) ks.add(rem);
      if(qty<cap) ks.add(qty);
    }
    for(const k of ks){
      if(k<=0||k>=qty) continue;
      const part={[item.id]:k};
      add(subtractCounts(counts,part),part,`sobra-${item.id}-${k}`);
    }
  }

  const screened=[];
  for(const proposal of proposals){
    try{
      const p1=quickPackSingleSegment(items,proposal.c1,cfg);
      const p2=quickPackSingleSegment(items,proposal.c2,cfg);
      const area=p1.area_mm2+p2.area_mm2;
      if(area<pack.area_mm2-EPS) screened.push({...proposal,quickArea:area});
    }catch{}
  }
  screened.sort((a,b)=>a.quickArea-b.quickArea);
  let best=null;
  for(const candidate of screened.slice(0,8)){
    const p1=optimizeSingleSegment(items,candidate.c1,cfg),p2=optimizeSingleSegment(items,candidate.c2,cfg);
    const area=p1.area_mm2+p2.area_mm2;
    const saving=pack.area_mm2-area;
    if(saving>EPS && (!best||saving>best.saving+EPS)) best={saving,segments:[{counts:candidate.c1,pack:p1},{counts:candidate.c2,pack:p2}]};
  }
  return best;
}

export function optimizeRollLayout(rawItems=[],rawConfig={}){
  const cfg=normalizeRollConfig(rawConfig);
  const items=normalizeRollItems(rawItems);
  for(const item of items){
    const canFit=cfg.allow_rotation
      ? (item.width_mm<=cfg.usable_width_mm+EPS || item.height_mm<=cfg.usable_width_mm+EPS)
      : item.width_mm<=cfg.usable_width_mm+EPS;
    if(!canFit) throw new Error(`“${item.name}” não cabe na largura útil de ${cfg.usable_width_mm.toFixed(1)} mm.`);
  }
  const allCounts=countsFromItems(items);
  const singlePack=optimizeSingleSegment(items,allCounts,cfg);
  let segments=[{counts:allCounts,pack:singlePack}];
  while(segments.length<cfg.max_segments){
    let bestCandidate=null;
    for(let i=0;i<segments.length;i++){
      const split=bestSplitForSegment(items,segments[i],cfg);
      if(split && (!bestCandidate||split.saving>bestCandidate.split.saving+EPS)) bestCandidate={index:i,split};
    }
    if(!bestCandidate) break;
    const relativeSaving=bestCandidate.split.saving/segments[bestCandidate.index].pack.area_mm2;
    if(relativeSaving<0.002) break;
    segments.splice(bestCandidate.index,1,...bestCandidate.split.segments);
  }
  segments=segments.map((segment,index)=>({
    index:index+1,
    width_mm:segment.pack.width_mm,
    height_mm:segment.pack.height_mm,
    area_m2:segment.pack.area_m2,
    linear_m:segment.pack.linear_m,
    placements:segment.pack.placements.map(p=>({...p,x:p.x+cfg.margin_mm})),
    counts:segment.counts
  }));
  const totalArea=segments.reduce((s,x)=>s+x.area_m2,0);
  const geometricArea=items.reduce((s,i)=>s+(i.width_mm*i.height_mm*i.quantity)/1e6,0);
  const totalUnits=items.reduce((s,i)=>s+i.quantity,0);
  const totalLinear=segments.reduce((s,x)=>s+x.linear_m,0);
  const allocated={};
  for(const segment of segments) for(const [id,count] of Object.entries(segment.counts)) allocated[id]=(allocated[id]||0)+count;
  for(const item of items){
    if((allocated[item.id]||0)!==item.quantity) throw new Error(`Falha de validação: quantidade de “${item.name}” não foi totalmente alocada.`);
  }
  return {
    config:cfg,
    items,
    segments,
    total_units:totalUnits,
    total_linear_m:totalLinear,
    geometric_area_m2:geometricArea,
    ordered_area_m2:totalArea,
    paid_blank_area_m2:Math.max(0,totalArea-geometricArea),
    utilization_pct:totalArea>0?(geometricArea/totalArea)*100:0,
    loss_pct:totalArea>0?((totalArea-geometricArea)/totalArea)*100:0,
    single_segment_area_m2:singlePack.area_m2,
    segmentation_saving_m2:Math.max(0,singlePack.area_m2-totalArea)
  };
}

export function calculateRollFinancials(result,{price_per_m2=0,freight=0,markup_pct=0}={}){
  const material=Math.max(0,Number(price_per_m2)||0)*Math.max(0,Number(result?.ordered_area_m2)||0);
  const freightValue=Math.max(0,Number(freight)||0);
  const cost=material+freightValue;
  const markup=Math.max(0,Number(markup_pct)||0);
  const resale=cost*(1+markup/100);
  return {material_cost:material,freight:freightValue,total_cost:cost,markup_pct:markup,resale_price:resale};
}
