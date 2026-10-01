-- Croma Hub — configurador de panfletos Zap
-- Reaproveita o produto pai PANFLETOS COUCHÊ e vincula cada combinação ativa
-- do catálogo da Zap a uma variação comercial determinística.

begin;

update public.products
set default_markup = 2.5,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'panfleto_configurator', jsonb_build_object(
        'enabled', true,
        'supplier_id', '3fee83e7-8b01-46cc-8b00-01f9e9268e3e',
        'supplier_name', 'Zap Gráfica',
        'supplier_category', 'PANFLETOS, FLYERS E FOLHETOS',
        'default_markup', 2.5,
        'order_freight', 18.00,
        'pricing_formula', '(supplier_purchase_price + order_freight) * default_markup',
        'finish_classifier_version', 1,
        'synced_at', now()
      )
    ),
    updated_at = now()
where id = 'e63f590f-df39-4450-bcfd-8beaf781e119';

insert into public.product_option_groups (product_id, code, nome, selection_type, required, ordem, ativo)
values
  ('e63f590f-df39-4450-bcfd-8beaf781e119', 'tamanho', 'Tamanho', 'single', true, 1, true),
  ('e63f590f-df39-4450-bcfd-8beaf781e119', 'papel', 'Papel', 'single', true, 2, true),
  ('e63f590f-df39-4450-bcfd-8beaf781e119', 'impressao', 'Impressão', 'single', true, 3, true),
  ('e63f590f-df39-4450-bcfd-8beaf781e119', 'acabamento', 'Acabamento', 'single', true, 4, true),
  ('e63f590f-df39-4450-bcfd-8beaf781e119', 'quantidade', 'Quantidade', 'single', true, 5, true)
on conflict (product_id, code) do update
set nome = excluded.nome,
    selection_type = excluded.selection_type,
    required = excluded.required,
    ordem = excluded.ordem,
    ativo = excluded.ativo;

create temporary table tmp_zap_panfletos as
select
  sci.id as catalog_item_id,
  sci.sku,
  sci.name as source_paper,
  sci.description,
  sci.purchase_price,
  sci.minimum_order_quantity,
  sci.lead_time_days,
  sci.source_url,
  sci.last_synced_at,
  sci.attributes->>'sourceSize' as size_raw,
  'tam_' || regexp_replace(lower(sci.attributes->>'sourceSize'), '[^0-9]+', 'x', 'g') as size_code,
  lower(sci.attributes->>'printMode') as print_code,
  case
    when sci.sku ~* '^PFV' then 'verniz_localizado_fv'
    when sci.sku ~* 'UV' or sci.sku ~* '^PB700' then 'verniz_total_fv'
    else 'sem_acabamento_especial'
  end as finish_code,
  case replace(upper(sci.name), 'Ê', 'E')
    when 'APERGAMINHADO - 75G' then 'apergaminhado_75g'
    when 'APERGAMINHADO - 90G' then 'apergaminhado_90g'
    when 'APERGAMINHADO - 150G' then 'apergaminhado_150g'
    when 'APERGAMINHADO - 180G' then 'apergaminhado_180g'
    when 'APERGAMINHADO - 240G' then 'apergaminhado_240g'
    when 'COUCHE BRILHO - 90G' then 'couche_brilho_90g'
    when 'COUCHE BRILHO - 115G' then 'couche_brilho_115g'
    when 'COUCHE BRILHO - 150G' then 'couche_brilho_150g'
    when 'COUCHE BRILHO - 210G' then 'couche_brilho_210g'
    when 'COUCHE BRILHO - 250G' then 'couche_brilho_250g'
    when 'COUCHE FOSCO - 70G' then 'couche_fosco_70g'
    when 'COUCHE FOSCO - 170G' then 'couche_fosco_170g'
    when 'RECICLATO - 240G' then 'reciclato_240g'
    when 'RECICLATO DIGITAL - 90G' then 'reciclato_digital_90g'
    when 'RECICLATO DIGITAL - 240G' then 'reciclato_digital_240g'
    when 'SULFITE - 75G' then 'sulfite_75g'
    when 'SULFITE - 90G' then 'sulfite_90g'
    when 'SUPREMO - 250G' then 'supremo_250g'
    when 'SUPREMO DIGITAL - 255G' then 'supremo_digital_255g'
    else 'papel_' || substr(md5(sci.name), 1, 10)
  end as paper_code,
  case replace(upper(sci.name), 'Ê', 'E')
    when 'APERGAMINHADO - 75G' then 'Apergaminhado 75g'
    when 'APERGAMINHADO - 90G' then 'Apergaminhado 90g'
    when 'APERGAMINHADO - 150G' then 'Apergaminhado 150g'
    when 'APERGAMINHADO - 180G' then 'Apergaminhado 180g'
    when 'APERGAMINHADO - 240G' then 'Apergaminhado 240g'
    when 'COUCHE BRILHO - 90G' then 'Couchê brilho 90g'
    when 'COUCHE BRILHO - 115G' then 'Couchê brilho 115g'
    when 'COUCHE BRILHO - 150G' then 'Couchê brilho 150g'
    when 'COUCHE BRILHO - 210G' then 'Couchê brilho 210g'
    when 'COUCHE BRILHO - 250G' then 'Couchê brilho 250g'
    when 'COUCHE FOSCO - 70G' then 'Couchê fosco 70g'
    when 'COUCHE FOSCO - 170G' then 'Couchê fosco 170g'
    when 'RECICLATO - 240G' then 'Reciclato 240g'
    when 'RECICLATO DIGITAL - 90G' then 'Reciclato digital 90g'
    when 'RECICLATO DIGITAL - 240G' then 'Reciclato digital 240g'
    when 'SULFITE - 75G' then 'Sulfite 75g'
    when 'SULFITE - 90G' then 'Sulfite 90g'
    when 'SUPREMO - 250G' then 'Supremo 250g'
    when 'SUPREMO DIGITAL - 255G' then 'Supremo digital 255g'
    else sci.name
  end as paper_label
