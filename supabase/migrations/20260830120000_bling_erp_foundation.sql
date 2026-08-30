create table if not exists public.erp_connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique check (provider = 'bling'),
  status text not null default 'not_configured' check (status in ('not_configured','awaiting_authorization','connected','expired','error','disconnected')),
  account_external_id text,
  account_name text,
  sync_mode text not null default 'review' check (sync_mode in ('review','manual','automatic')),
  enabled_entities text[] not null default array['product','customer','order','stock'],
  last_sync_at timestamptz,
  last_error text,
  connected_by uuid references public.profiles(id),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.erp_entity_mappings (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'bling'),
  entity_type text not null check (entity_type in ('product','customer','order','stock')),
  local_id uuid,
  external_id text not null,
  local_updated_at timestamptz,
  external_updated_at timestamptz,
  last_synced_at timestamptz,
  sync_hash text,
  sync_status text not null default 'mapped' check (sync_status in ('mapped','pending','synced','conflict','error','ignored')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, entity_type, external_id)
);

create unique index if not exists erp_entity_mappings_local_unique
  on public.erp_entity_mappings(provider, entity_type, local_id)
  where local_id is not null;
create index if not exists erp_entity_mappings_status_idx
  on public.erp_entity_mappings(provider, entity_type, sync_status);

create table if not exists public.erp_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider = 'bling'),
  entity_type text not null check (entity_type in ('product','customer','order','stock')),
  operation text not null check (operation in ('connect','list','get','create','update','delete','import','export','reconcile','webhook')),
  direction text not null default 'none' check (direction in ('none','bling_to_croma','croma_to_bling','bidirectional')),
  status text not null default 'queued' check (status in ('queued','running','completed','partial','failed','cancelled')),
  requested_by uuid references public.profiles(id),
  started_at timestamptz,
  finished_at timestamptz,
  processed_count integer not null default 0 check (processed_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  request_summary jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists erp_sync_jobs_recent_idx
  on public.erp_sync_jobs(provider, created_at desc);
create index if not exists erp_sync_jobs_status_idx
  on public.erp_sync_jobs(status, created_at);

create table if not exists public.erp_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid references public.erp_entity_mappings(id) on delete set null,
  provider text not null check (provider = 'bling'),
  entity_type text not null check (entity_type in ('product','customer','order','stock')),
  local_snapshot jsonb,
  external_snapshot jsonb,
  conflicting_fields text[] not null default '{}',
  status text not null default 'open' check (status in ('open','resolved_local','resolved_external','resolved_merged','ignored')),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists erp_sync_conflicts_open_idx
  on public.erp_sync_conflicts(provider, entity_type, status)
  where status = 'open';

create table if not exists public.erp_oauth_states (
  state text primary key,
  provider text not null check (provider = 'bling'),
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists erp_oauth_states_expiry_idx
  on public.erp_oauth_states(expires_at)
  where used_at is null;

create table if not exists public.erp_private_tokens (
  connection_id uuid primary key references public.erp_connections(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  token_type text not null default 'Bearer',
  scope text,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.erp_connections enable row level security;
alter table public.erp_entity_mappings enable row level security;
alter table public.erp_sync_jobs enable row level security;
alter table public.erp_sync_conflicts enable row level security;
alter table public.erp_oauth_states enable row level security;
alter table public.erp_private_tokens enable row level security;

drop policy if exists erp_connections_owner_read on public.erp_connections;
create policy erp_connections_owner_read on public.erp_connections
  for select to authenticated using ((select app_private.is_owner()));
drop policy if exists erp_mappings_owner_read on public.erp_entity_mappings;
create policy erp_mappings_owner_read on public.erp_entity_mappings
  for select to authenticated using ((select app_private.is_owner()));
drop policy if exists erp_jobs_owner_read on public.erp_sync_jobs;
create policy erp_jobs_owner_read on public.erp_sync_jobs
  for select to authenticated using ((select app_private.is_owner()));
drop policy if exists erp_conflicts_owner_read on public.erp_sync_conflicts;
create policy erp_conflicts_owner_read on public.erp_sync_conflicts
  for select to authenticated using ((select app_private.is_owner()));

revoke all on public.erp_connections, public.erp_entity_mappings,
  public.erp_sync_jobs, public.erp_sync_conflicts,
  public.erp_oauth_states, public.erp_private_tokens
  from public, anon, authenticated;
grant select on public.erp_connections, public.erp_entity_mappings,
  public.erp_sync_jobs, public.erp_sync_conflicts to authenticated;
grant all on public.erp_connections, public.erp_entity_mappings,
  public.erp_sync_jobs, public.erp_sync_conflicts,
  public.erp_oauth_states, public.erp_private_tokens to service_role;

insert into public.erp_connections (provider, status, sync_mode)
values ('bling', 'not_configured', 'review')
on conflict (provider) do nothing;
