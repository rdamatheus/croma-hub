-- Complemento da Fase 1: identifica serviços de arte e aplicação descritos com medidas antes do serviço.
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
        or match_text ~* '^[[:space:]]*cria[çc][ãa]o e adequa[çc][ãa]o da arte'
        or match_text ~* 'aplica[çc][ãa]o de adesivo'
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

