# Inteligência de demanda — Fase 1 (14/10/2026)

## Objetivo e decisão
Priorizar pesquisa de fornecedores com base nas cotações mais frequentes, sem alterar custos, preços de venda, fornecedores preferenciais ou pedidos. Implementação autorizada para a Fase 1, sem agendamento de consultas externas.

## Arquitetura
- Fonte: `sales_proposals`, `sales_proposal_items` e `products` já existentes.
- View: `public.supplier_demand_priority_90d` (leitura, janela móvel de 90 dias).
- Interface: `/interno/fornecedores/demanda/`, acessível pela área de fornecedores.
- Segurança: view `security_invoker` + `security_barrier`; `SELECT` apenas para `authenticated`, com RLS das tabelas-base e verificação de owner/manager na interface.
- Propostas importadas do Bling usam `bling_response_snapshot.data` como data de cotação quando disponível; outras usam `created_at` no horário de São Paulo.
- Cada proposta conta **uma vez por família**, mesmo com várias opções de quantidade.
- Famílias identificadas por termos das descrições; itens sem correspondência entram em **Outros / classificação pendente**.
- Prioridades: alta >= 5 propostas em 30 dias (intervalo sugerido 2 dias); média 2–4 (7 dias); baixa 0–1 (30 dias). Outros requer revisão e não recebe frequência automática.

## Impactos e riscos
Nenhuma alteração nos cadastros de produtos, cotações ou fornecedores. O ranking é uma análise indicativa, não um contador de vendas. Descrições genéricas ou inconsistentes podem classificar famílias incorretamente; 156/175 linhas de cotação estavam sem vínculo direto de produto no diagnóstico inicial. A fonte atual também não representa necessariamente toda a procura que ocorre fora das propostas cadastradas (WhatsApp e balcão).

## Validação
- Migração aplicada no projeto Supabase `croma-hub` e consulta `SELECT` retornou 13 famílias, incluindo adesivos e etiquetas (10 propostas em 30 dias).
- Verificadas opções `security_invoker=true` e `security_barrier=true`.
- Interface e link publicados no repositório GitHub; validação visual autenticada no navegador ainda pendente.

## Pendências e próximo passo
1. Conferir visualização com conta de gestão e políticas RLS em sessão autenticada.
2. Melhorar correspondência de itens sem produto vinculado e registrar cotações de WhatsApp/balcão para refletir a demanda real.
3. Fase 2, somente após nova aprovação: validar integração de preços e SKUs com Zap e outros fornecedores, sem atualização automática de preços de venda.
