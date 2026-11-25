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
 assert.match(html,/<dialog id="importDialog" class="internal-dialog" aria-labelledby="importTitle"/);
 assert.match(html,/<dialog id="historyCard" class="internal-dialog internal-dialog-wide" aria-labelledby="historyTitle"/);
 assert.match(js,/rpc\('whatsapp_customer_directory'/);
 assert.match(js,/if\(version!==searchVersion\)return/);
 assert.match(js,/await loadHistory\(\);await loadDirectory\(\)/);
});

test('importação oficial de contato novo preserva o fluxo de vínculo e o isolamento de testes',async()=>{
 const html=await readFile(new URL('../interno/whatsapp-lab/clientes/index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../js/whatsapp-customer-import.js',import.meta.url),'utf8');
 const lab=await readFile(new URL('../js/whatsapp-lab.js',import.meta.url),'utf8');
 const sql=await readFile(new URL('../supabase/migrations/20261124221800_whatsapp_pending_history.sql',import.meta.url),'utf8');
 assert.ok(html.indexOf('id="importFiles"')<html.indexOf('id="importContact"'));
 for(const id of ['pendingList','saveUnlinked','linkPending','createContactDialog','pendingMatches'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/rpc\('import_whatsapp_pending'/);
 assert.match(js,/rpc\('link_whatsapp_pending'/);
 assert.match(js,/rpc\('whatsapp_contact_candidates'/);
 assert.match(js,/functions\.invoke\('admin-update-customer'/);
 assert.match(js,/if\(found\.length\)/);
 assert.match(lab,/\.is\('customer_id',null\)\s*\.neq\('source','whatsapp_pendente'\)/);
 assert.match(sql,/security invoker/);
 assert.match(sql,/raw_chat->>'pending_group'/);
 assert.match(sql,/import_fingerprint=m.fingerprint/);
 assert.match(sql,/lf.content_sha256=f.hash/);
 assert.match(sql,/revoke all on function public.import_whatsapp_pending/);
 assert.match(sql,/Há conteúdo repetido no cadastro de destino/);
});
test('conversa sem identificação e arquivo isolado podem ser preparados',async()=>{
 const missing=await m.prepare([new File([txt],'conversa.txt')]);
 assert.equal(missing.rows.length,2);
 assert.equal(missing.chat.phone,undefined);
 const file=await m.prepare([new File(['arte'],'arquivo.cdr')]);
 assert.equal(file.rows.length,0);assert.equal(file.files.length,1);
});

test('modais nativos, fechamento protegido e ausência de deslocamento automático',async()=>{
 const html=await readFile(new URL('../interno/whatsapp-lab/clientes/index.html',import.meta.url),'utf8');
 const js=await readFile(new URL('../js/whatsapp-customer-import.js',import.meta.url),'utf8');
 const css=await readFile(new URL('../css/interno-dialog.css',import.meta.url),'utf8');
 assert.match(html,/<dialog id="importDialog"[^>]*>[\s\S]*id="importFiles"[\s\S]*id="importContact"[\s\S]*<\/dialog>/);
 assert.match(html,/id="hideImport"[^>]*autofocus/);
 assert.match(html,/id="closeHistory"[^>]*autofocus/);
 assert.doesNotMatch(html,/O histórico oficial não se mistura aos testes/);
 assert.doesNotMatch(js,/scrollIntoView/);
 assert.match(js,/dialog\.showModal\(\)/);
 assert.match(js,/async function closeImport\(\)\{\s*if\(busy\|\|attempt\)return;\s*if\(!discardDraft\(\)\)return;/);
 assert.match(js,/\$\('importDialog'\)\.addEventListener\('cancel',e=>\{e\.preventDefault\(\);closeImport\(\);\}\)/);
 assert.match(css,/\.internal-dialog::backdrop/);
});

test('importação não afirma leitura do conteúdo dos anexos',async()=>{
 const js=await readFile(new URL('../js/whatsapp-customer-import.js',import.meta.url),'utf8');
 const html=await readFile(new URL('../interno/whatsapp-lab/clientes/index.html',import.meta.url),'utf8');
 assert.match(js,/Arquivos e mensagens salvos/);
 assert.match(js,/A leitura do conteúdo dos anexos é uma etapa separada/);
 assert.match(js,/processing_status==='concluido'/);
 assert.match(html,/id="contentStatus"/);
});

test('leitura oficial: separada do laboratório, RLS, integridade, recuperação e persistência',async()=>{
 const s=await readFile(new URL('../supabase/functions/whatsapp-lab-processar/index.ts',import.meta.url),'utf8');
 const js=await readFile(new URL('../js/whatsapp-customer-import.js',import.meta.url),'utf8');
 const gallery=await readFile(new URL('../js/whatsapp-customer-import-gallery.js',import.meta.url),'utf8');
 const {stripTypeScriptTypes}=await import('node:module');
 const {createHash}=await import('node:crypto');
 const handler=s.slice(s.indexOf('async function processOfficialAttachment'),s.indexOf('Deno.serve(async'));
 const pure=stripTypeScriptTypes(handler);
 const id='11111111-1111-4111-8111-111111111111',batch='22222222-2222-4222-8222-222222222222',owner='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444';
 const bytes=Buffer.from('Teste de leitura UTF-8'),digest=createHash('sha256').update(bytes).digest('hex');
 function setup(overrides={},options={}){
  const file={id,atendimento_id:batch,created_by:owner,kind:'documento',file_name:'teste.txt',size_bytes:bytes.length,content_sha256:digest,storage_path:'whatsapp-lab/'+owner+'/'+batch+'/documento/'+digest+'-teste.txt',processing_status:'pendente',...overrides};
  const writes=[];
  const client={from(table){let patch=null,lease=null;return {select(){return this},eq(k,v){if(k==='processing_token')lease=v;return this},or(){return this},update(p){patch=p;return this},async maybeSingle(){if(table==='lab_whatsapp_atendimentos')return {data:{id:batch,created_by:owner,source:options.source||'whatsapp_cliente'}};if(!patch)return {data:{...file}};if(options.conflict&&patch.processing_status==='processando')return {data:null};if(lease&&lease!==file.processing_token)return {data:null};writes.push(patch);Object.assign(file,patch);return {data:{id,processing_status:file.processing_status}};}}},storage:{from(){return {download:async()=>({data:new Blob([options.bytes||bytes])})}}}};
  const run=new Function('createClient','Deno','UUID','json','MODEL','bytesToBase64','outputText','nativePdfText',pure+';return processOfficialAttachment')(()=>client,{env:{get:()=>''}},/^[0-9a-f-]{36}$/i,(data,status=200)=>({data,status}),'test',()=>'',()=> '',async()=>options.nativePdf||'');
  return {file,writes,call:(user=owner,role='equipe')=>run({headers:{get:()=> 'Bearer test'}},{id:user},{role},{attachment_id:id})};
 }
 const a=setup();assert.equal((await a.call()).data.status,'concluido');assert.equal(a.file.extracted_text,bytes.toString());assert.equal(a.writes.length,2);
 const reused=await a.call();assert.equal(reused.data.reused,true);assert.equal(a.writes.length,2);
 const denied=setup();assert.equal((await denied.call(other)).status,403);assert.equal(denied.writes.length,0);
 const wrong=setup({}, {source:'manual'});assert.equal((await wrong.call()).status,404);
 const race=setup({}, {conflict:true});assert.equal((await race.call()).status,409);
 const corrupt=setup({}, {bytes:Buffer.alloc(bytes.length,65)});assert.equal((await corrupt.call()).data.status,'erro');assert.equal(corrupt.file.extracted_text,undefined);
 const unsupported=setup({kind:'outro',file_name:'arte.cdr'});assert.equal((await unsupported.call()).status,422);
 const pdfFile={kind:'pdf',file_name:'teste.pdf',storage_path:'whatsapp-lab/'+owner+'/'+batch+'/pdf/'+digest+'-teste.pdf'};
 const pdf=setup(pdfFile,{nativePdf:'Texto nativo de comprovante'});assert.equal((await pdf.call()).data.status,'concluido');assert.equal(pdf.file.extracted_text,'Texto nativo de comprovante');
 const scanned=setup(pdfFile);assert.equal((await scanned.call()).data.status,'needs_ai');assert.equal(scanned.file.processing_status,'pendente');assert.equal(scanned.file.extracted_text,undefined);
 const photo=setup({kind:'imagem',file_name:'teste.png'});assert.equal((await photo.call()).data.status,'needs_ai');assert.equal(photo.writes.length,0);
 assert.match(js,/action:'process_official_attachment'/);assert.match(js,/confirm_ai:confirmAi/);assert.match(js,/readNativeAfterImport\(accepted\)/);
 assert.match(gallery,/Ver leitura/);assert.match(s,/store:false/);
});

test('PDF real com texto incorporado e página vazia, sem IA',async()=>{
 const {stripTypeScriptTypes}=await import('node:module');
 const unpdf=await import('unpdf');
 const src=await readFile(new URL('../supabase/functions/whatsapp-lab-processar/index.ts',import.meta.url),'utf8');
 const handler=src.slice(src.indexOf('async function nativePdfText'),src.indexOf('async function processOfficialAttachment')).replace('await import("npm:unpdf@1.4.0")','modules');
 const run=new Function('modules',stripTypeScriptTypes(handler)+';return nativePdfText')(unpdf);
 function makePdf(text){
  const stream=text?'BT /F1 12 Tf 30 100 Td ('+text+') Tj ET':'';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'];
  let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+objects[i]+'\nendobj\n';}const xref=pdf.length;
  pdf+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(v=>String(v).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';
  return new Uint8Array(Buffer.from(pdf));
 }
 assert.match(await run(makePdf('Comprovante ficticio valor 450 reais')),/Comprovante ficticio valor 450 reais/);
 assert.equal(await run(makePdf('')),'');
});
