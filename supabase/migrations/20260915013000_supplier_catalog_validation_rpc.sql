create or replace function public.croma_set_supplier_catalog_validation(
  p_item_id uuid,
  p_status text,
  p_note text default null,
  p_approved_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','app_private','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_item public.supplier_catalog_items%rowtype;
  v_approved numeric;
  v_supplier_contact uuid;
  v_external_contact text;
  v_product_id uuid;
  v_reconciled integer := 0;
  v_reconcile_errors jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception using errcode='28000', message='Sessão inválida. Entre novamente no Croma Hub.';
  end if;

  if not app_private.is_manager() then
    raise exception using errcode='42501', message='Acesso restrito à gestão.';
  end if;

  if p_status not in ('ok','review','reject') then
    raise exception using errcode='22023', message='Status de validação inválido.';
  end if;

  select * into v_item
  from public.supplier_catalog_items
  where id=p_item_id
  for update;

  if not found then
    raise exception using errcode='P0002', message='Item do catálogo não encontrado.';
  end if;

  if p_status='reject' and btrim(coalesce(p_note,''))='' then
    raise exception using errcode='22023', message='Informe o motivo da rejeição.';
  end if;

  v_approved := coalesce(p_approved_price,v_item.pending_purchase_price,v_item.purchase_price);

  if p_status='ok' and coalesce(v_approved,0)<=0 then
    raise exception using errcode='22023', message='Informe um preço aprovado maior que zero antes de validar.';
  end if;

  update public.supplier_catalog_items
  set validation_status=p_status,
      validation_reviewed_by=v_user,
      validation_reviewed_at=now(),
      validation_review_note=nullif(btrim(coalesce(p_note,'')),''),
      validation_source='manual',
      purchase_price=case when p_status='ok' then v_approved else purchase_price end,
      pending_purchase_price=case
        when p_status='ok' then null
        when p_approved_price is not null then p_approved_price
        else pending_purchase_price
      end
  where id=p_item_id
  returning * into v_item;

  if p_status='ok' then
    select s.contact_id into v_supplier_contact
    from public.suppliers s
    where s.id=v_item.supplier_id and s.active=true
    limit 1;

    if v_supplier_contact is not null then
      select cp.bling_contact_id::text into v_external_contact
      from public.customer_profiles cp
      where cp.id=v_supplier_contact
      limit 1;
    end if;

    if nullif(v_external_contact,'') is not null then
      for v_product_id in
        select distinct pses.product_id
        from public.product_supplier_external_snapshots pses
        where pses.external_contact_id=v_external_contact
          and upper(btrim(coalesce(pses.supplier_code,'')))=upper(btrim(v_item.sku))
          and pses.product_id is not null
      loop
        begin
          perform public.croma_reconcile_bling_supplier_catalog(v_product_id);
          v_reconciled := v_reconciled + 1;
        exception when others then
          v_reconcile_errors := v_reconcile_errors || jsonb_build_array(
            jsonb_build_object('product_id',v_product_id,'error',sqlerrm)
          );
        end;
      end loop;
    end if;
  end if;

  return jsonb_build_object(
    'ok',true,
    'item_id',v_item.id,
    'status',v_item.validation_status,
    'purchase_price',v_item.purchase_price,
    'pending_purchase_price',v_item.pending_purchase_price,
    'reconciled_products',v_reconciled,
    'reconcile_errors',v_reconcile_errors
  );
end;
$function$;

revoke all on function public.croma_set_supplier_catalog_validation(uuid,text,text,numeric) from public;
revoke all on function public.croma_set_supplier_catalog_validation(uuid,text,text,numeric) from anon;
grant execute on function public.croma_set_supplier_catalog_validation(uuid,text,text,numeric) to authenticated;
grant execute on function public.croma_set_supplier_catalog_validation(uuid,text,text,numeric) to service_role;
