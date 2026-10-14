-- Minimal pre-existing lab contract, based on read-only production metadata.
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create schema app_private;
grant usage on schema public,auth,app_private to anon,authenticated,service_role;
-- Exercise projects that automatically grant new exposed tables to API roles.
alter default privileges in schema public grant select,insert,update,delete on tables to anon,authenticated,service_role;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.profiles(id uuid primary key,nome text,role text not null,ativo boolean not null default true);
create function app_private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and ativo and role in ('owner','manager','equipe'))
$$;
create function app_private.is_manager() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=auth.uid() and ativo and role in ('owner','manager'))
$$;
alter table public.profiles enable row level security;
create policy profiles_staff_read on public.profiles for select to authenticated using(app_private.is_staff());
create policy profiles_own_read on public.profiles for select to authenticated using(id=auth.uid());
create table public.lab_whatsapp_atendimentos(
  id uuid primary key default gen_random_uuid(),created_by uuid not null references public.profiles(id),
  contact_name text not null default 'Contato sem nome',contact_phone text,source text not null default 'whatsapp_exportador',
  extracted_at timestamptz,message_count integer not null default 0 check(message_count>=0),
  status text not null default 'novo' check(status in ('novo','em_analise','concluido','arquivado')),
  raw_chat jsonb not null default '{}',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  analysis jsonb,summary text,suggested_reply text,analyzed_at timestamptz
);
create table public.lab_whatsapp_mensagens(
  id uuid primary key default gen_random_uuid(),atendimento_id uuid not null references public.lab_whatsapp_atendimentos(id) on delete cascade,
  external_message_id text,sequence integer not null default 0,message_date text,message_time text,author text,
  direction text not null default 'indefinida' check(direction in ('enviada','recebida','indefinida')),
  body text,quoted_text text,media_types text,file_names text,duration text,reactions text,delivery_status text,
  raw_data jsonb not null default '{}',created_at timestamptz not null default now()
);
create unique index lab_whatsapp_mensagens_external_id_unique on public.lab_whatsapp_mensagens(atendimento_id,external_message_id)
  where external_message_id is not null and external_message_id<>'';
create table public.lab_whatsapp_anexos(
  id uuid primary key default gen_random_uuid(),atendimento_id uuid not null references public.lab_whatsapp_atendimentos(id) on delete cascade,
  created_by uuid not null references public.profiles(id),storage_path text not null
);
grant all on public.profiles,public.lab_whatsapp_atendimentos,public.lab_whatsapp_mensagens,public.lab_whatsapp_anexos to service_role;
grant select,insert,update,delete on public.lab_whatsapp_atendimentos,public.lab_whatsapp_mensagens,public.lab_whatsapp_anexos to authenticated;
alter table public.lab_whatsapp_atendimentos enable row level security;
alter table public.lab_whatsapp_mensagens enable row level security;
alter table public.lab_whatsapp_anexos enable row level security;
create policy lab_whatsapp_atendimentos_staff_select on public.lab_whatsapp_atendimentos for select to authenticated using(app_private.is_staff());
create policy lab_whatsapp_atendimentos_staff_insert on public.lab_whatsapp_atendimentos for insert to authenticated with check(app_private.is_staff() and created_by=auth.uid());
create policy lab_whatsapp_atendimentos_owner_update on public.lab_whatsapp_atendimentos for update to authenticated using(created_by=auth.uid() or app_private.is_manager()) with check(created_by=auth.uid() or app_private.is_manager());
create policy lab_whatsapp_atendimentos_owner_delete on public.lab_whatsapp_atendimentos for delete to authenticated using(created_by=auth.uid() or app_private.is_manager());
create policy lab_whatsapp_mensagens_staff_select on public.lab_whatsapp_mensagens for select to authenticated using(app_private.is_staff());
create policy lab_whatsapp_mensagens_creator_insert on public.lab_whatsapp_mensagens for insert to authenticated with check(app_private.is_staff() and exists(select 1 from public.lab_whatsapp_atendimentos a where a.id=atendimento_id and a.created_by=auth.uid()));

insert into public.profiles(id,nome,role,ativo) values
  ('10000000-0000-4000-8000-000000000001','Creator','equipe',true),
  ('10000000-0000-4000-8000-000000000002','Other staff','equipe',true),
  ('10000000-0000-4000-8000-000000000003','Manager','manager',true),
  ('10000000-0000-4000-8000-000000000004','Inactive','equipe',false);
insert into public.lab_whatsapp_atendimentos(id,created_by,contact_name,message_count,analysis,summary)
  values('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Legacy fictitious test',1,'{"resumo":"Legacy result"}','Legacy result');
insert into public.lab_whatsapp_mensagens(id,atendimento_id,body) values
  ('50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Original text');
