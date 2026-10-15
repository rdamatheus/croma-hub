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

## Correções aprovadas e implementadas em 14/10/2026
- Migrações incrementais: `20261014234000_refine_supplier_demand_classification_traceability.sql`, `20261014235000_refine_demand_service_description_patterns.sql` e `20261014235500_refine_demand_manuals_and_stationery.sql`.
- View de rastreabilidade `public.supplier_demand_quote_lines_90d`: data original, número da proposta, ID do item, descrição, família e elegibilidade de pesquisa; sem dados pessoais do cliente.
- View de ranking existente mantida no mesmo nome e estrutura de colunas. Conta propostas distintas por família e exclui serviços de aplicação e arte.
- Precedência de classificação: serviços explícitos, produto principal (ex.: placa), famílias gráficas específicas, papelaria e demais materiais, adesivos e, por último, classificação pendente.
- Categorias adicionadas: cardápios, ingressos, blocos e comandas, cartazes, manuais e apostilas, cartões de agradecimento, tatuagens temporárias, impressos promocionais, impressões avulsas, papelaria e suprimentos, materiais e suportes, letreiros.
- Painel permite abrir "Ver propostas" por família e conferir número da proposta, data, descrições e opções; botão separado mostra serviços excluídos.
- Segurança: views com `security_invoker` e `security_barrier`; acesso `SELECT` para `authenticated`, negado a `anon`; políticas de RLS das tabelas-base mantidas. A interface exige `owner` ou `manager`.
- Validação no banco: 175 itens e 33 propostas nos últimos 90 dias; 13 linhas de serviços excluídas em 8 propostas; zero propostas sem classificação nos últimos 30 dias; adesivos e etiquetas agora 7 propostas em 30 dias (eram 10).
- Validados exemplos: placas sem adesivo, adesivo com aplicação opcional, aplicação com medidas antes da descrição, manual automotivo, cardápios, ingressos, blocos, itens descartáveis.
- Não foram alterados dados de negócio, preços, SKUs, fornecedores, pedidos ou automações.
- Pendente: teste de interface em sessão real de gestor; o ranking depende de propostas cadastradas e não representa toda procura informal.

## Integração de usabilidade (14/10/2026)
- Adicionado módulo próprio **Inteligência de fornecedores** ao diretório principal e ao menu lateral compartilhado, dentro de **Produtos, compras e produção**, visível para Proprietário/Gerência. A rota existente `/interno/fornecedores/demanda/` foi preservada.
- Acesso alternativo continua disponível em **Fornecedores → Demanda de cotações**. Links internos para fornecedores, catálogos e propostas.
- Painel exibe famílias monitoradas, número de famílias com prioridade alta e soma de ocorrências por família nos últimos 30 dias (esta soma não é o total de propostas únicas).
- Busca textual por família e filtro de prioridade. Ação **Ver propostas** por linha, com consulta à view de rastreabilidade, e ação para ver serviços excluídos.
- Layout responsivo: em telas até 720px a tabela de ranking vira cartões, sem rolagem horizontal para essa tabela. A tabela detalhada mantém rolagem quando necessário.
- Conteúdo do ranking permanece oculto até autenticação e autorização. Estados de acesso restrito, falha e nova tentativa.
- Ajustados os identificadores de versão dos scripts de navegação para reduzir risco de cache antigo.
- Testes estáticos: arquivos e links conferidos no GitHub; view de ranking consultada no Supabase. Teste de uso real no site publicado, sessão autenticada e dispositivos ainda pendente.
- Fase 2 (pesquisa automática e comparação de preço/frete/prazo) permanece fora do escopo e não foi ativada.
