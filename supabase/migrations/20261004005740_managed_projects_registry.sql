create table if not exists public.managed_projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  project_type text not null default 'internal',
  status text not null default 'active',
  repository_url text,
  site_url text,
  admin_url text,
  supabase_schema text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint managed_projects_slug_chk check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  constraint managed_projects_type_chk check (project_type in ('internal','venture','client','external')),
  constraint managed_projects_status_chk check (status in ('active','paused','planning','archived'))
);

alter table public.managed_projects enable row level security;

revoke all on public.managed_projects from anon;
grant select, insert, update, delete on public.managed_projects to authenticated;

create policy "managed_projects_management_read"
on public.managed_projects
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and p.role in ('owner','manager')
  )
);

create policy "managed_projects_management_write"
on public.managed_projects
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and p.role in ('owner','manager')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and p.role in ('owner','manager')
  )
);

insert into public.managed_projects
  (slug,name,project_type,status,repository_url,site_url,admin_url,supabase_schema,description,metadata,sort_order)
values
  ('croma-hub','Croma Hub','internal','active','https://github.com/rdamatheus/croma-hub','https://www.cromapel.com.br/','https://www.cromapel.com.br/interno/','public','Sistema principal da Croma, site público e operação administrativa.',jsonb_build_object('supabase_project','croma-hub'),10),
  ('personal-os','Personal OS','internal','active','https://github.com/rdamatheus/personal-os',null,null,'personal_os','Sistema pessoal isolado no mesmo projeto Supabase do Croma Hub.',jsonb_build_object('supabase_project','croma-hub'),20),
  ('luff-store','LUFF Store','venture','active','https://github.com/rdamatheus/LuffStore','https://rdamatheus.github.io/LuffStore/','https://rdamatheus.github.io/LuffStore/admin/','luff','Projeto digital da LUFF Store, com dados isolados nos schemas luff e luff_private.',jsonb_build_object('supabase_project','croma-hub','rollback_project','personal-os','edge_function','luff-admin-users'),30)
on conflict (slug) do update set
  name = excluded.name,
  project_type = excluded.project_type,
  status = excluded.status,
  repository_url = excluded.repository_url,
  site_url = excluded.site_url,
  admin_url = excluded.admin_url,
  supabase_schema = excluded.supabase_schema,
  description = excluded.description,
  metadata = excluded.metadata,
  sort_order = excluded.sort_order,
  updated_at = now();

create index if not exists managed_projects_status_sort_idx
  on public.managed_projects(status, sort_order, name);
