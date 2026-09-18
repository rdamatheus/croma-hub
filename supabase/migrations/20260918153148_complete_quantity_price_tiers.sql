alter table public.product_price_tiers
  add column if not exists label text,
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists source text not null default 'manual',
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.product_price_tiers'::regclass
      and conname='product_price_tiers_validity_check'
  ) then
    alter table public.product_price_tiers
      add constraint product_price_tiers_validity_check
      check (valid_until is null or valid_from is null or valid_until >= valid_from);
  end if;
end $$;

create or replace function public.resolve_product_price(
  p_product_id uuid,
  p_variant_id uuid,
  p_qty integer
)
returns table(unit_price numeric, min_qty integer)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$
  with c as (
    select t.*,
      case t.quantity_rule
        when 'exact' then 1
        when 'range' then 2
        else 3
      end as specificity
    from public.product_price_tiers t
    where t.product_id=p_product_id
      and t.ativo=true
      and ((p_variant_id is null and t.variant_id is null) or t.variant_id=p_variant_id)
      and (t.valid_from is null or t.valid_from<=current_date)
      and (t.valid_until is null or t.valid_until>=current_date)
      and (
        (t.quantity_rule='exact' and greatest(p_qty,1)=t.min_qty)
        or
        (t.quantity_rule='range' and greatest(p_qty,1)>=t.min_qty and greatest(p_qty,1)<=coalesce(t.max_qty,t.min_qty))
        or
        (t.quantity_rule='free' and greatest(p_qty,1)>=t.min_qty and (t.max_qty is null or greatest(p_qty,1)<=t.max_qty))
      )
    order by specificity,t.min_qty desc,t.updated_at desc
    limit 1
  )
  select
    case when c.price_basis='lot'
      then round(c.unit_price/nullif(greatest(p_qty,1),0),4)
      else c.unit_price
    end as unit_price,
    c.min_qty
  from c
  union all
  select p.preco,greatest(p_qty,1)
  from public.products p
  where p.id=p_product_id
    and not exists(select 1 from c)
  limit 1
$$;

create or replace function public.resolve_product_sale_price(
  p_product_id uuid,
  p_quantity numeric,
  p_variant_id uuid default null,
  p_on_date date default current_date
)
returns table(
  tier_id uuid,
  quantity_rule text,
  min_qty integer,
  max_qty integer,
  price_basis text,
  tier_price numeric,
  unit_price numeric,
  total_price numeric,
  source text,
  label text
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $$
  with c as (
    select t.*,
      case t.quantity_rule
        when 'exact' then 1
        when 'range' then 2
        else 3
      end as specificity
    from public.product_price_tiers t
    where t.product_id=p_product_id
      and t.ativo=true
      and (t.variant_id is not distinct from p_variant_id)
      and (t.valid_from is null or t.valid_from<=p_on_date)
      and (t.valid_until is null or t.valid_until>=p_on_date)
      and (
        (t.quantity_rule='exact' and p_quantity=t.min_qty)
        or
        (t.quantity_rule='range' and p_quantity>=t.min_qty and p_quantity<=coalesce(t.max_qty,t.min_qty))
        or
        (t.quantity_rule='free' and p_quantity>=t.min_qty and (t.max_qty is null or p_quantity<=t.max_qty))
      )
    order by specificity,t.min_qty desc,t.updated_at desc
    limit 1
  )
  select
    c.id,c.quantity_rule,c.min_qty,c.max_qty,c.price_basis,c.unit_price as tier_price,
    case when c.price_basis='lot' then round(c.unit_price/nullif(p_quantity,0),4) else c.unit_price end,
    case when c.price_basis='lot' then c.unit_price else round(c.unit_price*p_quantity,2) end,
    c.source,c.label
  from c
  union all
  select
    null::uuid,'base'::text,null::integer,null::integer,'unit'::text,p.preco,p.preco,
    round(p.preco*p_quantity,2),'base'::text,'Preço base'::text
  from public.products p
  where p.id=p_product_id
    and not exists(select 1 from c)
  limit 1
$$;

grant execute on function public.resolve_product_price(uuid,uuid,integer) to anon,authenticated;
grant execute on function public.resolve_product_sale_price(uuid,numeric,uuid,date) to authenticated;

comment on function public.resolve_product_sale_price(uuid,numeric,uuid,date) is
  'Resolve preço comercial por quantidade: exact > range > free (a partir de). Sem faixa aplicável usa products.preco, que continua sendo o preço-base espelhado no Bling.';
