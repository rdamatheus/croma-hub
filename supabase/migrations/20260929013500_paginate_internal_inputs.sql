create or replace function public.internal_inputs_page(
  p_search text default null,
  p_type text default 'produto',
  p_status text default 'active',
  p_offset integer default 0,
  p_limit integer default 50
)
returns table(
  id uuid,
  sku text,
  nome text,
  unidade text,
  ativo boolean,
  product_type text,
  product_format text,
  is_sellable boolean,
  is_purchasable boolean,
  is_input boolean,
  controls_stock boolean,
  bling_product_id bigint,
  supplier_link_id uuid,
  supplier_id uuid,
  supplier_name text,
  supplier_sku text,
  purchase_unit text,
  conversion_factor numeric,
  purchase_price numeric,
  freight_cost numeric,
  tax_cost numeric,
  other_cost numeric,
  effective_unit_cost numeric,
  preferred boolean,
  purchase_channel text,
  purchase_url text,
  total_count bigint
)
language sql
stable
security invoker
set search_path=public
as $$
  with base as (
    select
      p.id,p.sku,p.nome,p.unidade,p.ativo,p.product_type,p.product_format,
      p.is_sellable,p.is_purchasable,p.is_input,p.controls_stock,p.bling_product_id,
      ps.id as supplier_link_id,ps.supplier_id,s.name as supplier_name,ps.supplier_sku,
      ps.purchase_unit,ps.conversion_factor,ps.purchase_price,ps.freight_cost,ps.tax_cost,
      ps.other_cost,ps.effective_unit_cost,ps.preferred,ps.purchase_channel,ps.purchase_url
    from public.products p
    left join lateral (
      select link.*
      from public.product_suppliers link
      where link.product_id=p.id
        and link.variant_id is null
        and link.active=true
      order by link.preferred desc, link.purchase_price asc nulls last, link.id
      limit 1
    ) ps on true
    left join public.suppliers s on s.id=ps.supplier_id
    where p.is_input=true
      and (coalesce(p_type,'')='' or p.product_type=p_type)
      and (
        coalesce(p_status,'')=''
        or (p_status='active' and p.ativo=true)
        or (p_status='inactive' and p.ativo=false)
      )
  ), filtered as (
    select *
    from base b
    where nullif(trim(coalesce(p_search,'')),'') is null
       or concat_ws(' ',b.nome,b.sku,b.supplier_name,b.supplier_sku,b.purchase_channel) ilike '%' || trim(p_search) || '%'
  )
  select
    f.id,f.sku,f.nome,f.unidade,f.ativo,f.product_type,f.product_format,
    f.is_sellable,f.is_purchasable,f.is_input,f.controls_stock,f.bling_product_id,
    f.supplier_link_id,f.supplier_id,f.supplier_name,f.supplier_sku,
    f.purchase_unit,f.conversion_factor,f.purchase_price,f.freight_cost,f.tax_cost,
    f.other_cost,f.effective_unit_cost,f.preferred,f.purchase_channel,f.purchase_url,
    count(*) over()::bigint as total_count
  from filtered f
  order by f.nome asc, f.id
  offset greatest(coalesce(p_offset,0),0)
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.internal_inputs_page(text,text,text,integer,integer) from public, anon;
grant execute on function public.internal_inputs_page(text,text,text,integer,integer) to authenticated;

create or replace function public.internal_inputs_kpis()
returns table(
  product_count bigint,
  service_count bigint,
  supplier_count bigint,
  stock_count bigint
)
language sql
stable
security invoker
set search_path=public
as $$
  select
    count(*) filter (where p.product_type='produto')::bigint as product_count,
    count(*) filter (where p.product_type='servico')::bigint as service_count,
    count(*) filter (
      where p.product_type='produto'
        and exists (
          select 1 from public.product_suppliers ps
          where ps.product_id=p.id and ps.variant_id is null and ps.active=true
        )
    )::bigint as supplier_count,
    count(*) filter (where p.product_type='produto' and p.controls_stock=true)::bigint as stock_count
  from public.products p
  where p.is_input=true;
$$;

revoke all on function public.internal_inputs_kpis() from public, anon;
grant execute on function public.internal_inputs_kpis() to authenticated;
