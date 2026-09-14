# croma-supplier-validation

## Autenticação

Esta Edge Function deve ser implantada com `verify_jwt=false` no gateway do Supabase.

Isso é intencional: a autorização é feita dentro da própria função, em `manager(req)`, que:

1. exige `Authorization: Bearer <user JWT>`;
2. valida o token com `admin.auth.getUser(token)`;
3. consulta `profiles`;
4. aceita somente perfis ativos com papel `owner` ou `manager`.

A função **não é pública** apesar de `verify_jwt=false`: chamadas sem JWT, com JWT inválido ou sem papel de gestão retornam 401/403 antes de qualquer alteração de catálogo.

A verificação no gateway não deve ser reativada sem revisar o fluxo do cliente. Ela causou rejeição da chamada antes de o código da função executar, resultando no erro genérico `Edge Function returned a non-2xx status code` na tela de validação.

## Interface

`js/supplier-validation-ui.js` envia explicitamente o JWT da sessão no cabeçalho `Authorization` e tenta extrair a mensagem JSON retornada pela função para que erros de autorização ou validação apareçam de forma legível no painel.
