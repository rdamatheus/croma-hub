# Croma Supplier Catalog XML v1

Use este texto como prompt junto com qualquer tabela de fornecedor:

> Converta o arquivo para **Croma Supplier Catalog XML v1**. Preserve exatamente o SKU/código do fornecedor. Gere um único `<item>` por SKU. Não invente dados. Use ponto como separador decimal. Campos ausentes devem ser omitidos ou ficar vazios. Dados específicos que não tenham campo próprio devem ir em `<attributes>`. Não crie produtos Croma, não altere nomes/códigos por conta própria e não duplique SKU. Retorne somente XML válido compatível com `supplier-catalog-v1.xsd`.

## Campos principais

Obrigatórios por item:
- `sku`
- `purchasePrice`

Recomendados:
- `name`
- `description`
- `category`
- `minimumOrderQuantity`
- `leadTimeDays`
- `weight`
- `unit`
- `width`
- `height`
- `depth`

Dados não padronizados devem ser registrados em:

```xml
<attributes>
  <attribute name="material">Vinil branco</attribute>
  <attribute name="cores">4x0</attribute>
</attributes>
```

## Regras de consistência

1. `supplierCatalog` deve ter `version="1.0"`.
2. Não repetir SKU dentro do mesmo arquivo.
3. Preços devem ser números sem `R$` e com ponto decimal, por exemplo `36.50`.
4. Quantidades e prazos devem ser numéricos quando existirem.
5. Não colocar ID interno da Croma no XML.
6. O fornecedor é escolhido no Croma Hub antes do upload; portanto o XML não precisa carregar UUID do fornecedor.
7. Uma nova importação atualiza o catálogo atual por **fornecedor + SKU**; não cria uma nova tabela de preços paralela.
