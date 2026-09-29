# Pedidos: carregamento confiável

Escopo aprovado: debounce de 300 ms, descarte de respostas obsoletas, estados de carregamento/vazio/erro e nova tentativa. Sem mudanças de consulta, autenticação, banco ou integrações.

Cada interação invalida imediatamente a resposta anterior, inclusive durante o debounce. Filtros e paginação consultam imediatamente; filtros reiniciam na página 1. Resumo e tabela antigos são removidos durante a espera. Falhas não mantêm contagem/paginação antigas. Nova tentativa preserva filtros e página. Página vazia com total positivo conserva navegação para retornar.

## Validação

Passaram: node --check js/interno-pedidos.js e node --test tests/pedidos-loading.test.cjs.
O teste usa Node nativo, DOM mínimo, temporizadores e consultas simuladas. Cobre carregamento, debounce, respostas invertidas, resposta durante debounce, erro de API, rejeição de rede, recuperação, filtros, paginação e vazio. Nenhuma consulta real foi executada.

## Pendências antes da produção

- Conferência visual em desktop e celular: navegador indisponível e download falhou; sem screenshots.
- Smoke test autenticado em ambiente de revisão, preservando as permissões existentes.
- Aprovação explícita para integração/publicação.

Busca por nome do cliente permanece com a limitação preexistente e será tratada separadamente. Requisições já enviadas não são canceladas; suas respostas são ignoradas se obsoletas. Sem timeout novo.

Risco: regressão na combinação de filtros/paginação e mudança visual ao ocultar resultados durante carregamento. Reversão: reverter o commit desta PR. Nenhuma restauração de banco necessária.
