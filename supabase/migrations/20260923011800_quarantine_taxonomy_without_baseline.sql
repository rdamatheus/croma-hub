update public.products p
set metadata = coalesce(p.metadata,'{}'::jsonb) || jsonb_build_object(
      'taxonomy_sync_status','waiting_baseline',
      'taxonomy_sync_mode','baseline_missing',
      'taxonomy_sync_error','Aguardando payload-base do Bling antes de sincronizar a categoria.',
      'taxonomy_sync_error_at',now(),
      'taxonomy_next_retry_at',null,
      'taxonomy_retry_count',0
    ),
    bling_sync_status='pendente',
    bling_sync_error=null
where p.metadata->>'taxonomy_sync_status'='error'
  and p.metadata->>'taxonomy_sync_error'='Produto sem payload-base do Bling.'
  and not exists (
    select 1
    from public.erp_product_sync_state s
    where s.product_id=p.id
      and s.baseline_payload is not null
  );
