create index if not exists order_stock_reservations_order_idx
  on public.order_stock_reservations(order_id);

create index if not exists order_stock_reservations_variant_idx
  on public.order_stock_reservations(variant_id)
  where variant_id is not null;

create index if not exists site_banners_created_by_idx
  on public.site_banners(created_by)
  where created_by is not null;

create index if not exists site_banners_updated_by_idx
  on public.site_banners(updated_by)
  where updated_by is not null;