from public.supplier_catalog_items sci
where sci.supplier_id = '3fee83e7-8b01-46cc-8b00-01f9e9268e3e'
  and sci.category = 'PANFLETOS, FLYERS E FOLHETOS'
  and sci.active = true;

with size_opts as (
  select distinct size_code, size_raw from tmp_zap_panfletos
), paper_opts as (
  select distinct paper_code, paper_label from tmp_zap_panfletos
), print_opts as (
  select distinct print_code from tmp_zap_panfletos
), finish_opts as (
  select distinct finish_code from tmp_zap_panfletos
), qty_opts as (
  select distinct minimum_order_quantity::int as qty from tmp_zap_panfletos
), options as (
  select 'tamanho' as group_code, size_code as code,
         replace(size_raw, ' x ', ' × ') || ' mm' as nome,
         row_number() over(order by split_part(size_raw, ' x ', 1)::int, split_part(size_raw, ' x ', 2)::int)::int as ordem,
         jsonb_build_object('source_size', size_raw) as metadata
  from size_opts
  union all
  select 'papel', paper_code, paper_label,
         row_number() over(order by paper_label)::int,
         jsonb_build_object('canonical_label', paper_label)
  from paper_opts
  union all
  select 'impressao', print_code,
         case print_code
           when '1x0' then 'Preto frente (1x0)'
           when '1x1' then 'Preto frente e verso (1x1)'
           when '4x0' then 'Colorido frente (4x0)'
           when '4x1' then 'Colorido frente / preto verso (4x1)'
           when '4x4' then 'Colorido frente e verso (4x4)'
           else upper(print_code)
         end,
         case print_code when '1x0' then 1 when '1x1' then 2 when '4x0' then 3 when '4x1' then 4 when '4x4' then 5 else 99 end,
         jsonb_build_object('source_print_mode', upper(print_code))
  from print_opts
  union all
  select 'acabamento', finish_code,
         case finish_code
           when 'sem_acabamento_especial' then 'Sem acabamento especial'
           when 'verniz_total_fv' then 'Verniz UV total frente e verso'
           when 'verniz_localizado_fv' then 'Verniz localizado frente e verso'
           else finish_code
         end,
         case finish_code when 'sem_acabamento_especial' then 1 when 'verniz_total_fv' then 2 when 'verniz_localizado_fv' then 3 else 99 end,
         jsonb_build_object('finish_code', finish_code)
  from finish_opts
  union all
  select 'quantidade', qty::text, qty::text || ' un.',
         row_number() over(order by qty)::int,
         jsonb_build_object('quantity', qty)
  from qty_opts
)
insert into public.product_options (group_id, code, nome, price_delta, ordem, ativo, metadata)
select g.id, o.code, o.nome, 0, o.ordem, true, o.metadata
from public.product_option_groups g
join options o on o.group_code = g.code
where g.product_id = 'e63f590f-df39-4450-bcfd-8beaf781e119'
on conflict (group_id, code) do update
set nome = excluded.nome,
    price_delta = excluded.price_delta,
    ordem = excluded.ordem,
    ativo = true,
    metadata = excluded.metadata;

