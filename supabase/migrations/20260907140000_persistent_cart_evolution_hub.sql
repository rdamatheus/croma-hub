-- Carrinho persistente, checkout transacional e Evolução Croma Hub

create table if not exists public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active','converted','cleared','abandoned')),
  client_reference text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  converted_at timestamptz,
  unique(customer_id, client_reference)
);
create unique index if not exists carts_one_active_per_customer on public.carts(customer_id) where status='active';

create table if not exists public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  client_item_id text not null,
  product_id uuid references public.products(id) on delete set null,
  variant_id uuid references public.product_variants(id) on delete set null,
  product_name text not null,
  quantity integer not null check(quantity > 0),
  unit_price numeric(12,2) not null check(unit_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(cart_id, client_item_id)
);
create index if not exists cart_items_cart_idx on public.cart_items(cart_id);

create table if not exists public.cart_item_options (
  id uuid primary key default gen_random_uuid(),
  cart_item_id uuid not null references public.cart_items(id) on delete cascade,
  option_name text not null,
  option_value text not null,
  position integer not null default 0,
  unique(cart_item_id, option_name)
);

create table if not exists public.cart_files (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  cart_item_id uuid references public.cart_items(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  client_file_id text not null,
  bucket text not null default 'croma-arquivos',
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint not null check(size_bytes >= 0),
  created_at timestamptz not null default now(),
  unique(cart_id, client_file_id)
);

alter table public.orders add column if not exists checkout_reference text;
create unique index if not exists orders_customer_checkout_ref_uidx on public.orders(customer_id, checkout_reference) where checkout_reference is not null;

alter table public.orders add column if not exists delivery_street text;
alter table public.orders add column if not exists delivery_number text;
alter table public.orders add column if not exists delivery_complement text;
alter table public.orders add column if not exists delivery_neighborhood text;
alter table public.orders add column if not exists delivery_city text;
alter table public.orders add column if not exists delivery_state text;
alter table public.orders add column if not exists delivery_zip text;

create table if not exists public.order_item_options (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  option_name text not null,
  option_value text not null,
  position integer not null default 0,
  unique(order_item_id, option_name)
);

create table if not exists public.system_evolution_areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.system_evolution_items (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.system_evolution_areas(id) on delete restrict,
  parent_id uuid references public.system_evolution_items(id) on delete set null,
  title text not null,
  item_type text not null default 'task' check(item_type in ('initiative','task','idea','decision','debt')),
  status text not null default 'planned' check(status in ('idea','planned','in_progress','blocked','done','cancelled')),
  priority text not null default 'P2' check(priority in ('P0','P1','P2','P3')),
  horizon text not null default 'current' check(horizon in ('current','next','future')),
  objective text,
  acceptance_criteria text,
  notes text,
  source_ref text,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists evolution_items_area_idx on public.system_evolution_items(area_id,status,priority);
create index if not exists evolution_items_parent_idx on public.system_evolution_items(parent_id);

create table if not exists public.system_evolution_dependencies (
  item_id uuid not null references public.system_evolution_items(id) on delete cascade,
  depends_on_item_id uuid not null references public.system_evolution_items(id) on delete cascade,
  primary key(item_id,depends_on_item_id),
  check(item_id <> depends_on_item_id)
);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.cart_item_options enable row level security;
alter table public.cart_files enable row level security;
alter table public.order_item_options enable row level security;
alter table public.system_evolution_areas enable row level security;
alter table public.system_evolution_items enable row level security;
alter table public.system_evolution_dependencies enable row level security;

revoke all on public.carts, public.cart_items, public.cart_item_options, public.cart_files, public.order_item_options, public.system_evolution_areas, public.system_evolution_items, public.system_evolution_dependencies from anon;
grant select,insert,update,delete on public.carts, public.cart_items, public.cart_item_options, public.cart_files to authenticated;
grant select on public.order_item_options to authenticated;
grant select,insert,update,delete on public.system_evolution_areas, public.system_evolution_items, public.system_evolution_dependencies to authenticated;

create policy carts_own_all on public.carts for all to authenticated using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()));
create policy cart_items_own_all on public.cart_items for all to authenticated using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()) and exists(select 1 from public.carts c where c.id=cart_id and c.customer_id=(select auth.uid())));
create policy cart_options_own_all on public.cart_item_options for all to authenticated using(exists(select 1 from public.cart_items i where i.id=cart_item_id and i.customer_id=(select auth.uid()))) with check(exists(select 1 from public.cart_items i where i.id=cart_item_id and i.customer_id=(select auth.uid())));
create policy cart_files_own_all on public.cart_files for all to authenticated using(customer_id=(select auth.uid())) with check(customer_id=(select auth.uid()) and exists(select 1 from public.carts c where c.id=cart_id and c.customer_id=(select auth.uid())));
create policy order_item_options_own_select on public.order_item_options for select to authenticated using(exists(select 1 from public.order_items i where i.id=order_item_id and i.customer_id=(select auth.uid())));
create policy order_item_options_staff_all on public.order_item_options for all to authenticated using((select app_private.is_staff())) with check((select app_private.is_staff()));
create policy evolution_areas_staff_all on public.system_evolution_areas for all to authenticated using((select app_private.is_staff())) with check((select app_private.is_staff()));
create policy evolution_items_staff_all on public.system_evolution_items for all to authenticated using((select app_private.is_staff())) with check((select app_private.is_staff()));
create policy evolution_dependencies_staff_all on public.system_evolution_dependencies for all to authenticated using((select app_private.is_staff())) with check((select app_private.is_staff()));

