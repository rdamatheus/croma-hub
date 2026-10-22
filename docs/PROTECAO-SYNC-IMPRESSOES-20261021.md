# Proteção da família IMPRESSÃO na sincronização Bling — 2026-10-21

## Objetivo e autorização
Primeira etapa aprovada pelo usuário: adequar de forma controlada a sincronização Croma Hub ↔ Bling, preservando IDs, histórico, hierarquia pai/filho e composições. **Não** inclui criação das oito variações, mudança de preços, atualização de imagens nem mudanças na página pública.

## Estado observado antes da alteração
- Integração Bling conectada; sincronização automática de produtos habilitada, com intervalo configurado de 1440 minutos.
- Produto pai `IMPRESSÃO`: Bling `16411218543`; UUID `03fc6ab8-ea5e-44e6-87c3-4f0db456f93f`.
- Quatro filhos: P&B A4 `16411219946`, P&B A3 `16411219947`, Colorida A4 `16411219948`, Colorida A3 `16411219949`.
- P&B A4 tem dois componentes ativos de produção; os cinco cadastros possuem mídia ativa.
- A sincronização anterior normalizava indiscriminadamente `product_format` para `simple` em filhos que não fossem explicitamente do formato `variacao`. Isso poderia apagar a classificação local de `composition`. A rotina de saída também poderia transformar um produto pai em composição ou simples quando atualizasse campos comuns.
- Código implantado (v8) diferia do código salvo no GitHub, incluindo validações fiscais de NCM presentes apenas no deploy.

## Alteração aplicada (v9)
Arquivo-fonte: `supabase/functions/bling-product-auto-sync/index.ts`.

Foi incluída uma proteção restrita à família IMPRESSÃO. O reconhecimento utiliza os cinco IDs Bling existentes e, para filhos novos, o ID Bling do pai ou UUID local do pai. Enquanto a reconciliação comercial não for autorizada:
- A entrada automática (Bling → Croma) **ignora** registros dessa família antes de qualquer alteração de produto, estado, mapeamento, mídia ou componentes.
- A saída automática (Croma → Bling) **ignora** esses produtos, inclusive no processamento de pendências, sem alterar seu estado de sincronização.
- O envio manual via `push_product` retorna `skipped` e `reason: printing_family_protected`.
- A rotina de associação de pais `parentsFor` não altera os filhos protegidos.
- Os demais produtos seguem com as rotinas existentes.
- A implementação preservou as validações fiscais de NCM presentes na função ativa, ao alinhar o repositório à versão realmente implantada.

## Validação
- Supabase Edge Function `bling-product-auto-sync` implantada na **versão 9**, status **ACTIVE**.
- Releitura da função implantada: verificadas todas as proteções de entrada, saída, pendências, vínculo pai/filho, envio manual, IDs e manutenção das validações fiscais anteriores.
- Código alinhado ao GitHub: commit `ef1bc727a8451baa1d6590f9f7a265359443bbe2`.
- Não foi executada sincronização efetiva nem modificação dos cadastros do Bling. A validação de bloqueio em chamada autenticada real e a confirmação do próximo ciclo automático ainda são pendências.

## Próxima etapa (não autorizada nesta execução)
1. Obter/revisar o estado remoto atual dos cinco cadastros e regras reais do Bling para variações (incluindo composição do P&B A4).
2. Definir mapeamento seguro e reversível dos oito filhos por `Cor → Faces → Formato`, com preservação de SKUs e referências.
3. Implementar sincronização supervisionada de variações, com comparação de diferenças, bloqueio de conflitos, releitura pós-envio e reconciliação de preços e imagens.
4. Somente após validação e nova autorização, remover a proteção temporária da família IMPRESSÃO.
