begin;

alter table public.nfse_documents
  add column if not exists source_type text,
  add column if not exists bling_order_id bigint,
  add column if not exists bling_order_number text,
  add column if not exists order_snapshot jsonb not null default '{}'::jsonb;

alter table public.nfse_documents
  drop constraint if exists nfse_documents_source_type_check;
alter table public.nfse_documents
  add constraint nfse_documents_source_type_check
  check (source_type is null or source_type in ('bling_order'));

create unique index if not exists nfse_documents_bling_order_id_unique
  on public.nfse_documents (bling_order_id)
  where bling_order_id is not null;
create index if not exists nfse_documents_bling_order_number_idx
  on public.nfse_documents (bling_order_number)
  where bling_order_number is not null;

create table if not exists public.product_fiscal_profiles (
  product_id uuid primary key references public.products(id) on delete cascade,
  fiscal_profile_id uuid not null references public.fiscal_service_profiles(id) on delete restrict,
  ativo boolean not null default true,
  source text not null default 'manual' check (source in ('manual')),
  classified_by uuid references public.profiles(id) on delete set null,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_fiscal_profiles_profile_idx
  on public.product_fiscal_profiles (fiscal_profile_id)
  where ativo is true;

alter table public.product_fiscal_profiles enable row level security;
drop policy if exists product_fiscal_profiles_owner_all on public.product_fiscal_profiles;
create policy product_fiscal_profiles_owner_all
  on public.product_fiscal_profiles for all to authenticated
  using ((select app_private.is_owner()))
  with check ((select app_private.is_owner()));

drop trigger if exists product_fiscal_profiles_set_updated_at on public.product_fiscal_profiles;
create trigger product_fiscal_profiles_set_updated_at
  before update on public.product_fiscal_profiles
  for each row execute function public.set_updated_at();

revoke all on table public.product_fiscal_profiles from anon;
grant select on table public.product_fiscal_profiles to authenticated;
grant all on table public.product_fiscal_profiles to service_role;

-- O documento fiscal passa a ser preparado pelo backend a partir do pedido do Bling.
revoke insert, update, delete on table public.nfse_documents from authenticated;
grant select on table public.nfse_documents to authenticated;

create or replace function public.nfse_guard_document_write()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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
         or new.order_snapshot is distinct from old.order_snapshot
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
           or new.source_type is distinct from old.source_type
           or new.bling_order_id is distinct from old.bling_order_id
           or new.bling_order_number is distinct from old.bling_order_number
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
$function$;

commit;
