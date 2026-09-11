-- effective_unit_cost e uma coluna gerada; nao deve receber INSERT/UPDATE explicito.

create or replace function public.croma_reconcile_bling_supplier_catalog(p_product_id uuid)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  p public.products%rowtype;
  f jsonb;
  supplier_contact_ext text;
  supplier_code_value text;
  supplier_contact_local uuid;
  supplier_row public.suppliers%rowtype;
  catalog_row public.supplier_catalog_items%rowtype;
  link_row public.product_suppliers%rowtype;
  other_preferred boolean;
begin
  select * into p from public.products where id=p_product_id;
  if not found then return 'product_not_found'; end if;

  f := p.metadata#>'{bling_raw,fornecedor}';
  if f is null or jsonb_typeof(f)<>'object' or f='{}'::jsonb then
    return 'supplier_not_present';
  end if;

  supplier_code_value := nullif(btrim(f->>'codigo'),'');
  if supplier_code_value is null then return 'supplier_code_missing'; end if;

  supplier_contact_ext := coalesce(
    nullif(f#>>'{contato,id}',''),
    nullif(f->>'idContato','')
  );
  if supplier_contact_ext is null then return 'supplier_contact_missing'; end if;

  select m.local_id into supplier_contact_local
  from public.erp_entity_mappings m
  where m.provider='bling'
    and m.entity_type='customer'
    and m.external_id=supplier_contact_ext
  order by m.updated_at desc
  limit 1;

  if supplier_contact_local is null then
    select cp.id into supplier_contact_local
    from public.customer_profiles cp
    where cp.bling_contact_id::text=supplier_contact_ext
    order by cp.updated_at desc
    limit 1;
  end if;

  if supplier_contact_local is null then return 'supplier_contact_not_mapped'; end if;

  select s.* into supplier_row
  from public.suppliers s
  where s.contact_id=supplier_contact_local
    and s.active=true
  order by s.updated_at desc
  limit 1;

  if not found then return 'supplier_extension_not_found'; end if;

  select sci.* into catalog_row
  from public.supplier_catalog_items sci
  where sci.supplier_id=supplier_row.id
    and sci.active=true
    and upper(btrim(sci.sku))=upper(supplier_code_value)
  order by (sci.sku=supplier_code_value) desc, sci.updated_at desc
  limit 1;

  if not found then return 'catalog_item_not_found'; end if;

  select ps.* into link_row
  from public.product_suppliers ps
  where ps.product_id=p_product_id
    and ps.variant_id is null
    and ps.supplier_id=supplier_row.id
  order by ps.preferred desc, ps.created_at
  limit 1;

  if found then
    select exists(
      select 1
      from public.product_suppliers ps
      where ps.product_id=p_product_id
        and ps.variant_id is null
        and ps.id<>link_row.id
        and ps.preferred=true
        and ps.active=true
    ) into other_preferred;

    update public.product_suppliers
    set supplier_catalog_item_id=catalog_row.id,
        supplier_sku=catalog_row.sku,
        purchase_unit=coalesce(catalog_row.unit,purchase_unit,p.unidade),
        purchase_price=coalesce(catalog_row.purchase_price,purchase_price,0),
        freight_cost=coalesce(supplier_row.default_order_freight,0),
        minimum_order_quantity=catalog_row.minimum_order_quantity,
        lead_time_days=catalog_row.lead_time_days,
        supplier_product_description=coalesce(catalog_row.description,catalog_row.name,supplier_product_description),
        preferred=case when link_row.preferred then true when not other_preferred then true else false end,
        active=true,
        last_quote_at=now(),
        updated_at=now()
    where id=link_row.id
    returning * into link_row;
  else
    select exists(
      select 1
      from public.product_suppliers ps
      where ps.product_id=p_product_id
        and ps.variant_id is null
        and ps.preferred=true
        and ps.active=true
    ) into other_preferred;

    insert into public.product_suppliers(
      product_id,variant_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_unit,
      conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,
      minimum_order_quantity,lead_time_days,supplier_product_description,preferred,active,last_quote_at,updated_at
    ) values (
      p_product_id,null,supplier_row.id,catalog_row.id,catalog_row.sku,coalesce(catalog_row.unit,p.unidade),
      1,coalesce(catalog_row.purchase_price,0),coalesce(supplier_row.default_order_freight,0),0,0,
      catalog_row.minimum_order_quantity,catalog_row.lead_time_days,coalesce(catalog_row.description,catalog_row.name),
      not other_preferred,true,now(),now()
    )
    returning * into link_row;
  end if;

  if link_row.preferred then
    insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
    values(p_product_id,catalog_row.sku,coalesce(catalog_row.purchase_price,0),now())
    on conflict(product_id) do update set
      supplier_reference=excluded.supplier_reference,
      cost=excluded.cost,
      updated_at=now();

    insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
    values(p_product_id,link_row.id,link_row.effective_unit_cost,1,'markup')
    on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
      product_supplier_id=excluded.product_supplier_id,
      effective_cost=excluded.effective_cost,
      updated_at=now();
  end if;

  return 'linked';
end;
$$;

create or replace function public.croma_supplier_catalog_reconcile_links_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
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
      n.purchase_price,
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
  loop
    update public.product_suppliers
    set supplier_catalog_item_id=r.catalog_item_id,
        supplier_sku=r.sku,
        purchase_unit=coalesce(r.unit,purchase_unit),
        purchase_price=coalesce(r.purchase_price,purchase_price,0),
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
      values(r.product_id,r.sku,coalesce(r.purchase_price,0),now())
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

create or replace function public.link_product_to_supplier_catalog(p_product_id uuid, p_catalog_item_id uuid)
returns public.product_suppliers
language plpgsql
set search_path=public
as $$
declare
  v_item public.supplier_catalog_items%rowtype;
  v_supplier public.suppliers%rowtype;
  v_link public.product_suppliers%rowtype;
begin
  if not app_private.is_manager() then
    raise exception 'not authorized';
  end if;

  select * into v_item from public.supplier_catalog_items where id=p_catalog_item_id and active=true;
  if not found then raise exception 'supplier catalog item not found'; end if;

  select * into v_supplier from public.suppliers where id=v_item.supplier_id and active=true;
  if not found then raise exception 'supplier not found or inactive'; end if;

  select * into v_link
  from public.product_suppliers
  where product_id=p_product_id
    and variant_id is null
    and supplier_id=v_item.supplier_id
  order by preferred desc,created_at
  limit 1;

  if found then
    update public.product_suppliers
    set supplier_catalog_item_id=v_item.id,
        supplier_sku=v_item.sku,
        purchase_unit=coalesce(v_item.unit,purchase_unit),
        purchase_price=coalesce(v_item.purchase_price,0),
        freight_cost=coalesce(v_supplier.default_order_freight,0),
        minimum_order_quantity=v_item.minimum_order_quantity,
        lead_time_days=v_item.lead_time_days,
        supplier_product_description=coalesce(v_item.description,v_item.name),
        preferred=true,
        active=true,
        last_quote_at=now(),
        updated_at=now()
    where id=v_link.id
    returning * into v_link;
  else
    update public.product_suppliers
    set preferred=false,updated_at=now()
    where product_id=p_product_id and variant_id is null;

    insert into public.product_suppliers(
      product_id,supplier_id,supplier_catalog_item_id,supplier_sku,
      purchase_price,freight_cost,
      minimum_order_quantity,lead_time_days,supplier_product_description,
      preferred,active,last_quote_at
    ) values (
      p_product_id,v_item.supplier_id,v_item.id,v_item.sku,
      coalesce(v_item.purchase_price,0),coalesce(v_supplier.default_order_freight,0),
      v_item.minimum_order_quantity,v_item.lead_time_days,coalesce(v_item.description,v_item.name),
      true,true,now()
    ) returning * into v_link;
  end if;

  insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
  values(p_product_id,v_item.sku,coalesce(v_item.purchase_price,0),now())
  on conflict(product_id) do update set
    supplier_reference=excluded.supplier_reference,
    cost=excluded.cost,
    updated_at=now();

  insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
  values(p_product_id,v_link.id,v_link.effective_unit_cost,1,'markup')
  on conflict(product_id) where variant_id is null do update set
    product_supplier_id=excluded.product_supplier_id,
    effective_cost=excluded.effective_cost,
    updated_at=now();

  return v_link;
end;
$$;
