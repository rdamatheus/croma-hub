create index if not exists production_simulations_created_by_idx
  on public.production_simulations(created_by);

create index if not exists production_simulations_updated_by_idx
  on public.production_simulations(updated_by);

create index if not exists production_simulation_versions_created_by_idx
  on public.production_simulation_versions(created_by);
