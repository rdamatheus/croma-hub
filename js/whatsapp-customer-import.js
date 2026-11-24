import {supabase,STORAGE_BUCKET} from './croma-supabase.js';
import {protectInternalPage} from './interno-auth.js';
import {prepare,contentType,uploadProgress} from './whatsapp-customer-import-core.js?v=20261123-2';
import {createGallery,uploadWithProgress} from './whatsapp-customer-import-gallery.js?v=20261123-2';
const $=id=>document.getElementById(id), session=await protectInternalPage();
const labels={imagem:'Fotos e imagens',video:'Vídeos',audio:'Áudios',pdf:'PDFs',documento:'Conversas e documentos',producao:'Arquivos de produção',outro:'Outros arquivos'};
const gallery=createGallery(labels);
let contacts=[],selected=[],draft=null,busy=false,attempt=null,history={messages:[],files:[]},historyVersion=0;
const node=(tag,value)=>{const el=document.createElement(tag);if(value!=null)el.textContent=value;return el;};
const status=(msg,error=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',error);};
const name=c=>[c.nome,c.nome_fantasia&&c.nome_fantasia!==c.nome?c.nome_fantasia:null,c.celular||c.telefone,c.bling_contact_id?'Bling #'+c.bling_contact_id:null].filter(Boolean).join(' — ');
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
const chosen=()=>contacts.find(c=>c.id===$('customer').value);
const size=n=>(n/1048576).toFixed(2)+' MiB';
const PAGE=30;
let directoryPage=0,directoryTotal=0,directoryVersion=0,directoryTimer,importTimer,searchVersion=0,importOpen=false,importSearching=false,directoryLoading=false;
const count=n=>Number(n||0).toLocaleString('pt-BR');
function showImport(open){
 importOpen=open;$('importContact').hidden=!open;$('importFiles').hidden=!open;
 if(open)$('importContact').scrollIntoView({behavior:'smooth',block:'start'});
}
async function directoryQuery(q,only,sort,offset,limit){
 const {data,error}=await supabase.rpc('whatsapp_customer_directory',{p_query:q,p_history_only:only,p_sort:sort,p_offset:offset,p_limit:limit});
 if(error)throw error;return data||[];
}
function directoryControls(){
 const locked=busy||!!attempt;
 for(const id of ['directoryQuery','directorySort','newImport','hideImport','importForCustomer'])$(id).disabled=locked;
 $('directoryPrev').disabled=locked||directoryLoading||directoryPage===0;
 $('directoryNext').disabled=locked||directoryLoading||(directoryPage+1)*PAGE>=directoryTotal;
 for(const el of $('directoryList').querySelectorAll('button'))el.disabled=locked;
}
async function loadDirectory(){
 const v=++directoryVersion;directoryLoading=true;directoryControls();$('directoryStatus').textContent='Buscando clientes…';$('directoryList').replaceChildren();
 try{
  const rows=await directoryQuery($('directoryQuery').value.trim(),true,$('directorySort').value,directoryPage*PAGE,PAGE);
  if(v!==directoryVersion)return;
  if(!rows.length&&directoryPage>0){directoryPage=0;return await loadDirectory();}
  directoryTotal=Number(rows[0]?.total_count||0);
  $('directoryStatus').textContent=count(directoryTotal)+' cliente(s) com histórico'+(!rows.length?' · nenhum resultado para a busca.':'');
  $('directoryPage').textContent=directoryTotal?'Página '+(directoryPage+1)+' de '+Math.ceil(directoryTotal/PAGE):'';
  for(const row of rows){
   const b=node('button');b.type='button';b.className='directory-item';b.dataset.customer=row.id;b.setAttribute('aria-current',String(chosen()?.id===row.id));
   const avatar=node('span',String(row.nome||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase());avatar.className='directory-avatar';
   const info=node('span');info.className='directory-info';info.append(node('strong',row.nome||'Contato sem nome'));
   const extra=[row.nome_fantasia&&row.nome_fantasia!==row.nome?row.nome_fantasia:null,row.celular||row.telefone,row.bling_contact_id?'Bling #'+row.bling_contact_id:null,row.ativo===false?'Inativo':null].filter(Boolean).join(' · ');
   if(extra)info.append(node('small',extra));
   const when=row.last_import?new Date(row.last_import).toLocaleDateString('pt-BR'):'—';
   info.append(node('small',count(row.message_count)+' mensagens · '+count(row.file_count)+' arquivos · Última importação: '+when));
   b.append(avatar,info,node('span','›'));
   b.onclick=async()=>{if(busy||attempt)return;searchVersion++;importSearching=false;clearTimeout(importTimer);setContacts([row]);$('customer').value=row.id;customerChanged();showImport(false);await loadHistory();if(chosen()?.id===row.id)$('historyCard').scrollIntoView({behavior:'smooth',block:'start'});};
   $('directoryList').append(b);
  }
 }catch(e){if(v===directoryVersion){directoryTotal=0;$('directoryPage').textContent='';$('directoryStatus').textContent='Não foi possível carregar os clientes: '+e.message;}}
 finally{if(v===directoryVersion){directoryLoading=false;directoryControls();}}
}
function queueDirectory(){directoryPage=0;directoryVersion++;clearTimeout(directoryTimer);directoryLoading=true;directoryControls();$('directoryList').replaceChildren();$('directoryStatus').textContent='Buscando clientes…';directoryTimer=setTimeout(loadDirectory,250);}

function showProgress(percent,stage,detail=''){
 $('importProgress').hidden=false;$('progressBar').value=percent;$('progressPercent').textContent=percent+'%';
 $('progressStage').textContent=stage;$('progressDetail').textContent=detail;
}
function controls(){
 for(const id of ['search','customer','files','folder','confirm'])$(id).disabled=busy||(!!attempt&&id!=='confirm')||(id==='confirm'&&(!draft||!chosen()));
 $('prepare').disabled=busy||!!attempt||!selected.length;
 $('save').disabled=busy||importSearching||!draft||!chosen()||!$('confirm').checked;
 $('history').disabled=busy||!chosen();
 $('searchForm').querySelector('button').disabled=busy||!!attempt;
 directoryControls();
}
function setContacts(rows){
 contacts=rows||[];$('customer').replaceChildren(new Option('Selecione um cliente',''));
 for(const c of contacts)$('customer').add(new Option(name(c),c.id));
}
async function searchContacts(value,autoPhone=false){
 const q=value.trim(),version=++searchVersion;
 if(q.length<2){setContacts([]);customerChanged();return;}
 const data=await directoryQuery(q,false,'name',0,100);
 if(version!==searchVersion)return;
 setContacts(data);const d=phone(q);
 const exact=autoPhone?contacts.filter(c=>d.length>=10&&[c.telefone,c.celular].some(x=>phone(x)===d)):[];
 if(exact.length===1&&Number(data[0]?.total_count||0)<=data.length)$('customer').value=exact[0].id;
 customerChanged();
 status(!contacts.length?'Nenhum contato encontrado. Confira os dados.':count(data[0].total_count)+' contato(s) encontrado(s).'+(Number(data[0].total_count)>data.length?' Refine a busca para ver os demais.':' Selecione o contato.'));
}
async function runImportSearch(){
 if(busy||attempt)return;
 importSearching=true;controls();
 try{await searchContacts($('search').value);}catch(e){status(e.message,true);}
 finally{importSearching=false;controls();}
}
function customerChanged(){
 historyVersion++;history={messages:[],files:[]};gallery.reset();$('historyCard').hidden=true;$('confirm').checked=false;$('selected').textContent=chosen()?name(chosen()):'';
 for(const b of $('directoryList').querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.customer===chosen()?.id));
 controls();
}
function resetDraft(files){
 $('importProgress').hidden=true;selected=files;draft=null;attempt=null;$('confirm').checked=false;$('preview').replaceChildren();controls();status(files.length+' arquivo(s) selecionado(s).');
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
 busy=true;controls();showProgress(0,'Descompactando e organizando arquivos');status('Lendo e categorizando arquivos…');draft=null;attempt=null;$('confirm').checked=false;
 try{
  draft=await prepare(selected);renderPreview();
  const number=String(draft.chat.phone||'');if(phone(number).length>=10&&!chosen()){
   $('search').value=number;await searchContacts(number,true);
  }
  showProgress(5,'Arquivos organizados','Aguardando confirmação do cliente.');status('Confira os arquivos e confirme o cliente antes de salvar.');
 }catch(e){draft=null;showProgress(0,'Falha na preparação',e.message);status(e.message,true);}finally{busy=false;controls();}
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
 const c=chosen();if(!c||!draft||!$('confirm').checked||busy||importSearching)return;
 if(attempt&&attempt.customer!==c.id){status('Existe uma importação anterior a confirmar. Retorne ao cliente original antes de tentar de novo.',true);return;}
 if(!attempt)attempt={id:crypto.randomUUID(),customer:c.id,uploaded:new Map(),sent:false};
 busy=true;controls();
 try{
  showProgress(5,'Conferindo arquivos já existentes');
  const existing=await knownFiles(c.id);
  const pending=draft.files.filter(f=>!attempt.uploaded.has(f.hash)&&!existing.has(f.hash));
  const total=pending.reduce((sum,f)=>sum+f.file.size,0);
  let done=0,confirmed=0,lastPercent=5;
  const report=(active=0,filename='')=>{
   lastPercent=uploadProgress(total,done,active,confirmed,pending.length);
   showProgress(lastPercent,'Enviando arquivos',confirmed+' de '+pending.length+' novos arquivos confirmados · '+(pending.length-confirmed)+' restantes · '+size(Math.min(total,done+active))+' de '+size(total)+(filename?' · '+filename:'')+' · '+(draft.files.length-pending.length)+' já existentes ou enviados');
  };
  report();
  for(const f of pending){
   const safe=f.file.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]/g,'-').slice(-100)||'arquivo';
   const path='whatsapp-lab/'+session.user.id+'/'+attempt.id+'/'+f.category+'/'+f.hash+'-'+safe;
   status('Enviando '+f.file.name+'…');
   try{await uploadWithProgress(path,f.file,loaded=>report(loaded,f.file.name));}
   catch(error){
    // Uma resposta perdida pode ocorrer depois de o objeto já ter sido gravado.
    const check=await supabase.storage.from(STORAGE_BUCKET).list(path.slice(0,path.lastIndexOf('/')),{search:path.split('/').pop()});
    if(check.error||!check.data?.some(o=>o.name===path.split('/').pop()&&Number(o.metadata?.size)===f.file.size))throw error;
   }
   attempt.uploaded.set(f.hash,{hash:f.hash,path,name:f.file.name,mime:contentType(f.file.name),size:f.file.size,category:f.category});
   done+=f.file.size;confirmed++;report();
  }
  showProgress(96,'Registrando o histórico no banco','Arquivos enviados. Aguardando confirmação do servidor.');status('Registrando o histórico no banco…');attempt.sent=true;
  const {data,error}=await supabase.rpc('import_whatsapp_customer',{p_customer_id:c.id,p_import_id:attempt.id,p_messages:draft.rows,p_files:[...attempt.uploaded.values()]});
  if(error)throw error;
  if(!data||!Array.isArray(data.accepted))throw Error('Confirmação do servidor ausente.');
  const accepted=new Set(data.accepted),unused=[...attempt.uploaded.values()].map(f=>f.path).filter(p=>!accepted.has(p));
  const cleanup=unused.length?await supabase.storage.from(STORAGE_BUCKET).remove(unused):{};
  status(data.replayed?'Importação anterior confirmada.':data.messages+' novas mensagens e '+data.files+' novos arquivos registrados.'+(cleanup.error?' Alguns objetos duplicados aguardam limpeza.':''));
  showProgress(100,'Importação concluída',data.replayed?'Importação anterior confirmada.':data.messages+' mensagens e '+data.files+' novos arquivos registrados.');
  attempt=null;draft=null;selected=[];$('confirm').checked=false;$('files').value='';$('folder').value='';$('preview').replaceChildren();await loadHistory();await loadDirectory();
 }catch(e){showProgress(Number($('progressBar').value),'Importação interrompida','Tente novamente nesta mesma tela.');status('Importação não confirmada: '+e.message+'. Tente novamente com os mesmos arquivos e contato; não será criado um novo lote nesta tela.',true);}
 finally{busy=false;controls();}
}
async function loadHistory(){
 const c=chosen();if(!c)return;const version=++historyVersion;history={messages:[],files:[]};gallery.reset();
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
  history={messages,files};gallery.reset(files);$('historyMeta').textContent=name(c)+' · '+messages.length+' mensagens · '+files.length+' arquivos';renderHistory();
 }catch(e){if(version===historyVersion)$('historyMeta').textContent=e.message;}
}
function renderHistory(){
 const filter=$('filter').value.toLocaleLowerCase(),match=v=>String(v||'').toLocaleLowerCase().includes(filter);
 const messages=$('messages');messages.replaceChildren();
 for(const m of history.messages.filter(m=>match([m.message_date,m.message_time,m.author,m.body].join(' ')))){
  const el=node('div');el.className='entry';el.append(node('strong',[m.message_date,m.message_time,m.author].filter(Boolean).join(' · ')),node('div',m.body||''));messages.append(el);
 }
 gallery.render(filter);
}
if(session){
 $('directoryQuery').addEventListener('input',queueDirectory);
 $('directorySort').addEventListener('change',()=>{clearTimeout(directoryTimer);directoryPage=0;loadDirectory();});
 $('directoryPrev').onclick=()=>{if(directoryPage>0){directoryPage--;loadDirectory();}};
 $('directoryNext').onclick=()=>{if((directoryPage+1)*PAGE<directoryTotal){directoryPage++;loadDirectory();}};
 $('newImport').onclick=()=>{showImport(true);$('search').focus();};
 $('hideImport').onclick=()=>showImport(false);
 $('importForCustomer').onclick=()=>showImport(true);
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();clearTimeout(importTimer);runImportSearch();});
 $('search').addEventListener('input',()=>{if(busy||attempt)return;searchVersion++;clearTimeout(importTimer);importSearching=true;setContacts([]);customerChanged();importTimer=setTimeout(runImportSearch,250);});
 $('customer').addEventListener('change',customerChanged);
 for(const id of ['files','folder'])$(id).addEventListener('change',e=>{if(attempt){status('Conclua a importação em aberto antes de trocar os arquivos.',true);return;}resetDraft([...e.target.files]);});
 $('prepare').addEventListener('click',prepareFiles);$('confirm').addEventListener('change',controls);$('save').addEventListener('click',save);$('history').addEventListener('click',loadHistory);$('filter').addEventListener('input',renderHistory);
 controls();
 await loadDirectory();
 const customerId=new URLSearchParams(location.search).get('cliente');
 if(customerId&&/^[0-9a-f-]{36}$/i.test(customerId)){
  const {data,error}=await supabase.from('customer_profiles').select('id,nome,nome_fantasia,telefone,celular,ativo,bling_contact_id').eq('id',customerId).maybeSingle();
  if(data&&!error){setContacts([data]);$('customer').value=data.id;customerChanged();await loadHistory();if(!history.messages.length&&!history.files.length)showImport(true);}
 }
}
