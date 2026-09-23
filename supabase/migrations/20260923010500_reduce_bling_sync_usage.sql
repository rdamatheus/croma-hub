-- Harden Bling synchronization to reduce Supabase egress and repeated scans.
-- Crons remain intentionally disabled until the new Edge Functions are validated in production.

create or replace function public.taxonomy_sync_candidates(p_limit integer default 90)
returns table(
  id uuid,
  bling_product_id bigint,
  bling_parent_id bigint,
  catalog_category_id uuid,
  metadata jsonb
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.bling_product_id, p.bling_parent_id, p.catalog_category_id, p.metadata
  from public.products p
  where p.bling_product_id is not null
    and p.catalog_category_id is not null
    and coalesce(p.metadata->>'taxonomy_sync_status','pending') not in ('synced','blocked','waiting_baseline')
    and (
      coalesce(p.metadata->>'taxonomy_sync_status','pending') <> 'error'
      or nullif(p.metadata->>'taxonomy_next_retry_at','') is null
      or (p.metadata->>'taxonomy_next_retry_at')::timestamptz <= now()
    )
  order by coalesce((p.metadata->>'taxonomy_sync_error_at')::timestamptz, p.updated_at, p.created_at)
  limit greatest(1, least(coalesce(p_limit,90),145));
$$;

create or replace function public.taxonomy_sync_metrics()
returns table(
  products bigint,
  synced_products bigint,
  blocked_products bigint,
  waiting_products bigint,
  pending_products bigint,
  error_products bigint
)
language sql
security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    count(*) filter (where p.metadata->>'taxonomy_sync_status'='synced')::bigint,
    count(*) filter (where p.metadata->>'taxonomy_sync_status'='blocked')::bigint,
    count(*) filter (where p.metadata->>'taxonomy_sync_status'='waiting_baseline')::bigint,
    count(*) filter (
      where coalesce(p.metadata->>'taxonomy_sync_status','pending') not in ('synced','blocked','waiting_baseline')
    )::bigint,
    count(*) filter (where p.metadata->>'taxonomy_sync_status'='error')::bigint
  from public.products p
  where p.bling_product_id is not null
    and p.catalog_category_id is not null;
$$;

revoke all on function public.taxonomy_sync_candidates(integer) from public, anon, authenticated;
revoke all on function public.taxonomy_sync_metrics() from public, anon, authenticated;
grant execute on function public.taxonomy_sync_candidates(integer) to service_role;
grant execute on function public.taxonomy_sync_metrics() to service_role;

update public.erp_connections
set config = jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(config,'{}'::jsonb),'{products_auto_sync_interval_minutes}','1440'::jsonb,true),
                '{services_auto_sync_interval_minutes}','1440'::jsonb,true
              ),
              '{contacts_sync_interval_minutes}','1440'::jsonb,true
            ),
    updated_at = now()
where provider='bling';

do $$
declare
  j record;
begin
  for j in
    select jobid, command
    from cron.job
    where command ilike '%bling-product-auto-sync%'
       or command ilike '%bling-service-auto-sync%'
       or command ilike '%bling-contact-sync%'
       or command ilike '%bling-taxonomy-sync%'
  loop
    if j.command ilike '%bling-product-auto-sync%' then
      perform cron.alter_job(j.jobid, schedule := '0 */6 * * *', active := false);
    elsif j.command ilike '%bling-service-auto-sync%' then
      perform cron.alter_job(j.jobid, schedule := '10 */6 * * *', active := false);
    elsif j.command ilike '%bling-contact-sync%' then
      perform cron.alter_job(j.jobid, schedule := '20 */6 * * *', active := false);
    elsif j.command ilike '%bling-taxonomy-sync%' then
      perform cron.alter_job(j.jobid, schedule := '30 */6 * * *', active := false);
    end if;
  end loop;
end $$;
