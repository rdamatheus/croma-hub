// Compra direta somente para itens classificados pelo catálogo como "buy".
export function setupDirectCart(root,items){
  if(!root)return;
  root.addEventListener('click',async event=>{
    const button=event.target.closest('[data-direct-cart]');
    if(!button||!root.contains(button)||button.disabled)return;
    event.preventDefault();
    const item=items.get(button.dataset.directCart);
    if(!item||item.action!=='buy'||!Number.isFinite(Number(item.preco))||Number(item.preco)<=0)return;
    button.disabled=true;
    const original=button.textContent;
    button.textContent='Adicionando...';
    try{
      let cart=window.CromaCart;
      for(let i=0;!cart&&i<30;i++){await new Promise(resolve=>setTimeout(resolve,100));cart=window.CromaCart}
      if(!cart?.add)throw Error('Carrinho indisponível');
      cart.add({productId:item.id,variantId:null,name:item.nome,qty:1,unitPrice:Number(item.preco),options:{}});
      button.textContent='Adicionado ✓';
      document.dispatchEvent(new CustomEvent('croma:cart-updated'));
      window.setTimeout(()=>{if(button.isConnected)button.textContent=original},1800);
    }catch(error){console.error('direct_cart_error',error);button.textContent='Tentar novamente';}
    finally{button.disabled=false}
  });
}
