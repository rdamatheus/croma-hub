alter table public.products add column if not exists default_markup numeric(10,4);

create table if not exists public.sales_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_no bigint generated always as identity unique,
  customer_id uuid references public.customer_profiles(id) on delete set null,
  customer_name text not null,
  customer_phone text,
  status text not null default 'draft' check (status in ('draft','sent','approved','rejected','expired','cancelled')),
  notes text,
  valid_until date,
  currency text not null default 'BRL',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales_proposal_items (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.sales_proposals(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_catalog_item_id uuid references public.supplier_catalog_items(id) on delete set null,
  description text not null,
  option_label text,
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit text not null default 'un',
  supplier_sku text,
  base_cost numeric(12,2) not null default 0,
  freight_cost numeric(12,2) not null default 0,
  total_cost numeric(12,2) not null default 0,
  recommended_markup numeric(10,4),
  applied_markup numeric(10,4),
  unit_price numeric(12,4) not null default 0,
  line_total numeric(12,2) not null default 0,
  sort_order integer not null default 0,
  is_selected boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sales_proposals_customer_id_idx on public.sales_proposals(customer_id);
create index if not exists sales_proposals_created_at_idx on public.sales_proposals(created_at desc);
create index if not exists sales_proposal_items_proposal_id_idx on public.sales_proposal_items(proposal_id, sort_order);
create index if not exists sales_proposal_items_product_id_idx on public.sales_proposal_items(product_id);

alter table public.sales_proposals enable row level security;
alter table public.sales_proposal_items enable row level security;

drop policy if exists sales_proposals_manager_all on public.sales_proposals;
create policy sales_proposals_manager_all on public.sales_proposals
for all using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

drop policy if exists sales_proposal_items_manager_all on public.sales_proposal_items;
create policy sales_proposal_items_manager_all on public.sales_proposal_items
for all using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

drop trigger if exists trg_sales_proposals_updated_at on public.sales_proposals;
create trigger trg_sales_proposals_updated_at before update on public.sales_proposals
for each row execute function public.set_updated_at();

comment on table public.sales_proposals is 'Propostas comerciais do Croma Hub. O cliente pode ser identificado inicialmente apenas por nome e telefone e vinculado posteriormente ao cadastro.';
comment on table public.sales_proposal_items is 'Itens e opções de uma proposta, preservando snapshot de custos, frete, markup e preço no momento da cotação.';
comment on column public.products.default_markup is 'Markup comercial padrão recomendado para o produto; não substitui o markup registrado em cada proposta.';
