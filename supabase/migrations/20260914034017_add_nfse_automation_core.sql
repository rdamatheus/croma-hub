create table if not exists public.fiscal_service_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  nome text not null,
  descricao text,
  codigo_tributacao_nacional text not null,
  codigo_tributacao_municipal text,
  nbs text,
  indicador_operacao text,
  natureza_operacao text not null default '1',
  aliquota_iss numeric(7,4),
  reter_iss boolean not null default false,
  descontar_iss boolean not null default false,
  calcular_iss boolean not null default true,
  ativo boolean not null default true,
  padrao boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fiscal_service_profiles_codigo_nacional_check check (length(trim(codigo_tributacao_nacional)) > 0),
  constraint fiscal_service_profiles_aliquota_check check (aliquota_iss is null or (aliquota_iss >= 0 and aliquota_iss <= 100))
);

create unique index if not exists fiscal_service_profiles_single_default_idx
  on public.fiscal_service_profiles ((1))
  where padrao = true and ativo = true;

create table if not exists public.nfse_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete restrict,
  fiscal_profile_id uuid not null references public.fiscal_service_profiles(id) on delete restrict,
  source_order_id uuid references public.orders(id) on delete set null,
  bling_contact_id bigint,
  bling_nfse_id bigint unique,
  status text not null default 'draft',
  valor_servico numeric(14,2) not null,
  descricao text not null,
  serie text not null default '1',
  numero_nfse text,
  numero_rps text,
  codigo_verificacao text,
  link_nfse text,
  link_pdf text,
  request_snapshot jsonb not null default '{}'::jsonb,
  response_snapshot jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  authorized_at timestamptz,
  last_synced_at timestamptz,
  constraint nfse_documents_status_check check (status in ('draft','validated','created_bling','sending','authorized','rejected','cancelled')),
  constraint nfse_documents_valor_check check (valor_servico > 0),
  constraint nfse_documents_descricao_check check (length(trim(descricao)) between 1 and 1600)
);

create index if not exists nfse_documents_status_idx on public.nfse_documents(status, created_at desc);
create index if not exists nfse_documents_customer_idx on public.nfse_documents(customer_id, created_at desc);
create index if not exists nfse_documents_source_order_idx on public.nfse_documents(source_order_id) where source_order_id is not null;

create table if not exists public.nfse_events (
  id uuid primary key default gen_random_uuid(),
  nfse_document_id uuid not null references public.nfse_documents(id) on delete cascade,
  event_type text not null,
  actor_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nfse_events_document_idx on public.nfse_events(nfse_document_id, created_at asc);

alter table public.fiscal_service_profiles enable row level security;
alter table public.nfse_documents enable row level security;
alter table public.nfse_events enable row level security;

drop policy if exists fiscal_service_profiles_owner_all on public.fiscal_service_profiles;
create policy fiscal_service_profiles_owner_all
  on public.fiscal_service_profiles
  for all
  to authenticated
  using ((select app_private.is_owner()))
  with check ((select app_private.is_owner()));

drop policy if exists nfse_documents_owner_all on public.nfse_documents;
create policy nfse_documents_owner_all
  on public.nfse_documents
  for all
  to authenticated
  using ((select app_private.is_owner()))
  with check ((select app_private.is_owner()));

drop policy if exists nfse_events_owner_read on public.nfse_events;
create policy nfse_events_owner_read
  on public.nfse_events
  for select
  to authenticated
  using ((select app_private.is_owner()));

drop trigger if exists fiscal_service_profiles_set_updated_at on public.fiscal_service_profiles;
create trigger fiscal_service_profiles_set_updated_at
  before update on public.fiscal_service_profiles
  for each row execute function public.set_updated_at();

drop trigger if exists nfse_documents_set_updated_at on public.nfse_documents;
create trigger nfse_documents_set_updated_at
  before update on public.nfse_documents
  for each row execute function public.set_updated_at();

insert into public.fiscal_service_profiles (
  code, nome, descricao,
  codigo_tributacao_nacional, codigo_tributacao_municipal, nbs, indicador_operacao,
  natureza_operacao, aliquota_iss, reter_iss, descontar_iss, calcular_iss,
  ativo, padrao, metadata
) values (
  'impressao',
  'Impressão',
  'Perfil fiscal inicial validado operacionalmente para serviços de impressão no Ambiente Nacional.',
  '13.05.01',
  '002',
  '121012100',
  '100301',
  '1',
  2.0100,
  false,
  false,
  true,
  true,
  true,
  jsonb_build_object(
    'source', 'manual_validation',
    'validated_at', '2026-09-14',
    'provisional', true,
    'notes', 'Primeiro perfil operacional. Revisar enquadramentos adicionais antes de cadastrar outros serviços.'
  )
)
on conflict (code) do update set
  nome = excluded.nome,
  descricao = excluded.descricao,
  codigo_tributacao_nacional = excluded.codigo_tributacao_nacional,
  codigo_tributacao_municipal = excluded.codigo_tributacao_municipal,
  nbs = excluded.nbs,
  indicador_operacao = excluded.indicador_operacao,
  natureza_operacao = excluded.natureza_operacao,
  aliquota_iss = excluded.aliquota_iss,
  reter_iss = excluded.reter_iss,
  descontar_iss = excluded.descontar_iss,
  calcular_iss = excluded.calcular_iss,
  ativo = excluded.ativo,
  padrao = excluded.padrao,
  metadata = excluded.metadata,
  updated_at = now();
