-- Personal OS compartilhando o projeto Supabase do Croma Hub.
-- Isolamento lógico: dados pessoais ficam em personal_os; helpers privados em personal_os_private.
-- O schema public da Croma permanece inalterado, exceto pela proteção do trigger de cadastro de cliente.

create schema if not exists personal_os;
create schema if not exists personal_os_private;

revoke all on schema personal_os from public;
revoke all on schema personal_os_private from public;
grant usage on schema personal_os to authenticated, service_role;
grant usage on schema personal_os_private to authenticated, service_role;

-- Evita que usuários criados por outras aplicações do Auth compartilhado virem clientes Croma.
-- O cadastro público atual da Croma sempre envia nome + cpf + telefone.
create or replace function public.handle_new_customer()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_cpf text;
  v_phone text;
  v_cep text;
  v_uf text;
begin
  if coalesce(new.raw_user_meta_data->>'nome','') = ''
     or coalesce(new.raw_user_meta_data->>'cpf','') = ''
     or coalesce(new.raw_user_meta_data->>'telefone','') = '' then
    return new;
  end if;

  v_cpf := regexp_replace(coalesce(new.raw_user_meta_data->>'cpf',''), '[^0-9]', '', 'g');
  v_phone := regexp_replace(coalesce(new.raw_user_meta_data->>'telefone',''), '[^0-9]', '', 'g');
  v_cep := regexp_replace(coalesce(new.raw_user_meta_data->>'cep',''), '[^0-9]', '', 'g');
  v_uf := upper(coalesce(new.raw_user_meta_data->>'estado',''));

  insert into public.customer_profiles (id, nome, cpf, telefone, email, data_nascimento)
  values (
    new.id,
    trim(new.raw_user_meta_data->>'nome'),
    v_cpf,
    v_phone,
    new.email,
    nullif(new.raw_user_meta_data->>'data_nascimento','')::date
  )
  on conflict (id) do nothing;

  if v_cep <> '' and coalesce(new.raw_user_meta_data->>'logradouro','') <> '' then
    insert into public.customer_addresses (
      customer_id, apelido, cep, logradouro, numero, complemento, bairro, cidade, estado, principal
    ) values (
      new.id,
      'Principal',
      v_cep,
      trim(new.raw_user_meta_data->>'logradouro'),
      trim(new.raw_user_meta_data->>'numero'),
      nullif(trim(coalesce(new.raw_user_meta_data->>'complemento','')), ''),
      trim(new.raw_user_meta_data->>'bairro'),
      trim(new.raw_user_meta_data->>'cidade'),
      v_uf,
      true
    );
  end if;

  return new;
end;
$$;

create table if not exists personal_os.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'America/Sao_Paulo',
  locale text not null default 'pt-BR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists personal_os.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  name text not null,
  kind text not null default 'personal' check (kind in ('personal','shared')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create unique index if not exists personal_os_one_active_personal_workspace_per_owner
  on personal_os.workspaces(owner_user_id)
  where kind='personal' and archived_at is null;

create table if not exists personal_os.workspace_members (
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member','viewer')),
  status text not null default 'active' check (status in ('active','invited','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id,user_id)
);

create table if not exists personal_os.areas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  description text,
  color text,
  icon text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  unique (id,workspace_id)
);

create table if not exists personal_os.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  title text not null,
  description text,
  status text not null default 'active',
  priority text,
  target_date date,
  success_criteria text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  unique (id,workspace_id),
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id)
);

create table if not exists personal_os.routes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  goal_id uuid,
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','proposed','active','paused','completed','archived')),
  source text not null default 'manual' check (source in ('manual','ai','template')),
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (id,workspace_id),
  foreign key (goal_id,workspace_id) references personal_os.goals(id,workspace_id)
);

