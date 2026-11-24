import {supabase,STORAGE_BUCKET} from './croma-supabase.js';
import {protectInternalPage} from './interno-auth.js';
import {prepare,category,contentType} from './whatsapp-customer-import-core.js?v=20261123-1';
const $=id=>document.getElementById(id), session=await protectInternalPage();
const labels={imagem:'Fotos e imagens',video:'Vídeos',audio:'Áudios',pdf:'PDFs',documento:'Conversas e documentos',producao:'Arquivos de produção',outro:'Outros arquivos'};
let contacts=[],selected=[],draft=null,busy=false,attempt=null,history={messages:[],files:[]},historyVersion=0;
const node=(tag,value)=>{const el=document.createElement(tag);if(value!=null)el.textContent=value;return el;};
const status=(msg,error=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',error);};
const name=c=>[c.nome,c.celular||c.telefone].filter(Boolean).join(' — ');
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
const chosen=()=>contacts.find(c=>c.id===$('customer').value);
const size=n=>(n/1048576).toFixed(2)+' MiB';
function controls(){
 for(const id of ['search','customer','files','folder','confirm'])$(id).disabled=busy||(!!attempt&&id!=='confirm')||(id==='confirm'&&(!draft||!chosen()));
 $('prepare').disabled=busy||!!attempt||!selected.length;
 $('save').disabled=busy||!draft||!chosen()||!$('confirm').checked;
 $('history').disabled=busy||!chosen();
 $('searchForm').querySelector('button').disabled=busy||!!attempt;
}
function setContacts(rows){
 contacts=rows||[];$('customer').replaceChildren(new Option('Selecione um cliente',''));
 for(const c of contacts)$('customer').add(new Option(name(c),c.id));
}
async function searchContacts(value){
 const q=value.trim();if(q.length<2)throw Error('Digite pelo menos dois caracteres.');
 let query=supabase.from('customer_profiles').select('id,nome,telefone,celular,ativo').eq('ativo',true).limit(50);
 if(/^[+\d\s().-]+$/.test(q)){
  const digits=phone(q);if(digits.length<4)throw Error('Digite ao menos quatro dígitos.');
  const pattern='%'+digits.split('').join('%')+'%';
  query=query.or('telefone.ilike.'+pattern+',celular.ilike.'+pattern);
 }else query=query.ilike('nome','%'+q.replace(/[%_\\]/g,'\\$&')+'%');
 const {data,error}=await query.order('nome');if(error)throw error;setContacts(data);
 const d=phone(q),exact=contacts.filter(c=>d.length>=10&&[c.telefone,c.celular].some(x=>phone(x)===d));
 if(exact.length===1){$('customer').value=exact[0].id;customerChanged();}
 if(!contacts.length)status('Nenhum cliente encontrado. Confira nome e telefone.');
}
function customerChanged(){
 historyVersion++;$('historyCard').hidden=true;$('confirm').checked=false;$('selected').textContent=chosen()?name(chosen()):'';
 controls();
}
function resetDraft(files){
 selected=files;draft=null;attempt=null;$('confirm').checked=false;$('preview').replaceChildren();controls();status(files.length+' arquivo(s) selecionado(s).');
}
function renderPreview(){
 const box=$('preview');box.replaceChildren();
 box.append(node('p',draft.rows.length+' mensagens reconhecidas e '+draft.files.length+' arquivos únicos.'));
 if(draft.chat.name||draft.chat.phone)box.append(node('p','Contato do arquivo: '+[draft.chat.name,draft.chat.phone].filter(Boolean).join(' — ')));
 if(!draft.recognized)box.append(node('p','Nenhuma conversa reconhecida: os arquivos serão arquivados sem mensagens. Confira se esta é a intenção.'));
 for(const [key,label] of Object.entries(labels)){
  const files=draft.files.filter(f=>f.category===key);if(!files.length)continue;
  const details=node('details');details.append(node('summary',label+' ('+files.length+')'));
  for(const f of files)details.append(node('div',f.path+' · '+size(f.file.size)));
  box.append(details);
 }
 for(const m of draft.rows.slice(0,3))box.append(node('div',[m.date,m.time,m.author,m.body].join(' ')));
}
async function prepareFiles(){
 busy=true;controls();status('Lendo e categorizando arquivos…');draft=null;attempt=null;$('confirm').checked=false;
 try{
  draft=await prepare(selected);renderPreview();
  const number=String(draft.chat.phone||'');if(phone(number).length>=10&&!chosen()){
   $('search').value=number;await searchContacts(number);
  }
  status('Confira os arquivos e confirme o cliente antes de salvar.');
 }catch(e){draft=null;status(e.message,true);}finally{busy=false;controls();}
}
async function queryAll(table,columns,apply){
 const out=[];for(let start=0;;start+=500){
  const q=apply(supabase.from(table).select(columns)).range(start,start+499);
  const {data,error}=await q;if(error)throw error;out.push(...data);if(data.length<500)break;
 }return out;
}
async function knownFiles(customerId){
 const imports=await queryAll('lab_whatsapp_atendimentos','id',q=>q.eq('customer_id',customerId).order('id'));
 const result=[];for(let i=0;i<imports.length;i+=50){
  const ids=imports.slice(i,i+50).map(a=>a.id);
  result.push(...await queryAll('lab_whatsapp_anexos','content_sha256',q=>q.in('atendimento_id',ids).order('id')));
 }return new Set(result.map(f=>f.content_sha256).filter(Boolean));
}
async function save(){
 const c=chosen();if(!c||!draft||!$('confirm').checked||busy)return;
 if(attempt&&attempt.customer!==c.id){status('Existe uma importação anterior a confirmar. Retorne ao cliente original antes de tentar de novo.',true);return;}
 if(!attempt)attempt={id:crypto.randomUUID(),customer:c.id,uploaded:new Map(),sent:false};
 busy=true;controls();
 try{
  const existing=await knownFiles(c.id);
  for(const f of draft.files){
   if(attempt.uploaded.has(f.hash)||existing.has(f.hash))continue;
   const safe=f.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(-100)||'arquivo';
   const path='whatsapp-lab/'+session.user.id+'/'+attempt.id+'/'+f.category+'/'+f.hash+'-'+safe;
   status('Enviando '+f.file.name+'…');
   const {error}=await supabase.storage.from(STORAGE_BUCKET).upload(path,f.file,{contentType:contentType(f.file.name),upsert:false});
   if(error){
    // Uma resposta perdida pode ocorrer depois de o objeto já ter sido gravado.
    const check=await supabase.storage.from(STORAGE_BUCKET).list(path.slice(0,path.lastIndexOf('/')),{search:path.split('/').pop()});
    if(check.error||!check.data?.some(o=>o.name===path.split('/').pop()&&Number(o.metadata?.size)===f.file.size))throw error;
   }
   attempt.uploaded.set(f.hash,{hash:f.hash,path,name:f.file.name,mime:contentType(f.file.name),size:f.file.size,category:f.category});
  }
  status('Registrando o histórico no banco…');attempt.sent=true;
  const {data,error}=await supabase.rpc('import_whatsapp_customer',{p_customer_id:c.id,p_import_id:attempt.id,p_messages:draft.rows,p_files:[...attempt.uploaded.values()]});
  if(error)throw error;
  if(!data||!Array.isArray(data.accepted))throw Error('Confirmação do servidor ausente.');
  const accepted=new Set(data.accepted),unused=[...attempt.uploaded.values()].map(f=>f.path).filter(p=>!accepted.has(p));
  const cleanup=unused.length?await supabase.storage.from(STORAGE_BUCKET).remove(unused):{};
  status(data.replayed?'Importação anterior confirmada.':data.messages+' novas mensagens e '+data.files+' novos arquivos registrados.'+(cleanup.error?' Alguns objetos duplicados aguardam limpeza.':''));
  attempt=null;draft=null;selected=[];$('confirm').checked=false;$('files').value='';$('folder').value='';$('preview').replaceChildren();await loadHistory();
 }catch(e){status('Importação não confirmada: '+e.message+'. Tente novamente com os mesmos arquivos e contato; não será criado um novo lote nesta tela.',true);}
 finally{busy=false;controls();}
}
async function loadHistory(){
 const c=chosen();if(!c)return;const version=++historyVersion;
 $('historyCard').hidden=false;$('historyMeta').textContent='Carregando histórico de '+name(c)+'…';$('messages').replaceChildren();$('attachments').replaceChildren();
 try{
  const batches=await queryAll('lab_whatsapp_atendimentos','id,created_at',q=>q.eq('customer_id',c.id).order('id'));
  const messages=[],files=[];
  for(let i=0;i<batches.length;i+=50){
   const ids=batches.slice(i,i+50).map(x=>x.id);
   messages.push(...await queryAll('lab_whatsapp_mensagens','id,message_date,message_time,author,body,sequence',q=>q.in('atendimento_id',ids).order('id')));
   files.push(...await queryAll('lab_whatsapp_anexos','id,file_name,size_bytes,storage_path,kind,mensagem_id',q=>q.in('atendimento_id',ids).order('id')));
  }
  if(version!==historyVersion)return;
  messages.sort((a,b)=>[a.message_date,a.message_time].join(' ').localeCompare([b.message_date,b.message_time].join(' '))||a.sequence-b.sequence);
  history={messages,files};$('historyMeta').textContent=name(c)+' · '+messages.length+' mensagens · '+files.length+' arquivos';renderHistory();
 }catch(e){if(version===historyVersion)$('historyMeta').textContent=e.message;}
}
function renderHistory(){
 const filter=$('filter').value.toLocaleLowerCase(),match=v=>String(v||'').toLocaleLowerCase().includes(filter);
 const messages=$('messages'),files=$('attachments');messages.replaceChildren();files.replaceChildren();
 for(const m of history.messages.filter(m=>match([m.message_date,m.message_time,m.author,m.body].join(' ')))){
  const el=node('div');el.className='entry';el.append(node('strong',[m.message_date,m.message_time,m.author].filter(Boolean).join(' · ')),node('div',m.body||''));messages.append(el);
 }
 for(const [key,label] of Object.entries(labels)){
  const items=history.files.filter(f=>category(f.file_name)===key&&match(f.file_name));if(!items.length)continue;
  const group=node('details');group.open=true;group.append(node('summary',label+' ('+items.length+')'));
  for(const f of items){const el=node('div',f.file_name+' · '+size(f.size_bytes));el.className='entry';const button=node('button','Baixar');button.type='button';button.className='internal-btn secondary';
   button.addEventListener('click',async()=>{button.disabled=true;try{const {data,error}=await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(f.storage_path,60,{download:true});if(error)throw error;const a=node('a');a.href=data.signedUrl;a.rel='noopener';a.click();}catch(e){status(e.message,true);}finally{button.disabled=false;}});el.append(button);group.append(el);}
  files.append(group);
 }
}
if(session){
 $('searchForm').addEventListener('submit',async e=>{e.preventDefault();if(attempt){status('Conclua a importação em aberto antes de trocar o contato.',true);return;}busy=true;controls();try{await searchContacts($('search').value);customerChanged();}catch(e){status(e.message,true);}finally{busy=false;controls();}});
 $('customer').addEventListener('change',customerChanged);
 for(const id of ['files','folder'])$(id).addEventListener('change',e=>{if(attempt){status('Conclua a importação em aberto antes de trocar os arquivos.',true);return;}resetDraft([...e.target.files]);});
 $('prepare').addEventListener('click',prepareFiles);$('confirm').addEventListener('change',controls);$('save').addEventListener('click',save);$('history').addEventListener('click',loadHistory);$('filter').addEventListener('input',renderHistory);
 controls();
 const customerId=new URLSearchParams(location.search).get('cliente');
 if(customerId&&/^[0-9a-f-]{36}$/i.test(customerId)){
  const {data,error}=await supabase.from('customer_profiles').select('id,nome,telefone,celular,ativo').eq('id',customerId).maybeSingle();
  if(data&&!error){setContacts([data]);$('customer').value=data.id;customerChanged();await loadHistory();}
 }
}
