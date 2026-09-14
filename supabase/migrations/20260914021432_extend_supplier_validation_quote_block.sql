create or replace view public.public_catalog_products with (security_barrier=true) as
select
  p.id,
  p.nome,
  p.sku,
  p.slug,
  p.descricao,
  p.short_description,
  (case when coalesce(sv.blocked,false) then null else p.preco end)::numeric(12,2) as preco,
  p.catalog_category_id,
  p.product_type,
  p.ativo,
  p.published_on_site,
  p.is_sellable,
  p.is_input,
  jsonb_strip_nulls(jsonb_build_object(
    'icone',p.metadata->'icone',
    'imagem',p.metadata->'imagem',
    'image_url',p.metadata->'image_url',
    'imagem_principal',p.metadata->'imagem_principal',
    'destaques',p.metadata->'destaques',
    'quantidadePreco',p.metadata->'quantidadePreco',
    'home_featured',p.metadata->'home_featured',
    'featured_home',p.metadata->'featured_home',
    'home_order',p.metadata->'home_order',
    'featured_order',p.metadata->'featured_order'
  )) as metadata,
  case when p.product_type='servico' then coalesce(cs.child_count,0) else 0 end as child_count,
  case
    when coalesce(sv.blocked,false) then null
    when p.product_type='servico' and coalesce(cs.child_count,0)>0 then cs.min_child_price
    when p.preco>0 then p.preco
    else null
  end as commercial_min_price
from public.products p
join public.catalog_categories c on c.id=p.catalog_category_id
left join lateral (
  select (
    exists(
      select 1
      from public.product_suppliers ps
      join public.supplier_catalog_items sci
        on sci.supplier_id=ps.supplier_id
       and sci.active=true
       and (
         sci.id=ps.supplier_catalog_item_id
         or (
           ps.supplier_catalog_item_id is null
           and ps.supplier_sku is not null
           and upper(btrim(sci.sku))=upper(btrim(ps.supplier_sku))
         )
       )
      where ps.product_id=p.id
        and ps.variant_id is null
        and ps.active=true
        and ps.preferred=true
        and (sci.validation_status<>'ok' or coalesce(sci.purchase_price,0)<=0)
    )
    or exists(
      select 1
      from public.product_supplier_external_snapshots snap
      join public.supplier_catalog_items sci
        on sci.active=true
       and upper(btrim(sci.sku))=upper(btrim(snap.supplier_code))
      join public.suppliers s
        on s.id=sci.supplier_id
       and s.active=true
      join public.customer_profiles cp
        on cp.id=s.contact_id
      where snap.product_id=p.id
        and snap.source='bling'
        and snap.supplier_code is not null
        and (
          cp.bling_contact_id::text=snap.external_contact_id
          or exists(
            select 1
            from public.erp_entity_mappings m
            where m.provider='bling'
              and m.entity_type='customer'
              and m.local_id=cp.id
              and m.external_id=snap.external_contact_id
          )
        )
        and (sci.validation_status<>'ok' or coalesce(sci.purchase_price,0)<=0)
    )
  ) as blocked
) sv on true
left join lateral (
  select
    count(*)::integer as child_count,
    min(ch.preco) filter (
      where ch.preco>0
        and not exists(
          select 1
          from public.product_suppliers cps
          join public.supplier_catalog_items csci
            on csci.supplier_id=cps.supplier_id
           and csci.active=true
           and (
             csci.id=cps.supplier_catalog_item_id
             or (
               cps.supplier_catalog_item_id is null
               and cps.supplier_sku is not null
               and upper(btrim(csci.sku))=upper(btrim(cps.supplier_sku))
             )
           )
          where cps.product_id=ch.id
            and cps.variant_id is null
            and cps.active=true
            and cps.preferred=true
            and (csci.validation_status<>'ok' or coalesce(csci.purchase_price,0)<=0)
        )
        and not exists(
          select 1
          from public.product_supplier_external_snapshots csnap
          join public.supplier_catalog_items csci
            on csci.active=true
           and upper(btrim(csci.sku))=upper(btrim(csnap.supplier_code))
          join public.suppliers cs
            on cs.id=csci.supplier_id
           and cs.active=true
          join public.customer_profiles ccp
            on ccp.id=cs.contact_id
          where csnap.product_id=ch.id
            and csnap.source='bling'
            and csnap.supplier_code is not null
            and (
              ccp.bling_contact_id::text=csnap.external_contact_id
              or exists(
                select 1
                from public.erp_entity_mappings cm
                where cm.provider='bling'
                  and cm.entity_type='customer'
                  and cm.local_id=ccp.id
                  and cm.external_id=csnap.external_contact_id
              )
            )
            and (csci.validation_status<>'ok' or coalesce(csci.purchase_price,0)<=0)
        )
    ) as min_child_price
  from public.products ch
  where ch.parent_product_id=p.id
    and ch.product_type='servico'
    and ch.ativo=true
    and ch.is_sellable=true
    and ch.is_input=false
) cs on true
where p.ativo=true
  and p.is_sellable=true
  and p.is_input=false
  and c.ativo=true
  and c.public_visible=true
  and (
    p.product_type='produto'
    or (p.product_type='servico' and p.published_on_site=true)
  );