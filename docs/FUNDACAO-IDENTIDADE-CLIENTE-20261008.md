# Fundação — identidade de cliente e hardening — 2026-10-08

## Objetivo

Eliminar a dependência histórica de `customer_profiles.id = auth.uid()` e consolidar um modelo em que login e cliente comercial tenham identidades separadas, preservando os vínculos já existentes com Bling, carrinho, pedidos, pagamentos, propostas e endereços.

## Decisão

- `auth.users.id`: identidade de autenticação.
- `customer_profiles.id`: identidade comercial permanente.
- `customer_profiles.auth_user_id`: vínculo oficial entre conta e cliente.
- Carrinho, pedidos, pagamentos e demais entidades comerciais continuam armazenando `customer_profiles.id`.

## Cliente novo

Ao criar uma conta cujo CPF ainda não existe em `customer_profiles`, o trigger cria o cliente comercial e grava `auth_user_id`.

## Cliente já existente

O signup não cria um segundo cliente se o CPF já existir.

A vinculação automática é feita somente quando:

1. o CPF do signup encontra exatamente um cadastro existente;
2. o cadastro ainda não está ligado a outra conta;
3. o e-mail do cadastro comercial coincide com o e-mail autenticado;
4. há evidência de que um e-mail de confirmação foi enviado e confirmado.

Se qualquer uma dessas condições falhar, o cadastro não é mesclado automaticamente e o usuário recebe uma orientação de revisão.

## Sistemas afetados

- Auth / cadastro;
- Minha Conta;
- carrinho persistente;
- checkout;
- pedidos e cancelamento;
- arquivos de carrinho/pedido;
- pagamentos e histórico de pagamento;
- Mercado Pago de teste;
- refresh de estoque do checkout;
- políticas RLS relacionadas ao cliente.

## Segurança

Funções auxiliares privilegiadas ficam em `app_private`, com `SECURITY DEFINER`, `search_path = ''` e execução restrita.

O proxy público `bling-product-image` passa a:

- aceitar somente produtos que pertençam ao catálogo público;
- registrar sucesso/falha usando `product_image_enrichment`;
- aplicar cooldown de 6 horas após falha, evitando chamadas repetidas ao Bling;
- continuar servindo imagens já armazenadas em cache.

## Compatibilidade

O perfil atualmente autenticado já possui `customer_profiles.id = auth_user_id`; portanto, o comportamento atual é preservado. A migration também faz backfill seguro para qualquer registro legado em que o ID do cliente já coincida com um usuário Auth, mas `auth_user_id` ainda esteja vazio.

## Validação prevista

- dry-run transacional da migration;
- sintaxe JavaScript/TypeScript;
- RLS e grants;
- conta atual continua acessando cliente, carrinho e pedidos;
- simulação controlada de conta vinculada a cliente com ID comercial diferente;
- advisor de segurança/performance após migration;
- validação das Edge Functions após deploy.

## Limitações e pendências

- Proteção contra senhas vazadas do Supabase exige plano pago; o projeto permanece no Free.
- Proteção da branch `main` depende de permissão administrativa do GitHub que não está disponível no conector atual.
- PR #63 permanece fora deste lote e não deve ser integrado no estado atual.
