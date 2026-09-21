-- Salva a grade A4 3 mm adesivada e preserva as referências Zap A4 2 mm para precificação posterior.

insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
values('5696712f-e39c-46aa-9619-c26963ecd4a7','FRISILK-PS-2000X1000-3MM',175.00/27.00,now())
on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();

insert into public.product_costs(product_id,supplier_reference,cost,updated_at)
values('f05389e9-2778-42eb-9b9d-e8f1abf859ee','VBFM2',0.21*0.30*45.50,now())
on conflict(product_id) do update set supplier_reference=excluded.supplier_reference,cost=excluded.cost,updated_at=now();

insert into public.product_cost_adjustments(product_id,fixed_freight_cost,batch_quantity,labor_cost,other_cost,notes,updated_at)
values(
  'bc75835d-b831-4056-a8df-0ce69d476293',18.00,1,0,0,
  'Custo-base conservador para 1 placa A4: frete Zap de R$ 18 carregado integralmente. Nas grades maiores, o frete é diluído pelo lote.',
  now()
)
on conflict(product_id) do update set
  fixed_freight_cost=excluded.fixed_freight_cost,batch_quantity=excluded.batch_quantity,
  labor_cost=excluded.labor_cost,other_cost=excluded.other_cost,notes=excluded.notes,updated_at=now();

update public.products set preco=44.90,updated_at=now()
where id='bc75835d-b831-4056-a8df-0ce69d476293';

delete from public.product_price_tiers
where product_id='bc75835d-b831-4056-a8df-0ce69d476293' and variant_id is null;

insert into public.product_price_tiers(
  product_id,variant_id,min_qty,max_qty,quantity_rule,price_basis,unit_price,ativo,label,source,notes,updated_at
)
values
('bc75835d-b831-4056-a8df-0ce69d476293',null,1,1,'exact','lot',44.90,true,'1 unidade','manual','Grade comercial Croma — A4 3 mm adesivada.',now()),
('bc75835d-b831-4056-a8df-0ce69d476293',null,5,5,'exact','lot',189.90,true,'5 unidades','manual','Grade comercial Croma — A4 3 mm adesivada.',now()),
('bc75835d-b831-4056-a8df-0ce69d476293',null,10,10,'exact','lot',349.90,true,'10 unidades','manual','Grade comercial Croma — A4 3 mm adesivada.',now()),
('bc75835d-b831-4056-a8df-0ce69d476293',null,25,25,'exact','lot',799.90,true,'25 unidades','manual','Grade comercial Croma — A4 3 mm adesivada.',now()),
('bc75835d-b831-4056-a8df-0ce69d476293',null,50,50,'exact','lot',1499.90,true,'50 unidades','manual','Grade comercial Croma — A4 3 mm adesivada.',now()),
('bc75835d-b831-4056-a8df-0ce69d476293',null,100,100,'exact','lot',2799.90,true,'100 unidades','manual','Grade comercial Croma — A4 3 mm adesivada.',now());

select public.croma_refresh_product_cost('bc75835d-b831-4056-a8df-0ce69d476293');

