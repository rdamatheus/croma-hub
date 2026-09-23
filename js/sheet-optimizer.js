export const DEFAULT_SHEET_CONFIG=Object.freeze({
  sheet_width_mm:2000,
  sheet_height_mm:1000,
  margin_mm:5,
  gap_mm:3,
  allow_rotation:true
});

const EPS=1e-7;

export function normalizeSheetConfig(input={}){
  const cfg={...DEFAULT_SHEET_CONFIG,...input};
  cfg.sheet_width_mm=Math.max(1,Number(cfg.sheet_width_mm)||DEFAULT_SHEET_CONFIG.sheet_width_mm);
  cfg.sheet_height_mm=Math.max(1,Number(cfg.sheet_height_mm)||DEFAULT_SHEET_CONFIG.sheet_height_mm);
  cfg.margin_mm=Math.max(0,Number(cfg.margin_mm)||0);
  cfg.gap_mm=Math.max(0,Number(cfg.gap_mm)||0);
  cfg.allow_rotation=cfg.allow_rotation!==false;
  cfg.usable_width_mm=cfg.sheet_width_mm-cfg.margin_mm*2;
  cfg.usable_height_mm=cfg.sheet_height_mm-cfg.margin_mm*2;
  if(cfg.usable_width_mm<=0||cfg.usable_height_mm<=0) throw new Error('As margens deixam a placa sem área útil.');
  return cfg;
}

export function normalizeSheetItems(items=[]){
  if(!Array.isArray(items)||!items.length) throw new Error('Adicione pelo menos uma peça à simulação.');
  return items.map((item,index)=>{
    const width=Math.max(0,Number(item.width_mm ?? item.widthMm));
    const height=Math.max(0,Number(item.height_mm ?? item.heightMm));
    const quantity=Math.floor(Number(item.quantity)||0);
    if(!(width>0)||!(height>0)) throw new Error(`Peça ${index+1}: informe largura e altura válidas.`);
    if(quantity<1) throw new Error(`Peça ${index+1}: informe uma quantidade válida.`);
    return {id:String(item.id??`item-${index+1}`),name:String(item.name??`Peça ${index+1}`),width_mm:width,height_mm:height,quantity};
  });
}

function fitAtNode(skyline,index,width,limitWidth){
  const x=skyline[index].x;
  if(x+width>limitWidth+EPS) return null;
  let y=skyline[index].y,remaining=width,i=index;
  while(remaining>EPS){
    if(i>=skyline.length) return null;
    y=Math.max(y,skyline[i].y);
    remaining-=skyline[i].width;
    i++;
  }
  return {x,y,index};
}

function addSkylineLevel(skyline,index,x,y,width,height){
  skyline.splice(index,0,{x,y:y+height,width});
  for(let i=index+1;i<skyline.length;i++){
    const prev=skyline[i-1],node=skyline[i];
    const overlap=(prev.x+prev.width)-node.x;
    if(overlap<=EPS) break;
    node.x+=overlap; node.width-=overlap;
    if(node.width<=EPS){skyline.splice(i,1);i--;} else break;
  }
  for(let i=0;i<skyline.length-1;i++){
    if(Math.abs(skyline[i].y-skyline[i+1].y)<EPS){
      skyline[i].width+=skyline[i+1].width;
      skyline.splice(i+1,1); i--;
    }
  }
}

function candidatesFor(item,cfg,skyline){
  const options=[{w:item.width_mm,h:item.height_mm,rotated:false}];
  if(cfg.allow_rotation&&Math.abs(item.width_mm-item.height_mm)>EPS) options.push({w:item.height_mm,h:item.width_mm,rotated:true});
  const out=[];
  for(const o of options){
    if(o.w>cfg.usable_width_mm+EPS||o.h>cfg.usable_height_mm+EPS) continue;
    const pw=o.w+cfg.gap_mm,ph=o.h+cfg.gap_mm;
    for(let i=0;i<skyline.length;i++){
      const pos=fitAtNode(skyline,i,pw,cfg.usable_width_mm);
      if(!pos) continue;
      if(pos.y+o.h>cfg.usable_height_mm+EPS) continue;
      out.push({...o,...pos,pw,ph,score:[pos.y+o.h,pos.y,pos.x,o.rotated?1:0]});
    }
  }
  out.sort((a,b)=>a.score[0]-b.score[0]||a.score[1]-b.score[1]||a.score[2]-b.score[2]||a.score[3]-b.score[3]);
  return out;
}