create table if not exists personal_os.route_steps (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  route_id uuid not null,
  title text not null,
  description text,
  position integer not null check (position >= 0),
  status text not null default 'pending' check (status in ('pending','ready','doing','blocked','done','skipped')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes >= 0),
  estimated_cost numeric(12,2) check (estimated_cost is null or estimated_cost >= 0),
  currency char(3) not null default 'BRL',
  due_date date,
  reason text,
  source text not null default 'manual' check (source in ('manual','ai','template')),
  confidence numeric(4,3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  depends_on_step_ids uuid[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (route_id,position),
  unique (id,workspace_id),
  foreign key (route_id,workspace_id) references personal_os.routes(id,workspace_id)
);

create table if not exists personal_os.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  goal_id uuid,
  title text not null,
  description text,
  status text not null default 'active',
  priority text,
  start_date date,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  unique (id,workspace_id),
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id),
  foreign key (goal_id,workspace_id) references personal_os.goals(id,workspace_id)
);

create table if not exists personal_os.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  project_id uuid,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text,
  due_at timestamptz,
  estimated_minutes integer,
  energy_required integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  route_step_id uuid,
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id),
  foreign key (project_id,workspace_id) references personal_os.projects(id,workspace_id),
  foreign key (route_step_id,workspace_id) references personal_os.route_steps(id,workspace_id)
);

create table if not exists personal_os.ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  project_id uuid,
  title text not null,
  description text,
  status text not null default 'inbox',
  potential_impact integer,
  review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id),
  foreign key (project_id,workspace_id) references personal_os.projects(id,workspace_id)
);

create table if not exists personal_os.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  name text not null,
  description text,
  frequency text,
  preferred_window text,
  duration_estimate integer,
  trigger text,
  priority text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id)
);

create table if not exists personal_os.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  focus integer,
  energy integer,
  mood integer,
  stress integer,
  anxiety integer,
  motivation integer,
  appetite integer,
  sleepiness integer,
  mental_clarity integer,
  impulsivity integer,
  notes text,
  created_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade
);

create table if not exists personal_os.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null,
  item_name text,
  occurred_at timestamptz not null default now(),
  quantity numeric,
  unit text,
  context text,
  perceived_effect text,
  notes text,
  created_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade
);

create table if not exists personal_os.decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  area_id uuid,
  project_id uuid,
  title text not null,
  decision text not null,
  rationale text,
  review_at timestamptz,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  archived_at timestamptz,
  assumptions text[] not null default '{}',
  alternatives text[] not null default '{}',
  related_entity_type text,
  related_entity_id uuid,
  foreign key (area_id,workspace_id) references personal_os.areas(id,workspace_id),
  foreign key (project_id,workspace_id) references personal_os.projects(id,workspace_id)
);

create table if not exists personal_os.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references personal_os.workspaces(id) on delete cascade,
  actor_user_id uuid default auth.uid() references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists personal_os.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

comment on table personal_os.profiles is 'Perfil da aplicação Personal OS, separado dos perfis Croma.';
comment on table personal_os.workspaces is 'Boundary multiusuário do Personal OS.';
comment on table personal_os.platform_admins is 'Administradores da plataforma Personal OS, independente dos papéis Croma.';

create index if not exists personal_os_workspace_members_user_idx on personal_os.workspace_members(user_id,status);
create index if not exists personal_os_areas_workspace_status_idx on personal_os.areas(workspace_id,status);
create index if not exists personal_os_goals_workspace_status_idx on personal_os.goals(workspace_id,status);
create index if not exists personal_os_routes_workspace_status_idx on personal_os.routes(workspace_id,status);
create index if not exists personal_os_routes_goal_idx on personal_os.routes(goal_id);
create index if not exists personal_os_route_steps_route_status_idx on personal_os.route_steps(route_id,status,position);
create index if not exists personal_os_projects_workspace_status_idx on personal_os.projects(workspace_id,status);
create index if not exists personal_os_tasks_workspace_status_idx on personal_os.tasks(workspace_id,status);
create index if not exists personal_os_tasks_route_step_idx on personal_os.tasks(route_step_id);
create index if not exists personal_os_tasks_due_idx on personal_os.tasks(workspace_id,due_at) where due_at is not null;
create index if not exists personal_os_ideas_workspace_status_idx on personal_os.ideas(workspace_id,status);
create index if not exists personal_os_routines_workspace_active_idx on personal_os.routines(workspace_id,active);
create index if not exists personal_os_check_ins_workspace_occurred_idx on personal_os.check_ins(workspace_id,occurred_at desc);
create index if not exists personal_os_events_workspace_occurred_idx on personal_os.events(workspace_id,occurred_at desc);
create index if not exists personal_os_decisions_workspace_status_idx on personal_os.decisions(workspace_id,status);
create index if not exists personal_os_activity_log_workspace_created_idx on personal_os.activity_log(workspace_id,created_at desc);
create index if not exists personal_os_activity_log_entity_idx on personal_os.activity_log(entity_type,entity_id);

