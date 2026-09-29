-- Central de Aprovações da vitrine comercial
-- Fila de propostas, versões, comentários e preferências para validação humana.

create table if not exists public.site_approval_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_type text not null check (proposal_type = any (array[
    'product_image'::text,
    'product_related'::text,
    'banner'::text,
    'featured_item'::text,
    'campaign'::text,
    'seasonal'::text
  ])),
  status text not null default 'pending'::text check (status = any (array[
    'draft'::text,
    'pending'::text,
    'changes_requested'::text,
    'approved'::text,
    'rejected'::text,
    'published'::text,
    'archived'::text
  ])),
  title text not null check (char_length(trim(title)) >= 2),
  area text,
  summary text,
  rationale text,
  preview_url text,
  target_type text,
  target_ref text,
  product_id uuid references public.products(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  current_version integer not null default 1 check (current_version > 0),
  source text not null default 'agent'::text check (source = any (array[
    'agent'::text,
    'manual'::text,
    'system'::text
  ])),
  proposed_for date,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamp with time zone,
  published_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.site_approval_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.site_approval_proposals(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  content jsonb not null default '{}'::jsonb,
  preview_url text,
  change_summary text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  unique (proposal_id, version_number)
);

create table if not exists public.site_approval_comments (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.site_approval_proposals(id) on delete cascade,
  version_id uuid references public.site_approval_versions(id) on delete set null,
  author_id uuid references auth.users(id) on delete set null,
  comment_type text not null default 'feedback'::text check (comment_type = any (array[
    'feedback'::text,
    'decision'::text,
    'system'::text
  ])),
  body text not null check (char_length(trim(body)) >= 1),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.site_approval_preferences (
  id uuid primary key default gen_random_uuid(),
  preference_key text not null unique check (char_length(trim(preference_key)) >= 2),
  value jsonb not null default '{}'::jsonb,
  source text not null default 'learned'::text check (source = any (array[
    'explicit'::text,
    'learned'::text,
    'agent'::text
  ])),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists site_approval_proposals_status_idx
  on public.site_approval_proposals (status, updated_at desc);
create index if not exists site_approval_proposals_type_idx
  on public.site_approval_proposals (proposal_type, created_at desc);
create index if not exists site_approval_proposals_product_idx
  on public.site_approval_proposals (product_id)
  where product_id is not null;
create index if not exists site_approval_versions_proposal_idx
  on public.site_approval_versions (proposal_id, version_number desc);
create index if not exists site_approval_comments_proposal_idx
  on public.site_approval_comments (proposal_id, created_at desc);

create or replace function public.set_site_approval_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists site_approval_proposals_updated_at on public.site_approval_proposals;
create trigger site_approval_proposals_updated_at
before update on public.site_approval_proposals
for each row execute function public.set_site_approval_updated_at();

drop trigger if exists site_approval_preferences_updated_at on public.site_approval_preferences;
create trigger site_approval_preferences_updated_at
before update on public.site_approval_preferences
for each row execute function public.set_site_approval_updated_at();

alter table public.site_approval_proposals enable row level security;
alter table public.site_approval_versions enable row level security;
alter table public.site_approval_comments enable row level security;
alter table public.site_approval_preferences enable row level security;

drop policy if exists site_approval_proposals_management on public.site_approval_proposals;
create policy site_approval_proposals_management
on public.site_approval_proposals
for all to authenticated
using ((select app_private.is_manager()))
with check ((select app_private.is_manager()));

drop policy if exists site_approval_versions_management on public.site_approval_versions;
create policy site_approval_versions_management
on public.site_approval_versions
for all to authenticated
using ((select app_private.is_manager()))
with check ((select app_private.is_manager()));

drop policy if exists site_approval_comments_management on public.site_approval_comments;
create policy site_approval_comments_management
on public.site_approval_comments
for all to authenticated
using ((select app_private.is_manager()))
with check ((select app_private.is_manager()));

drop policy if exists site_approval_preferences_management on public.site_approval_preferences;
create policy site_approval_preferences_management
on public.site_approval_preferences
for all to authenticated
using ((select app_private.is_manager()))
with check ((select app_private.is_manager()));

comment on table public.site_approval_proposals is 'Fila interna de propostas de vitrine/campanhas aguardando decisão humana.';
comment on table public.site_approval_versions is 'Histórico imutável das versões de cada proposta de vitrine.';
comment on table public.site_approval_comments is 'Comentários e decisões vinculados a propostas e versões.';
comment on table public.site_approval_preferences is 'Preferências explícitas ou aprendidas para orientar novas propostas comerciais.';
