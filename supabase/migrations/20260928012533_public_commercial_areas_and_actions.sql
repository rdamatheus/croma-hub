create table if not exists public.site_commercial_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  menu_label text not null,
  description text,
  public_path text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  featured_home boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_commercial_areas_slug_check check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint site_commercial_areas_path_check check (public_path ~ '^/.*')
);

create table if not exists public.site_area_families (
  area_id uuid not null references public.site_commercial_areas(id) on delete cascade,
  family_id uuid not null references public.catalog_families(id) on delete cascade,
  display_order integer not null default 0,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (area_id, family_id)
);

create index if not exists site_area_families_family_idx on public.site_area_families(family_id);
create index if not exists site_area_families_order_idx on public.site_area_families(area_id, display_order);

alter table public.products
  add column if not exists public_commercial_mode text;

alter table public.products
  drop constraint if exists products_public_commercial_mode_check;
alter table public.products
  add constraint products_public_commercial_mode_check
  check (public_commercial_mode is null or public_commercial_mode = any(array['buy'::text,'configure'::text,'quote'::text]));

comment on column public.products.public_commercial_mode is
'Override opcional do comportamento comercial público. NULL usa regra automática; buy=Comprar, configure=Configurar e comprar, quote=Solicitar orçamento. Serviços permanecem sempre em orçamento.';

insert into public.site_commercial_areas(slug,name,menu_label,description,public_path,sort_order,active,featured_home)
values
  ('grafica-papelaria','Gráfica & Papelaria','Gráfica & Papelaria','Impressos, papelaria, personalizados, fotografia e materiais criativos.','/grafica-papelaria/',10,true,true),
  ('comunicacao-marketing','Comunicação & Marketing','Comunicação & Marketing','Comunicação visual, identidade, design, marketing, brindes e soluções digitais.','/comunicacao-marketing/',20,true,true),
  ('presentes-eletronicos','Presentes & Eletrônicos','Presentes & Eletrônicos','Presentes, eletrônicos, brinquedos, utilidades e itens criativos.','/presentes-eletronicos/',30,true,true)
on conflict(slug) do update set
  name=excluded.name,
  menu_label=excluded.menu_label,
  description=excluded.description,
  public_path=excluded.public_path,
  sort_order=excluded.sort_order,
  active=excluded.active,
  featured_home=excluded.featured_home,
  updated_at=now();

with mapping(area_slug,family_slug,display_order,is_primary) as (
  values
    ('grafica-papelaria','solucoes-impressas',10,true),
    ('grafica-papelaria','papelaria-personalizada',20,true),
    ('grafica-papelaria','papelaria-e-escritorio',30,true),
    ('grafica-papelaria','artes-e-criatividade',40,true),
    ('grafica-papelaria','fotografia',50,true),
    ('comunicacao-marketing','comunicacao-visual',10,true),
    ('comunicacao-marketing','identidade-visual',20,true),
    ('comunicacao-marketing','brindes',30,true),
    ('presentes-eletronicos','tecnologia-e-eletronicos',10,true),
    ('presentes-eletronicos','presentes-e-decoracao',20,true),
    ('presentes-eletronicos','presentes',30,true),
    ('presentes-eletronicos','brindes',40,false),
    ('presentes-eletronicos','artes-e-criatividade',50,false)
)
insert into public.site_area_families(area_id,family_id,display_order,is_primary)
select a.id,f.id,m.display_order,m.is_primary
from mapping m
join public.site_commercial_areas a on a.slug=m.area_slug
join public.catalog_families f on f.slug=m.family_slug
on conflict(area_id,family_id) do update set
  display_order=excluded.display_order,
  is_primary=excluded.is_primary;

create or replace view public.public_product_commercial_actions
with (security_barrier = true)
as
select
  pc.id as product_id,
  case
    when pc.product_type = 'servico' then 'quote'::text
    when p.public_commercial_mode = 'quote' then 'quote'::text
    when p.public_commercial_mode = 'configure' then 'configure'::text
    when p.public_commercial_mode = 'buy' and coalesce(pc.preco,0) > 0 then 'buy'::text
    when coalesce(pc.preco,0) <= 0 then 'quote'::text
    when p.product_format = 'variation' then 'configure'::text
    when exists(select 1 from public.products ch where ch.parent_product_id=p.id and ch.ativo=true and ch.is_sellable=true) then 'configure'::text
    when exists(select 1 from public.product_variants pv where pv.product_id=p.id and pv.ativo=true) then 'configure'::text
    when exists(select 1 from public.product_option_groups pog where pog.product_id=p.id) then 'configure'::text
    else 'buy'::text
  end as commercial_action
from public.public_catalog_products pc
join public.products p on p.id=pc.id;

comment on view public.public_product_commercial_actions is
'Comportamento comercial público derivado sem expor estoque, custos, fornecedores ou metadados internos.';

alter table public.site_commercial_areas enable row level security;
alter table public.site_area_families enable row level security;

drop policy if exists site_commercial_areas_public_read on public.site_commercial_areas;
create policy site_commercial_areas_public_read on public.site_commercial_areas
  for select to anon, authenticated
  using (active = true);

drop policy if exists site_commercial_areas_staff_all on public.site_commercial_areas;
create policy site_commercial_areas_staff_all on public.site_commercial_areas
  for all to authenticated
  using ((select app_private.is_staff()))
  with check ((select app_private.is_staff()));

drop policy if exists site_area_families_public_read on public.site_area_families;
create policy site_area_families_public_read on public.site_area_families
  for select to anon, authenticated
  using (
    exists(select 1 from public.site_commercial_areas a where a.id=area_id and a.active=true)
    and exists(select 1 from public.catalog_families f where f.id=family_id and f.ativo=true)
  );

drop policy if exists site_area_families_staff_all on public.site_area_families;
create policy site_area_families_staff_all on public.site_area_families
  for all to authenticated
  using ((select app_private.is_staff()))
  with check ((select app_private.is_staff()));

revoke all on public.site_commercial_areas from public;
revoke all on public.site_area_families from public;
grant select on public.site_commercial_areas to anon, authenticated;
grant select on public.site_area_families to anon, authenticated;
grant insert, update, delete on public.site_commercial_areas to authenticated;
grant insert, update, delete on public.site_area_families to authenticated;

revoke all on public.public_product_commercial_actions from public;
grant select on public.public_product_commercial_actions to anon, authenticated;