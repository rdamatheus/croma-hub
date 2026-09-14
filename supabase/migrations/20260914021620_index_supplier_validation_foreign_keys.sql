create index if not exists supplier_catalog_items_validation_reviewed_by_idx
  on public.supplier_catalog_items(validation_reviewed_by)
  where validation_reviewed_by is not null;

create index if not exists supplier_catalog_validation_events_actor_idx
  on public.supplier_catalog_validation_events(actor_id)
  where actor_id is not null;