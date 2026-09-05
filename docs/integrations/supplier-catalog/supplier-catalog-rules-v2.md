# Croma Supplier Catalog v2

## Prompt curto para IA

> Converta o arquivo do fornecedor para **Croma Supplier Catalog v2**. Preserve exatamente SKU/código e dados de origem. Não invente dados. Normalize dimensões, unidades, quantidade, prazo e preço. Quando o campo do fornecedor chamado “Cores” representar 4X0/4X4/1X0/1X1, grave como `printMode` (modo de impressão), não como cor física. Diferencie **opção/atributo**, **variação**, **faixa de quantidade** e **regra de medida**. Use `measurementType` = `fixed|area|linear|none|unknown`; `pricingUnit` = `unit|lot|m2|cm2|linear_meter|unknown`; `quantityType` = `unit|tier|free|unknown`. Se não houver evidência suficiente, use `unknown`. Nunca corrija preço por inferência silenciosa: preserve `sourcePrice`, marque `validationStatus=review` e explique em `validationNotes`. Um SKU deve aparecer uma única vez por fornecedor em cada arquivo. Retorne somente XML válido compatível com `supplier-catalog-v2.xsd`.

## Conceitos oficiais

- **Opção / atributo**: uma dimensão de escolha, como material, tamanho, modo de impressão, acabamento ou cor.
- **Variação**: uma combinação concreta de opções que pode ter SKU, custo ou estoque próprios.
- **Faixa de quantidade**: preço/regra por volume. Não deve virar variação apenas porque muda a quantidade.
- **Acabamento**: família de opção/atributo técnico (laminação, dobra, refile, ilhós etc.).
- **Modo de impressão**: família de opção/atributo gráfico (4X0, 4X4, 1X0, 1X1 etc.).
- **Regra de medida**: define como as dimensões entram no cálculo: tamanho fixo, área, comprimento linear ou sem medida.
- **Produto pai**: produto comercial principal que reúne variações e faixas de quantidade.

## Regras de atualização

1. O fornecedor é escolhido no Croma Hub; o arquivo não carrega UUID interno.
2. A chave operacional de atualização é **fornecedor + SKU**.
3. Reimportar um SKU existente atualiza o catálogo atual; SKU novo é acrescentado.
4. Um SKU ausente de uma versão nova **não deve ser apagado ou desativado automaticamente** sem uma política explícita de descontinuação.
5. Preserve `sourcePrice` e outras informações de origem para auditoria.
6. `validationStatus=review` indica que a IA detectou dúvida ou inconsistência e o item deve ser conferido antes de automação.

## Versionamento

- Alterar apenas preços, prazos, quantidades ou conteúdo do catálogo **não muda a versão do padrão**.
- Novo campo opcional compatível: incrementar versão menor (ex.: 2.0 → 2.1).
- Mudança estrutural incompatível: incrementar versão maior (ex.: 2.x → 3.0).
- Versões antigas permanecem documentadas para histórico e compatibilidade.
