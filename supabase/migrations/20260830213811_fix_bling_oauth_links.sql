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
  v_request_role text;
begin
  v_request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  if v_request_role is distinct from 'service_role' then
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
  v_request_role text;
begin
  v_request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  );

  if v_request_role is distinct from 'service_role' then
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
