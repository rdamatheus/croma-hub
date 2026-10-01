create extension if not exists pg_trgm with schema extensions;

create index if not exists products_public_catalog_nome_trgm_idx
  on public.products using gin (nome extensions.gin_trgm_ops)
  where ativo = true and is_sellable = true and is_input = false;

create index if not exists products_public_catalog_sku_trgm_idx
  on public.products using gin (sku extensions.gin_trgm_ops)
  where ativo = true and is_sellable = true and is_input = false and sku is not null;

create index if not exists products_public_catalog_short_description_trgm_idx
  on public.products using gin (short_description extensions.gin_trgm_ops)
  where ativo = true and is_sellable = true and is_input = false and short_description is not null;

create index if not exists supplier_catalog_items_active_norm_sku_idx
  on public.supplier_catalog_items (upper(btrim(sku)))
  where active = true and sku is not null;

create index if not exists product_supplier_external_snapshots_bling_code_idx
  on public.product_supplier_external_snapshots (product_id, supplier_code, external_contact_id)
  where source = 'bling' and supplier_code is not null;

CREATE OR REPLACE FUNCTION public.public_catalog_products_fast(p_scope text DEFAULT NULL::text, p_category_ids uuid[] DEFAULT NULL::uuid[], p_search text DEFAULT NULL::text, p_require_published boolean DEFAULT NULL::boolean, p_limit integer DEFAULT 60, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, nome text, sku text, slug text, descricao text, short_description text, preco numeric, catalog_category_id uuid, product_type text, ativo boolean, published_on_site boolean, is_sellable boolean, is_input boolean, metadata jsonb, child_count integer, commercial_min_price numeric, total_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with params as (
  select
    nullif(btrim(regexp_replace(coalesce(p_search, ''), '[,%()]', ' ', 'g')), '') as q,
    greatest(1, least(100, coalesce(p_limit, 60))) as lim,
    greatest(0, coalesce(p_offset, 0)) as off
),
filtered as materialized (
  select p.id, p.nome
  from products p
  join catalog_categories c on c.id = p.catalog_category_id
  cross join params
  where p.ativo = true
    and p.is_sellable = true
    and p.is_input = false
    and c.ativo = true
    and c.public_visible = true
    and (p.product_type = 'produto' or (p.product_type = 'servico' and p.published_on_site = true))
    and (p_scope is null or p.product_type = p_scope)
    and (coalesce(p_require_published, false) = false or p.published_on_site = true)
    and (p_category_ids is null or cardinality(p_category_ids) = 0 or p.catalog_category_id = any(p_category_ids))
    and (
      params.q is null
      or p.nome ilike ('%' || params.q || '%')
      or p.sku ilike ('%' || params.q || '%')
      or p.short_description ilike ('%' || params.q || '%')
    )
),
paged as materialized (
  select filtered.id
  from filtered
  cross join params
  order by filtered.nome, filtered.id
  limit (select lim from params)
  offset (select off from params)
),
total as (
  select count(*)::bigint as value from filtered
)
select
  p.id,
  p.nome,
  p.sku,
  p.slug,
  p.descricao,
  p.short_description,
  (
    case
      when coalesce(sv.blocked, false) then null::numeric
      else p.preco
    end
  )::numeric(12,2) as preco,
  p.catalog_category_id,
  p.product_type,
  p.ativo,
  p.published_on_site,
  p.is_sellable,
  p.is_input,
  jsonb_strip_nulls(jsonb_build_object(
    'icone', p.metadata -> 'icone',
    'imagem', p.metadata -> 'imagem',
    'image_url', p.metadata -> 'image_url',
    'imagem_principal', p.metadata -> 'imagem_principal',
    'destaques', p.metadata -> 'destaques',
    'quantidadePreco', p.metadata -> 'quantidadePreco',
    'home_featured', p.metadata -> 'home_featured',
    'featured_home', p.metadata -> 'featured_home',
    'home_order', p.metadata -> 'home_order',
    'featured_order', p.metadata -> 'featured_order'
  )) as metadata,
  case when p.product_type = 'servico' then coalesce(cs.child_count, 0) else 0 end as child_count,
  case
    when coalesce(sv.blocked, false) then null::numeric
    when p.product_type = 'servico' and coalesce(cs.child_count, 0) > 0 then cs.min_child_price
    when p.preco > 0 then p.preco
    else null::numeric
  end as commercial_min_price,
  total.value as total_count
from paged
join products p on p.id = paged.id
cross join total
left join lateral (
  select (
    exists (
      select 1
      from product_suppliers ps
      join supplier_catalog_items sci on (
        sci.supplier_id = ps.supplier_id
        and sci.active = true
        and (
          sci.id = ps.supplier_catalog_item_id
          or (
            ps.supplier_catalog_item_id is null
            and ps.supplier_sku is not null
            and upper(btrim(sci.sku)) = upper(btrim(ps.supplier_sku))
          )
        )
      )
      where ps.product_id = p.id
        and ps.variant_id is null
        and ps.active = true
        and ps.preferred = true
        and (sci.validation_status <> 'ok' or coalesce(sci.purchase_price, 0) <= 0)
    )
    or exists (
      select 1
      from product_supplier_external_snapshots snap
      join supplier_catalog_items sci on (
        sci.active = true
        and upper(btrim(sci.sku)) = upper(btrim(snap.supplier_code))
      )
      join suppliers s on s.id = sci.supplier_id and s.active = true
      join customer_profiles cp on cp.id = s.contact_id
      where snap.product_id = p.id
        and snap.source = 'bling'
        and snap.supplier_code is not null
        and (
          cp.bling_contact_id::text = snap.external_contact_id
          or exists (
            select 1
            from erp_entity_mappings m
            where m.provider = 'bling'
              and m.entity_type = 'customer'
              and m.local_id = cp.id
              and m.external_id = snap.external_contact_id
          )
        )
        and (sci.validation_status <> 'ok' or coalesce(sci.purchase_price, 0) <= 0)
    )
  ) as blocked
) sv on true
left join lateral (
  select
    count(*)::integer as child_count,
    min(ch.preco) filter (
      where ch.preco > 0
        and not exists (
          select 1
          from product_suppliers cps
          join supplier_catalog_items csci on (
            csci.supplier_id = cps.supplier_id
            and csci.active = true
            and (
              csci.id = cps.supplier_catalog_item_id
              or (
                cps.supplier_catalog_item_id is null
                and cps.supplier_sku is not null
                and upper(btrim(csci.sku)) = upper(btrim(cps.supplier_sku))
              )
            )
          )
          where cps.product_id = ch.id
            and cps.variant_id is null
            and cps.active = true
            and cps.preferred = true
            and (csci.validation_status <> 'ok' or coalesce(csci.purchase_price, 0) <= 0)
        )
        and not exists (
          select 1
          from product_supplier_external_snapshots csnap
          join supplier_catalog_items csci on (
            csci.active = true
            and upper(btrim(csci.sku)) = upper(btrim(csnap.supplier_code))
          )
          join suppliers cs_1 on cs_1.id = csci.supplier_id and cs_1.active = true
          join customer_profiles ccp on ccp.id = cs_1.contact_id
          where csnap.product_id = ch.id
            and csnap.source = 'bling'
            and csnap.supplier_code is not null
            and (
              ccp.bling_contact_id::text = csnap.external_contact_id
              or exists (
                select 1
                from erp_entity_mappings cm
                where cm.provider = 'bling'
                  and cm.entity_type = 'customer'
                  and cm.local_id = ccp.id
                  and cm.external_id = csnap.external_contact_id
              )
            )
            and (csci.validation_status <> 'ok' or coalesce(csci.purchase_price, 0) <= 0)
        )
    ) as min_child_price
  from products ch
  where ch.parent_product_id = p.id
    and ch.product_type = 'servico'
    and ch.ativo = true
    and ch.is_sellable = true
    and ch.is_input = false
) cs on true
order by p.nome, p.id;
$function$
;

revoke all on function public.public_catalog_products_fast(text, uuid[], text, boolean, integer, integer) from public;
grant execute on function public.public_catalog_products_fast(text, uuid[], text, boolean, integer, integer) to anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_product_commercial_actions_fast(p_product_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(product_id uuid, commercial_action text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
with ids as (
  select distinct unnest(coalesce(p_product_ids, array[]::uuid[])) as id
),
visible_products as materialized (
  select p.id, p.product_type, p.preco
  from ids
  join products p on p.id = ids.id
  join catalog_categories c on c.id = p.catalog_category_id
  where p.ativo = true
    and p.is_sellable = true
    and p.is_input = false
    and c.ativo = true
    and c.public_visible = true
    and (p.product_type = 'produto' or (p.product_type = 'servico' and p.published_on_site = true))
)
select
  p.id as product_id,
  case
    when p.product_type = 'servico' then 'quote'
    when m.mode = 'quote' then 'quote'
    when coalesce(case when coalesce(sv.blocked, false) then null::numeric else p.preco end, 0) <= 0 then 'quote'
    when m.mode = 'configure' then 'configure'
    when m.mode = 'buy' then 'buy'
    else 'buy'
  end as commercial_action
from visible_products p
left join site_product_commercial_modes m on m.product_id = p.id
left join lateral (
  select (
    exists (
      select 1
      from product_suppliers ps
      join supplier_catalog_items sci on (
        sci.supplier_id = ps.supplier_id
        and sci.active = true
        and (
          sci.id = ps.supplier_catalog_item_id
          or (
            ps.supplier_catalog_item_id is null
            and ps.supplier_sku is not null
            and upper(btrim(sci.sku)) = upper(btrim(ps.supplier_sku))
          )
        )
      )
      where ps.product_id = p.id
        and ps.variant_id is null
        and ps.active = true
        and ps.preferred = true
        and (sci.validation_status <> 'ok' or coalesce(sci.purchase_price, 0) <= 0)
    )
    or exists (
      select 1
      from product_supplier_external_snapshots snap
      join supplier_catalog_items sci on (
        sci.active = true
        and upper(btrim(sci.sku)) = upper(btrim(snap.supplier_code))
      )
      join suppliers s on s.id = sci.supplier_id and s.active = true
      join customer_profiles cp on cp.id = s.contact_id
      where snap.product_id = p.id
        and snap.source = 'bling'
        and snap.supplier_code is not null
        and (
          cp.bling_contact_id::text = snap.external_contact_id
          or exists (
            select 1
            from erp_entity_mappings m2
            where m2.provider = 'bling'
              and m2.entity_type = 'customer'
              and m2.local_id = cp.id
              and m2.external_id = snap.external_contact_id
          )
        )
        and (sci.validation_status <> 'ok' or coalesce(sci.purchase_price, 0) <= 0)
    )
  ) as blocked
) sv on true;
$function$
;

revoke all on function public.public_product_commercial_actions_fast(uuid[]) from public;
grant execute on function public.public_product_commercial_actions_fast(uuid[]) to anon, authenticated;
