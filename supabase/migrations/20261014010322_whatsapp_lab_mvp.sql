-- Extend the existing isolated lab without changing commercial contacts or orders.
alter table public.lab_whatsapp_atendimentos
  add column category text check (category in ('orcamento','arte_arquivo','prazo_producao','aprovacao_pagamento','retirada_entrega','problema_reclamacao')),
  add column priority text not null default 'normal' check (priority in ('normal','alta','urgente')),
  add column workflow_status text not null default 'novo' check (workflow_status in ('novo','em_analise','aguardando_cliente','aguardando_producao','orcamento_enviado','aprovado','finalizado','cancelado')),
  add column responsible_id uuid references public.profiles(id) on delete set null,
  add column input_key uuid;

create unique index lab_whatsapp_atendimentos_input_key_idx
  on public.lab_whatsapp_atendimentos(created_by,input_key) where input_key is not null;
create index lab_whatsapp_atendimentos_responsible_idx
  on public.lab_whatsapp_atendimentos(responsible_id) where responsible_id is not null;

create table public.lab_whatsapp_analises (
  id uuid primary key default gen_random_uuid(),
  atendimento_id uuid not null references public.lab_whatsapp_atendimentos(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  request_id uuid not null unique,
  status text not null default 'processando' check (status in ('processando','concluida','erro')),
  previous_status text not null,
  context_message_ids uuid[] not null default '{}',
  result jsonb check (result is null or jsonb_typeof(result) = 'object'),
  error text,
  model text not null,
  prompt_version text not null,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((status='processando' and finished_at is null and result is null and error is null)
    or (status='concluida' and finished_at is not null and result is not null and error is null)
    or (status='erro' and finished_at is not null and result is null and error is not null))
);
create index lab_whatsapp_analises_atendimento_created_idx on public.lab_whatsapp_analises(atendimento_id,created_at desc);
create index lab_whatsapp_analises_requested_by_idx on public.lab_whatsapp_analises(requested_by);
create unique index lab_whatsapp_analises_processing_idx on public.lab_whatsapp_analises(atendimento_id) where status='processando';

alter table public.lab_whatsapp_atendimentos enable row level security;
alter table public.lab_whatsapp_mensagens enable row level security;
alter table public.lab_whatsapp_anexos enable row level security;
alter table public.lab_whatsapp_analises enable row level security;
revoke all on public.lab_whatsapp_atendimentos, public.lab_whatsapp_mensagens, public.lab_whatsapp_anexos, public.lab_whatsapp_analises from public,anon;
revoke all on public.lab_whatsapp_analises from authenticated,service_role;
grant select on public.lab_whatsapp_analises to authenticated;
grant select,insert,update on public.lab_whatsapp_analises to service_role;
grant select,update on public.lab_whatsapp_atendimentos to service_role;

create policy lab_whatsapp_analises_staff_read on public.lab_whatsapp_analises
  for select to authenticated using ((select app_private.is_staff()) and exists (
    select 1 from public.lab_whatsapp_atendimentos a where a.id=atendimento_id
  ));

create function public.save_lab_whatsapp_manual_test(
  p_input_key uuid, p_contact_name text, p_contact_phone text, p_body text, p_source text default 'manual'
) returns uuid language plpgsql security invoker set search_path='' as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_name text := coalesce(nullif(btrim(p_contact_name),''),'Contato de teste');
  v_phone text := nullif(p_contact_phone,'');
begin
  if v_user is null or not app_private.is_staff() then raise insufficient_privilege; end if;
  if p_input_key is null or p_body is null or length(btrim(p_body))=0 or length(p_body)>8000
    or length(v_name)>120 or p_source is null or p_source not in ('manual','simulador')
    or (v_phone is not null and v_phone !~ '^[0-9]{8,15}$') then
    raise exception 'Invalid manual test input' using errcode='22023';
  end if;
  insert into public.lab_whatsapp_atendimentos(created_by,contact_name,contact_phone,source,message_count,input_key)
    values(v_user,v_name,v_phone,p_source,1,p_input_key)
    on conflict(created_by,input_key) where input_key is not null do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.lab_whatsapp_atendimentos where created_by=v_user and input_key=p_input_key;
    if not exists(select 1 from public.lab_whatsapp_atendimentos a
      join public.lab_whatsapp_mensagens m on m.atendimento_id=a.id
      where a.id=v_id and a.contact_name=v_name and a.contact_phone is not distinct from v_phone
        and a.source=p_source and m.body=p_body and m.external_message_id=p_input_key::text) then
      raise exception 'Input key already used for different content' using errcode='22023';
    end if;
    return v_id;
  end if;
  insert into public.lab_whatsapp_mensagens(atendimento_id,external_message_id,sequence,message_date,message_time,author,direction,body,raw_data)
    values(v_id,p_input_key::text,1,to_char(now() at time zone 'America/Sao_Paulo','DD/MM/YYYY'),
      to_char(now() at time zone 'America/Sao_Paulo','HH24:MI'),v_name,'recebida',p_body,jsonb_build_object('text',p_body,'source',p_source));
  return v_id;
end;
$$;
revoke all on function public.save_lab_whatsapp_manual_test(uuid,text,text,text,text) from public,anon,service_role;
grant execute on function public.save_lab_whatsapp_manual_test(uuid,text,text,text,text) to authenticated;

-- Privileged RPCs are callable only by the existing server-side processor.
create function public.start_lab_whatsapp_analysis(
  p_atendimento_id uuid,p_requested_by uuid,p_request_id uuid,p_model text,p_prompt_version text,p_context_message_ids uuid[]
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  v_atendimento public.lab_whatsapp_atendimentos;
  v_previous public.lab_whatsapp_analises;
  v_role text;
  v_id uuid;
  v_expired_status text;
begin
  select role into v_role from public.profiles where id=p_requested_by and ativo and role in ('owner','manager','equipe');
  if v_role is null then raise insufficient_privilege; end if;
  select * into v_atendimento from public.lab_whatsapp_atendimentos where id=p_atendimento_id for update;
  if not found then raise exception 'Test not found' using errcode='P0002'; end if;
  if v_atendimento.created_by<>p_requested_by and v_role not in ('owner','manager') then raise insufficient_privilege; end if;
  if p_request_id is null or nullif(p_model,'') is null or nullif(p_prompt_version,'') is null or p_context_message_ids is null then
    raise exception 'Invalid analysis request' using errcode='22023';
  end if;
  if exists(select 1 from unnest(p_context_message_ids) requested(id)
    where not exists(select 1 from public.lab_whatsapp_mensagens m where m.id=requested.id and m.atendimento_id=p_atendimento_id)) then
    raise exception 'Invalid message context' using errcode='22023';
  end if;
  update public.lab_whatsapp_analises set status='erro',error='Analysis timed out; start a new request',finished_at=now()
    where atendimento_id=p_atendimento_id and status='processando' and created_at<now()-interval '15 minutes'
    returning previous_status into v_expired_status;
  if found then
    update public.lab_whatsapp_atendimentos set status=v_expired_status,updated_at=now() where id=p_atendimento_id;
    v_atendimento.status := v_expired_status;
  end if;
  select * into v_previous from public.lab_whatsapp_analises where request_id=p_request_id;
  if found then
    if v_previous.atendimento_id<>p_atendimento_id or v_previous.requested_by<>p_requested_by then raise insufficient_privilege; end if;
    return jsonb_build_object('started',false,'analysis_id',v_previous.id,'status',v_previous.status,'result',v_previous.result,'error',v_previous.error);
  end if;
  select * into v_previous from public.lab_whatsapp_analises where atendimento_id=p_atendimento_id and status='processando';
  if found then return jsonb_build_object('started',false,'analysis_id',v_previous.id,'status','processando'); end if;
  insert into public.lab_whatsapp_analises(atendimento_id,requested_by,request_id,model,prompt_version,previous_status,context_message_ids)
    values(p_atendimento_id,p_requested_by,p_request_id,p_model,p_prompt_version,v_atendimento.status,p_context_message_ids) returning id into v_id;
  update public.lab_whatsapp_atendimentos set status='em_analise',updated_at=now() where id=p_atendimento_id;
  return jsonb_build_object('started',true,'analysis_id',v_id,'status','processando');
end;
$$;
revoke all on function public.start_lab_whatsapp_analysis(uuid,uuid,uuid,text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.start_lab_whatsapp_analysis(uuid,uuid,uuid,text,text,uuid[]) to service_role;

create function public.finish_lab_whatsapp_analysis(p_analysis_id uuid,p_result jsonb default null,p_error text default null)
returns void language plpgsql security invoker set search_path='' as $$
declare
  v_analysis public.lab_whatsapp_analises;
  v_atendimento_id uuid;
begin
  select atendimento_id into v_atendimento_id from public.lab_whatsapp_analises where id=p_analysis_id;
  perform 1 from public.lab_whatsapp_atendimentos where id=v_atendimento_id for update;
  select * into v_analysis from public.lab_whatsapp_analises where id=p_analysis_id for update;
  if not found or v_analysis.status<>'processando' then raise exception 'Analysis is not processing' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p join public.lab_whatsapp_atendimentos a on a.id=v_analysis.atendimento_id
    where p.id=v_analysis.requested_by and p.ativo and p.role in ('owner','manager','equipe')
      and (a.created_by=p.id or p.role in ('owner','manager'))) then raise insufficient_privilege; end if;
  if p_error is not null then
    update public.lab_whatsapp_analises set status='erro',error=left(p_error,2000),finished_at=now() where id=p_analysis_id;
    update public.lab_whatsapp_atendimentos set status=v_analysis.previous_status,updated_at=now() where id=v_atendimento_id;
  else
    if p_result is null or jsonb_typeof(p_result)<>'object' then raise exception 'Invalid analysis result' using errcode='22023'; end if;
    update public.lab_whatsapp_analises set status='concluida',result=p_result,finished_at=now() where id=p_analysis_id;
    update public.lab_whatsapp_atendimentos set analysis=p_result,summary=p_result->>'resumo',
      suggested_reply=p_result->>'resposta_sugerida',analyzed_at=now(),status='concluido',updated_at=now() where id=v_atendimento_id;
  end if;
end;
$$;
revoke all on function public.finish_lab_whatsapp_analysis(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.finish_lab_whatsapp_analysis(uuid,jsonb,text) to service_role;

create function app_private.protect_lab_analysis_history()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status<>'processando' then raise exception 'Finished analysis snapshots are immutable' using errcode='22023'; end if;
  if new.id<>old.id or new.atendimento_id<>old.atendimento_id or new.requested_by<>old.requested_by
    or new.request_id<>old.request_id or new.model<>old.model or new.prompt_version<>old.prompt_version
    or new.previous_status<>old.previous_status or new.context_message_ids is distinct from old.context_message_ids
    or new.created_at<>old.created_at then raise exception 'Analysis identity is immutable' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function app_private.protect_lab_analysis_history() from public,anon,authenticated;
grant execute on function app_private.protect_lab_analysis_history() to service_role;
create trigger lab_whatsapp_analises_protect_history before update on public.lab_whatsapp_analises
  for each row execute function app_private.protect_lab_analysis_history();

comment on column public.lab_whatsapp_atendimentos.workflow_status is 'Human-controlled workflow; analysis completion does not approve payment or production.';
comment on table public.lab_whatsapp_analises is 'Versioned analysis attempts for the isolated lab. Deleted only when the parent test is deleted.';
