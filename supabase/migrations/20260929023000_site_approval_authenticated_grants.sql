-- Permissões da Central de Aprovações para gestores autenticados
-- O RLS continua restringindo o acesso a owner/manager via app_private.is_manager().

grant select, insert, update on table public.site_approval_proposals to authenticated;
grant select, insert, update on table public.site_approval_versions to authenticated;
grant select, insert, update on table public.site_approval_comments to authenticated;
grant select, insert, update on table public.site_approval_preferences to authenticated;
