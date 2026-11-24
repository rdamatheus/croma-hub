-- Consulta paginada, somente leitura, usando o cadastro mestre e RLS existentes.
create or replace function public.whatsapp_customer_directory(p_query text default '',p_history_only boolean default true,p_sort text default 'recent',p_offset integer default 0,p_limit integer default 30)
returns table(id uuid,nome text,nome_fantasia text,telefone text,celular text,ativo boolean,bling_contact_id bigint,last_import timestamptz,message_count bigint,file_count bigint,total_count bigint)
language sql stable security invoker set search_path='' as $$
with params as (
 select translate(lower(trim(coalesce(p_query,''))),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn') as q,
 regexp_replace(coalesce(p_query,''),'[^0-9]','','g') as digits,
 coalesce(p_query,'') ~ '^[0-9+(). /-]+$' as numeric_search
), hist as (
 select a.customer_id,max(a.created_at) as last_import
 from public.lab_whatsapp_atendimentos a where a.customer_id is not null group by a.customer_id
), matched as (
 select c.id,c.nome,c.nome_fantasia,c.telefone,c.celular,c.ativo,c.bling_contact_id,h.last_import,count(*) over() as total_count
 from public.customer_profiles c left join hist h on h.customer_id=c.id cross join params p
 where auth.uid() is not null and (select app_private.is_staff())
 and (not p_history_only or h.customer_id is not null)
 and (p_history_only or c.ativo)
 and (p.q='' or (
  not exists(select 1 from regexp_split_to_table(p.q,'[[:space:]]+') t(token)
   where strpos(translate(lower(concat_ws(' ',c.nome,c.nome_fantasia,c.email,c.telefone,c.celular,c.cpf,c.bling_contact_id::text)),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),t.token)=0)
 ) or (p.numeric_search and length(p.digits)>=4 and (
  strpos(regexp_replace(coalesce(c.telefone,''),'[^0-9]','','g'),p.digits)>0 or
  strpos(regexp_replace(coalesce(c.celular,''),'[^0-9]','','g'),p.digits)>0 or
  (length(p.digits) in (12,13) and left(p.digits,2)='55' and (
   strpos(regexp_replace(coalesce(c.telefone,''),'[^0-9]','','g'),substring(p.digits from 3))>0 or
   strpos(regexp_replace(coalesce(c.celular,''),'[^0-9]','','g'),substring(p.digits from 3))>0)) or
  strpos(regexp_replace(coalesce(c.cpf,''),'[^0-9]','','g'),p.digits)>0 or c.bling_contact_id::text=p.digits
 )))
), paged as (
 select * from matched m order by case when p_sort='recent' then m.last_import end desc nulls last,lower(m.nome),m.id
 offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,30),1),100)
)
select p.id,p.nome,p.nome_fantasia,p.telefone,p.celular,p.ativo,p.bling_contact_id,p.last_import,
 (select count(*) from public.lab_whatsapp_mensagens m join public.lab_whatsapp_atendimentos a on a.id=m.atendimento_id where a.customer_id=p.id),
 (select count(*) from public.lab_whatsapp_anexos f join public.lab_whatsapp_atendimentos a on a.id=f.atendimento_id where a.customer_id=p.id),
 p.total_count
from paged p order by case when p_sort='recent' then p.last_import end desc nulls last,lower(p.nome),p.id;
$$;
revoke all on function public.whatsapp_customer_directory(text,boolean,text,integer,integer) from public,anon;
grant execute on function public.whatsapp_customer_directory(text,boolean,text,integer,integer) to authenticated;
