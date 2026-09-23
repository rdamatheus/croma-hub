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

## O que não foi alterado

Para reduzir risco:

- a ficha individual de produto não foi simplificada;
- a importação XML de fornecedor continua funcionando como antes;
- exportação CSV continua sendo uma ação explícita que pode ler o catálogo completo;
- nenhuma tabela ou registro comercial foi apagado;
- nenhum arquivo do Storage foi removido;
- nenhum cron do Bling foi reativado;
- nenhum token ou credencial foi alterado.

## Resultado esperado

As telas administrativas deixam de transformar navegação rotineira em cargas de milhares de registros.

A maior redução ocorre em:

1. Produtos internos: ~1,36 MB para ~16–19 KB de dados da lista por página;
2. Propostas: até 3.500 produtos para até 40 por busca;
3. Catálogo de fornecedor com filtros especiais: até 21 mil+ registros para 30 por página.

A próxima etapa deve ser observar o uso real do Supabase com os crons pausados e estas páginas paginadas antes de reativar sincronizações automáticas.
