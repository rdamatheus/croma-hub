create or replace function public.internal_product_type_counts()
returns table(product_count bigint, service_count bigint)
language sql
stable
security invoker
set search_path=public
as $$
  select
    count(*) filter (where product_type = 'produto')::bigint as product_count,
    count(*) filter (where product_type = 'servico')::bigint as service_count
  from public.products;
$$;

revoke all on function public.internal_product_type_counts() from public, anon;
grant execute on function public.internal_product_type_counts() to authenticated;

create or replace function public.internal_contact_kpis()
returns table(total_count bigint, active_count bigint, client_role_count bigint, supplier_role_count bigint)
language sql
stable
security invoker
set search_path=public
as $$
  select
    (select count(*)::bigint from public.customer_profiles) as total_count,
    (select count(*)::bigint from public.customer_profiles where ativo = true) as active_count,
    (select count(*)::bigint from public.contact_roles where role_label ilike '%cliente%') as client_role_count,
    (select count(*)::bigint from public.contact_roles where role_label ilike '%fornecedor%') as supplier_role_count;
$$;

revoke all on function public.internal_contact_kpis() from public, anon;
grant execute on function public.internal_contact_kpis() to authenticated;
