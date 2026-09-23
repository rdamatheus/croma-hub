export const DEFAULT_SHEET_CONFIG = Object.freeze({
  sheet_width_mm: 2000,
  sheet_height_mm: 1000,
  margin_mm: 0,
  gap_mm: 0,
  allow_rotation: true
});

const EPS=1e-7;

export function normalizeSheetConfig(input={}){
  const cfg={...DEFAULT_SHEET_CONFIG,...input};
  cfg.sheet_width_mm=Math.max(1,Number(cfg.sheet_width_mm)||DEFAULT_SHEET_CONFIG.sheet_width_mm);
  cfg.sheet_height_mm=Math.max(1,Number(cfg.sheet_height_mm)||DEFAULT_SHEET_CONFIG.sheet_height_mm);
  cfg.margin_mm=Math.max(0,Number(cfg.margin_mm)||0);
  cfg.gap_mm=Math.max(0,Number(cfg.gap_mm)||0);
  cfg.allow_rotation=cfg.allow_rotation!==false;
  cfg.usable_width_mm=cfg.sheet_width_mm-(cfg.margin_mm*2);
  cfg.usable_height_mm=cfg.sheet_height_mm-(cfg.margin_mm*2);
  if(cfg.usable_width_mm<=0||cfg.usable_height_mm<=0) throw new Error('A margem deixa a chapa sem área útil.');
  return cfg;
}

export function normalizeSheetItems(items=[]){
  if(!Array.isArray(items)||!items.length) throw new Error('Adicione pelo menos uma placa à simulação.');
  return items.map((item,index)=>{
    const width=Math.max(0,Number(item.width_mm ?? item.widthMm));
    const height=Math.max(0,Number(item.height_mm ?? item.heightMm));
    const quantity=Math.floor(Number(item.quantity)||0);
    if(!(width>0)||!(height>0)) throw new Error(`Placa ${index+1}: informe largura e altura válidas.`);
    if(quantity<1) throw new Error(`Placa ${index+1}: informe uma quantidade válida.`);
    return {
      id:String(item.id ?? `item-${index+1}`),
      name:String(item.name ?? item.description ?? `Placa ${index+1}`),
      width_mm:width,
      height_mm:height,
      quantity,
      metadata:item.metadata||{}
    };
  });
}

function orientations(item,cfg){
  const out=[{w:item.width_mm,h:item.height_mm,rotated:false}];
  if(cfg.allow_rotation && Math.abs(item.width_mm-item.height_mm)>EPS) out.push({w:item.height_mm,h:item.width_mm,rotated:true});
  return out.filter(o=>o.w<=cfg.usable_width_mm+EPS && o.h<=cfg.usable_height_mm+EPS);
}

