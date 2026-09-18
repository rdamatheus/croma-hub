create or replace function public.croma_supplier_safe_cost(
  p_purchase_price numeric,
  p_list_price numeric,
  p_policy text
)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_policy,'list')='list' then coalesce(p_list_price,p_purchase_price)
    else p_purchase_price
  end
$$;

create or replace function public.croma_supplier_catalog_reconcile_links_trigger()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  r record;
  generated_effective_cost numeric;
begin
  for r in
    select
      ps.id as link_id,
      ps.product_id,
      ps.preferred,
      n.id as catalog_item_id,
      n.sku,
      n.unit,
      public.croma_supplier_safe_cost(n.purchase_price,n.list_price,n.cost_price_policy) as safe_purchase_price,
      n.minimum_order_quantity,
      n.lead_time_days,
      coalesce(n.description,n.name) as supplier_description,
      coalesce(s.default_order_freight,0) as default_freight
    from public.product_suppliers ps
    join new_catalog_rows n
      on n.supplier_id=ps.supplier_id
     and (
       ps.supplier_catalog_item_id=n.id
       or (
         ps.supplier_catalog_item_id is null
         and ps.supplier_sku is not null
         and upper(btrim(ps.supplier_sku))=upper(btrim(n.sku))
       )
     )
    join public.suppliers s on s.id=ps.supplier_id and s.active=true
    where ps.variant_id is null
      and ps.active=true
      and n.active=true
      and n.validation_status='ok'
      and coalesce(public.croma_supplier_safe_cost(n.purchase_price,n.list_price,n.cost_price_policy),0)>0
  loop
    update public.product_suppliers
    set supplier_catalog_item_id=r.catalog_item_id,
        supplier_sku=r.sku,
        purchase_unit=coalesce(r.unit,purchase_unit),
        purchase_price=r.safe_purchase_price,
        freight_cost=coalesce(r.default_freight,0),
        minimum_order_quantity=r.minimum_order_quantity,
        lead_time_days=r.lead_time_days,
        supplier_product_description=coalesce(r.supplier_description,supplier_product_description),
        last_quote_at=now(),
        updated_at=now()
    where id=r.link_id
    returning effective_unit_cost into generated_effective_cost;

    if r.preferred then
      insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
      values(r.product_id,r.sku,r.safe_purchase_price,now())
      on conflict(product_id) do update set
        supplier_reference=excluded.supplier_reference,
        cost=excluded.cost,
        updated_at=now();

      insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
      values(r.product_id,r.link_id,generated_effective_cost,1,'markup')
      on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
        product_supplier_id=excluded.product_supplier_id,
        effective_cost=excluded.effective_cost,
        updated_at=now();
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function public.croma_supplier_safe_cost(numeric,numeric,text) from public, anon;
grant execute on function public.croma_supplier_safe_cost(numeric,numeric,text) to authenticated, service_role;
