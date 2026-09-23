function normalizeText(value=''){
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toUpperCase()
    .replace(/\.PDF$/i,'')
    .replace(/\([^)]*\)/g,' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*X\s*\d+(?:[.,]\d+)?\s*CM\b/g,' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*CM\b/g,' ')
    .replace(/\b\d+\s*X\b/g,' ')
    .replace(/\bADESIVO\b/g,' ')
    .replace(/[^A-Z0-9]+/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}

function tokenScore(a,b){
  const aa=normalizeText(a),bb=normalizeText(b);
  if(!aa||!bb) return 0;
  if(aa===bb) return 1000;
  if(aa.includes(bb)||bb.includes(aa)) return 800+Math.min(aa.length,bb.length);
  const aTokens=new Set(aa.split(' ').filter(Boolean));
  const bTokens=new Set(bb.split(' ').filter(Boolean));
  let overlap=0;
  for(const t of aTokens) if(bTokens.has(t)) overlap++;
  return overlap/Math.max(1,Math.max(aTokens.size,bTokens.size))*500;
}

const PHYSICAL_FOLDER_ALIASES=Object.freeze({
  'ADESIVOS CORTE RETO':'Adesivos Brilho'
});

export function resolveInHouseSource(item,production){
  if(item?.source_file_name) return item;
  const categoryFolder=String(item?.source_folder||'');
  const physicalFolder=PHYSICAL_FOLDER_ALIASES[categoryFolder]||categoryFolder;
  const files=production?.files_by_folder?.[physicalFolder]||[];
  if(!files.length) return item;
  let best=null;
  for(const file of files){
    const score=tokenScore(item.name,file.title);
    if(!best||score>best.score) best={file,score};
  }
  if(!best||best.score<120) return item;
  return {
    ...item,
    source_category:categoryFolder,
    source_folder:physicalFolder,
    source_file_name:best.file.title,
    source_mime_type:best.file.mime_type
  };
}

export function enrichInHouseItems(items,production){
  return (items||[]).map(item=>resolveInHouseSource(item,production));
}

function csvEscape(value){
  const s=String(value??'');
  return /[;"\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;
}

function num(value,digits=3){
  const n=Number(value||0);
  return Number.isFinite(n)?n.toFixed(digits).replace(/\.?0+$/,''):'0';
}

export function buildCorelRows(result,sourceItems=[]){
  if(!result?.segments?.length) return [];
  const itemMap=new Map((sourceItems||[]).map(item=>[String(item.id),item]));
  const rows=[];
  let piece=0;
  for(const segment of result.segments){
    for(const placement of segment.placements||[]){
      piece++;
      const source=itemMap.get(String(placement.item_id))||{};
      rows.push({
        segmento:segment.index,
        peca:piece,
        item:placement.name||source.name||'',
        material:source.source_folder||'',
        arquivo:source.source_file_name||'',
        x_cm:placement.x/10,
        y_cm:placement.y/10,
        largura_cm:placement.w/10,
        altura_cm:placement.h/10,
        rotacao_graus:placement.rotated?90:0,
        pagina_largura_cm:segment.width_mm/10,
        pagina_altura_cm:segment.height_mm/10
      });
    }
  }
  return rows;
}

export function buildCorelCsv(result,sourceItems=[]){
  const headers=['segmento','peca','item','material','arquivo','x_cm','y_cm','largura_cm','altura_cm','rotacao_graus','pagina_largura_cm','pagina_altura_cm'];
  const rows=buildCorelRows(result,sourceItems);
  const body=rows.map(row=>headers.map(key=>{
    const value=row[key];
    return csvEscape(typeof value==='number'?num(value):value);
  }).join(';'));
  return '\uFEFF'+[headers.join(';'),...body].join('\r\n');
}

export function buildCorelManifest(result,sourceItems=[],meta={}){
  const rows=buildCorelRows(result,sourceItems);
  const missing=rows.filter(row=>!row.arquivo);
  return {
    schema:'croma-corel-layout-v1',
    created_at:new Date().toISOString(),
    simulation_type:meta.simulation_type||result?.mode||'roll',
    source_root:meta.source_root||'In House / PRODUÇÃO',
    coordinate_origin:'top-left',
    unit:'cm',
    segments:(result?.segments||[]).map(s=>({
      index:s.index,
      width_cm:s.width_mm/10,
      height_cm:s.height_mm/10,
      area_m2:s.area_m2
    })),
    pieces:rows,
    missing_source_files:missing.map(row=>({piece:row.peca,item:row.item,material:row.material}))
  };
}

export function downloadTextFile(filename,content,mime='text/plain;charset=utf-8'){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

export function safeFileStem(value='simulacao'){
  return String(value||'simulacao').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'simulacao';
}
