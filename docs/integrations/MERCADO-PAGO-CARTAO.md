# Mercado Pago — cartão de crédito

## Estado desta versão

A integração está deliberadamente limitada ao ambiente `test` e à validação interna por usuários `owner` ou `manager` ativos. Produção não é habilitada por este código.

Enquanto as Edge Functions e credenciais de teste não estiverem ativas, o checkout público mantém o fluxo anterior de confirmação manual pelo WhatsApp.

## Componentes

- `public.payments`: tentativas e estado consolidado do pagamento.
- `public.payment_events`: auditoria resumida dos eventos de pagamento.
- `checkout_active_cart`: pedidos com `payment_method = credito` nascem em `aguardando_pagamento`.
- `mercado-pago-card`: configuração, criação da cobrança via Orders API e consulta de status.
- `mercado-pago-webhook`: valida assinatura do Mercado Pago, consulta a Order e sincroniza pedido/pagamento.
- `js/checkout.js`: Card Payment Brick, retries, 3DS e fallback manual.

## Segurança

- Access Token e segredo do webhook nunca entram no frontend nem no GitHub.
- Número completo do cartão, CVV e token do cartão não são persistidos no banco da Croma.
- O valor cobrado vem do `orders.total` no backend, nunca do valor enviado pelo navegador.
- Cada tentativa usa `X-Idempotency-Key` e `payments.idempotency_key` único.
- Webhook valida `x-signature` antes de consultar e aplicar o estado da Order.
- Produção permanece bloqueada por `MERCADO_PAGO_ENVIRONMENT = test` e por regra explícita das funções.

## Secrets necessários no Supabase

Configurar diretamente no Supabase; não enviar estes valores por chat nem gravar no repositório:

```text
MERCADO_PAGO_ENVIRONMENT=test
MERCADO_PAGO_PUBLIC_KEY=<public key de teste>
MERCADO_PAGO_ACCESS_TOKEN=<access token de teste>
MERCADO_PAGO_WEBHOOK_SECRET=<secret do webhook de teste>
```

## Deploy das funções

- `mercado-pago-card`: JWT obrigatório (`verify_jwt = true`).
- `mercado-pago-webhook`: JWT do Supabase desabilitado (`verify_jwt = false`), pois a autenticação é feita pela assinatura do Mercado Pago.

Webhook:

```text
https://xtlubocepsbqanrjabog.supabase.co/functions/v1/mercado-pago-webhook
```

Configurar no Mercado Pago para notificações de Order e copiar o secret gerado para `MERCADO_PAGO_WEBHOOK_SECRET`.

## Fluxo

1. Cliente monta o carrinho e chega ao pagamento.
2. Para cartão online habilitado, o Card Payment Brick tokeniza o cartão no navegador.
3. O Croma registra o pedido em `aguardando_pagamento` antes da cobrança.
4. O carrinho local é limpo, mas o pedido pendente é preservado na sessão para permitir retry/reload.
5. `mercado-pago-card` usa o total do pedido e cria a Order no Mercado Pago.
6. Aprovado: pedido vira `pago`.
7. Processando/3DS: pedido permanece `aguardando_pagamento`; frontend consulta status e webhook atualiza de forma assíncrona.
8. Recusado: o pedido permanece registrado e permite uma nova tentativa, com nova chave idempotente.

## Passagem para produção

Exige uma etapa separada e aprovação explícita. Nessa etapa devem ser revisados: credenciais produtivas, exposição para clientes, URL de webhook de produção, políticas comerciais/parcelamento, testes finais e monitoramento.
