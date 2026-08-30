(function () {
  "use strict";

  const APP_ID = "croma-wa-exportador-v1";
  const STYLE_ID = APP_ID + "-style";
  const VERSION = "1.1.0";
  const ATTACHMENT_LIMIT = 40;

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
    let text = String(value == null ? "" : value);
    if (!state.anonymize) return text;
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[E-MAIL]");
    text = text.replace(/\b\d{3}[.\s-]?\d{3}[.\s-]?\d{3}[-.\s]?\d{2}\b/g, "[CPF]");
    text = text.replace(/\b\d{2}[.\s-]?\d{3}[.\s-]?\d{3}[\/\s-]?\d{4}[-.\s]?\d{2}\b/g, "[CNPJ]");
    text = text.replace(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?(?:9[\s.-]?)?\d{4}[\s.-]?\d{4}/g, "[TELEFONE]");
    return text;
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

  function attachmentDownloadControls(roots) {
    const selector = [
      '[data-icon*="download" i]',
      '[aria-label*="baixar" i]',
      '[aria-label*="download" i]',
      '[title*="baixar" i]',
      '[title*="download" i]'
    ].join(",");
    const controls = roots.flatMap((root) => [...root.querySelectorAll(selector)]).map((element) =>
      element.closest('button, [role="button"], a') || element
    );
    return [...new Set(controls)].filter((element) => !element.closest("#" + APP_ID) && visible(element));
  }

  function loadedAttachmentSources(roots) {
    const candidates = roots.flatMap((root) => [...root.querySelectorAll("img[src], video[src], audio[src], a[href]")].map((element) => ({ root, element })));
    const seen = new Set();
    return candidates.filter(({ element }) => {
      const url = element.currentSrc || element.getAttribute("src") || element.getAttribute("href") || "";
      if (!/^(?:blob:|data:)/i.test(url) || seen.has(url)) return false;
      if (element.tagName === "IMG") {
        const width = element.naturalWidth || element.clientWidth;
        const height = element.naturalHeight || element.clientHeight;
        const description = [element.alt, element.getAttribute("aria-label")].filter(Boolean).join(" ");
        if ((width < 96 && height < 96) || /(emoji|avatar|foto do perfil|profile photo)/i.test(description)) return false;
      }
      seen.add(url);
      return true;
    }).map(({ root, element }) => ({
      root,
      element,
      url: element.currentSrc || element.getAttribute("src") || element.getAttribute("href")
    }));
  }

  async function downloadVisibleAttachments() {
    const main = document.querySelector("#main");
    if (!main) throw new Error("Abra uma conversa antes de baixar os anexos.");
    const roots = messageRoots(main);
    if (!roots.length) throw new Error("Nenhuma mensagem carregada foi encontrada. Abra a conversa e role o histórico.");

    const controls = attachmentDownloadControls(roots).slice(0, ATTACHMENT_LIMIT);
    controls.forEach((control) => control.click());
    if (controls.length) await wait(1600);

    const sources = loadedAttachmentSources(roots).slice(0, ATTACHMENT_LIMIT);
    let saved = 0;
    for (let index = 0; index < sources.length; index += 1) {
      const source = sources[index];
      try {
        const response = await fetch(source.url);
        if (!response.ok) throw new Error("Falha ao ler o anexo.");
        const blob = await response.blob();
        const extension = extensionForMime(blob.type || (source.element.tagName === "IMG" ? "image/jpeg" : ""));
        downloadBlob(blob, fileNameFromRoot(source.root, index + 1, extension));
        saved += 1;
        await wait(180);
      } catch (error) {
        // Alguns anexos só podem ser obtidos pelo botão de download original do WhatsApp.
      }
    }

    if (!saved && !controls.length) {
      throw new Error("Nenhuma imagem ou arquivo disponível foi encontrado. Abra o anexo ou clique na prévia e tente novamente.");
    }
    const parts = [];
    if (saved) parts.push(saved + (saved === 1 ? " mídia carregada foi salva" : " mídias carregadas foram salvas"));
    if (controls.length) parts.push(controls.length + (controls.length === 1 ? " download do WhatsApp foi acionado" : " downloads do WhatsApp foram acionados"));
    toast(parts.join("; ") + ". O Chrome pode pedir permissão para vários downloads.");
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
    if (state.includeQuotes && texts.length > 1) quotedText = texts.slice(0, -1).join(" | ");
    if (!text && metaElement) text = clean(metaElement.innerText);
    return { text, quotedText };
  }

  function extractMedia(root) {
    if (!state.includeMedia) return { types: "", files: "", duration: "" };
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

  function extractReactions(root) {
    if (!state.includeReactions) return "";
    return unique(
      [...root.querySelectorAll("[aria-label], [title]")]
        .flatMap((element) => [element.getAttribute("aria-label"), element.getAttribute("title")])
        .filter((value) => /(reação|reaction|reagiu|reacted)/i.test(value || ""))
    ).join(" | ");
  }

  function extractStatus(root) {
    const icons = unique([...root.querySelectorAll("[data-icon]")].map((element) => element.getAttribute("data-icon")));
    if (icons.some((icon) => /msg-time|clock/i.test(icon))) return "pendente";
    if (icons.some((icon) => /msg-dblcheck/i.test(icon))) return "entregue/lida";
    if (icons.some((icon) => /msg-check/i.test(icon))) return "enviada";
    const labels = unique([...root.querySelectorAll("[aria-label]")].map((element) => element.getAttribute("aria-label")));
    const result = labels.find((label) => /(lida|read|entregue|delivered|enviada|sent|pendente|pending)/i.test(label));
    return result || "";
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
        reactions: extractReactions(root),
        deliveryStatus: extractStatus(root),
        rawMetadata: meta.raw
      });
    });

    const limit = Number(state.limit);
    if (limit > 0 && messages.length > limit) messages = messages.slice(-limit);
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
      if (message.reactions) lines.push("[Reações: " + privacy(message.reactions) + "]");
      if (message.deliveryStatus) lines.push("[Status: " + privacy(message.deliveryStatus) + "]");
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

  async function run(action) {
    try {
      if (action === "attachments") {
        await downloadVisibleAttachments();
        return;
      }
      if (action === "sidebar") {
        const rows = extractSidebar();
        downloadFile(sidebarCsv(rows), "WhatsApp - lista carregada - " + new Date().toISOString().slice(0, 10) + ".csv", "text/csv");
        toast(rows.length + " conversas carregadas foram salvas em CSV.");
        return;
      }
      const data = extractOpenChat();
      const baseName = currentBaseName(data);
      if (action === "copy") {
        try {
          await copyText(conversationText(data));
          toast(data.count + " mensagens copiadas. Agora você pode colar no ChatGPT.");
        } catch (error) {
          toast("Não foi possível copiar. Use uma das opções de download.", true);
        }
      } else if (action === "txt") {
        downloadFile(conversationText(data), baseName + ".txt", "text/plain");
        toast(data.count + " mensagens salvas em TXT.");
      } else if (action === "csv") {
        downloadFile(conversationCsv(data), baseName + ".csv", "text/csv");
        toast(data.count + " mensagens salvas em CSV.");
      } else if (action === "json") {
        downloadFile(privateJson(data), baseName + ".json", "application/json");
        toast(data.count + " mensagens salvas em JSON.");
      }
    } catch (error) {
      toast(error && error.message ? error.message : "Não foi possível extrair.", true);
    }
  }

  const state = {
    limit: "0",
    includeMedia: true,
    includeQuotes: true,
    includeReactions: true,
    anonymize: false
  };

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #${APP_ID}{position:fixed;right:16px;top:58px;width:340px;z-index:2147483647;background:#f8faf9;color:#17201c;border:1px solid #ccd7d1;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.28);font-family:Arial,sans-serif;font-size:14px;overflow:hidden}
    #${APP_ID} *{box-sizing:border-box}
    #${APP_ID} header{display:flex;align-items:center;justify-content:space-between;padding:13px 14px;background:#075e54;color:#fff}
    #${APP_ID} header strong{font-size:15px}
    #${APP_ID} header button{border:0;background:transparent;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:0 2px}
    #${APP_ID} .croma-body{padding:13px 14px}
    #${APP_ID} .croma-note{font-size:12px;line-height:1.35;color:#52625b;margin:0 0 12px}
    #${APP_ID} label{display:flex;align-items:center;gap:8px;margin:8px 0;cursor:pointer}
    #${APP_ID} select{width:100%;margin:5px 0 7px;padding:8px;border:1px solid #b9c7c0;border-radius:8px;background:#fff;color:#17201c}
    #${APP_ID} .croma-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
    #${APP_ID} .croma-action{border:0;border-radius:9px;padding:10px 8px;background:#128c7e;color:#fff;font-weight:700;cursor:pointer}
    #${APP_ID} .croma-action:hover{background:#0d7468}
    #${APP_ID} .croma-secondary{background:#e4ece8;color:#173e35}
    #${APP_ID} .croma-secondary:hover{background:#d1ded8}
    #${APP_ID} .croma-wide{grid-column:1/-1}
    #${APP_ID} .croma-attachment-note{margin:9px 0 0;font-size:11px;line-height:1.35;color:#52625b}
    #${APP_ID} .croma-status{margin-top:11px;padding:8px 9px;border-radius:8px;background:#e7f5ef;color:#175c49;font-size:12px;line-height:1.35}
    #${APP_ID} .croma-status[data-error="1"]{background:#ffe9e7;color:#8a241c}
    #${APP_ID} .croma-footer{margin-top:9px;font-size:10px;color:#74827b;text-align:center}
  `;
  document.head.appendChild(style);

  const panel = document.createElement("section");
  panel.id = APP_ID;
  panel.innerHTML = `
    <header><strong>Exportador Croma</strong><button type="button" data-close aria-label="Fechar">×</button></header>
    <div class="croma-body">
      <p class="croma-note">Extrai somente a conversa aberta e as mensagens já carregadas. Para buscar mensagens antigas, role a conversa para cima antes.</p>
      <label for="croma-limit">Quantidade de mensagens:</label>
      <select id="croma-limit">
        <option value="0">Todas as carregadas</option>
        <option value="50">Últimas 50</option>
        <option value="100">Últimas 100</option>
        <option value="200">Últimas 200</option>
        <option value="500">Últimas 500</option>
      </select>
      <label><input type="checkbox" data-option="includeMedia" checked> Incluir mídias e nomes de arquivos</label>
      <label><input type="checkbox" data-option="includeQuotes" checked> Incluir respostas citadas</label>
      <label><input type="checkbox" data-option="includeReactions" checked> Incluir reações e status disponíveis</label>
      <label><input type="checkbox" data-option="anonymize"> Ocultar telefone, e-mail, CPF e CNPJ</label>
      <div class="croma-grid">
        <button class="croma-action croma-wide" type="button" data-action="copy">Copiar para o ChatGPT</button>
        <button class="croma-action croma-wide" type="button" data-action="attachments">Baixar imagens e PDFs visíveis</button>
        <button class="croma-action" type="button" data-action="txt">Baixar TXT</button>
        <button class="croma-action" type="button" data-action="csv">Baixar CSV</button>
        <button class="croma-action" type="button" data-action="json">Baixar JSON</button>
        <button class="croma-action croma-secondary" type="button" data-action="sidebar">Lista lateral CSV</button>
      </div>
      <p class="croma-attachment-note">Os anexos são salvos separadamente. Abra ou carregue as imagens e PDFs desejados antes de baixar. Limite de ${ATTACHMENT_LIMIT} por clique.</p>
      <div class="croma-status" data-error="0">Pronto para extrair.</div>
      <div class="croma-footer">Processamento local · nenhum envio automático · v${VERSION}</div>
    </div>
  `;
  document.body.appendChild(panel);

  const statusBox = panel.querySelector(".croma-status");
  panel.querySelector("[data-close]").addEventListener("click", () => {
    panel.remove();
    style.remove();
  });
  panel.querySelector("#croma-limit").addEventListener("change", (event) => {
    state.limit = event.target.value;
  });
  panel.querySelectorAll("[data-option]").forEach((input) => {
    input.addEventListener("change", () => {
      state[input.dataset.option] = input.checked;
    });
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
})();
