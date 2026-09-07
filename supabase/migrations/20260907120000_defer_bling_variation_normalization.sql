-- Adia a normalizacao de variacoes do Bling para a proxima etapa.
-- Mantem nesta etapa apenas estoque, detalhes, campos customizados, fornecedor e composicoes.

drop trigger if exists products_bling_normalize_after_write on public.products;

delete from public.product_options o
using public.product_option_groups g
where o.group_id=g.id and coalesce(o.metadata->>'source','')='bling';

delete from public.product_option_groups g
where not exists (select 1 from public.product_options o where o.group_id=g.id)
  and exists (
    select 1 from public.products p
    where p.id=g.product_id and p.product_type='produto' and p.metadata ? 'bling_raw'
  );

delete from public.product_variants where source='bling';

update public.products p
set bling_parent_id=null,
    parent_product_id=null,
    product_format=case
      when upper(coalesce(p.metadata#>>'{bling_raw,formato}',''))='E'
        or jsonb_array_length(coalesce(p.metadata#>'{bling_raw,estrutura,componentes}','[]'::jsonb))>0
      then 'composition'
      else 'simple'
    end
where p.product_type='produto'
  and (
    p.bling_parent_id is not null
    or p.parent_product_id is not null
    or p.product_format='variation'
  )
  and p.metadata ? 'bling_raw';

create or replace function public.croma_normalize_bling_product_operational(p_product_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare
  p public.products%rowtype; raw jsonb; stock jsonb; custom_item jsonb;
  component_item jsonb; component_ext bigint; component_local uuid; component_qty numeric; component_pos integer:=0;
  supplier_contact_ext text; supplier_contact_local uuid; supplier_local uuid; supplier_purchase numeric; now_ts timestamptz:=now();
begin
  select * into p from public.products where id=p_product_id and product_type='produto';
  if not found then return; end if;
  raw:=p.metadata->'bling_raw';
  if raw is null or jsonb_typeof(raw)<>'object' then return; end if;

  if upper(coalesce(raw->>'formato',''))='E'
     or jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb))>0 then
    update public.products set product_format='composition' where id=p_product_id and product_format<>'composition';
  elsif product_format='variation' then
    update public.products set product_format='simple' where id=p_product_id;
  end if;

  stock:=raw->'estoque';
  if stock is not null and jsonb_typeof(stock)='object' then
    insert into public.product_stock_snapshots(product_id,source,available_stock,virtual_stock,minimum_stock,maximum_stock,storage_location,crossdocking,synced_at,metadata,updated_at)
    values(p_product_id,'bling',public.croma_try_numeric(stock->>'saldoVirtualTotal'),public.croma_try_numeric(stock->>'saldoVirtualTotal'),
      public.croma_try_numeric(stock->>'minimo'),public.croma_try_numeric(stock->>'maximo'),nullif(stock->>'localizacao',''),
      public.croma_try_numeric(stock->>'crossdocking'),coalesce(p.bling_last_synced_at,now_ts),stock,now_ts)
    on conflict(product_id,source) do update set available_stock=excluded.available_stock,virtual_stock=excluded.virtual_stock,
      minimum_stock=excluded.minimum_stock,maximum_stock=excluded.maximum_stock,storage_location=excluded.storage_location,
      crossdocking=excluded.crossdocking,synced_at=excluded.synced_at,metadata=excluded.metadata,updated_at=excluded.updated_at;
  end if;

  delete from public.product_custom_field_values where product_id=p_product_id and source='bling';
  if jsonb_typeof(raw->'camposCustomizados')='array' then
    for custom_item in select value from jsonb_array_elements(raw->'camposCustomizados') loop
      if coalesce(custom_item->>'idCampoCustomizado','')<>'' then
        insert into public.product_custom_field_values(product_id,source,external_field_id,external_link_id,item,value,metadata,synced_at,updated_at)
        values(p_product_id,'bling',custom_item->>'idCampoCustomizado',nullif(custom_item->>'idVinculo',''),nullif(custom_item->>'item',''),custom_item->'valor',custom_item,coalesce(p.bling_last_synced_at,now_ts),now_ts);
      end if;
    end loop;
  end if;

  delete from public.product_components where parent_product_id=p_product_id and source='bling';
  if jsonb_typeof(raw#>'{estrutura,componentes}')='array' then
    for component_item in select value from jsonb_array_elements(raw#>'{estrutura,componentes}') loop
      component_pos:=component_pos+1;
      component_ext:=public.croma_try_bigint(component_item#>>'{produto,id}');
      component_qty:=public.croma_try_numeric(component_item->>'quantidade');
      select id into component_local from public.products where bling_product_id=component_ext limit 1;
      if component_local is not null and component_local<>p_product_id and coalesce(component_qty,0)>0 then
        insert into public.product_components(parent_product_id,component_product_id,quantity,waste_percent,position,active,source,external_component_id,updated_at)
        values(p_product_id,component_local,component_qty,0,component_pos,true,'bling',component_ext,now_ts)
        on conflict(parent_product_id,source,external_component_id) where external_component_id is not null do update set
          component_product_id=excluded.component_product_id,quantity=excluded.quantity,position=excluded.position,active=true,updated_at=excluded.updated_at;
      end if;
    end loop;
  end if;

  supplier_contact_ext:=coalesce(raw#>>'{fornecedor,contato,id}',raw#>>'{fornecedor,idContato}');
  if coalesce(supplier_contact_ext,'')<>'' then
    select m.local_id into supplier_contact_local from public.erp_entity_mappings m
      where m.provider='bling' and m.entity_type='customer' and m.external_id=supplier_contact_ext limit 1;
    if supplier_contact_local is not null then
      select s.id into supplier_local from public.suppliers s where s.contact_id=supplier_contact_local limit 1;
    end if;
  end if;
  if supplier_local is not null then
    supplier_purchase:=coalesce(public.croma_try_numeric(raw#>>'{fornecedor,precoCompra}'),public.croma_try_numeric(raw#>>'{fornecedor,precoCusto}'),0);
    insert into public.product_suppliers(product_id,variant_id,supplier_id,supplier_sku,purchase_unit,conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,preferred,active,updated_at)
    values(p_product_id,null,supplier_local,nullif(raw#>>'{fornecedor,codigo}',''),p.unidade,1,supplier_purchase,0,0,0,
      not exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.preferred and ps.active),true,now_ts)
    on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),supplier_id) do update set
      supplier_sku=excluded.supplier_sku,purchase_unit=excluded.purchase_unit,purchase_price=excluded.purchase_price,active=true,updated_at=excluded.updated_at;
  end if;
end; $$;

create or replace function public.croma_normalize_bling_product_scoped(p_product_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p_type text;
begin
  select product_type into p_type from public.products where id=p_product_id;
  if p_type is distinct from 'produto' then return; end if;
  perform public.croma_normalize_bling_product_details(p_product_id);
  perform public.croma_normalize_bling_supplier_snapshot(p_product_id);
  perform public.croma_normalize_bling_product_operational(p_product_id);
end; $$;

create or replace function public.croma_products_bling_normalize_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare dep record;
begin
  if new.product_type is distinct from 'produto' then return new; end if;
  perform public.croma_normalize_bling_product_scoped(new.id);
  if new.bling_product_id is not null then
    for dep in select id from public.products where id<>new.id and product_type='produto'
      and jsonb_typeof(metadata#>'{bling_raw,estrutura,componentes}')='array'
      and (metadata#>'{bling_raw,estrutura,componentes}') @> jsonb_build_array(jsonb_build_object('produto',jsonb_build_object('id',new.bling_product_id)))
    loop perform public.croma_normalize_bling_product_scoped(dep.id); end loop;
  end if;
  return new;
end; $$;

create trigger products_bling_normalize_after_write
after insert or update of metadata,bling_product_id,bling_last_synced_at on public.products
for each row when (new.metadata ? 'bling_raw') execute function public.croma_products_bling_normalize_trigger();

drop function if exists public.croma_normalize_bling_product(uuid);
drop function if exists public.croma_variation_attributes(text);
drop function if exists public.croma_attr_code(text);

drop index if exists public.product_variants_child_product_uidx;
drop index if exists public.product_variants_external_product_idx;
drop index if exists public.product_variants_parent_external_idx;
drop index if exists public.product_option_groups_product_code_uidx;
drop index if exists public.product_options_group_code_uidx;

alter table public.product_variants
  drop column if exists child_product_id,
  drop column if exists source,
  drop column if exists external_product_id,
  drop column if exists external_parent_id,
  drop column if exists variation_order;
