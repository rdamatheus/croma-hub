# Taxonomia de catálogo — Croma Hub

## Objetivo

A Central de Taxonomia organiza produtos e serviços da Croma e mantém a estrutura comercial usada pelo site e, futuramente, pelo Bling.

## Estrutura oficial

`Tipo → Família Croma → Categoria → Subcategoria → Item`

Regras obrigatórias:

- Tipo é `produto` ou `servico`.
- Família é obrigatória para toda categoria nova.
- Categoria é o primeiro nível sincronizável com o ERP.
- Subcategoria é opcional e é o último nível permitido.
- Não existe terceiro nível de categoria.
- Marca, SKU, cor, tamanho ou variação não devem virar categoria.
- Produto ou serviço pode permanecer temporariamente sem categoria durante a reconstrução.

## Processo de classificação

A funcionalidade de Auditoria/IA foi removida da interface em 06/09/2026.

A classificação em massa passa a ser conduzida pelo ChatGPT / Copiloto Croma:

1. consultar o catálogo completo no Supabase, sem alterações;
2. analisar produtos e serviços considerando o conjunto inteiro;
3. usar referências comerciais reais e boas práticas de mercado quando necessário;
4. propor Família → Categoria → Subcategoria;
5. apresentar agrupamentos, exemplos e casos duvidosos para revisão humana;
6. aplicar somente após aprovação explícita;
7. validar contagens, produtos sem categoria e coerência da árvore;
8. somente depois publicar a taxonomia aprovada no Bling.

O objetivo é evitar microcategorias inconsistentes criadas por análises isoladas em pequenos lotes.

## Base comercial

`taxonomy_market_references` permanece preservada como repertório de apoio. A base inicial contém 22 referências comerciais, incluindo Kalunga, Mercado Livre e FuturaIM.

Essas referências servem como evidência de mercado, não como obrigação de copiar a árvore de terceiros.

Critérios:

- priorizar nomes comerciais reconhecíveis;
- reutilizar categorias quando semanticamente correto;
- criar categoria nova somente quando for reutilizável;
- usar subcategoria apenas quando melhora navegação e entendimento;
- evitar categorias por marca, SKU, cor, tamanho ou variação;
- considerar o catálogo inteiro antes de consolidar a estrutura.

## Aplicação segura

`public.apply_taxonomy_audit(jsonb)` permanece disponível como mecanismo transacional para aplicação de decisões aprovadas.

A função valida:

- usuário autorizado;
- tipo do item;
- família do mesmo tipo;
- categoria da mesma família;
- subcategoria filha da categoria correta;
- ausência de terceiro nível.

Se qualquer decisão do lote estiver inconsistente, toda a transação é revertida.

Categorias novas criadas por esse mecanismo nascem ativas, mas ocultas do site e fora da navegação até revisão posterior.

## Central de Taxonomia

O painel mantém somente funções operacionais:

- criar e editar categorias/subcategorias;
- controlar `ativo`, `public_visible`, `show_in_navigation` e `featured_home`;
- visualizar produtos vinculados por categoria;
- pesquisar produtos por nome ou SKU;
- navegar em páginas de 10 itens na inspeção de categoria;
- mover um produto para outra categoria/subcategoria;
- deixar um item sem categoria;
- consultar categorias existentes no Bling.

Não há botão de análise por IA, fila, execução, propostas persistidas ou processamento em lote dentro do painel.

## Visibilidade

Os controles permanecem independentes:

- `ativo`: categoria disponível internamente;
- `public_visible`: categoria permitida no site público;
- `show_in_navigation`: categoria exibida na navegação;
- `featured_home`: categoria destacável na Home.

Categorias internas de custos, composição, equipamentos ou insumos podem permanecer ativas e ocultas do público.

## Integração com Bling

A classificação local não publica categorias automaticamente no Bling.

A publicação no ERP será uma etapa posterior e explícita:

1. aprovar a árvore Croma;
2. criar categorias principais no Bling;
3. criar subcategorias com os pais já resolvidos;
4. armazenar os IDs externos;
5. vincular os produtos;
6. validar o resultado.

As rotinas `bling-product-auto-sync`, `bling-service-auto-sync` e `bling-import-product` aceitam `catalog_category_id = NULL` e não recriam categorias técnicas como `bling-importados` ou `bling-servicos-importados`.

Mudanças exclusivamente em `catalog_category_id` não entram nos campos que marcam um produto como pendente de sincronização automática com o Bling.

## Estado validado em 06/09/2026

- famílias ativas: **11**;
- referências comerciais ativas: **22**;
- produtos ativos: **2.137**;
- serviços ativos: **1.173**;
- tabelas `taxonomy_runs`, `taxonomy_category_proposals` e `taxonomy_item_proposals`: **removidas**;
- `taxonomy-classify`: **v7 desativada funcionalmente**, retornando HTTP 410 e sem executar classificação;
- não há referência do frontend à função de classificação;
- controlador duplicado `interno-taxonomy-enhancements.js`: **removido**;
- IA removida da Central de Taxonomia.

## Próximo passo

Executar a classificação em massa pelo ChatGPT / Copiloto Croma, começando por produtos, consolidar a árvore proposta e somente aplicar no Supabase depois da revisão e aprovação do usuário.
