-- Completa o espelhamento independente do caminho de sincronização.

create table if not exists public.product_supplier_external_snapshots (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  source text not null default 'bling',
  external_supplier_id text,
  external_contact_id text,
  supplier_name text,
  supplier_code text,
  purchase_price numeric,
  cost_price numeric,
  synced_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_supplier_external_snapshots_key unique(product_id, source)
);
create index if not exists product_supplier_external_contact_idx on public.product_supplier_external_snapshots(external_contact_id) where external_contact_id is not null;
alter table public.product_supplier_external_snapshots enable row level security;
drop policy if exists product_supplier_external_snapshots_staff_read on public.product_supplier_external_snapshots;
create policy product_supplier_external_snapshots_staff_read on public.product_supplier_external_snapshots for select to authenticated using ((select app_private.is_staff()));
drop policy if exists product_supplier_external_snapshots_manager_all on public.product_supplier_external_snapshots;
create policy product_supplier_external_snapshots_manager_all on public.product_supplier_external_snapshots for all to authenticated using ((select app_private.is_manager())) with check ((select app_private.is_manager()));

create or replace function public.croma_normalize_bling_product_details(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  p public.products%rowtype; raw jsonb; dim jsonb; trib jsonb; brand_value text; production_value text; free_shipping_value boolean;
begin
  select * into p from public.products where id=p_product_id and product_type='produto';
  if not found then return; end if;
  raw := p.metadata->'bling_raw';
  if raw is null or jsonb_typeof(raw)<>'object' then return; end if;
  dim := coalesce(raw->'dimensoes','{}'::jsonb); trib := coalesce(raw->'tributacao','{}'::jsonb);
  brand_value := coalesce(nullif(raw#>>'{marca,nome}',''), case when jsonb_typeof(raw->'marca')='string' then nullif(raw->>'marca','') else null end);
  production_value := case when upper(coalesce(raw->>'tipoProducao',''))='P' then 'producao_interna' else null end;
  free_shipping_value := case lower(coalesce(raw->>'freteGratis','')) when 'true' then true when '1' then true when 'sim' then true else false end;

  insert into public.product_details(
    product_id,brand,model,ncm,origin,gross_weight_kg,net_weight_kg,width_cm,height_cm,depth_cm,specifications,production_mode,
    free_shipping,volumes,items_per_box,dimensions_unit,gtin,gtin_tax,cest,item_type,approximate_tax_percent,tax_group,
    icms_st_retained_base,own_icms_substitute,fixed_pis,fixed_cofins,additional_fiscal_info,anp_code,anp_description,
    glp_percent,glgn_national_percent,glgn_imported_percent,starting_value,updated_at
  ) values (
    p_product_id,brand_value,nullif(raw->>'modelo',''),nullif(trib->>'ncm',''),nullif(trib->>'origem',''),
    public.croma_try_numeric(raw->>'pesoBruto'),public.croma_try_numeric(raw->>'pesoLiquido'),public.croma_try_numeric(dim->>'largura'),
    public.croma_try_numeric(dim->>'altura'),public.croma_try_numeric(dim->>'profundidade'),jsonb_build_object('bling_raw',raw,'bling_normalized_at',now()),
    production_value,free_shipping_value,(public.croma_try_numeric(raw->>'volumes'))::integer,(public.croma_try_numeric(raw->>'itensPorCaixa'))::integer,
    'cm',nullif(raw->>'gtin',''),nullif(raw->>'gtinEmbalagem',''),nullif(trib->>'cest',''),nullif(trib->>'spedTipoItem',''),
    public.croma_try_numeric(trib->>'percentualTributos'),coalesce(nullif(trib#>>'{grupoProduto,nome}',''),nullif(trib#>>'{grupoProduto,id}','')),
    public.croma_try_numeric(trib->>'valorBaseStRetencao'),public.croma_try_numeric(trib->>'valorICMSSubstituto'),
    public.croma_try_numeric(trib->>'valorPisFixo'),public.croma_try_numeric(trib->>'valorCofinsFixo'),nullif(trib->>'dadosAdicionais',''),
    nullif(trib->>'codigoANP',''),nullif(trib->>'descricaoANP',''),public.croma_try_numeric(trib->>'percentualGLP'),
    public.croma_try_numeric(trib->>'percentualGasNacional'),public.croma_try_numeric(trib->>'percentualGasImportado'),public.croma_try_numeric(trib->>'valorPartida'),now()
  ) on conflict (product_id) do update set
    brand=coalesce(excluded.brand,product_details.brand),model=coalesce(excluded.model,product_details.model),ncm=coalesce(excluded.ncm,product_details.ncm),
    origin=coalesce(excluded.origin,product_details.origin),gross_weight_kg=coalesce(excluded.gross_weight_kg,product_details.gross_weight_kg),
    net_weight_kg=coalesce(excluded.net_weight_kg,product_details.net_weight_kg),width_cm=coalesce(excluded.width_cm,product_details.width_cm),
    height_cm=coalesce(excluded.height_cm,product_details.height_cm),depth_cm=coalesce(excluded.depth_cm,product_details.depth_cm),
    specifications=coalesce(product_details.specifications,'{}'::jsonb)||excluded.specifications,production_mode=coalesce(product_details.production_mode,excluded.production_mode),
    free_shipping=excluded.free_shipping,volumes=coalesce(excluded.volumes,product_details.volumes),items_per_box=coalesce(excluded.items_per_box,product_details.items_per_box),
    gtin=coalesce(excluded.gtin,product_details.gtin),gtin_tax=coalesce(excluded.gtin_tax,product_details.gtin_tax),cest=coalesce(excluded.cest,product_details.cest),
    item_type=coalesce(excluded.item_type,product_details.item_type),approximate_tax_percent=coalesce(excluded.approximate_tax_percent,product_details.approximate_tax_percent),
    tax_group=coalesce(excluded.tax_group,product_details.tax_group),icms_st_retained_base=coalesce(excluded.icms_st_retained_base,product_details.icms_st_retained_base),
    own_icms_substitute=coalesce(excluded.own_icms_substitute,product_details.own_icms_substitute),fixed_pis=coalesce(excluded.fixed_pis,product_details.fixed_pis),
    fixed_cofins=coalesce(excluded.fixed_cofins,product_details.fixed_cofins),additional_fiscal_info=coalesce(excluded.additional_fiscal_info,product_details.additional_fiscal_info),
    anp_code=coalesce(excluded.anp_code,product_details.anp_code),anp_description=coalesce(excluded.anp_description,product_details.anp_description),
    glp_percent=coalesce(excluded.glp_percent,product_details.glp_percent),glgn_national_percent=coalesce(excluded.glgn_national_percent,product_details.glgn_national_percent),
    glgn_imported_percent=coalesce(excluded.glgn_imported_percent,product_details.glgn_imported_percent),starting_value=coalesce(excluded.starting_value,product_details.starting_value),updated_at=now();
end; $$;

create or replace function public.croma_normalize_bling_supplier_snapshot(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p public.products%rowtype; f jsonb;
begin
  select * into p from public.products where id=p_product_id and product_type='produto'; if not found then return; end if;
  f := p.metadata#>'{bling_raw,fornecedor}';
  if f is null or jsonb_typeof(f)<>'object' or f='{}'::jsonb then
    delete from public.product_supplier_external_snapshots where product_id=p_product_id and source='bling'; return;
  end if;
  insert into public.product_supplier_external_snapshots(product_id,source,external_supplier_id,external_contact_id,supplier_name,supplier_code,purchase_price,cost_price,synced_at,metadata,updated_at)
  values(p_product_id,'bling',nullif(f->>'id',''),nullif(f#>>'{contato,id}',''),nullif(f#>>'{contato,nome}',''),nullif(f->>'codigo',''),
    public.croma_try_numeric(f->>'precoCompra'),public.croma_try_numeric(f->>'precoCusto'),coalesce(p.bling_last_synced_at,now()),f,now())
  on conflict(product_id,source) do update set external_supplier_id=excluded.external_supplier_id,external_contact_id=excluded.external_contact_id,
    supplier_name=excluded.supplier_name,supplier_code=excluded.supplier_code,purchase_price=excluded.purchase_price,cost_price=excluded.cost_price,
    synced_at=excluded.synced_at,metadata=excluded.metadata,updated_at=excluded.updated_at;
end; $$;

create or replace function public.croma_normalize_bling_product_scoped(p_product_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare p_type text;
begin
  select product_type into p_type from public.products where id=p_product_id; if p_type is distinct from 'produto' then return; end if;
  perform public.croma_normalize_bling_product_details(p_product_id);
  perform public.croma_normalize_bling_supplier_snapshot(p_product_id);
  perform public.croma_normalize_bling_product(p_product_id);
end; $$;

do $$ declare r record; begin
  for r in select id from public.products where product_type='produto' and metadata ? 'bling_raw' loop perform public.croma_normalize_bling_product_scoped(r.id); end loop;
end $$;
