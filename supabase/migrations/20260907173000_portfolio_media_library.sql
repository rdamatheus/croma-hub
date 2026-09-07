create table if not exists public.portfolio_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'google_drive',
  source_name text not null,
  source_file_id text,
  source_url text,
  source_size_bytes bigint,
  status text not null default 'pending' check (status in ('pending','processing','blocked','completed','failed')),
  total_files integer not null default 0,
  imported_files integer not null default 0,
  skipped_files integer not null default 0,
  failed_files integer not null default 0,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_media (
  id uuid primary key default gen_random_uuid(),
  portfolio_item_id uuid references public.portfolio_items(id) on delete set null,
  import_batch_id uuid references public.portfolio_import_batches(id) on delete set null,
  original_filename text not null,
  source_relative_path text,
  source_file_id text,
  storage_bucket text not null default 'product-media',
  storage_path text,
  public_url text,
  mime_type text,
  byte_size bigint,
  sha256 text,
  width integer,
  height integer,
  image_alt text,
  image_source_type text not null default 'propria',
  status text not null default 'pending' check (status in ('pending','linked','ignored','error')),
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint portfolio_media_storage_location check (
    storage_path is not null or public_url is not null or status in ('pending','error','ignored')
  )
);

create unique index if not exists portfolio_media_storage_path_uidx
  on public.portfolio_media(storage_bucket, storage_path)
  where storage_path is not null;
create index if not exists portfolio_media_item_idx
  on public.portfolio_media(portfolio_item_id, sort_order, created_at);
create index if not exists portfolio_media_status_idx
  on public.portfolio_media(status, created_at);
create index if not exists portfolio_media_batch_idx
  on public.portfolio_media(import_batch_id, created_at);
create index if not exists portfolio_media_sha256_idx
  on public.portfolio_media(sha256)
  where sha256 is not null;

alter table public.portfolio_import_batches enable row level security;
alter table public.portfolio_media enable row level security;

drop policy if exists portfolio_import_batches_staff_write on public.portfolio_import_batches;
create policy portfolio_import_batches_staff_write
on public.portfolio_import_batches
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
);

drop policy if exists portfolio_media_public_read on public.portfolio_media;
create policy portfolio_media_public_read
on public.portfolio_media
for select to public
using (
  active = true
  and status = 'linked'
  and exists (
    select 1 from public.portfolio_items pi
    where pi.id = portfolio_media.portfolio_item_id
      and pi.active = true
      and pi.is_reference = false
  )
);

drop policy if exists portfolio_media_staff_write on public.portfolio_media;
create policy portfolio_media_staff_write
on public.portfolio_media
for all to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
)
with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
);

drop trigger if exists portfolio_import_batches_set_updated_at on public.portfolio_import_batches;
create trigger portfolio_import_batches_set_updated_at
before update on public.portfolio_import_batches
for each row execute function public.set_updated_at();

drop trigger if exists portfolio_media_set_updated_at on public.portfolio_media;
create trigger portfolio_media_set_updated_at
before update on public.portfolio_media
for each row execute function public.set_updated_at();

grant select on public.portfolio_media to anon, authenticated;
grant select, insert, update, delete on public.portfolio_import_batches to authenticated;
grant insert, update, delete on public.portfolio_media to authenticated;
