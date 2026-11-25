import {supabase,STORAGE_BUCKET,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './croma-supabase.js';
import {category,contentType,buildDownloadZip,LIMITS} from './whatsapp-customer-import-core.js?v=20261123-2';
const $=id=>document.getElementById(id);
const node=(tag,text)=>{const e=document.createElement(tag);if(text!=null)e.textContent=text;return e;};
const btn=(text,action)=>{const e=node('button',text);e.type='button';e.className='internal-btn secondary';e.onclick=action;return e;};
const size=n=>(Number(n||0)/1048576).toFixed(2)+' MiB';
const ext=f=>String(f.file_name).split('.').pop().toLowerCase();
const formats={image:/^(jpg|jpeg|png|gif|webp|avif|bmp)$/,video:/^(mp4|webm|mov|m4v|3gp)$/,audio:/^(mp3|ogg|opus|wav|m4a|aac|flac|amr)$/,pdf:/^pdf$/,text:/^(txt|json|csv)$/};
const kind=f=>Object.keys(formats).find(k=>formats[k].test(ext(f)));
export async function uploadWithProgress(path,file,onProgress){
 const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw Error('Sessão expirada. Entre novamente.');
 const url=SUPABASE_URL+'/storage/v1/object/'+encodeURIComponent(STORAGE_BUCKET)+'/'+path.split('/').map(encodeURIComponent).join('/');
 return new Promise((resolve,reject)=>{
  const req=new XMLHttpRequest();req.open('POST',url);req.timeout=300000;
  req.setRequestHeader('apikey',SUPABASE_PUBLISHABLE_KEY);req.setRequestHeader('Authorization','Bearer '+data.session.access_token);
  req.setRequestHeader('x-upsert','false');req.setRequestHeader('Content-Type',contentType(file.name));req.setRequestHeader('cache-control','max-age=3600');
  req.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(file.size,e.loaded));};
  req.onload=()=>req.status>=200&&req.status<300?resolve():reject(Error('Falha no envio (HTTP '+req.status+').'));
  req.onerror=()=>reject(Error('Falha de conexão durante o envio.'));
  req.ontimeout=()=>reject(Error('Tempo de envio excedido. Tente novamente.'));
  req.onabort=()=>reject(Error('Envio interrompido.'));
  req.send(file);
 });
}
async function signed(f,download=false){
 const {data,error}=await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(f.storage_path,300,download?{download:f.file_name}:{});
 if(error)throw error;return data.signedUrl;
}
function trigger(url,name){const a=node('a');a.href=url;a.download=name||'';a.rel='noopener';document.body.append(a);a.click();a.remove();}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);trigger(url,name);setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function createGallery(labels){
 let all=[],selection=new Set(),generation=0,previewVersion=0,downloading=false,observer=null;
 const box=$('attachments'),dialog=$('fileDialog'),stage=$('filePreview'),summary=$('selectionCount'),note=$('fileStatus');
 let previewUrl=null;
 function clearPreview(){
  previewVersion++;stage.replaceChildren();if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}
 }
 dialog.addEventListener('close',clearPreview);
 $('closePreview').onclick=()=>dialog.close();
 function say(message,error=false){note.textContent=message;note.classList.toggle('error',error);}
 function sync(){
  const ids=new Set(all.map(f=>f.id));for(const id of selection)if(!ids.has(id))selection.delete(id);
  summary.textContent=selection.size+' selecionado(s) de '+all.length;
  $('selectAllFiles').checked=all.length>0&&selection.size===all.length;
  $('selectAllFiles').indeterminate=selection.size>0&&selection.size<all.length;
  $('selectAllFiles').disabled=!all.length||downloading;
  $('downloadSelection').disabled=!selection.size||downloading;
  for(const input of box.querySelectorAll('input[data-file]')){input.checked=selection.has(input.dataset.file);input.disabled=downloading;}
  for(const input of box.querySelectorAll('input[data-group]')){
   const ids=all.filter(f=>category(f.file_name)===input.dataset.group&&f.file_name.toLocaleLowerCase().includes($('filter').value.toLocaleLowerCase())).map(f=>f.id);
   const n=ids.filter(id=>selection.has(id)).length;input.checked=!!ids.length&&n===ids.length;input.indeterminate=n>0&&n<ids.length;input.disabled=downloading;
  }
 }
 async function single(f){try{trigger(await signed(f,true),f.file_name);}catch(e){say(e.message,true);}}
 async function preview(f){
  clearPreview();const version=previewVersion;const customer=generation;
  $('previewName').textContent=f.file_name;$('previewMeta').textContent=size(f.size_bytes);
  $('previewDownload').onclick=()=>single(f);
  if(!dialog.open)dialog.showModal();stage.append(node('p','Carregando prévia…'));
  const type=kind(f);
  if(!type){stage.replaceChildren(node('p','Pré-visualização indisponível para este formato. Baixe o original para abrir no programa compatível.'));return;}
  try{
   // Texto é renderizado exclusivamente como texto; arquivos ativos nunca são interpretados como HTML.
   if(type==='text'||type==='pdf'){
    const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(f.storage_path);if(error)throw error;
    if(version!==previewVersion||generation!==customer||!dialog.open)return;
    if(type==='text'){const pre=node('pre',await data.slice(0,262144).text());if(version!==previewVersion||!dialog.open)return;stage.replaceChildren(pre);if(data.size>262144)stage.append(node('p','Prévia limitada a 256 KiB. Baixe para ler o conteúdo completo.'));return;}
    previewUrl=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));
    const frame=node('iframe');frame.title='Prévia do PDF';frame.sandbox='';frame.src=previewUrl;
    const open=btn('Abrir PDF em nova aba',()=>{if(previewUrl)window.open(previewUrl,'_blank','noopener,noreferrer');});
    stage.replaceChildren(frame,open,node('p','Se o visualizador incorporado não abrir, use a nova aba ou Baixar original.'));return;
   }
   const url=await signed(f);if(version!==previewVersion||generation!==customer||!dialog.open)return;
   const media=node(type==='image'?'img':type);media.src=url;
   if(type==='image')media.alt=f.file_name;else{media.controls=true;media.preload='metadata';}
   media.onerror=()=>{if(version===previewVersion)stage.replaceChildren(node('p','Formato não suportado pelo navegador ou link expirado. Baixe o arquivo original.'));};
   stage.replaceChildren(media);
  }catch(e){if(version===previewVersion)stage.replaceChildren(node('p','Não foi possível abrir a prévia: '+e.message));}
 }
 async function readResult(f){
  clearPreview();const version=previewVersion;
  $('previewName').textContent=f.file_name;$('previewMeta').textContent='Leitura assistida';
  $('previewDownload').onclick=()=>single(f);
  if(!dialog.open)dialog.showModal();stage.append(node('p','Carregando leitura…'));
  try{
   const {data,error}=await supabase.from('lab_whatsapp_anexos').select('processing_status,extracted_text,transcription').eq('id',f.id).maybeSingle();
   if(error||!data||data.processing_status!=='concluido'||!String(data.transcription||data.extracted_text||'').trim())throw Error('Leitura não confirmada.');
   if(version===previewVersion&&dialog.open)stage.replaceChildren(node('p','Confira as informações no arquivo original antes de utilizá-las.'),node('pre',data.transcription||data.extracted_text));
  }catch(e){if(version===previewVersion&&dialog.open)stage.replaceChildren(node('p',e.message));}
 }
 function render(filter=''){
  observer?.disconnect();box.replaceChildren();const version=generation;
  if(typeof IntersectionObserver!=='undefined')observer=new IntersectionObserver((entries,currentObserver)=>{
   for(const entry of entries)if(entry.isIntersecting){
    const img=entry.target;currentObserver.unobserve(img);
    const f=all.find(x=>x.id===img.dataset.id);
    if(f)signed(f).then(url=>{if(generation===version&&img.isConnected)img.src=url;}).catch(()=>{});
   }
  },{rootMargin:'100px'});
  for(const [key,label] of Object.entries(labels)){
   const files=all.filter(f=>category(f.file_name)===key&&f.file_name.toLocaleLowerCase().includes(filter));
   if(!files.length)continue;
   const group=node('details');group.open=true;const heading=node('summary',label+' ('+files.length+')');group.append(heading);
   const groupLabel=node('label');groupLabel.className='group-select';const groupCheck=node('input');groupCheck.type='checkbox';groupCheck.dataset.group=key;
   groupCheck.onchange=()=>{for(const f of files)groupCheck.checked?selection.add(f.id):selection.delete(f.id);sync();};groupLabel.append(groupCheck,document.createTextNode(' Selecionar arquivos visíveis da categoria'));group.append(groupLabel);
   const grid=node('div');grid.className='file-grid';
   for(const f of files){
    const card=node('article');card.className='file-card';const check=node('input');check.type='checkbox';check.dataset.file=f.id;check.setAttribute('aria-label','Selecionar '+f.file_name);
    check.onchange=()=>{check.checked?selection.add(f.id):selection.delete(f.id);sync();};
    const thumbnail=btn('',()=>preview(f));thumbnail.className='file-thumb';thumbnail.setAttribute('aria-label','Visualizar '+f.file_name);
    const type=kind(f);thumbnail.append(node('span',ext(f).toUpperCase().slice(0,10)||'ARQ'));
    if(type==='image'&&Number(f.size_bytes)<=2*1048576&&observer){
     const img=node('img');img.alt='';img.loading='lazy';img.dataset.id=f.id;img.onerror=()=>img.remove();img.onload=()=>thumbnail.classList.add('has-image');thumbnail.append(img);observer.observe(img);
    }
    const heading=node('strong',f.file_name);heading.title=f.file_name;
    const actions=node('div');actions.className='row';actions.append(btn('Visualizar',()=>preview(f)),btn('Baixar',()=>single(f)));
    const states={pendente:'Leitura pendente',processando:'Em processamento',concluido:'Leitura concluída',erro:'Falha na leitura'};
    const readLabel=node('small',states[f.processing_status]||'Sem leitura confirmada');
    if(f.processing_error)readLabel.title=f.processing_error;
    if(f.processing_status==='concluido')actions.append(btn('Ver leitura',()=>readResult(f)));
    card.append(check,thumbnail,heading,node('small',size(f.size_bytes)),readLabel,actions);grid.append(card);
   }
   group.append(grid);box.append(group);
  }
  if(!box.childElementCount)box.append(node('p','Nenhum arquivo encontrado.'));
  sync();
 }
 function reset(files=[]){
  generation++;all=files;selection.clear();observer?.disconnect();if(dialog.open)dialog.close();clearPreview();box.replaceChildren();say('');sync();
 }
 $('selectAllFiles').onchange=()=>{selection=new Set($('selectAllFiles').checked?all.map(f=>f.id):[]);sync();};
 $('downloadSelection').onclick=async()=>{
  const files=all.filter(f=>selection.has(f.id)),version=generation;if(!files.length||downloading)return;
  if(files.length===1){await single(files[0]);return;}
  if(files.length>LIMITS.entries||files.reduce((s,f)=>s+Number(f.size_bytes||0),0)>LIMITS.total){say('Limite de 200 MiB e 2.000 arquivos por ZIP. Selecione um grupo menor.',true);return;}
  downloading=true;sync();
  try{
   const entries=[];let bytes=0;
   for(let i=0;i<files.length;i++){
    if(generation!==version)return;
    say('Baixando '+(i+1)+' de '+files.length+' arquivos…');
    const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(files[i].storage_path);if(error)throw error;
    bytes+=data.size;if(bytes>LIMITS.total)throw Error('Limite de 200 MiB excedido.');
    entries.push({name:files[i].file_name,blob:data});
   }
   if(generation!==version)return;say('Montando ZIP…');const blob=await buildDownloadZip(entries);
   if(generation!==version)return;downloadBlob(blob,'arquivos-whatsapp-'+new Date().toISOString().slice(0,10)+'.zip');say('ZIP preparado. Confira os downloads do navegador.');
  }catch(e){if(generation===version)say('Não foi possível baixar o conjunto: '+e.message,true);}
  finally{downloading=false;sync();}
 };
 return {reset,render};
}
