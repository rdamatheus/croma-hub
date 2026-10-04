-- Permissões mínimas usadas pela Edge Function bling-proposal-sync.
-- A função apenas lê os itens da proposta e atualiza o estado/snapshots da proposta.
grant select, update on table public.sales_proposals to service_role;
grant select on table public.sales_proposal_items to service_role;
