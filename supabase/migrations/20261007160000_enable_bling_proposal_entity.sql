update public.erp_connections
set enabled_entities = case
      when 'proposal' = any(enabled_entities) then enabled_entities
      else array_append(enabled_entities,'proposal'::text)
    end,
    updated_at = now()
where provider = 'bling';
