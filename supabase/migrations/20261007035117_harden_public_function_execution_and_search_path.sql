-- Security hardening batch 2:
-- 1) fix mutable search_path warnings,
-- 2) remove direct public execution from a trigger-only SECURITY DEFINER function,
-- 3) convert public catalog RPCs to SECURITY INVOKER while keeping the public contract,
-- 4) move privileged order/supplier/cost implementations to app_private and expose invoker wrappers.
-- Mirrors the production migration applied as:
-- 20261007035117_harden_public_function_execution_and_search_path

alter function public.croma_try_numeric(text) set search_path = '';
alter function public.croma_try_bigint(text) set search_path = '';
alter function public.set_site_approval_updated_at() set search_path = '';

revoke execute on function public.croma_normalize_product_production_mode() from public;
revoke execute on function public.croma_normalize_product_production_mode() from anon;
revoke execute on function public.croma_normalize_product_production_mode() from authenticated;

create or replace function public.public_catalog_products_fast(
  p_scope text default null::text,
  p_category_ids uuid[] default null::uuid[],
  p_search text default null::text,
  p_require_published boolean default null::boolean,
  p_limit integer default 60,
  p_offset integer default 0
)
returns table(
  id uuid,
  nome text,
  sku text,
  slug text,
  descricao text,
  short_description text,
  preco numeric,
  catalog_category_id uuid,
  product_type text,
  ativo boolean,
  published_on_site boolean,
  is_sellable boolean,
  is_input boolean,
  metadata jsonb,
  child_count integer,
  commercial_min_price numeric,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
with params as (
  select
    nullif(btrim(regexp_replace(coalesce(p_search, ''), '[,%()]', ' ', 'g')), '') as q,
    greatest(1, least(100, coalesce(p_limit, 60))) as lim,
    greatest(0, coalesce(p_offset, 0)) as off
),
filtered as materialized (
  select p.id, p.nome
  from public.products p
  join public.catalog_categories c on c.id = p.catalog_category_id
  cross join params
  where p.ativo = true
    and p.is_sellable = true
    and p.is_input = false
    and c.ativo = true
    and c.public_visible = true
    and (p.product_type = 'produto' or (p.product_type = 'servico' and p.published_on_site = true))
    and (p_scope is null or p.product_type = p_scope)
    and (coalesce(p_require_published, false) = false or p.published_on_site = true)
    and (p_category_ids is null or cardinality(p_category_ids) = 0 or p.catalog_category_id = any(p_category_ids))
    and (
      params.q is null
      or p.nome ilike ('%' || params.q || '%')
      or p.sku ilike ('%' || params.q || '%')
      or p.short_description ilike ('%' || params.q || '%')
    )
),
paged as materialized (
  select filtered.id
  from filtered
  cross join params
  order by filtered.nome, filtered.id
  limit (select lim from params)
  offset (select off from params)
),
total as (
  select count(*)::bigint as value from filtered
)
select
  pc.id,
  pc.nome,
  pc.sku,
  pc.slug,
  pc.descricao,
  pc.short_description,
  pc.preco,
  pc.catalog_category_id,
  pc.product_type,
  pc.ativo,
  pc.published_on_site,
  pc.is_sellable,
  pc.is_input,
  pc.metadata,
  pc.child_count,
  pc.commercial_min_price,
  total.value as total_count
from paged
join public.public_catalog_products pc on pc.id = paged.id
cross join total
order by pc.nome, pc.id;
$function$;

revoke all on function public.public_catalog_products_fast(text, uuid[], text, boolean, integer, integer) from public;
grant execute on function public.public_catalog_products_fast(text, uuid[], text, boolean, integer, integer) to anon, authenticated;

create or replace function public.public_product_commercial_actions_fast(
  p_product_ids uuid[] default null::uuid[]
)
returns table(
  product_id uuid,
  commercial_action text
)
language sql
stable
security invoker
set search_path = ''
as $function$
with ids as (
  select distinct unnest(coalesce(p_product_ids, array[]::uuid[])) as id
),
visible_products as materialized (
  select pc.id, pc.product_type, pc.preco
  from ids
  join public.public_catalog_products pc on pc.id = ids.id
)
select
  p.id as product_id,
  case
    when p.product_type = 'servico' then 'quote'
    when m.mode = 'quote' then 'quote'
    when coalesce(p.preco, 0) <= 0 then 'quote'
    when m.mode = 'configure' then 'configure'
    when m.mode = 'buy' then 'buy'
    else 'buy'
  end as commercial_action
from visible_products p
left join public.site_product_commercial_modes m on m.product_id = p.id;
$function$;

revoke all on function public.public_product_commercial_actions_fast(uuid[]) from public;
grant execute on function public.public_product_commercial_actions_fast(uuid[]) to anon, authenticated;

create or replace function app_private.cancel_own_order_impl(p_order_id uuid)
returns table(order_id uuid, order_code text, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and customer_id = v_uid
  for update;

  if not found then
    raise exception using errcode='P0002', message='Pedido não encontrado.';
  end if;

  if v_order.status not in ('recebido','aguardando_pagamento') then
    raise exception using errcode='P0001', message='Este pedido não pode mais ser cancelado pelo cliente.';
  end if;

  if exists(
    select 1
    from public.payments p
    where p.order_id = p_order_id
      and (
        p.status in ('approved','processing','action_required')
        or (p.status='created' and p.provider_order_id is not null)
      )
  ) then
    raise exception using errcode='P0001', message='Há um pagamento em andamento ou aprovado. Fale com a Croma para cancelar este pedido.';
  end if;

  update public.orders
  set status='cancelado', updated_at=now()
  where id=p_order_id;

  update public.order_stock_reservations
  set status='released', updated_at=now()
  where order_id=p_order_id
    and status='active';

  return query
  select v_order.id, v_order.order_code, 'cancelado'::text;
end
$function$;

revoke all on function app_private.cancel_own_order_impl(uuid) from public;
grant execute on function app_private.cancel_own_order_impl(uuid) to authenticated;

create or replace function public.cancel_own_order(p_order_id uuid)
returns table(order_id uuid, order_code text, status text)
language sql
security invoker
set search_path = ''
as $function$
  select *
  from app_private.cancel_own_order_impl(p_order_id);
$function$;

revoke all on function public.cancel_own_order(uuid) from public;
revoke all on function public.cancel_own_order(uuid) from anon;
grant execute on function public.cancel_own_order(uuid) to authenticated;

grant usage on schema app_private to service_role;

create or replace function app_private.croma_set_supplier_catalog_validation_impl(
  p_item_id uuid,
  p_status text,
  p_note text default null::text,
  p_approved_price numeric default null::numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_item public.supplier_catalog_items%rowtype;
  v_approved numeric;
  v_supplier_contact uuid;
  v_external_contact text;
  v_product_id uuid;
  v_reconciled integer := 0;
  v_reconcile_errors jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000', message='Sessão inválida. Entre novamente no Croma Hub.';
  end if;

  if not app_private.is_manager() then
    raise exception using errcode='42501', message='Acesso restrito à gestão.';
  end if;

  if p_status not in ('ok','review','reject') then
    raise exception using errcode='22023', message='Status de validação inválido.';
  end if;

  select * into v_item
  from public.supplier_catalog_items
  where id=p_item_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='Item do catálogo não encontrado.';
  end if;

  if p_status='reject' and btrim(coalesce(p_note,''))='' then
    raise exception using errcode='22023', message='Informe o motivo da rejeição.';
  end if;

  v_approved := coalesce(p_approved_price,v_item.pending_purchase_price,v_item.purchase_price);

  if p_status='ok' and coalesce(v_approved,0)<=0 then
    raise exception using errcode='22023', message='Informe um preço aprovado maior que zero antes de validar.';
  end if;

  update public.supplier_catalog_items
  set validation_status=p_status,
      validation_reviewed_by=v_user,
      validation_reviewed_at=now(),
      validation_review_note=nullif(btrim(coalesce(p_note,'')),''),
      validation_source='manual',
      purchase_price=case when p_status='ok' then v_approved else purchase_price end,
      pending_purchase_price=case
        when p_status='ok' then null
        when p_approved_price is not null then p_approved_price
        else pending_purchase_price
      end
  where id=p_item_id
  returning * into v_item;

  if p_status='ok' then
    select s.contact_id into v_supplier_contact
    from public.suppliers s
    where s.id=v_item.supplier_id and s.active=true
    limit 1;

    if v_supplier_contact is not null then
      select cp.bling_contact_id::text into v_external_contact
      from public.customer_profiles cp
      where cp.id=v_supplier_contact
      limit 1;
    end if;

    if nullif(v_external_contact,'') is not null then
      for v_product_id in
        select distinct pses.product_id
        from public.product_supplier_external_snapshots pses
        where pses.external_contact_id=v_external_contact
          and upper(btrim(coalesce(pses.supplier_code,'')))=upper(btrim(v_item.sku))
          and pses.product_id is not null
      loop
        begin
          perform public.croma_reconcile_bling_supplier_catalog(v_product_id);
          v_reconciled := v_reconciled + 1;
        exception when others then
          v_reconcile_errors := v_reconcile_errors || jsonb_build_array(
            jsonb_build_object('product_id',v_product_id,'error',sqlerrm)
          );
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'item_id',v_item.id,
    'status',v_item.validation_status,
    'purchase_price',v_item.purchase_price,
    'pending_purchase_price',v_item.pending_purchase_price,
    'reconciled_products',v_reconciled,
    'reconcile_errors',v_reconcile_errors
  );
end;
$function$;

revoke all on function app_private.croma_set_supplier_catalog_validation_impl(uuid, text, text, numeric) from public;
grant execute on function app_private.croma_set_supplier_catalog_validation_impl(uuid, text, text, numeric) to authenticated, service_role;

create or replace function public.croma_set_supplier_catalog_validation(
  p_item_id uuid,
  p_status text,
  p_note text default null::text,
  p_approved_price numeric default null::numeric
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select app_private.croma_set_supplier_catalog_validation_impl(
    p_item_id,
    p_status,
    p_note,
    p_approved_price
  );
$function$;

revoke all on function public.croma_set_supplier_catalog_validation(uuid, text, text, numeric) from public;
revoke all on function public.croma_set_supplier_catalog_validation(uuid, text, text, numeric) from anon;
grant execute on function public.croma_set_supplier_catalog_validation(uuid, text, text, numeric) to authenticated, service_role;

create or replace function app_private.recalculate_product_cost_impl(target_product uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not exists(
    select 1
    from public.profiles p
    where p.id=(select auth.uid())
      and p.ativo=true
      and p.role=any(array['owner'::text,'manager'::text])
  ) then
    raise exception 'not authorized';
  end if;

  return public.croma_refresh_product_cost(target_product);
end;
$function$;

revoke all on function app_private.recalculate_product_cost_impl(uuid) from public;
grant execute on function app_private.recalculate_product_cost_impl(uuid) to authenticated, service_role;

create or replace function public.recalculate_product_cost(target_product uuid)
returns numeric
language sql
security invoker
set search_path = ''
as $function$
  select app_private.recalculate_product_cost_impl(target_product);
$function$;

revoke all on function public.recalculate_product_cost(uuid) from public;
revoke all on function public.recalculate_product_cost(uuid) from anon;
grant execute on function public.recalculate_product_cost(uuid) to authenticated, service_role;
