alter table public.sales_proposal_items
  add column if not exists market_reference_price numeric(14,2),
  add column if not exists suggested_price numeric(14,2),
  add column if not exists market_reference_source text,
  add column if not exists market_researched_at timestamptz,
  add column if not exists market_reference_metadata jsonb not null default '{}'::jsonb;

comment on column public.sales_proposal_items.market_reference_price is
'Preço total de mercado pesquisado para o item/lote no momento da proposta.';
comment on column public.sales_proposal_items.suggested_price is
'Preço comercial sugerido para a proposta, considerando custo, markup de referência e pesquisa de mercado.';
comment on column public.sales_proposal_items.market_reference_source is
'Fonte principal usada como referência de mercado.';
comment on column public.sales_proposal_items.market_researched_at is
'Data/hora da pesquisa de mercado usada na proposta.';
comment on column public.sales_proposal_items.market_reference_metadata is
'Detalhes e fontes complementares da pesquisa de mercado, preservados como snapshot.';
