alter table public.sales_proposals
  add column if not exists bling_proposal_id bigint,
  add column if not exists bling_sync_status text not null default 'not_synced',
  add column if not exists bling_sync_error text,
  add column if not exists bling_last_synced_at timestamptz,
  add column if not exists bling_sync_hash text,
  add column if not exists bling_remote_hash text,
  add column if not exists bling_remote_updated_at timestamptz,
  add column if not exists bling_request_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists bling_response_snapshot jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.sales_proposals'::regclass
      and conname = 'sales_proposals_bling_sync_status_check'
  ) then
    alter table public.sales_proposals drop constraint sales_proposals_bling_sync_status_check;
  end if;
end $$;

alter table public.sales_proposals
  add constraint sales_proposals_bling_sync_status_check
  check (bling_sync_status = any (array['not_synced'::text,'syncing'::text,'synced'::text,'conflict'::text,'error'::text]));

create unique index if not exists sales_proposals_bling_proposal_id_uidx
  on public.sales_proposals (bling_proposal_id)
  where bling_proposal_id is not null;

create index if not exists sales_proposals_bling_sync_status_idx
  on public.sales_proposals (bling_sync_status, updated_at desc);

alter table public.erp_entity_mappings
  drop constraint if exists erp_entity_mappings_entity_type_check;

alter table public.erp_entity_mappings
  add constraint erp_entity_mappings_entity_type_check
  check (entity_type = any (array['product'::text,'customer'::text,'order'::text,'stock'::text,'category'::text,'proposal'::text]));

create unique index if not exists erp_entity_mappings_bling_proposal_local_uidx
  on public.erp_entity_mappings (provider, entity_type, local_id)
  where provider = 'bling' and entity_type = 'proposal' and local_id is not null;

alter table public.erp_sync_conflicts
  drop constraint if exists erp_sync_conflicts_entity_type_check;

alter table public.erp_sync_conflicts
  add constraint erp_sync_conflicts_entity_type_check
  check (entity_type = any (array['product'::text,'customer'::text,'order'::text,'stock'::text,'proposal'::text]));

alter table public.erp_sync_jobs
  drop constraint if exists erp_sync_jobs_entity_type_check;

alter table public.erp_sync_jobs
  add constraint erp_sync_jobs_entity_type_check
  check (entity_type = any (array['product'::text,'service'::text,'customer'::text,'order'::text,'stock'::text,'category'::text,'proposal'::text]));

comment on column public.sales_proposals.bling_proposal_id is 'ID da proposta comercial correspondente no Bling. Um ID externo pode estar ligado a somente uma proposta local.';
comment on column public.sales_proposals.bling_sync_status is 'Estado da sincronização da proposta com o Bling: not_synced, syncing, synced, conflict ou error.';
comment on column public.sales_proposals.bling_sync_error is 'Último erro de sincronização da proposta comercial com o Bling.';
comment on column public.sales_proposals.bling_last_synced_at is 'Momento da última sincronização confirmada com releitura da proposta no Bling.';
comment on column public.sales_proposals.bling_sync_hash is 'Hash do payload comercial local confirmado na última sincronização.';
comment on column public.sales_proposals.bling_remote_hash is 'Hash do snapshot comercial remoto confirmado na última sincronização.';
comment on column public.sales_proposals.bling_request_snapshot is 'Snapshot do último payload comercial enviado ao Bling. Não contém custos internos da Croma.';
comment on column public.sales_proposals.bling_response_snapshot is 'Snapshot da última proposta comercial relida do Bling.';
