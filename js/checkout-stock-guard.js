import { supabase } from './croma-supabase.js';

async function refreshCheckoutStock(){
  const {data,error}=await supabase.functions.invoke('checkout-stock-refresh',{body:{}});
  if(error){
    let message=error.message||'Não foi possível confirmar o estoque no Bling.';
    try{
      const response=error.context;
      if(response?.clone){
        const payload=await response.clone().json();
        message=payload?.error||payload?.detail||message;
      }
    }catch{}
    throw new Error(message);
  }
  if(data?.error)throw new Error(data.error);
  return data;
}

function installGuard(){
  const cart=window.CromaCart;
  if(!cart||typeof cart.syncNow!=='function'||cart.__stockGuardInstalled)return false;
  const original=cart.syncNow.bind(cart);
  cart.syncNow=async(...args)=>{
    const result=await original(...args);
    await refreshCheckoutStock();
    return result;
  };
  cart.__stockGuardInstalled=true;
  return true;
}

if(!installGuard()){
  let tries=0;
  const timer=setInterval(()=>{
    tries++;
    if(installGuard()||tries>=40)clearInterval(timer);
  },100);
}