function canFitItem(item,cfg){
  const normal=item.width_mm<=cfg.usable_width_mm+EPS&&item.height_mm<=cfg.usable_height_mm+EPS;
  const rotated=cfg.allow_rotation&&item.height_mm<=cfg.usable_width_mm+EPS&&item.width_mm<=cfg.usable_height_mm+EPS;
  return normal||rotated;
}

export function optimizeSheetLayout(rawItems=[],rawConfig={}){
  const cfg=normalizeSheetConfig(rawConfig);
  const items=normalizeSheetItems(rawItems);
  for(const item of items){
    if(!canFitItem(item,cfg)) throw new Error(`“${item.name}” não cabe na área útil de ${(cfg.usable_width_mm/10).toFixed(1)} × ${(cfg.usable_height_mm/10).toFixed(1)} cm.`);
  }

  const queue=[];
  for(const item of items){
    for(let n=0;n<item.quantity;n++) queue.push(item);
  }
  queue.sort((a,b)=>(b.width_mm*b.height_mm)-(a.width_mm*a.height_mm)||Math.max(b.width_mm,b.height_mm)-Math.max(a.width_mm,a.height_mm));

  const sheets=[];
  for(const item of queue){
    let best=null;
    for(let s=0;s<sheets.length;s++){
      const c=candidatesFor(item,cfg,sheets[s].skyline)[0];
      if(c && (!best || c.score[0]<best.c.score[0]-EPS || (Math.abs(c.score[0]-best.c.score[0])<EPS && s<best.s))) best={s,c};
    }
    if(!best){
      sheets.push({skyline:[{x:0,y:0,width:cfg.usable_width_mm}],placements:[],counts:{}});
      best={s:sheets.length-1,c:candidatesFor(item,cfg,sheets[sheets.length-1].skyline)[0]};
    }
    const sheet=sheets[best.s],c=best.c;
    if(!c) throw new Error(`Não foi possível posicionar “${item.name}”.`);
    sheet.placements.push({item_id:item.id,name:item.name,x:c.x+cfg.margin_mm,y:c.y+cfg.margin_mm,w:c.w,h:c.h,rotated:c.rotated});
    sheet.counts[item.id]=(sheet.counts[item.id]||0)+1;
    addSkylineLevel(sheet.skyline,c.index,c.x,c.y,c.pw,c.ph);
  }

  const sheetAreaM2=(cfg.sheet_width_mm*cfg.sheet_height_mm)/1e6;
  const geometricArea=items.reduce((sum,item)=>sum+(item.width_mm*item.height_mm*item.quantity)/1e6,0);
  const totalArea=sheets.length*sheetAreaM2;
  return {
    mode:'sheet',
    config:cfg,
    items,
    segments:sheets.map((sheet,index)=>({
      index:index+1,
      width_mm:cfg.sheet_width_mm,
      height_mm:cfg.sheet_height_mm,
      area_m2:sheetAreaM2,
      linear_m:cfg.sheet_height_mm/1000,
      placements:sheet.placements,
      counts:sheet.counts
    })),
    total_units:items.reduce((s,i)=>s+i.quantity,0),
    total_linear_m:sheets.length,
    sheet_count:sheets.length,
    geometric_area_m2:geometricArea,
    ordered_area_m2:totalArea,
    paid_blank_area_m2:Math.max(0,totalArea-geometricArea),
    utilization_pct:totalArea>0?(geometricArea/totalArea)*100:0,
    loss_pct:totalArea>0?((totalArea-geometricArea)/totalArea)*100:0,
    single_segment_area_m2:totalArea,
    segmentation_saving_m2:0
  };
}
