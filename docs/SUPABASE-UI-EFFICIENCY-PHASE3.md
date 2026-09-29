# Supabase UI — eficiência fase 3

Data: 2026-09-29

## Contexto

Depois das fases anteriores, o teste controlado caiu de 2.268 requisições para 144 e depois 136, sem erros HTTP. Com os loops eliminados, ficaram visíveis quatro fontes de egress ainda evitáveis: preload de até 1.000 produtos no Comercial, leitura integral de Insumos, repetição dos metadados de áreas comerciais na Home e leituras duplicadas do diretório de fornecedores na ficha de produto.

## Insumos

Antes:

- a tela carregava todos os registros `products.is_input = true` em páginas internas de 1.000;
- depois percorria todos os IDs em blocos de 150 para buscar `product_suppliers`;
- busca e filtros eram aplicados somente no navegador.

Depois:

- `internal_inputs_page()` aplica busca, tipo, status e paginação no PostgreSQL;
- limite da tela: 50 linhas por página;
- o fornecedor principal é resolvido no banco por `LATERAL`, priorizando o vínculo preferencial;
- `internal_inputs_kpis()` entrega os quatro indicadores em uma única chamada;
- a busca continua cobrindo nome, SKU, fornecedor, SKU do fornecedor e canal de compra;
- medição aquecida da página de 50 produtos: aproximadamente 3,5 ms.

No momento da implementação existiam 364 itens marcados como insumo: 79 produtos e 285 serviços.

## Comercial / propostas rápidas

Antes, abrir a tela carregava até 1.000 produtos ativos e vendáveis para preencher um `<select>`.

Depois:

- nenhum produto é carregado ao abrir a tela;
- a busca começa após 2 caracteres;
- debounce de 300 ms;
- no máximo 40 produtos são retornados por pesquisa;
- criação da proposta, cálculo por quantidade e snapshot de fornecedor permanecem inalterados.

## Home pública

`loadCommercialArea()` chamava `loadCommercialAreas()` novamente para cada área. Como a Home já carregava a lista de áreas antes, as consultas de `site_commercial_areas`, `site_area_families` e `catalog_families` eram repetidas quase simultaneamente.

Agora o módulo usa promises em cache durante a vida da página:

- uma carga base de áreas comerciais por página;
- deduplicação também por `slug + itemLimit` para cargas simultâneas da mesma área;
- cache é descartado automaticamente em caso de erro e pode ser explicitamente atualizado com `refresh`.

## Fornecedores na ficha de produto

O enhancer da ficha chamava `listSupplierDirectory()` e, em paralelo, fazia uma segunda consulta direta à tabela `suppliers` para localizar cadastros sem contato.

Agora:

- `listSupplierDirectory({ includeStandalone: true })` resolve contatos e fornecedores avulsos na mesma carga;
- o diretório usa promise cache por página;
- mutações que podem criar/extender fornecedores invalidam o cache;
- o enhancer não faz mais sua própria segunda leitura de `suppliers`.

## Segurança e escopo

- RPCs novas são `security invoker`;
- `anon` não possui `EXECUTE`;
- `authenticated` possui `EXECUTE`;
- nenhuma política RLS foi relaxada;
- nenhum dado comercial foi excluído ou regravado pela migração;
- nenhum cron do Bling foi reativado;
- as otimizações alteram somente como dados existentes são lidos.

## Reteste

Repetir, após atualização forçada do navegador:

1. abrir Comercial e pesquisar um produto;
2. abrir Insumos e pesquisar/trocar filtros;
3. abrir uma ficha de Produto;
4. abrir a Home pública.

Verificar principalmente ausência de `products?limit=1000`, redução de leituras de `suppliers` na ficha e apenas uma sequência base de áreas/famílias na Home.
