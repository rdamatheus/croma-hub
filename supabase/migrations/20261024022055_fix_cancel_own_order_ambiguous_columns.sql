-- Qualifica colunas para evitar conflito com os parametros de retorno.
-- Validado com cancelamento autenticado e liberacao de reserva em transacao revertida.
CREATE OR REPLACE FUNCTION app_private.cancel_own_order_impl(p_order_id uuid)
 RETURNS TABLE(order_id uuid, order_code text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  from public.orders o
  where o.id = p_order_id
    and o.customer_id = v_customer_id
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

  update public.orders o
  set status='cancelado',updated_at=now()
  where o.id=p_order_id;

  update public.order_stock_reservations r
  set status='released',updated_at=now()
  where r.order_id=p_order_id and r.status='active';

  return query select v_order.id,v_order.order_code,'cancelado'::text;
end;
$function$
