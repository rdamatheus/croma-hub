import {supabase,STORAGE_BUCKET} from './croma-supabase.js';
import {protectInternalPage} from './interno-auth.js';
import {prepare,contentType,uploadProgress} from './whatsapp-customer-import-core.js?v=20261123-2';
import {createGallery,uploadWithProgress} from './whatsapp-customer-import-gallery.js?v=20261124-4';
const $=id=>document.getElementById(id), session=await protectInternalPage();
const labels={imagem:'Fotos e imagens',video:'Vídeos',audio:'Áudios',pdf:'PDFs',documento:'Conversas e documentos',producao:'Arquivos de produção',outro:'Outros arquivos'};
const gallery=createGallery(labels);
let readingFiles=false;
let contacts=[],selected=[],draft=null,busy=false,attempt=null,history={messages:[],files:[]},historyVersion=0;
const node=(tag,value)=>{const el=document.createElement(tag);if(value!=null)el.textContent=value;return el;};
const status=(msg,error=false)=>{$('status').textContent=msg;$('status').classList.toggle('error',error);};
const name=c=>[c.nome,c.nome_fantasia&&c.nome_fantasia!==c.nome?c.nome_fantasia:null,c.celular||c.telefone,c.bling_contact_id?'Bling #'+c.bling_contact_id:null,c.ativo===false?'Inativo':null].filter(Boolean).join(' — ');
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^55(?=\d{10,11}$)/,'');
const chosen=()=>contacts.find(c=>c.id===$('customer').value);
let pendingView=null,pendingPage=0,pendingTotal=0,pendingVersion=0;
const unlinked=()=>Boolean(pendingView||$('saveUnlinked').checked);
const targetReady=()=>unlinked()||Boolean(chosen());
const canCreate=['owner','manager'].includes(session?.profile?.role);
const size=n=>(n/1048576).toFixed(2)+' MiB';
const PAGE=30;
let directoryPage=0,directoryTotal=0,directoryVersion=0,directoryTimer,importTimer,searchVersion=0,importSearching=false,directoryLoading=false;
const count=n=>Number(n||0).toLocaleString('pt-BR');
let importOrigin=null;
function showImport(open){
 const dialog=$('importDialog');
 if(open&&!dialog.open){
  importOrigin=$('historyCard').open?{contacts:[...contacts],id:chosen()?.id,pending:pendingView,search:$('search').value,name:$('pendingName').value,phone:$('pendingPhone').value,unlinked:$('saveUnlinked').checked}:null;
  if(!selected.length&&!attempt){$('importProgress').hidden=true;status('');}
  dialog.showModal();dialog.scrollTop=0;
  controls();
 }else if(!open&&dialog.open){dialog.close();}
}
async function closeImport(){
 if(busy||attempt)return;
 if(!discardDraft())return;
 cancelImportSearch();
 if(importOrigin){
  pendingView=importOrigin.pending;setContacts(importOrigin.contacts);$('customer').value=importOrigin.id||'';$('search').value=importOrigin.search;$('pendingName').value=importOrigin.name;$('pendingPhone').value=importOrigin.phone;$('saveUnlinked').checked=importOrigin.unlinked;customerChanged();
 }
 importOrigin=null;showImport(false);controls();
 if($('historyCard').open){if(chosen()||pendingView)await loadHistory();else $('historyCard').close();}
 if(!document.activeElement||document.activeElement===document.body)$('newImport').focus();
}
async function openHistory(){
 if(!chosen()&&!pendingView)return;
 const dialog=$('historyCard');
 if(!dialog.open){dialog.showModal();dialog.scrollTop=0;}
 controls();await loadHistory();
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
 for(const el of [...$('directoryList').querySelectorAll('button'),...$('pendingList').querySelectorAll('button')])el.disabled=locked;
 $('pendingPrev').disabled=locked||pendingPage===0;
 $('pendingNext').disabled=locked||(pendingPage+1)*PAGE>=pendingTotal;
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
   b.onclick=async()=>{if(busy||attempt)return;if((pendingView||chosen()?.id!==row.id)&&!discardDraft())return;cancelImportSearch();resetPending();setContacts([row]);$('customer').value=row.id;customerChanged();showImport(false);await openHistory();};
   $('directoryList').append(b);
  }
 }catch(e){if(v===directoryVersion){directoryTotal=0;$('directoryPage').textContent='';$('directoryStatus').textContent='Não foi possível carregar os clientes: '+e.message;}}
 finally{if(v===directoryVersion){directoryLoading=false;directoryControls();}}
}
function resetPending(){$('pendingMatches').replaceChildren();pendingView=null;$('saveUnlinked').checked=false;$('pendingName').value='';$('pendingPhone').value='';}
async function loadPending(){
 const v=++pendingVersion;$('pendingStatus').textContent='Buscando históricos sem cadastro…';$('pendingList').replaceChildren();
 try{
  const {data,error}=await supabase.rpc('whatsapp_pending_directory',{p_query:$('directoryQuery').value.trim(),p_offset:pendingPage*PAGE,p_limit:PAGE});if(error)throw error;if(v!==pendingVersion)return;
  const rows=data||[];if(!rows.length&&pendingPage>0){pendingPage=0;return await loadPending();}
  pendingTotal=Number(rows[0]?.total_count||0);$('pendingStatus').textContent=count(pendingTotal)+' histórico(s) sem cadastro';$('pendingPage').textContent=pendingTotal?'Página '+(pendingPage+1)+' de '+Math.ceil(pendingTotal/PAGE):'';
  for(const row of rows){const b=node('button');b.type='button';b.className='directory-item';const info=node('span');info.className='directory-info';info.append(node('strong',row.contact_name||'Contato sem nome'),node('small',[row.contact_phone,'Sem cadastro'].filter(Boolean).join(' · ')));b.append(info,node('span','›'));
   b.onclick=async()=>{if(busy||attempt||!discardDraft())return;cancelImportSearch();setContacts([]);pendingView=row;$('saveUnlinked').checked=true;$('pendingName').value=row.contact_name||'';$('pendingPhone').value=row.contact_phone||'';$('search').value=row.contact_phone||row.contact_name||'';customerChanged();await openHistory();};$('pendingList').append(b);
  }
 }catch(e){if(v===pendingVersion){pendingTotal=0;$('pendingPage').textContent='';$('pendingStatus').textContent='Não foi possível consultar pendentes: '+e.message;}}finally{if(v===pendingVersion)directoryControls();}
}
function queueDirectory(){directoryPage=0;directoryVersion++;clearTimeout(directoryTimer);directoryLoading=true;directoryControls();$('directoryList').replaceChildren();$('directoryStatus').textContent='Buscando clientes…';pendingPage=0;pendingVersion++;directoryTimer=setTimeout(()=>{loadDirectory();loadPending();},250);}

