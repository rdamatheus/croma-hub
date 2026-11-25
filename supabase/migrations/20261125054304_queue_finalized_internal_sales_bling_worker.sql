-- Origem explícita de vendas internas. Reutiliza a fila ERP e não altera pedidos históricos.
create or replace function public.queue_finalized_internal_sale(p_order_id uuid,p_sale_date date,p_source_ref text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_job public.erp_sync_jobs%rowtype;
  v_amount bigint;
  v_received boolean;
  v_summary jsonb;
  v_id uuid;
begin
  if p_order_id is null or p_sale_date is null or p_sale_date>timezone('America/Sao_Paulo',now())::date
    or length(btrim(coalesce(p_source_ref,''))) not between 10 and 500 then
    raise exception 'Informe pedido, data da venda definitiva e referência autorizada da origem.';
  end if;

  select * into v_order from public.orders o where o.id=p_order_id for update;
  if not found then raise exception 'Pedido local não encontrado.'; end if;
  if v_order.payment_method not in ('pix','dinheiro','credito','debito','crediario') then
    raise exception 'Forma de pagamento fora da regra de venda interna.';
  end if;
  if v_order.total is null or v_order.total<=0 or v_order.total*100>9007199254740991
    or v_order.total*100<>round(v_order.total*100) then
    raise exception 'Total da venda inválido.';
  end if;
  v_amount:=round(v_order.total*100)::bigint;
  v_received:=v_order.payment_method<>'crediario';

  if v_received then
    if v_order.status not in ('pago','em_analise','em_producao','pronto','enviado','concluido') then
      raise exception 'Venda recebida não está em etapa definitiva.';
    end if;
  elsif v_order.status<>'aguardando_pagamento' or v_order.payment_due_date is null
    or v_order.payment_due_date<p_sale_date then
    raise exception 'Crediário exige situação a receber e vencimento válido.';
  end if;

  -- A linha do pedido está bloqueada; uma repetição da mesma origem não cria outra tarefa.
  select * into v_job from public.erp_sync_jobs j
  where j.provider='bling' and j.entity_type='order' and j.operation='create'
    and j.direction='croma_to_bling' and j.request_summary->>'order_id'=p_order_id::text
  order by j.created_at desc,j.id desc limit 1;
  if found then
    if v_job.request_summary->>'source'='internal_sale_finalized'
      and v_job.request_summary->>'payment_method'=v_order.payment_method
      and v_job.request_summary->>'amount_cents'=v_amount::text
      and v_job.request_summary->>'sale_date'=p_sale_date::text
      and (v_job.request_summary->>'due_date') is not distinct from (case when not v_received then v_order.payment_due_date::text else null end)
      and v_job.status in ('queued','running','completed') then
      return v_job.id;
    end if;
    raise exception 'Há uma tarefa anterior ou divergente; confira antes de reenviar.';
  end if;

  if v_order.checkout_reference is not null
    or exists(select 1 from public.erp_entity_mappings m where m.provider='bling' and m.entity_type='order' and m.local_id=p_order_id)
    or exists(select 1 from public.payments p where p.order_id=p_order_id) then
    raise exception 'Pedido já vinculado, em envio ou de checkout; não usar a origem interna.';
  end if;
  if not exists(select 1 from public.order_items i where i.order_id=p_order_id)
    or exists(select 1 from public.order_items i where i.order_id=p_order_id and (i.customer_id is distinct from v_order.customer_id or i.quantity<=0)) then
    raise exception 'Persistir os itens válidos da venda antes de registrar o despacho.';
  end if;

  v_summary:=jsonb_build_object(
    'source','internal_sale_finalized','order_id',p_order_id::text,
    'sale_date',p_sale_date::text,'payment_method',v_order.payment_method,
    'payment_confirmed',v_received,'amount_cents',v_amount,
    'confirmation_ref',btrim(p_source_ref),
    'due_date',case when not v_received then v_order.payment_due_date::text else null end
  );

  insert into public.erp_sync_jobs(provider,entity_type,operation,direction,status,request_summary)
  values('bling','order','create','croma_to_bling','queued',v_summary)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.queue_finalized_internal_sale(uuid,date,text) from public,anon,authenticated;
grant execute on function public.queue_finalized_internal_sale(uuid,date,text) to service_role;

comment on function public.queue_finalized_internal_sale(uuid,date,text) is
'Registrar, na mesma transação do pedido e itens definitivos autorizados, o envio interno idempotente ao Bling. Exclusiva do serviço. Sem reconfirmação manual; não chamar para checkout, importações ou rascunhos.';

-- Só envia HTTP se existir uma tarefa da nova origem. Sem backfill ou reativação de outros crons.
select cron.schedule('croma-internal-order-outbound-worker','*/2 * * * *',$job$
with candidate as (
  select id from public.erp_sync_jobs
  where provider='bling' and entity_type='order' and operation='create'
    and direction='croma_to_bling' and status='queued'
    and request_summary->>'source'='internal_sale_finalized'
  order by created_at,id limit 1
), credential as (
  select decrypted_secret from vault.decrypted_secrets
  where name='erp_bling_cron_secret' and length(decrypted_secret)>0 limit 1
)
select net.http_post(
  url:='https://xtlubocepsbqanrjabog.supabase.co/functions/v1/croma-order-outbound',
  headers:=jsonb_build_object('Content-Type','application/json','x-croma-cron',credential.decrypted_secret),
  body:=jsonb_build_object('action','dispatch_approved_order','job_id',candidate.id::text),
  timeout_milliseconds:=55000
)
from candidate cross join credential;
$job$);
