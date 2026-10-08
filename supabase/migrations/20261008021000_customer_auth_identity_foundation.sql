-- Foundation hardening: separate Auth identity from the commercial customer ID.
-- Canonical link: customer_profiles.auth_user_id -> auth.users.id.
-- customer_profiles.id remains the permanent commercial/customer key used by Bling,
-- carts, orders, payments, proposals and addresses.

create or replace function app_private.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select cp.id
  from public.customer_profiles cp
  where cp.auth_user_id = (select auth.uid())
  limit 1;
$function$;

revoke all on function app_private.current_customer_id() from public;
revoke all on function app_private.current_customer_id() from anon;
grant usage on schema app_private to authenticated, service_role;
grant execute on function app_private.current_customer_id() to authenticated, service_role;

-- Preserve the one already-linked account and safely backfill any legacy customer
-- whose commercial ID is already the Auth UUID.
update public.customer_profiles cp
set auth_user_id = cp.id
where cp.auth_user_id is null
  and exists(select 1 from auth.users u where u.id = cp.id);

create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cpf text;
  v_phone text;
  v_cep text;
  v_uf text;
  v_created_customer uuid;
begin
  if coalesce(new.raw_user_meta_data->>'nome','') = ''
     or coalesce(new.raw_user_meta_data->>'cpf','') = ''
     or coalesce(new.raw_user_meta_data->>'telefone','') = '' then
    return new;
  end if;

  v_cpf := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf',''), '[^0-9]', '', 'g');
  v_phone := regexp_replace(coalesce(new.raw_user_meta_data->>'telefone',''), '[^0-9]', '', 'g');
  v_cep := regexp_replace(coalesce(new.raw_user_meta_data->>'cep',''), '[^0-9]', '', 'g');
  v_uf := upper(coalesce(new.raw_user_meta_data->>'estado',''));

  -- If the CPF already belongs to the commercial customer base, do not duplicate
  -- or auto-claim it during signup. The authenticated claim flow below performs
  -- the safe association after email verification.
  if exists(select 1 from public.customer_profiles cp where cp.cpf = v_cpf) then
    return new;
  end if;

  insert into public.customer_profiles (
    id, auth_user_id, nome, cpf, telefone, email, data_nascimento
  )
  values (
    new.id,
    new.id,
    trim(new.raw_user_meta_data->>'nome'),
    v_cpf,
    v_phone,
    new.email,
    nullif(new.raw_user_meta_data->>'data_nascimento','')::date
  )
  on conflict do nothing
  returning id into v_created_customer;

  if v_created_customer is null then
    return new;
  end if;

  if v_cep <> '' and coalesce(new.raw_user_meta_data->>'logradouro','') <> '' then
    insert into public.customer_addresses (
      customer_id, apelido, cep, logradouro, numero, complemento,
      bairro, cidade, estado, principal
    ) values (
      v_created_customer,
      'Principal',
      v_cep,
      trim(new.raw_user_meta_data->>'logradouro'),
      trim(new.raw_user_meta_data->>'numero'),
      nullif(trim(coalesce(new.raw_user_meta_data->>'complemento','')), ''),
      trim(new.raw_user_meta_data->>'bairro'),
      trim(new.raw_user_meta_data->>'cidade'),
      v_uf,
      true
    );
  end if;

  return new;
end;
$function$;

revoke execute on function public.handle_new_customer() from public;
revoke execute on function public.handle_new_customer() from anon;
revoke execute on function public.handle_new_customer() from authenticated;

