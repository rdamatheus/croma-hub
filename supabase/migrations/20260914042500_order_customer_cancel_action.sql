create or replace function public.cancel_own_order(p_order_id uuid)
returns table(order_id uuid, order_code text, status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
begin
  if v_uid is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
    and customer_id = v_uid
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Pedido não encontrado.';
  end if;

  if v_order.status not in ('recebido', 'aguardando_pagamento') then
    raise exception using errcode = 'P0001', message = 'Este pedido não pode mais ser cancelado pelo cliente.';
  end if;

  if exists (
    select 1
    from public.payments p
    where p.order_id = p_order_id
      and (
        p.status in ('approved', 'processing', 'action_required')
        or (p.status = 'created' and p.provider_order_id is not null)
      )
  ) then
    raise exception using errcode = 'P0001', message = 'Há um pagamento em andamento ou aprovado. Fale com a Croma para cancelar este pedido.';
  end if;

  update public.orders
  set status = 'cancelado', updated_at = now()
  where id = p_order_id;

  return query
  select v_order.id, v_order.order_code, 'cancelado'::text;
end;
$$;

revoke all on function public.cancel_own_order(uuid) from public;
grant execute on function public.cancel_own_order(uuid) to authenticated;

comment on function public.cancel_own_order(uuid) is 'Permite ao cliente cancelar apenas o proprio pedido em estado inicial e sem pagamento ativo/aprovado.';
