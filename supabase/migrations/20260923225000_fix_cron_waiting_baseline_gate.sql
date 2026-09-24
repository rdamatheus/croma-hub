do $$
declare
  j record;
  new_command text;
begin
  for j in
    select jobid, command
    from cron.job
    where command ilike '%bling-product-auto-sync%'
       or command ilike '%bling-service-auto-sync%'
       or command ilike '%bling-contact-sync%'
       or command ilike '%bling-taxonomy-sync%'
  loop
    new_command := replace(
      j.command,
      'not in (''synced'',''blocked'')',
      'not in (''synced'',''blocked'',''waiting_baseline'')'
    );
    perform cron.alter_job(j.jobid, command := new_command, active := false);
  end loop;
end $$;