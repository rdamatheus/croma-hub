create or replace function public.croma_supplier_catalog_validation_guard_trigger()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_incoming numeric;v_ratio numeric;v_reason jsonb;
begin
  v_incoming:=new.purchase_price;
  if tg_op='UPDATE' and new.validation_source='manual' and new.validation_reviewed_at is distinct from old.validation_reviewed_at then
    if new.validation_status='ok' then
      if coalesce(new.purchase_price,0)<=0 then raise exception 'validated supplier catalog price must be greater than zero';end if;
      new.pending_purchase_price:=null;
    end if;
    return new;
  end if;
  if new.validation_status<>'ok' then
    new.pending_purchase_price:=v_incoming;new.validation_source:=coalesce(new.validation_source,'import');
    if tg_op='UPDATE' then new.purchase_price:=old.purchase_price;else new.purchase_price:=null;end if;
    return new;
  end if;
  if coalesce(v_incoming,0)<=0 then
    new.validation_status:='review';new.pending_purchase_price:=v_incoming;new.validation_source:='system_price_check';
    v_reason:=jsonb_build_object('code','zero_or_negative_price','label','Preço zerado ou inválido','detail','O preço recebido não pode atualizar o custo automaticamente.');
    new.validation_reasons:=coalesce(new.validation_reasons,'[]'::jsonb)||jsonb_build_array(v_reason);
    if tg_op='UPDATE' then new.purchase_price:=old.purchase_price;else new.purchase_price:=null;end if;
    return new;
  end if;
  if tg_op='UPDATE' and coalesce(old.purchase_price,0)>0 then
    v_ratio:=v_incoming/old.purchase_price;
    if v_ratio>=2 or v_ratio<=0.5 then
      new.validation_status:='review';new.pending_purchase_price:=v_incoming;new.purchase_price:=old.purchase_price;new.validation_source:='system_price_check';
      v_reason:=jsonb_build_object('code',case when v_ratio>=10 or v_ratio<=0.1 then 'extreme_price_change' else 'large_price_change' end,
        'label',case when v_ratio>=10 or v_ratio<=0.1 then 'Variação extrema de preço' else 'Variação relevante de preço' end,
        'detail',format('Preço aprovado: R$ %s; preço recebido: R$ %s; variação: %s%%.',to_char(old.purchase_price,'FM999999990D00'),to_char(v_incoming,'FM999999990D00'),to_char((v_ratio-1)*100,'FM999999990D0')));
      new.validation_reasons:=coalesce(new.validation_reasons,'[]'::jsonb)||jsonb_build_array(v_reason);return new;
    end if;
  end if;
  new.pending_purchase_price:=null;new.validation_source:=coalesce(new.validation_source,'import');return new;
end;$$;
revoke all on function public.croma_supplier_catalog_validation_guard_trigger() from public;
drop trigger if exists supplier_catalog_validation_guard_before_insert_update on public.supplier_catalog_items;
create trigger supplier_catalog_validation_guard_before_insert_update before insert or update on public.supplier_catalog_items for each row execute function public.croma_supplier_catalog_validation_guard_trigger();