create or replace function public.sync_active_cart(p_client_reference text, p_items jsonb, p_files jsonb default '[]'::jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_uid uuid := auth.uid(); v_cart uuid; v_item jsonb; v_opt jsonb; v_file jsonb; v_item_id uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select id into v_cart from public.carts where customer_id=v_uid and status='active' limit 1;
 if v_cart is null then insert into public.carts(customer_id,client_reference) values(v_uid,p_client_reference) returning id into v_cart; end if;
 delete from public.cart_items where cart_id=v_cart;
 for v_item in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
   insert into public.cart_items(cart_id,customer_id,client_item_id,product_id,variant_id,product_name,quantity,unit_price)
   values(v_cart,v_uid,v_item->>'id',nullif(v_item->>'productId','')::uuid,nullif(v_item->>'variantId','')::uuid,v_item->>'name',greatest(1,(v_item->>'qty')::int),greatest(0,(v_item->>'unitPrice')::numeric)) returning id into v_item_id;
   for v_opt in select * from jsonb_array_elements(coalesce(v_item->'options','[]'::jsonb)) loop
     insert into public.cart_item_options(cart_item_id,option_name,option_value,position) values(v_item_id,v_opt->>'name',v_opt->>'value',coalesce((v_opt->>'position')::int,0));
   end loop;
 end loop;
 delete from public.cart_files where cart_id=v_cart;
 for v_file in select * from jsonb_array_elements(coalesce(p_files,'[]'::jsonb)) loop
   select id into v_item_id from public.cart_items where cart_id=v_cart and client_item_id=v_file->>'cartItemId';
   insert into public.cart_files(cart_id,cart_item_id,customer_id,client_file_id,bucket,storage_path,original_name,mime_type,size_bytes)
   values(v_cart,v_item_id,v_uid,v_file->>'id',coalesce(nullif(v_file->>'bucket',''),'croma-arquivos'),v_file->>'path',v_file->>'name',v_file->>'type',coalesce((v_file->>'size')::bigint,0));
 end loop;
 update public.carts set updated_at=now() where id=v_cart;
 return v_cart;
end $$;
revoke all on function public.sync_active_cart(text,jsonb,jsonb) from public,anon;
grant execute on function public.sync_active_cart(text,jsonb,jsonb) to authenticated;

create or replace function public.get_active_cart()
returns table(cart_id uuid, client_reference text, item_id text, product_id uuid, variant_id uuid, product_name text, quantity integer, unit_price numeric, option_name text, option_value text, option_position integer, file_id text, file_name text, file_type text, file_size bigint, file_path text, file_bucket text)
language sql security invoker set search_path='' as $$
 select c.id,c.client_reference,i.client_item_id,i.product_id,i.variant_id,i.product_name,i.quantity,i.unit_price,o.option_name,o.option_value,o.position,f.client_file_id,f.original_name,f.mime_type,f.size_bytes,f.storage_path,f.bucket
 from public.carts c left join public.cart_items i on i.cart_id=c.id left join public.cart_item_options o on o.cart_item_id=i.id left join public.cart_files f on f.cart_item_id=i.id
 where c.customer_id=auth.uid() and c.status='active' order by i.created_at,o.position;
$$;
revoke all on function public.get_active_cart() from public,anon;
grant execute on function public.get_active_cart() to authenticated;

create or replace function public.checkout_active_cart(p_checkout_reference text,p_fulfillment text,p_payment_method text,p_delivery_fee numeric default 0,p_notes text default null,p_delivery_street text default null,p_delivery_number text default null,p_delivery_complement text default null,p_delivery_neighborhood text default null,p_delivery_city text default null,p_delivery_state text default null,p_delivery_zip text default null)
returns table(order_id uuid,order_code text,total numeric) language plpgsql security invoker set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_cart uuid; v_order uuid; v_code text; v_sub numeric; v_total numeric; r record; v_order_item uuid;
begin
 if v_uid is null then raise exception 'Authentication required'; end if;
 select o.id,o.order_code,o.total into v_order,v_code,v_total from public.orders o where o.customer_id=v_uid and o.checkout_reference=p_checkout_reference;
 if v_order is not null then return query select v_order,v_code,v_total; return; end if;
 select id into v_cart from public.carts where customer_id=v_uid and status='active' for update;
 if v_cart is null then raise exception 'Active cart not found'; end if;
 select coalesce(sum(quantity*unit_price),0) into v_sub from public.cart_items where cart_id=v_cart;
 if v_sub<=0 then raise exception 'Cart is empty'; end if;
 v_total:=v_sub+greatest(coalesce(p_delivery_fee,0),0);
 v_code:='CRO-'||to_char(clock_timestamp(),'YYYYMMDD-HH24MISS')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));
 insert into public.orders(order_code,customer_id,status,fulfillment,payment_method,subtotal,delivery_fee,total,notes,checkout_reference,delivery_street,delivery_number,delivery_complement,delivery_neighborhood,delivery_city,delivery_state,delivery_zip,delivery_address)
 values(v_code,v_uid,'recebido',p_fulfillment,p_payment_method,v_sub,greatest(coalesce(p_delivery_fee,0),0),v_total,p_notes,p_checkout_reference,p_delivery_street,p_delivery_number,p_delivery_complement,p_delivery_neighborhood,p_delivery_city,p_delivery_state,p_delivery_zip,case when p_fulfillment='entrega' then jsonb_strip_nulls(jsonb_build_object('street',p_delivery_street,'number',p_delivery_number,'complement',p_delivery_complement,'neighborhood',p_delivery_neighborhood,'city',p_delivery_city,'state',p_delivery_state,'zip',p_delivery_zip)) else null end) returning id into v_order;
 for r in select * from public.cart_items where cart_id=v_cart order by created_at loop
   insert into public.order_items(order_id,customer_id,product_name,quantity,unit_price,total,options) values(v_order,v_uid,r.product_name,r.quantity,r.unit_price,r.quantity*r.unit_price,'{}'::jsonb) returning id into v_order_item;
   insert into public.order_item_options(order_item_id,option_name,option_value,position) select v_order_item,option_name,option_value,position from public.cart_item_options where cart_item_id=r.id;
   insert into public.order_files(order_id,order_item_id,customer_id,bucket,storage_path,original_name,mime_type,size_bytes) select v_order,v_order_item,v_uid,bucket,storage_path,original_name,mime_type,size_bytes from public.cart_files where cart_item_id=r.id;
 end loop;
 update public.carts set status='converted',converted_at=now(),updated_at=now() where id=v_cart;
 return query select v_order,v_code,v_total;
