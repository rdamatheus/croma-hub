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

Quando o teste terminar, remover primeiro os objetos no prefixo `whatsapp-lab/` do bucket privado e só então eliminar as tabelas, funções e políticas específicas do laboratório. O histórico de análises acompanha a exclusão do atendimento de teste. Não executar essa limpeza enquanto houver testes que devam ser preservados; limpeza depende de autorização própria.
