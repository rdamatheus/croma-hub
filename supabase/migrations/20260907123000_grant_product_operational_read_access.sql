-- Permite que usuários autenticados leiam as projeções operacionais usadas no cadastro de produtos.
-- RLS continua limitando a leitura aos perfis internos autorizados.
grant select on table public.product_stock_snapshots to authenticated;
grant select on table public.product_custom_field_values to authenticated;
grant select on table public.product_supplier_external_snapshots to authenticated;

-- As rotinas de integração usam service_role para gravar/atualizar essas projeções.
grant all privileges on table public.product_stock_snapshots to service_role;
grant all privileges on table public.product_custom_field_values to service_role;
grant all privileges on table public.product_supplier_external_snapshots to service_role;
