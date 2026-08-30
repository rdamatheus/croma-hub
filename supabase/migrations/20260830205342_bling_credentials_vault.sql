alter table public.erp_private_tokens
  add column if not exists access_token_secret_name text,
  add column if not exists refresh_token_secret_name text;

alter table public.erp_private_tokens
  alter column access_token_secret_name set not null,
  alter column refresh_token_secret_name set not null,
  drop column if exists access_token,
  drop column if exists refresh_token;

alter table public.erp_private_tokens
  drop constraint if exists erp_private_tokens_access_secret_name_check,
  drop constraint if exists erp_private_tokens_refresh_secret_name_check;

alter table public.erp_private_tokens
  add constraint erp_private_tokens_access_secret_name_check
    check (access_token_secret_name ~ '^erp_bling_access_token_[a-f0-9]{32}$'),
  add constraint erp_private_tokens_refresh_secret_name_check
    check (refresh_token_secret_name ~ '^erp_bling_refresh_token_[a-f0-9]{32}$');

create table if not exists public.erp_connection_audit (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'bling'),
  action text not null check (action in ('credentials_created','credentials_updated','credentials_validated','authorized','disconnected')),
  changed_fields text[] not null default '{}',
  performed_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists erp_connection_audit_recent_idx
  on public.erp_connection_audit(provider, created_at desc);
create index if not exists erp_connection_audit_performed_by_idx
  on public.erp_connection_audit(performed_by);

alter table public.erp_connection_audit enable row level security;

revoke all on public.erp_connection_audit from public, anon, authenticated;
grant all on public.erp_connection_audit to service_role;

create or replace function public.erp_store_secret(
  p_name text,
  p_value text,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso restrito ao serviço de integração.';
  end if;

  if p_name !~ '^erp_bling_[a-z0-9_]+$' then
    raise exception 'Nome de segredo inválido.';
  end if;

  if p_value is null or length(p_value) < 1 or length(p_value) > 4096 then
    raise exception 'Valor de segredo inválido.';
  end if;

  select id into v_secret_id
  from vault.secrets
  where name = p_name;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_value, p_name, p_description, null);
  else
    perform vault.update_secret(v_secret_id, p_value, p_name, p_description, null);
  end if;

  return v_secret_id;
end;
$$;

create or replace function public.erp_read_secret(p_name text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_secret text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Acesso restrito ao serviço de integração.';
  end if;

  if p_name !~ '^erp_bling_[a-z0-9_]+$' then
    raise exception 'Nome de segredo inválido.';
  end if;

  select decrypted_secret into v_secret
  from vault.decrypted_secrets
  where name = p_name;

  return v_secret;
end;
$$;

revoke all on function public.erp_store_secret(text, text, text)
  from public, anon, authenticated;
revoke all on function public.erp_read_secret(text)
  from public, anon, authenticated;
grant execute on function public.erp_store_secret(text, text, text)
  to service_role;
grant execute on function public.erp_read_secret(text)
  to service_role;

comment on function public.erp_store_secret(text, text, text) is
  'Armazena segredos da integração Bling no Vault. Execução exclusiva do service_role.';
comment on function public.erp_read_secret(text) is
  'Lê segredos da integração Bling no Vault. Execução exclusiva do service_role.';
