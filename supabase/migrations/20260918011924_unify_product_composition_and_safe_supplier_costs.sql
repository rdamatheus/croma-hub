-- OPERAÇÃO CROMA — composição única, espelhamento Bling e custo seguro de fornecedor.

alter table public.product_components
  add column if not exists sync_to_bling boolean not null default true;

comment on column public.product_components.sync_to_bling is
  'True quando o componente faz parte da estrutura espelhada com o Bling; false para componentes locais usados somente no custo.';

drop index if exists public.product_components_unique_idx;
create unique index if not exists product_components_unique_idx
  on public.product_components (
    parent_product_id,
    coalesce(parent_variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
    component_product_id,
    coalesce(component_variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
    sync_to_bling
  );

create table if not exists public.product_composition_settings (
  product_id uuid primary key references public.products(id) on delete cascade,
  stock_type text,
  stock_posting text,
  source text not null default 'croma',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_composition_settings_stock_type_check check (stock_type is null or stock_type in ('F','V'))
);

comment on table public.product_composition_settings is
  'Configurações da estrutura do produto composto espelhadas com o Bling, incluindo tipo e lançamento de estoque.';

alter table public.product_composition_settings enable row level security;
drop policy if exists product_composition_settings_staff_read on public.product_composition_settings;
create policy product_composition_settings_staff_read on public.product_composition_settings
  for select to authenticated using ((select app_private.is_staff()));
drop policy if exists product_composition_settings_manager_all on public.product_composition_settings;
create policy product_composition_settings_manager_all on public.product_composition_settings
  for all to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
grant select,insert,update,delete on public.product_composition_settings to authenticated;

create table if not exists public.product_cost_adjustments (
  product_id uuid primary key references public.products(id) on delete cascade,
  fixed_freight_cost numeric not null default 0 check (fixed_freight_cost >= 0),
  batch_quantity numeric not null default 1 check (batch_quantity > 0),
  labor_cost numeric not null default 0 check (labor_cost >= 0),
  other_cost numeric not null default 0 check (other_cost >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_cost_adjustments is
  'Custos internos que não pertencem à estrutura do Bling. Frete fixo é diluído pela quantidade do lote; mão de obra e outros custos são unitários.';

alter table public.product_cost_adjustments enable row level security;
drop policy if exists product_cost_adjustments_staff_read on public.product_cost_adjustments;
create policy product_cost_adjustments_staff_read on public.product_cost_adjustments
  for select to authenticated using ((select app_private.is_staff()));
drop policy if exists product_cost_adjustments_manager_all on public.product_cost_adjustments;
create policy product_cost_adjustments_manager_all on public.product_cost_adjustments
  for all to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
grant select,insert,update,delete on public.product_cost_adjustments to authenticated;

alter table public.supplier_catalog_items
  add column if not exists list_price numeric,
  add column if not exists promotional_price numeric,
  add column if not exists cost_price_policy text not null default 'list';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid='public.supplier_catalog_items'::regclass and conname='supplier_catalog_items_list_price_check') then
    alter table public.supplier_catalog_items add constraint supplier_catalog_items_list_price_check check (list_price is null or list_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.supplier_catalog_items'::regclass and conname='supplier_catalog_items_promotional_price_check') then
    alter table public.supplier_catalog_items add constraint supplier_catalog_items_promotional_price_check check (promotional_price is null or promotional_price >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.supplier_catalog_items'::regclass and conname='supplier_catalog_items_cost_price_policy_check') then
    alter table public.supplier_catalog_items add constraint supplier_catalog_items_cost_price_policy_check check (cost_price_policy in ('list','current'));
  end if;
end $$;

update public.supplier_catalog_items set list_price=purchase_price where list_price is null and purchase_price is not null;

comment on column public.supplier_catalog_items.list_price is
  'Preço normal/de tabela do fornecedor. Deve ser a base segura de custo quando cost_price_policy=list.';
comment on column public.supplier_catalog_items.promotional_price is
  'Preço promocional observado; não é usado no custo seguro quando a política é list.';
comment on column public.supplier_catalog_items.cost_price_policy is
  'list usa o preço normal/de tabela; current permite usar purchase_price como custo corrente.';

insert into public.product_components (
  parent_product_id,component_product_id,quantity,waste_percent,position,active,source,sync_to_bling
)
select pcc.product_id,pcc.component_product_id,pcc.quantity,pcc.waste_percent,pcc.sort_order,true,'legacy_cost',false
from public.product_cost_components pcc
where not exists (
  select 1 from public.product_components pc
  where pc.parent_product_id=pcc.product_id
    and pc.parent_variant_id is null
    and pc.component_product_id=pcc.component_product_id
    and pc.component_variant_id is null
    and pc.sync_to_bling=false
)
on conflict do nothing;

comment on table public.product_cost_components is
  'LEGADO: mantida para compatibilidade histórica. A composição oficial e o cálculo novo usam product_components + product_cost_adjustments.';

create or replace function public.croma_refresh_product_cost(target_product uuid)
returns numeric language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare component_total numeric:=0; adjustment_total numeric:=0; total numeric:=0;
begin
  select coalesce(sum(c.quantity * coalesce(pc.cost,0) * (1 + c.waste_percent/100)),0)
  into component_total
  from public.product_components c
  left join public.product_costs pc on pc.product_id=c.component_product_id
  where c.parent_product_id=target_product and c.active=true;

  select coalesce(fixed_freight_cost/nullif(batch_quantity,0)+labor_cost+other_cost,0)
  into adjustment_total
  from public.product_cost_adjustments
  where product_id=target_product;

  total:=coalesce(component_total,0)+coalesce(adjustment_total,0);
  insert into public.product_costs(product_id,cost,updated_at)
  values(target_product,total,now())
  on conflict(product_id) do update set cost=excluded.cost,updated_at=excluded.updated_at;
  return total;
end;
$$;
revoke all on function public.croma_refresh_product_cost(uuid) from public, anon, authenticated;

create or replace function public.recalculate_product_cost(target_product uuid)
returns numeric language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])) then
    raise exception 'not authorized';
  end if;
  return public.croma_refresh_product_cost(target_product);
end;
$$;
grant execute on function public.recalculate_product_cost(uuid) to authenticated;

create or replace function public.croma_mark_composition_dirty(p_product_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.erp_product_sync_state(product_id,sync_policy,local_dirty,dirty_fields,outbound_state,updated_at)
  values(p_product_id,'auto_bidirectional',true,array['estrutura'::text],'pending',now())
  on conflict(product_id) do update set
    sync_policy='auto_bidirectional',
    local_dirty=true,
    dirty_fields=(select array(select distinct x from unnest(coalesce(public.erp_product_sync_state.dirty_fields,'{}'::text[]) || array['estrutura'::text]) x)),
    outbound_state=case when public.erp_product_sync_state.outbound_state='conflict' then 'conflict' else 'pending' end,
    last_error=case when public.erp_product_sync_state.outbound_state='conflict' then public.erp_product_sync_state.last_error else null end,
    updated_at=now();
end;
$$;
revoke all on function public.croma_mark_composition_dirty(uuid) from public, anon, authenticated;

create or replace function public.croma_product_components_after_change()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare pid uuid; should_sync boolean;
begin
  pid:=coalesce(new.parent_product_id,old.parent_product_id);
  should_sync:=coalesce(new.sync_to_bling,old.sync_to_bling,false);
  perform public.croma_refresh_product_cost(pid);
  if should_sync then perform public.croma_mark_composition_dirty(pid); end if;
  return coalesce(new,old);
end;
$$;
drop trigger if exists product_components_recalculate_and_sync on public.product_components;
create trigger product_components_recalculate_and_sync after insert or update or delete on public.product_components
for each row execute function public.croma_product_components_after_change();

create or replace function public.croma_product_composition_settings_after_change()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare pid uuid;
begin
  pid:=coalesce(new.product_id,old.product_id);
  perform public.croma_mark_composition_dirty(pid);
  return coalesce(new,old);
end;
$$;
drop trigger if exists product_composition_settings_mark_sync on public.product_composition_settings;
create trigger product_composition_settings_mark_sync after insert or update or delete on public.product_composition_settings
for each row execute function public.croma_product_composition_settings_after_change();

create or replace function public.croma_product_cost_adjustments_after_change()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
begin
  perform public.croma_refresh_product_cost(coalesce(new.product_id,old.product_id));
  return coalesce(new,old);
end;
$$;
drop trigger if exists product_cost_adjustments_recalculate on public.product_cost_adjustments;
create trigger product_cost_adjustments_recalculate after insert or update or delete on public.product_cost_adjustments
for each row execute function public.croma_product_cost_adjustments_after_change();

create or replace function public.croma_product_cost_cascade()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare dep record; changed_product uuid;
begin
  if current_setting('croma.cost_recalc_running',true)='1' then return coalesce(new,old); end if;
  changed_product:=coalesce(new.product_id,old.product_id);
  perform set_config('croma.cost_recalc_running','1',true);
  for dep in
    with recursive ancestors(product_id,depth,path) as (
      select pc.parent_product_id,1,array[changed_product,pc.parent_product_id]::uuid[]
      from public.product_components pc where pc.component_product_id=changed_product and pc.active=true
      union all
      select pc.parent_product_id,a.depth+1,a.path||pc.parent_product_id
      from ancestors a join public.product_components pc on pc.component_product_id=a.product_id and pc.active=true
      where a.depth<20 and not pc.parent_product_id=any(a.path)
    )
    select product_id,min(depth) depth from ancestors group by product_id order by min(depth)
  loop
    perform public.croma_refresh_product_cost(dep.product_id);
  end loop;
  perform set_config('croma.cost_recalc_running','0',true);
  return coalesce(new,old);
exception when others then
  perform set_config('croma.cost_recalc_running','0',true);
  raise;
end;
$$;
drop trigger if exists product_costs_cascade_to_compositions on public.product_costs;
create trigger product_costs_cascade_to_compositions after insert or update of cost or delete on public.product_costs
for each row execute function public.croma_product_cost_cascade();

create or replace function public.croma_normalize_bling_product_operational(p_product_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  p public.products%rowtype; raw jsonb; stock jsonb; custom_item jsonb; component_item jsonb;
  component_ext bigint; component_local uuid; component_qty numeric; component_pos integer:=0;
  supplier_contact_ext text; supplier_contact_local uuid; supplier_local uuid; supplier_purchase numeric;
  now_ts timestamptz:=now(); structure jsonb;
begin
  select * into p from public.products where id=p_product_id;
  if not found then return; end if;
  raw:=p.metadata->'bling_raw';
  if raw is null or jsonb_typeof(raw)<>'object' then return; end if;
  structure:=raw->'estrutura';

  if upper(coalesce(raw->>'formato',''))='E' or jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb))>0 then
    update public.products set product_format='composition' where id=p_product_id and product_format<>'composition';
  elsif p.product_format='composition' and coalesce(upper(raw->>'formato'),'S')<>'E'
    and jsonb_array_length(coalesce(raw#>'{estrutura,componentes}','[]'::jsonb))=0 then
    update public.products set product_format='simple' where id=p_product_id and product_format='composition';
  end if;

  if structure is not null and jsonb_typeof(structure)='object' then
    insert into public.product_composition_settings(product_id,stock_type,stock_posting,source,updated_at)
    values(p_product_id,nullif(structure->>'tipoEstoque',''),nullif(structure->>'lancamentoEstoque',''),'bling',now_ts)
    on conflict(product_id) do update set stock_type=excluded.stock_type,stock_posting=excluded.stock_posting,source='bling',updated_at=excluded.updated_at;
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
        values(p_product_id,'bling',custom_item->>'idCampoCustomizado',nullif(custom_item->>'idVinculo',''),nullif(custom_item->>'item',''),
          custom_item->'valor',custom_item,coalesce(p.bling_last_synced_at,now_ts),now_ts);
      end if;
    end loop;
  end if;

  delete from public.product_components where parent_product_id=p_product_id and sync_to_bling=true;
  if jsonb_typeof(raw#>'{estrutura,componentes}')='array' then
    for component_item in select value from jsonb_array_elements(raw#>'{estrutura,componentes}') loop
      component_pos:=component_pos+1;
      component_ext:=public.croma_try_bigint(component_item#>>'{produto,id}');
      component_qty:=public.croma_try_numeric(component_item->>'quantidade');
      component_local:=null;
      select id into component_local from public.products where bling_product_id=component_ext limit 1;
      if component_local is not null and component_local<>p_product_id and coalesce(component_qty,0)>0 then
        insert into public.product_components(parent_product_id,component_product_id,quantity,waste_percent,position,active,source,external_component_id,sync_to_bling,updated_at)
        values(p_product_id,component_local,component_qty,0,component_pos,true,'bling',component_ext,true,now_ts);
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
end;
$$;

create or replace function public.croma_normalize_bling_product_scoped(p_product_id uuid)
returns void language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare p_type text;
begin
  select product_type into p_type from public.products where id=p_product_id;
  if p_type is null then return; end if;
  if p_type='produto' then perform public.croma_normalize_bling_product_details(p_product_id); end if;
  perform public.croma_normalize_bling_supplier_snapshot(p_product_id);
  perform public.croma_normalize_bling_product_operational(p_product_id);
end;
$$;

create or replace function public.croma_products_bling_normalize_trigger()
returns trigger language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare dep record;
begin
  perform public.croma_normalize_bling_product_scoped(new.id);
  perform public.croma_reconcile_bling_supplier_catalog(new.id);
  if new.bling_product_id is not null then
    for dep in
      select id from public.products
      where id<>new.id
        and jsonb_typeof(metadata#>'{bling_raw,estrutura,componentes}')='array'
        and (metadata#>'{bling_raw,estrutura,componentes}') @> jsonb_build_array(jsonb_build_object('produto',jsonb_build_object('id',new.bling_product_id)))
    loop
      perform public.croma_normalize_bling_product_scoped(dep.id);
      perform public.croma_reconcile_bling_supplier_catalog(dep.id);
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.croma_reconcile_bling_supplier_catalog(p_product_id uuid)
returns text language plpgsql security definer set search_path to 'public','pg_temp'
as $$
declare
  p public.products%rowtype; f jsonb; supplier_contact_ext text; supplier_code_value text;
  supplier_contact_local uuid; supplier_row public.suppliers%rowtype; catalog_row public.supplier_catalog_items%rowtype;
  link_row public.product_suppliers%rowtype; other_preferred boolean; catalog_price numeric;
begin
  select * into p from public.products where id=p_product_id;
  if not found then return 'product_not_found'; end if;
  f:=p.metadata#>'{bling_raw,fornecedor}';
  if f is null or jsonb_typeof(f)<>'object' or f='{}'::jsonb then return 'supplier_not_present'; end if;
  supplier_code_value:=nullif(btrim(f->>'codigo'),'');
  if supplier_code_value is null then return 'supplier_code_missing'; end if;
  supplier_contact_ext:=coalesce(nullif(f#>>'{contato,id}',''),nullif(f->>'idContato',''));
  if supplier_contact_ext is null then return 'supplier_contact_missing'; end if;

  select m.local_id into supplier_contact_local from public.erp_entity_mappings m
  where m.provider='bling' and m.entity_type='customer' and m.external_id=supplier_contact_ext order by m.updated_at desc limit 1;
  if supplier_contact_local is null then
    select cp.id into supplier_contact_local from public.customer_profiles cp
    where cp.bling_contact_id::text=supplier_contact_ext order by cp.updated_at desc limit 1;
  end if;
  if supplier_contact_local is null then return 'supplier_contact_not_mapped'; end if;

  select s.* into supplier_row from public.suppliers s where s.contact_id=supplier_contact_local and s.active=true order by s.updated_at desc limit 1;
  if not found then return 'supplier_extension_not_found'; end if;

  select sci.* into catalog_row from public.supplier_catalog_items sci
  where sci.supplier_id=supplier_row.id and sci.active=true and sci.validation_status='ok'
    and coalesce(case when sci.cost_price_policy='list' then coalesce(sci.list_price,sci.purchase_price) else sci.purchase_price end,0)>0
    and upper(btrim(sci.sku))=upper(supplier_code_value)
  order by (sci.sku=supplier_code_value) desc,sci.updated_at desc limit 1;

  if not found then
    if exists(select 1 from public.supplier_catalog_items sci where sci.supplier_id=supplier_row.id and sci.active=true and upper(btrim(sci.sku))=upper(supplier_code_value) and sci.validation_status<>'ok') then return 'catalog_item_not_validated'; end if;
    if exists(select 1 from public.supplier_catalog_items sci where sci.supplier_id=supplier_row.id and sci.active=true and upper(btrim(sci.sku))=upper(supplier_code_value)
      and coalesce(case when sci.cost_price_policy='list' then coalesce(sci.list_price,sci.purchase_price) else sci.purchase_price end,0)<=0) then return 'catalog_item_price_not_ready'; end if;
    return 'catalog_item_not_found';
  end if;

  catalog_price:=case when catalog_row.cost_price_policy='list' then coalesce(catalog_row.list_price,catalog_row.purchase_price) else catalog_row.purchase_price end;

  select ps.* into link_row from public.product_suppliers ps
  where ps.product_id=p_product_id and ps.variant_id is null and ps.supplier_id=supplier_row.id
  order by ps.preferred desc,ps.created_at limit 1;

  if found then
    select exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.id<>link_row.id and ps.preferred=true and ps.active=true) into other_preferred;
    update public.product_suppliers set supplier_catalog_item_id=catalog_row.id,supplier_sku=catalog_row.sku,
      purchase_unit=coalesce(catalog_row.unit,purchase_unit,p.unidade),purchase_price=catalog_price,
      freight_cost=coalesce(supplier_row.default_order_freight,0),minimum_order_quantity=catalog_row.minimum_order_quantity,
      lead_time_days=catalog_row.lead_time_days,supplier_product_description=coalesce(catalog_row.description,catalog_row.name,supplier_product_description),
      preferred=case when link_row.preferred then true when not other_preferred then true else false end,
      active=true,last_quote_at=now(),updated_at=now()
    where id=link_row.id returning * into link_row;
  else
    select exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.preferred=true and ps.active=true) into other_preferred;
    insert into public.product_suppliers(product_id,variant_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_unit,conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,minimum_order_quantity,lead_time_days,supplier_product_description,preferred,active,last_quote_at,updated_at)
    values(p_product_id,null,supplier_row.id,catalog_row.id,catalog_row.sku,coalesce(catalog_row.unit,p.unidade),1,catalog_price,
      coalesce(supplier_row.default_order_freight,0),0,0,catalog_row.minimum_order_quantity,catalog_row.lead_time_days,
      coalesce(catalog_row.description,catalog_row.name),not other_preferred,true,now(),now())
    returning * into link_row;
  end if;

  if link_row.preferred then
    insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
    values(p_product_id,catalog_row.sku,catalog_price,now())
    on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();
    insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
    values(p_product_id,link_row.id,link_row.effective_unit_cost,1,'markup')
    on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set
      product_supplier_id=excluded.product_supplier_id,effective_cost=excluded.effective_cost,updated_at=now();
  end if;
  return 'linked';
end;
$$;

do $$
declare r record;
begin
  for r in select id from public.products where metadata ? 'bling_raw' loop
    perform public.croma_normalize_bling_product_scoped(r.id);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select distinct parent_product_id id from public.product_components loop
    perform public.croma_refresh_product_cost(r.id);
  end loop;
end $$;
