create or replace function public.internal_products_catalog_page(
  p_search text default '',
  p_type text default '',
  p_status text default '',
  p_category uuid default null,
  p_bling text default '',
  p_structure text default '',
  p_production text default '',
  p_stock text default '',
  p_brand text default '',
  p_supplier uuid default null,
  p_content text default '',
  p_scope text default '',
  p_offset integer default 0,
  p_limit integer default 50
)
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
  child_count bigint,
  total_count bigint,
  overall_count bigint
)
language sql
security invoker
set search_path=public
as $$
  with recursive cat_paths as (
    select c.id,c.parent_id,c.nome,c.nome::text as path
    from public.catalog_categories c
    where c.parent_id is null
    union all
    select c.id,c.parent_id,c.nome,(cp.path||' › '||c.nome)::text
    from public.catalog_categories c
    join cat_paths cp on cp.id=c.parent_id
  ),
  descendants as (
    select c.id
    from public.catalog_categories c
    where p_category is not null and c.id=p_category
    union all
    select c.id
    from public.catalog_categories c
    join descendants d on c.parent_id=d.id
  ),
  base as (
    select
      s.*,
      cp.path as category_path,
      case
        when s.parent_product_id is not null and s.product_format='composition' then 'variation_composition'
        when s.parent_product_id is not null then 'variation'
        when s.child_count>0 then 'parent'
        when s.product_format='composition' then 'composition'
        else 'simple'
      end as structure_key
    from public.internal_products_catalog_snapshot() s
    left join cat_paths cp on cp.id=s.catalog_category_id
  ),
  filtered as (
    select b.*
    from base b
    where
      (coalesce(p_type,'')='' or b.product_type=p_type)
      and (
        coalesce(p_status,'')=''
        or (p_status='active' and b.ativo=true)
        or (p_status='inactive' and b.ativo=false)
      )
      and (p_category is null or b.catalog_category_id in (select id from descendants))
      and (
        coalesce(p_bling,'')=''
        or (p_bling='linked' and b.bling_product_id is not null)
        or (p_bling='unlinked' and b.bling_product_id is null)
        or (p_bling='synced' and b.bling_sync_status='sincronizado')
        or (p_bling='error' and b.bling_sync_status='erro')
      )
      and (
        coalesce(p_structure,'')=''
        or (p_structure='parent' and b.structure_key='parent')
        or (p_structure='variation' and b.structure_key in ('variation','variation_composition'))
        or (p_structure='composition' and b.structure_key in ('composition','variation_composition'))
        or (p_structure='simple' and b.structure_key='simple')
      )
      and (
        coalesce(p_production,'')=''
        or (p_production='unknown' and b.production_mode is null)
        or (p_production<>'unknown' and b.production_mode=p_production)
      )
      and (coalesce(p_brand,'')='' or b.brand=p_brand)
      and (p_supplier is null or b.supplier_id=p_supplier)
      and (
        coalesce(p_stock,'')=''
        or (p_stock='unknown' and b.available_stock_effective is null)
        or (p_stock='positive' and b.available_stock_effective>0)
        or (p_stock='zero' and b.available_stock_effective=0)
        or (p_stock='negative' and b.available_stock_effective<0)
        or (p_stock='below_min' and b.available_stock_effective is not null and b.minimum_stock is not null and b.available_stock_effective<b.minimum_stock)
      )
      and (
        coalesce(p_content,'')=''
        or (p_content='image' and b.image_url is not null)
        or (p_content='no_image' and b.image_url is null)
        or (p_content='gtin' and nullif(b.gtin,'') is not null)
        or (p_content='no_gtin' and nullif(b.gtin,'') is null)
        or (p_content='ncm' and nullif(b.ncm,'') is not null)
        or (p_content='no_ncm' and nullif(b.ncm,'') is null)
      )
      and (
        coalesce(p_scope,'')=''
        or (p_scope='commercial' and not coalesce(b.is_input,false) and coalesce(b.is_sellable,false))
        or (p_scope='input' and coalesce(b.is_input,false))
        or (p_scope='site' and b.product_type='produto' and b.ativo=true and coalesce(b.is_sellable,false) and not coalesce(b.is_input,false))
      )
      and (
        coalesce(trim(p_search),'')=''
        or coalesce(b.nome,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.sku,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.bling_sku,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.bling_product_id::text,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.category_path,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.gtin,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.barcode,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.brand,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.model,'') ilike '%'||trim(p_search)||'%'
        or coalesce(b.supplier_name,'') ilike '%'||trim(p_search)||'%'
      )
  )
  select
    f.id,f.nome,f.sku,f.slug,f.catalog_category_id,f.preco,
    f.bling_product_id,f.bling_parent_id,f.bling_sku,f.bling_sync_status,
    f.product_type,f.product_format,f.parent_product_id,f.ativo,f.is_input,
    f.is_sellable,f.is_purchasable,f.controls_stock,f.published_on_site,
    f.brand,f.model,f.barcode,f.gtin,f.ncm,f.cest,f.production_mode,
    f.available_stock_effective,f.minimum_stock,f.supplier_id,f.supplier_name,
    f.image_url,f.child_count,
    count(*) over()::bigint as total_count,
    (select count(*)::bigint from base) as overall_count
  from filtered f
  order by f.nome
  offset greatest(coalesce(p_offset,0),0)
  limit greatest(1,least(coalesce(p_limit,50),100));
$$;

create or replace function public.internal_product_brand_options()
returns table(brand text)
language sql
security invoker
set search_path=public
as $$
  select distinct d.brand
  from public.product_details d
  where nullif(trim(d.brand),'') is not null
  order by d.brand;
$$;

revoke all on function public.internal_products_catalog_page(text,text,text,uuid,text,text,text,text,text,uuid,text,text,integer,integer) from public,anon;
grant execute on function public.internal_products_catalog_page(text,text,text,uuid,text,text,text,text,text,uuid,text,text,integer,integer) to authenticated;
revoke all on function public.internal_product_brand_options() from public,anon;
grant execute on function public.internal_product_brand_options() to authenticated;
