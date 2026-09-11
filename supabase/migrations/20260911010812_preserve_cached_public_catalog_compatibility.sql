-- Compatibilidade temporária para clientes com JS público em cache: mantém somente as colunas
-- usadas pela camada pública antiga e restringe as linhas ao catálogo comercial.

DROP POLICY IF EXISTS products_public_read_active ON public.products;
DROP POLICY IF EXISTS products_public_read_catalog ON public.products;

CREATE POLICY products_public_read_catalog
ON public.products
FOR SELECT
TO anon
USING (
  ativo = true
  AND is_sellable = true
  AND is_input = false
  AND catalog_category_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM public.catalog_categories c
    WHERE c.id = products.catalog_category_id
      AND c.ativo = true
      AND c.public_visible = true
  )
  AND (
    product_type = 'produto'
    OR (product_type = 'servico' AND published_on_site = true)
  )
);

GRANT SELECT (
  id, nome, sku, slug, descricao, short_description, preco,
  catalog_category_id, product_type, ativo, published_on_site,
  is_sellable, is_input, metadata
) ON public.products TO anon;