create or replace function personal_os_private.set_updated_at()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  new.updated_at=now();
  return new;
end;
$$;

create or replace function personal_os_private.prevent_user_id_change()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.user_id is distinct from new.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end;
$$;

create or replace function personal_os_private.prevent_created_by_change()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.created_by is distinct from new.created_by then
    raise exception 'created_by is immutable';
  end if;
  return new;
end;
$$;

create or replace function personal_os_private.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from personal_os.workspace_members wm
    where wm.workspace_id=p_workspace_id
      and wm.user_id=(select auth.uid())
      and wm.status='active'
  );
$$;

create or replace function personal_os_private.has_workspace_role(p_workspace_id uuid,p_roles text[])
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from personal_os.workspace_members wm
    where wm.workspace_id=p_workspace_id
      and wm.user_id=(select auth.uid())
      and wm.status='active'
      and wm.role=any(p_roles)
  );
$$;

create or replace function personal_os_private.prevent_workspace_owner_change()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if old.owner_user_id is distinct from new.owner_user_id then
    raise exception 'workspace owner_user_id is immutable';
  end if;
  return new;
end;
$$;

create or replace function personal_os_private.protect_personal_owner_membership()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_owner_user_id uuid;
  v_kind text;
begin
  select w.owner_user_id,w.kind into v_owner_user_id,v_kind
  from personal_os.workspaces w where w.id=old.workspace_id;

  if v_kind='personal' and old.user_id=v_owner_user_id then
    if tg_op='DELETE' then
      raise exception 'personal workspace owner membership cannot be deleted';
    end if;
    if new.workspace_id is distinct from old.workspace_id
       or new.user_id is distinct from old.user_id
       or new.role<>'owner'
       or new.status<>'active' then
      raise exception 'personal workspace owner membership must remain active owner';
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;

create or replace function personal_os.ensure_personal_workspace()
returns table(workspace_id uuid,workspace_name text,member_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_workspace_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),nullif(u.raw_user_meta_data->>'nome',''),nullif(split_part(coalesce(u.email,''),'@',1),''),'Usuário'),
    coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture')
  into v_name,v_avatar
  from auth.users u where u.id=v_uid;

  insert into personal_os.profiles(id,display_name,avatar_url)
  values(v_uid,v_name,v_avatar)
  on conflict(id) do update
    set display_name=coalesce(personal_os.profiles.display_name,excluded.display_name),
        avatar_url=coalesce(personal_os.profiles.avatar_url,excluded.avatar_url),
        updated_at=now();

  select w.id into v_workspace_id
  from personal_os.workspaces w
  where w.owner_user_id=v_uid and w.kind='personal' and w.archived_at is null
  limit 1;

  if v_workspace_id is null then
    insert into personal_os.workspaces(owner_user_id,name,kind)
    values(v_uid,'Personal OS de '||v_name,'personal')
    returning id into v_workspace_id;
  end if;

  insert into personal_os.workspace_members(workspace_id,user_id,role,status)
  values(v_workspace_id,v_uid,'owner','active')
  on conflict(workspace_id,user_id) do update
    set role='owner',status='active',updated_at=now();

  return query
  select w.id,w.name,wm.role
  from personal_os.workspaces w
  join personal_os.workspace_members wm on wm.workspace_id=w.id and wm.user_id=v_uid
  where w.id=v_workspace_id;
end;
$$;

