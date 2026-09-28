alter table public.order_items
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists variant_id uuid references public.product_variants(id) on delete set null;

create index if not exists order_items_product_idx on public.order_items(product_id) where product_id is not null;
create index if not exists order_items_variant_idx on public.order_items(variant_id) where variant_id is not null;

create table if not exists public.order_stock_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid references public.product_variants(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  status text not null default 'active' check (status = any(array['active'::text,'committed'::text,'released'::text])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists order_stock_reservations_active_product_idx on public.order_stock_reservations(product_id,status) where status='active';

alter table public.order_stock_reservations enable row level security;
drop policy if exists order_stock_reservations_staff_read on public.order_stock_reservations;
create policy order_stock_reservations_staff_read on public.order_stock_reservations
  for select to authenticated using ((select app_private.is_staff()));
drop policy if exists order_stock_reservations_manager_all on public.order_stock_reservations;
create policy order_stock_reservations_manager_all on public.order_stock_reservations
  for all to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
revoke all on public.order_stock_reservations from public;
grant select,insert,update,delete on public.order_stock_reservations to authenticated;

create or replace function public.sync_active_cart(p_client_reference text,p_items jsonb,p_files jsonb default '[]'::jsonb)
returns uuid
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_cart uuid;
  v_item jsonb;
  v_opt jsonb;
  v_file jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_product_price numeric;
  v_product_type text;
  v_action text;
  v_qty integer;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select id into v_cart from public.carts where customer_id=v_uid and status='active' limit 1;
  if v_cart is null then insert into public.carts(customer_id,client_reference) values(v_uid,p_client_reference) returning id into v_cart; end if;
  delete from public.cart_items where cart_id=v_cart;

  for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    begin
      v_product_id:=nullif(v_item->>'productId','')::uuid;
    exception when others then
      raise exception 'Item do carrinho possui vínculo de produto inválido.';
    end;
    if v_product_id is null then raise exception 'Item do carrinho sem vínculo com produto.'; end if;

    select pc.nome,pc.preco,pc.product_type,ca.commercial_action
      into v_product_name,v_product_price,v_product_type,v_action
    from public.public_catalog_products pc
    join public.public_product_commercial_actions ca on ca.product_id=pc.id
    where pc.id=v_product_id;

    if not found then raise exception 'Produto indisponível para venda no site.'; end if;
    if v_product_type<>'produto' then raise exception '% deve ser solicitado por orçamento, não pelo checkout.',v_product_name; end if;
    if v_action='quote' then raise exception '% deve ser solicitado por orçamento.',v_product_name; end if;
    if v_action='configure' then raise exception '% precisa ser configurado antes da compra.',v_product_name; end if;
    if coalesce(v_product_price,0)<=0 then raise exception '% está sem preço válido para compra.',v_product_name; end if;

    v_qty:=greatest(1,coalesce(nullif(v_item->>'qty','')::int,1));
    insert into public.cart_items(cart_id,customer_id,client_item_id,product_id,variant_id,product_name,quantity,unit_price)
    values(v_cart,v_uid,v_item->>'id',v_product_id,null,v_product_name,v_qty,v_product_price)
    returning id into v_item_id;

    for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.cart_item_options(cart_item_id,option_name,option_value,position)
      values(v_item_id,v_opt->>'name',v_opt->>'value',coalesce((v_opt->>'position')::int,0));
    end loop;
  end loop;

  for v_file in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    select id into v_item_id from public.cart_items where cart_id=v_cart and client_item_id=v_file->>'cartItemId';
    insert into public.cart_files(cart_id,cart_item_id,customer_id,client_file_id,bucket,storage_path,original_name,mime_type,size_bytes)
    values(v_cart,v_item_id,v_uid,v_file->>'id',coalesce(nullif(v_file->>'bucket',''),'croma-arquivos'),v_file->>'path',v_file->>'name',v_file->>'type',coalesce((v_file->>'size')::bigint,0))
    on conflict(storage_path) do update set cart_id=excluded.cart_id,cart_item_id=excluded.cart_item_id,client_file_id=excluded.client_file_id;
  end loop;
  delete from public.cart_files cf where cf.cart_id=v_cart and not exists(select 1 from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) x where x->>'path'=cf.storage_path);
  update public.carts set updated_at=now() where id=v_cart;
  return v_cart;
end
$function$;

create or replace function public.checkout_active_cart(
  p_checkout_reference text,
  p_fulfillment text,
  p_payment_method text,
  p_delivery_fee numeric default 0,
  p_notes text default null,
  p_delivery_street text default null,
  p_delivery_number text default null,
  p_delivery_complement text default null,
  p_delivery_neighborhood text default null,
  p_delivery_city text default null,
  p_delivery_state text default null,
  p_delivery_zip text default null
)
returns table(order_id uuid,order_code text,total numeric)
language plpgsql
set search_path to ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_cart uuid;
  v_order uuid;
  v_code text;
  v_sub numeric;
  v_total numeric;
  v_status text;
  r record;
  v_order_item uuid;
  v_available numeric;
  v_synced_at timestamptz;
  v_reserved numeric;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select o.id,o.order_code,o.total into v_order,v_code,v_total
  from public.orders o where o.customer_id=v_uid and o.checkout_reference=p_checkout_reference;
  if v_order is not null then return query select v_order,v_code,v_total; return; end if;

  select id into v_cart from public.carts where customer_id=v_uid and status='active' for update;
  if v_cart is null then raise exception 'Active cart not found'; end if;
  if not exists(select 1 from public.cart_items where cart_id=v_cart) then raise exception 'Cart is empty'; end if;

  for r in
    select ci.id,ci.product_id,ci.variant_id,ci.product_name,ci.quantity,p.bling_product_id,p.product_type
    from public.cart_items ci
    join public.products p on p.id=ci.product_id
    where ci.cart_id=v_cart
    order by p.id
  loop
    perform 1 from public.products p where p.id=r.product_id for update;
    if r.product_type<>'produto' then raise exception '% não pode ser comprado pelo checkout.',r.product_name; end if;
    if r.bling_product_id is null then raise exception '% ainda não possui vínculo com o Bling.',r.product_name; end if;

    select s.available_stock,s.synced_at into v_available,v_synced_at
    from public.product_stock_snapshots s
    where s.product_id=r.product_id and s.source='bling';
    if v_synced_at is null or v_synced_at < now()-interval '10 minutes' then
      raise exception 'Estoque de % precisa ser atualizado no Bling antes de concluir a compra.',r.product_name;
    end if;
    if v_available is null then raise exception 'Saldo de % não está disponível no Bling.',r.product_name; end if;

    select coalesce(sum(osr.quantity),0) into v_reserved
    from public.order_stock_reservations osr
    where osr.product_id=r.product_id and osr.status='active';
    if (v_available-v_reserved) < r.quantity then
      raise exception 'Estoque insuficiente para %. Disponível para novos pedidos: %.',r.product_name,greatest(v_available-v_reserved,0);
    end if;
  end loop;

  select coalesce(sum(quantity*unit_price),0) into v_sub from public.cart_items where cart_id=v_cart;
  if v_sub<=0 then raise exception 'Cart is empty'; end if;

  v_total:=v_sub+greatest(coalesce(p_delivery_fee,0),0);
  v_code:='CRO-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_status:=case when p_payment_method='credito' then 'aguardando_pagamento' else 'recebido' end;

  insert into public.orders(order_code,customer_id,status,fulfillment,payment_method,subtotal,delivery_fee,total,notes,checkout_reference,delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_city,delivery_state,delivery_zip,delivery_address)
  values(v_code,v_uid,v_status,p_fulfillment,p_payment_method,v_sub,greatest(coalesce(p_delivery_fee,0),0),v_total,p_notes,p_checkout_reference,p_delivery_street,p_delivery_number,p_delivery_complement,p_delivery_neighborhood,p_delivery_city,p_delivery_state,p_delivery_zip,case when p_fulfillment='entrega' then jsonb_strip_nulls(jsonb_build_object('street',p_delivery_street,'number',p_delivery_number,'complement',p_delivery_complement,'neighborhood',p_delivery_neighborhood,'city',p_delivery_city,'state',p_delivery_state,'zip',p_delivery_zip)) else null end)
  returning id into v_order;

  for r in select * from public.cart_items where cart_id=v_cart order by created_at loop
    insert into public.order_items(order_id,customer_id,product_id,variant_id,product_name,quantity,unit_price,total,options)
    values(v_order,v_uid,r.product_id,r.variant_id,r.product_name,r.quantity,r.unit_price,r.quantity*r.unit_price,'{}'::jsonb)
    returning id into v_order_item;

    insert into public.order_item_options(order_item_id,option_name,option_value,position)
    select v_order_item,option_name,option_value,position from public.cart_item_options where cart_item_id=r.id;

    insert into public.order_files(order_id,order_item_id,customer_id,bucket,storage_path,original_name,mime_type,size_bytes)
    select v_order,v_order_item,v_uid,bucket,storage_path,original_name,mime_type,size_bytes from public.cart_files where cart_item_id=r.id;

    insert into public.order_stock_reservations(order_id,order_item_id,product_id,variant_id,quantity,status)
    values(v_order,v_order_item,r.product_id,r.variant_id,r.quantity,'active');
  end loop;

  update public.carts set status='converted',converted_at=now(),updated_at=now() where id=v_cart;
  return query select v_order,v_code,v_total;
end
$function$;

create or replace function public.cancel_own_order(p_order_id uuid)
returns table(order_id uuid,order_code text,status text)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then raise exception using errcode='42501',message='Authentication required'; end if;
  select * into v_order from public.orders where id=p_order_id and customer_id=v_uid for update;
  if not found then raise exception using errcode='P0002',message='Pedido não encontrado.'; end if;
  if v_order.status not in ('recebido','aguardando_pagamento') then raise exception using errcode='P0001',message='Este pedido não pode mais ser cancelado pelo cliente.'; end if;
  if exists(select 1 from public.payments p where p.order_id=p_order_id and (p.status in ('approved','processing','action_required') or (p.status='created' and p.provider_order_id is not null))) then
    raise exception using errcode='P0001',message='Há um pagamento em andamento ou aprovado. Fale com a Croma para cancelar este pedido.';
  end if;
  update public.orders set status='cancelado',updated_at=now() where id=p_order_id;
  update public.order_stock_reservations set status='released',updated_at=now() where order_id=p_order_id and status='active';
  return query select v_order.id,v_order.order_code,'cancelado'::text;
end
$function$;