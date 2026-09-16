# Propostas comerciais — Croma Hub

## Objetivo

O módulo de propostas registra cotações comerciais sem exigir que o contato já exista como cliente no cadastro principal. Uma proposta pode começar apenas com nome e telefone e receber `customer_id` posteriormente.

## Estrutura

### `sales_proposals`

Cabeçalho da proposta:

- número sequencial (`proposal_no`);
- cliente vinculado opcional (`customer_id`);
- nome e telefone informados na cotação;
- status;
- observações e validade;
- moeda;
- usuário que criou;
- datas de criação e atualização.

### `sales_proposal_items`

Cada linha preserva o estado comercial usado no momento da cotação:

- produto interno;
- fornecedor;
- item do catálogo do fornecedor;
- código/SKU do fornecedor;
- quantidade/opção;
- custo-base;
- frete;
- custo total considerado;
- markup recomendado;
- markup aplicado;
- preço unitário e total ofertado.

Uma proposta pode conter várias alternativas de quantidade. Elas são opções da mesma cotação e não devem ser somadas como se todas fossem vendidas juntas.

## Markup padrão do produto

`products.default_markup` armazena o markup comercial padrão/recomendado do produto. Ele serve como referência para novas cotações e não altera retroativamente propostas já salvas.

O markup efetivamente usado em uma cotação fica registrado em `sales_proposal_items.applied_markup`.

## Custos e histórico

Os itens da proposta são snapshots. Alterações futuras em custo, frete ou tabela do fornecedor não modificam a proposta já emitida.

O custo operacional atual do produto continua sendo administrado em `product_suppliers`. Quando houver correspondência segura entre fornecedor + código/SKU do Bling e `supplier_catalog_items`, a conciliação existente do Croma Hub mantém esse vínculo atualizado.

O frete padrão do fornecedor permanece em `suppliers.default_order_freight`. Quando a proposta é criada, o valor usado naquele momento é copiado para o item da proposta.

## Permissões

As tabelas de propostas usam RLS e ficam disponíveis para perfis de gestão (`owner` e `manager`, conforme `app_private.is_manager()`). A área Comercial trata perfis sem essa autorização sem expor os registros.

## Interface

A primeira versão fica em `/interno/comercial/` e permite:

1. informar nome ou empresa;
2. informar telefone;
3. selecionar um produto ativo e vendável;
4. informar o valor ofertado;
5. salvar e consultar as propostas recentes.

O vínculo posterior do contato com `customer_profiles`, emissão de documento/PDF, versionamento de revisões e conversão direta da proposta em pedido ficam como evoluções independentes e não são necessários para o fluxo V1.
