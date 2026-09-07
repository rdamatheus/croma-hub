-- Croma Hub: normalização do espelho de produtos do Bling
-- Mantém products como identidade e cria projeções normalizadas para variações, saldo e campos customizados.

-- 1) Origem operacional em português.
alter table public.product_details drop constraint if exists product_details_production_mode_check;
update public.product_details
set production_mode = case production_mode
  when 'propria' then 'producao_interna'
  when 'terceiros' then 'terceirizado'
  else production_mode
end
where production_mode in ('propria','terceiros');
alter table public.product_details
  add constraint product_details_production_mode_check
  check (production_mode is null or production_mode = any (array[
    'producao_interna'::text,
    'terceirizado'::text,
    'revenda'::text,
    'misto'::text
  ]));

-- 2) product_variants passa a ser também uma projeção rastreável dos filhos reais do Bling.
alter table public.product_variants
  add column if not exists child_product_id uuid references public.products(id) on delete cascade,
  add column if not exists source text not null default 'croma',
  add column if not exists external_product_id bigint,
  add column if not exists external_parent_id bigint,
  add column if not exists variation_order integer;

create unique index if not exists product_variants_child_product_uidx
  on public.product_variants(child_product_id)
  where child_product_id is not null;
create index if not exists product_variants_external_product_idx
  on public.product_variants(external_product_id)
  where external_product_id is not null;
create index if not exists product_variants_parent_external_idx
  on public.product_variants(external_parent_id)
  where external_parent_id is not null;

-- 3) Snapshot de estoque externo. Não grava saldo atual como movimento artificial.
create table if not exists public.product_stock_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source text not null default 'bling',
  physical_stock numeric,
  reserved_stock numeric,
  available_stock numeric,
  virtual_stock numeric,
  minimum_stock numeric,
  maximum_stock numeric,
  storage_location text,
  crossdocking numeric,
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_stock_snapshots_source_check check (char_length(trim(source)) > 0),
  constraint product_stock_snapshots_product_source_key unique(product_id, source)
);
create index if not exists product_stock_snapshots_available_idx on public.product_stock_snapshots(available_stock);
create index if not exists product_stock_snapshots_synced_idx on public.product_stock_snapshots(synced_at desc);

alter table public.product_stock_snapshots enable row level security;
drop policy if exists product_stock_snapshots_staff_read on public.product_stock_snapshots;
create policy product_stock_snapshots_staff_read on public.product_stock_snapshots
  for select to authenticated
  using ((select app_private.is_staff()));
drop policy if exists product_stock_snapshots_manager_all on public.product_stock_snapshots;
create policy product_stock_snapshots_manager_all on public.product_stock_snapshots
  for all to authenticated
  using ((select app_private.is_manager()))
  with check ((select app_private.is_manager()));

-- 4) Campos personalizados do Bling em estrutura consultável, mantendo o raw original.
create table if not exists public.product_custom_field_values (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source text not null default 'bling',
  external_field_id text not null,
  external_link_id text,
  item text,
  value jsonb,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists product_custom_field_values_external_uidx
  on public.product_custom_field_values(product_id, source, external_field_id, coalesce(external_link_id,''));
create index if not exists product_custom_field_values_product_idx
  on public.product_custom_field_values(product_id);

alter table public.product_custom_field_values enable row level security;
drop policy if exists product_custom_field_values_staff_read on public.product_custom_field_values;
create policy product_custom_field_values_staff_read on public.product_custom_field_values
  for select to authenticated
  using ((select app_private.is_staff()));
drop policy if exists product_custom_field_values_manager_all on public.product_custom_field_values;
create policy product_custom_field_values_manager_all on public.product_custom_field_values
  for all to authenticated
  using ((select app_private.is_manager()))
  with check ((select app_private.is_manager()));

-- 5) Índices para filtros e reconciliação, sem alterar a taxonomia.
create index if not exists products_parent_product_idx on public.products(parent_product_id) where parent_product_id is not null;
create index if not exists products_bling_parent_idx on public.products(bling_parent_id) where bling_parent_id is not null;
create index if not exists products_catalog_category_idx on public.products(catalog_category_id);
create index if not exists product_details_brand_idx on public.product_details(brand) where brand is not null;
create index if not exists product_details_gtin_idx on public.product_details(gtin) where gtin is not null;
create index if not exists product_details_ncm_idx on public.product_details(ncm) where ncm is not null;
create index if not exists product_details_production_mode_idx on public.product_details(production_mode) where production_mode is not null;
