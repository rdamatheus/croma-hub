create or replace function public.supplier_catalog_filtered_page(
  p_supplier_id uuid,
  p_search text default '',
  p_validation text default '',
  p_category text default '',
  p_update_mode text default '',
  p_sort text default 'sku',
  p_link_filter text default '',
  p_divergent_only boolean default false,
  p_divergent_ids uuid[] default '{}'::uuid[],
  p_offset integer default 0,
  p_limit integer default 30
)
returns table(
  id uuid,
  sku text,
  name text,
  description text,
  category text,
  purchase_price numeric,
  unit text,
  pricing_unit text,
  minimum_order_quantity numeric,
  lead_time_days integer,
  active boolean,
  validation_status text,
  validation_notes text,
  last_synced_at timestamptz,
  updated_at timestamptz,
  source_import_id uuid,
  total_count bigint
)
language sql
security invoker
set search_path=public
as $$
  with filtered as (
    select i.*
    from public.supplier_catalog_items i
    where i.supplier_id=p_supplier_id
      and (
        p_validation='inactive' and i.active=false
        or p_validation<>'inactive' and i.active=true
      )
      and (p_validation in ('','inactive') or i.validation_status=p_validation)
      and (
        coalesce(trim(p_search),'')=''
        or coalesce(i.sku,'') ilike '%'||trim(p_search)||'%'
        or coalesce(i.name,'') ilike '%'||trim(p_search)||'%'
        or coalesce(i.description,'') ilike '%'||trim(p_search)||'%'
      )
      and (coalesce(p_category,'')='' or i.category=p_category)
      and (
        coalesce(p_update_mode,'')=''
        or (p_update_mode='today' and i.updated_at>=now()-interval '1 day')
        or (p_update_mode='7d' and i.updated_at>=now()-interval '7 days')
        or (p_update_mode='30d' and i.updated_at>=now()-interval '30 days')
        or (p_update_mode='old' and i.updated_at<now()-interval '30 days')
      )
      and (
        coalesce(p_link_filter,'')=''
        or (
          p_link_filter='linked'
          and exists(
            select 1 from public.product_suppliers ps
            where ps.supplier_catalog_item_id=i.id
              and ps.supplier_id=p_supplier_id
              and ps.active=true
              and ps.variant_id is null
          )
        )
        or (
          p_link_filter='unlinked'
          and not exists(
            select 1 from public.product_suppliers ps
            where ps.supplier_catalog_item_id=i.id
              and ps.supplier_id=p_supplier_id
              and ps.active=true
              and ps.variant_id is null
          )
        )
      )
      and (
        not coalesce(p_divergent_only,false)
        or i.id=any(coalesce(p_divergent_ids,'{}'::uuid[]))
      )
  )
  select
    f.id,f.sku,f.name,f.description,f.category,f.purchase_price,f.unit,f.pricing_unit,
    f.minimum_order_quantity,f.lead_time_days,f.active,f.validation_status,f.validation_notes,
    f.last_synced_at,f.updated_at,f.source_import_id,
    count(*) over()::bigint as total_count
  from filtered f
  order by
    case when p_sort='name' then f.name end asc nulls last,
    case when p_sort='price' then f.purchase_price end asc nulls last,
    case when p_sort='recent' then f.updated_at end desc nulls last,
    case when p_sort not in ('name','price','recent') then f.sku end asc nulls last,
    f.id
  offset greatest(coalesce(p_offset,0),0)
  limit greatest(1,least(coalesce(p_limit,30),100));
$$;

revoke all on function public.supplier_catalog_filtered_page(uuid,text,text,text,text,text,text,boolean,uuid[],integer,integer) from public,anon;
grant execute on function public.supplier_catalog_filtered_page(uuid,text,text,text,text,text,text,boolean,uuid[],integer,integer) to authenticated;
