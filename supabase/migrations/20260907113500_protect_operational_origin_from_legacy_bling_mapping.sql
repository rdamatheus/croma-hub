-- Compatibilidade com importadores antigos: evita classificar tipoProducao='T' como produção própria.
-- P do Bling é produção própria; T permanece sem classificação operacional porque pode significar terceirizado ou revenda no contexto Croma.
create or replace function public.croma_normalize_product_production_mode()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare raw_type text;
begin
  if new.production_mode not in ('propria','terceiros') then return new; end if;
  select upper(coalesce(metadata#>>'{bling_raw,tipoProducao}','')) into raw_type from public.products where id=new.product_id;
  if new.production_mode='terceiros' then
    new.production_mode := 'terceirizado';
  elsif raw_type='P' then
    new.production_mode := 'producao_interna';
  elsif raw_type='T' then
    new.production_mode := null;
  else
    new.production_mode := 'producao_interna';
  end if;
  return new;
end; $$;

drop trigger if exists product_details_normalize_production_mode on public.product_details;
create trigger product_details_normalize_production_mode
before insert or update of production_mode on public.product_details
for each row execute function public.croma_normalize_product_production_mode();
