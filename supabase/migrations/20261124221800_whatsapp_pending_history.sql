create or replace function public.import_whatsapp_pending(p_group_id uuid,p_import_id uuid,p_contact_name text,p_contact_phone text,p_messages jsonb,p_files jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 g uuid:=coalesce(p_group_id,p_import_id);
 contact_label text:=left(coalesce(nullif(trim(p_contact_name),''),'Contato sem nome'),200);
 contact_number text:=nullif(left(regexp_replace(coalesce(p_contact_phone,''),'[^0-9]','','g'),30),'');
 a_id uuid;
 m record;
 f record;
 m_id uuid;
 n integer:=0;
 k integer:=0;
 accepted jsonb:='[]'::jsonb;
 existing_id uuid;
begin
 if auth.uid() is null or not app_private.is_staff() then raise exception 'Acesso interno necessário' using errcode='42501'; end if;
 if jsonb_typeof(p_messages) is distinct from 'array' or jsonb_typeof(p_files) is distinct from 'array' then raise exception 'Importação inválida'; end if;
 if jsonb_array_length(p_messages)>10000 or jsonb_array_length(p_files)>2000 then raise exception 'Limite de importação'; end if;
 if p_import_id is null then raise exception 'Lote inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-pending:'||g::text,0));
 select id into existing_id from public.lab_whatsapp_atendimentos where id=p_import_id and source in ('whatsapp_pendente','whatsapp_cliente') and raw_chat->>'pending_group'=g::text and created_by=auth.uid();
 if existing_id is not null then
  select coalesce(jsonb_agg(storage_path),'[]'::jsonb) into accepted from public.lab_whatsapp_anexos where atendimento_id=existing_id;
  return jsonb_build_object('id',existing_id,'messages',0,'files',0,'accepted',accepted,'replayed',true);
 end if;
 if p_group_id is not null then
  select contact_name,contact_phone into strict contact_label,contact_number from public.lab_whatsapp_atendimentos where id=g and source='whatsapp_pendente' and customer_id is null;
 end if;
 insert into public.lab_whatsapp_atendimentos(id,created_by,customer_id,contact_name,contact_phone,source,message_count,raw_chat)
 values(p_import_id,auth.uid(),null,contact_label,contact_number,'whatsapp_pendente',0,jsonb_build_object('pending_group',g)) returning id into a_id;
 for m in select * from jsonb_to_recordset(p_messages) as x(fingerprint text,date text,time text,author text,body text,direction text,external_id text,file_names text,raw jsonb)
 loop
  if m.fingerprint is null or m.fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Identificador de mensagem inválido';end if;
  if exists(select 1 from public.lab_whatsapp_mensagens lm join public.lab_whatsapp_atendimentos la on la.id=lm.atendimento_id where la.customer_id is null and la.source='whatsapp_pendente' and la.raw_chat->>'pending_group'=g::text and (lm.import_fingerprint=m.fingerprint or (nullif(m.external_id,'') is not null and lm.external_message_id=m.external_id))) then continue;end if;
  n:=n+1;
  insert into public.lab_whatsapp_mensagens(atendimento_id,external_message_id,sequence,message_date,message_time,author,body,direction,file_names,raw_data,import_fingerprint)
  values(a_id,nullif(m.external_id,''),n,m.date,m.time,m.author,m.body,case when m.direction in ('enviada','recebida') then m.direction else 'indefinida' end,m.file_names,coalesce(m.raw,'{}'::jsonb),m.fingerprint);
 end loop;
 for f in select * from jsonb_to_recordset(p_files) as x(hash text,path text,name text,mime text,size bigint,category text)
 loop
  if f.hash is null or f.hash !~ '^[a-f0-9]{64}$' or f.path is null or f.path not like ('whatsapp-lab/'||auth.uid()::text||'/'||a_id::text||'/%') or f.size is null or f.size not between 0 and 52428800 then raise exception 'Anexo inválido';end if;
  if not exists(select 1 from storage.objects where bucket_id='croma-arquivos' and name=f.path) then raise exception 'Anexo não encontrado';end if;
  if exists(select 1 from public.lab_whatsapp_anexos lf join public.lab_whatsapp_atendimentos la on la.id=lf.atendimento_id where la.customer_id is null and la.source='whatsapp_pendente' and la.raw_chat->>'pending_group'=g::text and lf.content_sha256=f.hash) then continue;end if;
  m_id:=null;
  select case when count(*)=1 then min(lm.id::text)::uuid else null end into m_id
  from public.lab_whatsapp_mensagens lm join public.lab_whatsapp_atendimentos la on la.id=lm.atendimento_id
  where la.customer_id is null and la.source='whatsapp_pendente' and la.raw_chat->>'pending_group'=g::text and (f.name=any(string_to_array(coalesce(lm.file_names,''),'|')) or position(f.name in coalesce(lm.body,''))>0);
  insert into public.lab_whatsapp_anexos(atendimento_id,mensagem_id,created_by,kind,file_name,mime_type,size_bytes,storage_path,content_sha256)
  values(a_id,m_id,auth.uid(),case when f.category in ('imagem','audio','video','pdf','documento') then f.category else 'outro' end,f.name,f.mime,f.size,f.path,f.hash);
  accepted:=accepted||jsonb_build_array(f.path);k:=k+1;
 end loop;
 if n+k=0 then
  delete from public.lab_whatsapp_atendimentos where id=a_id;
  a_id:=null;
 else
  update public.lab_whatsapp_atendimentos set message_count=n where id=a_id;
 end if;
 return jsonb_build_object('id',a_id,'messages',n,'files',k,'accepted',accepted);
