import { supabase, STORAGE_BUCKET } from './croma-supabase.js';
import { protectInternalPage, roleLabel } from './interno-auth.js';

const MAX_JSON_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const GENERIC_CHAT_NAMES = ['dados do perfil', 'conversa', 'perfil'];
const EXPORTER_URL = '/js/croma-whatsapp-exportador.js?v=20260830-2';

const elements = {
  who: document.querySelector('#who'),
  copyExporter: document.querySelector('#copyExporter'),
  copyBookmarklet: document.querySelector('#copyBookmarklet'),
  exporterStatus: document.querySelector('#exporterStatus'),
  jsonFile: document.querySelector('#jsonFile'),
  attachmentFiles: document.querySelector('#attachmentFiles'),
  jsonPreview: document.querySelector('#jsonPreview'),
  previewContact: document.querySelector('#previewContact'),
  previewCount: document.querySelector('#previewCount'),
  previewPeriod: document.querySelector('#previewPeriod'),
  previewReferences: document.querySelector('#previewReferences'),
  fileList: document.querySelector('#fileList'),
  saveTest: document.querySelector('#saveTest'),
  clearTest: document.querySelector('#clearTest'),
  formStatus: document.querySelector('#formStatus'),
  progress: document.querySelector('#progress'),
  progressBar: document.querySelector('#progressBar'),
  refreshList: document.querySelector('#refreshList'),
  savedList: document.querySelector('#savedList'),
  detailCard: document.querySelector('#detailCard'),
  detailTitle: document.querySelector('#detailTitle'),
  detailMeta: document.querySelector('#detailMeta'),
  analysisBox: document.querySelector('#analysisBox'),
  analysisSummary: document.querySelector('#analysisSummary'),
  analysisRequests: document.querySelector('#analysisRequests'),
  analysisSpecs: document.querySelector('#analysisSpecs'),
  analysisPending: document.querySelector('#analysisPending'),
  analysisTasks: document.querySelector('#analysisTasks'),
  analysisReply: document.querySelector('#analysisReply'),
  messageList: document.querySelector('#messageList'),
  attachmentList: document.querySelector('#attachmentList'),
  closeDetail: document.querySelector('#closeDetail')
};

let staffSession = null;
let importedPayload = null;
let attachmentFiles = [];
let exporterSourcePromise = null;

