create or replace function public.supplier_catalog_category_options(p_supplier_id uuid)
returns table(category text)
language sql
stable
security invoker
set search_path=public
as $$
  select distinct btrim(i.category) as category
  from public.supplier_catalog_items i
  where i.supplier_id = p_supplier_id
    and i.active = true
    and i.category is not null
    and btrim(i.category) <> ''
  order by 1;
$$;

revoke all on function public.supplier_catalog_category_options(uuid) from public, anon;
grant execute on function public.supplier_catalog_category_options(uuid) to authenticated;