end;$$;
revoke all on function public.import_whatsapp_pending(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.import_whatsapp_pending(uuid,uuid,text,text,jsonb,jsonb) to authenticated;

-- Vínculo explícito: preserva lotes, mensagens e mídias. Conflitos não são apagados automaticamente.
create or replace function public.link_whatsapp_pending(p_group_id uuid,p_customer_id uuid)
returns integer language plpgsql security invoker set search_path='' as $$
declare n integer; c public.customer_profiles%rowtype;
begin
 if auth.uid() is null or not app_private.is_staff() then raise exception 'Acesso interno necessário' using errcode='42501';end if;
 if p_group_id is null or p_customer_id is null then raise exception 'Selecione o histórico e o cliente';end if;
 perform pg_advisory_xact_lock(hashtextextended('whatsapp-pending:'||p_group_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
 select * into strict c from public.customer_profiles where id=p_customer_id;
 if not exists(select 1 from public.lab_whatsapp_atendimentos where id=p_group_id and source='whatsapp_pendente' and customer_id is null) then raise exception 'Histórico pendente não encontrado';end if;
 if exists(select 1 from public.lab_whatsapp_atendimentos a where a.source='whatsapp_pendente' and a.customer_id is null and a.raw_chat->>'pending_group'=p_group_id::text and not (a.created_by=auth.uid() or app_private.is_manager())) then raise exception 'Vínculo restrito ao responsável ou à gestão';end if;
 -- Sobreposição é bloqueada para não apagar anexos nem misturar conversas por engano.
 if exists(select 1 from public.lab_whatsapp_mensagens m join public.lab_whatsapp_atendimentos a on a.id=m.atendimento_id join public.lab_whatsapp_mensagens d on ((m.import_fingerprint is not null and m.import_fingerprint=d.import_fingerprint) or (nullif(m.external_message_id,'') is not null and m.external_message_id=d.external_message_id)) join public.lab_whatsapp_atendimentos b on b.id=d.atendimento_id where a.source='whatsapp_pendente' and a.customer_id is null and a.raw_chat->>'pending_group'=p_group_id::text and b.customer_id=p_customer_id) or exists(select 1 from public.lab_whatsapp_anexos m join public.lab_whatsapp_atendimentos a on a.id=m.atendimento_id join public.lab_whatsapp_anexos d on m.content_sha256=d.content_sha256 join public.lab_whatsapp_atendimentos b on b.id=d.atendimento_id where a.source='whatsapp_pendente' and a.customer_id is null and a.raw_chat->>'pending_group'=p_group_id::text and b.customer_id=p_customer_id) then raise exception 'Há conteúdo repetido no cadastro de destino. Revisão necessária; nenhum dado foi alterado.';end if;
 update public.lab_whatsapp_atendimentos set customer_id=c.id,source='whatsapp_cliente' where source='whatsapp_pendente' and customer_id is null and raw_chat->>'pending_group'=p_group_id::text;
 get diagnostics n=row_count;return n;
end;$$;
revoke all on function public.link_whatsapp_pending(uuid,uuid) from public,anon;
grant execute on function public.link_whatsapp_pending(uuid,uuid) to authenticated;

-- Busca paginada de contatos ainda não cadastrados, sem misturar o laboratório.
create or replace function public.whatsapp_pending_directory(p_query text default '',p_offset integer default 0,p_limit integer default 30)
returns table(id uuid,contact_name text,contact_phone text,last_import timestamptz,total_count bigint)
language sql stable security invoker set search_path='' as $$
with roots as (
 select a.id,a.contact_name,a.contact_phone,
 (select max(b.created_at) from public.lab_whatsapp_atendimentos b where b.source='whatsapp_pendente' and b.customer_id is null and b.raw_chat->>'pending_group'=a.id::text) as last_import
 from public.lab_whatsapp_atendimentos a
 where auth.uid() is not null and (select app_private.is_staff())
 and a.source='whatsapp_pendente' and a.customer_id is null and a.raw_chat->>'pending_group'=a.id::text
 and (trim(coalesce(p_query,''))='' or strpos(lower(a.contact_name),lower(trim(p_query)))>0 or (length(regexp_replace(coalesce(p_query,''),'[^0-9]','','g'))>=4 and strpos(coalesce(a.contact_phone,''),regexp_replace(p_query,'[^0-9]','','g'))>0))
)
select r.id,r.contact_name,r.contact_phone,r.last_import,count(*) over() from roots r
order by r.last_import desc nulls last,r.id offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,30),1),100);
$$;
revoke all on function public.whatsapp_pending_directory(text,integer,integer) from public,anon;
grant execute on function public.whatsapp_pending_directory(text,integer,integer) to authenticated;
create index if not exists lab_whatsapp_pending_group_idx on public.lab_whatsapp_atendimentos ((raw_chat->>'pending_group')) where source='whatsapp_pendente' and customer_id is null;

