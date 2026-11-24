// Importação local: os arquivos só saem do navegador após confirmação.
export const LIMITS={file:50*1024*1024,total:200*1024*1024,entries:2000,messages:10000,text:10*1024*1024};
const dec=new TextDecoder('utf-8');
export const basename=p=>String(p).split(/[\\/]/).pop();
const ext=n=>basename(n).split('.').pop().toLowerCase();
export function category(n){
 const e=ext(n);
 if(/^(jpg|jpeg|png|gif|webp|heic|heif|tif|tiff|bmp|avif|svg)$/.test(e))return 'imagem';
 if(/^(mp4|mov|webm|avi|mkv|3gp|m4v)$/.test(e))return 'video';
 if(/^(ogg|opus|mp3|m4a|wav|aac|flac|amr)$/.test(e))return 'audio';
 if(e==='pdf')return 'pdf';
 if(/^(cdr|cdt|cmx|ai|psd|eps|indd|idml|dwg|dxf)$/.test(e))return 'producao';
 if(/^(txt|json|doc|docx|xls|xlsx|ppt|pptx|csv|odt|ods|rtf)$/.test(e))return 'documento';
 return 'outro';
}
export function contentType(n){
 return ({jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',ogg:'audio/ogg',opus:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',pdf:'application/pdf',txt:'text/plain',json:'application/json'})[ext(n)]||'application/octet-stream';
}
export async function sha256(value){
 const b=typeof value==='string'?new TextEncoder().encode(value):value;
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),v=>v.toString(16).padStart(2,'0')).join('');
}
const crcTable=Uint32Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i>>>1)^((i&1)?0xedb88320:0);return i>>>0;});
function crc32(b){let c=0xffffffff;for(const x of b)c=(c>>>8)^crcTable[(c^x)&255];return (c^0xffffffff)>>>0;}
export async function unzip(file){
 if(file.size>LIMITS.total)throw Error('ZIP maior que 200 MiB.');
 const b=new Uint8Array(await file.arrayBuffer()),v=new DataView(b.buffer);
 const u16=i=>v.getUint16(i,true),u32=i=>v.getUint32(i,true);
 let end=-1;
 for(let i=b.length-22;i>=Math.max(0,b.length-65557);i--)if(u32(i)===0x06054b50&&i+22+u16(i+20)===b.length){end=i;break;}
 if(end<0||u16(end+4)||u16(end+6)||u16(end+8)!==u16(end+10))throw Error('ZIP inválido ou dividido em volumes.');
 const count=u16(end+10),start=u32(end+16),dirSize=u32(end+12);
 if(count>LIMITS.entries||start+dirSize>end)throw Error('ZIP excede os limites ou não é compatível.');
 let pos=start,total=0;const entries=[];
 for(let i=0;i<count;i++){
  if(pos+46>start+dirSize||u32(pos)!==0x02014b50)throw Error('Diretório ZIP inválido.');
  const flags=u16(pos+8),method=u16(pos+10),crc=u32(pos+16),packed=u32(pos+20),size=u32(pos+24),nl=u16(pos+28),xl=u16(pos+30),cl=u16(pos+32),offset=u32(pos+42);
  if(pos+46+nl+xl+cl>start+dirSize)throw Error('Entrada ZIP inválida.');
  const name=dec.decode(b.subarray(pos+46,pos+46+nl)).replace(/\\/g,'/');
  pos+=46+nl+xl+cl;
  if(name.endsWith('/')||name.startsWith('__MACOSX/')||basename(name)==='.DS_Store')continue;
  if(!name||name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').some(x=>x==='..'||x==='.'||!x)||/[\x00-\x1f]/.test(name))throw Error('Caminho inválido no ZIP.');
  if((flags&1)||![0,8].includes(method)||size>LIMITS.file||(total+=size)>LIMITS.total)throw Error('Arquivo criptografado, formato incompatível ou limite excedido: '+name);
  if(offset+30>start||u32(offset)!==0x04034b50)throw Error('Cabeçalho ZIP inválido.');
  const from=offset+30+u16(offset+26)+u16(offset+28);
  if(from+packed>start)throw Error('Dados ZIP inválidos.');
  entries.push({name,method,from,packed,size,crc});
 }
 if(pos!==start+dirSize)throw Error('Diretório ZIP inconsistente.');
 const out=[];
 for(const e of entries){
  const raw=b.subarray(e.from,e.from+e.packed);let data;
  if(e.method===0)data=raw;
  else{
   const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
   const chunks=[];let n=0;
   try{for(;;){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>e.size||n>LIMITS.file)throw Error('Limite de descompressão excedido.');chunks.push(value);}}
   finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   data=new Uint8Array(n);let at=0;for(const c of chunks){data.set(c,at);at+=c.length;}
  }
  if(data.length!==e.size||crc32(data)!==e.crc)throw Error('Arquivo corrompido: '+e.name);
  out.push({path:e.name,file:new File([data],basename(e.name),{type:contentType(e.name)})});
 }
 return out;
}
export function normalizeDate(d){
 const m=String(d||'').match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/);
 if(!m)return String(d||'');return (m[3].length===2?'20'+m[3]:m[3])+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
}
export function parseTxt(text){
 const lines=String(text).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,'').split(/\r?\n/);const messages=[];const chat={};const croma=lines[0]?.trim()==='ATENDIMENTO DO WHATSAPP';
 for(const line of lines){
  if(croma){
   const hdr=line.match(/^\[([^\]]*)\]\s+(.*?)\s+—\s+(ENVIADA|RECEBIDA|INDEFINIDA)$/i);
   if(hdr){const stamp=hdr[1].match(/^(\S+)\s+(\S+)$/);messages.push({date:normalizeDate(stamp?.[1]||''),time:stamp?.[2]||'',author:hdr[2],direction:hdr[3].toLowerCase(),text:'',fileNames:''});continue;}
   if(!messages.length){if(line.startsWith('Contato: '))chat.name=line.slice(9);if(line.startsWith('Telefone: '))chat.phone=line.slice(10);continue;}
   const current=messages[messages.length-1],attachment=line.match(/^\[Arquivo: (.*)\]$/);if(attachment){current.fileNames=attachment[1];continue;}
   current.text+=(current.text?'\n':'')+line;continue;
  }
  const m=line.match(/^\[?(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)\]?(?:\s*[-–]\s*|\s+)(.*)$/);
  if(m){const a=m[3].match(/^([^:]{1,150}):\s?(.*)$/);messages.push({date:normalizeDate(m[1]),time:m[2],author:a?.[1]||'',text:a?.[2]??m[3],direction:'indefinida'});}
  else if(messages.length)messages[messages.length-1].text+='\n'+line;
 }
 if(!messages.length)throw Error('TXT não reconhecido como exportação do WhatsApp.');
 return {chat,messages};
}
export function parseJson(text){
 const p=JSON.parse(text);if(!Array.isArray(p?.messages))throw Error('JSON sem lista de mensagens.');
 return {chat:p.chat||{},messages:p.messages.map(m=>({...m,date:normalizeDate(m.date),text:String(m.text??m.body??'')}))};
}
export async function prepare(selected){
 let items=[],total=0;
 for(const f of selected){
  if(ext(f.name)==='zip')items.push(...await unzip(f));else items.push({path:f.webkitRelativePath||f.name,file:f});
  if(items.length>LIMITS.entries)throw Error('Limite de arquivos excedido.');
 }
 let chats=[],files=[];
 for(const item of items){
  const {file,path}=item;if(file.size>LIMITS.file||(total+=file.size)>LIMITS.total)throw Error('Limite de armazenamento excedido: '+path);
  if(['txt','json'].includes(ext(file.name))&&file.size<=LIMITS.text){
   try{const txt=await file.text();chats.push(ext(file.name)==='txt'?parseTxt(txt):parseJson(txt));}catch{}
  }
  const digest=await sha256(await file.arrayBuffer());
  files.push({...item,hash:digest,category:category(file.name)});
 }
 if(chats.length>1)throw Error('Mais de uma conversa reconhecida. Importe uma conversa por vez para evitar vínculo incorreto.');
 const chat=chats[0]?.chat||{},messages=chats[0]?.messages||[];
 if(messages.length>LIMITS.messages)throw Error('Limite de 10.000 mensagens por importação.');
 const occurrences=new Map(),rows=[];
 for(const m of messages){
  const date=normalizeDate(m.date),time=String(m.time||'').replace(/^(\d):/,'0$1:'),author=String(m.author||''),body=String(m.text||'').trimEnd();
  const base=JSON.stringify([date,time,author,body]);const n=(occurrences.get(base)||0)+1;occurrences.set(base,n);
  rows.push({fingerprint:await sha256(JSON.stringify([base,n])),date,time,author,body,direction:['enviada','recebida'].includes(m.direction)?m.direction:'indefinida',external_id:m.id||null,file_names:String(m.fileNames||''),raw:m});
 }
 return {chat,rows,files:[...new Map(files.map(f=>[f.hash,f])).values()],recognized:chats.length===1};
}

 
// ZIP sem compressão: preserva os bytes originais, nomes UTF-8 e evita bibliotecas externas.
export function safeZipName(name,used){
 const base=basename(name).replace(/[\x00-\x1f<>:"|?*]/g,'_').replace(/^[. ]+|[. ]+$/g,'').slice(0,180)||'arquivo';
 const dot=base.lastIndexOf('.'),stem=dot>0?base.slice(0,dot):base,suffix=dot>0?base.slice(dot):'';
 let candidate=base,n=2;
 while(used.has(candidate.toLowerCase()))candidate=stem+' ('+(n++)+')'+suffix;
 used.add(candidate.toLowerCase());return candidate;
}
export function uploadProgress(total,done,active=0,confirmed=0,count=0){
 const ratio=total>0?(done+active)/total:count?confirmed/count:0;
 return Math.max(0,Math.min(95,Math.floor(5+90*Math.max(0,Math.min(1,ratio)))));
}
export async function buildDownloadZip(entries){
 if(!entries.length||entries.length>LIMITS.entries)throw Error('Selecione de 1 a 2.000 arquivos.');
 const total=entries.reduce((sum,e)=>sum+e.blob.size,0);
 if(total>LIMITS.total)throw Error('O ZIP de download deve ter até 200 MiB. Selecione menos arquivos.');
 const chunks=[],directory=[],used=new Set(),enc=new TextEncoder();let offset=0,dirSize=0;
 const header=n=>new Uint8Array(n),view=b=>new DataView(b.buffer);
 for(const entry of entries){
  const group=category(entry.name),name=group+'/'+safeZipName(entry.name,used),filename=enc.encode(name);
  const bytes=new Uint8Array(await entry.blob.arrayBuffer()),length=bytes.length,crc=crc32(bytes);
  const local=header(30),l=view(local);l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true);l.setUint32(14,crc,true);l.setUint32(18,length,true);l.setUint32(22,length,true);l.setUint16(26,filename.length,true);
  const central=header(46),c=view(central);c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,length,true);c.setUint32(24,length,true);c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);
  chunks.push(local,filename,entry.blob);directory.push(central,filename);offset+=local.length+filename.length+length;dirSize+=central.length+filename.length;
 }
 const end=header(22),e=view(end);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true);
 return new Blob([...chunks,...directory,end],{type:'application/zip'});
}
