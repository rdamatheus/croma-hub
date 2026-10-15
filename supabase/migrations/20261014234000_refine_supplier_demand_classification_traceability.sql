-- Croma Hub: revisão da classificação e rastreabilidade do ranking de fornecedores.
-- Não altera propostas, preços, produtos, fornecedores ou pedidos.
-- Acesso de leitura respeita RLS das tabelas-base (security_invoker).

create or replace view public.supplier_demand_quote_lines_90d
with (security_invoker = true, security_barrier = true)
as
with source_lines as (
  select
    p.id as proposal_id,
    p.proposal_no,
    i.id as proposal_item_id,
    i.product_id,
    i.description,
    i.quantity,
    case
      when p.bling_response_snapshot->>'data' ~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
      then (p.bling_response_snapshot->>'data')::date
      else (p.created_at at time zone 'America/Sao_Paulo')::date
    end as quote_date,
    coalesce(nullif(btrim(i.description), ''), nullif(btrim(pr.nome), ''), '') as match_text
  from public.sales_proposals p
  join public.sales_proposal_items i on i.proposal_id = p.id
  left join public.products pr on pr.id = i.product_id
  where p.status <> 'cancelled'
),
classified as (
  select *,
    case
      -- Serviços independentes não representam compras de materiais.
      when match_text ~* '^[[:space:]]*(aplica[çc][ãa]o|servi[çc]o de aplica[çc][ãa]o|suporte [áa]rea:designer|cria[çc][ãa]o/adequa[çc][ãa]o|cria[çc][ãa]o de arte|edi[çc][ãa]o de arte|desenvolvimento de arte)'
        or match_text ~* '(aplica[çc][ãa]o opcional|aplica[çc][ãa]o dos [0-9]+ adesivos|aplica[çc][ãa]o no local do cliente)'
        then 'Serviços / fora da pesquisa'
      -- Especificação principal prevalece sobre insumo ou negativa (ex.: placa sem adesivo).
      when match_text ~* '(placas?|ps/psai|[[:<:]]acm[[:>:]]|[[:<:]]pvc[[:>:]])' then 'Placas e sinalização'
      when match_text ~* '(agendas?|cadernos?|apostilas?)' then 'Agendas, cadernos e apostilas'
      when match_text ~* '(card[áa]pios?)' then 'Cardápios'
      when match_text ~* '(ingressos?)' then 'Ingressos'
      when match_text ~* '(cartazes?)' then 'Cartazes'
      when match_text ~* '(blocos?|comandas?|rifas?)' then 'Blocos e comandas'
      when match_text ~* '(revistas?|livretos?|livrinhos?)' then 'Revistas e livretos'
      when match_text ~* '(panfletos?|flyers?|folders?|folhetos?)' then 'Panfletos e folders'
      when match_text ~* '(cart[ãa]o de visita|cart[õo]es de visita)' then 'Cartões de visita'
      when match_text ~* '(cart[ãa]o de agradecimento|cart[õo]es de agradecimento)' then 'Cartões de agradecimento'
      when match_text ~* '(banners?|lonas?|roll.up)' then 'Banners e lonas'
      when match_text ~* '(crach[áa]s?|credenciais?|cord[ãa]o|cord[õo]es)' then 'Crachás e credenciais'
      when match_text ~* '(envelopes?)' then 'Envelopes'
      when match_text ~* '(pastas?)' then 'Pastas'
      when match_text ~* '(sacolas?|caixa personalizada|embalagens?|papel de seda)' then 'Sacolas e embalagens'
      when match_text ~* '(convites?|(^|[^[:alpha:]])tags?([^[:alpha:]]|$))' then 'Convites e tags'
      when match_text ~* '(tatuagem tempor[áa]ria)' then 'Tatuagens temporárias'
      when match_text ~* '(prismas? de mesa|jogos? americanos?)' then 'Impressos promocionais'
      when match_text ~* '(letreiros?|letra caixa)' then 'Letreiros e comunicação visual'
      when match_text ~* '(canetas?|borrachas?|apontadores?|tesouras?|papel chamex|papel sulfite|papel toalha|fita adesiva|cola bast[aã]o|garfos? descart[aá]v|copos? descart[aá]v)' then 'Papelaria e suprimentos'
      when match_text ~* '(molduras?|corti[çc]a|vidros?)' then 'Materiais e suportes'
      when match_text ~* '(adesiv|etiquetas?|r[óo]tulos?|bopp|vinil)' then 'Adesivos e etiquetas'
      else 'Outros / classificação pendente'
    end as product_family
  from source_lines
  where quote_date between (now() at time zone 'America/Sao_Paulo')::date - 89
    and (now() at time zone 'America/Sao_Paulo')::date
)
select
  proposal_id, proposal_no, proposal_item_id, product_id, quote_date,
  description, quantity, product_family,
  case when product_family = 'Serviços / fora da pesquisa' then 'servico' else 'produto' end as item_kind,
  (product_family <> 'Serviços / fora da pesquisa') as research_eligible
from classified;

comment on view public.supplier_demand_quote_lines_90d is
'Rastreabilidade do ranking por item e proposta, com serviços separados. Acesso apenas pela RLS das propostas e itens.';
revoke all on public.supplier_demand_quote_lines_90d from public, anon;
grant select on public.supplier_demand_quote_lines_90d to authenticated;

create or replace view public.supplier_demand_priority_90d
with (security_invoker = true, security_barrier = true)
as
with summary as (
  select product_family,
    count(distinct proposal_id) filter (where quote_date >= (now() at time zone 'America/Sao_Paulo')::date - 6)::integer as quotes_7d,
    count(distinct proposal_id) filter (where quote_date >= (now() at time zone 'America/Sao_Paulo')::date - 29)::integer as quotes_30d,
    count(distinct proposal_id)::integer as quotes_90d,
    max(quote_date) as last_quote_date
  from public.supplier_demand_quote_lines_90d
  where research_eligible
  group by product_family
)
select product_family, quotes_7d, quotes_30d, quotes_90d, last_quote_date,
  case
    when product_family = 'Outros / classificação pendente' then 'revisar'
    when quotes_30d >= 5 then 'alta'
    when quotes_30d >= 2 then 'media'
    else 'baixa'
  end as research_priority,
  case
    when product_family = 'Outros / classificação pendente' then null::integer
    when quotes_30d >= 5 then 2
    when quotes_30d >= 2 then 7
    else 30
  end as suggested_interval_days
from summary;

comment on view public.supplier_demand_priority_90d is
'Ranking por família nos últimos 90 dias; serviços excluídos, proposta única por família, rastreabilidade em supplier_demand_quote_lines_90d. Somente leitura.';
revoke all on public.supplier_demand_priority_90d from public, anon;
grant select on public.supplier_demand_priority_90d to authenticated;
