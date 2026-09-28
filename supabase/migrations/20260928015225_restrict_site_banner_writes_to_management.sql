drop policy if exists site_banners_staff_all on public.site_banners;

drop policy if exists site_banners_staff_read on public.site_banners;
create policy site_banners_staff_read on public.site_banners
  for select to authenticated
  using ((select app_private.is_staff()));

drop policy if exists site_banners_management_write on public.site_banners;
create policy site_banners_management_write on public.site_banners
  for all to authenticated
  using ((select app_private.is_manager()))
  with check ((select app_private.is_manager()));
