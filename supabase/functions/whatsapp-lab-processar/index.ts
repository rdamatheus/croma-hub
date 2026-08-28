import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

function outputText(raw: any) {
  return raw?.output_text || (raw?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((part: any) => part?.type === "output_text")
    .map((part: any) => part?.text || "")
    .join("\n") || "";
}

function parseJson(text: string) {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

function bytesToBase64(bytes: Uint8Array) {
  const chunk = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunk, bytes.length)));
  }
  return btoa(binary);
}

async function transcribeAudio(openaiKey: string, bytes: Uint8Array, fileName: string, mimeType: string) {
  const form = new FormData();
  form.append("file", new File([bytes], fileName, { type: mimeType || "audio/wav" }));
  form.append("model", "gpt-transcribe");
  form.append("prompt", "Atendimento da Croma Papelaria e Gráfica em português do Brasil. Preserve medidas, quantidades, materiais, nomes de produtos e prazos com exatidão.");
  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}` },
    body: form
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw?.error?.message || "Falha ao transcrever áudio.");
  return String(raw?.text || "").trim();
}

async function analyzeFile(openaiKey: string, bytes: Uint8Array, attachment: any) {
  const mimeType = attachment.mime_type || "application/octet-stream";
  const dataUrl = `data:${mimeType};base64,${bytesToBase64(bytes)}`;
  const isImage = attachment.kind === "imagem";
  const content = isImage
    ? [
        { type: "input_text", text: "Extraia as informações úteis deste arquivo enviado em um atendimento gráfico. Identifique textos, medidas, quantidades, materiais, nomes, prazos e observações. Não invente dados." },
        { type: "input_image", image_url: dataUrl, detail: "high" }
      ]
    : [
        { type: "input_file", filename: attachment.file_name, file_data: dataUrl, ...(attachment.kind === "pdf" ? { detail: "high" } : {}) },
        { type: "input_text", text: "Extraia e resuma as informações úteis deste documento para elaborar o atendimento e o orçamento da Croma. Preserve medidas, quantidades, materiais, nomes e prazos. Não invente dados." }
      ];
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.6-luna",
      input: [{ role: "user", content }],
      max_output_tokens: 1800
    })
  });
  const raw = await response.json();
  if (!response.ok) throw new Error(raw?.error?.message || "Falha ao analisar arquivo.");
  return outputText(raw).trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Sessão ausente." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userError || !user) return json({ error: "Sessão inválida." }, 401);

    const { data: profile } = await admin.from("profiles").select("id,role,ativo").eq("id", user.id).maybeSingle();
    if (!profile?.ativo || !["owner", "manager", "equipe"].includes(profile.role)) {
      return json({ error: "Conta sem acesso ao laboratório." }, 403);
    }

    const { atendimento_id } = await req.json();
    if (!atendimento_id) return json({ error: "Atendimento não informado." }, 400);

    const [{ data: atendimento }, { data: messages }, { data: attachments }] = await Promise.all([
      admin.from("lab_whatsapp_atendimentos").select("*").eq("id", atendimento_id).maybeSingle(),
      admin.from("lab_whatsapp_mensagens").select("*").eq("atendimento_id", atendimento_id).order("sequence"),
      admin.from("lab_whatsapp_anexos").select("*").eq("atendimento_id", atendimento_id).order("created_at")
    ]);
    if (!atendimento) return json({ error: "Atendimento não encontrado." }, 404);

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return json({ error: "OPENAI_API_KEY_NOT_CONFIGURED", message: "A chave da API da OpenAI ainda não está configurada no Supabase." }, 503);

    const extracted: Array<{ id: string; file_name: string; kind: string; text: string }> = [];
    const attachmentErrors: Array<{ id: string; file_name: string; error: string }> = [];
    for (const attachment of attachments || []) {
      try {
        await admin.from("lab_whatsapp_anexos").update({ processing_status: "processando" }).eq("id", attachment.id);
        if (attachment.size_bytes > 25 * 1024 * 1024) throw new Error("Arquivo maior que 25 MB.");
        const { data: blob, error: downloadError } = await admin.storage.from("croma-arquivos").download(attachment.storage_path);
        if (downloadError || !blob) throw downloadError || new Error("Arquivo indisponível.");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let text = "";
        if (attachment.kind === "audio") {
          text = await transcribeAudio(openaiKey, bytes, attachment.file_name, attachment.mime_type);
          await admin.from("lab_whatsapp_anexos").update({ transcription: text, processing_status: "concluido" }).eq("id", attachment.id);
        } else if (["imagem", "pdf", "documento"].includes(attachment.kind)) {
          text = await analyzeFile(openaiKey, bytes, attachment);
          await admin.from("lab_whatsapp_anexos").update({ extracted_text: text, processing_status: "concluido" }).eq("id", attachment.id);
        } else {
          throw new Error("Este tipo de arquivo ainda não é processado automaticamente.");
        }
        extracted.push({ id: attachment.id, file_name: attachment.file_name, kind: attachment.kind, text });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attachmentErrors.push({ id: attachment.id, file_name: attachment.file_name, error: message });
        await admin.from("lab_whatsapp_anexos").update({ processing_status: "erro" }).eq("id", attachment.id);
      }
    }

    const conversation = (messages || []).map((message: any) => {
      const stamp = [message.message_date, message.message_time].filter(Boolean).join(" ");
      const quote = message.quoted_text ? `\nRespondendo a: ${message.quoted_text}` : "";
      const file = message.file_names ? `\nArquivo citado: ${message.file_names}` : "";
      return `[${stamp}] ${message.direction === "enviada" ? "CROMA" : message.author || "CLIENTE"}: ${message.body || "[sem texto]"}${quote}${file}`;
    }).join("\n\n").slice(0, 100_000);
    const fileContext = extracted.map(item => `ARQUIVO ${item.file_name} (${item.kind}):\n${item.text.slice(0, 30_000)}`).join("\n\n");

    const instructions = `Você é o assistente interno de atendimento da Croma Papelaria e Gráfica. Analise a conversa e os anexos sem inventar informações. Preserve exatamente medidas, quantidades, materiais, prazos e nomes de arquivos. Diferencie o que foi pedido do que ainda precisa ser confirmado. Gere uma resposta sugerida cordial e objetiva, sem revelar fornecedores, custos, margens ou informações internas. Responda SOMENTE em JSON válido com: resumo (string), pedido_cliente (array de strings), especificacoes (array de strings), pendencias (array de strings), resposta_sugerida (string), tarefas_internas (array de strings), arquivos_analisados (array de strings).`;
    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions,
        input: `CONTATO: ${atendimento.contact_name || atendimento.contact_phone || "Contato WhatsApp"}\n\nCONVERSA:\n${conversation || "Sem mensagens com texto."}\n\nANEXOS PROCESSADOS:\n${fileContext || "Nenhum anexo processado."}`,
        max_output_tokens: 2400
      })
    });
    const raw = await aiResponse.json();
    if (!aiResponse.ok) return json({ error: "Falha ao gerar análise do atendimento.", detail: raw?.error?.message || "Erro da IA.", attachment_errors: attachmentErrors }, 502);

    let analysis: any;
    try {
      analysis = parseJson(outputText(raw));
    } catch {
      analysis = { resumo: outputText(raw), pedido_cliente: [], especificacoes: [], pendencias: [], resposta_sugerida: "", tarefas_internas: [], arquivos_analisados: [] };
    }
    analysis.erros_anexos = attachmentErrors;
    const { error: updateError } = await admin.from("lab_whatsapp_atendimentos").update({
      analysis,
      summary: analysis.resumo || null,
      suggested_reply: analysis.resposta_sugerida || null,
      analyzed_at: new Date().toISOString(),
      status: "concluido",
      updated_at: new Date().toISOString()
    }).eq("id", atendimento_id);
    if (updateError) throw updateError;
    return json({ analysis, processed_attachments: extracted.length, attachment_errors: attachmentErrors });
  } catch (error) {
    console.error(error);
    return json({ error: "Erro inesperado ao processar o atendimento.", detail: error instanceof Error ? error.message : String(error) }, 500);
  }
});
