create table if not exists public.production_simulations (
  id uuid primary key default gen_random_uuid(),
  simulation_no bigint generated always as identity unique,
  simulation_type text not null check (simulation_type in ('roll','sheet')),
  title text not null check (char_length(trim(title)) >= 2),
  proposal_id uuid references public.sales_proposals(id) on delete set null,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  customer_name text,
  status text not null default 'draft' check (status in ('draft','final','archived')),
  current_version integer not null default 0 check (current_version >= 0),
  source text not null default 'manual',
  source_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.production_simulations is
'Simulações de aproveitamento de produção da Croma. Suporta bobinas de adesivos e chapas/placas, com vínculo opcional a proposta comercial.';

create table if not exists public.production_simulation_versions (
  id uuid primary key default gen_random_uuid(),
  simulation_id uuid not null references public.production_simulations(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  config jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  financials jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (simulation_id, version_number)
);

comment on table public.production_simulation_versions is
'Snapshots imutáveis das versões de cada simulação, preservando parâmetros, itens, encaixe e cálculo financeiro usados na cotação.';

create index if not exists production_simulations_proposal_id_idx on public.production_simulations(proposal_id);
create index if not exists production_simulations_customer_id_idx on public.production_simulations(customer_id);
create index if not exists production_simulations_type_updated_idx on public.production_simulations(simulation_type, updated_at desc);
create index if not exists production_simulation_versions_simulation_idx on public.production_simulation_versions(simulation_id, version_number desc);
create index if not exists production_simulations_created_by_idx on public.production_simulations(created_by);
create index if not exists production_simulations_updated_by_idx on public.production_simulations(updated_by);
create index if not exists production_simulation_versions_created_by_idx on public.production_simulation_versions(created_by);

alter table public.production_simulations enable row level security;
alter table public.production_simulation_versions enable row level security;

create policy production_simulations_staff_select on public.production_simulations for select to authenticated
using ((select app_private.is_manager()) or ((select app_private.is_staff()) and proposal_id is null));
create policy production_simulations_staff_insert on public.production_simulations for insert to authenticated
with check ((select app_private.is_manager()) or ((select app_private.is_staff()) and proposal_id is null));
create policy production_simulations_staff_update on public.production_simulations for update to authenticated
using ((select app_private.is_manager()) or ((select app_private.is_staff()) and proposal_id is null))
with check ((select app_private.is_manager()) or ((select app_private.is_staff()) and proposal_id is null));
create policy production_simulations_staff_delete on public.production_simulations for delete to authenticated
using ((select app_private.is_manager()) or ((select app_private.is_staff()) and proposal_id is null));

create policy production_simulation_versions_staff_select on public.production_simulation_versions for select to authenticated
using (exists (
  select 1 from public.production_simulations s
  where s.id=simulation_id and ((select app_private.is_manager()) or ((select app_private.is_staff()) and s.proposal_id is null))
));
create policy production_simulation_versions_staff_insert on public.production_simulation_versions for insert to authenticated
with check (exists (
  select 1 from public.production_simulations s
  where s.id=simulation_id and ((select app_private.is_manager()) or ((select app_private.is_staff()) and s.proposal_id is null))
));
create policy production_simulation_versions_staff_delete on public.production_simulation_versions for delete to authenticated
using (exists (
  select 1 from public.production_simulations s
  where s.id=simulation_id and ((select app_private.is_manager()) or ((select app_private.is_staff()) and s.proposal_id is null))
));

grant select, insert, update, delete on public.production_simulations to authenticated;
grant select, insert, delete on public.production_simulation_versions to authenticated;
grant usage, select on sequence public.production_simulations_simulation_no_seq to authenticated;
