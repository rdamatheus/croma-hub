-- Fase 1: ranking de demanda de cotações (90 dias), sem atualização de preços.
-- Propostas do Bling usam data original; alternativas da mesma proposta contam uma vez por família.
create or replace view public.supplier_demand_priority_90d
with (security_invoker = true, security_barrier = true)
as
WITH quote_lines AS (
         SELECT p.id AS proposal_id,
                CASE
                    WHEN (p.bling_response_snapshot ->> 'data'::text) ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'::text THEN (p.bling_response_snapshot ->> 'data'::text)::date
                    ELSE (p.created_at AT TIME ZONE 'America/Sao_Paulo'::text)::date
                END AS quote_date,
            COALESCE(NULLIF(btrim(pr.nome), ''::text), i.description, ''::text) AS item_name,
            i.description
           FROM sales_proposals p
             JOIN sales_proposal_items i ON i.proposal_id = p.id
             LEFT JOIN products pr ON pr.id = i.product_id
          WHERE p.status <> 'cancelled'::text
        ), classified AS (
         SELECT quote_lines.proposal_id,
            quote_lines.quote_date,
            quote_lines.item_name,
                CASE
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(agenda|caderno|apostila)'::text THEN 'Agendas, cadernos e apostilas'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(adesiv|etiqueta|rótulo|rotulo|bopp|vinil)'::text THEN 'Adesivos e etiquetas'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(panfleto|flyer|folder|folheto)'::text THEN 'Panfletos e folders'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(cartão de visita|cartao de visita)'::text THEN 'Cartões de visita'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(banner|lona|roll.up)'::text THEN 'Banners e lonas'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(placa|acm|pvc)'::text THEN 'Placas e sinalização'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(revista|livreto|livrinho)'::text THEN 'Revistas e livretos'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(sacola|caixa personalizada|embalagem)'::text THEN 'Sacolas e embalagens'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(convite|(^|[^[:alpha:]])tags?([^[:alpha:]]|$))'::text THEN 'Convites e tags'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* '(crachá|cracha|cordão|cordao)'::text THEN 'Crachás e cordões'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* 'envelope'::text THEN 'Envelopes'::text
                    WHEN ((quote_lines.item_name || ' '::text) || quote_lines.description) ~* 'pasta'::text THEN 'Pastas'::text
                    ELSE 'Outros / classificação pendente'::text
                END AS product_family
           FROM quote_lines
          WHERE quote_lines.quote_date >= (CURRENT_DATE - 89) AND quote_lines.quote_date <= CURRENT_DATE
        ), summary AS (
         SELECT classified.product_family,
            count(DISTINCT classified.proposal_id)::integer AS quotes_90d,
            count(DISTINCT classified.proposal_id) FILTER (WHERE classified.quote_date >= (CURRENT_DATE - 29))::integer AS quotes_30d,
            count(DISTINCT classified.proposal_id) FILTER (WHERE classified.quote_date >= (CURRENT_DATE - 6))::integer AS quotes_7d,
            max(classified.quote_date) AS last_quote_date
           FROM classified
          GROUP BY classified.product_family
        )
 SELECT product_family,
    quotes_7d,
    quotes_30d,
    quotes_90d,
    last_quote_date,
        CASE
            WHEN product_family = 'Outros / classificação pendente'::text THEN 'revisar'::text
            WHEN quotes_30d >= 5 THEN 'alta'::text
            WHEN quotes_30d >= 2 THEN 'media'::text
            ELSE 'baixa'::text
        END AS research_priority,
        CASE
            WHEN product_family = 'Outros / classificação pendente'::text THEN NULL::integer
            WHEN quotes_30d >= 5 THEN 2
            WHEN quotes_30d >= 2 THEN 7
            ELSE 30
        END AS suggested_interval_days
   FROM summary;

comment on view public.supplier_demand_priority_90d is 'Ranking interno por família de produto: 90 dias móveis, datas originais do Bling, propostas distintas por família e prioridade sugerida. Não modifica preços ou fornecedores.';
revoke all on public.supplier_demand_priority_90d from public, anon;
grant select on public.supplier_demand_priority_90d to authenticated;
