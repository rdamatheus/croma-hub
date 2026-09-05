import { supabase } from './croma-supabase.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const BUCKET='supplier-files';

function inject(){
  if(document.querySelector('#supplierCatalogImportCard'))return;
  const bling=document.querySelector('#importCard');if(!bling)return;
  const card=document.createElement('section');card.className='card';card.id='supplierCatalogImportCard';card.innerHTML=`<h2>Atualizar catálogo de fornecedor</h2><p class="section-note">O arquivo original é salvo em Storage privado e depois os itens são normalizados no catálogo do fornecedor. Isso preserva histórico e não cria produtos da Croma automaticamente.</p><div class="grid"><div class="field"><label>Fornecedor</label><select id="supplierImportSupplier"><option value="">Selecione</option></select></div><div class="field span2"><label>Tabela do fornecedor</label><input id="supplierImportFile" type="file" accept=".xls,.html,.htm,.csv,.txt"></div></div><div class="toolbar" style="margin-top:12px"><button class="btn" id="supplierImportStart" type="button">Salvar arquivo e atualizar catálogo</button></div><p class="status" id="supplierImportStatus"></p><div class="muted" id="supplierImportHistory"></div>`;
  bling.insertAdjacentElement('afterend',card);loadSuppliers();card.querySelector('#supplierImportStart').onclick=runImport;
}

