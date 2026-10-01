# Configurador de panfletos — Zap Gráfica

## Objetivo

Centralizar no Croma Hub a grade de panfletos da Zap Gráfica sem criar produtos paralelos ou duplicar identidade comercial. A solução reutiliza o produto pai existente `PANFLETOS COUCHÊ` e resolve cada configuração para um SKU real do catálogo do fornecedor.

## Produto e fornecedor

- Produto pai Croma: `e63f590f-df39-4450-bcfd-8beaf781e119` (`PANFLETOS COUCHÊ`).
- Fornecedor: Zap Gráfica (`3fee83e7-8b01-46cc-8b00-01f9e9268e3e`).
- Categoria de origem: `PANFLETOS, FLYERS E FOLHETOS`.
- Categoria comercial existente reutilizada: `Flyers e Panfletos`.
- A identidade e os vínculos do produto pai com o Bling são preservados.

## Dimensões do configurador

A seleção é feita em cascata, mostrando somente combinações que existem no catálogo ativo da Zap:

1. Tamanho.
2. Papel.
3. Impressão.
4. Acabamento.
5. Quantidade.

Cada combinação completa corresponde a exatamente uma linha de `product_variants`, vinculada ao item de origem por `product_suppliers.supplier_catalog_item_id` e pelo SKU do fornecedor.

## Acabamentos

A origem da Zap não possui um campo normalizado de acabamento em todos os registros. Para distinguir combinações que seriam idênticas apenas por tamanho, papel, impressão e quantidade, foi adotada a regra de classificação abaixo:

- SKU iniciado por `PFV`: verniz localizado frente e verso.
- SKU contendo `UV` ou iniciado por `PB700`: verniz UV total frente e verso.
- Demais SKUs: sem acabamento especial.

A classificação atual está registrada como versão `1` no metadata do produto pai.

## Preço de custo e venda

O preço de compra permanece vinculado ao SKU da Zap em `product_suppliers.purchase_price`. Não é criado um custo manual paralelo.

O frete padrão da Zap é um custo por pedido, atualmente `R$ 18,00`, armazenado em `suppliers.default_order_freight`. Por isso, `product_suppliers.freight_cost` permanece zero nas variações para impedir que o mesmo frete seja somado várias vezes ao juntar produtos no mesmo pedido.

A grade inicial de venda usa markup padrão `2,5x`:

```text
preço recomendado = (preço de compra Zap + frete padrão do pedido) × 2,5
```

O valor fica salvo em `product_variants.base_price` como referência inicial. Ajustes comerciais posteriores podem ser feitos sem alterar o preço-fonte do fornecedor.

Ao cotar vários itens da Zap em um mesmo pedido, o frete deve ser consolidado uma única vez na proposta, em vez de ser repetido em cada linha.

## Interface interna

Na ficha interna do produto pai é carregado `js/interno-produtos-panfletos-configurator-v1.js`.

O painel mostra:

- seletores em cascata;
- SKU Zap resolvido;
- custo do fornecedor;
- frete do pedido;
- custo total considerado;
- markup padrão;
- preço recomendado total;
- preço unitário;
- lucro e margem bruta estimados;
- prazo do fornecedor.

## Validação inicial — 30/09/2026

- 5 grupos de opções ativos.
- 688 combinações/SKUs ativos da categoria de panfletos da Zap vinculados.
- 688 valores de combinação distintos.
- 688 vínculos de fornecedor ativos.
- Nenhuma combinação ambígua após incluir a dimensão de acabamento.
- SKU `PD848`: custo Zap `R$ 381,00`; com frete de `R$ 18,00` e markup `2,5x`, preço-base calculado `R$ 997,50`.
- SKU `P101525UV`: classificado como verniz UV total F/V.
- SKU `PFV06`: classificado como verniz localizado F/V.

## Limites e próximos passos

Esta entrega cria a grade e o configurador no ambiente interno do Croma Hub. Ela não altera automaticamente a apresentação pública do site nem substitui regras específicas de preço aprovadas depois. Futuras sincronizações do catálogo da Zap devem preservar o vínculo pelo SKU/item de origem e recalcular preços somente quando a política comercial assim determinar.
