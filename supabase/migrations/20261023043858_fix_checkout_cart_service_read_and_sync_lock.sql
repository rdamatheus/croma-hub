-- Corrige leitura do checkout interno sem ampliar acessos de clientes.
GRANT SELECT ON TABLE public.carts, public.cart_items TO service_role;

CREATE OR REPLACE FUNCTION public.sync_active_cart(p_client_reference text, p_items jsonb, p_files jsonb DEFAULT '[]'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- Serializa sincronizacoes do mesmo cliente, inclusive a criacao do primeiro carrinho.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sync_active_cart:' || v_customer_id::text, 0));

  select id into v_cart
  from public.carts
  where customer_id = v_customer_id and status='active'
  limit 1
  for update;

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
$function$
