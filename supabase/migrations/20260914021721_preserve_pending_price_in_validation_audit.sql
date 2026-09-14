create or replace function public.croma_supplier_catalog_validation_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_event_type text;
  v_actor uuid;
  v_event_pending numeric;
begin
  if tg_op='INSERT' then
    if new.validation_status='ok' and new.pending_purchase_price is null then
      return new;
    end if;
    v_event_type := 'import_flagged';
    v_event_pending := new.pending_purchase_price;
  else
    if new.validation_status is not distinct from old.validation_status
       and new.pending_purchase_price is not distinct from old.pending_purchase_price
       and new.validation_reviewed_at is not distinct from old.validation_reviewed_at then
      return new;
    end if;
    v_event_type := case
      when new.validation_reviewed_at is distinct from old.validation_reviewed_at then 'manual_validation'
      when new.validation_status is distinct from old.validation_status then 'status_changed'
      else 'candidate_changed'
    end;
    v_event_pending := case
      when new.validation_reviewed_at is distinct from old.validation_reviewed_at
        then coalesce(old.pending_purchase_price,new.pending_purchase_price)
      else new.pending_purchase_price
    end;
  end if;

  v_actor := coalesce(new.validation_reviewed_by,auth.uid());

  insert into public.supplier_catalog_validation_events(
    catalog_item_id,supplier_id,event_type,from_status,to_status,
    previous_purchase_price,pending_purchase_price,approved_purchase_price,
    reasons,note,source,actor_id,created_at
  ) values (
    new.id,new.supplier_id,v_event_type,
    case when tg_op='UPDATE' then old.validation_status else null end,
    new.validation_status,
    case when tg_op='UPDATE' then old.purchase_price else null end,
    v_event_pending,
    new.purchase_price,
    coalesce(new.validation_reasons,'[]'::jsonb),new.validation_review_note,
    new.validation_source,v_actor,now()
  );
  return new;
end;
$$;

revoke all on function public.croma_supplier_catalog_validation_audit_trigger() from public;