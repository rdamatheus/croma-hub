# Hardening de leituras duplicadas da interface

Data: 2026-09-29

## Escopo

Esta etapa é deliberadamente restrita a reduzir leituras redundantes observadas nos logs do Supabase, sem alterar dados, crons, integração Bling, RLS ou estrutura de banco.

## Home pública

Os dados-base de áreas comerciais (`site_commercial_areas`, `site_area_families` e `catalog_families`) já possuíam cache em memória dentro de `commercial-areas-data.js`, mas esse cache era isolado por instância do módulo.

A implementação passou a compartilhar o estado por `globalThis`, incluindo a promessa em andamento e o cache das áreas individuais. Assim, instâncias diferentes do módulo dentro do mesmo documento reutilizam a mesma leitura em vez de iniciarem chamadas paralelas equivalentes.

O cache continua limitado ao ciclo de vida da página. Não foi adicionado armazenamento persistente nem alteração de semântica dos dados.

## Ficha de produto

A ficha observada nos logs executava em paralelo a mesma consulta detalhada de `product_suppliers` para o mesmo produto.

O enhancer de fornecedores agora compartilha entre instâncias:

- o estado de montagem em andamento;
- o produto já montado;
- as leituras de vínculos de fornecedor que ainda estejam em voo.

A deduplicação de `product_suppliers` é somente para requisições simultâneas. A promessa é removida após concluir, portanto operações de vincular, editar, trocar preferencial ou desvincular continuam recarregando dados atualizados.

## Origem do `product_suppliers ... limit=1000`

O resíduo foi localizado e não foi alterado nesta etapa para evitar ampliar o escopo.

A origem é `loadSupplierLinkContext()` em `js/supplier-admin-shared.js`. Essa função usa `fetchAll()` com lote padrão de 1000 registros para montar contexto enriquecido de vínculos.

Chamadas confirmadas:

1. `js/interno-fornecedores.js` chama `loadSupplierLinkContext()` sem fornecedor, produzindo a leitura geral de `product_suppliers` com `offset=0&limit=1000`.
2. `js/interno-fornecedor-catalogo.js` chama `loadSupplierLinkContext(supplierId)`, produzindo a mesma leitura limitada ao fornecedor aberto.

Esse fluxo alimenta KPIs, produtos vinculados e detecção de divergências. Uma otimização futura deve substituir a leitura total por agregações/RPCs e contexto sob demanda, em vez de apenas reduzir o tamanho do lote, pois paginar com lotes menores reduziria o tamanho de cada resposta mas não o volume total transferido.

## Fora do escopo

- ativação ou alteração de cron;
- sincronização Bling;
- alteração de dados comerciais;
- migrações ou novas funções SQL;
- mudança do comportamento funcional das telas de fornecedores.
