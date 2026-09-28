create table if not exists public.site_banners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  placement text not null default 'home_hero',
  eyebrow text,
  title text not null,
  subtitle text,
  image_desktop_url text,
  image_mobile_url text,
  cta_label text,
  target_type text not null default 'page',
  target_ref text,
  target_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  display_order integer not null default 0,
  active boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_banners_placement_check check (placement = any(array['home_hero'::text,'home_promo'::text,'area_hero'::text])),
  constraint site_banners_target_type_check check (target_type = any(array['product'::text,'family'::text,'category'::text,'segment'::text,'campaign'::text,'page'::text,'external'::text])),
  constraint site_banners_period_check check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint site_banners_target_check check (target_url is null or target_url ~ '^(https?://|/).*')
);

create index if not exists site_banners_public_schedule_idx on public.site_banners(placement,active,starts_at,ends_at,display_order);

alter table public.site_banners enable row level security;

drop policy if exists site_banners_public_read on public.site_banners;
create policy site_banners_public_read on public.site_banners
  for select to anon, authenticated
  using (
    active=true
    and (starts_at is null or starts_at<=now())
    and (ends_at is null or ends_at>now())
  );

drop policy if exists site_banners_staff_all on public.site_banners;
create policy site_banners_staff_all on public.site_banners
  for all to authenticated
  using ((select app_private.is_staff()))
  with check ((select app_private.is_staff()));

revoke all on public.site_banners from public;
grant select on public.site_banners to anon, authenticated;
grant insert,update,delete on public.site_banners to authenticated;

comment on table public.site_banners is 'Banners e chamadas comerciais da vitrine pública. A primeira versão usa target_type/ref para organização e target_url como destino efetivo.';
