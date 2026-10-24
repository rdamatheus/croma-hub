create table public.order_activity_events (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 actor_id uuid not null references auth.users(id),
 action text not null check (action in ('manual_payment_confirmed','internally_canceled')),
 from_status text not null, to_status text not null,
 note text not null check(length(trim(note)) between 5 and 1000),
 amount numeric not null, payment_method text,
 financial_review boolean not null default false,
 created_at timestamptz not null default now()
);
create index on public.order_activity_events(order_id,created_at);
alter table public.order_activity_events enable row level security;
revoke all on public.order_activity_events from anon,authenticated;
grant select on public.order_activity_events to authenticated;
create policy staff_read_order_activity on public.order_activity_events for select to authenticated using ((select app_private.is_staff()));

create function app_private.manage_order_impl(p_order_id uuid,p_action text,p_note text,p_financial_review boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_order public.orders%rowtype; v_next text;
begin
 if v_uid is null or not exists(select 1 from public.profiles p where p.id=v_uid and p.ativo and p.role in ('owner','manager')) then
  raise exception using errcode='42501',message='Ação restrita à gestão.';
 end if;
 if length(trim(coalesce(p_note,''))) not between 5 and 1000 then raise exception 'Informe um motivo ou referência de 5 a 1000 caracteres.'; end if;
 if p_action not in ('confirm_manual_payment','cancel') or p_action is null then raise exception 'Ação inválida.'; end if;
 select * into v_order from public.orders o where o.id=p_order_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 if exists(select 1 from public.payments p where p.order_id=p_order_id and (p.status in ('processing','action_required') or (p.status='created' and p.provider_order_id is not null))) then
  raise exception 'Há pagamento online em andamento. Concilie o pagamento antes de alterar o pedido.';
 end if;
 if p_action='confirm_manual_payment' then
  if v_order.status not in ('recebido','aguardando_pagamento') then raise exception 'Este pedido não está aguardando pagamento.'; end if;
  if exists(select 1 from public.payments p where p.order_id=p_order_id and p.status='approved') then raise exception 'Já há pagamento online aprovado; concilie o registro existente.'; end if;
  v_next:='pago';
 else
  if v_order.status not in ('recebido','aguardando_pagamento','pago','em_analise') then raise exception 'A etapa atual exige análise operacional antes do cancelamento.'; end if;
  if exists(select 1 from public.erp_entity_mappings m where m.local_id=p_order_id and m.provider='bling' and m.entity_type='order') then raise exception 'Pedido vinculado ao Bling: concilie o cancelamento nos dois sistemas antes de prosseguir.'; end if;
  if (v_order.status='pago' or exists(select 1 from public.payments p where p.order_id=p_order_id and p.status='approved')) and not coalesce(p_financial_review,false) then raise exception 'Confirme o tratamento financeiro do pedido pago. Esta ação não executa estorno.'; end if;
  v_next:='cancelado';
 end if;
 update public.orders o set status=v_next,updated_at=now() where o.id=p_order_id;
 if v_next='cancelado' then
  update public.order_stock_reservations r set status='released',updated_at=now() where r.order_id=p_order_id and r.status='active';
 end if;
 insert into public.order_activity_events(order_id,actor_id,action,from_status,to_status,note,amount,payment_method,financial_review)
 values(p_order_id,v_uid,case when v_next='pago' then 'manual_payment_confirmed' else 'internally_canceled' end,v_order.status,v_next,trim(p_note),v_order.total,v_order.payment_method,coalesce(p_financial_review,false));
 return jsonb_build_object('order_id',p_order_id,'status',v_next);
end $$;
revoke all on function app_private.manage_order_impl(uuid,text,text,boolean) from public,anon;
grant execute on function app_private.manage_order_impl(uuid,text,text,boolean) to authenticated;
create function public.manage_internal_order(p_order_id uuid,p_action text,p_note text,p_financial_review boolean default false)
returns jsonb language sql set search_path='' as $$select app_private.manage_order_impl(p_order_id,p_action,p_note,p_financial_review)$$;
revoke all on function public.manage_internal_order(uuid,text,text,boolean) from public,anon;
grant execute on function public.manage_internal_order(uuid,text,text,boolean) to authenticated;

create function app_private.internal_order_detail_impl(p_order_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_order public.orders%rowtype; v_result jsonb;
begin
 if auth.uid() is null or not app_private.is_staff() then raise exception using errcode='42501',message='Acesso restrito à equipe.'; end if;
 select * into v_order from public.orders o where o.id=p_order_id;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 select jsonb_build_object(
 'order',to_jsonb(v_order),
 'customer',(select jsonb_build_object('nome',c.nome,'email',c.email,'telefone',c.telefone) from public.customer_profiles c where c.id=v_order.customer_id),
 'items',coalesce((select jsonb_agg(jsonb_build_object('name',i.product_name,'quantity',i.quantity,'unit_price',i.unit_price,'total',i.total,'options',coalesce((select jsonb_agg(jsonb_build_object('name',x.option_name,'value',x.option_value)) from public.order_item_options x where x.order_item_id=i.id),'[]'::jsonb))) from public.order_items i where i.order_id=p_order_id),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('status',p.status,'amount',p.amount,'environment',p.environment,'provider',p.provider,'created_at',p.created_at)) from public.payments p where p.order_id=p_order_id),'[]'::jsonb),
 'reservations',coalesce((select jsonb_agg(jsonb_build_object('status',r.status,'quantity',r.quantity)) from public.order_stock_reservations r where r.order_id=p_order_id),'[]'::jsonb),
 'history',coalesce((select jsonb_agg(jsonb_build_object('action',e.action,'actor',coalesce(p.nome,e.actor_id::text),'created_at',e.created_at,'note',e.note,'amount',e.amount,'from_status',e.from_status,'to_status',e.to_status,'financial_review',e.financial_review) order by e.created_at desc) from public.order_activity_events e left join public.profiles p on p.id=e.actor_id where e.order_id=p_order_id),'[]'::jsonb),
 'bling',coalesce((select jsonb_agg(jsonb_build_object('external_id',m.external_id,'sync_status',m.sync_status)) from public.erp_entity_mappings m where m.local_id=p_order_id and m.entity_type='order' and m.provider='bling'),'[]'::jsonb)
 ) into v_result;
 return v_result;
end $$;
revoke all on function app_private.internal_order_detail_impl(uuid) from public,anon;
grant execute on function app_private.internal_order_detail_impl(uuid) to authenticated;
create function public.internal_order_detail(p_order_id uuid) returns jsonb language sql stable set search_path='' as $$select app_private.internal_order_detail_impl(p_order_id)$$;
revoke all on function public.internal_order_detail(uuid) from public,anon;
grant execute on function public.internal_order_detail(uuid) to authenticated;
