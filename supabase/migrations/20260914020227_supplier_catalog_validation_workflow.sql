alter table public.supplier_catalog_items
  add column if not exists pending_purchase_price numeric,
  add column if not exists validation_reasons jsonb not null default '[]'::jsonb,
  add column if not exists validation_source text,
  add column if not exists validation_reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists validation_reviewed_at timestamptz,
  add column if not exists validation_review_note text;

alter table public.supplier_catalog_items drop constraint if exists supplier_catalog_items_pending_purchase_price_check;
alter table public.supplier_catalog_items add constraint supplier_catalog_items_pending_purchase_price_check check (pending_purchase_price is null or pending_purchase_price >= 0);
alter table public.supplier_catalog_items drop constraint if exists supplier_catalog_items_validation_reasons_array_check;
alter table public.supplier_catalog_items add constraint supplier_catalog_items_validation_reasons_array_check check (jsonb_typeof(validation_reasons)='array');

create table if not exists public.supplier_catalog_validation_events (
  id uuid primary key default gen_random_uuid(),
  catalog_item_id uuid not null references public.supplier_catalog_items(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  event_type text not null,
  from_status text,
  to_status text not null,
  previous_purchase_price numeric,
  pending_purchase_price numeric,
  approved_purchase_price numeric,
  reasons jsonb not null default '[]'::jsonb,
  note text,
  source text,
  actor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint supplier_catalog_validation_events_status_check check (to_status in ('ok','review','reject')),
  constraint supplier_catalog_validation_events_from_status_check check (from_status is null or from_status in ('ok','review','reject')),
  constraint supplier_catalog_validation_events_reasons_array_check check (jsonb_typeof(reasons)='array')
);
create index if not exists supplier_catalog_validation_events_item_idx on public.supplier_catalog_validation_events(catalog_item_id,created_at desc);
create index if not exists supplier_catalog_validation_events_supplier_idx on public.supplier_catalog_validation_events(supplier_id,created_at desc);
alter table public.supplier_catalog_validation_events enable row level security;
revoke all on public.supplier_catalog_validation_events from anon,authenticated;
grant select on public.supplier_catalog_validation_events to authenticated;
grant all on public.supplier_catalog_validation_events to service_role;
drop policy if exists supplier_catalog_validation_events_manager_read on public.supplier_catalog_validation_events;
create policy supplier_catalog_validation_events_manager_read on public.supplier_catalog_validation_events for select to authenticated using ((select app_private.is_manager()));

create or replace function public.croma_supplier_catalog_validation_audit_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_event_type text; v_actor uuid;
begin
  if tg_op='INSERT' then
    if new.validation_status='ok' and new.pending_purchase_price is null then return new; end if;
    v_event_type:='import_flagged';
  else
    if new.validation_status is not distinct from old.validation_status
       and new.pending_purchase_price is not distinct from old.pending_purchase_price
       and new.validation_reviewed_at is not distinct from old.validation_reviewed_at then return new; end if;
    v_event_type:=case when new.validation_reviewed_at is distinct from old.validation_reviewed_at then 'manual_validation'
      when new.validation_status is distinct from old.validation_status then 'status_changed' else 'candidate_changed' end;
  end if;
  v_actor:=coalesce(new.validation_reviewed_by,auth.uid());
  insert into public.supplier_catalog_validation_events(catalog_item_id,supplier_id,event_type,from_status,to_status,previous_purchase_price,pending_purchase_price,approved_purchase_price,reasons,note,source,actor_id,created_at)
  values(new.id,new.supplier_id,v_event_type,case when tg_op='UPDATE' then old.validation_status else null end,new.validation_status,
    case when tg_op='UPDATE' then old.purchase_price else null end,new.pending_purchase_price,new.purchase_price,
    coalesce(new.validation_reasons,'[]'::jsonb),new.validation_review_note,new.validation_source,v_actor,now());
  return new;
end;$$;
revoke all on function public.croma_supplier_catalog_validation_audit_trigger() from public;
drop trigger if exists supplier_catalog_validation_audit_after_insert on public.supplier_catalog_items;
create trigger supplier_catalog_validation_audit_after_insert after insert on public.supplier_catalog_items for each row execute function public.croma_supplier_catalog_validation_audit_trigger();
drop trigger if exists supplier_catalog_validation_audit_after_update on public.supplier_catalog_items;
create trigger supplier_catalog_validation_audit_after_update after update on public.supplier_catalog_items for each row execute function public.croma_supplier_catalog_validation_audit_trigger();

create or replace function public.croma_supplier_catalog_reconcile_links_trigger()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare r record; generated_effective_cost numeric;
begin
  for r in select ps.id as link_id,ps.product_id,ps.preferred,n.id as catalog_item_id,n.sku,n.unit,n.purchase_price,n.minimum_order_quantity,n.lead_time_days,
    coalesce(n.description,n.name) as supplier_description,coalesce(s.default_order_freight,0) as default_freight
    from public.product_suppliers ps join new_catalog_rows n on n.supplier_id=ps.supplier_id and
      (ps.supplier_catalog_item_id=n.id or (ps.supplier_catalog_item_id is null and ps.supplier_sku is not null and upper(btrim(ps.supplier_sku))=upper(btrim(n.sku))))
    join public.suppliers s on s.id=ps.supplier_id and s.active=true
    where ps.variant_id is null and ps.active=true and n.active=true and n.validation_status='ok' and coalesce(n.purchase_price,0)>0
  loop
    update public.product_suppliers set supplier_catalog_item_id=r.catalog_item_id,supplier_sku=r.sku,purchase_unit=coalesce(r.unit,purchase_unit),purchase_price=r.purchase_price,
      freight_cost=coalesce(r.default_freight,0),minimum_order_quantity=r.minimum_order_quantity,lead_time_days=r.lead_time_days,
      supplier_product_description=coalesce(r.supplier_description,supplier_product_description),last_quote_at=now(),updated_at=now()
    where id=r.link_id returning effective_unit_cost into generated_effective_cost;
    if r.preferred then
      insert into public.product_costs(product_id,supplier_reference,cost,updated_at) values(r.product_id,r.sku,r.purchase_price,now())
      on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();
      insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
      values(r.product_id,r.link_id,generated_effective_cost,1,'markup')
      on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set product_supplier_id=excluded.product_supplier_id,effective_cost=excluded.effective_cost,updated_at=now();
    end if;
  end loop;
  return null;
end;$$;

create or replace function public.link_product_to_supplier_catalog(p_product_id uuid,p_catalog_item_id uuid)
returns public.product_suppliers language plpgsql set search_path=public as $$
declare v_item public.supplier_catalog_items%rowtype; v_supplier public.suppliers%rowtype; v_link public.product_suppliers%rowtype;
begin
  if not app_private.is_manager() then raise exception 'not authorized'; end if;
  select * into v_item from public.supplier_catalog_items where id=p_catalog_item_id and active=true and validation_status='ok' and coalesce(purchase_price,0)>0;
  if not found then raise exception 'supplier catalog item is not validated for operational use'; end if;
  select * into v_supplier from public.suppliers where id=v_item.supplier_id and active=true;
  if not found then raise exception 'supplier not found or inactive'; end if;
  select * into v_link from public.product_suppliers where product_id=p_product_id and variant_id is null and supplier_id=v_item.supplier_id order by preferred desc,created_at limit 1;
  if found then
    update public.product_suppliers set supplier_catalog_item_id=v_item.id,supplier_sku=v_item.sku,purchase_unit=coalesce(v_item.unit,purchase_unit),purchase_price=v_item.purchase_price,
      freight_cost=coalesce(v_supplier.default_order_freight,0),minimum_order_quantity=v_item.minimum_order_quantity,lead_time_days=v_item.lead_time_days,
      supplier_product_description=coalesce(v_item.description,v_item.name),preferred=true,active=true,last_quote_at=now(),updated_at=now()
    where id=v_link.id returning * into v_link;
  else
    update public.product_suppliers set preferred=false,updated_at=now() where product_id=p_product_id and variant_id is null;
    insert into public.product_suppliers(product_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_price,freight_cost,minimum_order_quantity,lead_time_days,supplier_product_description,preferred,active,last_quote_at)
    values(p_product_id,v_item.supplier_id,v_item.id,v_item.sku,v_item.purchase_price,coalesce(v_supplier.default_order_freight,0),v_item.minimum_order_quantity,v_item.lead_time_days,coalesce(v_item.description,v_item.name),true,true,now()) returning * into v_link;
  end if;
  insert into public.product_costs(product_id,supplier_reference,cost,updated_at) values(p_product_id,v_item.sku,v_item.purchase_price,now())
  on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();
  insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source)
  values(p_product_id,v_link.id,v_link.effective_unit_cost,1,'markup')
  on conflict(product_id) where variant_id is null do update set product_supplier_id=excluded.product_supplier_id,effective_cost=excluded.effective_cost,updated_at=now();
  return v_link;
