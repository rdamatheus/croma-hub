# Sincronização de fornecedores — Bling → catálogo Croma

Data: 2026-09-11

## Objetivo

Vincular automaticamente o fornecedor informado no cadastro do produto/serviço do Bling ao fornecedor correspondente no Croma Hub e, quando existir o mesmo código/SKU no catálogo desse fornecedor, utilizar a tabela do fornecedor como fonte do custo operacional.

## Regra principal

O campo `fornecedor.codigo` recebido do Bling representa o código/SKU do item no respectivo fornecedor.

Fluxo de conciliação:

```text
Produto/serviço no Bling
  ↓
fornecedor.contato.id + fornecedor.codigo
  ↓
Contato Bling → customer_profiles / erp_entity_mappings
  ↓
Fornecedor operacional em suppliers
  ↓
Busca exata por supplier_catalog_items.supplier_id + supplier_catalog_items.sku
  ↓
product_suppliers
```

A busca do SKU é feita sem diferenciar maiúsculas/minúsculas e desconsiderando espaços nas extremidades. O fornecedor faz parte obrigatória da chave de conciliação: o mesmo código em outro fornecedor não é considerado correspondente.

## Fonte dos valores

Quando há correspondência segura entre fornecedor e SKU:

- `product_suppliers.supplier_sku`: código do catálogo do fornecedor;
- `product_suppliers.purchase_price`: `supplier_catalog_items.purchase_price`;
- `product_suppliers.freight_cost`: frete padrão do fornecedor, quando configurado;
- `product_suppliers.effective_unit_cost`: calculado automaticamente pelo banco;
- `product_costs.cost`: preço de compra do catálogo do fornecedor quando o vínculo é preferencial;
- `product_pricing.effective_cost`: custo efetivo do vínculo preferencial.

O `precoCompra` e o `precoCusto` recebidos do Bling continuam preservados no snapshot de integração para auditoria, mas não substituem o custo da tabela do fornecedor quando há um item de catálogo correspondente.

## Produtos e serviços

A regra atende registros de `products` tanto de tipo `produto` quanto `servico`.

Produtos continuam passando pela normalização operacional já existente. Serviços passam a ter o fornecedor externo espelhado e são conciliados quando o fornecedor ou o código do fornecedor muda no Bling.

Não foi executado um vínculo em massa dos serviços legados apenas com base em dados antigos, para evitar propagar automaticamente eventuais inconsistências históricas dos catálogos de fornecedores.

## Atualização do catálogo do fornecedor

Quando um item já vinculado em `product_suppliers` tem seu registro correspondente alterado em `supplier_catalog_items`, o vínculo operacional é atualizado automaticamente, incluindo preço de compra, frete padrão, prazo, quantidade mínima e descrição. Se o fornecedor for o preferencial, o custo utilizado na precificação também é atualizado.

## Exemplo validado — Zap Gráfica / VA11

Exemplo testado com o serviço do Bling `ADESIVO VINIL (UV LÁTEX - COR: 4/0) CORTE:RETO;TIPO:AUTOMOTIVO`:

- fornecedor no Bling: `ZAP GRAFICA ONLINE LTDA`;
- contato Bling: `16861477109`;
- código no fornecedor: `VA11`;
- fornecedor local identificado: `Zap Gráfica`;
- item do catálogo identificado pelo SKU: `VA11`;
- preço de compra do catálogo: `R$ 83,50`;
- frete padrão configurado do fornecedor: `R$ 17,00`;
- custo efetivo calculado: `R$ 100,50`.

O vínculo ficou gravado em `product_suppliers` com referência ao item correto de `supplier_catalog_items`.

## Correção de dado identificada durante a validação

O SKU `VA11` estava armazenado no catálogo da Zap com preço `8350.00`, enquanto o valor correto validado era `83.50`. O registro foi corrigido pontualmente e recebeu anotação de validação.

Foi identificada evidência de que outros itens antigos do catálogo v1 da Zap podem ter problemas semelhantes de escala decimal. Nenhuma correção em massa foi executada sem validação. Recomenda-se uma auditoria específica dos preços do catálogo antes de qualquer reconciliação retroativa em lote.

## Segurança e comportamento em caso de ausência de correspondência

A conciliação automática só grava o vínculo quando existem simultaneamente:

1. fornecedor informado no Bling;
2. contato do fornecedor mapeado para o Croma Hub;
3. cadastro operacional ativo do fornecedor;
4. código do fornecedor não vazio;
5. item ativo no catálogo do mesmo fornecedor com SKU correspondente.

Se qualquer uma dessas condições falhar, o dado bruto do Bling permanece preservado para diagnóstico, mas nenhum item de catálogo de outro fornecedor é associado por aproximação.

## Validação executada

- sincronização direcionada do exemplo `VA11` diretamente do Bling;
- confirmação do código recebido no `metadata.bling_raw`;
- confirmação do snapshot do fornecedor;
- confirmação do vínculo com `supplier_catalog_items`;
- confirmação do preço de compra em `product_suppliers`;
- confirmação do cálculo do custo efetivo;
- teste transacional de alteração do preço no catálogo, confirmando propagação para vínculo, `product_costs` e `product_pricing`, seguido de rollback.
