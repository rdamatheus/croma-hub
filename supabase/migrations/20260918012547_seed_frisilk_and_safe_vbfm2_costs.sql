do $$
declare
  v_zap uuid;
  v_vbfm2 uuid;
  v_input uuid;
  v_supplier uuid;
  v_item uuid;
  v_link uuid;
  v_product uuid;
  v_service uuid;
  r record;
begin
  select s.id into v_zap
  from public.suppliers s
  where lower(s.name) like '%zap%'
  order by s.created_at
  limit 1;
  if v_zap is null then raise exception 'Zap Gráfica supplier not found'; end if;

  select sci.id into v_vbfm2
  from public.supplier_catalog_items sci
  where sci.supplier_id=v_zap and upper(sci.sku)='VBFM2'
  limit 1;
  if v_vbfm2 is null then raise exception 'VBFM2 supplier catalog item not found'; end if;

  update public.supplier_catalog_items
  set purchase_price=45.50,list_price=45.50,promotional_price=40.04,cost_price_policy='list',
      validation_status='ok',pending_purchase_price=null,validation_source='manual',
      validation_reviewed_at=coalesce(validation_reviewed_at,now()),
      validation_review_note='Preço normal confirmado na página da Zap em 17/09/2026. Promoção R$ 40,04 registrada apenas para referência; custo-base permanece R$ 45,50.',
      validation_notes='Preço normal confirmado manualmente. Não usar promoção como base de precificação.',
      original_price_text='Normal R$ 45,50 | Promoção observada R$ 40,04 em 17/09/2026',
      measurement_type='area',pricing_unit='m2',quantity_type='free',price_basis='unit',base_quantity=1,unit='m2',
      attributes=coalesce(attributes,'{}'::jsonb) || jsonb_build_object(
        'safeCostPolicy','list','normalPrice',45.50,'promotionalPrice',40.04,
        'promotionIgnoredForPricing',true,'confirmedAt','2026-09-17'
      ),
      updated_at=now()
  where id=v_vbfm2;

  select id into v_input from public.products where sku='INS-ZAP-VBFM2' limit 1;
  if v_input is null then
    insert into public.products(
      sku,nome,categoria,descricao,unidade,preco,ativo,metadata,slug,
      product_type,product_format,is_sellable,is_purchasable,is_input,controls_stock,published_on_site,notes
    )
    values(
      'INS-ZAP-VBFM2','INSUMO — ADESIVO VINIL BRANCO FOSCO VBFM2','Insumos',
      'Insumo interno de custo. Adesivo vinil branco fosco 120g, impressão 4/0, referência Zap VBFM2.',
      'm2',0,true,jsonb_build_object('internalCostOnly',true,'supplierSku','VBFM2','pricingPolicy','normal_list_price'),
      'insumo-zap-vbfm2','produto','simple',false,true,true,false,false,
      'Não publicar no site. Custo seguro usa preço normal da Zap; promoção não reduz a base.'
    )
    returning id into v_input;
  else
    update public.products
    set nome='INSUMO — ADESIVO VINIL BRANCO FOSCO VBFM2',unidade='m2',ativo=true,
        is_sellable=false,is_purchasable=true,is_input=true,controls_stock=false,published_on_site=false,
        metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('internalCostOnly',true,'supplierSku','VBFM2','pricingPolicy','normal_list_price'),
        notes='Não publicar no site. Custo seguro usa preço normal da Zap; promoção não reduz a base.',updated_at=now()
    where id=v_input;
  end if;

  select id into v_link from public.product_suppliers
  where product_id=v_input and variant_id is null and supplier_id=v_zap limit 1;
  if v_link is null then
    insert into public.product_suppliers(
      product_id,variant_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_unit,
      conversion_factor,purchase_price,freight_cost,tax_cost,other_cost,preferred,active,last_quote_at,supplier_product_description
    )
    values(
      v_input,null,v_zap,v_vbfm2,'VBFM2','m2',1,45.50,0,0,0,true,true,now(),
      'Adesivo vinil branco fosco VBFM2. Frete fixo é diluído no produto final/lote.'
    );
  else
    update public.product_suppliers
    set supplier_catalog_item_id=v_vbfm2,supplier_sku='VBFM2',purchase_unit='m2',conversion_factor=1,
        purchase_price=45.50,freight_cost=0,tax_cost=0,other_cost=0,preferred=true,active=true,last_quote_at=now(),
        supplier_product_description='Adesivo vinil branco fosco VBFM2. Frete fixo é diluído no produto final/lote.',updated_at=now()
    where id=v_link;
  end if;

  insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
  values(v_input,'VBFM2',45.50,now())
  on conflict(product_id) do update set supplier_reference='VBFM2',cost=45.50,updated_at=now();

  for v_service in select id from public.products where bling_product_id in (16463420867,16463420878)
  loop
    insert into public.product_components(
      parent_product_id,component_product_id,quantity,waste_percent,position,active,source,sync_to_bling
    )
    values(v_service,v_input,1,0,900,true,'croma_cost',false)
    on conflict do nothing;
    perform public.croma_refresh_product_cost(v_service);
  end loop;

  select id into v_supplier from public.suppliers where lower(name)=lower('Frisilk') order by created_at limit 1;
  if v_supplier is null then
    insert into public.suppliers(name,active,default_order_freight,notes)
    values('Frisilk',true,15.00,'Fornecedor preferencial de chapas PS 1 mm, 2 mm e 3 mm. Frete padrão informado: R$ 15,00.')
    returning id into v_supplier;
  else
    update public.suppliers
    set active=true,default_order_freight=15.00,
        notes=case when coalesce(notes,'')='' then 'Fornecedor preferencial de chapas PS 1 mm, 2 mm e 3 mm. Frete padrão informado: R$ 15,00.' else notes end,
        updated_at=now()
    where id=v_supplier;
  end if;

  insert into public.supplier_catalog_items(
    supplier_id,sku,name,description,category,purchase_price,list_price,promotional_price,cost_price_policy,
    minimum_order_quantity,unit,active,attributes,validation_status,validation_notes,validation_source,
    measurement_type,pricing_unit,quantity_type,price_basis,base_quantity,width,height,dimension_unit,last_synced_at
  )
  values
    (v_supplier,'FRISILK-PS-2000X1000-1MM','CHAPA PS BRANCO 2,00 X 1,00 M - 1MM','Chapa PS branca 1 mm, 2,00 x 1,00 m. Rendimento padrão Croma: 6 peças A2 por chapa.','Chapas PS',60,60,null,'list',1,'chapa',true,jsonb_build_object('thicknessMm',1,'sheetWidthM',2,'sheetHeightM',1,'a2Yield',6,'wastePolicy','full_sheet_allocated'),'ok','Preço e formato confirmados manualmente.','manual','fixed','unit','unit','unit',1,2,1,'m',now()),
    (v_supplier,'FRISILK-PS-2000X1000-2MM','CHAPA PS BRANCO 2,00 X 1,00 M - 2MM','Chapa PS branca 2 mm, 2,00 x 1,00 m. Rendimento padrão Croma: 6 peças A2 por chapa.','Chapas PS',120,120,null,'list',1,'chapa',true,jsonb_build_object('thicknessMm',2,'sheetWidthM',2,'sheetHeightM',1,'a2Yield',6,'wastePolicy','full_sheet_allocated'),'ok','Preço e formato confirmados manualmente.','manual','fixed','unit','unit','unit',1,2,1,'m',now()),
    (v_supplier,'FRISILK-PS-2000X1000-3MM','CHAPA PS BRANCO 2,00 X 1,00 M - 3MM','Chapa PS branca 3 mm, 2,00 x 1,00 m. Rendimento padrão Croma: 6 peças A2 por chapa.','Chapas PS',160,160,null,'list',1,'chapa',true,jsonb_build_object('thicknessMm',3,'sheetWidthM',2,'sheetHeightM',1,'a2Yield',6,'wastePolicy','full_sheet_allocated'),'ok','Preço e formato confirmados manualmente.','manual','fixed','unit','unit','unit',1,2,1,'m',now())
  on conflict(supplier_id,sku) do update set
    name=excluded.name,description=excluded.description,category=excluded.category,purchase_price=excluded.purchase_price,
    list_price=excluded.list_price,promotional_price=excluded.promotional_price,cost_price_policy=excluded.cost_price_policy,
    minimum_order_quantity=excluded.minimum_order_quantity,unit=excluded.unit,active=true,attributes=excluded.attributes,
    validation_status='ok',validation_notes=excluded.validation_notes,validation_source=excluded.validation_source,
    measurement_type=excluded.measurement_type,pricing_unit=excluded.pricing_unit,quantity_type=excluded.quantity_type,
    price_basis=excluded.price_basis,base_quantity=excluded.base_quantity,width=excluded.width,height=excluded.height,
    dimension_unit=excluded.dimension_unit,last_synced_at=now(),updated_at=now();

  for r in
    select * from (values
      (16558683355::bigint,'FRISILK-PS-2000X1000-1MM',60::numeric),
      (16558683375::bigint,'FRISILK-PS-2000X1000-2MM',120::numeric),
      (16558683365::bigint,'FRISILK-PS-2000X1000-3MM',160::numeric)
    ) x(bling_id,sku,sheet_price)
  loop
    select id into v_product from public.products where bling_product_id=r.bling_id limit 1;
    if v_product is null then continue; end if;
    select id into v_item from public.supplier_catalog_items where supplier_id=v_supplier and sku=r.sku limit 1;

    update public.product_suppliers set preferred=false,updated_at=now()
    where product_id=v_product and variant_id is null and active=true and supplier_id<>v_supplier and preferred=true;

    select id into v_link from public.product_suppliers
    where product_id=v_product and variant_id is null and supplier_id=v_supplier limit 1;

    if v_link is null then
      insert into public.product_suppliers(
        product_id,variant_id,supplier_id,supplier_catalog_item_id,supplier_sku,purchase_unit,conversion_factor,
        purchase_price,freight_cost,tax_cost,other_cost,minimum_order_quantity,supplier_product_description,preferred,active,last_quote_at
      )
      values(
        v_product,null,v_supplier,v_item,r.sku,'chapa',6,r.sheet_price,15,0,0,1,
        'Chapa PS 2,00 x 1,00 m; custo integral da chapa e frete diluídos em 6 peças A2.',true,true,now()
      );
    else
      update public.product_suppliers
      set supplier_catalog_item_id=v_item,supplier_sku=r.sku,purchase_unit='chapa',conversion_factor=6,
          purchase_price=r.sheet_price,freight_cost=15,tax_cost=0,other_cost=0,minimum_order_quantity=1,
          supplier_product_description='Chapa PS 2,00 x 1,00 m; custo integral da chapa e frete diluídos em 6 peças A2.',
          preferred=true,active=true,last_quote_at=now(),updated_at=now()
      where id=v_link;
    end if;

    insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
    values(v_product,r.sku,(r.sheet_price+15)/6.0,now())
    on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();
  end loop;

  select id into v_product from public.products where bling_product_id=16491193091 limit 1;
  if v_product is not null then
    insert into public.product_cost_adjustments(product_id,fixed_freight_cost,batch_quantity,labor_cost,other_cost,notes,updated_at)
    values(v_product,18,6,0,0,'Frete Zap diluído em lote padrão de 6 placas A2. A mão de obra ainda não possui custo interno definido.',now())
    on conflict(product_id) do update set fixed_freight_cost=excluded.fixed_freight_cost,batch_quantity=excluded.batch_quantity,notes=excluded.notes,updated_at=now();
    perform public.croma_refresh_product_cost(v_product);
  end if;
end $$;
