-- Preserva etapa de produção ao confirmar Pix externo. Reutiliza autorização e auditoria existentes.
CREATE OR REPLACE FUNCTION app_private.manage_order_impl(p_order_id uuid, p_action text, p_note text, p_financial_review boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if exists(select 1 from public.order_activity_events e where e.order_id=p_order_id and e.action='manual_payment_confirmed') then raise exception 'O recebimento deste pedido já foi confirmado.'; end if;
  if v_order.payment_method='pix' then
   if not coalesce(p_financial_review,false) then raise exception 'Confirme que o Pix integral foi conferido.'; end if;
   if exists(select 1 from public.payments p where p.order_id=p_order_id) then raise exception 'Pedido com pagamento online: concilie pelo fluxo original.'; end if;
   if v_order.status in ('recebido','aguardando_pagamento') then v_next:='pago';
   elsif v_order.status in ('pago','em_analise','em_producao','pronto','enviado','concluido') then v_next:=v_order.status;
   else raise exception 'Situação incompatível com confirmação de Pix.'; end if;
  else
   if v_order.status not in ('recebido','aguardando_pagamento') then raise exception 'Este pedido não está aguardando pagamento.'; end if;
   if exists(select 1 from public.payments p where p.order_id=p_order_id and p.status='approved') then raise exception 'Já há pagamento online aprovado; concilie o registro existente.'; end if;
   v_next:='pago';
  end if;
 else
  if v_order.status not in ('recebido','aguardando_pagamento','pago','em_analise') then raise exception 'A etapa atual exige análise operacional antes do cancelamento.'; end if;
  if exists(select 1 from public.erp_entity_mappings m where m.local_id=p_order_id and m.provider='bling' and m.entity_type='order') then raise exception 'Pedido vinculado ao Bling: concilie o cancelamento nos dois sistemas antes de prosseguir.'; end if;
  if v_order.checkout_reference like 'bling-pendente:%' or v_order.checkout_reference like 'bling:%' then raise exception 'Envio ao Bling em andamento ou já registrado; concilie antes do cancelamento.'; end if;
  if (v_order.status='pago' or exists(select 1 from public.order_activity_events e where e.order_id=p_order_id and e.action='manual_payment_confirmed') or exists(select 1 from public.payments p where p.order_id=p_order_id and p.status='approved')) and not coalesce(p_financial_review,false) then raise exception 'Confirme o tratamento financeiro do pedido pago. Esta ação não executa estorno.'; end if;
  v_next:='cancelado';
 end if;
 update public.orders o set status=v_next,updated_at=now() where o.id=p_order_id;
 if v_next='cancelado' then
  update public.order_stock_reservations r set status='released',updated_at=now() where r.order_id=p_order_id and r.status='active';
 end if;
 insert into public.order_activity_events(order_id,actor_id,action,from_status,to_status,note,amount,payment_method,financial_review)
 values(p_order_id,v_uid,case when p_action='confirm_manual_payment' then 'manual_payment_confirmed' else 'internally_canceled' end,v_order.status,v_next,trim(p_note),v_order.total,v_order.payment_method,coalesce(p_financial_review,false));
 return jsonb_build_object('order_id',p_order_id,'status',v_next);
end $function$;
