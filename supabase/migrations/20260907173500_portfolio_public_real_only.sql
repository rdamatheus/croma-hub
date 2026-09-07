drop policy if exists portfolio_items_public_read on public.portfolio_items;

create policy portfolio_items_public_read
on public.portfolio_items
for select to public
using (active = true and is_reference = false);
