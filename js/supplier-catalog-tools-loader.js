import './supplier-catalog-ui-cleanup.js?v=20260914-3';

async function waitForCatalogHost(timeoutMs=5000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    if(document.querySelector('.list-head'))return true;
    await new Promise(resolve=>setTimeout(resolve,80));
  }
  return false;
}

const hostReady=await waitForCatalogHost();
if(!hostReady){
  throw new Error('Área de ferramentas do catálogo não ficou disponível a tempo.');
}

await import('./supplier-catalog-importer-v21-fixed.js?v=20260905-2');
