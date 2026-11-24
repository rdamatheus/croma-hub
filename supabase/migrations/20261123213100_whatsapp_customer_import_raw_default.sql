create or replace function public.import_whatsapp_customer(p_customer_id uuid,p_import_id uuid,p_messages jsonb,p_files jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 c public.customer_profiles%rowtype;
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
 select * into strict c from public.customer_profiles where id=p_customer_id;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,0));
 select id into existing_id from public.lab_whatsapp_atendimentos where id=p_import_id and customer_id=p_customer_id and created_by=auth.uid();
 if existing_id is not null then
  select coalesce(jsonb_agg(storage_path),'[]'::jsonb) into accepted from public.lab_whatsapp_anexos where atendimento_id=existing_id;
  return jsonb_build_object('id',existing_id,'messages',0,'files',0,'accepted',accepted,'replayed',true);
 end if;
 insert into public.lab_whatsapp_atendimentos(id,created_by,customer_id,contact_name,contact_phone,source,message_count,raw_chat)
 values(p_import_id,auth.uid(),c.id,coalesce(c.nome,'Contato WhatsApp'),coalesce(nullif(c.celular,''),c.telefone),'whatsapp_cliente',0,'{}'::jsonb) returning id into a_id;
 for m in select * from jsonb_to_recordset(p_messages) as x(fingerprint text,date text,time text,author text,body text,direction text,external_id text,file_names text,raw jsonb)
 loop
  if m.fingerprint is null or m.fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'Identificador de mensagem inválido';end if;
  if exists(select 1 from public.lab_whatsapp_mensagens lm join public.lab_whatsapp_atendimentos la on la.id=lm.atendimento_id where la.customer_id=c.id and (lm.import_fingerprint=m.fingerprint or (nullif(m.external_id,'') is not null and lm.external_message_id=m.external_id))) then continue;end if;
  n:=n+1;
  insert into public.lab_whatsapp_mensagens(atendimento_id,external_message_id,sequence,message_date,message_time,author,body,direction,file_names,raw_data,import_fingerprint)
  values(a_id,nullif(m.external_id,''),n,m.date,m.time,m.author,m.body,case when m.direction in ('enviada','recebida') then m.direction else 'indefinida' end,m.file_names,coalesce(m.raw,'{}'::jsonb),m.fingerprint);
 end loop;
 for f in select * from jsonb_to_recordset(p_files) as x(hash text,path text,name text,mime text,size bigint,category text)
 loop
  if f.hash is null or f.hash !~ '^[a-f0-9]{64}$' or f.path is null or f.path not like ('whatsapp-lab/'||auth.uid()::text||'/'||a_id::text||'/%') or f.size is null or f.size not between 0 and 52428800 then raise exception 'Anexo inválido';end if;
  if not exists(select 1 from storage.objects where bucket_id='croma-arquivos' and name=f.path) then raise exception 'Anexo não encontrado';end if;
  if exists(select 1 from public.lab_whatsapp_anexos lf join public.lab_whatsapp_atendimentos la on la.id=lf.atendimento_id where la.customer_id=c.id and lf.content_sha256=f.hash) then continue;end if;
  m_id:=null;
  select case when count(*)=1 then min(lm.id::text)::uuid else null end into m_id
  from public.lab_whatsapp_mensagens lm join public.lab_whatsapp_atendimentos la on la.id=lm.atendimento_id
  where la.customer_id=c.id and (f.name=any(string_to_array(coalesce(lm.file_names,''),'|')) or position(f.name in coalesce(lm.body,''))>0);
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
revoke all on function public.import_whatsapp_customer(uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.import_whatsapp_customer(uuid,uuid,jsonb,jsonb) to authenticated;
