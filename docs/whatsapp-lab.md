# Laboratório de atendimentos do WhatsApp

Prova de conceito isolada do Croma Hub. A rota `/interno/whatsapp-lab/` importa o JSON gerado pelo Exportador Croma e permite associar arquivos baixados do WhatsApp.

## Isolamento

- Tabelas próprias: `lab_whatsapp_atendimentos`, `lab_whatsapp_mensagens`, `lab_whatsapp_anexos` e, após a migração do MVP, `lab_whatsapp_analises`.
- Arquivos no bucket privado `croma-arquivos`, sob `whatsapp-lab/<user-id>/<atendimento-id>/`.
- Acesso restrito às contas internas ativas por RLS.
- Nenhuma referência a pedidos, clientes, produtos, preços ou produção.
- A exclusão de um atendimento remove primeiro os arquivos e depois o registro; mensagens e metadados são eliminados em cascata.

## Escopo do teste

A evolução do MVP acrescenta entrada manual e exemplos fictícios, revisão de categoria/prioridade/responsável/andamento e histórico de análises. O plano de implantação e os testes estão em [WHATSAPP-LAB-MVP.md](WHATSAPP-LAB-MVP.md). O processamento exige uma ação explícita no botão “Processar com IA”.

1. Importar conversa em JSON.
2. Corrigir localmente nome genérico e direção indefinida quando possível.
3. Anexar manualmente áudio, imagem, vídeo, PDF ou documento.
4. Salvar, consultar e excluir atendimentos de laboratório.
5. Processar a conversa com a função isolada `whatsapp-lab-processar`.
6. Transcrever áudios, ler imagens/PDFs/documentos e gerar resumo, especificações, pendências, tarefas e resposta sugerida.

Áudios `.ogg`/Opus do WhatsApp são convertidos para WAV no navegador antes do envio. Vídeos podem ser armazenados e consultados, mas não são analisados automaticamente nesta prova de conceito.

O processamento depende do segredo `OPENAI_API_KEY` configurado nas Edge Functions. Nenhuma chave privada é exposta no navegador.

## Remoção futura

**Orientação anterior superada:** o prefixo `whatsapp-lab/`, as tabelas e a função agora são compartilhados com o histórico oficial. Nunca eliminar o prefixo, as tabelas ou a função como limpeza do laboratório. Qualquer futura limpeza deve identificar individualmente registros comprovadamente fictícios, excluir somente os objetos vinculados a esses registros, preservar fontes `whatsapp_cliente` e `whatsapp_pendente`, e depender de autorização própria, revisão e validação. Nenhuma limpeza foi executada.