function cancelImportSearch(){searchVersion++;clearTimeout(importTimer);importSearching=false;}
function discardDraft(){
 if(selected.length&&!window.confirm('Descartar os arquivos selecionados que ainda não foram importados?'))return false;
 if(selected.length){resetDraft([]);$('files').value='';$('folder').value='';}
 return true;
}
function showProgress(percent,stage,detail=''){
 $('importProgress').hidden=false;$('progressBar').value=percent;$('progressPercent').textContent=percent+'%';
 $('progressStage').textContent=stage;$('progressDetail').textContent=detail;
}
function controls(){
 $('readAttachments').disabled=busy||readingFiles||!eligibleFiles().length;
 $('refreshReading').disabled=busy||readingFiles;
 $('closeHistory').disabled=readingFiles;
 $('importForCustomer').disabled=busy||readingFiles;
 for(const id of ['search','customer','files','folder','confirm','saveUnlinked','pendingName','pendingPhone'])$(id).disabled=busy||(!!attempt&&id!=='confirm')||(id==='confirm'&&(!draft||!targetReady()))||(id==='saveUnlinked'&&!!pendingView)||(['pendingName','pendingPhone'].includes(id)&&!!pendingView);
 $('pendingFields').hidden=!unlinked();$('linkPending').hidden=!pendingView;
 $('createContact').hidden=!canCreate||(!draft&&!pendingView);$('createContact').disabled=busy||importSearching||!!attempt;
 $('linkPending').disabled=busy||importSearching||!!attempt||!chosen()||!!selected.length;
 $('prepare').disabled=busy||importSearching||!!attempt||!selected.length;
 $('save').disabled=busy||importSearching||!draft||!targetReady()||!$('confirm').checked;
 $('history').disabled=busy||!!attempt||$('historyCard').open||(!chosen()&&!pendingView);
 $('searchForm').querySelector('button').disabled=busy||!!attempt;
 directoryControls();
}
function setContacts(rows){
 contacts=rows||[];$('customer').replaceChildren(new Option('Selecione um cliente',''));
 for(const c of contacts)$('customer').add(new Option(name(c),c.id));
}
async function contactCandidates(n,p){const {data,error}=await supabase.rpc('whatsapp_contact_candidates',{p_name:n||'',p_phone:p||''});if(error)throw error;return data||[];}
async function searchContacts(value,autoPhone=false){
 const q=value.trim(),version=++searchVersion;
 if(q.length<2){setContacts([]);customerChanged();return;}
 const data=await directoryQuery(q,false,'name',0,100),numeric=/^[+\d\s().-]+$/.test(q);
 const candidates=numeric&&phone(q).length>=10?await contactCandidates('',q):[];
 if(version!==searchVersion)return;
 setContacts([...new Map([...candidates,...data].map(c=>[c.id,c])).values()]);const d=phone(q);
 const exact=autoPhone?contacts.filter(c=>d.length>=10&&[c.telefone,c.celular].some(x=>phone(x)===d)):[];
 if(exact.length===1&&exact[0].ativo!==false&&contacts.length===1&&Number(data[0]?.total_count||0)<=data.length)$('customer').value=exact[0].id;
 customerChanged();
 status(!contacts.length?'Nenhum contato encontrado. Você pode manter o histórico sem cadastro ou criar um contato.':count(Math.max(contacts.length,Number(data[0]?.total_count||0)))+' contato(s) encontrado(s).'+(Number(data[0]?.total_count||0)>data.length?' Refine a busca para ver os demais.':' Selecione o contato.'));
}
async function runImportSearch(){
 if(busy||attempt)return;
 importSearching=true;controls();
 const version=searchVersion+1;
 try{await searchContacts($('search').value);}catch(e){if(version===searchVersion)status(e.message,true);}
 finally{if(version===searchVersion){importSearching=false;controls();}}
}
function customerChanged(){
 if(!pendingView){historyVersion++;history={messages:[],files:[]};gallery.reset();$('historyMeta').textContent='';$('messages').replaceChildren();$('attachments').replaceChildren();}$('confirm').checked=false;$('selected').textContent=pendingView?'Histórico pendente: '+(pendingView.contact_name||'Contato sem nome')+(chosen()?' · Destino do vínculo: '+name(chosen()):''):chosen()?name(chosen()):'';
 for(const b of $('directoryList').querySelectorAll('button'))b.setAttribute('aria-current',String(b.dataset.customer===chosen()?.id));
 controls();
}
function resetDraft(files){
 $('pendingMatches').replaceChildren();$('importProgress').hidden=true;selected=files;draft=null;attempt=null;$('confirm').checked=false;$('preview').replaceChildren();controls();status(files.length+' arquivo(s) selecionado(s).');
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
 busy=true;controls();showProgress(0,'Separando arquivos do ZIP');status('Separando e classificando arquivos…');draft=null;attempt=null;$('confirm').checked=false;
 try{
  draft=await prepare(selected);renderPreview();
  const number=String(draft.chat.phone||'');if(!pendingView){
   $('pendingName').value=draft.chat.name||'';$('pendingPhone').value=number;
   if(!chosen()&&!$('saveUnlinked').checked){
    const key=phone(number).length>=10?number:String(draft.chat.name||'').trim();
    if(key.length>=2){$('search').value=key;try{await searchContacts(key,true);const extra=await contactCandidates(draft.chat.name,number);const prior=chosen()?.id;setContacts([...new Map([...extra,...contacts].map(c=>[c.id,c])).values()]);if(prior&&contacts.length===1)$('customer').value=prior;customerChanged();}catch(e){$('pendingMatches').append(node('p','Busca de cadastro indisponível: '+e.message+'. O histórico ainda pode ser mantido sem cadastro.'));}}
   }
   const searchKeys=[...new Set([phone(number),String(draft.chat.name||'').trim()].filter(x=>x.length>=2))];
   try{const matches=[];for(const k of searchKeys){const {data,error}=await supabase.rpc('whatsapp_pending_directory',{p_query:k,p_offset:0,p_limit:30});if(error)throw error;matches.push(...(data||[]));}
    const rows=[...new Map(matches.map(x=>[x.id,x])).values()];if(rows.length){$('pendingMatches').append(node('p','Possível histórico sem cadastro já existente. Escolha somente se reconhecer a mesma conversa:'));
     for(const row of rows){const btn=node('button',[row.contact_name,row.contact_phone].filter(Boolean).join(' — '));btn.type='button';btn.className='internal-btn secondary';btn.onclick=()=>{if(busy||attempt||!window.confirm('Acrescentar os arquivos selecionados ao histórico de '+row.contact_name+'?'))return;pendingView=row;$('saveUnlinked').checked=true;$('pendingName').value=row.contact_name||'';$('pendingPhone').value=row.contact_phone||'';$('pendingMatches').replaceChildren();customerChanged();loadHistory();};$('pendingMatches').append(btn);}}
   }catch(e){$('pendingMatches').append(node('p','Não foi possível verificar históricos pendentes: '+e.message));}
  }
  if(pendingView&&number&&pendingView.contact_phone&&phone(number)!==phone(pendingView.contact_phone))$('pendingMatches').append(node('p','Atenção: o telefone do arquivo difere do histórico selecionado. Confira antes de confirmar.'));
  showProgress(5,'Arquivos separados','Conteúdo dos anexos ainda não analisado. Confira o contato.');status('Confira os arquivos e selecione um cliente ou mantenha o histórico sem cadastro.');
 }catch(e){draft=null;showProgress(0,'Falha na preparação',e.message);status(e.message,true);}finally{busy=false;controls();}
}
async function queryAll(table,columns,apply){
 const out=[];for(let start=0;;start+=500){
  const q=apply(supabase.from(table).select(columns)).range(start,start+499);
  const {data,error}=await q;if(error)throw error;out.push(...data);if(data.length<500)break;
 }return out;
}
function batchQuery(q,customerId,group){return group?q.eq('source','whatsapp_pendente').is('customer_id',null).eq('raw_chat->>pending_group',group):q.eq('customer_id',customerId);}
async function knownFiles(customerId,group){
 if(!customerId&&!group)return new Set();
 const imports=await queryAll('lab_whatsapp_atendimentos','id',q=>batchQuery(q,customerId,group).order('id'));
 const result=[];for(let i=0;i<imports.length;i+=50){
  const ids=imports.slice(i,i+50).map(a=>a.id);
  result.push(...await queryAll('lab_whatsapp_anexos','content_sha256',q=>q.in('atendimento_id',ids).order('id')));
 }return new Set(result.map(f=>f.content_sha256).filter(Boolean));
}
async function save(){
 const c=unlinked()?null:chosen(), group=pendingView?.id||null;
 if(!targetReady()||!draft||!$('confirm').checked||busy||importSearching)return;
 const target=c?.id||group||'new-pending';
 if(attempt&&attempt.customer!==target){status('Existe uma importação anterior a confirmar. Retorne ao contato original antes de tentar de novo.',true);return;}
 if(!attempt)attempt={id:crypto.randomUUID(),customer:target,uploaded:new Map(),sent:false,contactName:$('pendingName').value.trim(),contactPhone:$('pendingPhone').value.trim()};
 busy=true;controls();
 try{
  showProgress(5,'Conferindo arquivos já existentes');
  const existing=await knownFiles(c?.id,group);
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
  const payload={p_import_id:attempt.id,p_messages:draft.rows,p_files:[...attempt.uploaded.values()]};
 const {data,error}=c?await supabase.rpc('import_whatsapp_customer',{...payload,p_customer_id:c.id}):await supabase.rpc('import_whatsapp_pending',{...payload,p_group_id:group,p_contact_name:attempt.contactName,p_contact_phone:attempt.contactPhone});
  if(error)throw error;
  if(!data||!Array.isArray(data.accepted))throw Error('Confirmação do servidor ausente.');
  const accepted=new Set(data.accepted),unused=[...attempt.uploaded.values()].map(f=>f.path).filter(p=>!accepted.has(p));
  const cleanup=unused.length?await supabase.storage.from(STORAGE_BUCKET).remove(unused):{};
  status(data.replayed?'Importação anterior confirmada.':data.messages+' novas mensagens e '+data.files+' novos arquivos registrados.'+(cleanup.error?' Alguns arquivos repetidos precisam de revisão.':''));
  showProgress(100,'Arquivos e mensagens salvos',(data.replayed?'Importação anterior confirmada.':data.messages+' mensagens e '+data.files+' novos arquivos registrados.')+' A leitura do conteúdo dos anexos é uma etapa separada.');
  if(!c&&!pendingView&&data.id){pendingView={id:data.id,contact_name:attempt.contactName||'Contato sem nome',contact_phone:attempt.contactPhone};$('saveUnlinked').checked=true;}
  importOrigin=null;attempt=null;draft=null;selected=[];$('confirm').checked=false;$('files').value='';$('folder').value='';$('preview').replaceChildren();await loadHistory();await loadDirectory();await loadPending();
 }catch(e){showProgress(Number($('progressBar').value),'Importação interrompida','Tente novamente nesta mesma tela.');status('Importação não confirmada: '+e.message+'. Tente novamente com os mesmos arquivos e contato; não será criado um novo lote nesta tela.',true);}
 finally{busy=false;controls();}
}
async function loadHistory(){
 const c=chosen(),group=pendingView?.id||null;if(!c&&!group)return;const label=group?(pendingView.contact_name||'Contato sem nome')+' · Sem cadastro':name(c);const version=++historyVersion;history={messages:[],files:[]};gallery.reset();
 $('importForCustomer').textContent=group?'Vincular ou importar conversa':'Importar mais conversas';$('historyMeta').textContent='Carregando histórico de '+label+'…';$('contentStatus').textContent='';$('readStatus').textContent='';controls();$('messages').replaceChildren();$('attachments').replaceChildren();
 try{
  const batches=await queryAll('lab_whatsapp_atendimentos','id,created_at',q=>batchQuery(q,c?.id,group).order('id'));
  const messages=[],files=[];
  for(let i=0;i<batches.length;i+=50){
   const ids=batches.slice(i,i+50).map(x=>x.id);
   messages.push(...await queryAll('lab_whatsapp_mensagens','id,message_date,message_time,author,body,sequence',q=>q.in('atendimento_id',ids).order('id')));
   files.push(...await queryAll('lab_whatsapp_anexos','id,file_name,size_bytes,storage_path,kind,mensagem_id,processing_status,processing_started_at,processing_error,created_by',q=>q.in('atendimento_id',ids).order('id')));
  }
  if(version!==historyVersion)return;
  messages.sort((a,b)=>[a.message_date,a.message_time].join(' ').localeCompare([b.message_date,b.message_time].join(' '))||a.sequence-b.sequence);
  history={messages,files};gallery.reset(files);$('historyMeta').textContent=label+' · '+messages.length+' mensagens · '+files.length+' arquivos';const total=files.length;const done=files.filter(f=>f.processing_status==='concluido').length;const failed=files.filter(f=>f.processing_status==='erro').length;const running=files.filter(f=>f.processing_status==='processando').length;$('contentStatus').textContent=total?'Leitura dos anexos: '+done+' de '+total+' processados · '+(total-done-failed-running)+' pendentes · '+running+' em processamento · '+failed+' com erro.':'Nenhum anexo.';renderHistory();
 }catch(e){if(version===historyVersion)$('historyMeta').textContent='Não foi possível consultar o histórico: '+e.message;}finally{if(version===historyVersion)controls();}
}
function openCreateContact(){if(!canCreate||busy||attempt)return;$('createName').value=pendingView?.contact_name||$('pendingName').value||draft?.chat?.name||'';$('createPhone').value=pendingView?.contact_phone||$('pendingPhone').value||draft?.chat?.phone||'';$('createType').value='';$('createStatus').textContent='';$('createContactDialog').showModal();}
async function createContact(e){e.preventDefault();if(!canCreate||busy||attempt)return;const n=$('createName').value.trim(),p=phone($('createPhone').value),tipo=$('createType').value;if(n.length<2||!['F','J','E'].includes(tipo)||(p&&![10,11].includes(p.length))){$('createStatus').textContent='Confira nome, tipo e telefone brasileiro com DDD. Para outros países, use o cadastro mestre.';return;}
 busy=true;controls();$('createSubmit').disabled=true;$('createCancel').disabled=true;
 try{const found=await contactCandidates(n,p);if(found.length){setContacts(found);customerChanged();$('createContactDialog').close();status('Já existe possível cadastro com esse nome ou telefone. Confira a lista; para homônimos, use o cadastro mestre.',true);return;}
  if(!window.confirm('Criar '+n+' no cadastro mestre e sincronizar pelo fluxo existente com o Bling?'))return;
  const {data,error}=await supabase.functions.invoke('admin-update-customer',{body:{action:'save',nome:n,tipo_pessoa:tipo,celular:p||null,ativo:true}});if(error||data?.error)throw Error(data?.error||error?.message||'Falha ao cadastrar.');if(!data?.contact?.id)throw Error('Cadastro não confirmado. Pesquise antes de tentar novamente.');
  importOrigin=null;const c={id:data.contact.id,nome:n,celular:p,ativo:true,bling_contact_id:data.contact.bling_contact_id};setContacts([c]);$('customer').value=c.id;if(!pendingView)$('saveUnlinked').checked=false;customerChanged();$('createContactDialog').close();status(data.sync_ok?'Contato cadastrado. Confira os dados.':'Contato cadastrado. Sincronização com o Bling pendente.');
 }catch(err){$('createStatus').textContent=err.message+' Pesquise antes de repetir a criação.';}finally{busy=false;controls();$('createSubmit').disabled=false;$('createCancel').disabled=false;}}
