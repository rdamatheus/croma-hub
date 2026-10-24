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


## Complemento — 2026-10-23: proteção do sincronizador de serviços

### Lacuna identificada
A família IMPRESSÃO possui `product_type='servico'` no Croma Hub e `tipo='S'` no Bling. Portanto, a proteção anterior em `bling-product-auto-sync` **não bastava**: o fluxo independente `bling-service-auto-sync` ainda poderia importar preços, nomes, imagens e estados, ou exportar alterações de serviços, inclusive modificando o formato remoto ao enviar.

### Correção aprovada e implantada
Arquivo: `supabase/functions/bling-service-auto-sync/index.ts`.
- A Edge Function `bling-service-auto-sync` foi atualizada da versão 8 para a **versão 9** (ACTIVE).
- Adicionado `isProtectedPrintingService` para reconhecer os cinco IDs Bling atuais, filhos pelo ID Bling do pai (`16411218543`) e filhos locais pelo UUID do pai (`03fc6ab8-ea5e-44e6-87c3-4f0db456f93f`).
- `syncIn` retorna `skip` **antes** de qualquer leitura/gravação de produto, mídia, mapeamento ou estado da família protegida.
- `pushDirty` ignora esses serviços **antes** de consultar o Bling ou enviar `PUT/POST`; não limpa pendências nem modifica seus estados.
- Outros serviços (incluindo os de CÓPIAS) permanecem no fluxo normal. Nenhum preço, SKU, imagem, vínculo, histórico ou composição foi alterado por esta implantação.
- A autenticação e a política `verify_jwt=false` pré-existentes foram preservadas; a função exige autenticação própria em `authorize`.

### Validação e limitações
- Dez casos de teste da lógica de identificação: pais, filhos existentes, filhos novos por referência ao pai, serviços independentes e entrada nula.
- Releitura do código ativo confirmou bloqueios de entrada e saída antes de operações com efeitos, versão 9 ACTIVE e correspondência exata com o GitHub.
- Consulta SQL pós-implantação confirmou os cinco IDs, nomes, preços, hierarquia, 2 componentes ativos no P&B A4 e 1 mídia ativa por registro, sem mudanças nos `updated_at` originais.
- Commit da função: `9febd00f19d043c5961670d1ce349192f50119bb`.
- **Não foi executado teste de sincronização autenticada com o Bling** nem teste de ciclo automático real. O bloqueio foi validado por código e dados persistidos, não por execução ponta a ponta.
- Não foram criadas as oito variações; a proteção deve permanecer até que haja plano de reconciliação, aprovação específica e testes.

### Escopo de segurança
A proteção aplica-se às duas Edge Functions automáticas citadas. Outros fluxos manuais de alteração de cadastros ou integrações distintas não foram alterados; portanto, a proteção não é uma trava universal do banco ou do Bling.


## Atualização — 2026-10-24: exceção específica retirada

**Esta documentação registra o histórico e não descreve mais o bloqueio ativo.** Por decisão do usuário, os bloqueios específicos da família IMPRESSÃO foram removidos de ambos os sincronizadores e substituídos por verificações genéricas de integridade estrutural.

- `bling-product-auto-sync`: versão 10, commit `46260529e590528ed19471ea00890413ec26a048`.
- `bling-service-auto-sync`: versão 11, commit `2ed2f507ed734f958c8aaaf1f524b91e5e826c19`.
- Não há mais IDs nem nomes de IMPRESSÃO codificados nas funções para tratamento especial.
- Formatos S, V, E são reconhecidos; mudanças de preço/nome não devem converter silenciosamente pais ou composições em produtos simples.
- Alterações estruturais ainda não reconciliadas entram no estado genérico `structural_review`, sem sobrescrita automática. Esse estado pode ocorrer com **qualquer** produto ou serviço.
- Os cinco cadastros IMPRESSÃO mantiveram IDs, preços, vínculos, mídia e os dois componentes P&B A4 na verificação SQL após implantação.
- **Ainda não há espelhamento estrutural bidirecional completo** de componentes e variações. A etapa seguinte é implementar reconciliação de estrutura com testes de ida e volta, antes de remover a revisão obrigatória de alterações estruturais.
- Nenhuma execução autenticada ponta a ponta contra o Bling foi realizada nesta atualização; os testes foram de compilação/implantação, código e integridade SQL.
