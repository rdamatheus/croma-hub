# Produtos Bling → Croma Hub — etapa concluída

## Escopo encerrado

Esta etapa consolida o espelhamento operacional dos produtos do Bling no Croma Hub sem alterar a taxonomia comercial existente.

O Bling continua sendo a fonte oficial dos produtos. O Croma Hub mantém a organização comercial por `catalog_category_id`, regras de visibilidade, dados complementares e recursos internos de consulta.

## O que ficou implementado

- preservação dos 2.137 produtos existentes;
- manutenção das 4 famílias e da taxonomia já aprovada;
- manutenção da distinção entre produtos comerciais e insumos internos;
- snapshot de estoque proveniente do Bling, sem gerar movimentações artificiais;
- quantidade disponível exposta para uso administrativo;
- normalização de detalhes de cadastro, GTIN, NCM, marca, dimensões e demais campos suportados;
- campos personalizados do Bling em estrutura consultável;
- fornecedores vinculados quando existe correspondência segura no cadastro local;
- snapshot do fornecedor externo quando ainda não existe correspondência local;
- composição de produtos tratada independentemente de variações;
- origem operacional em português: `producao_interna`, `terceirizado`, `revenda` e `misto`;
- proteção para não interpretar automaticamente o código `T` do Bling como terceirização ou revenda sem evidência suficiente;
- filtros administrativos ampliados para estoque, status, categoria, marca, fornecedor, integração, GTIN, NCM, uso e origem operacional.

## Variações — adiado para a próxima etapa

A normalização de produtos pai/filho e grades de variação **não faz parte desta entrega**.

Nesta etapa final:

- `product_variants` não recebe projeções automáticas do Bling;
- `product_option_groups` e `product_options` não são gerados a partir de `variacao.nome`;
- `parent_product_id` e `bling_parent_id` não são preenchidos automaticamente;
- o sistema não consolida produtos em grades;
- atributos de variação como cor, tamanho ou ponta serão tratados em uma etapa específica posterior.

A informação bruta do Bling continua preservada em `metadata.bling_raw`, permitindo executar essa próxima etapa sem perder dados.

## Regras preservadas

A classificação continua seguindo:

```text
Família
  ↓
Categoria
  ↓
Subcategoria
  ↓
Produto
```

A fonte definitiva da classificação é:

```text
products.catalog_category_id
```

Não foram alterados preços, SKUs, IDs do Bling, estoque fiscal ou categorias como parte da classificação.

Produtos internos permanecem com a regra:

```text
is_input = true
is_sellable = false
```

Serviços permanecem fora da automação desta etapa.

## Estado validado ao encerrar

```text
Produtos:                    2.137
Produtos categorizados:      2.137
Insumos internos:               62
Comerciais elegíveis:        2.075
Variações normalizadas:          0
Vínculos pai/filho automáticos:  0
Snapshots de estoque Bling:  2.121
```

A próxima etapa pode tratar exclusivamente de normalização de variações e eventual agrupamento de produtos repetidos, sem reabrir esta base operacional.
