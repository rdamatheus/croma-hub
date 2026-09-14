create or replace function public.nfse_guard_document_write()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'authenticated' then
    if tg_op = 'INSERT' then
      new.status := 'draft';
      new.bling_nfse_id := null;
      new.numero_nfse := null;
      new.numero_rps := null;
      new.codigo_verificacao := null;
      new.link_nfse := null;
      new.link_pdf := null;
      new.request_snapshot := '{}'::jsonb;
      new.response_snapshot := '{}'::jsonb;
      new.error_code := null;
      new.error_message := null;
      new.approved_by := null;
      new.authorized_at := null;
      new.last_synced_at := null;
      if new.created_by is null then new.created_by := auth.uid(); end if;
      if new.created_by is distinct from auth.uid() then
        raise exception 'created_by deve corresponder ao usuário autenticado';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.status is distinct from old.status
         or new.bling_nfse_id is distinct from old.bling_nfse_id
         or new.numero_nfse is distinct from old.numero_nfse
         or new.numero_rps is distinct from old.numero_rps
         or new.codigo_verificacao is distinct from old.codigo_verificacao
         or new.link_nfse is distinct from old.link_nfse
         or new.link_pdf is distinct from old.link_pdf
         or new.request_snapshot is distinct from old.request_snapshot
         or new.response_snapshot is distinct from old.response_snapshot
         or new.error_code is distinct from old.error_code
         or new.error_message is distinct from old.error_message
         or new.approved_by is distinct from old.approved_by
         or new.authorized_at is distinct from old.authorized_at
         or new.last_synced_at is distinct from old.last_synced_at
      then
        raise exception 'Campos de processamento da NFS-e só podem ser alterados pelo backend fiscal';
      end if;
      if old.status not in ('draft','rejected') or old.bling_nfse_id is not null then
        if new.customer_id is distinct from old.customer_id
           or new.fiscal_profile_id is distinct from old.fiscal_profile_id
           or new.source_order_id is distinct from old.source_order_id
           or new.valor_servico is distinct from old.valor_servico
           or new.descricao is distinct from old.descricao
           or new.serie is distinct from old.serie
           or new.bling_contact_id is distinct from old.bling_contact_id
        then
          raise exception 'Dados fiscais não podem ser editados após criação da NFS-e no Bling';
        end if;
      end if;
      new.created_by := old.created_by;
      new.created_at := old.created_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists nfse_documents_guard_write on public.nfse_documents;
create trigger nfse_documents_guard_write
before insert or update on public.nfse_documents
for each row execute function public.nfse_guard_document_write();

create or replace function public.nfse_log_document_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.nfse_events(nfse_document_id,event_type,actor_id,payload)
  values (new.id,'draft_created',new.created_by,jsonb_build_object('status',new.status,'valor_servico',new.valor_servico));
  return new;
end;
$$;

drop trigger if exists nfse_documents_log_insert on public.nfse_documents;
create trigger nfse_documents_log_insert
after insert on public.nfse_documents
for each row execute function public.nfse_log_document_insert();

revoke execute on function public.nfse_guard_document_write() from public, anon, authenticated;
revoke execute on function public.nfse_log_document_insert() from public, anon, authenticated;
