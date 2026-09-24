create or replace function public.public_catalog_category_stats(
  p_scope text,
  p_require_published boolean default false
)
returns table(
  category_id uuid,
  direct_count bigint,
  subtree_count bigint
)
language sql
security invoker
set search_path=public
as $$
  with recursive visible_categories as (
    select c.id,c.parent_id
    from public.catalog_categories c
    where c.catalog_scope=p_scope
      and c.ativo=true
      and c.public_visible=true
  ),
  descendants as (
    select vc.id as root_id,vc.id
    from visible_categories vc
    union all
    select d.root_id,vc.id
    from descendants d
    join visible_categories vc on vc.parent_id=d.id
  ),
  eligible as (
    select p.catalog_category_id
    from public.public_catalog_products p
    where p.product_type=p_scope
      and (not p_require_published or p.published_on_site=true)
      and p.catalog_category_id is not null
  ),
  direct_counts as (
    select e.catalog_category_id,count(*)::bigint as n
    from eligible e
    group by e.catalog_category_id
  ),
  subtree_counts as (
    select d.root_id,count(e.catalog_category_id)::bigint as n
    from descendants d
    left join eligible e on e.catalog_category_id=d.id
    group by d.root_id
  )
  select vc.id,
         coalesce(dc.n,0)::bigint,
         coalesce(sc.n,0)::bigint
  from visible_categories vc
  left join direct_counts dc on dc.catalog_category_id=vc.id
  left join subtree_counts sc on sc.root_id=vc.id
  order by vc.id;
$$;

revoke all on function public.public_catalog_category_stats(text,boolean) from public;
grant execute on function public.public_catalog_category_stats(text,boolean) to anon,authenticated;
