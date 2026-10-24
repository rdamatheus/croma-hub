# Sincronização estrutural Bling ↔ Croma Hub — 24/10/2026

## Objetivo
Remover exceções por nome/ID e suportar, para **produtos e serviços**, o espelhamento de formatos S (simples), V (pai de variações) e E (composição), com reconciliação de insumos, quantidades e vínculo pai/filho.

## Implantado
- `bling-product-auto-sync` v16 e `bling-service-auto-sync` v17, ativos no Supabase e espelhados em `main`.
- Importação Bling → Croma: formato, vínculo pai/filho, `variacao.nome` e `variacao.ordem` no snapshot Bling; componentes, quantidades e configurações de estoque no banco. Filhos são registros em `products` ligados por `parent_product_id`, não linhas de `product_variants`.
- Exportação Croma → Bling: formato local, componentes ativos com `sync_to_bling=true`, quantidades, tipo/lançamento de estoque e vínculo com pai já vinculado. Nome e ordem da variação podem ser definidos em `products.metadata.bling_variation` como `{"nome":"COR:AZUL;TAMANHO:A4","ordem":1}`.
- O cadastro novo de filho requer `metadata.bling_variation.nome` para evitar variação sem atributos.
- Conflito entre mudanças simultâneas é marcado como `conflict` antes de sobrescrever; componentes sem cadastro local, IDs duplicados, insumos sem ID remoto, remoção de vínculo pai e estruturas inválidas exigem revisão, sem destruição silenciosa.
- A rotina SQL de normalização mantém IDs de componentes, atualiza quantidade em vez de apagar e recriar, inativa removidos (histórico preservado), reativa IDs antigos e rejeita importação se algum insumo remoto ainda não tiver vínculo local.
- Alterações locais em `product_format`, `parent_product_id`, `metadata.bling_variation`, `product_components` e `product_composition_settings` passam a marcar o produto como pendente quando editadas por sessão autenticada.
- Registros em `structural_review` podem ser reavaliados automaticamente quando os vínculos faltantes forem cadastrados.
- A auditoria `action=audit_structure` nas duas Edge Functions é **somente leitura**, requer JWT de owner/manager ou segredo do cron e compara formato, pai e componentes com o Bling.

## Migrações aplicadas
- `20261024031220_bling_generic_structural_reconciliation_safe_components.sql`
- `20261024031342_bling_mark_generic_structure_edits_dirty.sql`

## Testes executados
1. Implantação das duas Edge Functions: compilação e status ACTIVE.
2. Teste SQL transacional de alteração de quantidade: atualizou sem trocar IDs; rollback garantido.
3. Teste SQL de insumo remoto inexistente: operação rejeitada, sem perda dos componentes.
4. Teste SQL de remoção e reinclusão: inativação/reativação com o mesmo ID; rollback garantido.
5. Teste SQL de edição local autenticada de composição: `local_dirty` e `dirty_fields=['estrutura']`; rollback.
6. Teste SQL de edição local autenticada de variação: `dirty_fields=['variacao']`; rollback.
7. Consulta pós-testes: cinco registros IMPRESSÃO, quatro relações pai/filho, dois componentes P&B A4, preços, imagens e estados clean preservados.

## Validação pendente e limites
**Não houve chamada autenticada de auditoria ou escrita ao Bling nesta implantação.** A ferramenta conectada de Supabase não disponibiliza invocação autenticada de Edge Functions; tentativa de acionar auditoria via SQL não obteve acesso ao segredo do cron (`Acesso restrito ao serviço de integração`). Não se contornou essa restrição. Portanto a compatibilidade real de payloads PUT/POST para mudança de estrutura e o round-trip remoto ainda exigem teste autenticado controlado antes de considerar a integração integralmente homologada.

A remoção de vínculo pai de uma variação existente é tratada como revisão porque a API pode exigir operação específica. A tabela `product_variants` usada por configuradores do site é independente da árvore de produtos/variações do Bling e não foi reescrita. Nenhum preço, produto ou componente de produção foi alterado permanentemente nos testes.

## Procedimento de homologação
1. Com uma sessão autorizada, invocar `audit_structure` para um produto/serviço de composição, verificar `structure_matches=true`.
2. Criar/selecionar um registro de teste isolado no Bling e no Croma, com dois insumos vinculados.
3. Alterar quantidade de um componente no Croma e sincronizar; reler o Bling e comparar IDs, quantidades e formato.
4. Alterar quantidade no Bling e sincronizar; verificar ID local estável.
5. Alterar ambos antes de sincronizar e verificar estado `conflict`, sem sobrescrita.
6. Testar adição/remoção de insumo e nome/ordem de variação em registros de teste.
7. Somente depois considerar a homologação de escrita concluída.
