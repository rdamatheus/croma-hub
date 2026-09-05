const $=s=>document.querySelector(s);

function ensureStyles(){
  if($('#productModalStyles'))return;
  const style=document.createElement('style');
  style.id='productModalStyles';
  style.textContent=`
    body.product-modal-open{overflow:hidden}
    #productModalBackdrop{position:fixed;inset:0;background:rgba(25,20,66,.48);backdrop-filter:blur(2px);z-index:1100;display:none}
    #productModalBackdrop.show{display:block}
    #editor.open{display:block!important;position:fixed;z-index:1101;top:2.5vh;left:50%;transform:translateX(-50%);width:min(1480px,96vw);height:95vh;overflow:auto;background:#f7f6fb;border:1px solid #ded9eb;border-radius:22px;padding:18px 18px 96px;box-shadow:0 28px 90px rgba(24,18,70,.32)}
    #editor.open>.card:first-child{position:sticky;top:-18px;z-index:4;border-radius:0 0 16px 16px;box-shadow:0 8px 18px rgba(30,25,70,.08)}
    #productModalClose{width:40px;height:40px;border-radius:50%;font-size:1.2rem;padding:0;display:grid;place-items:center}
    #editor .section{max-width:100%;}
    #editor .section.active{display:block}
    #editor .card{max-width:100%}
    #savebar.show{z-index:1102;left:50%;right:auto;transform:translateX(-50%);width:min(1440px,92vw);bottom:2.5vh;border:1px solid #ddd9e8;border-radius:14px;padding:10px 14px;box-shadow:0 10px 30px rgba(25,20,66,.16)}
    @media(max-width:700px){#editor.open{top:0;left:0;transform:none;width:100vw;height:100vh;border-radius:0;padding:10px 10px 92px}#editor.open>.card:first-child{top:-10px}#savebar.show{left:8px;right:8px;transform:none;width:auto;bottom:8px}}
  `;
  document.head.appendChild(style);
}

function ensureBackdrop(){
  let b=$('#productModalBackdrop');
  if(!b){b=document.createElement('div');b.id='productModalBackdrop';document.body.appendChild(b);b.addEventListener('click',requestClose)}
  return b;
}

function dirty(){return !$('#dirty')?.classList.contains('clean')}

function closeNow(){
  $('#editor')?.classList.remove('open');
  $('#savebar')?.classList.remove('show');
  $('#productModalBackdrop')?.classList.remove('show');
  document.body.classList.remove('product-modal-open');
  const u=new URL(location.href);u.searchParams.delete('produto');history.replaceState(null,'',u.pathname+u.search+u.hash);
}

function requestClose(){
  if(dirty()){
    if(!confirm('Existem alterações não salvas. Deseja descartá-las e fechar?'))return;
    const discard=$('#discard');
    if(discard){discard.click();setTimeout(closeNow,120);return}
  }
  closeNow();
}

function enhanceHeader(){
  const head=$('#editor .editor-head');if(!head||$('#productModalClose'))return;
  const actions=head.querySelector('.editor-actions')||head;
  const close=document.createElement('button');close.id='productModalClose';close.type='button';close.className='btn light';close.setAttribute('aria-label','Fechar edição');close.textContent='×';close.onclick=requestClose;actions.appendChild(close);
}

function openModal(){
  if(!$('#editor')?.classList.contains('open'))return;
  ensureStyles();ensureBackdrop().classList.add('show');enhanceHeader();document.body.classList.add('product-modal-open');
}

function wire(){
  ensureStyles();ensureBackdrop();enhanceHeader();
  const editor=$('#editor');if(!editor)return setTimeout(wire,200);
  new MutationObserver(openModal).observe(editor,{attributes:true,attributeFilter:['class']});
  $('#discard')?.addEventListener('click',()=>setTimeout(closeNow,160));
  const status=$('#status');if(status)new MutationObserver(()=>{if(status.classList.contains('ok')&&/salvo com sucesso/i.test(status.textContent||''))setTimeout(closeNow,220)}).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('#editor')?.classList.contains('open')){e.preventDefault();requestClose()}});
  if(editor.classList.contains('open'))openModal();
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
