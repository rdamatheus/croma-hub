# Croma Supplier Catalog v2.1

## Prompt curto para IA

> Converta o arquivo do fornecedor para **Croma Supplier Catalog v2.1**. Preserve exatamente SKU/código e dados de origem. Não invente dados. Normalize dimensões, unidades, quantidade, prazo e preço. Quando o campo do fornecedor chamado “Cores” representar 4X0/4X4/1X0/1X1, grave como `printMode`, não como cor física. Diferencie **opção/atributo**, **variação**, **faixa de quantidade** e **regra de medida**. Use `measurementType=fixed|area|linear|none|unknown`; `pricingUnit=unit|lot|m2|cm2|linear_meter|unknown`; `quantityType=unit|exact|range|free|unknown`; `priceBasis=unit|lot`. Para produtos por medida, preencha limites mínimos/máximos de largura, altura e área apenas quando a origem informar ou houver regra confirmada. Se não houver evidência suficiente, use `unknown` ou omita o campo. Nunca corrija preço por inferência silenciosa: preserve `sourcePrice`, marque `validationStatus=review` e explique em `validationNotes`. Um SKU deve aparecer uma única vez por fornecedor em cada arquivo. Retorne somente XML válido compatível com `supplier-catalog-v2_1.xsd`.

## Conceitos oficiais

- **Produto pai**: produto comercial principal.
- **Grupo de opções**: dimensão de escolha, como material, tamanho, modo de impressão, acabamento ou cor.
- **Opção / atributo**: valor dentro de um grupo, como `440g`, `4X0` ou `laminação fosca`.
- **Variação**: combinação concreta de opções que pode ter SKU, custo ou estoque próprios.
- **Faixa de quantidade**: regra de preço por volume; não vira variação só porque a quantidade muda.
- **Quantidade exata**: preço válido apenas para aquela quantidade fechada, como 500 cartões.
- **Quantidade em intervalo**: preço válido de uma quantidade mínima até uma máxima, como 15–24 fotos.
- **Quantidade livre**: qualquer quantidade aceita segundo a mesma regra.
- **Regra de medida**: define como dimensões participam do cálculo: fixo, área, linear ou sem medida.
- **Configuração**: conjunto de opções, quantidade e medidas escolhido para orçamento/pedido.

## Quantidade

- `quantityType=exact`: `minQuantity` e `maxQuantity` devem ser iguais.
- `quantityType=range`: use `minQuantity` e `maxQuantity`; `maxQuantity` pode ser omitido para “a partir de”.
- `quantityType=free`: quantidade livre; limites podem ser omitidos.
- `priceBasis=unit`: `purchasePrice` é por unidade dentro da regra.
- `priceBasis=lot`: `purchasePrice` é pelo lote/faixa fechada.

## Medidas

Para itens por área/medida, podem existir:
- `minWidth`, `maxWidth`
- `minHeight`, `maxHeight`
- `minArea`, `maxArea`
- `dimensionUnit=mm|cm|m`

Não inferir limites técnicos sem fonte confirmada.

## Validação

- `validationStatus=ok`: pode ser importado normalmente.
- `validationStatus=review`: pode ser revisado manualmente antes de atualizar o catálogo operacional.
- `validationStatus=reject`: não deve ser importado.

## Regras de atualização

1. O fornecedor é escolhido no Croma Hub; o arquivo não carrega UUID interno.
2. A chave de atualização é **fornecedor + SKU**.
3. Reimportar SKU existente atualiza a mesma linha; SKU novo é acrescentado.
4. SKU ausente de uma versão nova não é apagado/desativado automaticamente.
5. O arquivo original e o histórico da importação permanecem separados do catálogo atual.
6. Preço e dados de origem devem ser preservados para auditoria.

## Obrigatoriedade

Obrigatórios por item:
- `sku`
- `purchasePrice`
- `validationStatus`

Obrigatórios quando aplicáveis:
- `measurementType`, `pricingUnit` para produtos por medida
- `quantityType`, `priceBasis` quando houver regra de quantidade

Recomendados:
- `name`, `category`, `printMode`, `weight`, `baseQuantity`, `leadTimeDays`, `sourcePrice`, `parentKey`

## Versionamento

- Mudança apenas de preço/dados: mantém a versão.
- Novo campo opcional compatível: versão menor, como 2.0 → 2.1.
- Mudança incompatível: versão maior.
- v1 e v2 permanecem aceitas para histórico/compatibilidade.