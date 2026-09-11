-- Corrige a leitura pública do catálogo sem expor dados operacionais.

DROP POLICY IF EXISTS catalog_categories_public_read ON public.catalog_categories;
DROP POLICY IF EXISTS catalog_categories_staff_read ON public.catalog_categories;

CREATE POLICY catalog_categories_public_read
ON public.catalog_categories
FOR SELECT
TO anon, authenticated
USING (ativo = true AND public_visible = true);

CREATE POLICY catalog_categories_staff_read
ON public.catalog_categories
FOR SELECT
TO authenticated
USING ((SELECT app_private.is_staff()));

CREATE OR REPLACE VIEW public.public_catalog_products
WITH (security_barrier = true)
AS
SELECT
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
  )) AS metadata
FROM public.products p
JOIN public.catalog_categories c ON c.id = p.catalog_category_id
WHERE p.ativo = true
  AND p.is_sellable = true
  AND p.is_input = false
  AND c.ativo = true
  AND c.public_visible = true
  AND (
    p.product_type = 'produto'
    OR (p.product_type = 'servico' AND p.published_on_site = true)
  );

COMMENT ON VIEW public.public_catalog_products IS
'Camada pública do catálogo. Expõe somente dados comerciais; custos, fornecedores, notas internas e dados de sincronização permanecem nas tabelas internas.';

REVOKE ALL ON public.public_catalog_products FROM PUBLIC;
GRANT SELECT ON public.public_catalog_products TO anon, authenticated;

REVOKE SELECT ON public.products FROM anon;

DROP POLICY IF EXISTS product_media_public_read ON public.product_media;
DROP POLICY IF EXISTS product_media_authenticated_read ON public.product_media;

CREATE POLICY product_media_public_read
ON public.product_media
FOR SELECT
TO anon
USING (
  ativo = true
  AND EXISTS (
    SELECT 1
    FROM public.public_catalog_products p
    WHERE p.id = product_media.product_id
  )
);

CREATE POLICY product_media_authenticated_read
ON public.product_media
FOR SELECT
TO authenticated
USING (
  ativo = true
  AND (
    EXISTS (
      SELECT 1
      FROM public.public_catalog_products p
      WHERE p.id = product_media.product_id
    )
    OR (SELECT app_private.is_staff())
  )
);

CREATE OR REPLACE VIEW public.public_service_details
WITH (security_barrier = true)
AS
SELECT
  sd.product_id,
  sd.lead_time_days,
  sd.requires_artwork,
  sd.requires_customer_approval
FROM public.service_details sd
JOIN public.public_catalog_products p ON p.id = sd.product_id
WHERE p.product_type = 'servico';

COMMENT ON VIEW public.public_service_details IS
'Informações de serviço seguras para divulgação. Instruções de execução, tipo de produção e metadados operacionais continuam privados.';

REVOKE ALL ON public.public_service_details FROM PUBLIC;
GRANT SELECT ON public.public_service_details TO anon, authenticated;
