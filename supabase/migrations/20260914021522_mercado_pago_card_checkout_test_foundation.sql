create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  provider text not null default 'mercado_pago',
  environment text not null default 'test',
  provider_order_id text,
  provider_payment_id text,
  method text not null default 'credit_card',
  status text not null default 'created',
  provider_status text,
  provider_status_detail text,
  amount numeric(14,2) not null check (amount >= 0),
  installments integer,
  card_brand text,
  card_last_four text,
  idempotency_key text not null unique,
  provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_provider_check check (provider = 'mercado_pago'),
  constraint payments_environment_check check (environment in ('test','production')),
  constraint payments_method_check check (method = 'credit_card'),
  constraint payments_installments_check check (installments is null or installments > 0)
);

create unique index if not exists payments_provider_order_uidx on public.payments(provider, provider_order_id) where provider_order_id is not null;
create unique index if not exists payments_provider_payment_uidx on public.payments(provider, provider_payment_id) where provider_payment_id is not null;
create index if not exists payments_order_idx on public.payments(order_id, created_at desc);
create index if not exists payments_customer_idx on public.payments(customer_id, created_at desc);
create index if not exists payments_status_idx on public.payments(status, created_at desc);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  provider text not null default 'mercado_pago',
  provider_event_id text,
  event_type text not null,
  provider_status text,
  provider_status_detail text,
  provider_request_id text,
  payload_summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint payment_events_provider_check check (provider = 'mercado_pago')
);

create index if not exists payment_events_payment_idx on public.payment_events(payment_id, created_at desc);
create index if not exists payment_events_order_idx on public.payment_events(order_id, created_at desc);
create index if not exists payment_events_customer_idx on public.payment_events(customer_id, created_at desc);
create index if not exists payment_events_provider_event_idx on public.payment_events(provider_event_id) where provider_event_id is not null;

alter table public.payments enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments for select to authenticated using (customer_id = (select auth.uid()));

drop policy if exists payments_staff_all on public.payments;
create policy payments_staff_all on public.payments for all to authenticated using ((select app_private.is_staff())) with check ((select app_private.is_staff()));

drop policy if exists payment_events_select_own on public.payment_events;
create policy payment_events_select_own on public.payment_events for select to authenticated using (customer_id = (select auth.uid()));

drop policy if exists payment_events_staff_all on public.payment_events;
create policy payment_events_staff_all on public.payment_events for all to authenticated using ((select app_private.is_staff())) with check ((select app_private.is_staff()));

grant select on public.payments, public.payment_events to authenticated;

create or replace function public.set_payment_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists payments_updated_at on public.payments;
create trigger payments_updated_at before update on public.payments for each row execute function public.set_payment_updated_at();

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
for insert to authenticated
with check (
  customer_id = (select auth.uid())
  and status in ('recebido','aguardando_pagamento')
);

grant insert on table public.order_item_options to authenticated;

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
returns table(order_id uuid, order_code text, total numeric)
language plpgsql
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_cart uuid;
  v_order uuid;
  v_code text;
  v_sub numeric;
  v_total numeric;
  v_status text;
  r record;
  v_order_item uuid;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;

  select o.id,o.order_code,o.total
    into v_order,v_code,v_total
  from public.orders o
  where o.customer_id=v_uid and o.checkout_reference=p_checkout_reference;

  if v_order is not null then
    return query select v_order,v_code,v_total;
    return;
  end if;

  select id into v_cart
  from public.carts
  where customer_id=v_uid and status='active'
  for update;

  if v_cart is null then raise exception 'Active cart not found'; end if;

  select coalesce(sum(quantity*unit_price),0)
    into v_sub
  from public.cart_items
  where cart_id=v_cart;

  if v_sub<=0 then raise exception 'Cart is empty'; end if;

  v_total := v_sub + greatest(coalesce(p_delivery_fee,0),0);
  v_code := 'CRO-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_status := case when p_payment_method='credito' then 'aguardando_pagamento' else 'recebido' end;

  insert into public.orders(
    order_code,customer_id,status,fulfillment,payment_method,subtotal,delivery_fee,total,notes,checkout_reference,
    delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_city,delivery_state,delivery_zip,delivery_address
  ) values (
    v_code,v_uid,v_status,p_fulfillment,p_payment_method,v_sub,greatest(coalesce(p_delivery_fee,0),0),v_total,p_notes,p_checkout_reference,
    p_delivery_street,p_delivery_number,p_delivery_complement,p_delivery_neighborhood,p_delivery_city,p_delivery_state,p_delivery_zip,
    case when p_fulfillment='entrega' then jsonb_strip_nulls(jsonb_build_object(
      'street',p_delivery_street,'number',p_delivery_number,'complement',p_delivery_complement,
      'neighborhood',p_delivery_neighborhood,'city',p_delivery_city,'state',p_delivery_state,'zip',p_delivery_zip
    )) else null end
  ) returning id into v_order;

  for r in select * from public.cart_items where cart_id=v_cart order by created_at loop
    insert into public.order_items(order_id,customer_id,product_name,quantity,unit_price,total,options)
    values(v_order,v_uid,r.product_name,r.quantity,r.unit_price,r.quantity*r.unit_price,'{}'::jsonb)
    returning id into v_order_item;

    insert into public.order_item_options(order_item_id,option_name,option_value,position)
    select v_order_item,option_name,option_value,position
    from public.cart_item_options where cart_item_id=r.id;

    insert into public.order_files(order_id,order_item_id,customer_id,bucket,storage_path,original_name,mime_type,size_bytes)
    select v_order,v_order_item,v_uid,bucket,storage_path,original_name,mime_type,size_bytes
    from public.cart_files where cart_item_id=r.id;
  end loop;

  update public.carts
  set status='converted',converted_at=now(),updated_at=now()
  where id=v_cart;

  return query select v_order,v_code,v_total;
end
$$;
