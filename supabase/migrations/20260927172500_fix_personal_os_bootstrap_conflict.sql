create or replace function personal_os.ensure_personal_workspace()
returns table(workspace_id uuid,workspace_name text,member_role text)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_workspace_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select
    coalesce(
      nullif(u.raw_user_meta_data->>'full_name',''),
      nullif(u.raw_user_meta_data->>'name',''),
      nullif(u.raw_user_meta_data->>'nome',''),
      nullif(split_part(coalesce(u.email,''),'@',1),''),
      'Usuário'
    ),
    coalesce(u.raw_user_meta_data->>'avatar_url',u.raw_user_meta_data->>'picture')
  into v_name,v_avatar
  from auth.users u
  where u.id=v_uid;

  insert into personal_os.profiles(id,display_name,avatar_url)
  values(v_uid,v_name,v_avatar)
  on conflict(id) do update
    set display_name=coalesce(personal_os.profiles.display_name,excluded.display_name),
        avatar_url=coalesce(personal_os.profiles.avatar_url,excluded.avatar_url),
        updated_at=now();

  select w.id into v_workspace_id
  from personal_os.workspaces w
  where w.owner_user_id=v_uid
    and w.kind='personal'
    and w.archived_at is null
  limit 1;

  if v_workspace_id is null then
    insert into personal_os.workspaces(owner_user_id,name,kind)
    values(v_uid,'Personal OS de '||v_name,'personal')
    returning id into v_workspace_id;
  end if;

  insert into personal_os.workspace_members(workspace_id,user_id,role,status)
  values(v_workspace_id,v_uid,'owner','active')
  on conflict on constraint workspace_members_pkey do update
    set role='owner',status='active',updated_at=now();

  return query
  select w.id,w.name,wm.role
  from personal_os.workspaces w
  join personal_os.workspace_members wm
    on wm.workspace_id=w.id and wm.user_id=v_uid
  where w.id=v_workspace_id;
end;
$$;
