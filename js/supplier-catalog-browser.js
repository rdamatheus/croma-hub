function install(){
  const button=document.querySelector('#openSupplierCatalogBrowser');
  if(!button)return setTimeout(install,250);
  button.textContent='Fornecedores e catálogos';
  button.onclick=()=>{location.href='/interno/fornecedores/'};
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
