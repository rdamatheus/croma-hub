# Centralização da LUFF Store

## Objetivo

Administrar a LUFF Store usando o mesmo projeto Supabase do Croma Hub sem misturar domínios de negócio.

## Isolamento

- Croma Hub: schema `public`.
- Personal OS: schema `personal_os`.
- LUFF Store: schemas `luff` e `luff_private`.
- Auth é compartilhado no nível do projeto Supabase; autorização continua separada por RLS e memberships.
- Código e deploy da LUFF permanecem no repositório `rdamatheus/LuffStore`.

## Migração da LUFF

O destino recebeu a estrutura, RLS, índices, funções e dados operacionais da LUFF. Entre os conjuntos migrados estão produtos, variações, taxonomia, atributos, configurações do site, integrações e membership do owner.

A Edge Function `luff-admin-users` foi publicada no projeto `croma-hub` com validação JWT habilitada.

O projeto Supabase anterior permanece disponível como rollback durante a homologação.

## Registro de projetos

A tabela `public.managed_projects` funciona como diretório administrativo e não replica dados internos dos projetos. Ela guarda apenas metadados como nome, status, URLs, repositório e schema Supabase.

O acesso é restrito a perfis internos `owner` e `manager` por RLS.

Projetos iniciais:

- Croma Hub;
- Personal OS;
- LUFF Store.

Projetos de clientes poderão ser registrados posteriormente sem trazer seus bancos de dados para dentro do Croma Hub. O registro servirá como ponto de administração e navegação.

## Rollback

Enquanto a migração não estiver homologada, não remover o projeto Supabase antigo da LUFF. Para retorno do frontend, restaurar em `LuffStore/js/luff-config.js` a URL e a publishable key anteriores.
