create or replace function public.croma_supplier_safe_cost(
  p_purchase_price numeric,
  p_list_price numeric,
  p_policy text
)
returns numeric
language sql
immutable
set search_path to 'public','pg_temp'
as $$
  select case
    when coalesce(p_policy,'list')='list' then coalesce(p_list_price,p_purchase_price)
    else p_purchase_price
  end
$$;

drop policy if exists product_composition_settings_manager_all on public.product_composition_settings;
drop policy if exists product_composition_settings_manager_insert on public.product_composition_settings;
drop policy if exists product_composition_settings_manager_update on public.product_composition_settings;
drop policy if exists product_composition_settings_manager_delete on public.product_composition_settings;
create policy product_composition_settings_manager_insert on public.product_composition_settings
  for insert to authenticated with check ((select app_private.is_manager()));
create policy product_composition_settings_manager_update on public.product_composition_settings
  for update to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
create policy product_composition_settings_manager_delete on public.product_composition_settings
  for delete to authenticated using ((select app_private.is_manager()));

drop policy if exists product_cost_adjustments_manager_all on public.product_cost_adjustments;
drop policy if exists product_cost_adjustments_manager_insert on public.product_cost_adjustments;
drop policy if exists product_cost_adjustments_manager_update on public.product_cost_adjustments;
drop policy if exists product_cost_adjustments_manager_delete on public.product_cost_adjustments;
create policy product_cost_adjustments_manager_insert on public.product_cost_adjustments
  for insert to authenticated with check ((select app_private.is_manager()));
create policy product_cost_adjustments_manager_update on public.product_cost_adjustments
  for update to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));
create policy product_cost_adjustments_manager_delete on public.product_cost_adjustments
  for delete to authenticated using ((select app_private.is_manager()));

revoke all on function public.croma_normalize_bling_product_details(uuid) from public, anon, authenticated;
revoke all on function public.croma_normalize_bling_product_operational(uuid) from public, anon, authenticated;
revoke all on function public.croma_normalize_bling_product_scoped(uuid) from public, anon, authenticated;
revoke all on function public.croma_normalize_bling_supplier_snapshot(uuid) from public, anon, authenticated;
revoke all on function public.croma_product_components_after_change() from public, anon, authenticated;
revoke all on function public.croma_product_composition_settings_after_change() from public, anon, authenticated;
revoke all on function public.croma_product_cost_adjustments_after_change() from public, anon, authenticated;
revoke all on function public.croma_product_cost_cascade() from public, anon, authenticated;
revoke all on function public.croma_products_bling_normalize_trigger() from public, anon, authenticated;
revoke all on function public.croma_mark_composition_dirty(uuid) from public, anon, authenticated;
revoke all on function public.croma_refresh_product_cost(uuid) from public, anon, authenticated;

grant execute on function public.croma_normalize_bling_product_details(uuid) to service_role;
grant execute on function public.croma_normalize_bling_product_operational(uuid) to service_role;
grant execute on function public.croma_normalize_bling_product_scoped(uuid) to service_role;
grant execute on function public.croma_normalize_bling_supplier_snapshot(uuid) to service_role;
grant execute on function public.croma_mark_composition_dirty(uuid) to service_role;
grant execute on function public.croma_refresh_product_cost(uuid) to service_role;
