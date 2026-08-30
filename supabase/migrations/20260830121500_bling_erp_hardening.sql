create index if not exists erp_connections_connected_by_idx
  on public.erp_connections(connected_by);
create index if not exists erp_oauth_states_created_by_idx
  on public.erp_oauth_states(created_by);
create index if not exists erp_sync_jobs_requested_by_idx
  on public.erp_sync_jobs(requested_by);
create index if not exists erp_sync_conflicts_mapping_idx
  on public.erp_sync_conflicts(mapping_id);
create index if not exists erp_sync_conflicts_resolved_by_idx
  on public.erp_sync_conflicts(resolved_by);

drop policy if exists erp_oauth_states_no_client_access on public.erp_oauth_states;
create policy erp_oauth_states_no_client_access on public.erp_oauth_states
  for all to authenticated using (false) with check (false);

drop policy if exists erp_private_tokens_no_client_access on public.erp_private_tokens;
create policy erp_private_tokens_no_client_access on public.erp_private_tokens
  for all to authenticated using (false) with check (false);
