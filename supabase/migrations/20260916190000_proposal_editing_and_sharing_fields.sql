alter table public.sales_proposal_items
  add column if not exists final_offer_price numeric,
  add column if not exists image_url text,
  add column if not exists share_description text;

comment on column public.sales_proposal_items.final_offer_price is 'Preço final decidido para encaminhamento ao cliente; independente do preço por markup e do preço sugerido.';
comment on column public.sales_proposal_items.image_url is 'Snapshot da imagem usada na proposta/compartilhamento.';
comment on column public.sales_proposal_items.share_description is 'Descrição comercial curta usada na mensagem e no card da proposta.';

update public.sales_proposal_items
set final_offer_price = coalesce(suggested_price, line_total)
where final_offer_price is null;

update public.sales_proposal_items spi
set image_url = (
  select pm.url
  from public.product_media pm
  where pm.product_id = spi.product_id
    and pm.ativo = true
    and pm.kind = 'image'
  order by pm.is_primary desc, pm.ordem asc
  limit 1
)
where spi.image_url is null;

update public.sales_proposal_items
set share_description = description
where share_description is null;

alter table public.sales_proposal_items
  add constraint sales_proposal_items_final_offer_price_nonnegative
  check (final_offer_price is null or final_offer_price >= 0) not valid;
alter table public.sales_proposal_items validate constraint sales_proposal_items_final_offer_price_nonnegative;