insert into public.supplier_catalog_items(
  supplier_id,sku,name,description,category,purchase_price,list_price,promotional_price,
  cost_price_policy,minimum_order_quantity,lead_time_days,unit,active,attributes,
  source_url,original_price_text,validation_status,validation_notes,validation_reasons,validation_source,
  measurement_type,pricing_unit,quantity_type,price_basis,base_quantity,min_quantity,max_quantity,
  width,height,dimension_unit,last_synced_at,updated_at
)
values
('3fee83e7-8b01-46cc-8b00-01f9e9268e3e','PLACAIM073','PLACA IMOBILIÁRIA PSAI 2MM SEM VERNIZ 210X300MM - 4/0 - 1 UN','PSAI 2 mm, impressão direta 4/0, sem verniz, 210 x 300 mm.','Placas PS',null,null,null,'list',1,2,'lote',true,jsonb_build_object('material','PSAI 2mm','printMode','4X0','directPrint',true,'size','210x300mm','quantity',1),'https://zapgrafica.com.br/produto/categoria/placas/placa-de-ps/psai-2mm/sem-verniz/210x300mm','Referência visual confirmada no print; preço não visível.','review','Referência e quantidade confirmadas; falta registrar o preço normal da Zap.','["price_missing"]'::jsonb,'manual','fixed','lot','exact','lot',1,1,1,210,300,'mm',now(),now()),
('3fee83e7-8b01-46cc-8b00-01f9e9268e3e','PLACAIM074','PLACA IMOBILIÁRIA PSAI 2MM SEM VERNIZ 210X300MM - 4/0 - 5 UN','PSAI 2 mm, impressão direta 4/0, sem verniz, 210 x 300 mm.','Placas PS',null,null,null,'list',5,2,'lote',true,jsonb_build_object('material','PSAI 2mm','printMode','4X0','directPrint',true,'size','210x300mm','quantity',5),'https://zapgrafica.com.br/produto/categoria/placas/placa-de-ps/psai-2mm/sem-verniz/210x300mm','Referência visual confirmada no print; preço não visível.','review','Referência e quantidade confirmadas; falta registrar o preço normal da Zap.','["price_missing"]'::jsonb,'manual','fixed','lot','exact','lot',5,5,5,210,300,'mm',now(),now()),
('3fee83e7-8b01-46cc-8b00-01f9e9268e3e','PLACAIM075','PLACA IMOBILIÁRIA PSAI 2MM SEM VERNIZ 210X300MM - 4/0 - 10 UN','PSAI 2 mm, impressão direta 4/0, sem verniz, 210 x 300 mm.','Placas PS',null,null,null,'list',10,2,'lote',true,jsonb_build_object('material','PSAI 2mm','printMode','4X0','directPrint',true,'size','210x300mm','quantity',10),'https://zapgrafica.com.br/produto/categoria/placas/placa-de-ps/psai-2mm/sem-verniz/210x300mm','Referência visual confirmada no print; preço não visível.','review','Referência e quantidade confirmadas; falta registrar o preço normal da Zap.','["price_missing"]'::jsonb,'manual','fixed','lot','exact','lot',10,10,10,210,300,'mm',now(),now()),
('3fee83e7-8b01-46cc-8b00-01f9e9268e3e','PLACAIM076','PLACA IMOBILIÁRIA PSAI 2MM SEM VERNIZ 210X300MM - 4/0 - 25 UN','PSAI 2 mm, impressão direta 4/0, sem verniz, 210 x 300 mm.','Placas PS',null,null,null,'list',25,2,'lote',true,jsonb_build_object('material','PSAI 2mm','printMode','4X0','directPrint',true,'size','210x300mm','quantity',25),'https://zapgrafica.com.br/produto/categoria/placas/placa-de-ps/psai-2mm/sem-verniz/210x300mm','Referência visual confirmada no print; preço não visível.','review','Referência e quantidade confirmadas; falta registrar o preço normal da Zap.','["price_missing"]'::jsonb,'manual','fixed','lot','exact','lot',25,25,25,210,300,'mm',now(),now())
on conflict(supplier_id,sku) do update set
  name=excluded.name,description=excluded.description,category=excluded.category,
  minimum_order_quantity=excluded.minimum_order_quantity,lead_time_days=excluded.lead_time_days,
  unit=excluded.unit,active=true,attributes=excluded.attributes,source_url=excluded.source_url,
  original_price_text=excluded.original_price_text,validation_status='review',
  validation_notes=excluded.validation_notes,validation_reasons=excluded.validation_reasons,
  validation_source='manual',measurement_type=excluded.measurement_type,
  pricing_unit=excluded.pricing_unit,quantity_type=excluded.quantity_type,
  price_basis=excluded.price_basis,base_quantity=excluded.base_quantity,
  min_quantity=excluded.min_quantity,max_quantity=excluded.max_quantity,
  width=excluded.width,height=excluded.height,dimension_unit=excluded.dimension_unit,
  last_synced_at=now(),updated_at=now();