end;$$;

create or replace function public.croma_reconcile_bling_supplier_catalog(p_product_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.products%rowtype; f jsonb; supplier_contact_ext text; supplier_code_value text; supplier_contact_local uuid;
  supplier_row public.suppliers%rowtype; catalog_row public.supplier_catalog_items%rowtype; link_row public.product_suppliers%rowtype; other_preferred boolean;
begin
  select * into p from public.products where id=p_product_id;if not found then return 'product_not_found';end if;
  f:=p.metadata#>'{bling_raw,fornecedor}';if f is null or jsonb_typeof(f)<>'object' or f='{}'::jsonb then return 'supplier_not_present';end if;
  supplier_code_value:=nullif(btrim(f->>'codigo'),'');if supplier_code_value is null then return 'supplier_code_missing';end if;
  supplier_contact_ext:=coalesce(nullif(f#>>'{contato,id}',''),nullif(f->>'idContato',''));if supplier_contact_ext is null then return 'supplier_contact_missing';end if;
  select m.local_id into supplier_contact_local from public.erp_entity_mappings m where m.provider='bling' and m.entity_type='customer' and m.external_id=supplier_contact_ext order by m.updated_at desc limit 1;
  if supplier_contact_local is null then select cp.id into supplier_contact_local from public.customer_profiles cp where cp.bling_contact_id::text=supplier_contact_ext order by cp.updated_at desc limit 1;end if;
  if supplier_contact_local is null then return 'supplier_contact_not_mapped';end if;
  select s.* into supplier_row from public.suppliers s where s.contact_id=supplier_contact_local and s.active=true order by s.updated_at desc limit 1;if not found then return 'supplier_extension_not_found';end if;
  select sci.* into catalog_row from public.supplier_catalog_items sci where sci.supplier_id=supplier_row.id and sci.active=true and sci.validation_status='ok' and coalesce(sci.purchase_price,0)>0 and upper(btrim(sci.sku))=upper(supplier_code_value) order by (sci.sku=supplier_code_value) desc,sci.updated_at desc limit 1;
  if not found then
    if exists(select 1 from public.supplier_catalog_items sci where sci.supplier_id=supplier_row.id and sci.active=true and upper(btrim(sci.sku))=upper(supplier_code_value) and sci.validation_status<>'ok') then return 'catalog_item_not_validated';end if;
    if exists(select 1 from public.supplier_catalog_items sci where sci.supplier_id=supplier_row.id and sci.active=true and upper(btrim(sci.sku))=upper(supplier_code_value) and coalesce(sci.purchase_price,0)<=0) then return 'catalog_item_price_not_ready';end if;
    return 'catalog_item_not_found';
  end if;
  select ps.* into link_row from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.supplier_id=supplier_row.id order by ps.preferred desc,ps.created_at limit 1;
  if found then
    select exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.id<>link_row.id and ps.preferred=true and ps.active=true) into other_preferred;
    update public.product_suppliers set supplier_catalog_item_id=catalog_row.id,supplier_sku=catalog_row.sku,purchase_unit=coalesce(catalog_row.unit,purchase_unit,p.unidade),purchase_price=catalog_row.purchase_price,freight_cost=coalesce(supplier_row.default_order_freight,0),minimum_order_quantity=catalog_row.minimum_order_quantity,lead_time_days=catalog_row.lead_time_days,supplier_product_description=coalesce(catalog_row.description,catalog_row.name,supplier_product_description),preferred=case when link_row.preferred then true when not other_preferred then true else false end,active=true,last_quote_at=now(),updated_at=now() where id=link_row.id returning * into link_row;
  else
    select exists(select 1 from public.product_suppliers ps where ps.product_id=p_product_id and ps.variant_id is null and ps.preferred=true and ps.active=true) into other_preferred;
    insert into public.product_suppliers(product_id,variant_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_unit,conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,minimum_order_quantity,lead_time_days,supplier_product_description,preferred,active,last_quote_at,updated_at)
    values(p_product_id,null,supplier_row.id,catalog_row.id,catalog_row.sku,coalesce(catalog_row.unit,p.unidade),1,catalog_row.purchase_price,coalesce(supplier_row.default_order_freight,0),0,0,catalog_row.minimum_order_quantity,catalog_row.lead_time_days,coalesce(catalog_row.description,catalog_row.name),not other_preferred,true,now(),now()) returning * into link_row;
  end if;
  if link_row.preferred then
    insert into public.product_costs(product_id,supplier_reference,cost,updated_at) values(p_product_id,catalog_row.sku,catalog_row.purchase_price,now()) on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();
    insert into public.product_pricing(product_id,product_supplier_id,effective_cost,markup_multiplier,active_price_source) values(p_product_id,link_row.id,link_row.effective_unit_cost,1,'markup') on conflict(product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid)) do update set product_supplier_id=excluded.product_supplier_id,effective_cost=excluded.effective_cost,updated_at=now();
  end if;
  return 'linked';
end;$$;

create or replace view public.public_catalog_products with (security_barrier=true) as
select p.id,p.nome,p.sku,p.slug,p.descricao,p.short_description,(case when coalesce(sv.blocked,false) then null else p.preco end)::numeric(12,2) as preco,
  p.catalog_category_id,p.product_type,p.ativo,p.published_on_site,p.is_sellable,p.is_input,
  jsonb_strip_nulls(jsonb_build_object('icone',p.metadata->'icone','imagem',p.metadata->'imagem','image_url',p.metadata->'image_url','imagem_principal',p.metadata->'imagem_principal','destaques',p.metadata->'destaques','quantidadePreco',p.metadata->'quantidadePreco','home_featured',p.metadata->'home_featured','featured_home',p.metadata->'featured_home','home_order',p.metadata->'home_order','featured_order',p.metadata->'featured_order')) as metadata,
  case when p.product_type='servico' then coalesce(cs.child_count,0) else 0 end as child_count,
  case when coalesce(sv.blocked,false) then null when p.product_type='servico' and coalesce(cs.child_count,0)>0 then cs.min_child_price when p.preco>0 then p.preco else null end as commercial_min_price
from public.products p join public.catalog_categories c on c.id=p.catalog_category_id
left join lateral(select exists(select 1 from public.product_suppliers ps join public.supplier_catalog_items sci on sci.supplier_id=ps.supplier_id and sci.active=true and (sci.id=ps.supplier_catalog_item_id or (ps.supplier_catalog_item_id is null and ps.supplier_sku is not null and upper(btrim(sci.sku))=upper(btrim(ps.supplier_sku)))) where ps.product_id=p.id and ps.variant_id is null and ps.active=true and ps.preferred=true and (sci.validation_status<>'ok' or coalesce(sci.purchase_price,0)<=0)) as blocked) sv on true
left join lateral(select count(*)::integer as child_count,min(ch.preco) filter(where ch.preco>0 and not exists(select 1 from public.product_suppliers cps join public.supplier_catalog_items csci on csci.supplier_id=cps.supplier_id and csci.active=true and (csci.id=cps.supplier_catalog_item_id or (cps.supplier_catalog_item_id is null and cps.supplier_sku is not null and upper(btrim(csci.sku))=upper(btrim(cps.supplier_sku)))) where cps.product_id=ch.id and cps.variant_id is null and cps.active=true and cps.preferred=true and (csci.validation_status<>'ok' or coalesce(csci.purchase_price,0)<=0))) as min_child_price from public.products ch where ch.parent_product_id=p.id and ch.product_type='servico' and ch.ativo=true and ch.is_sellable=true and ch.is_input=false) cs on true
where p.ativo=true and p.is_sellable=true and p.is_input=false and c.ativo=true and c.public_visible=true and (p.product_type='produto' or (p.product_type='servico' and p.published_on_site=true));