revoke all on function personal_os_private.is_workspace_member(uuid) from public;
revoke all on function personal_os_private.has_workspace_role(uuid,text[]) from public;
revoke all on function personal_os.ensure_personal_workspace() from public;
grant execute on function personal_os_private.is_workspace_member(uuid) to authenticated,service_role;
grant execute on function personal_os_private.has_workspace_role(uuid,text[]) to authenticated,service_role;
grant execute on function personal_os.ensure_personal_workspace() to authenticated,service_role;

-- Triggers de integridade.
do $$
declare r record;
begin
  for r in select unnest(array['profiles','workspaces','workspace_members','areas','goals','projects','tasks','ideas','routines','decisions','routes','route_steps']) as table_name loop
    execute format('drop trigger if exists %I on personal_os.%I',r.table_name||'_set_updated_at',r.table_name);
    execute format('create trigger %I before update on personal_os.%I for each row execute function personal_os_private.set_updated_at()',r.table_name||'_set_updated_at',r.table_name);
  end loop;
end $$;

drop trigger if exists areas_prevent_user_id_change on personal_os.areas;
create trigger areas_prevent_user_id_change before update on personal_os.areas for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists goals_prevent_user_id_change on personal_os.goals;
create trigger goals_prevent_user_id_change before update on personal_os.goals for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists projects_prevent_user_id_change on personal_os.projects;
create trigger projects_prevent_user_id_change before update on personal_os.projects for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists tasks_prevent_user_id_change on personal_os.tasks;
create trigger tasks_prevent_user_id_change before update on personal_os.tasks for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists ideas_prevent_user_id_change on personal_os.ideas;
create trigger ideas_prevent_user_id_change before update on personal_os.ideas for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists routines_prevent_user_id_change on personal_os.routines;
create trigger routines_prevent_user_id_change before update on personal_os.routines for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists decisions_prevent_user_id_change on personal_os.decisions;
create trigger decisions_prevent_user_id_change before update on personal_os.decisions for each row execute function personal_os_private.prevent_user_id_change();
drop trigger if exists routes_prevent_created_by_change on personal_os.routes;
create trigger routes_prevent_created_by_change before update on personal_os.routes for each row execute function personal_os_private.prevent_created_by_change();
drop trigger if exists route_steps_prevent_created_by_change on personal_os.route_steps;
create trigger route_steps_prevent_created_by_change before update on personal_os.route_steps for each row execute function personal_os_private.prevent_created_by_change();
drop trigger if exists workspaces_prevent_owner_change on personal_os.workspaces;
create trigger workspaces_prevent_owner_change before update on personal_os.workspaces for each row execute function personal_os_private.prevent_workspace_owner_change();
drop trigger if exists workspace_members_protect_personal_owner on personal_os.workspace_members;
create trigger workspace_members_protect_personal_owner before update or delete on personal_os.workspace_members for each row execute function personal_os_private.protect_personal_owner_membership();

-- RLS em todo o domínio Personal OS.
alter table personal_os.profiles enable row level security;
alter table personal_os.workspaces enable row level security;
alter table personal_os.workspace_members enable row level security;
alter table personal_os.areas enable row level security;
alter table personal_os.goals enable row level security;
alter table personal_os.routes enable row level security;
alter table personal_os.route_steps enable row level security;
alter table personal_os.projects enable row level security;
alter table personal_os.tasks enable row level security;
alter table personal_os.ideas enable row level security;
alter table personal_os.routines enable row level security;
alter table personal_os.check_ins enable row level security;
alter table personal_os.events enable row level security;
alter table personal_os.decisions enable row level security;
alter table personal_os.activity_log enable row level security;
alter table personal_os.platform_admins enable row level security;

create policy profiles_select_self on personal_os.profiles for select to authenticated using(id=(select auth.uid()));
create policy profiles_update_self on personal_os.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

