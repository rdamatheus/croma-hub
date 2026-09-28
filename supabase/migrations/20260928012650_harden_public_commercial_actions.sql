drop view if exists public.public_product_commercial_actions;

create table if not exists public.site_product_commercial_modes (
  product_id uuid primary key references public.products(id) on delete cascade,
  mode text not null,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_product_commercial_modes_mode_check check (mode = any(array['buy'::text,'configure'::text,'quote'::text])),
  constraint site_product_commercial_modes_source_check check (source = any(array['manual'::text,'auto'::text]))
);

insert into public.site_product_commercial_modes(product_id,mode,source)
select p.id,'configure','auto'
from public.products p
where p.product_type='produto'
  and p.ativo=true
  and (
    p.product_format='variation'
    or exists(select 1 from public.products ch where ch.parent_product_id=p.id and ch.ativo=true)
    or exists(select 1 from public.product_variants pv where pv.product_id=p.id and pv.ativo=true)
    or exists(select 1 from public.product_option_groups pog where pog.product_id=p.id)
  )
on conflict(product_id) do nothing;

insert into public.site_product_commercial_modes(product_id,mode,source)
select p.id,p.public_commercial_mode,'manual'
from public.products p
where p.public_commercial_mode is not null
on conflict(product_id) do update set mode=excluded.mode,source='manual',updated_at=now();

alter table public.products drop constraint if exists products_public_commercial_mode_check;
alter table public.products drop column if exists public_commercial_mode;

alter table public.site_product_commercial_modes enable row level security;

drop policy if exists site_product_commercial_modes_public_read on public.site_product_commercial_modes;
create policy site_product_commercial_modes_public_read on public.site_product_commercial_modes
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.public_catalog_products pc
      where pc.id=product_id
    )
  );

drop policy if exists site_product_commercial_modes_staff_all on public.site_product_commercial_modes;
create policy site_product_commercial_modes_staff_all on public.site_product_commercial_modes
  for all to authenticated
  using ((select app_private.is_staff()))
  with check ((select app_private.is_staff()));

revoke all on public.site_product_commercial_modes from public;
grant select on public.site_product_commercial_modes to anon, authenticated;
grant insert,update,delete on public.site_product_commercial_modes to authenticated;

create or replace view public.public_product_commercial_actions
with (security_invoker = true, security_barrier = true)
as
select
  pc.id as product_id,
  case
    when pc.product_type='servico' then 'quote'::text
    when m.mode='quote' then 'quote'::text
    when m.mode='configure' then 'configure'::text
    when m.mode='buy' and coalesce(pc.preco,0)>0 then 'buy'::text
    when coalesce(pc.preco,0)<=0 then 'quote'::text
    else 'buy'::text
  end as commercial_action
from public.public_catalog_products pc
left join public.site_product_commercial_modes m on m.product_id=pc.id;

comment on view public.public_product_commercial_actions is
'CTA público seguro: serviços e itens sem preço solicitam orçamento; produtos configuráveis podem receber override; demais produtos com preço usam compra direta.';

revoke all on public.public_product_commercial_actions from public;
grant select on public.public_product_commercial_actions to anon, authenticated;