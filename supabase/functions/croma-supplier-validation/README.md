# croma-supplier-validation

## Estado atual

A interface administrativa de validação de catálogo **não depende mais desta Edge Function** para aprovar, revisar ou rejeitar preços.

O fluxo principal passou a usar a RPC autenticada:

`public.croma_set_supplier_catalog_validation(...)`

Motivo: a tela já opera com sessão Supabase e o banco possui regra explícita de gestão. A RPC faz a autorização no próprio banco, atualiza o item, dispara os triggers de auditoria/custo e executa a conciliação Bling → fornecedor → SKU quando aplicável. Isso remove uma camada HTTP adicional que estava causando falhas de autenticação/execução na interface.

## Segurança da RPC

A função `croma_set_supplier_catalog_validation` é `SECURITY DEFINER`, mas:

1. exige `auth.uid()` válido;
2. exige `app_private.is_manager()`;
3. só possui `EXECUTE` para `authenticated` e `service_role`;
4. `anon` e `public` não possuem permissão de execução.

A exposição a `authenticated` é intencional porque a autorização fina acontece dentro da própria função e aceita apenas perfis ativos `owner` ou `manager`.

## Edge Function legada

A Edge Function `croma-supplier-validation` permanece implantada por compatibilidade, com `verify_jwt=false` no gateway e validação interna do JWT em `manager(req)`. Ela não deve ser usada pelo frontend novo para as ações de validação.

Se for removida futuramente, primeiro confirme que nenhum cliente antigo ainda a invoca.