end $$;
revoke all on function public.checkout_active_cart(text,text,text,numeric,text,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.checkout_active_cart(text,text,text,numeric,text,text,text,text,text,text,text,text) to authenticated;

insert into public.system_evolution_areas(code,name,description,position) values
('commercial','Comercial','Compra, orçamento, pedidos e conversão.',10),('catalog','Catálogo','Produtos, serviços, famílias, categorias e variações.',20),('frontend','Front-end','Experiência pública e interna.',30),('backend','Back-end','Dados, regras, transações e automações.',40),('integrations','Integrações','Bling e demais sistemas externos.',50),('security','Infraestrutura & Segurança','RLS, Storage, autenticação e confiabilidade.',60),('quality','Documentação & Qualidade','Arquitetura, testes, documentação e evolução.',70)
on conflict(code) do update set name=excluded.name,description=excluded.description,position=excluded.position;

insert into public.system_evolution_items(area_id,title,item_type,status,priority,horizon,objective,source_ref,position)
select a.id,v.title,v.item_type,v.status,v.priority,v.horizon,v.objective,v.source_ref,v.position from public.system_evolution_areas a join (values
('commercial','Carrinho persistente por cliente','task','done','P0','current','Manter itens e arquivos entre sessões e dispositivos autenticados.','20260907140000_persistent_cart_evolution_hub.sql',10),
('commercial','Checkout híbrido: banco + WhatsApp','task','done','P0','current','Registrar o pedido antes de abrir o atendimento no WhatsApp.','carrinho/index.html',20),
('backend','Checkout transacional e idempotente','task','done','P0','current','Evitar pedidos parciais e duplicados.','checkout_active_cart',10),
('security','Arquivos privados vinculados ao pedido','task','done','P0','current','Persistir arquivo no Storage privado e vínculo relacional no banco.','order_files',10),
('catalog','Famílias e categorias oficiais','initiative','done','P1','current','Manter hierarquia comercial do catálogo.','docs/VERSOES.md',10),
('catalog','Capas de famílias e categorias','task','planned','P1','next','Completar apresentação visual da navegação do catálogo.',null,20),
('catalog','Variações pai/filho sincronizadas com Bling','task','planned','P1','next','Consolidar grades e variações usando o Bling como fonte oficial.',null,30),
('frontend','Revisão geral da experiência pública','initiative','in_progress','P1','current','Reduzir ruído e alinhar o front-end à hierarquia atual.',null,10),
('frontend','Página pública completa de produto/serviço','task','planned','P1','next','Consolidar detalhe, configuração, mídia e compra.',null,20),
('integrations','Sincronização automática Bling','initiative','done','P0','current','Manter catálogo mestre sincronizado com o ERP.','docs/VERSOES.md',10),
('quality','Evolução Croma Hub no painel interno','task','done','P1','current','Centralizar roadmap, backlog e ideias do sistema sem redundância.','/interno/evolucao-croma-hub/',10),
('quality','Limpeza de uploads de rascunhos antigos','idea','idea','P2','future','Remover arquivos abandonados após janela de retenção definida.',null,20),
('quality','Revisão contínua da documentação técnica','initiative','in_progress','P2','current','Manter arquitetura, versões e roadmap coerentes com o sistema real.','docs/ARQUITETURA.md',30)
) as v(code,title,item_type,status,priority,horizon,objective,source_ref,position) on a.code=v.code
where not exists(select 1 from public.system_evolution_items i where i.area_id=a.id and i.title=v.title);
