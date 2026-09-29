update public.site_commercial_areas
set description='Gráfica, impressos, comunicação visual, identidade, marketing, brindes, fotografia e soluções digitais.',
    sort_order=10,
    active=true,
    featured_home=true,
    updated_at=now()
where slug='comunicacao-marketing';

update public.site_commercial_areas
set slug='papelaria-presentes-eletronicos',
    name='Papelaria, Presentes & Eletrônicos',
    menu_label='Papelaria, Presentes & Eletrônicos',
    description='Papelaria, materiais criativos, presentes, eletrônicos, brinquedos, utilidades e itens para o dia a dia.',
    public_path='/papelaria-presentes-eletronicos/',
    sort_order=20,
    active=true,
    featured_home=true,
    updated_at=now()
where slug='presentes-eletronicos';

update public.site_commercial_areas
set active=false,
    featured_home=false,
    sort_order=90,
    updated_at=now()
where slug='grafica-papelaria';

with target_area as (
  select id from public.site_commercial_areas where slug='comunicacao-marketing'
), desired(family_name,family_scope,display_order) as (
  values
    ('Soluções Impressas'::text,'servico'::text,10),
    ('Papelaria Personalizada','servico',20),
    ('Comunicação Visual','servico',30),
    ('Identidade Visual','servico',40),
    ('Brindes','servico',50),
    ('Fotografia','servico',60)
)
insert into public.site_area_families(area_id,family_id,display_order,is_primary)
select ta.id,f.id,d.display_order,true
from target_area ta
join desired d on true
join public.catalog_families f on f.nome=d.family_name and f.catalog_scope=d.family_scope
on conflict (area_id,family_id) do update
set display_order=excluded.display_order,
    is_primary=true;

with target_area as (
  select id from public.site_commercial_areas where slug='papelaria-presentes-eletronicos'
), desired(family_name,family_scope,display_order) as (
  values
    ('Papelaria e Escritório'::text,'produto'::text,10),
    ('Artes e Criatividade','produto',20),
    ('Tecnologia e Eletrônicos','produto',30),
    ('Presentes e Decoração','produto',40),
    ('Presentes','servico',50)
)
insert into public.site_area_families(area_id,family_id,display_order,is_primary)
select ta.id,f.id,d.display_order,true
from target_area ta
join desired d on true
join public.catalog_families f on f.nome=d.family_name and f.catalog_scope=d.family_scope
on conflict (area_id,family_id) do update
set display_order=excluded.display_order,
    is_primary=true;

delete from public.site_area_families af
using public.site_commercial_areas a, public.catalog_families f
where af.area_id=a.id
  and af.family_id=f.id
  and a.slug='papelaria-presentes-eletronicos'
  and f.nome='Brindes'
  and f.catalog_scope='servico';
