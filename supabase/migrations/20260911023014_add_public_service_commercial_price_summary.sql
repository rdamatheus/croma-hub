create or replace view public.public_catalog_products
with (security_barrier=true)
as
select
  p.id,
  p.nome,
  p.sku,
  p.slug,
  p.descricao,
  p.short_description,
  p.preco,
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
  case when p.product_type = 'servico' then coalesce(cs.child_count,0) else 0 end as child_count,
  case
    when p.product_type = 'servico' and coalesce(cs.child_count,0) > 0 then cs.min_child_price
    when p.preco > 0 then p.preco
    else null
  end as commercial_min_price
from public.products p
join public.catalog_categories c on c.id = p.catalog_category_id
left join lateral (
  select
    count(*)::integer as child_count,
    min(ch.preco) filter (where ch.preco > 0) as min_child_price
  from public.products ch
  where ch.parent_product_id = p.id
    and ch.product_type = 'servico'
    and ch.ativo = true
    and ch.is_sellable = true
    and ch.is_input = false
) cs on true
where p.ativo = true
  and p.is_sellable = true
  and p.is_input = false
  and c.ativo = true
  and c.public_visible = true
  and (
    p.product_type = 'produto'
    or (p.product_type = 'servico' and p.published_on_site = true)
  );
