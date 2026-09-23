create or replace function public.internal_products_catalog_snapshot()
returns table(
  id uuid,
  nome text,
  sku text,
  slug text,
  catalog_category_id uuid,
  preco numeric,
  bling_product_id bigint,
  bling_parent_id bigint,
  bling_sku text,
  bling_sync_status text,
  product_type text,
  product_format text,
  parent_product_id uuid,
  ativo boolean,
  is_input boolean,
  is_sellable boolean,
  is_purchasable boolean,
  controls_stock boolean,
  published_on_site boolean,
  brand text,
  model text,
  barcode text,
  gtin text,
  ncm text,
  cest text,
  production_mode text,
  available_stock_effective numeric,
  minimum_stock numeric,
  supplier_id uuid,
  supplier_name text,
  image_url text,
  child_count bigint
)
language sql
security invoker
set search_path=public
as $$
  select
    p.id,
    p.nome,
    p.sku,
    p.slug,
    p.catalog_category_id,
    p.preco,
    p.bling_product_id,
    p.bling_parent_id,
    p.bling_sku,
    p.bling_sync_status,
    p.product_type,
    p.product_format,
    p.parent_product_id,
    p.ativo,
    p.is_input,
    p.is_sellable,
    p.is_purchasable,
    p.controls_stock,
    p.published_on_site,
    d.brand,
    d.model,
    d.barcode,
    d.gtin,
    d.ncm,
    d.cest,
    d.production_mode,
    case
      when coalesce(cs.child_count,0)>0 then cs.child_available_stock
      else ss.available_stock
    end as available_stock_effective,
    ss.minimum_stock,
    spl.supplier_id,
    spl.supplier_name,
    pm.image_url,
    coalesce(cs.child_count,0)::bigint
  from public.products p
  left join public.product_details d on d.product_id=p.id
  left join public.product_stock_snapshots ss
    on ss.product_id=p.id and ss.source='bling'
  left join lateral (
    select
      count(*)::bigint as child_count,
      sum(css.available_stock) filter (where css.available_stock is not null) as child_available_stock
    from public.products c
    left join public.product_stock_snapshots css
      on css.product_id=c.id and css.source='bling'
    where c.parent_product_id=p.id
  ) cs on true
  left join lateral (
    select ps.supplier_id,s.name as supplier_name
    from public.product_suppliers ps
    left join public.suppliers s on s.id=ps.supplier_id
    where ps.product_id=p.id
      and ps.active=true
    order by ps.preferred desc nulls last, ps.updated_at desc nulls last
    limit 1
  ) spl on true
  left join lateral (
    select m.url as image_url
    from public.product_media m
    where m.product_id=p.id
      and m.ativo=true
      and m.kind='image'
    order by m.is_primary desc nulls last, m.ordem asc nulls last
    limit 1
  ) pm on true
  order by p.nome;
$$;

revoke all on function public.internal_products_catalog_snapshot() from public, anon;
grant execute on function public.internal_products_catalog_snapshot() to authenticated;
