-- Vincula automaticamente o fornecedor do Bling ao catálogo interno do respectivo fornecedor.
-- O catálogo do fornecedor passa a ser a fonte do custo quando há correspondência segura por fornecedor + código/SKU.

create or replace function public.croma_normalize_bling_supplier_snapshot(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  p public.products%rowtype;
  f jsonb;
begin
  select * into p from public.products where id=p_product_id;
  if not found then return; end if;

  f := p.metadata#>'{bling_raw,fornecedor}';
  if f is null or jsonb_typeof(f)<>'object' or f='{}'::jsonb then
    delete from public.product_supplier_external_snapshots
    where product_id=p_product_id and source='bling';
    return;
  end if;

  insert into public.product_supplier_external_snapshots(
    product_id,source,external_supplier_id,external_contact_id,supplier_name,supplier_code,
    purchase_price,cost_price,synced_at,metadata,updated_at
  ) values (
    p_product_id,
    'bling',
    nullif(f->>'id',''),
    nullif(f#>>'{contato,id}',''),
    nullif(f#>>'{contato,nome}',''),
    nullif(btrim(f->>'codigo'),''),
    public.croma_try_numeric(f->>'precoCompra'),
    public.croma_try_numeric(f->>'precoCusto'),
    coalesce(p.bling_last_synced_at,now()),
    f,
    now()
  )
  on conflict(product_id,source) do update set
    external_supplier_id=excluded.external_supplier_id,
    external_contact_id=excluded.external_contact_id,
    supplier_name=excluded.supplier_name,
    supplier_code=excluded.supplier_code,
    purchase_price=excluded.purchase_price,
    cost_price=excluded.cost_price,
    synced_at=excluded.synced_at,
    metadata=excluded.metadata,
    updated_at=excluded.updated_at;
end;
$$;

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
  effective_cost numeric;
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

  effective_cost := coalesce(catalog_row.purchase_price,0) + coalesce(supplier_row.default_order_freight,0);

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
        effective_unit_cost=effective_cost,
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
      conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,effective_unit_cost,
      minimum_order_quantity,lead_time_days,supplier_product_description,preferred,active,last_quote_at,updated_at
    ) values (
      p_product_id,null,supplier_row.id,catalog_row.id,catalog_row.sku,coalesce(catalog_row.unit,p.unidade),
      1,coalesce(catalog_row.purchase_price,0),coalesce(supplier_row.default_order_freight,0),0,0,effective_cost,
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
    values(p_product_id,link_row.id,effective_cost,1,'markup')
    on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
      product_supplier_id=excluded.product_supplier_id,
      effective_cost=excluded.effective_cost,
      updated_at=now();
  end if;

  return 'linked';
end;
$$;

revoke all on function public.croma_reconcile_bling_supplier_catalog(uuid) from public,anon,authenticated;
grant execute on function public.croma_reconcile_bling_supplier_catalog(uuid) to service_role;

create or replace function public.croma_supplier_catalog_reconcile_links_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  r record;
  effective_cost numeric;
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
    effective_cost := coalesce(r.purchase_price,0)+coalesce(r.default_freight,0);

    update public.product_suppliers
    set supplier_catalog_item_id=r.catalog_item_id,
        supplier_sku=r.sku,
        purchase_unit=coalesce(r.unit,purchase_unit),
        purchase_price=coalesce(r.purchase_price,purchase_price,0),
        freight_cost=coalesce(r.default_freight,0),
        effective_unit_cost=effective_cost,
        minimum_order_quantity=r.minimum_order_quantity,
        lead_time_days=r.lead_time_days,
        supplier_product_description=coalesce(r.supplier_description,supplier_product_description),
        last_quote_at=now(),
        updated_at=now()
    where id=r.link_id;

    if r.preferred then
      insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
      values(r.product_id,r.sku,coalesce(r.purchase_price,0),now())
      on conflict(product_id) do update set
        supplier_reference=excluded.supplier_reference,
        cost=excluded.cost,
        updated_at=now();

      insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
      values(r.product_id,r.link_id,effective_cost,1,'markup')
      on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
        product_supplier_id=excluded.product_supplier_id,
        effective_cost=excluded.effective_cost,
        updated_at=now();
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.croma_supplier_catalog_reconcile_links_trigger() from public,anon,authenticated;

create or replace function public.croma_products_bling_normalize_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  dep record;
  supplier_changed boolean:=false;
begin
  if new.product_type='produto' then
    perform public.croma_normalize_bling_product_scoped(new.id);
    -- O normalizador legado pode trazer o preco do Bling; havendo SKU correspondente,
    -- o catálogo interno do fornecedor prevalece como fonte de custo.
    perform public.croma_reconcile_bling_supplier_catalog(new.id);

    if new.bling_product_id is not null then
      for dep in
        select id
        from public.products
        where id<>new.id
          and product_type='produto'
          and jsonb_typeof(metadata#>'{bling_raw,estrutura,componentes}')='array'
          and (metadata#>'{bling_raw,estrutura,componentes}') @>
              jsonb_build_array(jsonb_build_object('produto',jsonb_build_object('id',new.bling_product_id)))
      loop
        perform public.croma_normalize_bling_product_scoped(dep.id);
        perform public.croma_reconcile_bling_supplier_catalog(dep.id);
      end loop;
    end if;
  else
    -- Serviços e demais registros também precisam espelhar o fornecedor do Bling.
    perform public.croma_normalize_bling_supplier_snapshot(new.id);

    if tg_op='INSERT' then
      supplier_changed:=true;
    else
      supplier_changed :=
        nullif(btrim(old.metadata#>>'{bling_raw,fornecedor,codigo}'),'') is distinct from
        nullif(btrim(new.metadata#>>'{bling_raw,fornecedor,codigo}'),'')
        or nullif(old.metadata#>>'{bling_raw,fornecedor,contato,id}','') is distinct from
           nullif(new.metadata#>>'{bling_raw,fornecedor,contato,id}','');
    end if;

    if supplier_changed then
      perform public.croma_reconcile_bling_supplier_catalog(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists supplier_catalog_items_reconcile_after_insert on public.supplier_catalog_items;
create trigger supplier_catalog_items_reconcile_after_insert
after insert on public.supplier_catalog_items
referencing new table as new_catalog_rows
for each statement
execute function public.croma_supplier_catalog_reconcile_links_trigger();

drop trigger if exists supplier_catalog_items_reconcile_after_update on public.supplier_catalog_items;
create trigger supplier_catalog_items_reconcile_after_update
after update on public.supplier_catalog_items
referencing new table as new_catalog_rows
for each statement
execute function public.croma_supplier_catalog_reconcile_links_trigger();

comment on function public.croma_reconcile_bling_supplier_catalog(uuid) is
'Concilia fornecedor+codigo do Bling com supplier_catalog_items e usa o catalogo do fornecedor como fonte do custo.';
comment on function public.croma_supplier_catalog_reconcile_links_trigger() is
'Propaga alteracoes do catalogo de fornecedor aos vinculos product_suppliers ja existentes.';
