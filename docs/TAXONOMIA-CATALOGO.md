# Taxonomia de catálogo — Croma Hub

## Objetivo

A Auditoria de Categorias organiza produtos e serviços da Croma com revisão humana antes de qualquer publicação da taxonomia no Bling.

## Estrutura oficial

`Tipo → Família Croma → Categoria → Subcategoria → Item`

Regras obrigatórias:

- Tipo é `produto` ou `servico`.
- Família é obrigatória para toda categoria nova.
- Categoria é o primeiro nível sincronizável com o ERP.
- Subcategoria é opcional e é o último nível permitido.
- Não existe terceiro nível de categoria.
- Marca, SKU, cor, tamanho ou variação não devem virar categoria.
- Produto ou serviço pode permanecer temporariamente sem categoria durante a auditoria.

## Fluxo atual de auditoria

O fluxo anterior baseado em execuções persistidas, fila e propostas gravadas foi removido.

A tela carrega a base do catálogo e trabalha em páginas de **10 itens**:

1. escolher Produtos ou Serviços;
2. pesquisar por nome ou SKU, quando necessário;
3. filtrar Todos, Sem categoria ou Classificados;
4. opcionalmente filtrar por Família e Categoria;
5. clicar em **Analisar estes 10 com IA**;
6. revisar a sugestão de família, categoria e subcategoria de cada item;
7. visualizar os produtos agrupados pela categoria sugerida;
8. aceitar, corrigir manualmente, deixar sem categoria ou deixar para depois;
9. clicar em **Salvar decisões desta página**;
10. confirmar o resumo antes da gravação.

As sugestões da IA ficam somente na memória do navegador até o usuário salvar. Não existe fila persistente de classificação.

## Aplicação transacional

As decisões são aplicadas pela função `public.apply_taxonomy_audit(jsonb)`.

Cada página é salva em uma única transação. Antes de gravar, o banco valida:

- usuário Owner ou Manager ativo;
- tipo do item igual ao escopo da página;
- família ativa e do mesmo tipo;
- categoria principal ativa, da mesma família e sem pai;
- subcategoria ativa, da mesma família e filha da categoria indicada;
- nenhuma estrutura com terceiro nível.

Se qualquer decisão estiver inconsistente, toda a página é revertida.

Categorias e subcategorias criadas pela auditoria nascem:

- `ativo = true`;
- `public_visible = false`;
- `show_in_navigation = false`.

Assim, criação de estrutura não publica conteúdo automaticamente no site.

## Base comercial da IA

A Edge Function `taxonomy-classify` é stateless e recebe no máximo 10 IDs por chamada.

Ela utiliza:

- nome;
- SKU;
- descrição;
- marca/modelo quando disponíveis;
- famílias oficiais;
- categorias já aprovadas;
- referências comerciais de `taxonomy_market_references`.

A base inicial possui **22 referências comerciais**, com repertório de Kalunga, Mercado Livre e FuturaIM.

A IA deve:

- priorizar terminologia reconhecida no comércio brasileiro;
- reutilizar categoria existente quando adequada;
- propor nova categoria apenas quando reutilizável;
- usar subcategoria apenas quando melhora a navegação;
- indicar confiança, justificativa e `market_basis`;
- reduzir a confiança quando houver ambiguidade.

Faixas de confiança:

- `>= 0.90`: Alta certeza;
- `0.70 a 0.89`: Revisar;
- `< 0.70`: Dúvida.

A IA nunca aplica a sugestão diretamente.

## Visualização dos produtos

Toda sugestão de categoria deve mostrar os itens envolvidos na página atual.

Na aba **Estrutura e produtos**, clicar em uma categoria permite:

- visualizar seus produtos;
- pesquisar por nome ou SKU;
- navegar em páginas de 10;
- mover um produto para outra categoria/subcategoria;
- remover a classificação e deixá-lo sem categoria;
- revisar nome e controles de visibilidade da categoria.

## Visibilidade

Os controles permanecem independentes:

- `ativo`: categoria disponível internamente;
- `public_visible`: categoria permitida no site público;
- `show_in_navigation`: categoria exibida na navegação;
- `featured_home`: categoria destacável na Home.

Categorias internas de custos, composição, equipamentos ou insumos podem permanecer ativas e ocultas do público.

## Integração com Bling

A auditoria local **não publica categorias nem altera categoria de produtos no Bling**.

A publicação no ERP será uma etapa posterior e explícita:

1. aprovar a árvore Croma;
2. criar categorias principais no Bling;
3. criar subcategorias com os pais já resolvidos;
4. armazenar os IDs externos;
5. vincular os produtos;
6. validar o resultado.

As rotinas `bling-product-auto-sync`, `bling-service-auto-sync` e `bling-import-product` aceitam `catalog_category_id = NULL`. Elas não recriam mais categorias técnicas como `bling-importados` ou `bling-servicos-importados`.

Mudanças exclusivamente em `catalog_category_id` não entram nos campos que marcam um produto como pendente de sincronização automática com o Bling.

## Estado validado em 06/09/2026

- famílias ativas: **11**;
- referências comerciais ativas: **22**;
- produtos ativos: **2.137**;
- serviços ativos: **1.173**;
- tabelas antigas `taxonomy_runs`, `taxonomy_category_proposals` e `taxonomy_item_proposals`: **removidas**;
- `taxonomy-classify`: **v4 stateless**;
- controlador duplicado `interno-taxonomy-enhancements.js`: **removido**;
- deploy da nova Central de Taxonomia: **GitHub Pages run 442 — sucesso**.

## Próximo uso

Abrir **Categorias → Auditoria**, manter **Produtos**, revisar a primeira página de 10 itens e clicar em **Analisar estes 10 com IA**. Conferir as sugestões e os produtos envolvidos antes de usar **Salvar decisões desta página**.
