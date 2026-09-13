function cleanSupplierCatalogDialog(){
  const dialog=document.querySelector('#supplierCatalogDialog');
  if(!dialog)return;

  dialog.querySelectorAll('a[href*="supplier-catalog-v2_1.xsd"]').forEach(link=>link.remove());

  const rules=dialog.querySelector('a[href*="supplier-catalog-rules-v2_1.md"]');
  if(rules)rules.textContent='Regras de conversão';

  const example=dialog.querySelector('a[href*="supplier-catalog-example-v2_1.xml"]');
  if(example)example.textContent='XML de exemplo';

  const intro=dialog.querySelector('.scm-head .muted');
  if(intro&&/Compatível com v1, v2 e v2\.1/i.test(intro.textContent||'')){
    intro.textContent='Compatível com o padrão Croma. O catálogo atual é atualizado por fornecedor + SKU.';
  }
}

cleanSupplierCatalogDialog();

const observer=new MutationObserver(()=>cleanSupplierCatalogDialog());
observer.observe(document.documentElement,{childList:true,subtree:true});
