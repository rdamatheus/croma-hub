(() => {
  if (window.CromaCart?.__version === '20260912-3') return;

  const CART_KEY = 'croma_cart_v2';
  const CART_TS_KEY = 'croma_cart_updated_v1';
  const REF_KEY = 'croma_cart_ref_v1';
  const UPLOAD_MAP_KEY = 'croma_upload_map_v3';
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  let supabase = null;
  let syncTimer = null;
  let syncing = false;
  let hydrated = false;

  const money = value => Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));

  const makeId = () => {
    try {
      if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
        return globalThis.crypto.randomUUID();
      }
    } catch (_) {}
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  function read() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      if (Array.isArray(parsed)) return parsed;
      if (parsed && Array.isArray(parsed.items)) return parsed.items;
      return [];
    } catch (_) {
      return [];
    }
  }

  function count() {
    return read().reduce((sum, item) => sum + Math.max(0, Number(item?.qty || 0)), 0);
  }

  function total() {
    return read().reduce((sum, item) => {
      return sum + Math.max(0, Number(item?.qty || 0)) * Math.max(0, Number(item?.unitPrice || 0));
    }, 0);
  }

  function notify() {
    try {
      document.dispatchEvent(new CustomEvent('croma:cart-updated', {
        detail: { count: count(), total: total() }
      }));
    } catch (_) {}
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncNow().catch(error => console.warn('Carrinho: sincronização adiada.', error));
    }, 450);
  }

  function write(items) {
    const safeItems = Array.isArray(items) ? items : [];
    localStorage.setItem(CART_KEY, JSON.stringify(safeItems));
    localStorage.setItem(CART_TS_KEY, new Date().toISOString());
    renderSafe();
    notify();
    scheduleSync();
    return safeItems;
  }

  function cartRef() {
    let reference = localStorage.getItem(REF_KEY);
    if (!reference) {
      reference = `CART-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${makeId().slice(0, 8).toUpperCase()}`;
      localStorage.setItem(REF_KEY, reference);
    }
    return reference;
  }

  function readUploads() {
    try {
      const parsed = JSON.parse(localStorage.getItem(UPLOAD_MAP_KEY) || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function saveUploads(map) {
    const safeMap = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
    localStorage.setItem(UPLOAD_MAP_KEY, JSON.stringify(safeMap));
  }

  function optionArray(options) {
    return Object.entries(options || {}).map(([name, value], position) => ({
      name,
      value: String(value),
      position
    }));
  }

  function remotePayload() {
    const items = read();
    const files = [];
    const seenPaths = new Set();

    for (const item of items) {
      for (const file of item.files || []) {
        if (!file?.path || seenPaths.has(file.path)) continue;
        seenPaths.add(file.path);
        files.push({ ...file, cartItemId: item.id });
      }
    }

    return {
      items: items.map(item => ({
        id: item.id,
        productId: item.productId || '',
        variantId: item.variantId || '',
        name: item.name || 'Item',
        qty: Math.max(1, Number(item.qty) || 1),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0),
        options: optionArray(item.options)
      })),
      files
    };
  }

  async function syncNow() {
    if (!supabase || syncing) return false;

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const user = data?.user;
    if (!user) return false;

    syncing = true;
    try {
      const payload = remotePayload();
      const { error } = await supabase.rpc('sync_active_cart', {
        p_client_reference: cartRef(),
        p_items: payload.items,
        p_files: payload.files
      });
      if (error) throw error;
      return true;
    } finally {
      syncing = false;
    }
  }

  async function hydrate() {
    if (!supabase || hydrated) return;

    const { data, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const user = data?.user;
    if (!user) return;

    hydrated = true;

    try {
      const { data: active, error: activeError } = await supabase
        .from('carts')
        .select('id,client_reference,updated_at')
        .eq('status', 'active')
        .maybeSingle();

      if (activeError) throw activeError;

      if (!active) {
        if (read().length) await syncNow();
        return;
      }

      const localTs = Date.parse(localStorage.getItem(CART_TS_KEY) || '') || 0;
      const serverTs = Date.parse(active.updated_at || '') || 0;

      if (read().length && localTs >= serverTs) {
        await syncNow();
        return;
      }

      const { data: rows, error } = await supabase.rpc('get_active_cart');
      if (error) throw error;

      const byId = new Map();
      for (const row of rows || []) {
        if (!row.item_id) continue;
        let item = byId.get(row.item_id);
        if (!item) {
          item = {
            id: row.item_id,
            productId: row.product_id || null,
            variantId: row.variant_id || null,
            name: row.product_name,
            qty: row.quantity,
            unitPrice: Number(row.unit_price),
            options: {},
            files: []
          };
          byId.set(row.item_id, item);
        }

        if (row.option_name) item.options[row.option_name] = row.option_value;
        if (row.file_id && !item.files.some(file => file.id === row.file_id)) {
          item.files.push({
            id: row.file_id,
            name: row.file_name,
            type: row.file_type,
            size: row.file_size,
            path: row.file_path,
            bucket: row.file_bucket
          });
        }
      }

      localStorage.setItem(CART_KEY, JSON.stringify([...byId.values()]));
      localStorage.setItem(REF_KEY, active.client_reference);
      localStorage.setItem(CART_TS_KEY, active.updated_at || new Date().toISOString());
      renderSafe();
      notify();
    } catch (error) {
      hydrated = false;
      console.warn('Carrinho: usando cópia local.', error);
    }
  }

  function add(item = {}) {
    const items = read();
    const pagePath = location.pathname.replace(/\/+$/, '/') || '/';
    const uploadMap = readUploads();
    const stagedFiles = Array.isArray(item.files) ? item.files : (uploadMap[pagePath] || []);

    const entry = {
      id: makeId(),
      productId: item.productId || null,
      variantId: item.variantId || null,
      name: item.name || 'Item',
      qty: Math.max(1, Math.floor(Number(item.qty) || 1)),
      unitPrice: Math.max(0, Number(item.unitPrice) || 0),
      options: item.options && typeof item.options === 'object' ? item.options : {},
      files: stagedFiles
    };

    items.push(entry);

    if (!Array.isArray(item.files) && uploadMap[pagePath]) {
      delete uploadMap[pagePath];
      saveUploads(uploadMap);
    }

    write(items);

    try {
      document.querySelector('[data-upload-list]')?.dispatchEvent(new CustomEvent('croma:uploads-consumed'));
    } catch (_) {}

    return entry;
  }

  function remove(itemId) {
    write(read().filter(item => item.id !== itemId));
  }

  function update(itemId, qty) {
    const safeQty = Math.max(1, Math.floor(Number(qty) || 1));
    write(read().map(item => item.id === itemId ? { ...item, qty: safeQty } : item));
  }

  async function clear() {
    const files = [...new Map(
      read()
        .flatMap(item => item.files || [])
        .filter(file => file?.path)
        .map(file => [file.path, file])
    ).values()];

    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(CART_TS_KEY);
    localStorage.removeItem(UPLOAD_MAP_KEY);
    localStorage.removeItem(REF_KEY);
    renderSafe();
    notify();

    if (!supabase) return;

    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return;

    await Promise.all(files.map(file => {
      return supabase.storage
        .from(file.bucket || 'croma-arquivos')
        .remove([file.path])
        .catch(() => {});
    }));

    await supabase
      .from('carts')
      .update({ status: 'cleared', updated_at: new Date().toISOString() })
      .eq('status', 'active');
  }

  function afterCheckout() {
    localStorage.removeItem(CART_KEY);
    localStorage.removeItem(CART_TS_KEY);
    localStorage.removeItem(UPLOAD_MAP_KEY);
    localStorage.removeItem(REF_KEY);
    renderSafe();
    notify();
  }

  function ensureUI() {
    if (!document.body) return false;

    let fab = document.querySelector('.croma-cart-fab');
    let panel = document.querySelector('.croma-cart-panel');
    if (fab && panel) return true;

    fab?.remove();
    panel?.remove();

    if (!document.querySelector('style[data-croma-cart-style]')) {
      const style = document.createElement('style');
      style.dataset.cromaCartStyle = '1';
      style.textContent = `
        .croma-cart-fab{position:fixed;right:18px;bottom:18px;z-index:9998;background:#30297F;color:#fff;border:0;border-radius:999px;padding:12px 16px;font-weight:900;box-shadow:0 12px 32px #0003;cursor:pointer}
        .croma-cart-panel{position:fixed;inset:0 0 0 auto;width:min(420px,94vw);z-index:9999;background:#fff;box-shadow:-16px 0 50px #0003;padding:20px;overflow:auto;display:none;color:#29263b}
        .croma-cart-panel.open{display:block}
        .croma-cart-item{border:1px solid #e7e5ee;border-radius:14px;padding:12px;margin:10px 0}
        .croma-cart-row{display:flex;justify-content:space-between;gap:12px}
        .croma-cart-checkout{display:block;background:#30297F;color:#fff;text-decoration:none;text-align:center;padding:12px;border-radius:10px;font-weight:900;margin-top:14px}
        .croma-cart-muted{color:#716d80;font-size:.82rem}
        .croma-cart-files{font-size:.78rem;color:#5d5870;margin-top:7px}
      `;
      document.head.appendChild(style);
    }

    document.body.insertAdjacentHTML('beforeend', `
      <button class="croma-cart-fab" type="button">Carrinho <span data-cart-count>0</span></button>
      <aside class="croma-cart-panel" aria-label="Carrinho">
        <div class="croma-cart-row"><strong>Seu carrinho</strong><button type="button" data-cart-close>Fechar</button></div>
        <p class="croma-cart-muted">O carrinho permanece neste aparelho. Ao entrar na sua conta, também fica disponível nos seus outros dispositivos.</p>
        <div data-cart-items></div>
        <div class="croma-cart-row"><strong>Total</strong><strong data-cart-total>R$ 0,00</strong></div>
        <a class="croma-cart-checkout" href="/carrinho/">Finalizar pedido</a>
        <button type="button" data-cart-clear style="width:100%;margin-top:8px">Limpar carrinho</button>
      </aside>
    `);

    fab = document.querySelector('.croma-cart-fab');
    panel = document.querySelector('.croma-cart-panel');

    fab?.addEventListener('click', () => panel?.classList.add('open'));
    document.querySelector('[data-cart-close]')?.addEventListener('click', () => panel?.classList.remove('open'));
    document.querySelector('[data-cart-clear]')?.addEventListener('click', () => {
      if (confirm('Limpar todos os itens e arquivos deste carrinho?')) clear();
    });
    document.querySelector('[data-cart-items]')?.addEventListener('click', event => {
      const button = event.target.closest('[data-remove]');
      if (button) remove(button.dataset.remove);
    });

    return Boolean(fab && panel);
  }

  function render() {
    const items = read();
    if (!ensureUI()) return;

    document.querySelectorAll('[data-cart-count]').forEach(element => {
      element.textContent = String(count());
    });

    document.querySelectorAll('[data-cart-total]').forEach(element => {
      element.textContent = money(total());
    });

    const box = document.querySelector('[data-cart-items]');
    if (!box) return;

    box.innerHTML = items.length
      ? items.map(item => `
          <div class="croma-cart-item">
            <div class="croma-cart-row">
              <strong>${esc(item.name)}</strong>
              <button type="button" data-remove="${esc(item.id)}">×</button>
            </div>
            <div class="croma-cart-muted">${esc(Object.entries(item.options || {}).map(([key, value]) => `${key}: ${value}`).join(' · '))}</div>
            <div>${item.qty} × ${money(item.unitPrice)}</div>
            ${item.files?.length ? `<div class="croma-cart-files">Arquivos: ${item.files.map(file => esc(file.name)).join(', ')}</div>` : ''}
          </div>
        `).join('')
      : '<p class="croma-cart-muted">Seu carrinho está vazio.</p>';
  }

  function renderSafe() {
    try {
      render();
    } catch (error) {
      console.warn('Carrinho: falha apenas na interface visual.', error);
    }
  }

  function injectUploader() {
    if (!location.pathname.startsWith('/servicos/') || document.querySelector('[data-croma-uploader]')) return;

    const host = document.querySelector('[data-croma-upload-host],.config,.config-drawer,.product-head');
    if (!host) return;

    const wrap = document.createElement('section');
    wrap.dataset.cromaUploader = '1';
    wrap.style.cssText = 'margin:18px 0;padding:16px;border:1px solid #dedbe9;border-radius:14px;background:#fff';
    wrap.innerHTML = `
      <strong>Arquivos do pedido</strong>
      <p style="margin:6px 0;color:#716d80;font-size:.84rem">Opcional. Até 50 MB por arquivo. O envio exige login para manter o arquivo privado e recuperável.</p>
      <input type="file" multiple data-upload-input>
      <div data-upload-list style="font-size:.82rem;margin-top:8px"></div>
    `;
    host.appendChild(wrap);

    const input = wrap.querySelector('[data-upload-input]');
    const list = wrap.querySelector('[data-upload-list]');
    const pagePath = location.pathname.replace(/\/+$/, '/') || '/';

    const draw = () => {
      const files = readUploads()[pagePath] || [];
      list.innerHTML = files.length
        ? files.map(file => `
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin:6px 0">
              <span>${esc(file.name)}</span>
              <button type="button" data-upload-remove="${esc(file.id)}">Remover</button>
            </div>
          `).join('')
        : 'Nenhum arquivo enviado.';
    };

    list.addEventListener('croma:uploads-consumed', draw);
    list.addEventListener('click', async event => {
      const button = event.target.closest('[data-upload-remove]');
      if (!button) return;

      const map = readUploads();
      const files = map[pagePath] || [];
      const file = files.find(item => item.id === button.dataset.uploadRemove);
      map[pagePath] = files.filter(item => item.id !== button.dataset.uploadRemove);
      if (!map[pagePath].length) delete map[pagePath];
      saveUploads(map);

      if (file?.path && supabase) {
        await supabase.storage.from(file.bucket || 'croma-arquivos').remove([file.path]).catch(() => {});
      }

      draw();
      scheduleSync();
    });

    input.addEventListener('change', async () => {
      if (!supabase) {
        alert('Aguarde o carregamento da conta.');
        return;
      }

      const { data } = await supabase.auth.getUser();
      const user = data?.user;
      if (!user) {
        alert('Entre na sua conta antes de enviar arquivos.');
        return;
      }

      const map = readUploads();
      const staged = map[pagePath] || [];

      for (const file of input.files || []) {
        if (file.size > MAX_FILE_SIZE) {
          alert(`${file.name}: arquivo maior que 50 MB.`);
          continue;
        }

        const safeName = file.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9._-]/g, '-');

        const storagePath = `clientes/${user.id}/rascunhos/${cartRef()}/${Date.now()}-${makeId().slice(0, 6)}-${safeName}`;
        const { error } = await supabase.storage
          .from('croma-arquivos')
          .upload(storagePath, file, { upsert: false });

        if (error) {
          alert(`Não foi possível enviar ${file.name}.`);
          continue;
        }

        staged.push({
          id: makeId(),
          name: file.name,
          type: file.type,
          size: file.size,
          path: storagePath,
          bucket: 'croma-arquivos'
        });
      }

      map[pagePath] = staged;
      saveUploads(map);
      draw();
      scheduleSync();
      input.value = '';
    });

    draw();
  }

  const api = {
    __version: '20260912-3',
    read,
    add,
    remove,
    update,
    clear,
    count,
    total,
    syncNow,
    afterCheckout,
    cartRef
  };

  window.CromaCart = api;

  const boot = () => {
    renderSafe();
    try {
      injectUploader();
    } catch (error) {
      console.warn('Carrinho: upload auxiliar indisponível.', error);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  import('/js/croma-supabase.js?v=20260821-2')
    .then(module => {
      supabase = module.supabase;
      hydrate().catch(error => console.warn('Carrinho: não foi possível hidratar.', error));
      supabase.auth.onAuthStateChange(() => {
        hydrated = false;
        setTimeout(() => hydrate().catch(error => console.warn('Carrinho: não foi possível hidratar.', error)), 0);
      });
    })
    .catch(error => console.warn('Carrinho: sincronização de conta indisponível.', error));
})();
