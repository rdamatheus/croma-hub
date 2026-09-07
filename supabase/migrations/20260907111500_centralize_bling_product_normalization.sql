-- A normalização operacional do Bling é centralizada no banco a partir de metadata.bling_raw.
-- Isso faz importação manual, sincronização automática e futuras rotinas usarem a mesma regra.

alter table public.product_components
  add column if not exists source text not null default 'croma',
  add column if not exists external_component_id bigint;
create unique index if not exists product_components_bling_external_uidx
  on public.product_components(parent_product_id, source, external_component_id)
  where external_component_id is not null;

create unique index if not exists product_option_groups_product_code_uidx
  on public.product_option_groups(product_id, code);
create unique index if not exists product_options_group_code_uidx
  on public.product_options(group_id, code);

create or replace function public.croma_try_numeric(p_value text)
returns numeric language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value) = '' then return null; end if;
  if replace(btrim(p_value), ',', '.') ~ '^-?[0-9]+([.][0-9]+)?$' then
    return replace(btrim(p_value), ',', '.')::numeric;
  end if;
  return null;
exception when others then return null;
end; $$;

create or replace function public.croma_try_bigint(p_value text)
returns bigint language plpgsql immutable as $$
begin
  if p_value is null or btrim(p_value) !~ '^[0-9]+$' then return null; end if;
  return btrim(p_value)::bigint;
exception when others then return null;
end; $$;

create or replace function public.croma_variation_attributes(p_name text)
returns jsonb language plpgsql immutable as $$
declare result jsonb := '{}'::jsonb; part text; k text; v text; pos integer;
begin
  if p_name is null or btrim(p_name) = '' then return result; end if;
  result := jsonb_build_object('_raw', btrim(p_name));
  foreach part in array regexp_split_to_array(p_name, ';') loop
    pos := strpos(part, ':');
    if pos > 1 then
      k := btrim(substr(part, 1, pos - 1));
      v := btrim(substr(part, pos + 1));
      if k <> '' and v <> '' then result := result || jsonb_build_object(k, v); end if;
    end if;
  end loop;
  return result;
end; $$;

create or replace function public.croma_attr_code(p_value text)
returns text language sql immutable as $$
  select coalesce(nullif(trim(both '_' from lower(regexp_replace(coalesce(p_value,''), '[^a-zA-Z0-9]+', '_', 'g'))), ''), 'attr_' || substr(md5(coalesce(p_value,'')),1,10));
$$;

