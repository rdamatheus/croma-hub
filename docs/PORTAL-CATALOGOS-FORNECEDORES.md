# Portal administrativo de catálogos de fornecedores

Data: 2026-09-12

## Objetivo

Disponibilizar no Croma Hub uma área administrativa dedicada aos fornecedores e aos catálogos atualmente importados, preservando a regra de conciliação já adotada entre Bling, fornecedor e SKU.

## Rotas

- `/interno/fornecedores/` — visão geral dos fornecedores.
- `/interno/fornecedores/catalogo/?supplier=<uuid>` — catálogo atual de um fornecedor.
- `/interno/fornecedores/item/?item=<uuid>` — detalhe e auditoria de um item do catálogo.

## Regras de acesso

A área é restrita a `owner` e `manager`. Custos, fretes e dados de fornecedor não foram expostos ao site público nem ao perfil `equipe`.

## Tela de fornecedores

O campo **Fornecedor** é um seletor baseado exclusivamente nos fornecedores cadastrados. Não existe entrada livre. Caso o fornecedor ainda não exista, o botão **Novo fornecedor** reutiliza o cadastro rápido já existente.

Filtros implementados:

- fornecedor;
- status ativo/inativo;
- possui catálogo;
- atualização do catálogo;
- possui vínculos Croma;
- somente divergências.

A tela apresenta ainda indicadores de fornecedores ativos, fornecedores com catálogo, vínculos operacionais e divergências.

## Tela do catálogo

Exibe o catálogo atual do fornecedor com paginação, pesquisa por SKU/nome, categoria, situação de validação, vínculo com produtos Croma, período de atualização e divergências.

Funcionalidades:

- abrir detalhe do item;
- atualizar/importar a tabela do fornecedor já selecionado;
- histórico de importações;
- exportação CSV do catálogo atual;
- atalhos para itens sem vínculo e divergências.

## Detalhe do item

Consolida em uma única tela:

- dados do catálogo do fornecedor;
- código e valores recebidos do Bling;
- produto/serviço Croma vinculado;
- preço do catálogo;
- frete padrão do fornecedor;
- custo efetivo;
- custo aplicado na precificação;
- linha do tempo técnica;
- verificações de conciliação.

O botão **Reprocessar vínculo** usa a Edge Function `croma-supplier-reconcile`, protegida por JWT e por validação adicional de perfil `owner`/`manager`, e aciona a função interna `croma_reconcile_bling_supplier_catalog` por service role. A service role não é exposta ao navegador.

A ação de desvinculação só é habilitada quando já existe outro fornecedor ativo para o mesmo produto, evitando deixar o produto sem fonte operacional de custo por essa tela.

## Definição de divergência

Um vínculo é sinalizado quando existe uma das condições:

1. preço de compra do snapshot do Bling diferente do preço atual do item no catálogo do fornecedor por mais de R$ 0,01; ou
2. código do fornecedor no snapshot do Bling diferente do SKU do item atualmente vinculado.

O catálogo do fornecedor continua sendo a fonte do custo operacional quando a conciliação segura por fornecedor + SKU existe.

## Integração com fluxo existente

O importador XML existente foi reutilizado. O antigo botão **Catálogos de fornecedores** da tela de produtos passa a direcionar para a nova área dedicada, evitando manter duas interfaces concorrentes para a mesma consulta.
