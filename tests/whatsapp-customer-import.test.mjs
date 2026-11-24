import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {deflateRawSync} from 'node:zlib';
import {test} from 'node:test';
const src=await readFile(new URL('../js/whatsapp-customer-import-core.js',import.meta.url));
const m=await import('data:text/javascript;base64,'+src.toString('base64'));
function crc32(bytes){let c=0xffffffff;for(const x of bytes){c^=x;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;}
function zip(name,data,method=8){
 const n=Buffer.from(name),raw=Buffer.from(data),p=method===8?deflateRawSync(raw):raw;
 const l=Buffer.alloc(30),d=Buffer.alloc(46),e=Buffer.alloc(22),crc=crc32(raw);
 l.writeUInt32LE(0x04034b50);l.writeUInt16LE(20,4);l.writeUInt16LE(0x800,6);l.writeUInt16LE(method,8);l.writeUInt32LE(crc,14);l.writeUInt32LE(p.length,18);l.writeUInt32LE(raw.length,22);l.writeUInt16LE(n.length,26);
 d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt16LE(0x800,8);d.writeUInt16LE(method,10);d.writeUInt32LE(crc,16);d.writeUInt32LE(p.length,20);d.writeUInt32LE(raw.length,24);d.writeUInt16LE(n.length,28);
 e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,8);e.writeUInt16LE(1,10);e.writeUInt32LE(d.length+n.length,12);e.writeUInt32LE(l.length+n.length+p.length,16);
 return new File([l,n,p,d,n,e],'teste.zip');
}
const txt='23/11/2026 21:10 - Cliente: Olá\n23/11/2026 21:11 - Croma: Segue a arte';
test('ZIP armazenado e DEFLATE: preserva conteúdo UTF-8',async()=>{
 for(const method of [0,8]){
  const result=await m.prepare([zip('texto/conversa.txt',txt,method)]);
  assert.equal(result.rows.length,2);assert.equal(result.rows[0].body,'Olá');assert.equal(await result.files[0].file.text(),txt);
 }
});
test('exportador Croma, categorias e hash repetível',async()=>{
 const t='ATENDIMENTO DO WHATSAPP\nContato: Cliente Teste\nTelefone: 32999999999\n[23/11/2026 21:10] CROMA — ENVIADA\nArte\n[Arquivo: arte.cdr]\n';
 const first=await m.prepare([zip('texto/conversa.txt',t),new File(['ABC'],'arte.cdr'),new File(['ABC'],'copia.cdr')]);
 const second=await m.prepare([new File([t],'conversa.txt')]);
 assert.equal(first.chat.phone,'32999999999');assert.equal(first.rows[0].file_names,'arte.cdr');assert.equal(first.rows[0].direction,'enviada');
 assert.equal(first.rows[0].fingerprint,second.rows[0].fingerprint);assert.equal(first.files.length,2);
 assert.deepEqual(['foto.jpg','video.mp4','audio.opus','pedido.pdf','arte.cdr','doc.docx'].map(m.category),['imagem','video','audio','pdf','producao','documento']);
});
test('rejeita caminho malicioso e ZIP inválido',async()=>{
 await assert.rejects(m.unzip(zip('../fora.txt','x')),/Caminho inválido/);
 await assert.rejects(m.unzip(new File(['erro'],'teste.zip')),/ZIP inválido/);
});

test('download ZIP preserva bytes, categorias e nomes com acentos sem colisão',async()=>{
 const original=new Uint8Array([0,1,2,255]);
 const blob=await m.buildDownloadZip([{name:'arte café.cdr',blob:new Blob([original])},{name:'arte café.cdr',blob:new Blob(['segunda'])},{name:'../foto.jpg',blob:new Blob(['imagem'])}]);
 const extracted=await m.unzip(new File([blob],'download.zip'));
 assert.deepEqual(extracted.map(e=>e.path),['producao/arte café.cdr','producao/arte café (2).cdr','imagem/foto.jpg']);
 assert.deepEqual(new Uint8Array(await extracted[0].file.arrayBuffer()),original);
 assert.equal(await extracted[1].file.text(),'segunda');
});
test('progresso de upload considera bytes e reserva confirmação final',()=>{
 assert.equal(m.uploadProgress(100,0,0),5);
 assert.equal(m.uploadProgress(100,20,30),50);
 assert.equal(m.uploadProgress(100,100,0),95);
 assert.equal(m.uploadProgress(100,0,150),95);
 assert.equal(m.uploadProgress(0,0,0,1,2),50);
});
test('download ZIP rejeita seleção vazia e nomes inseguros',async()=>{
 await assert.rejects(m.buildDownloadZip([]),/Selecione/);
 assert.equal(m.safeZipName('../..',new Set()),'arquivo');
});

test('diretório e importador compartilham a mesma interface e controles',async()=>{
 const html=await readFile(new URL('../interno/whatsapp-lab/clientes/index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../js/whatsapp-customer-import.js',import.meta.url),'utf8');
 const ids=[...js.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
 for(const id of new Set(ids))assert.ok(html.includes('id="'+id+'"'),'Controle ausente: '+id);
 assert.match(html,/id="importContact" hidden/);
 assert.match(html,/id="importFiles" hidden/);
 assert.match(js,/rpc\('whatsapp_customer_directory'/);
 assert.match(js,/if\(version!==searchVersion\)return/);
 assert.match(js,/await loadHistory\(\);await loadDirectory\(\)/);
});
