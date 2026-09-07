-- A normalização automática desta etapa é exclusiva de produtos.
-- Serviços seguem o fluxo manual já definido no Croma Hub.

delete from public.product_variants v using public.products p
where v.child_product_id=p.id and v.source='bling' and p.product_type='servico';
delete from public.product_option_groups g using public.products p
where g.product_id=p.id and p.product_type='servico';
delete from public.product_stock_snapshots s using public.products p
where s.product_id=p.id and s.source='bling' and p.product_type='servico';
delete from public.product_custom_field_values cf using public.products p
where cf.product_id=p.id and cf.source='bling' and p.product_type='servico';
delete from public.product_components c using public.products p
where c.parent_product_id=p.id and c.source='bling' and p.product_type='servico';
delete from public.product_suppliers ps using public.products p
where ps.product_id=p.id and p.product_type='servico';

create or replace function public.croma_normalize_bling_product_scoped(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p_type text;
begin
  select product_type into p_type from public.products where id=p_product_id;
  if p_type is distinct from 'produto' then return; end if;
  perform public.croma_normalize_bling_product(p_product_id);
end; $$;

create or replace function public.croma_products_bling_normalize_trigger()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare dep record;
begin
  if new.product_type is distinct from 'produto' then return new; end if;
  perform public.croma_normalize_bling_product_scoped(new.id);
  if new.bling_product_id is not null then
    for dep in select id from public.products where id <> new.id and product_type='produto'
      and jsonb_typeof(metadata#>'{bling_raw,estrutura,componentes}')='array'
      and (metadata#>'{bling_raw,estrutura,componentes}') @> jsonb_build_array(jsonb_build_object('produto',jsonb_build_object('id',new.bling_product_id)))
    loop perform public.croma_normalize_bling_product_scoped(dep.id); end loop;
  end if;
  return new;
end; $$;