function escapeHtml(value=''){
  return String(value).replace(/[&<>'"]/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
}

function setStatus(message='', isError=false){
  elements.formStatus.textContent = message;
  elements.formStatus.classList.toggle('error', isError);
}

function setExporterStatus(message='',isError=false){
  elements.exporterStatus.textContent = message;
  elements.exporterStatus.classList.toggle('error',isError);
}

async function copyToClipboard(value){
  try{
    await navigator.clipboard.writeText(value);
  }catch(error){
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly','');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    if(!copied) throw error;
  }
}

async function loadExporterSource(){
  if(!exporterSourcePromise){
    exporterSourcePromise = fetch(EXPORTER_URL,{cache:'no-store'}).then(response => {
      if(!response.ok) throw new Error('O arquivo do exportador ainda não está disponível.');
      return response.text();
    });
  }
  return exporterSourcePromise;
}

async function copyExporter(asBookmarklet=false){
  const button = asBookmarklet ? elements.copyBookmarklet : elements.copyExporter;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Copiando…';
  setExporterStatus('');
  try{
    const source = await loadExporterSource();
    const content = asBookmarklet ? `javascript:${encodeURIComponent(source)}` : source;
    await copyToClipboard(content);
    setExporterStatus(asBookmarklet
      ? 'Favorito copiado. Crie um novo favorito no Chrome, cole no campo URL e depois clique nele quando estiver no WhatsApp Web.'
      : 'Código copiado. No WhatsApp Web, digite javascript: na barra de endereços, cole o código depois dos dois-pontos e pressione Enter.');
  }catch(error){
    setExporterStatus(`Não foi possível copiar: ${error.message}`,true);
  }finally{
    button.disabled = false;
    button.textContent = original;
  }
}

function setProgress(value=0){
  elements.progress.classList.toggle('hidden', value <= 0 || value >= 100);
  elements.progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function formatBytes(bytes=0){
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function normalizePhone(value=''){
  const match = String(value).match(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/);
  return match ? match[0].trim() : '';
}

function isGenericChatName(value=''){
  return GENERIC_CHAT_NAMES.includes(String(value).trim().toLowerCase());
}

function normalizePayload(payload){
  if(!payload || typeof payload !== 'object' || !Array.isArray(payload.messages)){
    throw new Error('Este arquivo não tem o formato do Exportador Croma.');
  }
  if(payload.messages.length > 10000) throw new Error('O arquivo possui mensagens demais para este laboratório.');
  const chat = payload.chat && typeof payload.chat === 'object' ? payload.chat : {};
  const firstCustomer = payload.messages.find(message => !/croma/i.test(String(message.author || '')));
  const phone = normalizePhone(chat.phone || chat.details || firstCustomer?.author || chat.name);
  let name = String(chat.name || '').trim();
  if(!name || isGenericChatName(name)) name = firstCustomer?.author || phone || 'Contato WhatsApp';
  if(normalizePhone(name) === name) name = 'Contato WhatsApp';
  return {
    ...payload,
    chat: { ...chat, name, phone },
    messages: payload.messages.map((message, index) => {
      let direction = ['enviada','recebida'].includes(message.direction) ? message.direction : 'indefinida';
      if(direction === 'indefinida') direction = /croma/i.test(String(message.author || '')) ? 'enviada' : 'recebida';
      return { ...message, sequence: Number(message.sequence) || index + 1, direction };
    })
  };
}

window.addEventListener('message',event => {
  if(event.origin !== 'https://web.whatsapp.com') return;
  if(event.data?.type !== 'croma-whatsapp-import') return;
  try{
    importedPayload = normalizePayload(event.data.payload);
    renderPayloadPreview();
    refreshSaveState();
    setStatus(`${importedPayload.messages.length} mensagens recebidas do WhatsApp. Salve o atendimento e clique em “Processar com IA”.`);
    window.focus();
  }catch(error){
    setStatus(`Não foi possível receber a conversa do WhatsApp: ${error.message}`,true);
  }
});

function payloadPeriod(payload){
  const messages = payload.messages || [];
  if(!messages.length) return 'Sem mensagens';
  const first = messages[0], last = messages[messages.length - 1];
  const start = [first.date, first.time].filter(Boolean).join(' ');
  const end = [last.date, last.time].filter(Boolean).join(' ');
  return start === end ? start : `${start} → ${end}`;
}

function citedFileCount(payload){
  const files = new Set();
  payload.messages.forEach(message => String(message.fileNames || '').split('|').map(value => value.trim()).filter(Boolean).forEach(value => files.add(value)));
  return files.size;
}

function renderPayloadPreview(){
  elements.jsonPreview.classList.toggle('hidden', !importedPayload);
  if(!importedPayload) return;
  elements.previewContact.textContent = importedPayload.chat.name || importedPayload.chat.phone || 'Contato WhatsApp';
  elements.previewCount.textContent = importedPayload.messages.length;
  elements.previewPeriod.textContent = payloadPeriod(importedPayload);
  elements.previewReferences.textContent = citedFileCount(importedPayload);
}

function renderFiles(){
  if(!attachmentFiles.length){
    elements.fileList.innerHTML = '';
    return;
  }
  elements.fileList.innerHTML = attachmentFiles.map(file => `<div class="file"><span title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span><strong>${formatBytes(file.size)}</strong></div>`).join('');
}

function refreshSaveState(){
  elements.saveTest.disabled = !importedPayload;
}

function resetForm(){
  importedPayload = null;
  attachmentFiles = [];
  elements.jsonFile.value = '';
  elements.attachmentFiles.value = '';
  renderPayloadPreview();
  renderFiles();
  refreshSaveState();
  setProgress(0);
  setStatus('');
}

function safeFileName(value='arquivo'){
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/-+/g,'-').replace(/^-|-$/g,'').slice(0,120) || 'arquivo';
}

function attachmentKind(file){
  const type = file.type || '';
  const extension = file.name.split('.').pop().toLowerCase();
  if(type.startsWith('audio/')) return 'audio';
  if(type.startsWith('image/')) return 'imagem';
  if(type.startsWith('video/')) return 'video';
  if(type === 'application/pdf' || extension === 'pdf') return 'pdf';
  if(['doc','docx','xls','xlsx','ppt','pptx','txt','csv','zip'].includes(extension)) return 'documento';
  return 'outro';
}

function writeAscii(view, offset, value){
  for(let index=0; index<value.length; index++) view.setUint8(offset + index,value.charCodeAt(index));
}

function audioBufferToWav(audioBuffer){
  const channels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const frameCount = audioBuffer.length;
  const bytesPerSample = 2;
  const dataSize = frameCount * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeAscii(view,0,'RIFF'); view.setUint32(4,36 + dataSize,true); writeAscii(view,8,'WAVE');
  writeAscii(view,12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,1,true);
  view.setUint16(22,channels,true); view.setUint32(24,sampleRate,true);
  view.setUint32(28,sampleRate * channels * bytesPerSample,true);
  view.setUint16(32,channels * bytesPerSample,true); view.setUint16(34,16,true);
  writeAscii(view,36,'data'); view.setUint32(40,dataSize,true);
  const channelData = Array.from({length:channels},(_,index) => audioBuffer.getChannelData(index));
  let offset = 44;
  for(let frame=0; frame<frameCount; frame++){
    for(let channel=0; channel<channels; channel++){
      const sample = Math.max(-1,Math.min(1,channelData[channel][frame]));
      view.setInt16(offset,sample < 0 ? sample * 0x8000 : sample * 0x7fff,true);
      offset += bytesPerSample;
    }
  }
  return buffer;
}

async function normalizeSelectedAudio(file){
  const extension = file.name.split('.').pop().toLowerCase();
  if(!['ogg','opus'].includes(extension) && !/ogg|opus/i.test(file.type)) return file;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if(!AudioContextClass) throw new Error(`O navegador não consegue preparar o áudio ${file.name}.`);
  const context = new AudioContextClass();
  try{
    const decoded = await context.decodeAudioData(await file.arrayBuffer());
    const wav = audioBufferToWav(decoded);
    return new File([wav],`${file.name.replace(/\.(ogg|opus)$/i,'')}.wav`,{type:'audio/wav',lastModified:file.lastModified});
  }catch{
    throw new Error(`Não foi possível converter ${file.name}. Baixe o áudio como MP3, M4A ou WAV e tente novamente.`);
  }finally{
    await context.close();
  }
}

async function insertMessages(atendimentoId, messages){
  const rows = messages.map(message => ({
    atendimento_id: atendimentoId,
    external_message_id: message.id || null,
    sequence: message.sequence || 0,
    message_date: message.date || null,
    message_time: message.time || null,
    author: message.author || null,
    direction: message.direction || 'indefinida',
    body: message.text || null,
    quoted_text: message.quotedText || null,
    media_types: message.mediaTypes || null,
    file_names: message.fileNames || null,
    duration: message.duration || null,
    reactions: message.reactions || null,
    delivery_status: message.deliveryStatus || null,
    raw_data: message
  }));
  for(let index=0; index<rows.length; index+=200){
    const { error } = await supabase.from('lab_whatsapp_mensagens').insert(rows.slice(index,index+200));
    if(error) throw error;
  }
}

async function uploadAttachments(atendimentoId){
  const uploadedPaths = [];
  const failures = [];
  for(let index=0; index<attachmentFiles.length; index++){
    const file = attachmentFiles[index];
    const path = `whatsapp-lab/${staffSession.user.id}/${atendimentoId}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safeFileName(file.name)}`;
    try{
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{contentType:file.type || 'application/octet-stream',upsert:false});
      if(uploadError) throw uploadError;
      uploadedPaths.push(path);
      const { error: rowError } = await supabase.from('lab_whatsapp_anexos').insert({
        atendimento_id: atendimentoId,
        created_by: staffSession.user.id,
        kind: attachmentKind(file),
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
        storage_path: path
      });
      if(rowError){
        await supabase.storage.from(STORAGE_BUCKET).remove([path]);
        uploadedPaths.pop();
        throw rowError;
      }
    }catch(error){
      failures.push(`${file.name}: ${error.message}`);
    }
    setProgress(45 + Math.round(((index + 1) / Math.max(attachmentFiles.length,1)) * 50));
  }
  return { uploadedPaths, failures };
}

async function saveAtendimento(){
  if(!importedPayload || !staffSession) return;
  elements.saveTest.disabled = true;
  setStatus('Salvando o histórico…');
  setProgress(12);
  let atendimentoId = null;
  try{
    const { data: atendimento, error } = await supabase.from('lab_whatsapp_atendimentos').insert({
      created_by: staffSession.user.id,
      contact_name: importedPayload.chat.name || 'Contato WhatsApp',
      contact_phone: importedPayload.chat.phone || null,
      source: importedPayload.exporter || 'whatsapp_exportador',
      extracted_at: importedPayload.extractedAt || null,
      message_count: importedPayload.messages.length,
      raw_chat: importedPayload.chat || {}
    }).select('id').single();
    if(error) throw error;
    atendimentoId = atendimento.id;
    setProgress(25);
    await insertMessages(atendimentoId, importedPayload.messages);
    setProgress(45);
    const attachmentResult = await uploadAttachments(atendimentoId);
    setProgress(100);
    const successMessage = attachmentResult.failures.length
      ? `Atendimento salvo, mas ${attachmentResult.failures.length} anexo(s) falharam: ${attachmentResult.failures.join(' | ')}`
      : `Atendimento salvo com ${importedPayload.messages.length} mensagens e ${attachmentResult.uploadedPaths.length} anexos.`;
    setStatus(successMessage, attachmentResult.failures.length > 0);
    importedPayload = null;
    attachmentFiles = [];
    elements.jsonFile.value = '';
    elements.attachmentFiles.value = '';
    renderPayloadPreview();
    renderFiles();
    await loadAtendimentos();
  }catch(error){
    if(atendimentoId) await supabase.from('lab_whatsapp_atendimentos').delete().eq('id',atendimentoId);
    setStatus(`Não foi possível salvar: ${error.message}`,true);
  }finally{
    setProgress(0);
    refreshSaveState();
  }
}

function nestedCount(value){
  return Array.isArray(value) && value[0] ? Number(value[0].count) || 0 : 0;
}

async function loadAtendimentos(){
  elements.savedList.innerHTML = '<div class="empty">Carregando atendimentos…</div>';
  const { data, error } = await supabase
    .from('lab_whatsapp_atendimentos')
    .select('id,contact_name,contact_phone,message_count,status,created_at,lab_whatsapp_anexos(count)')
    .order('created_at',{ascending:false})
    .limit(50);
  if(error){
    elements.savedList.innerHTML = `<div class="empty">Não foi possível carregar: ${escapeHtml(error.message)}</div>`;
    return;
  }
  if(!data.length){
    elements.savedList.innerHTML = '<div class="empty">Nenhum atendimento de teste salvo ainda.</div>';
    return;
  }
  elements.savedList.innerHTML = data.map(item => `
    <article class="saved-card">
      <small>${new Date(item.created_at).toLocaleString('pt-BR')}</small>
      <h3>${escapeHtml(item.contact_name || item.contact_phone || 'Contato WhatsApp')}</h3>
      <div class="saved-meta"><span class="internal-pill">${item.message_count} mensagens</span><span class="internal-pill">${nestedCount(item.lab_whatsapp_anexos)} anexos</span><span class="internal-pill ok">${escapeHtml(item.status)}</span></div>
      <div class="saved-actions"><button class="internal-btn" type="button" data-process="${item.id}">Processar com IA</button><button class="internal-btn secondary" type="button" data-view="${item.id}">Ver atendimento</button><button class="internal-btn secondary danger" type="button" data-delete="${item.id}" data-name="${escapeHtml(item.contact_name || 'este atendimento')}">Excluir teste</button></div>
    </article>`).join('');
}

function listItems(element,values){
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  element.innerHTML = items.length ? items.map(value => `<li>${escapeHtml(value)}</li>`).join('') : '<li>Nenhum item identificado.</li>';
}

function renderAnalysis(analysis){
  elements.analysisBox.classList.toggle('hidden',!analysis);
  if(!analysis) return;
  elements.analysisSummary.textContent = analysis.resumo || 'Análise concluída.';
  listItems(elements.analysisRequests,analysis.pedido_cliente);
  listItems(elements.analysisSpecs,analysis.especificacoes);
  listItems(elements.analysisPending,analysis.pendencias);
  listItems(elements.analysisTasks,analysis.tarefas_internas);
  elements.analysisReply.textContent = analysis.resposta_sugerida || 'Nenhuma resposta sugerida.';
}

async function functionErrorMessage(error,data){
  if(data?.message || data?.detail || data?.error) return data.message || data.detail || data.error;
  const response = error?.context;
  if(response && typeof response.clone === 'function'){
    try{
      const payload = await response.clone().json();
      return payload.message || payload.detail || payload.error || error.message;
    }catch{
      try{ return (await response.clone().text()) || error.message; }catch{ /* resposta já consumida */ }
    }
  }
  return error?.message || 'Erro desconhecido na função de processamento.';
}

function friendlyProcessError(message){
  if(/OPENAI_API_KEY|chave da API da OpenAI/i.test(message)){
    return 'A chave da OpenAI ainda não está configurada. Enquanto isso, use “Copiar código” para extrair a conversa e colar diretamente no ChatGPT.';
  }
  return message;
}

async function processAtendimento(id,button){
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Processando…';
  setStatus('Transcrevendo áudios, lendo documentos e analisando a conversa…');
  try{
    const { data, error } = await supabase.functions.invoke('whatsapp-lab-processar',{body:{atendimento_id:id}});
    if(error) throw new Error(await functionErrorMessage(error,data));
    if(data?.error) throw new Error(data.message || data.error);
    const failed = data?.attachment_errors?.length || 0;
    setStatus(failed ? `Análise concluída, com ${failed} anexo(s) não processado(s).` : 'Análise concluída. A resposta sugerida já está disponível.',failed > 0);
    await Promise.all([loadAtendimentos(),showDetail(id)]);
  }catch(error){
    setStatus(`Não foi possível processar com IA: ${friendlyProcessError(error.message)}`,true);
  }finally{
    button.disabled = false;
    button.textContent = original;
  }
}

async function showDetail(id){
  elements.detailCard.classList.remove('hidden');
  elements.detailTitle.textContent = 'Carregando…';
  renderAnalysis(null);
  elements.messageList.innerHTML = '';
  elements.attachmentList.innerHTML = '';
  const [atendimentoResult,messagesResult,attachmentsResult] = await Promise.all([
    supabase.from('lab_whatsapp_atendimentos').select('*').eq('id',id).single(),
    supabase.from('lab_whatsapp_mensagens').select('*').eq('atendimento_id',id).order('sequence'),
    supabase.from('lab_whatsapp_anexos').select('*').eq('atendimento_id',id).order('created_at')
  ]);
  const error = atendimentoResult.error || messagesResult.error || attachmentsResult.error;
  if(error){
    elements.detailTitle.textContent = 'Erro ao abrir atendimento';
    elements.detailMeta.textContent = error.message;
    return;
  }
  const atendimento = atendimentoResult.data;
  renderAnalysis(atendimento.analysis);
  elements.detailTitle.textContent = atendimento.contact_name || atendimento.contact_phone || 'Contato WhatsApp';
  elements.detailMeta.textContent = `${messagesResult.data.length} mensagens · ${attachmentsResult.data.length} anexos · importado em ${new Date(atendimento.created_at).toLocaleString('pt-BR')}`;
  elements.messageList.innerHTML = messagesResult.data.length ? messagesResult.data.map(message => `
    <article class="message ${escapeHtml(message.direction)}">
      <div class="message-head"><strong>${escapeHtml(message.author || message.direction)}</strong><span>${escapeHtml([message.message_date,message.message_time].filter(Boolean).join(' '))}</span></div>
      ${message.quoted_text ? `<div class="quote">Respondendo a: ${escapeHtml(message.quoted_text)}</div>` : ''}
      <p>${escapeHtml(message.body || '[Mensagem sem texto]')}</p>
      ${message.file_names ? `<div class="hint">Arquivo citado: ${escapeHtml(message.file_names)}</div>` : ''}
    </article>`).join('') : '<div class="empty">Nenhuma mensagem encontrada.</div>';
  elements.attachmentList.innerHTML = attachmentsResult.data.length ? attachmentsResult.data.map(attachment => `
    <div class="attachment"><div><strong>${escapeHtml(attachment.file_name)}</strong><div class="hint">${escapeHtml(attachment.kind)} · ${formatBytes(attachment.size_bytes)} · ${escapeHtml(attachment.processing_status)}</div>${attachment.transcription || attachment.extracted_text ? `<details><summary class="hint">Ver conteúdo extraído</summary><p class="suggested-reply">${escapeHtml(attachment.transcription || attachment.extracted_text)}</p></details>` : ''}</div><button class="internal-btn secondary" type="button" data-open-file="${attachment.id}">Abrir</button></div>`).join('') : '<div class="empty">Nenhum anexo enviado neste teste.</div>';
  elements.attachmentList.querySelectorAll('[data-open-file]').forEach(button => button.addEventListener('click',() => openAttachment(button.dataset.openFile,attachmentsResult.data)));
  elements.detailCard.scrollIntoView({behavior:'smooth',block:'start'});
}

async function openAttachment(id,attachments){
  const attachment = attachments.find(item => item.id === id);
  if(!attachment) return;
  const { data, error } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrl(attachment.storage_path,60);
  if(error){
    setStatus(`Não foi possível abrir o anexo: ${error.message}`,true);
    return;
  }
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

async function deleteAtendimento(id,name){
  if(!confirm(`Excluir ${name} e os anexos deste laboratório? Esta ação não afeta pedidos ou clientes oficiais.`)) return;
  const { data: attachments, error: listError } = await supabase.from('lab_whatsapp_anexos').select('storage_path').eq('atendimento_id',id);
  if(listError){
    setStatus(`Não foi possível conferir os anexos: ${listError.message}`,true);
    return;
  }
  const paths = attachments.map(item => item.storage_path).filter(Boolean);
  if(paths.length){
    const { error: storageError } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
    if(storageError){
      setStatus(`Não foi possível excluir os arquivos: ${storageError.message}`,true);
      return;
    }
  }
  const { error } = await supabase.from('lab_whatsapp_atendimentos').delete().eq('id',id);
  if(error){
    setStatus(`Os arquivos foram removidos, mas o registro não: ${error.message}`,true);
    return;
  }
  elements.detailCard.classList.add('hidden');
  setStatus('Atendimento de teste excluído.');
  await loadAtendimentos();
}

elements.copyExporter.addEventListener('click',() => copyExporter(false));
elements.copyBookmarklet.addEventListener('click',() => copyExporter(true));

elements.jsonFile.addEventListener('change',async event => {
  setStatus('');
  const file = event.target.files?.[0];
  if(!file){ importedPayload = null; renderPayloadPreview(); refreshSaveState(); return; }
  try{
    if(file.size > MAX_JSON_BYTES) throw new Error('O JSON ultrapassa o limite de 5 MB.');
    importedPayload = normalizePayload(JSON.parse(await file.text()));
    renderPayloadPreview();
    refreshSaveState();
    setStatus('Histórico lido. Confira os dados e adicione os anexos, se houver.');
  }catch(error){
    importedPayload = null;
    renderPayloadPreview();
    refreshSaveState();
    setStatus(error.message || 'JSON inválido.',true);
  }
});

elements.attachmentFiles.addEventListener('change',async event => {
  const selected = [...(event.target.files || [])];
  setStatus(selected.some(file => /ogg|opus/i.test(`${file.type} ${file.name}`)) ? 'Preparando áudios do WhatsApp…' : '');
  try{
    const normalized = [];
    for(const file of selected) normalized.push(await normalizeSelectedAudio(file));
    const oversized = normalized.filter(file => file.size > MAX_ATTACHMENT_BYTES);
    attachmentFiles = normalized.filter(file => file.size <= MAX_ATTACHMENT_BYTES);
    renderFiles();
    if(oversized.length) setStatus(`Ignorados por ultrapassarem 20 MB após preparação: ${oversized.map(file => file.name).join(', ')}`,true);
    else if(selected.length) setStatus(`${attachmentFiles.length} anexo(s) preparado(s) para envio.`);
  }catch(error){
    attachmentFiles = [];
    renderFiles();
    setStatus(error.message,true);
  }
});

elements.saveTest.addEventListener('click',saveAtendimento);
elements.clearTest.addEventListener('click',resetForm);
elements.refreshList.addEventListener('click',loadAtendimentos);
elements.closeDetail.addEventListener('click',() => elements.detailCard.classList.add('hidden'));
elements.savedList.addEventListener('click',event => {
  const processButton = event.target.closest('[data-process]');
  const viewButton = event.target.closest('[data-view]');
  const deleteButton = event.target.closest('[data-delete]');
  if(processButton) processAtendimento(processButton.dataset.process,processButton);
  if(viewButton) showDetail(viewButton.dataset.view);
  if(deleteButton) deleteAtendimento(deleteButton.dataset.delete,deleteButton.dataset.name);
});

try{
  staffSession = await protectInternalPage();
  if(staffSession){
    elements.who.textContent = `${staffSession.profile.nome || staffSession.user.email} · ${roleLabel(staffSession.profile.role)}`;
    await loadAtendimentos();
  }
}catch(error){
  document.body.hidden = false;
  setStatus(`Não foi possível validar o acesso: ${error.message}`,true);
}