create or replace function public.croma_normalize_bling_product(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.products%rowtype; raw jsonb; fmt text; parent_ext bigint; parent_local uuid;
  attrs jsonb; vname text; vorder integer; kv record; v_group_id uuid; stock jsonb;
  custom_item jsonb; component_item jsonb; component_ext bigint; component_local uuid;
  component_qty numeric; component_pos integer := 0; supplier_contact_ext text;
  supplier_contact_local uuid; supplier_local uuid; supplier_purchase numeric; now_ts timestamptz := now();
begin
  select * into p from public.products where id = p_product_id;
  if not found then return; end if;
  raw := p.metadata->'bling_raw';
  if raw is null or jsonb_typeof(raw) <> 'object' then return; end if;

  parent_ext := public.croma_try_bigint(coalesce(raw#>>'{variacao,produtoPai,id}', raw#>>'{produtoPai,id}', raw->>'idProdutoPai'));
  select id into parent_local from public.products where bling_product_id = parent_ext limit 1;
  fmt := upper(coalesce(raw->>'formato',''));

  update public.products
  set bling_parent_id = parent_ext,
      parent_product_id = case when parent_local is not null and parent_local <> p_product_id then parent_local else null end,
      product_format = case
        when fmt = 'E' or jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb)) > 0 then 'composition'
        when fmt = 'V' or jsonb_array_length(coalesce(raw->'variacoes','[]'::jsonb)) > 0 then 'variation'
        else 'simple'
      end
  where id = p_product_id;

  if parent_local is not null and parent_local <> p_product_id then
    update public.products set product_format='variation' where id=parent_local and product_format <> 'variation';
    vname := coalesce(nullif(raw#>>'{variacao,nome}',''), p.nome);
    vorder := coalesce((public.croma_try_numeric(raw#>>'{variacao,ordem}'))::integer,0);
    attrs := public.croma_variation_attributes(vname);

    insert into public.product_variants(product_id,child_product_id,sku,code,nome,option_values,base_price,ativo,source,external_product_id,external_parent_id,variation_order,updated_at)
    values(parent_local,p_product_id,p.sku,coalesce(nullif(p.bling_sku,''),nullif(p.sku,''),p.bling_product_id::text),vname,attrs,p.preco,p.ativo,'bling',p.bling_product_id,parent_ext,vorder,now_ts)
    on conflict (child_product_id) where child_product_id is not null do update set
      product_id=excluded.product_id,sku=excluded.sku,code=excluded.code,nome=excluded.nome,option_values=excluded.option_values,
      base_price=excluded.base_price,ativo=excluded.ativo,source='bling',external_product_id=excluded.external_product_id,
      external_parent_id=excluded.external_parent_id,variation_order=excluded.variation_order,updated_at=excluded.updated_at;

    for kv in select key, value #>> '{}' as value from jsonb_each(attrs) where key <> '_raw' loop
      insert into public.product_option_groups(product_id,code,nome,selection_type,required,ordem,ativo)
      values(parent_local,public.croma_attr_code(kv.key),kv.key,'single',true,0,true)
      on conflict (product_id,code) do update set nome=excluded.nome,ativo=true returning id into v_group_id;
      insert into public.product_options(group_id,code,nome,price_delta,ordem,ativo,metadata)
      values(v_group_id,public.croma_attr_code(kv.value),kv.value,0,0,true,jsonb_build_object('source','bling'))
      on conflict (group_id,code) do update set nome=excluded.nome,ativo=true,metadata=excluded.metadata;
    end loop;
  else
    delete from public.product_variants where child_product_id=p_product_id and source='bling';
  end if;

  stock := raw->'estoque';
  if stock is not null and jsonb_typeof(stock)='object' then
    insert into public.product_stock_snapshots(product_id,source,available_stock,virtual_stock,minimum_stock,maximum_stock,storage_location,crossdocking,synced_at,metadata,updated_at)
    values(p_product_id,'bling',public.croma_try_numeric(stock->>'saldoVirtualTotal'),public.croma_try_numeric(stock->>'saldoVirtualTotal'),
      public.croma_try_numeric(stock->>'minimo'),public.croma_try_numeric(stock->>'maximo'),nullif(stock->>'localizacao',''),
      public.croma_try_numeric(stock->>'crossdocking'),coalesce(p.bling_last_synced_at,now_ts),stock,now_ts)
    on conflict (product_id,source) do update set available_stock=excluded.available_stock,virtual_stock=excluded.virtual_stock,
      minimum_stock=excluded.minimum_stock,maximum_stock=excluded.maximum_stock,storage_location=excluded.storage_location,
      crossdocking=excluded.crossdocking,synced_at=excluded.synced_at,metadata=excluded.metadata,updated_at=excluded.updated_at;
  end if;

  delete from public.product_custom_field_values where product_id=p_product_id and source='bling';
  if jsonb_typeof(raw->'camposCustomizados')='array' then
    for custom_item in select value from jsonb_array_elements(raw->'camposCustomizados') loop
      if coalesce(custom_item->>'idCampoCustomizado','') <> '' then
        insert into public.product_custom_field_values(product_id,source,external_field_id,external_link_id,item,value,metadata,synced_at,updated_at)
        values(p_product_id,'bling',custom_item->>'idCampoCustomizado',nullif(custom_item->>'idVinculo',''),nullif(custom_item->>'item',''),
          custom_item->'valor',custom_item,coalesce(p.bling_last_synced_at,now_ts),now_ts);
      end if;
    end loop;
  end if;

  delete from public.product_components where parent_product_id=p_product_id and source='bling';
  if jsonb_typeof(raw#>'{estrutura,componentes}')='array' then
    for component_item in select value from jsonb_array_elements(raw#>'{estrutura,componentes}') loop
      component_pos := component_pos + 1;
      component_ext := public.croma_try_bigint(component_item#>>'{produto,id}'); component_qty := public.croma_try_numeric(component_item->>'quantidade');
      select id into component_local from public.products where bling_product_id=component_ext limit 1;
      if component_local is not null and component_local <> p_product_id and coalesce(component_qty,0) > 0 then
        insert into public.product_components(parent_product_id,component_product_id,quantity,waste_percent,position,active,source,external_component_id,updated_at)
        values(p_product_id,component_local,component_qty,0,component_pos,true,'bling',component_ext,now_ts)
        on conflict (parent_product_id,source,external_component_id) where external_component_id is not null do update set
          component_product_id=excluded.component_product_id,quantity=excluded.quantity,position=excluded.position,active=true,updated_at=excluded.updated_at;
      end if;
    end loop;
  end if;

  supplier_contact_ext := coalesce(raw#>>'{fornecedor,contato,id}',raw#>>'{fornecedor,idContato}');
  if coalesce(supplier_contact_ext,'') <> '' then
    select m.local_id into supplier_contact_local from public.erp_entity_mappings m
    where m.provider='bling' and m.entity_type='customer' and m.external_id=supplier_contact_ext limit 1;
    if supplier_contact_local is not null then select s.id into supplier_local from public.suppliers s where s.contact_id=supplier_contact_local limit 1; end if;
  end if;
  if supplier_local is not null then
    supplier_purchase := coalesce(public.croma_try_numeric(raw#>>'{fornecedor,precoCompra}'),public.croma_try_numeric(raw#>>'{fornecedor,precoCusto}'),0);
    insert into public.product_suppliers(product_id,variant_id,supplier_id,supplier_sku,purchase_unit,conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,preferred,active,updated_at)
    values(p_product_id,null,supplier_local,nullif(raw#>>'{fornecedor,codigo}',''),p.unidade,1,supplier_purchase,0,0,0,
      not exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.preferred and ps.active),true,now_ts)
    on conflict (product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),supplier_id) do update set
      supplier_sku=excluded.supplier_sku,purchase_unit=excluded.purchase_unit,purchase_price=excluded.purchase_price,active=true,updated_at=excluded.updated_at;
  end if;
end; $$;

create or replace function public.croma_products_bling_normalize_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare dep record;
begin
  perform public.croma_normalize_bling_product(new.id);
  if new.bling_product_id is not null then
    for dep in select id from public.products where id <> new.id
      and jsonb_typeof(metadata#>'{bling_raw,estrutura,componentes}')='array'
      and (metadata#>'{bling_raw,estrutura,componentes}') @> jsonb_build_array(jsonb_build_object('produto',jsonb_build_object('id',new.bling_product_id)))
    loop perform public.croma_normalize_bling_product(dep.id); end loop;
  end if;
  return new;
end; $$;

drop trigger if exists products_bling_normalize_after_write on public.products;
create trigger products_bling_normalize_after_write
after insert or update of metadata,bling_product_id,bling_last_synced_at on public.products
for each row when (new.metadata ? 'bling_raw') execute function public.croma_products_bling_normalize_trigger();

do $$ declare r record; begin
  for r in select id from public.products where metadata ? 'bling_raw' loop perform public.croma_normalize_bling_product(r.id); end loop;
end $$;
