# Croma Supplier Catalog v2.1

## Prompt curto para IA

> Converta o arquivo do fornecedor para **Croma Supplier Catalog v2.1**. Preserve exatamente SKU/código e dados de origem. Não invente dados. Normalize dimensões, unidades, quantidade, prazo e preço. Quando o campo do fornecedor chamado “Cores” representar 4X0/4X4/1X0/1X1, grave como `printMode`, não como cor física. Diferencie **opção/atributo**, **variação**, **faixa de quantidade** e **regra de medida**. Use `measurementType=fixed|area|linear|none|unknown`; `pricingUnit=unit|lot|m2|cm2|linear_meter|unknown`; `quantityType=unit|exact|range|free|unknown`; `priceBasis=unit|lot`. Para produtos por medida, preencha limites mínimos/máximos de largura, altura e área apenas quando a origem informar ou houver regra confirmada. Se não houver evidência suficiente, use `unknown` ou omita o campo. Nunca corrija preço por inferência silenciosa: preserve `sourcePrice`, marque `validationStatus=review` e explique em `validationNotes`. Se um preço parecer deslocado, incoerente com a unidade, ou muito diferente do valor vigente, mantenha o valor recebido como candidato de revisão e não o trate como custo validado. Um SKU deve aparecer uma única vez por fornecedor em cada arquivo. Retorne somente XML válido compatível com `supplier-catalog-v2_1.xsd`.

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

Os códigos técnicos permanecem estáveis no XML e no banco; a interface exibe nomes em português:

- `validationStatus=ok` → **Validado**: o preço pode alimentar o vínculo operacional e a precificação.
- `validationStatus=review` → **Revisar**: o item entra na fila de validação e o valor recebido não substitui o preço aprovado.
- `validationStatus=reject` → **Rejeitado**: o item permanece registrado para auditoria, mas não pode alimentar custo operacional.

Itens fora de `ok`, ou com preço zerado/não positivo, deixam produtos e serviços vinculados em **Sob consulta** no catálogo público até a regularização.

### Preço aprovado x preço proposto

O Croma Hub mantém duas noções separadas quando existe suspeita:

- **preço aprovado**: último valor aceito para uso operacional;
- **preço proposto**: novo valor recebido do fornecedor que aguarda validação.

Uma importação suspeita nunca deve apagar silenciosamente o último preço aprovado.

### Detecção automática de anomalias

Além do status informado no XML, o banco aplica uma barreira adicional:

- preço novo igual ou menor que zero → `review`;
- preço novo pelo menos **2 vezes maior** ou **50% menor** que o preço aprovado → `review`;
- mudança de **10 vezes ou mais** para cima, ou para **10% ou menos** do preço anterior → marcada como variação extrema.

Esses limites são uma proteção operacional, não uma correção automática. O usuário continua podendo aprovar o valor recebido, editar o preço a aprovar ou rejeitar o item.

## Regras de atualização

1. O fornecedor é escolhido no Croma Hub; o arquivo não carrega UUID interno.
2. A chave de atualização é **fornecedor + SKU**.
3. Reimportar SKU existente atualiza a mesma linha; SKU novo é acrescentado.
4. SKU ausente de uma versão nova não é apagado/desativado automaticamente.
5. O arquivo original e o histórico da importação permanecem separados do catálogo atual.
6. Preço e dados de origem devem ser preservados para auditoria.
7. Itens `review` e `reject` são persistidos na fila de validação mesmo quando não são selecionados para aplicação operacional.
8. Somente item **ativo + `ok` + preço positivo** pode sincronizar custo para `product_suppliers`, `product_costs` e `product_pricing`.
9. A validação manual registra usuário, data, observação, preço anterior, preço proposto e preço aprovado.
10. Quando um item volta a `ok`, o sistema tenta reconciliar novamente o produto Croma correspondente pelo fornecedor + SKU.

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
