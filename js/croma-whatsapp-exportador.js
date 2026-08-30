(function () {
  "use strict";

  const APP_ID = "croma-wa-exportador-v1";
  const STYLE_ID = APP_ID + "-style";
  const VERSION = "1.4.0";
  const ATTACHMENT_LIMIT = 250;
  const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;
  const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
  const PANEL_STORAGE_KEY = "croma-wa-exportador-layout-v1";

  if (!/^(web\.)?whatsapp\.com$/i.test(location.hostname)) {
    alert("Abra o WhatsApp Web antes de executar o Exportador Croma.");
    return;
  }

  const existing = document.getElementById(APP_ID);
  if (existing) {
    existing.hidden = !existing.hidden;
    return;
  }

  function clean(value) {
    return String(value || "")
      .replace(/\u200e|\u200f|\u202a|\u202b|\u202c|\u202d|\u202e/g, "")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function unique(values) {
    return [...new Set(values.map(clean).filter(Boolean))];
  }

  function csvCell(value) {
    return '"' + String(value == null ? "" : value).replace(/"/g, '""') + '"';
  }

  function toCsv(rows, columns) {
    const header = columns.map((column) => csvCell(column.label)).join(",");
    const body = rows.map((row) => columns.map((column) => csvCell(row[column.key])).join(","));
    return "\uFEFF" + [header, ...body].join("\r\n");
  }

  function safeFileName(value) {
    return clean(value || "conversa")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:\"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80)
      .trim() || "conversa";
  }

  function privacy(value) {
    return String(value == null ? "" : value);
  }

  function toast(message, isError) {
    statusBox.textContent = message;
    statusBox.dataset.error = isError ? "1" : "0";
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => {
      statusBox.textContent = "Pronto para extrair.";
      statusBox.dataset.error = "0";
    }, 5000);
  }

  function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType + ";charset=utf-8" });
    downloadBlob(blob, fileName);
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.dataset.cromaInternalDownload = "1";
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function extensionForMime(mimeType) {
    const normalized = String(mimeType || "").split(";")[0].toLowerCase();
    const extensions = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "audio/mpeg": "mp3",
      "audio/mp4": "m4a",
      "audio/ogg": "ogg",
      "audio/wav": "wav"
    };
    return extensions[normalized] || (normalized.includes("/") ? normalized.split("/")[1].replace(/[^a-z0-9]/g, "") : "") || "bin";
  }

  function messageRoots(main) {
    const roots = [...main.querySelectorAll("[data-pre-plain-text]")].map((metaElement) =>
      metaElement.closest("[data-id]") || metaElement.closest(".message-in, .message-out") || metaElement.parentElement
    );
    return [...new Set(roots.filter(Boolean))];
  }

  function fileNameFromRoot(root, fallbackIndex, extension) {
    const filePattern = /[^\n<>:"/\\|?*]+\.(?:pdf|docx?|xlsx?|pptx?|cdr|ai|eps|psd|svg|zip|rar|7z|txt|csv|jpe?g|png|webp|gif|mp3|m4a|ogg|wav|mp4|mov|avi)\b/gi;
    const names = clean(root.innerText).match(filePattern) || [];
    if (names.length) return safeFileName(names[0]);
    return safeFileName("WhatsApp - anexo " + String(fallbackIndex).padStart(2, "0")) + "." + extension;
  }

  function visible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function mediaDrawerScope() {
    const main = document.querySelector("#main");
    const pane = document.querySelector("#pane-side");
    const markerPattern = /(?:m[ií]dia(?:s)?(?:,?\s*links?\s*e\s*(?:docs?|documentos?))?|media(?:,?\s*links?\s*(?:and|e)\s*(?:docs?|documents?))?|^documentos?$|^docs?$)/i;
    const markers = [...document.querySelectorAll('[role="tab"], button, [role="button"], [aria-label], [title], span')]
      .filter((element) => {
        if (!visible(element)) return false;
        const text = clean(element.getAttribute("aria-label") || element.getAttribute("title") || element.innerText);
        return text.length > 0 && text.length < 100 && markerPattern.test(text);
      });
    const candidates = [];
    markers.forEach((marker) => {
      let node = marker.parentElement;
      for (let depth = 0; node && node !== document.body && depth < 12; depth += 1, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        const text = clean(node.innerText);
        const hasMediaContent = node.querySelector("img[src], video, audio, canvas, [data-icon*=download], [aria-label*=download i], [aria-label*=baixar i]");
        if (rect.width >= 260 && rect.width <= window.innerWidth * 0.95 && rect.height >= 260 && (markerPattern.test(text) || hasMediaContent)) {
          if ((!main || !node.contains(main)) && (!pane || !node.contains(pane))) candidates.push(node);
          break;
        }
      }
    });
    [...document.querySelectorAll('[role="dialog"], aside, [data-animate-drawer], [data-testid*=drawer i], [data-testid*=media i]')]
      .filter((node) => visible(node) && (!main || !node.contains(main)) && (!pane || !node.contains(pane)))
      .forEach((node) => {
        const text = clean(node.innerText);
        if (markerPattern.test(text) || node.querySelector("img[src], video, audio, canvas, [data-icon*=download]")) candidates.push(node);
      });
    return candidates.sort((first, second) => {
      const a = first.getBoundingClientRect();
      const b = second.getBoundingClientRect();
      return (a.width * a.height) - (b.width * b.height);
    })[0] || null;
  }

  function currentAttachmentScopes() {
    const main = document.querySelector("#main");
    if (!main) throw new Error("Abra uma conversa antes de coletar os anexos.");
    const roots = messageRoots(main);
    const drawer = mediaDrawerScope();
    if (drawer) roots.push(drawer);
    return [...new Set(roots)];
  }

  function attachmentSourcesOnScreen() {
    const seen = new Set(state.collectedUrls);
    const scopes = currentAttachmentScopes();
    const elements = scopes.flatMap((scope) => [...scope.querySelectorAll("img[src], video[src], audio[src], source[src], a[href], [style], canvas")]);
    const descriptors = elements.flatMap((element) => {
      if (element.tagName === "CANVAS") return [{ element, kind: "canvas", url: "canvas:" + element.width + "x" + element.height + ":" + elements.indexOf(element) }];
      const directUrl = element.currentSrc || element.getAttribute("src") || element.getAttribute("href") || "";
      const background = getComputedStyle(element).backgroundImage || "";
      const backgroundMatch = background.match(/url\(["']?([^"')]+)["']?\)/i);
      return [directUrl, backgroundMatch ? backgroundMatch[1] : ""].filter(Boolean).map((url) => ({ element, kind: "url", url }));
    });
    return descriptors
      .filter(({ element }) => !element.closest("#" + APP_ID) && !element.closest("#pane-side, header") && visible(element))
      .filter(({ element, kind, url }) => {
        if (seen.has(url)) {
          if (state.captureActive) state.captureStats.duplicates += 1;
          return false;
        }
        if (kind === "url" && !/^(?:blob:|data:|https:)/i.test(url)) return false;
        if (/^https:/i.test(url) && !/(?:whatsapp\.net|fbcdn\.net|whatsapp\.com)/i.test(url)) return false;
        if (/\bpps\.whatsapp\.net\b/i.test(url)) return false;
        if (element.tagName === "IMG" || element.tagName === "CANVAS") {
          const width = element.naturalWidth || element.clientWidth;
          const height = element.naturalHeight || element.clientHeight;
          const description = [element.alt, element.getAttribute("aria-label"), element.getAttribute("title")].filter(Boolean).join(" ");
          if (width < 64 || height < 64 || /(emoji|avatar|foto do perfil|profile photo|imagem do perfil|contact photo)/i.test(description)) return false;
        }
        seen.add(url);
        return true;
      });
  }

  function archiveFolder(blob, fileName) {
    const type = String(blob.type || "").toLowerCase();
    if (/^(?:image|video|audio)\//.test(type) || /\.(?:jpe?g|png|webp|gif|mp4|mov|avi|mp3|m4a|ogg|wav)$/i.test(fileName)) return "midias";
    return "documentos";
  }

  function uniqueArchivePath(folder, fileName) {
    const cleanName = safeFileName(fileName);
    let path = folder + "/" + cleanName;
    let index = 2;
    while (state.collectedFiles.has(path)) {
      const dot = cleanName.lastIndexOf(".");
      const base = dot > 0 ? cleanName.slice(0, dot) : cleanName;
      const extension = dot > 0 ? cleanName.slice(dot) : "";
      path = folder + "/" + base + " (" + index + ")" + extension;
      index += 1;
    }
    return path;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas sem conteúdo acessível.")), "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  async function sourceBlob(source) {
    if (source.kind === "canvas") return canvasToBlob(source.element);
    if (state.generatedBlobs.has(source.url)) return state.generatedBlobs.get(source.url);
    const response = await fetch(source.url, { credentials: "include" });
    if (!response.ok) throw new Error("Falha ao ler o anexo.");
    return response.blob();
  }

  function storeCollectedBlob(blob, element, sourceKey, preferredName) {
    const collectedBytes = [...state.collectedFiles.values()].reduce((total, file) => total + file.blob.size, 0);
    if (!blob || !blob.size || blob.size > MAX_ATTACHMENT_BYTES || collectedBytes + blob.size > MAX_ARCHIVE_BYTES) {
      state.captureStats.skipped += 1;
      return false;
    }
    const extension = extensionForMime(blob.type || (element && element.tagName === "IMG" ? "image/jpeg" : ""));
    const root = element ? sourceRoot(element) : document.querySelector("#main");
    const name = safeFileName(preferredName || fileNameFromRoot(root, state.collectedFiles.size + 1, extension));
    const folder = archiveFolder(blob, name);
    const path = uniqueArchivePath(folder, name.includes(".") ? name : name + "." + extension);
    state.collectedFiles.set(path, { path, folder, blob });
    if (sourceKey) state.collectedUrls.add(sourceKey);
    state.captureStats.added += 1;
    updateCollector();
    return true;
  }

  function sourceRoot(element) {
    return element.closest("[data-id], [role=listitem], [role=row]") || element.parentElement || document.body;
  }

  function updateCollector() {
    if (!collectorCount) return;
    const files = [...state.collectedFiles.values()];
    const media = files.filter((file) => file.folder === "midias").length;
    const documents = files.filter((file) => file.folder === "documentos").length;
    const chat = state.collectionChatName ? state.collectionChatName + " · " : "";
    collectorCount.textContent = chat + media + " mídia(s) · " + documents + " documento(s) coletado(s)";
    if (collectorStats) collectorStats.textContent = state.captureStats.added + " coletado(s) · " + state.captureStats.duplicates + " duplicado(s) · " + state.captureStats.failed + " falha(s) · " + state.captureStats.skipped + " ignorado(s)";
  }

  function currentChatCollection() {
    const chat = getChatHeader();
    const key = [chat.name, chat.phone, chat.details].map(clean).join("|");
    return { key, name: chat.name || chat.phone || "Conversa atual" };
  }

  function bindCollectionToCurrentChat() {
    const chat = currentChatCollection();
    const changed = Boolean(state.collectionChatKey && state.collectionChatKey !== chat.key);
    if (changed) {
      state.collectedFiles.clear();
      state.collectedUrls.clear();
      state.generatedBlobs.clear();
      state.captureStats = { found: 0, added: 0, duplicates: 0, failed: 0, skipped: 0 };
    }
    state.collectionChatKey = chat.key;
    state.collectionChatName = chat.name;
    updateCollector();
    return changed;
  }

  async function collectCurrentAttachments(options) {
    const settings = options || {};
    if (state.collecting) return 0;
    state.collecting = true;
    const changedConversation = bindCollectionToCurrentChat();
    try {
      const sources = attachmentSourcesOnScreen().slice(0, Math.max(0, ATTACHMENT_LIMIT - state.collectedFiles.size));
      state.captureStats.found += sources.length;
      let added = 0;
      for (let index = 0; index < sources.length; index += 1) {
        const source = sources[index];
        try {
          if (!settings.silent) toast("Coletando anexo " + (index + 1) + " de " + sources.length + "…");
          const blob = await sourceBlob(source);
          if (storeCollectedBlob(blob, source.element, source.url, "")) added += 1;
        } catch (error) {
          state.captureStats.failed += 1;
        }
      }
      updateCollector();
      if (!added && !settings.silent) throw new Error("Nenhum arquivo novo foi encontrado. Abra a galeria, role ou clique no download do documento e tente novamente.");
      if (added && !settings.silent) toast((changedConversation ? "A conversa mudou e a coleta anterior foi limpa. " : "") + added + " novo(s) anexo(s) adicionado(s) desta conversa.");
      return added;
    } finally {
      state.collecting = false;
    }
  }

  async function captureDownloadAnchor(anchor) {
    if (!state.captureActive || !anchor || anchor.dataset.cromaInternalDownload === "1") return;
    const href = anchor.href || anchor.getAttribute("href") || "";
    if (!/^(?:blob:|data:|https:)/i.test(href)) return;
    let belongsToCurrentConversation = false;
    try {
      belongsToCurrentConversation = currentAttachmentScopes().some((scope) => scope.contains(anchor));
    } catch (error) {
      return;
    }
    const generatedDownload = Boolean(anchor.download) && /^(?:blob:|data:)/i.test(href) && state.generatedBlobs.has(href);
    if (!belongsToCurrentConversation && !generatedDownload) return;
    if (state.collectedUrls.has(href)) {
      state.captureStats.duplicates += 1;
      updateCollector();
      return;
    }
    try {
      bindCollectionToCurrentChat();
      const blob = state.generatedBlobs.get(href) || await fetch(href, { credentials: "include" }).then((response) => {
        if (!response.ok) throw new Error("Download inacessível.");
        return response.blob();
      });
      storeCollectedBlob(blob, anchor, href, anchor.download || "");
    } catch (error) {
      state.captureStats.failed += 1;
      updateCollector();
    }
  }

  function littleEndian(value, bytes) {
    const result = new Uint8Array(bytes);
    for (let index = 0; index < bytes; index += 1) result[index] = (value >>> (index * 8)) & 255;
    return result;
  }

  function joinBytes(parts) {
    const size = parts.reduce((total, part) => total + part.length, 0);
    const result = new Uint8Array(size);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let number = 0; number < 256; number += 1) {
      let crc = number;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
      table[number] = crc >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 255] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  async function createZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    for (const file of files) {
      const name = encoder.encode(file.path.replace(/^\/+/, ""));
      const data = new Uint8Array(await file.blob.arrayBuffer());
      const checksum = crc32(data);
      const localHeader = joinBytes([
        littleEndian(0x04034b50, 4), littleEndian(20, 2), littleEndian(0, 2), littleEndian(0, 2),
        littleEndian(0, 2), littleEndian(0, 2), littleEndian(checksum, 4), littleEndian(data.length, 4),
        littleEndian(data.length, 4), littleEndian(name.length, 2), littleEndian(0, 2), name
      ]);
      localParts.push(localHeader, data);
      centralParts.push(joinBytes([
        littleEndian(0x02014b50, 4), littleEndian(20, 2), littleEndian(20, 2), littleEndian(0, 2),
        littleEndian(0, 2), littleEndian(0, 2), littleEndian(0, 2), littleEndian(checksum, 4),
        littleEndian(data.length, 4), littleEndian(data.length, 4), littleEndian(name.length, 2),
        littleEndian(0, 2), littleEndian(0, 2), littleEndian(0, 2), littleEndian(0, 2),
        littleEndian(0, 4), littleEndian(offset, 4), name
      ]));
      offset += localHeader.length + data.length;
    }
    const central = joinBytes(centralParts);
    const end = joinBytes([
      littleEndian(0x06054b50, 4), littleEndian(0, 2), littleEndian(0, 2), littleEndian(files.length, 2),
      littleEndian(files.length, 2), littleEndian(central.length, 4), littleEndian(offset, 4), littleEndian(0, 2)
    ]);
    return new Blob([...localParts, central, end], { type: "application/zip" });
  }

  async function generateMediaZip() {
    const chat = currentChatCollection();
    if (state.collectionChatKey && state.collectionChatKey !== chat.key) {
      state.collectedFiles.clear();
      state.collectedUrls.clear();
      state.generatedBlobs.clear();
      state.collectionChatKey = chat.key;
      state.collectionChatName = chat.name;
      state.captureStats = { found: 0, added: 0, duplicates: 0, failed: 0, skipped: 0 };
      updateCollector();
      throw new Error("A conversa aberta mudou. A coleta anterior foi limpa; colete os anexos desta conversa antes de gerar o ZIP.");
    }
    if (!state.collectionChatKey) bindCollectionToCurrentChat();
    await collectCurrentAttachments({ silent: true });
    stopCaptureMode();
    const data = extractOpenChat();
    const textBlob = new Blob([conversationText(data)], { type: "text/plain;charset=utf-8" });
    const files = [{ path: "texto/conversa.txt", blob: textBlob }, ...state.collectedFiles.values()];
    toast("Montando o arquivo ZIP com " + files.length + " item(ns)…");
    const zip = await createZip(files);
    downloadBlob(zip, currentBaseName(data) + " - completo.zip");
    toast("ZIP criado com texto, mídias e documentos coletados.");
  }

  function clearCollectedAttachments() {
    state.collectedFiles.clear();
    state.collectedUrls.clear();
    state.generatedBlobs.clear();
    state.collectionChatKey = "";
    state.collectionChatName = "";
    state.captureStats = { found: 0, added: 0, duplicates: 0, failed: 0, skipped: 0 };
    updateCollector();
    toast("Coleta de anexos limpa.");
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      if (!document.execCommand("copy")) throw error;
      area.remove();
    }
  }

  function getChatHeader() {
    const main = document.querySelector("#main");
    if (!main) throw new Error("Abra uma conversa antes de extrair.");
    const header = main.querySelector("header");
    const titled = header
      ? [...header.querySelectorAll("[title]")]
          .map((element) => clean(element.getAttribute("title")))
          .filter((value) => value && !/^(menu|pesquisar|search|mais|more|voltar|back)$/i.test(value))
      : [];
    const lines = header ? clean(header.innerText).split("\n").map(clean).filter(Boolean) : [];
    const name = titled[0] || lines[0] || "Conversa";
    const details = unique([...titled.slice(1), ...lines.filter((line) => line !== name)]).join(" | ");
    const phoneMatch = (name + " " + details).match(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/);
    return { name, phone: phoneMatch ? phoneMatch[0] : "", details };
  }

  function parsePrePlainText(value) {
    const raw = clean(value);
    const closing = raw.indexOf("]");
    const inside = closing > 0 ? raw.slice(1, closing) : "";
    const author = closing > -1 ? raw.slice(closing + 1).replace(/:\s*$/, "").trim() : "";
    const comma = inside.indexOf(",");
    return {
      raw,
      time: comma > -1 ? clean(inside.slice(0, comma)) : "",
      date: comma > -1 ? clean(inside.slice(comma + 1)) : "",
      author
    };
  }

  function messageDirection(root) {
    const outgoing = root.closest(".message-out") || root.querySelector(".message-out");
    const incoming = root.closest(".message-in") || root.querySelector(".message-in");
    if (outgoing) return "enviada";
    if (incoming) return "recebida";
    return "indefinida";
  }

  function extractMessageText(root, metaElement) {
    const textNodes = [...root.querySelectorAll("span.selectable-text.copyable-text")];
    const texts = unique(textNodes.map((node) => node.innerText));
    let text = texts.length ? texts[texts.length - 1] : "";
    let quotedText = "";
    if (texts.length > 1) quotedText = texts.slice(0, -1).join(" | ");
    if (!text && metaElement) text = clean(metaElement.innerText);
    return { text, quotedText };
  }

  function extractMedia(root) {
    const labels = unique(
      [...root.querySelectorAll("[aria-label], [title]")].flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title")
      ])
    );
    const mediaPattern = /(imagem|image|foto|photo|vídeo|video|áudio|audio|mensagem de voz|voice message|documento|document|figurinha|sticker|gif|contato|contact|localização|location|enquete|poll)/i;
    const types = labels.filter((label) => mediaPattern.test(label));
    if (root.querySelector("video")) types.push("vídeo");
    if (root.querySelector("audio")) types.push("áudio");
    if (root.querySelector("img") && !types.length) types.push("imagem/figurinha");
    const filePattern = /[^\n<>:"/\\|?*]+\.(?:pdf|docx?|xlsx?|pptx?|cdr|ai|eps|psd|svg|zip|rar|7z|txt|csv|jpe?g|png|webp|gif|mp3|m4a|ogg|wav|mp4|mov|avi)\b/gi;
    const files = unique(clean(root.innerText).match(filePattern) || []);
    const duration = unique((clean(root.innerText).match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g) || []).filter((value) => !/^\d{1,2}:\d{2}$/.test(value) || root.querySelector("audio,video")));
    return { types: unique(types).join(" | "), files: files.join(" | "), duration: duration.join(" | ") };
  }

  function extractOpenChat() {
    const main = document.querySelector("#main");
    if (!main) throw new Error("Abra uma conversa antes de extrair.");
    const header = getChatHeader();
    const metaElements = [...main.querySelectorAll("[data-pre-plain-text]")];
    if (!metaElements.length) throw new Error("Nenhuma mensagem carregada foi encontrada. Abra a conversa e role o histórico.");
    const seen = new Set();
    let messages = [];

    metaElements.forEach((metaElement, index) => {
      const root = metaElement.closest("[data-id]") || metaElement.closest(".message-in, .message-out") || metaElement.parentElement;
      if (!root) return;
      const dataId = root.getAttribute("data-id") || "";
      const meta = parsePrePlainText(metaElement.getAttribute("data-pre-plain-text"));
      const extractedText = extractMessageText(root, metaElement);
      const signature = dataId || [meta.raw, extractedText.text, index].join("|");
      if (seen.has(signature)) return;
      seen.add(signature);
      const media = extractMedia(root);
      messages.push({
        sequence: messages.length + 1,
        id: dataId,
        date: meta.date,
        time: meta.time,
        author: meta.author || (messageDirection(root) === "enviada" ? "Croma" : header.name),
        direction: messageDirection(root),
        text: extractedText.text,
        quotedText: extractedText.quotedText,
        mediaTypes: media.types,
        fileNames: media.files,
        duration: media.duration,
        rawMetadata: meta.raw
      });
    });

    messages = messages.map((message, index) => ({ ...message, sequence: index + 1 }));
    return {
      exporter: "Exportador Croma para WhatsApp Web",
      version: VERSION,
      extractedAt: new Date().toISOString(),
      note: "Somente mensagens que estavam carregadas no navegador.",
      chat: header,
      count: messages.length,
      messages
    };
  }

  function conversationText(data) {
    const chatName = privacy(data.chat.name);
    const chatPhone = privacy(data.chat.phone);
    const details = privacy(data.chat.details);
    const lines = [
      "ATENDIMENTO DO WHATSAPP",
      "Contato: " + chatName,
      chatPhone ? "Telefone: " + chatPhone : "",
      details ? "Detalhes: " + details : "",
      "Extraído em: " + new Date(data.extractedAt).toLocaleString("pt-BR"),
      "Mensagens carregadas: " + data.count,
      "Observação: " + data.note,
      ""
    ].filter((line) => line !== "");

    data.messages.forEach((message) => {
      const direction = message.direction === "enviada" ? "CROMA" : privacy(message.author || "CLIENTE");
      const stamp = [message.date, message.time].filter(Boolean).join(" ");
      lines.push("[" + stamp + "] " + direction + " — " + message.direction.toUpperCase());
      if (message.quotedText) lines.push("Respondendo a: “" + privacy(message.quotedText) + "”");
      if (message.text) lines.push(privacy(message.text));
      if (message.mediaTypes) lines.push("[Mídia: " + privacy(message.mediaTypes) + "]");
      if (message.fileNames) lines.push("[Arquivo: " + privacy(message.fileNames) + "]");
      if (message.duration) lines.push("[Duração: " + message.duration + "]");
      if (!message.text && !message.mediaTypes && !message.fileNames) lines.push("[Mensagem sem texto identificável]");
      lines.push("");
    });
    return lines.join("\n").trim() + "\n";
  }

  function conversationCsv(data) {
    const rows = data.messages.map((message) => ({
      sequencia: message.sequence,
      data: message.date,
      hora: message.time,
      autor: privacy(message.author),
      direcao: message.direction,
      texto: privacy(message.text),
      resposta_citada: privacy(message.quotedText),
      midia: privacy(message.mediaTypes),
      arquivos: privacy(message.fileNames),
      duracao: message.duration,
      reacoes: privacy(message.reactions),
      status: privacy(message.deliveryStatus)
    }));
    return toCsv(rows, [
      { key: "sequencia", label: "Sequência" },
      { key: "data", label: "Data" },
      { key: "hora", label: "Hora" },
      { key: "autor", label: "Autor" },
      { key: "direcao", label: "Direção" },
      { key: "texto", label: "Texto" },
      { key: "resposta_citada", label: "Resposta citada" },
      { key: "midia", label: "Mídia" },
      { key: "arquivos", label: "Arquivos" },
      { key: "duracao", label: "Duração" },
      { key: "reacoes", label: "Reações" },
      { key: "status", label: "Status" }
    ]);
  }

  function privateJson(data) {
    const copy = JSON.parse(JSON.stringify(data));
    copy.chat.name = privacy(copy.chat.name);
    copy.chat.phone = privacy(copy.chat.phone);
    copy.chat.details = privacy(copy.chat.details);
    copy.messages = copy.messages.map((message) => {
      Object.keys(message).forEach((key) => {
        if (typeof message[key] === "string") message[key] = privacy(message[key]);
      });
      return message;
    });
    return JSON.stringify(copy, null, 2);
  }

  function extractSidebar() {
    const pane = document.querySelector("#pane-side");
    if (!pane) throw new Error("A lista lateral de conversas não foi encontrada.");
    const rows = [...pane.querySelectorAll('[role="row"]')];
    const seen = new Set();
    const chats = [];
    rows.forEach((row) => {
      const lines = clean(row.innerText).split("\n").map(clean).filter(Boolean);
      const titled = [...row.querySelectorAll("[title]")].map((element) => clean(element.getAttribute("title"))).filter(Boolean);
      const name = titled[0] || lines[0] || "";
      if (!name || seen.has(name + "|" + lines.join("|"))) return;
      seen.add(name + "|" + lines.join("|"));
      const time = lines.find((line) => /^(?:\d{1,2}:\d{2}|ontem|yesterday|segunda|terça|quarta|quinta|sexta|sábado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(line)) || "";
      const aria = unique([...row.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label"))).join(" | ");
      const unreadMatch = aria.match(/(\d+)\s+(?:mensagens? não lidas?|unread messages?)/i);
      const phoneMatch = name.match(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/);
      chats.push({
        name: privacy(name),
        phone: privacy(phoneMatch ? phoneMatch[0] : ""),
        time,
        preview: privacy(lines.filter((line) => line !== name && line !== time).join(" | ")),
        unread: unreadMatch ? unreadMatch[1] : "",
        markers: privacy(aria)
      });
    });
    if (!chats.length) throw new Error("Nenhuma conversa carregada foi encontrada na lista lateral.");
    return chats;
  }

  function sidebarCsv(rows) {
    return toCsv(rows, [
      { key: "name", label: "Nome" },
      { key: "phone", label: "Telefone" },
      { key: "time", label: "Horário/Data" },
      { key: "preview", label: "Prévia carregada" },
      { key: "unread", label: "Não lidas" },
      { key: "markers", label: "Marcadores visíveis" }
    ]);
  }

  function currentBaseName(data) {
    const date = new Date().toISOString().slice(0, 10);
    return safeFileName("WhatsApp - " + privacy(data.chat.name) + " - " + date);
  }

  function consultAI() {
    const data = extractOpenChat();
    const target = window.open("https://www.cromapel.com.br/interno/whatsapp-lab/?receber=whatsapp", "croma-whatsapp-lab");
    if (!target) throw new Error("O navegador bloqueou a abertura do laboratório. Permita pop-ups e tente novamente.");
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      try {
        target.postMessage({ type: "croma-whatsapp-import", payload: data }, "https://www.cromapel.com.br");
      } catch (error) {
        // A nova aba pode ainda estar carregando ou redirecionando para o login.
      }
      if (attempts >= 20 || target.closed) clearInterval(timer);
    }, 750);
    toast("Conversa enviada para o Laboratório Croma. Continue na nova aba para consultar a IA.");
  }

  async function run(action) {
    try {
      if (action === "ai") {
        consultAI();
        return;
      }
      if (action === "media") {
        collector.hidden = !collector.hidden;
        if (!collector.hidden) {
          const changed = bindCollectionToCurrentChat();
          if (changed) toast("A conversa mudou e a coleta anterior foi limpa.");
          startCaptureMode();
        } else {
          stopCaptureMode();
        }
        return;
      }
      const data = extractOpenChat();
      const baseName = currentBaseName(data);
      if (action === "txt") {
        downloadFile(conversationText(data), baseName + ".txt", "text/plain");
        toast(data.count + " mensagens salvas em TXT.");
      }
    } catch (error) {
      toast(error && error.message ? error.message : "Não foi possível extrair.", true);
    }
  }

  const state = {
    collectedFiles: new Map(),
    collectedUrls: new Set(),
    generatedBlobs: new Map(),
    collectionChatKey: "",
    collectionChatName: "",
    captureActive: false,
    collecting: false,
    captureStats: { found: 0, added: 0, duplicates: 0, failed: 0, skipped: 0 }
  };

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${APP_ID}{position:fixed;right:16px;top:58px;width:360px;height:520px;min-width:300px;min-height:360px;max-width:92vw;max-height:90vh;resize:both;z-index:2147483647;background:#f8faf9;color:#17201c;border:1px solid #ccd7d1;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-family:Arial,sans-serif;font-size:14px;overflow:hidden}
    #${APP_ID}::after{content:"";position:absolute;right:3px;bottom:3px;width:13px;height:13px;pointer-events:none;background:repeating-linear-gradient(135deg,transparent 0 3px,#6d7d76 3px 4px);opacity:.7}
    #${APP_ID} *{box-sizing:border-box}
    #${APP_ID} header{display:flex;align-items:center;justify-content:space-between;height:48px;padding:10px 12px;background:#075e54;color:#fff;cursor:move;user-select:none;touch-action:none}
    #${APP_ID} header strong{font-size:15px}
    #${APP_ID} .croma-drag{font-size:18px;letter-spacing:-3px;opacity:.75;margin-left:auto;margin-right:10px}
    #${APP_ID} .croma-header-actions{display:flex;align-items:center;gap:5px}
    #${APP_ID} header button{display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:rgba(255,255,255,.12);color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0}
    #${APP_ID} header button:hover{background:rgba(255,255,255,.24)}
    #${APP_ID} header [data-action="ai"]{font-size:15px}
    #${APP_ID} .croma-body{height:calc(100% - 48px);padding:13px 14px 20px;overflow:auto}
    #${APP_ID} .croma-scope{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 10px;border:1px solid #cbd9d2;border-radius:9px;background:#fff;color:#52625b;font-size:12px}
    #${APP_ID} .croma-scope strong{color:#175c49}
    #${APP_ID} .croma-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    #${APP_ID} .croma-action{border:0;border-radius:9px;padding:10px 8px;background:#128c7e;color:#fff;font-weight:700;cursor:pointer}
    #${APP_ID} .croma-action:hover{background:#0d7468}
    #${APP_ID} .croma-secondary{background:#e4ece8;color:#173e35}
    #${APP_ID} .croma-secondary:hover{background:#d1ded8}
    #${APP_ID} .croma-action:disabled{opacity:.58;cursor:wait}
    #${APP_ID} .croma-collector{margin-top:10px;padding:10px;border:1px solid #cbd9d2;border-radius:10px;background:#fff}
    #${APP_ID} .croma-collector[hidden]{display:none}
    #${APP_ID} .croma-collector p{margin:0 0 8px;font-size:11px;line-height:1.4;color:#52625b}
    #${APP_ID} .croma-collector strong{display:block;margin-bottom:8px;font-size:12px;color:#175c49}
    #${APP_ID} .croma-collector small{display:block;margin:-3px 0 9px;color:#6b7771;font-size:10px;line-height:1.35}
    #${APP_ID} .croma-collector-actions{display:grid;grid-template-columns:1fr 1fr;gap:6px}
    #${APP_ID} .croma-collector-actions button{padding:8px 6px;font-size:11px}
    #${APP_ID} .croma-collector-actions [data-collector="clear"]{grid-column:1/-1;background:#eef2f0;color:#53635c}
    #${APP_ID} .croma-status{margin-top:11px;padding:8px 9px;border-radius:8px;background:#e7f5ef;color:#175c49;font-size:12px;line-height:1.35}
    #${APP_ID} .croma-status[data-error="1"]{background:#ffe9e7;color:#8a241c}
    #${APP_ID} .croma-footer{margin-top:9px;font-size:10px;color:#74827b;text-align:center}
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = APP_ID;
  panel.innerHTML = `
    <header data-drag-header>
      <strong>Exportador Croma</strong>
      <span class="croma-drag" title="Arraste para mover">⠿</span>
      <span class="croma-header-actions">
        <button type="button" data-action="ai" aria-label="Consultar IA" title="Consultar IA">✦</button>
        <button type="button" data-close aria-label="Fechar" title="Fechar">×</button>
      </span>
    </header>
    <div class="croma-body">
      <div class="croma-scope"><span>Escopo</span><strong>Conversa atual</strong></div>
      <div class="croma-grid">
        <button class="croma-action" type="button" data-action="txt">Baixar texto</button>
        <button class="croma-action" type="button" data-action="media">Baixar com mídia</button>
      </div>
      <section class="croma-collector" data-collector-box hidden>
        <p>A captura fica ativa enquanto você abre e rola “Mídia, links e docs”. Em documentos, clique no botão de download para o coletor tentar incorporar o arquivo.</p>
        <strong data-collector-count>0 mídia(s) · 0 documento(s) coletado(s)</strong>
        <small data-collector-stats>0 coletado(s) · 0 duplicado(s) · 0 falha(s) · 0 ignorado(s)</small>
        <div class="croma-collector-actions">
          <button class="croma-action" type="button" data-collector="collect">Capturar tela agora</button>
          <button class="croma-action" type="button" data-collector="zip">Finalizar e baixar ZIP</button>
          <button class="croma-action" type="button" data-collector="clear">Limpar coleta</button>
        </div>
      </section>
      <div class="croma-status" data-error="0">Pronto para extrair.</div>
      <div class="croma-footer">Conversa atual · ZIP: texto/ · midias/ · documentos/ · v${VERSION}</div>
    </div>
  `;
  document.body.appendChild(panel);

  const statusBox = panel.querySelector(".croma-status");
  const collector = panel.querySelector("[data-collector-box]");
  const collectorCount = panel.querySelector("[data-collector-count]");
  const collectorStats = panel.querySelector("[data-collector-stats]");
  const dragHeader = panel.querySelector("[data-drag-header]");
  const originalCreateObjectURL = URL.createObjectURL;
  const originalAnchorClick = HTMLAnchorElement.prototype.click;
  let captureObserver = null;
  let captureTimer = null;

  URL.createObjectURL = function (blob) {
    const url = originalCreateObjectURL.call(URL, blob);
    if (state.captureActive && blob instanceof Blob && !/application\/zip/i.test(blob.type)) state.generatedBlobs.set(url, blob);
    return url;
  };

  HTMLAnchorElement.prototype.click = function () {
    if (state.captureActive && this.dataset.cromaInternalDownload !== "1") captureDownloadAnchor(this);
    return originalAnchorClick.call(this);
  };

  function captureDocumentClick(event) {
    const anchor = event.target.closest && event.target.closest("a[href]");
    if (anchor) captureDownloadAnchor(anchor);
  }

  function scheduleAutomaticCapture() {
    if (!state.captureActive) return;
    clearTimeout(captureTimer);
    captureTimer = setTimeout(() => {
      collectCurrentAttachments({ silent: true }).catch(() => {
        state.captureStats.failed += 1;
        updateCollector();
      });
    }, 450);
  }

  function startCaptureMode() {
    if (state.captureActive) return;
    state.captureActive = true;
    const target = document.querySelector("#app") || document.body;
    captureObserver = new MutationObserver(scheduleAutomaticCapture);
    captureObserver.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "href", "style"] });
    document.addEventListener("click", captureDocumentClick, true);
    scheduleAutomaticCapture();
    toast("Captura ativa. Abra a galeria e role as mídias; nos documentos, clique em baixar.");
  }

  function stopCaptureMode() {
    state.captureActive = false;
    clearTimeout(captureTimer);
    captureTimer = null;
    if (captureObserver) captureObserver.disconnect();
    captureObserver = null;
    document.removeEventListener("click", captureDocumentClick, true);
  }

  function savePanelLayout() {
    try {
      const rect = panel.getBoundingClientRect();
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }));
    } catch (error) {
      // O painel continua funcionando quando o armazenamento local estiver bloqueado.
    }
  }

  function restorePanelLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) || "null");
      if (!saved) return;
      const width = Math.min(Math.max(Number(saved.width) || 360, 300), window.innerWidth * 0.92);
      const height = Math.min(Math.max(Number(saved.height) || 520, 360), window.innerHeight * 0.9);
      const left = Math.min(Math.max(Number(saved.left) || 0, 0), Math.max(0, window.innerWidth - width));
      const top = Math.min(Math.max(Number(saved.top) || 0, 0), Math.max(0, window.innerHeight - height));
      Object.assign(panel.style, { right: "auto", left: left + "px", top: top + "px", width: width + "px", height: height + "px" });
    } catch (error) {
      // Ignora preferências antigas ou inválidas.
    }
  }

  restorePanelLayout();
  let dragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  dragHeader.addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    const rect = panel.getBoundingClientRect();
    dragging = true;
    dragOffsetX = event.clientX - rect.left;
    dragOffsetY = event.clientY - rect.top;
    panel.style.right = "auto";
    dragHeader.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  dragHeader.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = panel.getBoundingClientRect();
    const left = Math.min(Math.max(event.clientX - dragOffsetX, 0), Math.max(0, window.innerWidth - rect.width));
    const top = Math.min(Math.max(event.clientY - dragOffsetY, 0), Math.max(0, window.innerHeight - rect.height));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
  });
  const finishDrag = (event) => {
    if (!dragging) return;
    dragging = false;
    if (dragHeader.hasPointerCapture(event.pointerId)) dragHeader.releasePointerCapture(event.pointerId);
    savePanelLayout();
  };
  dragHeader.addEventListener("pointerup", finishDrag);
  dragHeader.addEventListener("pointercancel", finishDrag);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(() => {
    if (!dragging) savePanelLayout();
  }).observe(panel);

  const conversationWatcher = setInterval(() => {
    if (!state.collectionChatKey) return;
    try {
      const chat = currentChatCollection();
      if (chat.key === state.collectionChatKey) return;
      state.collectedFiles.clear();
      state.collectedUrls.clear();
      state.generatedBlobs.clear();
      state.collectionChatKey = "";
      state.collectionChatName = "";
      state.captureStats = { found: 0, added: 0, duplicates: 0, failed: 0, skipped: 0 };
      updateCollector();
      toast("A conversa aberta mudou. A coleta de anexos anterior foi limpa.");
    } catch (error) {
      // Aguarda a próxima conversa terminar de carregar.
    }
  }, 1000);

  panel.querySelector("[data-close]").addEventListener("click", () => {
    stopCaptureMode();
    URL.createObjectURL = originalCreateObjectURL;
    HTMLAnchorElement.prototype.click = originalAnchorClick;
    clearInterval(conversationWatcher);
    panel.remove();
    style.remove();
  });
  panel.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await run(button.dataset.action);
      } finally {
        button.disabled = false;
      }
    });
  });
  panel.querySelectorAll("[data-collector]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        if (button.dataset.collector === "collect") await collectCurrentAttachments();
        if (button.dataset.collector === "zip") await generateMediaZip();
        if (button.dataset.collector === "clear") clearCollectedAttachments();
      } catch (error) {
        toast(error && error.message ? error.message : "Não foi possível concluir esta etapa.", true);
      } finally {
        button.disabled = false;
      }
    });
  });
})();
