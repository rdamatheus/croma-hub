-- Applied in production on 2026-10-24. Generic structural sync; no product-specific exceptions.
ALTER TABLE public.erp_product_sync_state DROP CONSTRAINT IF EXISTS erp_product_sync_state_outbound_state_check;
ALTER TABLE public.erp_product_sync_state ADD CONSTRAINT erp_product_sync_state_outbound_state_check
CHECK (outbound_state = ANY (ARRAY['clean','review_required','pending','approved','syncing','applied','blocked_remote_change','conflict','manual_service','error','structural_review']::text[]));

CREATE OR REPLACE FUNCTION public.croma_normalize_bling_product_operational(p_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  p public.products%rowtype;
  raw jsonb;
  stock jsonb;
  custom_item jsonb;
  component_item jsonb;
  component_ext bigint;
  component_local uuid;
  component_qty numeric;
  component_pos integer:=0;
  supplier_contact_ext text;
  supplier_contact_local uuid;
  supplier_local uuid;
  supplier_purchase numeric;
  now_ts timestamptz:=now();
  structure jsonb;
begin
  select * into p from public.products where id=p_product_id;
  if not found then return; end if;
  raw:=p.metadata->'bling_raw';
  if raw is null or jsonb_typeof(raw)<>'object' then return; end if;

  structure:=raw->'estrutura';

  if upper(coalesce(raw->>'formato',''))='E'
     or jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb))>0 then
    update public.products set product_format='composition'
    where id=p_product_id and product_format<>'composition';
  elsif p.product_format='composition'
        and coalesce(upper(raw->>'formato'),'S')<>'E'
        and jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb))=0 then
    update public.products set product_format='simple'
    where id=p_product_id and product_format='composition';
  end if;

  if structure is not null and jsonb_typeof(structure)='object' then
    insert into public.product_composition_settings(
      product_id,stock_type,stock_posting,source,updated_at
    ) values(
      p_product_id,
      nullif(structure->>'tipoEstoque',''),
      nullif(structure->>'lancamentoEstoque',''),
      'bling',
      now_ts
    )
    on conflict(product_id) do update set
      stock_type=excluded.stock_type,
      stock_posting=excluded.stock_posting,
      source='bling',
      updated_at=excluded.updated_at;
  end if;

  stock:=raw->'estoque';
  if stock is not null and jsonb_typeof(stock)='object' then
    insert into public.product_stock_snapshots(
      product_id,source,available_stock,virtual_stock,minimum_stock,maximum_stock,
      storage_location,crossdocking,synced_at,metadata,updated_at
    )
    values(
      p_product_id,'bling',
      public.croma_try_numeric(stock->>'saldoVirtualTotal'),
      public.croma_try_numeric(stock->>'saldoVirtualTotal'),
      public.croma_try_numeric(stock->>'minimo'),
      public.croma_try_numeric(stock->>'maximo'),
      nullif(stock->>'localizacao',''),
      public.croma_try_numeric(stock->>'crossdocking'),
      coalesce(p.bling_last_synced_at,now_ts),
      stock,now_ts
    )
    on conflict(product_id,source) do update set
      available_stock=excluded.available_stock,
      virtual_stock=excluded.virtual_stock,
      minimum_stock=excluded.minimum_stock,
      maximum_stock=excluded.maximum_stock,
      storage_location=excluded.storage_location,
      crossdocking=excluded.crossdocking,
      synced_at=excluded.synced_at,
      metadata=excluded.metadata,
      updated_at=excluded.updated_at;
  end if;

  delete from public.product_custom_field_values
  where product_id=p_product_id and source='bling';
  if jsonb_typeof(raw->'camposCustomizados')='array' then
    for custom_item in select value from jsonb_array_elements(raw->'camposCustomizados') loop
      if coalesce(custom_item->>'idCampoCustomizado','')<>'' then
        insert into public.product_custom_field_values(
          product_id,source,external_field_id,external_link_id,item,value,metadata,synced_at,updated_at
        )
        values(
          p_product_id,'bling',
          custom_item->>'idCampoCustomizado',
          nullif(custom_item->>'idVinculo',''),
          nullif(custom_item->>'item',''),
          custom_item->'valor',
          custom_item,
          coalesce(p.bling_last_synced_at,now_ts),
          now_ts
        );
      end if;
    end loop;
  end if;


  -- Reconciliação idempotente e não destrutiva de componentes importados.
  -- Pré-validação evita remover insumos quando um ID remoto não está vinculado.
  if jsonb_typeof(raw#>'{estrutura,componentes}')='array' then
    for component_item in select value from jsonb_array_elements(raw#>'{estrutura,componentes}') loop
      component_ext:=public.croma_try_bigint(component_item#>>'{produto,id}');
      component_qty:=public.croma_try_numeric(component_item->>'quantidade');
      if component_ext is null or component_ext<=0 or coalesce(component_qty,0)<=0 then
        raise exception 'Composição Bling inválida para produto %: componente/quantidade ausente',p_product_id;
      end if;
      if component_ext=p.bling_product_id then
        raise exception 'Composição Bling não pode conter o próprio produto %',p_product_id;
      end if;
      if (select count(*) from jsonb_array_elements(raw#>'{estrutura,componentes}') as x
          where public.croma_try_bigint(x#>>'{produto,id}')=component_ext)>1 then
        raise exception 'Composição Bling com componente duplicado: %',component_ext;
      end if;
      if not exists(select 1 from public.products where bling_product_id=component_ext) then
        raise exception 'Componente Bling % ainda não vinculado ao Croma Hub (produto %)',component_ext,p_product_id;
      end if;
    end loop;
  end if;

  component_pos:=0;
  if jsonb_typeof(raw#>'{estrutura,componentes}')='array' then
    for component_item in select value from jsonb_array_elements(raw#>'{estrutura,componentes}') loop
      component_pos:=component_pos+1;
      component_ext:=public.croma_try_bigint(component_item#>>'{produto,id}');
      component_qty:=public.croma_try_numeric(component_item->>'quantidade');
      select id into component_local from public.products
        where bling_product_id=component_ext limit 1;

      update public.product_components set
        component_product_id=component_local,quantity=component_qty,position=component_pos,
        active=true,source='bling',external_component_id=component_ext,
        sync_to_bling=true,updated_at=now_ts
      where id=(
        select c.id from public.product_components c
        where c.parent_product_id=p_product_id and c.sync_to_bling=true
          and (c.external_component_id=component_ext or c.component_product_id=component_local)
        order by c.active desc,c.created_at asc limit 1
      );
      if not found then
        insert into public.product_components(
          parent_product_id,component_product_id,quantity,waste_percent,position,
          active,source,external_component_id,sync_to_bling,updated_at
        ) values(
          p_product_id,component_local,component_qty,0,component_pos,
          true,'bling',component_ext,true,now_ts
        );
      end if;
    end loop;
  end if;

  -- Histórico preservado: componentes removidos no Bling ficam inativos, sem DELETE.
  update public.product_components c set active=false,updated_at=now_ts
  where c.parent_product_id=p_product_id and c.sync_to_bling=true and c.active=true
    and not exists (
      select 1 from jsonb_array_elements(
        case when jsonb_typeof(raw#>'{estrutura,componentes}')='array'
          then raw#>'{estrutura,componentes}' else '[]'::jsonb end
      ) x
      where public.croma_try_bigint(x#>>'{produto,id}')=
        coalesce(c.external_component_id,(select cp.bling_product_id from public.products cp where cp.id=c.component_product_id))
    );

  supplier_contact_ext:=coalesce(raw#>>'{fornecedor,contato,id}',raw#>>'{fornecedor,idContato}');
  if coalesce(supplier_contact_ext,'')<>'' then
    select m.local_id into supplier_contact_local
    from public.erp_entity_mappings m
    where m.provider='bling'
      and m.entity_type='customer'
      and m.external_id=supplier_contact_ext
    limit 1;
    if supplier_contact_local is not null then
      select s.id into supplier_local
      from public.suppliers s
      where s.contact_id=supplier_contact_local
      limit 1;
    end if;
  end if;

  if supplier_local is not null then
    supplier_purchase:=coalesce(
      public.croma_try_numeric(raw#>>'{fornecedor,precoCompra}'),
      public.croma_try_numeric(raw#>>'{fornecedor,precoCusto}'),
      0
    );
    insert into public.product_suppliers(
      product_id,variant_id,supplier_id,supplier_sku,purchase_unit,conversion_factor,
      purchase_price,freight_cost,tax_cost,other_cost,preferred,active,updated_at
    )
    values(
      p_product_id,null,supplier_local,nullif(raw#>>'{fornecedor,codigo}',''),p.unidade,1,
      supplier_purchase,0,0,0,
      not exists(
        select 1 from public.product_suppliers ps
        where ps.product_id=p_product_id
          and ps.variant_id is null
          and ps.preferred and ps.active
      ),
      true,now_ts
    )
    on conflict(
      product_id,
      coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
      supplier_id
    ) do update set
      supplier_sku=excluded.supplier_sku,
      purchase_unit=excluded.purchase_unit,
      purchase_price=excluded.purchase_price,
      active=true,
      updated_at=excluded.updated_at;
  end if;
end;
$function$