-- Comparação conservadora de telefone: não confunde números de DDDs diferentes.
create or replace function public.whatsapp_contact_candidates(p_name text default '',p_phone text default '')
returns table(id uuid,nome text,nome_fantasia text,telefone text,celular text,ativo boolean,bling_contact_id bigint,phone_match boolean)
language sql stable security invoker set search_path='' as $$
with input as (
 select translate(lower(trim(coalesce(p_name,''))),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn') as name,
 regexp_replace(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'),'^55([0-9]{10,11})$','\1') as phone
), matches as (
 select c.id,c.nome,c.nome_fantasia,c.telefone,c.celular,c.ativo,c.bling_contact_id,
 exists(select 1 from (values (c.telefone),(c.celular)) v(num) cross join lateral (select regexp_replace(regexp_replace(coalesce(v.num,''),'[^0-9]','','g'),'^55([0-9]{10,11})$','\1') as n) x
 where length(i.phone)>=10 and (x.n=i.phone or (length(i.phone)=10 and length(x.n)=11 and substring(x.n,3,1)='9' and left(i.phone,2)||'9'||substring(i.phone,3)=x.n) or (length(i.phone)=11 and length(x.n)=10 and substring(i.phone,3,1)='9' and left(x.n,2)||'9'||substring(x.n,3)=i.phone))) as phone_match,
 (length(i.name)>=2 and i.name in (translate(lower(trim(c.nome)),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),translate(lower(trim(coalesce(c.nome_fantasia,''))),'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'))) as name_match
 from public.customer_profiles c cross join input i
 where auth.uid() is not null and (select app_private.is_staff())
)
select m.id,m.nome,m.nome_fantasia,m.telefone,m.celular,m.ativo,m.bling_contact_id,m.phone_match
from matches m where m.phone_match or m.name_match order by m.phone_match desc,m.ativo desc,lower(m.nome),m.id limit 100;
$$;
revoke all on function public.whatsapp_contact_candidates(text,text) from public,anon;
grant execute on function public.whatsapp_contact_candidates(text,text) to authenticated;