insert into public.product_variants (product_id, sku, code, nome, option_values, base_price, ativo, updated_at)
select
  'e63f590f-df39-4450-bcfd-8beaf781e119',
  s.sku,
  'zap_' || lower(regexp_replace(s.sku, '[^A-Za-z0-9]+', '_', 'g')),
  replace(s.size_raw, ' x ', ' × ') || ' mm · ' || s.paper_label || ' · ' || upper(s.print_code) || ' · ' ||
  case s.finish_code
    when 'sem_acabamento_especial' then 'Sem acabamento especial'
    when 'verniz_total_fv' then 'Verniz UV total F/V'
    when 'verniz_localizado_fv' then 'Verniz localizado F/V'
    else s.finish_code
  end || ' · ' || s.minimum_order_quantity::int || ' un.',
  jsonb_build_object(
    'tamanho', s.size_code,
    'papel', s.paper_code,
    'impressao', s.print_code,
    'acabamento', s.finish_code,
    'quantidade', s.minimum_order_quantity::int::text
  ),
  round((s.purchase_price + 18.00) * 2.5, 2),
  true,
  now()
from tmp_zap_panfletos s
on conflict (product_id, code) do update
set sku = excluded.sku,
    nome = excluded.nome,
    option_values = excluded.option_values,
    base_price = excluded.base_price,
    ativo = true,
    updated_at = now();

update public.product_suppliers ps
set supplier_sku = s.sku,
    purchase_unit = 'lote',
    conversion_factor = 1,
    purchase_price = s.purchase_price,
    freight_cost = 0,
    tax_cost = 0,
    other_cost = 0,
    minimum_order_quantity = s.minimum_order_quantity,
    lead_time_days = s.lead_time_days,
    preferred = true,
    active = true,
    last_quote_at = coalesce(s.last_synced_at, now()),
    updated_at = now(),
    supplier_product_description = s.description,
    supplier_catalog_item_id = s.catalog_item_id,
    purchase_channel = 'online',
    purchase_url = s.source_url
from public.product_variants pv
join tmp_zap_panfletos s on s.sku = pv.sku
where ps.product_id = 'e63f590f-df39-4450-bcfd-8beaf781e119'
  and ps.variant_id = pv.id
  and ps.supplier_id = '3fee83e7-8b01-46cc-8b00-01f9e9268e3e';

insert into public.product_suppliers (
  product_id, variant_id, supplier_id, supplier_sku, purchase_unit, conversion_factor,
  purchase_price, freight_cost, tax_cost, other_cost, minimum_order_quantity, lead_time_days,
  preferred, active, last_quote_at, supplier_product_description, supplier_catalog_item_id,
  purchase_channel, purchase_url
)
select
  'e63f590f-df39-4450-bcfd-8beaf781e119', pv.id, '3fee83e7-8b01-46cc-8b00-01f9e9268e3e',
  s.sku, 'lote', 1, s.purchase_price, 0, 0, 0, s.minimum_order_quantity, s.lead_time_days,
  true, true, coalesce(s.last_synced_at, now()), s.description, s.catalog_item_id, 'online', s.source_url
from public.product_variants pv
join tmp_zap_panfletos s on s.sku = pv.sku
where pv.product_id = 'e63f590f-df39-4450-bcfd-8beaf781e119'
  and not exists (
    select 1
    from public.product_suppliers ps
    where ps.product_id = pv.product_id
      and ps.variant_id = pv.id
      and ps.supplier_id = '3fee83e7-8b01-46cc-8b00-01f9e9268e3e'
  );

drop table tmp_zap_panfletos;
commit;
