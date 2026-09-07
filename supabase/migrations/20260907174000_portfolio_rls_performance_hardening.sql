create index if not exists portfolio_items_category_idx on public.portfolio_items(category_id) where category_id is not null;
create index if not exists portfolio_items_segment_idx on public.portfolio_items(segment_id) where segment_id is not null;

drop policy if exists portfolio_items_public_read on public.portfolio_items;
drop policy if exists portfolio_items_staff_write on public.portfolio_items;
create policy portfolio_items_read
on public.portfolio_items
for select to anon, authenticated
using (
  (active = true and is_reference = false)
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
);
create policy portfolio_items_staff_insert
on public.portfolio_items
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_items_staff_update
on public.portfolio_items
for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_items_staff_delete
on public.portfolio_items
for delete to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));

drop policy if exists portfolio_media_public_read on public.portfolio_media;
drop policy if exists portfolio_media_staff_write on public.portfolio_media;
create policy portfolio_media_read
on public.portfolio_media
for select to anon, authenticated
using (
  (active = true and status = 'linked' and exists (
    select 1 from public.portfolio_items pi
    where pi.id = portfolio_media.portfolio_item_id
      and pi.active = true
      and pi.is_reference = false
  ))
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.ativo = true
      and p.role = any(array['owner'::text,'manager'::text])
  )
);
create policy portfolio_media_staff_insert
on public.portfolio_media
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_media_staff_update
on public.portfolio_media
for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_media_staff_delete
on public.portfolio_media
for delete to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));

drop policy if exists portfolio_import_batches_staff_write on public.portfolio_import_batches;
create policy portfolio_import_batches_staff_read
on public.portfolio_import_batches
for select to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_import_batches_staff_insert
on public.portfolio_import_batches
for insert to authenticated
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_import_batches_staff_update
on public.portfolio_import_batches
for update to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])))
with check (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
create policy portfolio_import_batches_staff_delete
on public.portfolio_import_batches
for delete to authenticated
using (exists (select 1 from public.profiles p where p.id=(select auth.uid()) and p.ativo=true and p.role=any(array['owner'::text,'manager'::text])));
