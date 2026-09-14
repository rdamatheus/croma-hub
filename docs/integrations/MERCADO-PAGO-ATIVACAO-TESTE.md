# Mercado Pago — ativação do ambiente de teste

## Estado atual

A integração de cartão via Checkout Transparente / Orders API está preparada para ambiente de teste. Produção permanece bloqueada por código.

## Ações necessárias na conta Mercado Pago

1. Em **Suas integrações**, criar ou abrir a aplicação usada pelo Croma Hub.
2. Confirmar que o tipo de integração é **Checkout Transparente via Orders API**.
3. Em **Testes > Credenciais de teste**, copiar:
   - Public Key
   - Access Token
4. Em **Webhooks > Configurar notificação**, cadastrar a URL:
   `https://xtlubocepsbqanrjabog.supabase.co/functions/v1/mercado-pago-webhook`
5. Habilitar notificações de **Orders** e copiar a chave secreta da assinatura.

## Secrets esperados no Supabase

- `MERCADO_PAGO_ENVIRONMENT=test`
- `MERCADO_PAGO_PUBLIC_KEY=<public key de teste>`
- `MERCADO_PAGO_ACCESS_TOKEN=<access token de teste>`
- `MERCADO_PAGO_WEBHOOK_SECRET=<chave secreta do webhook>`

Nunca versionar ou enviar o Access Token para o frontend.

## Validação

Para testes com cartão via Orders API, o checkout utiliza `test@testuser.com` como e-mail do pagador e cartões de teste do Mercado Pago. Nenhum cartão real deve ser usado nesta fase.

## Produção

A passagem para produção exige nova aprovação e troca explícita das travas de ambiente, credenciais e regras de acesso interno.