create policy workspaces_select_member on personal_os.workspaces for select to authenticated using(owner_user_id=(select auth.uid()) or personal_os_private.is_workspace_member(id));
create policy workspaces_insert_owner on personal_os.workspaces for insert to authenticated with check(owner_user_id=(select auth.uid()));
create policy workspaces_update_admin on personal_os.workspaces for update to authenticated using(owner_user_id=(select auth.uid()) or personal_os_private.has_workspace_role(id,array['owner','admin'])) with check(owner_user_id=(select auth.uid()) or personal_os_private.has_workspace_role(id,array['owner','admin']));

create policy workspace_members_select_related on personal_os.workspace_members for select to authenticated using(user_id=(select auth.uid()) or personal_os_private.is_workspace_member(workspace_id));
create policy workspace_members_insert_admin on personal_os.workspace_members for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin']) or exists(select 1 from personal_os.workspaces w where w.id=workspace_id and w.owner_user_id=(select auth.uid())));
create policy workspace_members_update_admin on personal_os.workspace_members for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin']) or exists(select 1 from personal_os.workspaces w where w.id=workspace_id and w.owner_user_id=(select auth.uid()))) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin']) or exists(select 1 from personal_os.workspaces w where w.id=workspace_id and w.owner_user_id=(select auth.uid())));

create policy areas_select_member on personal_os.areas for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy areas_insert_writer on personal_os.areas for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy areas_update_writer on personal_os.areas for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy goals_select_member on personal_os.goals for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy goals_insert_writer on personal_os.goals for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy goals_update_writer on personal_os.goals for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy routes_select_member on personal_os.routes for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy routes_insert_writer on personal_os.routes for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and created_by=(select auth.uid()));
create policy routes_update_writer on personal_os.routes for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy route_steps_select_member on personal_os.route_steps for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy route_steps_insert_writer on personal_os.route_steps for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and created_by=(select auth.uid()));
create policy route_steps_update_writer on personal_os.route_steps for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy projects_select_member on personal_os.projects for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy projects_insert_writer on personal_os.projects for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy projects_update_writer on personal_os.projects for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy tasks_select_member on personal_os.tasks for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy tasks_insert_writer on personal_os.tasks for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy tasks_update_writer on personal_os.tasks for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy ideas_select_member on personal_os.ideas for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy ideas_insert_writer on personal_os.ideas for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy ideas_update_writer on personal_os.ideas for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy routines_select_member on personal_os.routines for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy routines_insert_writer on personal_os.routines for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy routines_update_writer on personal_os.routines for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy check_ins_select_member on personal_os.check_ins for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy check_ins_insert_writer on personal_os.check_ins for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));

create policy events_select_member on personal_os.events for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy events_insert_writer on personal_os.events for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));

create policy decisions_select_member on personal_os.decisions for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy decisions_insert_writer on personal_os.decisions for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and user_id=(select auth.uid()));
create policy decisions_update_writer on personal_os.decisions for update to authenticated using(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member'])) with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']));

create policy activity_log_select_member on personal_os.activity_log for select to authenticated using(personal_os_private.is_workspace_member(workspace_id));
create policy activity_log_insert_writer on personal_os.activity_log for insert to authenticated with check(personal_os_private.has_workspace_role(workspace_id,array['owner','admin','member']) and (actor_user_id is null or actor_user_id=(select auth.uid())));

create policy platform_admins_select_self on personal_os.platform_admins for select to authenticated using(user_id=(select auth.uid()));

-- Privilégios: o Data API só expõe personal_os para usuários autenticados.
revoke all on all tables in schema personal_os from anon;
grant select,insert,update,delete on all tables in schema personal_os to authenticated;
grant all on all tables in schema personal_os to service_role;
revoke insert,update,delete on personal_os.platform_admins from authenticated;

-- O owner atual da Croma torna-se administrador inicial do Personal OS, sem hardcode de UUID.
insert into personal_os.platform_admins(user_id,created_by)
select p.id,p.id from public.profiles p
where p.role='owner' and p.ativo=true
on conflict(user_id) do nothing;

-- Exposição do schema no PostgREST preservando public e graphql_public.
-- Este override passa a ser a fonte de verdade da lista de schemas expostos.
alter role authenticator set pgrst.db_schemas = 'public,graphql_public,personal_os';
notify pgrst, 'reload config';
