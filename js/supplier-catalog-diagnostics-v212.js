import { supabase } from './croma-supabase.js';
import { listSupplierDirectory } from './supplier-directory.js';

const VERSION='2.1.2';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function stringifyError(e){
  if(e==null)return 'Erro sem detalhes.';
  if(typeof e==='string')return e;
  const parts=[];
  for(const key of ['message','details','detail','hint','code','error','status','statusCode']){
    const v=e?.[key];
    if(v==null)continue;
    if(typeof v==='string'&&v.trim())parts.push(`${key}: ${v}`);
    else if(typeof v!=='object')parts.push(`${key}: ${String(v)}`);
    else{try{parts.push(`${key}: ${JSON.stringify(v)}`)}catch{parts.push(`${key}: ${String(v)}`)}}
  }
  try{
    const raw=JSON.stringify(e,Object.getOwnPropertyNames(e));
    if(raw&&raw!=='{}')parts.push(`raw: ${raw}`);
  }catch{}
  return [...new Set(parts)].join(' | ') || String(e);
}

function setStatus(msg,bad=false){
  const el=document.querySelector('#scStatus');
  if(!el)return;
  el.textContent=msg;
  el.className=`status ${bad?'bad':''}`;
}

function ensureBadge(){
  const dialog=document.querySelector('#supplierCatalogDialog');
  if(!dialog)return false;
  if(!dialog.querySelector('#scDiagVersion')){
    const p=dialog.querySelector('.scm-head .muted');
    if(p){
      const badge=document.createElement('span');
      badge.id='scDiagVersion';
      badge.textContent=` · Importador v${VERSION}`;
      badge.style.cssText='font-weight:800;color:#6b6499';
      p.appendChild(badge);
    }
  }
  return true;
}

async function preflight(btn,original){
  const supplierSelect=document.querySelector('#scSupplier');
  const fileInput=document.querySelector('#scFile');
  const contactId=supplierSelect?.value||'';
  const file=fileInput?.files?.[0];
  if(!contactId)return setStatus(`[v${VERSION}] Etapa 1/6 — selecione um fornecedor.`,true);
  if(!file)return setStatus(`[v${VERSION}] Etapa 1/6 — selecione um arquivo XML.`,true);

  let stage='1/6 identificação do fornecedor';
  let captured=[];
  try{
    btn.disabled=true;
    setStatus(`[v${VERSION}] Etapa 1/6 — identificando fornecedor…`);
    const directory=await listSupplierDirectory();
    const supplier=directory.find(x=>x.contactId===contactId);
    if(!supplier)throw new Error(`Fornecedor selecionado não foi encontrado no diretório local. contact_id=${contactId}`);
    setStatus(`[v${VERSION}] Etapa 1/6 OK — ${supplier.name}${supplier.supplierId?` · supplier_id ${supplier.supplierId}`:' · ainda sem extensão operacional'}.`);

    stage='2/6 leitura do arquivo';
    setStatus(`[v${VERSION}] Etapa 2/6 — lendo ${file.name}…`);
    const raw=await file.text();
    if(!raw.trim())throw new Error('O arquivo está vazio.');

    stage='3/6 validação XML';
    setStatus(`[v${VERSION}] Etapa 3/6 — validando estrutura XML…`);
    const doc=new DOMParser().parseFromString(raw,'application/xml');
    const parserError=doc.querySelector('parsererror');
    if(parserError)throw new Error(`XML inválido: ${parserError.textContent?.slice(0,500)||'erro de parser'}`);
    const root=doc.documentElement;
    const version=root?.getAttribute('version')||'';
    if(root?.tagName!=='supplierCatalog')throw new Error(`Elemento raiz inesperado: ${root?.tagName||'ausente'}. Esperado supplierCatalog.`);
    if(!['1.0','2.0','2.1'].includes(version))throw new Error(`Versão ${version||'ausente'} não suportada.`);

    stage='4/6 contagem dos itens';
    const items=doc.querySelectorAll('supplierCatalog > items > item');
    setStatus(`[v${VERSION}] Etapa 4/6 OK — padrão ${version}, ${items.length} item(ns) encontrados.`);
    if(!items.length)throw new Error('O XML não contém itens em supplierCatalog > items > item.');

    stage='5/6 consulta do catálogo atual';
    if(supplier.supplierId){
      setStatus(`[v${VERSION}] Etapa 5/6 — consultando SKUs já existentes…`);
      let count=0;
      for(let from=0;;from+=1000){
        const {data,error}=await supabase.from('supplier_catalog_items').select('sku').eq('supplier_id',supplier.supplierId).range(from,from+999);
        if(error)throw error;
        count+=(data||[]).length;
        if(!data||data.length<1000)break;
      }
      setStatus(`[v${VERSION}] Etapa 5/6 OK — ${count} SKU(s) existentes localizados.`);
    }else{
      setStatus(`[v${VERSION}] Etapa 5/6 — fornecedor ainda sem extensão; o importador criará uma antes da consulta.`);
    }

    stage='6/6 execução do importador';
    setStatus(`[v${VERSION}] Etapa 6/6 — pré-diagnóstico concluído; executando o importador real…`);
    const oldConsoleError=console.error;
    console.error=(...args)=>{
      captured.push(...args);
      oldConsoleError(...args);
    };
    try{
      await original.call(btn,new Event('click'));
    }finally{
      console.error=oldConsoleError;
    }
    await sleep(50);
    const status=document.querySelector('#scStatus');
    const current=status?.textContent||'';
    if(current.includes('[object Object]')||current.trim()==='[object Object]'){
      const detail=captured.length?captured.map(stringifyError).filter(Boolean).join(' || '):'O importador retornou um objeto sem detalhes capturáveis.';
      setStatus(`[v${VERSION}] Falha na etapa 6/6 — ${detail}`,true);
    }
  }catch(e){
    setStatus(`[v${VERSION}] Falha na etapa ${stage} — ${stringifyError(e)}`,true);
    console.error('supplier catalog diagnostic',stage,e);
  }finally{
    btn.disabled=false;
  }
}

async function install(){
  for(let i=0;i<80;i++){
    ensureBadge();
    const btn=document.querySelector('#scRead');
    if(btn&&typeof btn.onclick==='function'&&!btn.dataset.diag212){
      const original=btn.onclick;
      btn.dataset.diag212='1';
      btn.onclick=null;
      btn.addEventListener('click',ev=>{
        ev.preventDefault();
        ev.stopImmediatePropagation();
        preflight(btn,original);
      });
      return;
    }
    await sleep(250);
  }
  console.warn('supplier catalog diagnostics: botão scRead não encontrado');
}

install();
