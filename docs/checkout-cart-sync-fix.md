# Correção do registro de pedidos — carrinho e estoque

## Objetivo e causa
No teste do checkout de 23/10/2026, a atualização de estoque retornou HTTP 500 com `permission denied for table carts`. O backend usava `service_role`, que não tinha SELECT em `carts` e `cart_items`. Os logs também mostravam conflitos de chave única nas sincronizações simultâneas.

## Decisão
- Conceder somente SELECT nessas duas tabelas a `service_role`, usado pelo serviço interno que autentica o cliente e seleciona seu carrinho.
- Manter RLS, políticas de propriedade e permissões de clientes inalteradas.
- Serializar `sync_active_cart` por cliente com advisory lock transacional, cobrindo a criação inicial; bloquear também a linha do carrinho durante a substituição dos itens.
- Enfileirar `CromaCart.syncNow()`: o checkout aguarda a gravação e recebe seus erros.
- Exibir mensagens de estoque/conflito sem mostrar detalhes técnicos de permissões.
- Atualizar as referências de cache do checkout para `20261023-1`.

## Sistemas e arquivos
Supabase: `fix_checkout_cart_service_read_and_sync_lock`.
Frontend: `js/cart.js`, `js/checkout.js`, `carrinho/index.html`.

## Validação
- SELECT executado com SET LOCAL ROLE service_role nas duas tabelas: passou.
- Sincronização repetida com ROLE authenticated, usando o vínculo existente: mesmo carrinho e mesma contagem de itens; todas as gravações desfeitas com ROLLBACK.
- Teste JavaScript: três chamadas simultâneas, máximo de uma gravação ativa, propagação de falha e recuperação na chamada seguinte.
- Mensagens de estoque preservadas, conflito orientado e erro de permissão ocultado.
- Sintaxe dos dois scripts validada com Node.
- RLS continua habilitado; anon continua sem leitura; service_role não recebeu UPDATE.
- Advisors de segurança sem novos avisos em comparação com o início desta correção.

## Limites e próximo passo
Não foi criado pedido, pagamento ou reserva de estoque nesta validação. Falta o novo teste autenticado do cliente, incluindo a consulta ao Bling e o registro final. Mercado Pago em produção e integração de frete continuam adiados conforme decisão do usuário.