create or replace function app_private.claim_customer_profile_impl()
returns table(customer_id uuid, status text, message text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_user auth.users%rowtype;
  v_customer public.customer_profiles%rowtype;
  v_cpf text;
  v_phone text;
  v_cep text;
  v_uf text;
  v_email text;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;

  select * into v_user
  from auth.users
  where id = v_uid;

  if not found then
    raise exception using errcode='42501', message='Sessão inválida.';
  end if;

  select * into v_customer
  from public.customer_profiles cp
  where cp.auth_user_id = v_uid
  limit 1;

  if found then
    return query select v_customer.id, 'linked'::text, null::text;
    return;
  end if;

  v_cpf := regexp_replace(coalesce(v_user.raw_user_meta_data->>'cpf',''), '[^0-9]', '', 'g');
  v_phone := regexp_replace(coalesce(v_user.raw_user_meta_data->>'telefone',''), '[^0-9]', '', 'g');
  v_cep := regexp_replace(coalesce(v_user.raw_user_meta_data->>'cep',''), '[^0-9]', '', 'g');
  v_uf := upper(coalesce(v_user.raw_user_meta_data->>'estado',''));
  v_email := lower(btrim(coalesce(v_user.email,'')));

  if length(v_cpf) <> 11 then
    return query select null::uuid, 'missing_identity'::text,
      'Não foi possível identificar o CPF usado no cadastro.'::text;
    return;
  end if;

  select * into v_customer
  from public.customer_profiles cp
  where cp.cpf = v_cpf
  for update;

  if not found then
    insert into public.customer_profiles(
      id, auth_user_id, nome, cpf, telefone, email, data_nascimento
    )
    values(
      v_uid,
      v_uid,
      coalesce(nullif(trim(v_user.raw_user_meta_data->>'nome'),''), split_part(v_email,'@',1)),
      v_cpf,
      nullif(v_phone,''),
      nullif(v_email,''),
      nullif(v_user.raw_user_meta_data->>'data_nascimento','')::date
    )
    returning * into v_customer;

    if v_cep <> '' and coalesce(v_user.raw_user_meta_data->>'logradouro','') <> '' then
      insert into public.customer_addresses(
        customer_id, apelido, cep, logradouro, numero, complemento,
        bairro, cidade, estado, principal
      ) values(
        v_customer.id,
        'Principal',
        v_cep,
        trim(v_user.raw_user_meta_data->>'logradouro'),
        trim(v_user.raw_user_meta_data->>'numero'),
        nullif(trim(coalesce(v_user.raw_user_meta_data->>'complemento','')), ''),
        trim(v_user.raw_user_meta_data->>'bairro'),
        trim(v_user.raw_user_meta_data->>'cidade'),
        v_uf,
        true
      );
    end if;

    return query select v_customer.id, 'created'::text, null::text;
    return;
  end if;

  if v_customer.auth_user_id is not null and v_customer.auth_user_id <> v_uid then
    return query select null::uuid, 'already_linked'::text,
      'Este CPF já está vinculado a outra conta. Fale com a Croma para revisar o cadastro.'::text;
    return;
  end if;

  if lower(btrim(coalesce(v_customer.email,''))) = ''
     or lower(btrim(coalesce(v_customer.email,''))) <> v_email then
    return query select null::uuid, 'manual_review'::text,
      'Seu CPF já existe na Croma, mas o e-mail do cadastro comercial é diferente. Fale com a Croma para validar o vínculo.'::text;
    return;
  end if;

  -- Require evidence that an email-confirmation message was actually sent and
  -- confirmed. This intentionally refuses silent auto-linking on projects where
  -- email confirmation is disabled.
  if v_user.confirmation_sent_at is null
     or v_user.email_confirmed_at is null
     or v_user.email_confirmed_at < v_user.confirmation_sent_at then
    return query select null::uuid, 'email_confirmation_required'::text,
      'Confirme seu e-mail antes de vincular este cadastro existente.'::text;
    return;
  end if;

  update public.customer_profiles
  set auth_user_id = v_uid,
      updated_at = now()
  where id = v_customer.id
  returning * into v_customer;

  if not exists(
    select 1 from public.customer_addresses ca where ca.customer_id = v_customer.id
  ) and v_cep <> '' and coalesce(v_user.raw_user_meta_data->>'logradouro','') <> '' then
    insert into public.customer_addresses(
      customer_id, apelido, cep, logradouro, numero, complemento,
      bairro, cidade, estado, principal
    ) values(
      v_customer.id,
      'Principal',
      v_cep,
      trim(v_user.raw_user_meta_data->>'logradouro'),
      trim(v_user.raw_user_meta_data->>'numero'),
      nullif(trim(coalesce(v_user.raw_user_meta_data->>'complemento','')), ''),
      trim(v_user.raw_user_meta_data->>'bairro'),
      trim(v_user.raw_user_meta_data->>'cidade'),
      v_uf,
      true
    );
  end if;

  return query select v_customer.id, 'linked_existing'::text, null::text;
end;
$function$;

revoke all on function app_private.claim_customer_profile_impl() from public;
revoke all on function app_private.claim_customer_profile_impl() from anon;
grant execute on function app_private.claim_customer_profile_impl() to authenticated;

create or replace function public.claim_customer_profile()
returns table(customer_id uuid, status text, message text)
language sql
security invoker
set search_path = ''
as $function$
  select * from app_private.claim_customer_profile_impl();
$function$;

revoke all on function public.claim_customer_profile() from public;
revoke all on function public.claim_customer_profile() from anon;
grant execute on function public.claim_customer_profile() to authenticated;

-- Customer-owned RLS now resolves the authenticated account to the permanent
-- commercial customer ID instead of assuming both UUIDs are identical.
drop policy if exists carts_own_all on public.carts;
create policy carts_own_all on public.carts
  for all to authenticated
  using (customer_id = (select app_private.current_customer_id()))
  with check (customer_id = (select app_private.current_customer_id()));

drop policy if exists cart_items_own_all on public.cart_items;
create policy cart_items_own_all on public.cart_items
  for all to authenticated
  using (customer_id = (select app_private.current_customer_id()))
  with check (
    customer_id = (select app_private.current_customer_id())
    and exists(
      select 1 from public.carts c
      where c.id = cart_items.cart_id
        and c.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists cart_options_own_all on public.cart_item_options;
create policy cart_options_own_all on public.cart_item_options
  for all to authenticated
  using (
    exists(
      select 1 from public.cart_items i
      where i.id = cart_item_options.cart_item_id
        and i.customer_id = (select app_private.current_customer_id())
    )
  )
  with check (
    exists(
      select 1 from public.cart_items i
      where i.id = cart_item_options.cart_item_id
        and i.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists cart_files_own_all on public.cart_files;
create policy cart_files_own_all on public.cart_files
  for all to authenticated
  using (customer_id = (select app_private.current_customer_id()))
  with check (
    customer_id = (select app_private.current_customer_id())
    and exists(
      select 1 from public.carts c
      where c.id = cart_files.cart_id
        and c.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert to authenticated
  with check (
    customer_id = (select app_private.current_customer_id())
    and status = any(array['recebido'::text,'aguardando_pagamento'::text])
  );

drop policy if exists orders_select_own on public.orders;
create policy orders_select_own on public.orders
  for select to authenticated
  using (customer_id = (select app_private.current_customer_id()));

drop policy if exists order_items_insert_own on public.order_items;
create policy order_items_insert_own on public.order_items
  for insert to authenticated
  with check (
    customer_id = (select app_private.current_customer_id())
    and exists(
      select 1 from public.orders o
      where o.id = order_items.order_id
        and o.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists order_items_select_own on public.order_items;
create policy order_items_select_own on public.order_items
  for select to authenticated
  using (customer_id = (select app_private.current_customer_id()));

drop policy if exists order_item_options_own_insert on public.order_item_options;
create policy order_item_options_own_insert on public.order_item_options
  for insert to authenticated
  with check (
    exists(
      select 1 from public.order_items i
      where i.id = order_item_options.order_item_id
        and i.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists order_item_options_own_select on public.order_item_options;
create policy order_item_options_own_select on public.order_item_options
  for select to authenticated
  using (
    exists(
      select 1 from public.order_items i
      where i.id = order_item_options.order_item_id
        and i.customer_id = (select app_private.current_customer_id())
    )
  );

drop policy if exists order_files_insert_own on public.order_files;
create policy order_files_insert_own on public.order_files
  for insert to authenticated
  with check (customer_id = (select app_private.current_customer_id()));

drop policy if exists order_files_select_own on public.order_files;
create policy order_files_select_own on public.order_files
  for select to authenticated
  using (customer_id = (select app_private.current_customer_id()));

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own on public.payments
  for select to authenticated
  using (customer_id = (select app_private.current_customer_id()));

drop policy if exists payment_events_select_own on public.payment_events;
create policy payment_events_select_own on public.payment_events
  for select to authenticated
  using (customer_id = (select app_private.current_customer_id()));

create or replace function public.sync_active_cart(
  p_client_reference text,
  p_items jsonb,
  p_files jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid := app_private.current_customer_id();
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
  if v_customer_id is null then raise exception 'Customer profile not linked'; end if;

  select id into v_cart
  from public.carts
  where customer_id = v_customer_id and status='active'
  limit 1;

  if v_cart is null then
    insert into public.carts(customer_id,client_reference)
    values(v_customer_id,p_client_reference)
    returning id into v_cart;
  end if;

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

    insert into public.cart_items(
      cart_id,customer_id,client_item_id,product_id,variant_id,product_name,quantity,unit_price
    )
    values(
      v_cart,v_customer_id,v_item->>'id',v_product_id,null,v_product_name,v_qty,v_product_price
    )
    returning id into v_item_id;

    for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
      insert into public.cart_item_options(cart_item_id,option_name,option_value,position)
      values(v_item_id,v_opt->>'name',v_opt->>'value',coalesce((v_opt->>'position')::int,0));
    end loop;
  end loop;

  for v_file in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
    select id into v_item_id
    from public.cart_items
    where cart_id=v_cart and client_item_id=v_file->>'cartItemId';

    insert into public.cart_files(
      cart_id,cart_item_id,customer_id,client_file_id,bucket,storage_path,original_name,mime_type,size_bytes
    )
    values(
      v_cart,v_item_id,v_customer_id,v_file->>'id',
      coalesce(nullif(v_file->>'bucket',''),'croma-arquivos'),
      v_file->>'path',v_file->>'name',v_file->>'type',
      coalesce((v_file->>'size')::bigint,0)
    )
    on conflict(storage_path) do update
      set cart_id=excluded.cart_id,
          cart_item_id=excluded.cart_item_id,
          client_file_id=excluded.client_file_id,
          customer_id=excluded.customer_id;
  end loop;

  delete from public.cart_files cf
  where cf.cart_id=v_cart
    and not exists(
      select 1
      from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) x
      where x->>'path'=cf.storage_path
    );

  update public.carts set updated_at=now() where id=v_cart;
  return v_cart;
end;
$function$;

create or replace function public.get_active_cart()
returns table(
  cart_id uuid,
  client_reference text,
  item_id text,
  product_id uuid,
  variant_id uuid,
  product_name text,
  quantity integer,
  unit_price numeric,
  option_name text,
  option_value text,
  option_position integer,
  file_id text,
  file_name text,
  file_type text,
  file_size bigint,
  file_path text,
  file_bucket text
)
language sql
security invoker
set search_path = ''
as $function$
  select
    c.id,c.client_reference,i.client_item_id,i.product_id,i.variant_id,
    i.product_name,i.quantity,i.unit_price,o.option_name,o.option_value,o.position,
    f.client_file_id,f.original_name,f.mime_type,f.size_bytes,f.storage_path,f.bucket
  from public.carts c
  left join public.cart_items i on i.cart_id=c.id
  left join public.cart_item_options o on o.cart_item_id=i.id
  left join public.cart_files f on f.cart_item_id=i.id
  where c.customer_id=(select app_private.current_customer_id())
    and c.status='active'
  order by i.created_at,o.position;
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
security invoker
set search_path = ''
as $function$
declare
  v_uid uuid:=auth.uid();
  v_customer_id uuid:=app_private.current_customer_id();
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
  if v_customer_id is null then raise exception 'Customer profile not linked'; end if;

  select o.id,o.order_code,o.total into v_order,v_code,v_total
  from public.orders o
  where o.customer_id=v_customer_id
    and o.checkout_reference=p_checkout_reference;

  if v_order is not null then
    return query select v_order,v_code,v_total;
    return;
  end if;

  select id into v_cart
  from public.carts
  where customer_id=v_customer_id and status='active'
  for update;

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
      raise exception 'Estoque insuficiente para %. Disponível para novos pedidos: %.',
        r.product_name,greatest(v_available-v_reserved,0);
    end if;
  end loop;

  select coalesce(sum(quantity*unit_price),0) into v_sub
  from public.cart_items
  where cart_id=v_cart;

  if v_sub<=0 then raise exception 'Cart is empty'; end if;

  v_total:=v_sub+greatest(coalesce(p_delivery_fee,0),0);
  v_code:='CRO-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
  v_status:=case when p_payment_method='credito' then 'aguardando_pagamento' else 'recebido' end;

  insert into public.orders(
    order_code,customer_id,status,fulfillment,payment_method,subtotal,delivery_fee,total,
    notes,checkout_reference,delivery_street,delivery_number,delivery_complement,
    delivery_neighborhood,delivery_city,delivery_state,delivery_zip,delivery_address
  )
  values(
    v_code,v_customer_id,v_status,p_fulfillment,p_payment_method,v_sub,
    greatest(coalesce(p_delivery_fee,0),0),v_total,p_notes,p_checkout_reference,
    p_delivery_street,p_delivery_number,p_delivery_complement,p_delivery_neighborhood,
    p_delivery_city,p_delivery_state,p_delivery_zip,
    case when p_fulfillment='entrega'
      then jsonb_strip_nulls(jsonb_build_object(
        'street',p_delivery_street,'number',p_delivery_number,'complement',p_delivery_complement,
        'neighborhood',p_delivery_neighborhood,'city',p_delivery_city,'state',p_delivery_state,'zip',p_delivery_zip
      ))
      else null
    end
  )
  returning id into v_order;

  for r in
    select * from public.cart_items where cart_id=v_cart order by created_at
  loop
    insert into public.order_items(
      order_id,customer_id,product_id,variant_id,product_name,quantity,unit_price,total,options
    )
    values(
      v_order,v_customer_id,r.product_id,r.variant_id,r.product_name,
      r.quantity,r.unit_price,r.quantity*r.unit_price,'{}'::jsonb
    )
    returning id into v_order_item;

    insert into public.order_item_options(order_item_id,option_name,option_value,position)
    select v_order_item,option_name,option_value,position
    from public.cart_item_options
    where cart_item_id=r.id;

    insert into public.order_files(
      order_id,order_item_id,customer_id,bucket,storage_path,original_name,mime_type,size_bytes
    )
    select
      v_order,v_order_item,v_customer_id,bucket,storage_path,original_name,mime_type,size_bytes
    from public.cart_files
    where cart_item_id=r.id;

    insert into public.order_stock_reservations(
      order_id,order_item_id,product_id,variant_id,quantity,status
    )
    values(v_order,v_order_item,r.product_id,r.variant_id,r.quantity,'active');
  end loop;

  update public.carts
  set status='converted',converted_at=now(),updated_at=now()
  where id=v_cart;

  return query select v_order,v_code,v_total;
end;
$function$;

create or replace function app_private.cancel_own_order_impl(p_order_id uuid)
returns table(order_id uuid, order_code text, status text)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_customer_id uuid := app_private.current_customer_id();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception using errcode='42501', message='Authentication required';
  end if;
  if v_customer_id is null then
    raise exception using errcode='42501', message='Customer profile not linked';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and customer_id = v_customer_id
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
    raise exception using errcode='P0001',
      message='Há um pagamento em andamento ou aprovado. Fale com a Croma para cancelar este pedido.';
  end if;

  update public.orders
  set status='cancelado',updated_at=now()
  where id=p_order_id;

  update public.order_stock_reservations
  set status='released',updated_at=now()
  where order_id=p_order_id and status='active';

  return query select v_order.id,v_order.order_code,'cancelado'::text;
end;
$function$;

revoke all on function app_private.cancel_own_order_impl(uuid) from public;
revoke all on function app_private.cancel_own_order_impl(uuid) from anon;
grant execute on function app_private.cancel_own_order_impl(uuid) to authenticated;