async function linkPending(){
 const c=chosen(),group=pendingView?.id;if(!c||!group||busy||attempt||selected.length)return;
 if(!window.confirm('Vincular todo o histórico a '+name(c)+'? Confira se o contato está correto.'))return;
 busy=true;controls();try{const {data,error}=await supabase.rpc('link_whatsapp_pending',{p_group_id:group,p_customer_id:c.id});if(error)throw error;if(!Number(data))throw Error('Nenhum lote vinculado.');resetPending();setContacts([c]);$('customer').value=c.id;customerChanged();importOrigin=null;await loadHistory();await loadDirectory();await loadPending();status('Histórico vinculado ao cadastro.');}catch(e){status(e.message,true);}finally{busy=false;controls();}
}
function eligibleFiles(){
 return history.files.filter(f=>{
  if(!canCreate && f.created_by!==session?.user?.id)return false;
  const ext=String(f.file_name).split('.').pop().toLowerCase(),size=Number(f.size_bytes);
  const plain=f.kind==='documento'&&['txt','csv','json'].includes(ext);
  const supported=plain||(f.kind==='imagem'&&['png','jpg','jpeg','webp','gif'].includes(ext))||(f.kind==='pdf'&&ext==='pdf')||(f.kind==='documento'&&['docx','pptx','xlsx'].includes(ext))||(f.kind==='audio'&&['mp3','m4a','wav','ogg','opus','flac','webm','mp4'].includes(ext));
  const expired=f.processing_status==='processando'&&(!f.processing_started_at||Date.now()-Date.parse(f.processing_started_at)>300000);
  return supported&&size>0&&size<=(plain?1048576:f.kind==='audio'?20*1048576:10*1048576)&&(['pendente','erro'].includes(f.processing_status)||expired);
 });
}
async function readAttachments(){
 if(busy||readingFiles)return;
 const files=eligibleFiles().slice(0,6);
 if(!files.length)return;
 if(!window.confirm('Ler '+files.length+' arquivo(s) já armazenados? PDFs, imagens, documentos e áudios podem usar a API de IA existente e gerar cobrança por uso. Os originais serão preservados.'))return;
 readingFiles=true;controls();let ok=0;const errors=[];
 try{
  for(let i=0;i<files.length;i++){
   const f=files[i];$('readStatus').textContent='Lendo '+(i+1)+' de '+files.length+' arquivos…';
   try{
    const {data,error}=await supabase.functions.invoke('whatsapp-lab-processar',{body:{action:'process_official_attachment',attachment_id:f.id,confirm_ai:true}});
    if(error||data?.status!=='concluido'){
     let message=data?.error||error?.message||'Resultado não confirmado.';
     try{if(error?.context?.clone){const details=await error.context.clone().json();message=details.error||message;}}catch{}
     throw Error(message);
    }
    ok++;
   }catch(e){errors.push(f.file_name+': '+e.message);}
  }
  await loadHistory();
  $('readStatus').textContent=ok+' de '+files.length+' leituras confirmadas pelo servidor.'+(errors.length?' Pendências: '+errors.join(' | '):'')+' Confira os dados nos arquivos originais.';
 }finally{readingFiles=false;controls();}
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
 $('directorySort').addEventListener('change',()=>{clearTimeout(directoryTimer);directoryPage=0;loadDirectory();loadPending();});
 $('directoryPrev').onclick=()=>{if(directoryPage>0){directoryPage--;loadDirectory();}};
 $('directoryNext').onclick=()=>{if((directoryPage+1)*PAGE<directoryTotal){directoryPage++;loadDirectory();}};
 $('newImport').onclick=()=>{if(!discardDraft())return;cancelImportSearch();resetPending();$('search').value='';setContacts([]);customerChanged();showImport(true);$('files').focus();};
 $('pendingPrev').onclick=()=>{if(pendingPage>0){pendingPage--;loadPending();}};
 $('pendingNext').onclick=()=>{if((pendingPage+1)*PAGE<pendingTotal){pendingPage++;loadPending();}};
 $('saveUnlinked').onchange=()=>{$('confirm').checked=false;controls();};
 for(const id of ['pendingName','pendingPhone'])$(id).oninput=()=>{$('confirm').checked=false;controls();};
 $('linkPending').onclick=linkPending;
 $('createContact').onclick=openCreateContact;$('createContactForm').onsubmit=createContact;$('createCancel').onclick=()=>$('createContactDialog').close();$('createContactDialog').addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 $('hideImport').onclick=closeImport;
 $('importDialog').addEventListener('cancel',e=>{e.preventDefault();closeImport();});
 $('closeHistory').onclick=()=>{if(!readingFiles)$('historyCard').close();};
 $('historyCard').addEventListener('cancel',e=>{if(readingFiles)e.preventDefault();});
 $('readAttachments').onclick=readAttachments;
 $('refreshReading').onclick=()=>loadHistory();
 $('historyCard').addEventListener('close',()=>{controls();if(document.activeElement===document.body&&!$('importDialog').open)$('newImport').focus();});
 $('importForCustomer').onclick=async()=>{if(!readingFiles&&(chosen()||pendingView)){showImport(true);if(pendingView&&$('search').value)await runImportSearch();}};
 $('searchForm').addEventListener('submit',e=>{e.preventDefault();clearTimeout(importTimer);runImportSearch();});
 $('search').addEventListener('input',()=>{if(busy||attempt)return;searchVersion++;clearTimeout(importTimer);importSearching=true;setContacts([]);customerChanged();importTimer=setTimeout(runImportSearch,250);});
 $('customer').addEventListener('change',customerChanged);
 for(const id of ['files','folder'])$(id).addEventListener('change',e=>{if(attempt){status('Conclua a importação em aberto antes de trocar os arquivos.',true);return;}resetDraft([...e.target.files]);});
 $('prepare').addEventListener('click',prepareFiles);$('confirm').addEventListener('change',controls);$('save').addEventListener('click',save);$('history').addEventListener('click',openHistory);$('filter').addEventListener('input',renderHistory);
 controls();
 const customerId=new URLSearchParams(location.search).get('cliente');
 if(customerId&&/^[0-9a-f-]{36}$/i.test(customerId)){
  const {data,error}=await supabase.from('customer_profiles').select('id,nome,nome_fantasia,telefone,celular,ativo,bling_contact_id').eq('id',customerId).maybeSingle();
  if(data&&!error){setContacts([data]);$('customer').value=data.id;customerChanged();await loadHistory();if(!history.messages.length&&!history.files.length)showImport(true);else await openHistory();}
 }
 await loadDirectory();await loadPending();
}