async function loadSuppliers(){const sel=document.querySelector('#supplierImportSupplier');if(!sel)return;const{data,error}=await supabase.from('suppliers').select('id,name').eq('active',true).order('name');if(error){setStatus(error.message,true);return}sel.innerHTML='<option value="">Selecione</option>'+data.map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');sel.onchange=loadHistory}
function setStatus(msg,bad=false){const el=document.querySelector('#supplierImportStatus');if(!el)return;el.className=`status ${bad?'bad':''}`;el.textContent=msg}
function money(v){if(v==null)return null;let s=String(v).trim().replace(/R\$\s*/i,'').replace(/\./g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:null}
function number(v){if(v==null||String(v).trim()==='')return null;const m=String(v).replace(',','.').match(/-?\d+(?:\.\d+)?/);return m?Number(m[0]):null}
function int(v){const n=number(v);return n==null?null:Math.trunc(n)}
function normalizeHeader(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
function cellText(cell){return (cell?.textContent||'').replace(/\s+/g,' ').trim()}
function safeName(name){return String(name||'tabela').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)}
function filePath(supplierId,file){const d=new Date().toISOString().slice(0,10);return `fornecedores/${supplierId}/tabelas/${d}-${crypto.randomUUID()}-${safeName(file.name)}`}

function parseHtmlTable(text,fileName){
  const doc=new DOMParser().parseFromString(text,'text/html');const table=doc.querySelector('table');if(!table)throw new Error('Nenhuma tabela encontrada no arquivo.');
  const rows=[...table.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(cellText));
  let headerIndex=rows.findIndex(r=>r.some(x=>normalizeHeader(x)==='codigo')&&r.some(x=>normalizeHeader(x).includes('preco')));if(headerIndex<0)throw new Error('Não encontrei as colunas Código e Preço.');
  const headers=rows[headerIndex].map(normalizeHeader);const idx=(...names)=>{for(const name of names){const i=headers.findIndex(h=>h===name||h.includes(name));if(i>=0)return i}return-1};
  const ci=idx('codigo','sku'),cat=idx('categoria'),desc=idx('descricao do servico','descricao'),colors=idx('cores','cor'),weight=idx('peso'),qty=idx('qtde','quantidade'),size=idx('tam','tamanho'),lead=idx('prazo'),price=idx('preco');
  return rows.slice(headerIndex+1).filter(r=>r[ci]&&normalizeHeader(r[ci])!=='codigo').map(r=>({sku:r[ci]?.trim(),name:r[desc]?.trim()||null,description:r[desc]?.trim()||null,category:r[cat]?.trim()||null,purchase_price:money(r[price]),minimum_order_quantity:int(r[qty]),lead_time_days:int(r[lead]),weight:number(r[weight]),attributes:{...(r[colors]?{colors:r[colors].trim()}:{}),...(r[qty]?{quantity:r[qty].trim()}:{}),...(r[size]?{size:r[size].trim()}:{}),source_file_name:fileName},source_updated_at:new Date().toISOString(),last_synced_at:new Date().toISOString(),active:true})).filter(r=>r.sku);
}

function parseCsv(text,fileName){
  const lines=text.split(/\r?\n/).filter(Boolean);if(lines.length<2)throw new Error('Arquivo vazio.');const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';const split=l=>l.split(sep).map(x=>x.trim().replace(/^"|"$/g,''));const headers=split(lines[0]).map(normalizeHeader);const idx=(...names)=>{for(const n of names){const i=headers.findIndex(h=>h===n||h.includes(n));if(i>=0)return i}return-1};const ci=idx('codigo','sku'),cat=idx('categoria'),desc=idx('descricao'),price=idx('preco'),qty=idx('quantidade','qtde'),lead=idx('prazo');if(ci<0)throw new Error('Coluna Código/SKU não encontrada.');return lines.slice(1).map(split).filter(r=>r[ci]).map(r=>({sku:r[ci],name:r[desc]||null,description:r[desc]||null,category:r[cat]||null,purchase_price:price>=0?money(r[price]):null,minimum_order_quantity:qty>=0?int(r[qty]):null,lead_time_days:lead>=0?int(r[lead]):null,attributes:{source_file_name:fileName},source_updated_at:new Date().toISOString(),last_synced_at:new Date().toISOString(),active:true}));
}

async function loadHistory(){const supplierId=document.querySelector('#supplierImportSupplier')?.value,box=document.querySelector('#supplierImportHistory');if(!box)return;if(!supplierId){box.textContent='';return}const{data,error}=await supabase.from('supplier_catalog_imports').select('original_file_name,status,items_processed,imported_at').eq('supplier_id',supplierId).order('imported_at',{ascending:false}).limit(3);if(error){box.textContent='';return}box.innerHTML=data?.length?'<strong>Últimas importações:</strong> '+data.map(x=>`${esc(x.original_file_name)} — ${esc(x.status)} (${x.items_processed||0} itens)`).join(' · '):'Nenhuma tabela arquivada para este fornecedor.'}

async function runImport(){
  const supplierId=document.querySelector('#supplierImportSupplier')?.value,file=document.querySelector('#supplierImportFile')?.files?.[0],btn=document.querySelector('#supplierImportStart');if(!supplierId){setStatus('Selecione o fornecedor.',true);return}if(!file){setStatus('Selecione a tabela do fornecedor.',true);return}btn.disabled=true;let importId=null,storagePath=null;
  try{
    storagePath=filePath(supplierId,file);setStatus('Salvando arquivo original no Storage privado…');
    const up=await supabase.storage.from(BUCKET).upload(storagePath,file,{cacheControl:'3600',upsert:false,contentType:file.type||'application/vnd.ms-excel'});if(up.error)throw up.error;
    const ins=await supabase.from('supplier_catalog_imports').insert({supplier_id:supplierId,storage_bucket:BUCKET,storage_path:storagePath,original_file_name:file.name,file_size:file.size,content_type:file.type||null,status:'processing'}).select('id').single();if(ins.error)throw ins.error;importId=ins.data.id;
    setStatus('Arquivo salvo. Lendo e normalizando a tabela…');const text=await file.text();let rows;if(/<table[\s>]/i.test(text)||/\.(xls|html?|htm)$/i.test(file.name))rows=parseHtmlTable(text,file.name);else rows=parseCsv(text,file.name);if(!rows.length)throw new Error('Nenhum item válido encontrado.');
    setStatus(`${rows.length} itens encontrados. Atualizando catálogo…`);const batchSize=400;let done=0;for(let i=0;i<rows.length;i+=batchSize){const batch=rows.slice(i,i+batchSize).map(r=>({...r,supplier_id:supplierId,source_import_id:importId}));const{error}=await supabase.from('supplier_catalog_items').upsert(batch,{onConflict:'supplier_id,sku'});if(error)throw error;done+=batch.length;setStatus(`Atualizando catálogo… ${done} de ${rows.length}`)}
    const fin=await supabase.from('supplier_catalog_imports').update({status:'completed',items_processed:done,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',importId);if(fin.error)throw fin.error;
    setStatus(`Concluído: arquivo arquivado e ${done} códigos processados.`);document.querySelector('#supplierImportFile').value='';await loadHistory();
  }catch(e){console.error(e);if(importId)await supabase.from('supplier_catalog_imports').update({status:'failed',error_message:String(e.message||e).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',importId);setStatus(e.message||'Falha ao importar a tabela.',true)}finally{btn.disabled=false}
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',inject);else inject();
