# Hardening de uso do Supabase — Croma Hub

Data: 2026-09-23

## Motivo

A auditoria identificou bloqueio por `exceed_egress_quota`, provocado principalmente por reconciliações automáticas muito frequentes com o Bling.

Antes da correção:

- produtos: cron a cada 5 minutos;
- serviços: cron a cada 5 minutos;
- contatos: cron a cada 5 minutos;
- taxonomia: cron a cada 1 minuto;
- taxonomia percorria milhares de produtos mesmo quando havia apenas poucos pendentes;
- serviços percorriam páginas gerais de produtos para depois descartar itens que não eram serviços;
- contatos inválidos permaneciam em fila de retry sem limite de tentativas.

## Estado seguro aplicado

Os quatro jobs continuam cadastrados, mas estão com `active=false`.

As agendas pretendidas após validação são:

- produto: `0 */6 * * *`;
- serviço: `10 */6 * * *`;
- contato: `20 */6 * * *`;
- taxonomia: `30 */6 * * *`.

Eles não devem ser reativados antes de:
1. o bloqueio de egress estar resolvido;
2. as quatro Edge Functions estarem na versão deste hardening;
3. um teste manual de cada fluxo concluir sem regressões.

## Segunda trava de consumo

Os intervalos internos de pull de produtos, serviços e contatos foram elevados para 1440 minutos.

Assim, quando os crons forem reativados a cada 6 horas:

- alterações locais pendentes podem ser empurradas ao Bling a cada ciclo;
- reconciliação inbound completa/incremental ocorre no máximo uma vez por dia;
- execuções intermediárias retornam sem varrer o catálogo.

## Produtos

`bling-product-auto-sync`:

- usa `dataAlteracaoInicial` e `dataAlteracaoFinal` no pull incremental;
- mantém cursor de página e período até concluir o lote;
- deixa de percorrer o catálogo inteiro apenas para resolver pais de variações;
- resolve pais somente para os produtos processados no lote;
- ao obter baseline de produto que aguardava taxonomia, devolve o status da taxonomia para `pending`.

## Serviços

`bling-service-auto-sync`:

- consulta `/produtos` com `tipo=S`;
- usa filtro por período de alteração;
- mantém paginação incremental;
- evita percorrer páginas de produtos comuns para encontrar serviços;
- respeita o intervalo interno de 1440 minutos.

## Contatos

`bling-contact-sync`:

- normaliza CEP: somente 8 dígitos são gravados; valor inválido fica nulo e o valor original permanece no `bling_raw`;
- normaliza UF: somente duas letras válidas são gravadas;
- remove duplicidade de papéis/tipos de contato antes do insert;
- retries externos possuem backoff;
- após 3 falhas, o item sai da fila ativa e vai para `contacts_retry_dead_letter`;
- pull inbound respeita intervalo interno de 1440 minutos.

Nenhum contato é excluído por essa regra. O dead-letter apenas impede tentativas infinitas.

## Taxonomia

`bling-taxonomy-sync`:

- não carrega mais todos os produtos para descobrir pendências;
- usa `taxonomy_sync_candidates(limit)`, que retorna somente os candidatos necessários;
- usa `taxonomy_sync_metrics()` para métricas agregadas;
- produto sem baseline passa para `waiting_baseline`, sem retry automático;
- quando o baseline chega pelo sync de produtos, volta para `pending`;
- erros transitórios usam backoff;
- após 3 erros, o item fica `blocked` para revisão em vez de consumir recursos indefinidamente.

### Situação encontrada em produção

Três letreiros estavam em loop com:
`Produto sem payload-base do Bling.`

Foi confirmado que nenhum dos três possuía registro em `erp_product_sync_state`.
Eles foram movidos para `waiting_baseline`.

Após a correção:
- 3301 produtos com taxonomia sincronizada;
- 12 bloqueados para revisão;
- 3 aguardando baseline;
- 0 pendentes;
- 0 em erro.

## O que não foi feito

Para não comprometer o sistema, nesta fase não houve:

- exclusão de produtos, clientes, pedidos ou arquivos;
- exclusão dos jobs do cron;
- limpeza destrutiva de logs;
- remoção de índices;
- alteração dos tokens OAuth do Bling;
- reativação automática dos crons.

A tabela de histórico do pg_cron ainda ocupa espaço físico relevante e será tratada separadamente, somente depois da estabilização.

## Reativação recomendada

Reativar um fluxo por vez, nesta ordem:

1. produtos;
2. serviços;
3. contatos;
4. taxonomia.

Após cada ativação, observar:
- quantidade de Edge Function invocations;
- egress;
- `erp_sync_jobs`;
- erros HTTP;
- tempo de execução;
- alterações reais no Bling/Croma.

Se houver regressão, basta executar `cron.alter_job(job_id, active := false)` no job correspondente.
