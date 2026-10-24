CREATE OR REPLACE FUNCTION public.checkout_active_cart(p_checkout_reference text, p_fulfillment text, p_payment_method text, p_delivery_fee numeric DEFAULT 0, p_notes text DEFAULT NULL::text, p_delivery_street text DEFAULT NULL::text, p_delivery_number text DEFAULT NULL::text, p_delivery_complement text DEFAULT NULL::text, p_delivery_neighborhood text DEFAULT NULL::text, p_delivery_city text DEFAULT NULL::text, p_delivery_state text DEFAULT NULL::text, p_delivery_zip text DEFAULT NULL::text)
 RETURNS TABLE(order_id uuid, order_code text, total numeric)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_status:='aguardando_pagamento';

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
$function$
