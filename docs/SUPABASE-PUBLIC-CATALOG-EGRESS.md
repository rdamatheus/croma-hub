# Redução de egress do catálogo público — Croma Hub

Data: 2026-09-23

## Contexto

Após pausar as sincronizações automáticas do Bling e reduzir as cargas das telas internas, a auditoria encontrou outra fonte potencial de egress: páginas públicas carregavam conjuntos completos do catálogo mesmo quando exibiam apenas uma página ou uma categoria.

O projeto ainda está restrito pelo Supabase por `exceed_egress_quota`. Por isso nenhum cron foi reativado nesta etapa.

## Produtos públicos

### Antes

`/produtos/` carregava todos os produtos do `public_catalog_products` antes de paginar no navegador.

Estado auditado:
- 2.075 produtos públicos;
- payload binário aproximado do conjunto: 371 KB;
- interface exibia 48 por página.

Busca e categoria também eram filtradas somente depois de transferir o conjunto inteiro.

### Depois

- famílias e categorias continuam carregadas como metadados leves;
- `public_catalog_category_stats(scope, require_published)` retorna apenas contagens por categoria;
- produtos são buscados no Supabase com `range()`, 48 por página;
- busca por nome/SKU é executada no banco;
- filtro por categoria/subcategorias é executado no banco;
- detalhe de produto carrega apenas o item solicitado;
- busca possui debounce de 250 ms.

Medição aproximada da primeira página de 48 itens:
- ~8,5 KB de payload binário dos registros, contra ~371 KB do conjunto completo.

As mídias continuam sendo carregadas somente para os produtos visíveis na página.

## Serviços públicos

### Antes

A home de Serviços carregava os 282 serviços publicados mesmo sem o usuário abrir uma categoria.

### Depois

- a home carrega apenas famílias, categorias e contagens;
- serviços são carregados somente quando uma categoria é aberta;
- descendentes da categoria continuam incluídos;
- paginação interna de 100 registros é usada caso uma categoria tenha muitos itens.

A maior categoria encontrada possui 61 serviços e aproximadamente 30 KB de registros, em vez de transferir os 282 serviços (~125 KB) em toda abertura da home.

## Segmentos

### Antes

`/segmentos/` carregava:
- segmentos;
- todos os produtos ativos;
- vínculos produto-segmento.

No estado auditado havia:
- 13 segmentos ativos;
- 0 vínculos em `product_segments`;
- 3.314 produtos ativos.

Portanto, a página baixava milhares de produtos para concluir que não havia nenhum item vinculado.

### Depois

- segmentos e vínculos são consultados primeiro;
- somente IDs realmente vinculados são buscados em `products`;
- com zero vínculos, são buscados zero produtos.

## Segurança

A função `public_catalog_category_stats`:
- usa `security invoker`;
- retorna somente IDs de categoria e contagens;
- é executável por `anon` e `authenticated`;
- respeita as permissões/RLS das fontes públicas já existentes;
- não altera dados.

## Estado dos crons

Produtos, Serviços, Contatos e Taxonomia continuam `active=false`.

Um teste manual de Produtos em 2026-09-23 retornou HTTP 402:
`exceed_egress_quota`.

Isso confirma que a quota atual ainda está bloqueada pelo Supabase. Nenhuma reativação automática deve ocorrer até o serviço ser restaurado.
