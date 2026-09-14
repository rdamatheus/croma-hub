# Portal administrativo de catálogos de fornecedores

Data: 2026-09-13

## Objetivo

Disponibilizar no Croma Hub uma área administrativa dedicada aos fornecedores e aos catálogos atualmente importados, preservando a regra de conciliação entre Bling, fornecedor e SKU e adicionando uma camada segura de validação de custos.

## Rotas

- `/interno/fornecedores/` — visão geral dos fornecedores.
- `/interno/fornecedores/catalogo/?supplier=<uuid>` — catálogo atual de um fornecedor e fila de validação.
- `/interno/fornecedores/item/?item=<uuid>` — detalhe, validação e auditoria de um item do catálogo.

## Regras de acesso

A área é restrita a `owner` e `manager`. Custos, fretes, preços candidatos e dados de fornecedor não são expostos ao perfil `equipe` nem diretamente ao catálogo público.

## Tela de fornecedores

O campo **Fornecedor** é um seletor baseado exclusivamente nos fornecedores cadastrados. Não existe entrada livre. Caso o fornecedor ainda não exista, o botão **Novo fornecedor** reutiliza o cadastro rápido já existente.

Filtros implementados:

- fornecedor;
- status ativo/inativo;
- possui catálogo;
- atualização do catálogo;
- possui vínculos Croma;
- somente divergências.

A tela apresenta indicadores de fornecedores ativos, fornecedores com catálogo, vínculos operacionais e divergências.

## Tela do catálogo

Exibe o catálogo atual do fornecedor com paginação, pesquisa por SKU/nome, categoria, situação de validação, vínculo com produtos Croma, período de atualização e divergências.

Funcionalidades:

- abrir detalhe do item;
- atualizar/importar a tabela do fornecedor já selecionado;
- histórico de importações;
- exportação CSV do catálogo atual;
- atalhos para itens sem vínculo e divergências;
- contadores de **Validado**, **Revisar** e **Rejeitado**;
- seleção das linhas visíveis;
- validação, revisão e rejeição em lote, limitada a 200 itens por operação;
- exibição do preço proposto quando ele estiver aguardando validação.

## Estados de validação

Os códigos técnicos continuam sendo `ok`, `review` e `reject`, mas a interface usa:

- **Validado** — pode alimentar o custo operacional;
- **Revisar** — aguarda conferência;
- **Rejeitado** — não deve alimentar o custo.

Um item só pode participar da conciliação operacional quando estiver simultaneamente:

- ativo;
- com status `ok`;
- com preço aprovado maior que zero.

## Preço aprovado e preço proposto

Quando chega um preço suspeito, o Croma Hub não substitui o custo anterior. O item guarda:

- `purchase_price` — último preço aprovado;
- `pending_purchase_price` — novo preço recebido que precisa de validação.

Assim, uma tabela com um erro como `R$ 8.350,00` no lugar de `R$ 83,50` não contamina automaticamente a precificação existente.

## Detecção automática de preço suspeito

Existe uma barreira de banco de dados antes de qualquer atualização operacional:

- valor igual ou menor que zero → **Revisar**;
- preço novo >= 2 vezes o aprovado → **Revisar**;
- preço novo <= 50% do aprovado → **Revisar**;
- aumento >= 10 vezes ou queda para <= 10% do anterior recebe motivo de **variação extrema**.

A barreira apenas classifica e preserva o candidato. Ela não corrige preço por inferência.

## Importação e fila de validação

O importador XML continua selecionando automaticamente somente os itens marcados como `ok`.

Uma ponte adicional persiste também os itens `review` e `reject`, mesmo quando eles não são escolhidos para aplicação operacional. Isso faz com que a fila de validação represente integralmente o arquivo convertido, sem obrigar o usuário a aplicar um preço suspeito.

O arquivo original e o histórico de importação continuam preservados separadamente.

## Detalhe do item

A tela consolida:

- dados do catálogo do fornecedor;
- código e valores recebidos do Bling;
- produto/serviço Croma vinculado;
- preço aprovado atual;
- preço proposto;
- variação percentual;
- motivos da revisão;
- frete padrão do fornecedor;
- custo efetivo;
- custo aplicado na precificação;
- linha do tempo técnica;
- histórico de validação.

Ações disponíveis:

- **Validar e aplicar preço** — aceita o valor informado e libera o item para uso operacional;
- **Manter em revisão** — mantém o valor candidato sem alterar o custo aprovado;
- **Rejeitar** — exige justificativa e impede o uso operacional;
- **Reprocessar vínculo** — tenta novamente a conciliação com o produto Croma.

As ações de validação usam a Edge Function `croma-supplier-validation`, com JWT e validação adicional do perfil `owner`/`manager`. A service role permanece somente no servidor.

## Histórico de validação

A tabela `supplier_catalog_validation_events` registra mudanças relevantes com:

- item e fornecedor;
- status anterior e novo;
- preço anterior;
- preço proposto;
- preço aprovado;
- motivos;
- observação;
- origem da decisão;
- usuário responsável;
- data/hora.

A tabela possui RLS e leitura restrita à gestão.

## Regra “Sob consulta” no site

A view pública `public_catalog_products` bloqueia preço comercial quando o fornecedor preferencial do produto estiver associado a um item do catálogo que:

- esteja em `review` ou `reject`; ou
- tenha preço aprovado zerado/não positivo.

Nessas situações, `preco` e/ou `commercial_min_price` deixam de ser expostos para compra/preço direto e o frontend reaproveita o comportamento já existente de **Sob consulta / solicitar orçamento**.

Em serviços com opções filhas, opções bloqueadas não participam do cálculo de “A partir de”.

## Conciliação com Bling e produto Croma

O SKU do fornecedor continua sendo a chave da conciliação dentro do respectivo fornecedor.

As rotinas:

- `croma_reconcile_bling_supplier_catalog`;
- `croma_supplier_catalog_reconcile_links_trigger`;
- `link_product_to_supplier_catalog`;

só aplicam itens validados e com preço positivo. Quando um item é validado manualmente, o sistema tenta reconciliar novamente os produtos cujo snapshot do Bling possui o mesmo fornecedor + SKU.

## Definição de divergência

Um vínculo também pode ser sinalizado quando:

1. preço de compra do snapshot do Bling difere do preço aprovado do catálogo por mais de R$ 0,01; ou
2. código do fornecedor no snapshot do Bling difere do SKU do item atualmente vinculado.

A divergência de Bling e a validação do catálogo são sinais complementares: a primeira compara fontes; a segunda decide se o valor do fornecedor está apto para uso operacional.
