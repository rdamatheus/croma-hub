create or replace function public.mark_product_sync_dirty()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  pid uuid;
  ptype text;
  changed text[] := '{}'::text[];
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'products' then
    pid := coalesce(new.id, old.id);
    ptype := coalesce(new.product_type, old.product_type);
  elsif tg_table_name = 'product_details' then
    pid := coalesce(new.product_id, old.product_id);
    select product_type into ptype from public.products where id = pid;
  else
    return coalesce(new, old);
  end if;

  if coalesce(ptype,'') not in ('produto','servico') then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    changed := array_append(changed,'insert');
  elsif tg_op = 'UPDATE' then
    if tg_table_name = 'products' then
      if new.nome is distinct from old.nome then changed := array_append(changed,'nome'); end if;
      if new.sku is distinct from old.sku then changed := array_append(changed,'sku'); end if;
      if new.preco is distinct from old.preco then changed := array_append(changed,'preco'); end if;
      if new.unidade is distinct from old.unidade then changed := array_append(changed,'unidade'); end if;
      if new.ativo is distinct from old.ativo then changed := array_append(changed,'ativo'); end if;
      if new.short_description is distinct from old.short_description then changed := array_append(changed,'short_description'); end if;
      if new.complementary_description is distinct from old.complementary_description then changed := array_append(changed,'complementary_description'); end if;
      if new.notes is distinct from old.notes then changed := array_append(changed,'notes'); end if;
    else
      if ptype='produto' and to_jsonb(new) - 'updated_at' is distinct from to_jsonb(old) - 'updated_at' then
        changed := array_append(changed,'detalhes');
      end if;
    end if;
  end if;

  if cardinality(changed) > 0 then
    insert into public.erp_product_sync_state(
      product_id,sync_policy,local_dirty,dirty_fields,outbound_state,updated_at
    )
    values(pid,'auto_bidirectional',true,changed,'pending',now())
    on conflict(product_id) do update set
      sync_policy='auto_bidirectional',
      local_dirty=true,
      dirty_fields=(
        select array(
          select distinct x
          from unnest(coalesce(public.erp_product_sync_state.dirty_fields,'{}'::text[]) || excluded.dirty_fields) x
        )
      ),
      outbound_state=case
        when public.erp_product_sync_state.outbound_state='conflict' then 'conflict'
        else 'pending'
      end,
      last_error=case
        when public.erp_product_sync_state.outbound_state='conflict' then public.erp_product_sync_state.last_error
        else null
      end,
      updated_at=now();

    update public.products
    set bling_sync_status=case
          when coalesce((select outbound_state from public.erp_product_sync_state where product_id=pid),'pending')='conflict'
            then 'conflito'
          else 'pendente'
        end,
        bling_sync_error=case
          when coalesce((select outbound_state from public.erp_product_sync_state where product_id=pid),'pending')='conflict'
            then bling_sync_error
          else null
        end
    where id=pid and product_type in ('produto','servico');
  end if;

  return coalesce(new, old);
end
$function$;

revoke all on function public.mark_product_sync_dirty() from public, anon, authenticated;
