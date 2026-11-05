// Núcleo puro da Central de Marketing. Nenhuma chamada de rede ou publicação.
export const PRODUCTION_STAGES = [
  {id:'ideia',label:'Ideia / briefing'},
  {id:'roteiro',label:'Roteiro'},
  {id:'captacao',label:'Gravação / fotos'},
  {id:'edicao',label:'Edição'},
  {id:'revisao',label:'Revisão'},
  {id:'pronto',label:'Pronto para publicar'},
  {id:'publicado',label:'Publicado (registro manual)'}
];
export const stageLabel = value => PRODUCTION_STAGES.find(stage=>stage.id===value)?.label || PRODUCTION_STAGES[0].label;
const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
export function localDateISO(date=new Date()){
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
}
export function monthCells(year,month){
  const first=new Date(year,month,1),start=new Date(year,month,1-first.getDay());
  const count=Math.ceil((first.getDay()+new Date(year,month+1,0).getDate())/7)*7;
  return Array.from({length:count},(_,i)=>{
    const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    return {date:localDateISO(d),day:d.getDate(),inMonth:d.getMonth()===month};
  });
}
export function unifyMarketingEvents(posts=[],productions=[],campaigns=[]){
  const events=[];
  const linked=new Set(posts.filter(p=>p.production_id).map(p=>p.production_id));
  for(const p of posts){
    if(validDay(p.date))events.push({date:p.date,title:p.title||'Postagem',brand:p.brand||'',channel:p.channel||'',status:p.status||'',source:'post',id:p.production_id||'',kind:'Postagem'});
  }
  for(const p of productions){
    if(!linked.has(p.id)&&validDay(p.planned_date))events.push({date:p.planned_date,title:p.title||'Produção',brand:p.brand||'',channel:p.channel||'',status:stageLabel(p.stage),source:'studio',id:p.id||'',kind:'Estúdio'});
  }
  for(const c of campaigns)for(const a of c.assets||[]){
    if(validDay(a.date))events.push({date:a.date,title:a.title||c.title||'Peça',brand:c.brand||'',channel:a.channel||'',status:a.status||'',source:'campaign',id:c.id||'',kind:'Campanha'});
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title,'pt-BR'));
}
export function collectMarketingMedia(productions=[],campaigns=[]){
  const rows=[],used=new Set();
  function add(url,title,origin,kind){
    try{
      const u=new URL(url);
      if(u.protocol!=='https:'||used.has(u.href))return;
      used.add(u.href);
      rows.push({url:u.href,title,origin,kind});
    }catch{}
  }
  for(const p of productions){
    add(p.asset_url,p.title,'Estúdio','Arquivo / Drive');
    add(p.edit_url,p.title,'Estúdio','Projeto de edição');
  }
  for(const c of campaigns){
    add(c.drive_url,c.title,'Campanha','Pasta / Drive');
    add(c.canva_url,c.title,'Campanha','Projeto Canva');
    for(const a of c.assets||[]){
      add(a.drive_url,a.title,c.title,'Peça / Drive');
      add(a.canva_url,a.title,c.title,'Peça / Canva');
      add(a.published_url,a.title,c.title,'Link publicado');
    }
  }
  return rows;
}
export function upsertProductionPost(posts,production){
  if(!production?.id||!production?.title||!validDay(production.planned_date))throw Error('Preencha título e data prevista.');
  const index=posts.findIndex(p=>p.production_id===production.id);
  const status=production.stage==='publicado'?'Publicado':production.stage==='pronto'?'Pronto para postar':'Produzir foto/vídeo';
  const post={title:production.title,date:production.planned_date,brand:production.brand||'Croma Gráfica',channel:production.channel||'Instagram Reels',production_id:production.id};
  if(index<0)return {posts:[...posts,{...post,status}],created:true};
  const updated=[...posts],previous=updated[index];
  // O status editado manualmente no calendário não é sobrescrito.
  updated[index]={...previous,...post};
  return {posts:updated,created:false};
}
