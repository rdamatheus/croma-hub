create index if not exists sales_proposals_created_by_idx on public.sales_proposals(created_by);
create index if not exists sales_proposal_items_supplier_id_idx on public.sales_proposal_items(supplier_id);
create index if not exists sales_proposal_items_supplier_catalog_item_id_idx on public.sales_proposal_items(supplier_catalog_item_id);