function intersects(a,b){
  return !(a.x>=b.x+b.w-EPS || a.x+a.w<=b.x+EPS || a.y>=b.y+b.h-EPS || a.y+a.h<=b.y+EPS);
}
function contains(a,b){
  return b.x>=a.x-EPS && b.y>=a.y-EPS && b.x+b.w<=a.x+a.w+EPS && b.y+b.h<=a.y+a.h+EPS;
}
function splitFreeRect(free,used){
  if(!intersects(free,used)) return [free];
  const out=[];
  if(used.x>free.x+EPS) out.push({x:free.x,y:free.y,w:used.x-free.x,h:free.h});
  if(used.x+used.w<free.x+free.w-EPS) out.push({x:used.x+used.w,y:free.y,w:(free.x+free.w)-(used.x+used.w),h:free.h});
  if(used.y>free.y+EPS) out.push({x:free.x,y:free.y,w:free.w,h:used.y-free.y});
  if(used.y+used.h<free.y+free.h-EPS) out.push({x:free.x,y:used.y+used.h,w:free.w,h:(free.y+free.h)-(used.y+used.h)});
  return out.filter(r=>r.w>EPS&&r.h>EPS);
}
function pruneFreeRects(rects){
  const out=[];
  for(let i=0;i<rects.length;i++){
    let contained=false;
    for(let j=0;j<rects.length;j++){
      if(i!==j&&contains(rects[j],rects[i])){contained=true;break;}
    }
    if(!contained) out.push(rects[i]);
  }
  return out;
}
function createSheet(cfg){
  return {free:[{x:0,y:0,w:cfg.usable_width_mm+cfg.gap_mm,h:cfg.usable_height_mm+cfg.gap_mm}],placements:[],counts:{}};
}
function bestPlacement(sheet,item,cfg,mode='short'){
  let best=null;
  for(const o of orientations(item,cfg)){
    const pw=o.w+cfg.gap_mm, ph=o.h+cfg.gap_mm;
    for(let i=0;i<sheet.free.length;i++){
      const fr=sheet.free[i];
      if(pw>fr.w+EPS||ph>fr.h+EPS) continue;
      const leftoverW=fr.w-pw,leftoverH=fr.h-ph;
      const short=Math.min(leftoverW,leftoverH),long=Math.max(leftoverW,leftoverH);
      const score=mode==='area'
        ? [fr.w*fr.h-pw*ph,short,long,fr.y,fr.x]
        : mode==='bottom'
          ? [fr.y,fr.x,short,long]
          : [short,long,fr.y,fr.x];
      if(!best||score.some((v,k)=>Math.abs(v-best.score[k])>EPS&&(v<best.score[k]))) {
        let decided=false;
        if(best){
          for(let k=0;k<score.length;k++){
            if(score[k]<best.score[k]-EPS){decided=true;break;}
            if(score[k]>best.score[k]+EPS){decided=false;break;}
          }
        }else decided=true;
        if(decided) best={x:fr.x,y:fr.y,w:o.w,h:o.h,pw,ph,rotated:o.rotated,freeIndex:i,score};
      }
    }
  }
  return best;
}
function place(sheet,item,p,cfg){
  const used={x:p.x,y:p.y,w:p.pw,h:p.ph};
  let next=[];
  for(const fr of sheet.free) next.push(...splitFreeRect(fr,used));
  sheet.free=pruneFreeRects(next);
  sheet.placements.push({item_id:item.id,name:item.name,x:p.x+cfg.margin_mm,y:p.y+cfg.margin_mm,w:p.w,h:p.h,rotated:p.rotated});
  sheet.counts[item.id]=(sheet.counts[item.id]||0)+1;
}
function expandItems(items,sorter){
  const ordered=items.slice().sort(sorter), out=[];
  for(const item of ordered) for(let i=0;i<item.quantity;i++) out.push(item);
  return out;
}
function packWithStrategy(items,cfg,sorter,mode){
  const sheets=[];
  for(const item of expandItems(items,sorter)){
    let best=null;
    for(let s=0;s<sheets.length;s++){
      const p=bestPlacement(sheets[s],item,cfg,mode);
      if(!p) continue;
      const score=[...p.score,s];
      let take=!best;
      if(best){
        for(let k=0;k<score.length;k++){
          if(score[k]<best.score[k]-EPS){take=true;break;}
          if(score[k]>best.score[k]+EPS){take=false;break;}
        }
      }
      if(take) best={sheetIndex:s,p,score};
    }
    if(!best){
      const sheet=createSheet(cfg),p=bestPlacement(sheet,item,cfg,mode);
      if(!p) throw new Error(`“${item.name}” não cabe na chapa útil de ${(cfg.usable_width_mm/10).toFixed(1)} × ${(cfg.usable_height_mm/10).toFixed(1)} cm.`);
      sheets.push(sheet); best={sheetIndex:sheets.length-1,p,score:p.score};
    }
    place(sheets[best.sheetIndex],item,best.p,cfg);
  }
  return sheets;
}
function usedExtent(sheet,cfg){
  let maxX=cfg.margin_mm,maxY=cfg.margin_mm;
  for(const p of sheet.placements){maxX=Math.max(maxX,p.x+p.w);maxY=Math.max(maxY,p.y+p.h);}
  return Math.max(0,(maxX-cfg.margin_mm)*(maxY-cfg.margin_mm));
}
function validate(items,sheets,cfg){
  const allocated={};
  for(const sheet of sheets){
    for(const p of sheet.placements){
      allocated[p.item_id]=(allocated[p.item_id]||0)+1;
      if(p.x<cfg.margin_mm-EPS||p.y<cfg.margin_mm-EPS||p.x+p.w>cfg.sheet_width_mm-cfg.margin_mm+EPS||p.y+p.h>cfg.sheet_height_mm-cfg.margin_mm+EPS) throw new Error('Falha de validação: uma peça ultrapassou a área útil da chapa.');
    }
    for(let i=0;i<sheet.placements.length;i++) for(let j=i+1;j<sheet.placements.length;j++){
      const a=sheet.placements[i],b=sheet.placements[j];
      const expandedA={x:a.x,y:a.y,w:a.w+cfg.gap_mm,h:a.h+cfg.gap_mm};
      const expandedB={x:b.x,y:b.y,w:b.w+cfg.gap_mm,h:b.h+cfg.gap_mm};
      if(intersects(expandedA,expandedB)) throw new Error('Falha de validação: o encaixe gerou sobreposição.');
    }
  }
  for(const item of items) if((allocated[item.id]||0)!==item.quantity) throw new Error(`Falha de validação: quantidade de “${item.name}” não foi totalmente alocada.`);
}
export function optimizeSheetLayout(rawItems=[],rawConfig={}){
  const cfg=normalizeSheetConfig(rawConfig),items=normalizeSheetItems(rawItems);
  for(const item of items) if(!orientations(item,cfg).length) throw new Error(`“${item.name}” não cabe na chapa útil em nenhuma orientação.`);
  const sorters=[
    (a,b)=>(b.width_mm*b.height_mm)-(a.width_mm*a.height_mm),
    (a,b)=>Math.max(b.width_mm,b.height_mm)-Math.max(a.width_mm,a.height_mm),
    (a,b)=>b.height_mm-a.height_mm||b.width_mm-a.width_mm,
    (a,b)=>b.width_mm-a.width_mm||b.height_mm-a.height_mm
  ];
  const candidates=[];
  for(const sorter of sorters) for(const mode of ['short','area','bottom']){
    const sheets=packWithStrategy(items,cfg,sorter,mode);
    candidates.push({sheets,score:[sheets.length,sheets.reduce((s,x)=>s+usedExtent(x,cfg),0)]});
  }
  candidates.sort((a,b)=>a.score[0]-b.score[0]||a.score[1]-b.score[1]);
  const sheets=candidates[0].sheets;
  validate(items,sheets,cfg);
  const geometricArea=items.reduce((s,i)=>s+(i.width_mm*i.height_mm*i.quantity)/1e6,0);
  const fullArea=(cfg.sheet_width_mm*cfg.sheet_height_mm)/1e6;
  const orderedArea=fullArea*sheets.length;
  return {
    config:cfg,
    items,
    sheets:sheets.map((sheet,index)=>({
      index:index+1,
      width_mm:cfg.sheet_width_mm,
      height_mm:cfg.sheet_height_mm,
      area_m2:fullArea,
      placements:sheet.placements,
      counts:sheet.counts
    })),
    total_units:items.reduce((s,i)=>s+i.quantity,0),
    sheet_count:sheets.length,
    geometric_area_m2:geometricArea,
    ordered_area_m2:orderedArea,
    paid_blank_area_m2:Math.max(0,orderedArea-geometricArea),
    utilization_pct:orderedArea>0?(geometricArea/orderedArea)*100:0,
    loss_pct:orderedArea>0?((orderedArea-geometricArea)/orderedArea)*100:0
  };
}
export function calculateSheetFinancials(result,{price_per_sheet=0,freight=0,markup_pct=0}={}){
  const material=Math.max(0,Number(price_per_sheet)||0)*Math.max(0,Number(result?.sheet_count)||0);
  const freightValue=Math.max(0,Number(freight)||0),cost=material+freightValue,markup=Math.max(0,Number(markup_pct)||0);
  return {material_cost:material,freight:freightValue,total_cost:cost,markup_pct:markup,resale_price:cost*(1+markup/100)};
}
