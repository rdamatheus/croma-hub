# Segurança do catálogo público

## Objetivo

Separar explicitamente a vitrine comercial pública dos dados internos do Croma Hub.

O visitante pode consultar as informações necessárias para conhecer, comprar ou solicitar orçamento de produtos e serviços. Custos, margens, fornecedores, notas internas, dados de sincronização e instruções operacionais permanecem privados.

## Camada pública

A view `public.public_catalog_products` é a fonte preferencial do frontend público. Ela expõe somente dados comerciais de itens elegíveis e um subconjunto sanitizado de `metadata` usado para apresentação.

Critérios de elegibilidade:

- item ativo;
- item vendável;
- item não classificado como insumo;
- categoria ativa e `public_visible = true`;
- produtos podem ser exibidos quando atendem aos critérios acima;
- serviços exigem também `published_on_site = true`.

Campos comerciais expostos incluem nome, SKU, slug, descrição, descrição curta, preço de venda, classificação pública e metadados de apresentação permitidos.

## Dados privados

Não fazem parte da camada pública:

- custos e margens;
- preço de compra;
- fornecedores;
- notas internas;
- erros e estados de sincronização com Bling;
- instruções internas de execução;
- metadados operacionais não destinados ao cliente.

`product_costs` e `product_suppliers` continuam protegidas por RLS para perfis internos autorizados.

## Serviços

`public.public_service_details` expõe somente detalhes de serviço apropriados à divulgação: prazo orientativo, necessidade de arte e necessidade de aprovação do cliente.

`execution_instructions`, `production_type` e `service_metadata` permanecem privados.

## Categorias

A política pública de `catalog_categories` permite leitura somente de registros ativos e públicos. A verificação de equipe foi separada em uma policy própria usando `app_private.is_staff()`, evitando que uma consulta anônima dependa diretamente da tabela `profiles`.

## Compatibilidade temporária

A tabela mestre `products` mantém um grant público restrito às colunas exigidas por versões antigas do frontend em cache. A policy `products_public_read_catalog` restringe essas linhas aos mesmos critérios comerciais da vitrine. Campos como `notes` e dados técnicos do Bling não possuem leitura anônima.

Novas páginas públicas devem consultar `public_catalog_products`, e não a tabela mestre `products`.

## Upload de arquivos

O carrinho não injeta mais o componente de upload em qualquer rota `/servicos/`. O uploader só pode ser criado quando existe um host explícito de serviço (`data-croma-upload-host`, `.config`, `.config-drawer` ou `.product-head`). A listagem geral `/servicos/` não é um ponto de upload.

## Validação realizada

- leitura anônima de famílias e categorias públicas executada sem dependência de `profiles`;
- custo e fornecedor confirmados como indisponíveis para `anon`;
- preço de venda confirmado como legível para `anon`;
- `notes` e `bling_sync_error` confirmados como indisponíveis para `anon`;
- migrations de segurança aplicadas e versionadas;
- frontend público alterado para usar `public_catalog_products`;
- cache bust aplicado aos scripts da página de serviços;
- deploy do GitHub Pages validado com sucesso após a correção.

## Pendência de conteúdo

No momento da correção, os serviços comerciais existentes estavam com `published_on_site = false`. Eles não foram publicados em massa por segurança editorial. A publicação de serviços deve ocorrer após revisão ou mediante uma nova regra de negócio explicitamente aprovada.
