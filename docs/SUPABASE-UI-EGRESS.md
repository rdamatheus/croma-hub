# Redução de egress das interfaces — Croma Hub

Data: 2026-09-23

## Objetivo

Reduzir leituras desnecessárias do Supabase sem remover funcionalidades das telas internas.

Esta fase complementa o hardening das sincronizações do Bling. Os crons do Bling permanecem pausados.

## Produtos internos

### Antes

Ao abrir a tela de Produtos, o navegador carregava em paralelo:

- todos os produtos;
- todos os detalhes de produto;
- todos os snapshots de estoque do Bling;
- fornecedores;
- todos os vínculos produto-fornecedor;
- todas as mídias ativas;
- categorias.

Com aproximadamente 3.318 produtos, o payload binário estimado das tabelas principais era de cerca de **1,36 MB por abertura**, além de várias requisições separadas.

### Depois

A lista usa paginação real no banco através de:

- `internal_products_catalog_snapshot()`: consolida os dados necessários;
- `internal_products_catalog_page(...)`: aplica busca, filtros e paginação no PostgreSQL;
- `internal_product_brand_options()`: retorna apenas as marcas distintas para o filtro.

A interface recebe apenas **50 itens por página**.

Medições:

- primeira página: aproximadamente **16 KB**;
- busca por “adesivo”: aproximadamente **19 KB**;
- catálogo total: 3.318 produtos;
- filtros preservados: status, categoria, Bling, estrutura, origem, estoque, marca, fornecedor, conteúdo, tipo e uso;
- busca preservada por nome, SKU, GTIN, marca, Bling, fornecedor e categoria.

A consulta paginada executou em aproximadamente 71 ms no teste com cache do banco aquecido.

## Propostas

### Antes

Ao abrir a edição de uma proposta, a tela podia carregar até **3.500 produtos** apenas para montar o seletor.

### Depois

- nenhum catálogo completo é carregado antecipadamente;
- busca por nome/SKU é feita sob demanda;
- debounce de 300 ms;
- máximo de **40 produtos por busca**;
- o produto atualmente vinculado é sempre incluído mesmo que esteja fora dos 40 primeiros;
- fornecedor e mídia continuam sendo carregados apenas para o produto selecionado.

## Catálogo de fornecedor

A listagem normal já utilizava paginação de 30 itens e foi preservada.

Foi corrigida apenas uma exceção: filtros de vínculo/divergência.

### Antes

Ao selecionar:
- Vinculado;
- Não vinculado;
- Somente divergências;

a tela executava `fetchAllBase()` e podia baixar todo o catálogo para filtrar no navegador.

Na Zap Gráfica isso significa mais de **21 mil registros**.

### Depois

`supplier_catalog_filtered_page(...)` executa esses filtros no banco e retorna somente a página atual.

Validação na Zap Gráfica:

- Não vinculado: 21.343 resultados, mas apenas **30 registros (~5,7 KB)** transferidos na primeira página;
- Vinculado: 9 itens ativos retornados, aproximadamente **2,3 KB**;
- paginação, busca, categoria, validação, data e ordenação permanecem disponíveis.

## Auditoria controlada — 2026-09-28

Um teste manual de aproximadamente quatro minutos, com navegação em produtos, pedidos, contatos e fornecedores, registrou **2.268 requisições**. Destas, 2.117 eram GETs.

O principal problema estava na ficha de produto: observadores globais de DOM em `product-rules-v21.js` e `interno-produtos-supplier-enhancer.js` reexecutavam consultas sempre que a própria interface sofria mutações. Um único produto chegou a gerar aproximadamente 1.956 requisições repetidas entre `products` e `product_suppliers`.

A correção substitui esses observadores globais por observação restrita ao estado do editor e adiciona proteção contra montagens concorrentes/repetidas. Consultas explícitas após ações do usuário — publicar, vincular fornecedor, trocar preferencial ou salvar — permanecem preservadas.

Também foram encontradas duas outras fontes de leituras evitáveis:

- o catálogo de fornecedor varria mais de 21 mil itens em páginas de 1.000 apenas para descobrir as categorias disponíveis; agora `supplier_catalog_category_options(...)` devolve somente as categorias distintas em uma chamada. No fornecedor medido, foram 141 categorias em cerca de 14 ms no teste direto do banco;
- a busca de contatos disparava a listagem a cada tecla. Agora possui debounce de 300 ms e ignora respostas antigas de requisições sobrepostas.

Na Home pública, a vitrine de serviços também deixou de carregar todos os serviços apenas para montar os cartões de famílias. Ela passa a consultar somente metadados de famílias/categorias nesse fluxo.

Os números pós-correção devem ser medidos novamente após o deploy com o mesmo roteiro do teste controlado; não devem ser inferidos a partir dos números anteriores.

## O que não foi alterado

Para reduzir risco:

- a importação XML de fornecedor continua funcionando como antes;
- exportação CSV continua sendo uma ação explícita que pode ler o catálogo completo;
- nenhuma tabela ou registro comercial foi apagado;
- nenhum arquivo do Storage foi removido;
- nenhum cron do Bling foi reativado;
- nenhum token ou credencial foi alterado.

## Resultado esperado

As telas administrativas deixam de transformar navegação rotineira em cargas de milhares de registros.

A maior redução ocorre em:

1. Produtos internos: ~1,36 MB para ~16–19 KB de dados da lista por página, além da eliminação do loop de consultas da ficha;
2. Propostas: até 3.500 produtos para até 40 por busca;
3. Catálogo de fornecedor com filtros especiais: até 21 mil+ registros para 30 por página e categorias distintas em uma única consulta;
4. Contatos: busca consolidada após 300 ms, em vez de uma nova consulta por tecla.

A próxima etapa deve ser repetir o teste de navegação com os crons pausados e comparar o volume real antes/depois antes de reativar qualquer sincronização automática.
