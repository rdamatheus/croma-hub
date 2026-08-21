(() => {
  if (window.CromaCart) return;

  const CART_KEY = 'croma_cart_v1';
  const UPLOAD_MAP_KEY = 'croma_upload_map_v2';
  const ORDER_REF_KEY = 'croma_upload_order_ref_v1';
  const SUPABASE_URL = 'https://tocoxxfnqauvsviapzet.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mssN4XTkXNg3kEjsusNXuw_9peKSMAi';
  const SUPABASE_BUCKET = 'croma-arquivos';
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;' }[m]));
  const uid = () => `ci_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const loadCart = () => { try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch { return []; } };
  const saveCart = next => { localStorage.setItem(CART_KEY, JSON.stringify(next)); render(); window.dispatchEvent(new CustomEvent('croma:cartchange', { detail: next })); };
  let items = loadCart();

  function orderRef(){
    let ref = localStorage.getItem(ORDER_REF_KEY);
    if (ref) return ref;
    const now = new Date();
    const d = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const rand = (crypto.randomUUID ? crypto.randomUUID().replaceAll('-','') : Math.random().toString(36).slice(2)).slice(0,6).toUpperCase();
    ref = `CR-${d}-${rand}`;
    localStorage.setItem(ORDER_REF_KEY, ref);
    return ref;
  }

  const style = document.createElement('style');
  style.id = 'cromaCartStyles';
  style.textContent = `
    .croma-cart-shell{position:fixed;top:86px;right:18px;z-index:980;font-family:Inter,Arial,sans-serif}.croma-cart-shell[hidden]{display:none!important}
    .croma-cart-btn{display:flex;align-items:center;gap:9px;border:1px solid rgba(48,41,127,.13);background:#fff;color:#211c5c;border-radius:999px;padding:10px 13px;box-shadow:0 14px 35px rgba(33,28,92,.17);cursor:pointer;font-weight:900}
    .croma-cart-icon{position:relative;font-size:1.22rem;line-height:1}.croma-cart-count{position:absolute;top:-9px;right:-10px;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#C30079;color:#fff;display:grid;place-items:center;font-size:.64rem;font-weight:900}
    .croma-cart-total{font-size:.88rem}.croma-cart-pop{position:absolute;top:calc(100% + 9px);right:0;width:min(390px,calc(100vw - 24px));background:#fff;border:1px solid #e6e4ee;border-radius:18px;box-shadow:0 24px 65px rgba(33,28,92,.2);padding:14px;opacity:0;visibility:hidden;transform:translateY(-5px);transition:.16s ease}
    .croma-cart-shell:hover .croma-cart-pop,.croma-cart-shell.open .croma-cart-pop{opacity:1;visibility:visible;transform:none}.croma-cart-pop h3{margin:0 0 10px;color:#211c5c;font-size:1rem}.croma-cart-list{display:grid;gap:8px;max-height:330px;overflow:auto}.croma-cart-item{display:grid;grid-template-columns:1fr auto;gap:9px;padding:10px;border:1px solid #eeecf4;border-radius:12px}.croma-cart-item strong{display:block;color:#29263b;font-size:.88rem}.croma-cart-item small{display:block;color:#706d80;line-height:1.35;margin-top:3px}.croma-cart-item-price{text-align:right;font-size:.84rem;font-weight:900;color:#211c5c}.croma-cart-remove{border:0;background:transparent;color:#a83a3a;padding:4px 0;cursor:pointer;font-size:.72rem;font-weight:850}
    .croma-cart-foot{border-top:1px solid #eceaf3;margin-top:10px;padding-top:11px}.croma-cart-sum{display:flex;justify-content:space-between;gap:12px;color:#211c5c;font-weight:900}.croma-cart-actions{display:flex;gap:7px;margin-top:10px}.croma-cart-actions button,.croma-cart-actions a{flex:1;text-align:center;border:0;border-radius:10px;padding:9px 10px;font-weight:900;text-decoration:none;cursor:pointer}.croma-cart-clear{background:#fff;color:#a83a3a;border:1px solid #efd0d0!important}.croma-cart-checkout{background:#30297F;color:#fff}
    .croma-upload-card{margin:24px auto 10px;max-width:1120px;background:#fff;border:1px solid #e6e4ee;border-radius:20px;padding:18px}.croma-upload-card h2{margin:0 0 6px;color:#211c5c}.croma-upload-card p{margin:0 0 12px;color:#706d80;line-height:1.45}.croma-upload-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.croma-upload-label{display:inline-flex;align-items:center;gap:8px;border:1px dashed #aaa6c4;border-radius:12px;padding:11px 13px;color:#30297F;font-weight:900;cursor:pointer;background:#fafafe}.croma-upload-label input{display:none}.croma-upload-label.busy{opacity:.55;pointer-events:none}.croma-upload-files{display:grid;gap:7px;margin-top:12px}.croma-upload-file{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 11px;border-radius:11px;background:#f6f6fb;font-size:.83rem}.croma-upload-file span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.croma-upload-file button{border:0;background:transparent;color:#a83a3a;font-weight:900;cursor:pointer}.croma-upload-status{font-size:.78rem;color:#706d80;margin-top:8px}.croma-upload-ok{color:#567d25}.croma-upload-error{color:#a83a3a}
    @media(max-width:760px){.croma-cart-shell{top:auto;bottom:18px;right:14px}.croma-cart-pop{bottom:calc(100% + 9px);top:auto}.croma-cart-total{display:none}}
  `;
  document.head.appendChild(style);

  const shell = document.createElement('div');
  shell.className = 'croma-cart-shell';
  shell.id = 'cromaCartShell';
  shell.hidden = true;
  shell.innerHTML = `
    <button class="croma-cart-btn" type="button" id="cromaCartBtn" aria-label="Abrir carrinho">
      <span class="croma-cart-icon">🛒<span class="croma-cart-count" id="cromaCartCount">0</span></span>
      <span class="croma-cart-total" id="cromaCartTotal">R$ 0,00</span>
    </button>
    <div class="croma-cart-pop" id="cromaCartPop">
      <h3>Seu carrinho</h3>
      <div class="croma-cart-list" id="cromaCartList"></div>
      <div class="croma-cart-foot">
        <div class="croma-cart-sum"><span>Total</span><span id="cromaCartSum">R$ 0,00</span></div>
        <div class="croma-cart-actions"><button class="croma-cart-clear" type="button" id="cromaCartClear">Esvaziar</button><a class="croma-cart-checkout" id="cromaCartCheckout" href="https://wa.me/553230253588" target="_blank" rel="noopener noreferrer">Finalizar pedido</a></div>
      </div>
    </div>`;
  document.body.appendChild(shell);

  const optionsText = opts => Object.entries(opts || {}).filter(([,v]) => v !== '' && v != null).map(([k,v]) => `${k}: ${v}`).join(' · ');
  function render(){
    const count = items.reduce((a,x) => a + Number(x.qty || 1), 0);
    const total = items.reduce((a,x) => a + Number(x.total ?? (Number(x.qty || 1) * Number(x.unitPrice || 0))), 0);
    shell.hidden = items.length === 0;
    document.getElementById('cromaCartCount').textContent = count;
    document.getElementById('cromaCartTotal').textContent = brl(total);
    document.getElementById('cromaCartSum').textContent = brl(total);
    document.getElementById('cromaCartList').innerHTML = items.map(x => `<div class="croma-cart-item"><div><strong>${esc(x.name)}</strong><small>${esc(optionsText(x.options))}</small>${x.fileNames?.length ? `<small>Arquivo: ${esc(x.fileNames.join(', '))}</small>` : ''}<button class="croma-cart-remove" type="button" data-remove="${esc(x.cartId)}">Remover</button></div><div class="croma-cart-item-price">${x.qty || 1} × ${brl(x.unitPrice)}<br>${brl(x.total ?? (Number(x.qty || 1)*Number(x.unitPrice || 0)))}</div></div>`).join('');
    const msg = items.map(x => `${x.qty || 1}x ${x.name} — ${brl(x.total ?? (Number(x.qty || 1)*Number(x.unitPrice || 0)))}`).join('\n');
    const hasFiles = items.some(x => x.filePaths?.length || x.fileNames?.length);
    const refLine = hasFiles ? `\nReferência dos arquivos: ${orderRef()}` : '';
    document.getElementById('cromaCartCheckout').href = `https://wa.me/553230253588?text=${encodeURIComponent(`Olá! Quero finalizar este pedido da Croma:\n${msg}\n\nTotal estimado: ${brl(total)}${refLine}`)}`;
  }
  document.getElementById('cromaCartBtn').addEventListener('click', () => shell.classList.toggle('open'));
  document.getElementById('cromaCartClear').addEventListener('click', () => { if (confirm('Esvaziar o carrinho?')) { items = []; saveCart(items); } });
  shell.addEventListener('click', e => { const b = e.target.closest('[data-remove]'); if (!b) return; items = items.filter(x => x.cartId !== b.dataset.remove); saveCart(items); });
  document.addEventListener('click', e => { if (!shell.contains(e.target)) shell.classList.remove('open'); });

  window.CromaCart = {
    add(item){
      const qty = Math.max(1, Number(item.qty || 1));
      const unitPrice = Number(item.unitPrice || 0);
      const entry = { ...item, cartId: uid(), qty, unitPrice, total: item.total != null ? Number(item.total) : qty * unitPrice, addedAt: new Date().toISOString(), uploadRef:item.uploadRef || (item.filePaths?.length ? orderRef() : null) };
      items.push(entry); saveCart(items); shell.classList.add('open'); return entry;
    },
    remove(cartId){ items = items.filter(x => x.cartId !== cartId); saveCart(items); },
    clear(){ items = []; saveCart(items); },
    getItems(){ return [...items]; },
    getTotal(){ return items.reduce((a,x) => a + Number(x.total || 0), 0); }
  };

  const loadMap = () => { try { return JSON.parse(localStorage.getItem(UPLOAD_MAP_KEY)||'{}'); } catch { return {}; } };
  const saveMap = m => localStorage.setItem(UPLOAD_MAP_KEY, JSON.stringify(m));
  const pageKey = () => location.pathname.replace(/\/+$/,'/') || '/';
  const safeName = name => String(name || 'arquivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'').slice(-120) || 'arquivo';
  const encodeObjectPath = path => path.split('/').map(encodeURIComponent).join('/');

  async function uploadFile(file){
    if (!(file instanceof File)) throw new Error('Arquivo inválido.');
    if (file.size <= 0) throw new Error(`O arquivo ${file.name} está vazio.`);
    if (file.size > MAX_FILE_SIZE) throw new Error(`O arquivo ${file.name} ultrapassa o limite de 50 MB.`);
    const ref = orderRef();
    const random = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`).replaceAll('-','');
    const objectPath = `pedidos/${ref}/${Date.now()}-${random.slice(0,8)}-${safeName(file.name)}`;
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodeObjectPath(objectPath)}`;
    const response = await fetch(url, {
      method:'POST',
      headers:{
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        'Content-Type': file.type || 'application/octet-stream',
        'x-upsert':'false',
        'cache-control':'3600'
      },
      body:file
    });
    if(!response.ok){
      let detail='';
      try{const body=await response.json(); detail=body.message||body.error||body.statusCode||''}catch{}
      throw new Error(detail ? `Falha no envio: ${detail}` : `Falha no envio (${response.status}).`);
    }
    return { id:`up_${random.slice(0,12)}`, name:file.name, type:file.type, size:file.size, uploadedAt:new Date().toISOString(), bucket:SUPABASE_BUCKET, path:objectPath, orderRef:ref };
  }

  window.CromaUpload = {
    async stage(files){
      const metas=[];
      for(const f of files) metas.push(await uploadFile(f));
      const map=loadMap(), key=pageKey(); map[key]=[...(map[key]||[]),...metas]; saveMap(map); renderUploadList(); return metas;
    },
    getForCurrentPage(){ const map=loadMap(); return [...(map[pageKey()]||[])]; },
    remove(id){ const map=loadMap(), key=pageKey(); map[key]=(map[key]||[]).filter(x=>x.id!==id); saveMap(map); renderUploadList(); },
    clearCurrent(){ const map=loadMap(); delete map[pageKey()]; saveMap(map); renderUploadList(); },
    getOrderRef(){ return orderRef(); }
  };

  function shouldInjectUploader(){
    const p=location.pathname.replace(/\/+$/,'/');
    return p.startsWith('/servicos/') && p !== '/servicos/';
  }
  let uploadListEl=null, uploadStatusEl=null, uploadLabelEl=null;
  function renderUploadList(){
    if(!uploadListEl) return;
    const list=window.CromaUpload.getForCurrentPage();
    uploadListEl.innerHTML=list.map(x=>`<div class="croma-upload-file"><span>✓ ${esc(x.name)} · ${(x.size/1024/1024).toFixed(2)} MB</span><button type="button" data-upload-remove="${esc(x.id)}">Remover</button></div>`).join('');
    if(uploadStatusEl){uploadStatusEl.classList.remove('croma-upload-error');if(list.length){uploadStatusEl.classList.add('croma-upload-ok');uploadStatusEl.textContent=`${list.length} arquivo(s) enviado(s) com sucesso.`}else{uploadStatusEl.classList.remove('croma-upload-ok');uploadStatusEl.textContent='Nenhum arquivo enviado.'}}
  }
  if(shouldInjectUploader()){
    const main=document.querySelector('main');
    if(main){
      const card=document.createElement('section'); card.className='croma-upload-card';
      card.innerHTML=`<h2>Envie seu arquivo</h2><p>Anexe a arte, PDF, imagem ou documento necessário para produzir este serviço.</p><div class="croma-upload-row"><label class="croma-upload-label">📎 Selecionar arquivo(s)<input type="file" id="cromaUploadInput" multiple></label><span class="croma-upload-status" id="cromaUploadStatus"></span></div><div class="croma-upload-files" id="cromaUploadFiles"></div>`;
      main.appendChild(card);
      uploadListEl=card.querySelector('#cromaUploadFiles'); uploadStatusEl=card.querySelector('#cromaUploadStatus'); uploadLabelEl=card.querySelector('.croma-upload-label');
      card.querySelector('#cromaUploadInput').addEventListener('change', async e=>{
        const fs=[...e.target.files]; if(!fs.length)return;
        uploadLabelEl.classList.add('busy'); uploadStatusEl.classList.remove('croma-upload-ok','croma-upload-error'); uploadStatusEl.textContent=fs.length>1?`Enviando ${fs.length} arquivos...`:'Enviando arquivo...';
        try{await window.CromaUpload.stage(fs);}
        catch(err){uploadStatusEl.classList.add('croma-upload-error');uploadStatusEl.textContent=err?.message||'Não foi possível enviar o arquivo. Tente novamente.';}
        finally{uploadLabelEl.classList.remove('busy');e.target.value='';}
      });
      card.addEventListener('click',e=>{const b=e.target.closest('[data-upload-remove]');if(b)window.CromaUpload.remove(b.dataset.uploadRemove)});
      renderUploadList();
    }
  }
  render();
})();