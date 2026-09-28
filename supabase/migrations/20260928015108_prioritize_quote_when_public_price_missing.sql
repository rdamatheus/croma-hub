create or replace view public.public_product_commercial_actions
with (security_invoker = true, security_barrier = true)
as
select
  pc.id as product_id,
  case
    when pc.product_type='servico' then 'quote'::text
    when m.mode='quote' then 'quote'::text
    when coalesce(pc.preco,0)<=0 then 'quote'::text
    when m.mode='configure' then 'configure'::text
    when m.mode='buy' then 'buy'::text
    else 'buy'::text
  end as commercial_action
from public.public_catalog_products pc
left join public.site_product_commercial_modes m on m.product_id=pc.id;

comment on view public.public_product_commercial_actions is
'CTA público seguro: serviços e itens sem preço público solicitam orçamento; itens configuráveis só configuram quando têm preço público válido; demais produtos usam compra direta.';

revoke all on public.public_product_commercial_actions from public;
grant select on public.public_product_commercial_actions to anon, authenticated;
