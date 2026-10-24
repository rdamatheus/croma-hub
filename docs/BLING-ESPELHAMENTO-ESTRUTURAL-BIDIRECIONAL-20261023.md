# Croma Hub ↔ Bling — espelhamento estrutural bidirecional
Data: 2026-10-23
Status: especificação técnica e diagnóstico (somente leitura). Nenhuma alteração de produto ou sincronizador foi feita nesta etapa.

## Decisão funcional
O Bling é a referência do modelo de cadastro de produtos e serviços. O Croma Hub deve representar fielmente:
- Produto simples (formato S).
- Produto pai com variações (formato V).
- Filho/variação de um pai, identificado por `variacao.produtoPai.id` e `variacao.nome`.
- Produto com composição (formato E), cuja `estrutura.componentes` contém produtos e quantidades.
- Variação que também é uma composição: relação pai/filho e lista de componentes coexistem; não são mutuamente exclusivas.
- Configuração de estoque da composição (`tipoEstoque`, `lancamentoEstoque`) quando aplicável.
- Tipo Produto/Serviço é atributo independente da estrutura (não inferir composição apenas do tipo).

A identidade de cada cadastro é o ID Bling persistido, com SKU como identificador auxiliar. O Croma Hub mantém seu UUID local, ID externo, `parent_product_id`, `bling_parent_id`, `product_format` e `product_components`; não duplicar filhos em `product_variants` sem decisão explícita de compatibilidade.

## Estado verificado no Croma Hub (consulta SQL em 2026-10-23)
- 3.318 cadastros vinculados ao Bling.
- 822 cadastros com `bling_parent_id` e `parent_product_id` preenchidos; zero com pai Bling conhecido mas pai local ausente.
- 148 produtos pais `product_format='variation'`, todos do tipo serviço.
- 176 cadastros `product_format='composition'`: 175 serviços, 1 produto.
- 316 vínculos de componentes ativos em 170 cadastros; dois vínculos sem `external_component_id` mas com `component_product_id` local preenchido e `sync_to_bling=false`. Não tratar isso automaticamente como erro; são componentes locais.
- `product_variants` tem 695 linhas concentradas em apenas 2 `product_id`, não representa a estrutura de todos os 148 pais importados.
- 1 produto com estado `local_dirty=true`, 0 conflitos detectados na consulta.
- Família IMPRESSÃO: pai Bling 16411218543 formato V; filho P&B A4 16411219946 formato E com dois componentes; demais três filhos formato S. Proteção temporária implantada nos sincronizadores de produtos e serviços, v9.

## Lacunas identificadas no código ativo
1. `bling-product-auto-sync` ignora serviços; `bling-service-auto-sync` importa serviços mas não reconcilia seus vínculos pai/filho nem `estrutura.componentes` em `syncIn`.
2. `bling-product-auto-sync` normaliza `product_format` via `String(ext.formato).toLowerCase().includes('vari')`. Isso não reconhece corretamente os códigos 'V' e 'E' retornados no snapshot do Bling; requer correção antes de qualquer espelhamento.
3. `bling-product-auto-sync` resolve pais somente para `product_type='produto'`, enquanto os 148 pais com variações locais são serviços.
4. `product_components` é consultada no envio, mas não há garantia geral de importação reconciliada da estrutura remota para vínculos locais.
5. `bling-service-auto-sync` pode serializar saída como formato 'S' se não encontrar componentes ativos, o que é arriscado para um pai V ou filho E. O bloqueio de IMPRESSÃO evita isso apenas nessa família.
6. `bling-product-safe-sync` oferece revisão de alterações comuns, mas não contempla ainda diffs estruturais de pai, atributos de variação e composição.

## Contrato de sincronização proposto
- **Entrada (Bling → Croma)**: ler registro remoto completo; mapear `tipo`, `formato`, `variacao` e `estrutura`; resolver referências dos pais e componentes por ID Bling; construir diff; validar e aplicar em transação idempotente; atualizar baseline após sucesso; nunca apagar componentes por resposta parcial.
- **Saída (Croma → Bling)**: calcular diff apenas de campos alterados localmente; preservar formato e referências remotas que não foram explicitamente modificados; enviar para endpoints adequados de Produtos, Variações e Estruturas da API v3 conforme documentação; reler remotamente; confirmar IDs, formato, pai, componentes, quantidades e parâmetros de estoque; só então limpar `local_dirty`.
- **Conflitos**: baseline por registro e por vínculo estrutural; se ambos os lados mudarem o mesmo campo/relação, bloquear e exigir revisão. Mudanças independentes podem ser conciliadas após testes, sem 'última gravação vence' indiscriminado.
- **Integridade**: evitar ciclos pai/filho, duplicações por SKU, referências órfãs, componentes inexistentes, remoção não solicitada, mudança implícita de S/E/V, exclusão de histórico e propagação de alterações locais apenas informativas.
- **Imagens**: preservar as imagens e mídias locais; só alterar a imagem remota quando houver ação explícita e verificação da API.
- **Produtos x serviços**: preferir um módulo compartilhado de mapeamento e diff usado pelos dois sincronizadores, sem forçar mudança de `tipo`.
- **Ordem de importação**: primeiro pais e componentes referenciados, depois filhos e estruturas; se faltar dependência, registrar pendência, não excluir.
- **Proteção**: manter a família IMPRESSÃO protegida até concluir validação bidirecional. Não ativar a sincronização estrutural de todos os 3.318 registros de uma vez.

## Implantação incremental
1. **Auditoria somente leitura**: obter amostra remota atual de pai V, filho S, filho E e composição independente; comparar com snapshot e tabelas; verificar endpoints oficiais e payloads aceitos. Não usar snapshot antigo como estado atual.
2. **Mapeador puro e testes**: criar conversão S/V/E + pai + atributos + componentes + estoque, com casos de variação composta; validar diffs sem gravação.
3. **Entrada controlada**: executar importação de estruturas em amostra selecionada, com backup dos vínculos e confirmação do diff antes de gravar.
4. **Saída controlada**: preparar propostas, bloquear conflitos e exigir revisão inicial para alterações estruturais; reler Bling depois de aplicar.
5. **Piloto e expansão**: iniciar em produtos selecionados e ampliar por lotes com monitoramento de erros, diferenças e histórico.
6. **Impressões**: somente após piloto, reconciliar os cinco IDs existentes, as oito variações comerciais e composições correspondentes.

## Critérios de aceite
- Alterar componente e quantidade no Bling → Croma reflete exatamente após sincronizar.
- Alterar componente e quantidade no Croma → Bling reflete exatamente após releitura.
- Mudar atributo de uma variação não destrói composição nem vínculo pai.
- Atualizar preço/nome não muda formato S/V/E.
- Remover componente só quando remoção for explícita e validada.
- Conflito simultâneo bloqueia atualização e apresenta diff.
- Testes de idempotência: duas sincronizações sem mudanças não criam registros ou alteram dados.
- IDs, SKUs, preços, mídias e histórico preservados fora do diff aprovado.

## Fontes oficiais Bling
- API v3: https://developer.bling.com.br/referencia
- Variação composta: https://ajuda.bling.com.br/hc/pt-br/articles/34016549651095-Como-cadastrar-produtos-com-varia%C3%A7%C3%A3o-composta-no-Bling
- Variações com composição: https://ajuda.bling.com.br/hc/pt-br/articles/7121660067223-Como-cadastrar-varia%C3%A7%C3%B5es-com-composi%C3%A7%C3%A3o-kit


## Implementação incremental — 2026-10-24

A exceção hardcoded para IMPRESSÃO foi **removida** dos dois sincronizadores gerais, conforme orientação do usuário. A segurança agora é por **estrutura e alteração**, não por ID ou família comercial.

| Função | Versão | Tratamento |
|---|---:|---|
| `bling-product-auto-sync` | 10 | Reconhece S/V/E, pai Bling aninhado; preserva formato e estrutura em alterações comuns; marca alterações estruturais não reconciliadas para revisão |
| `bling-service-auto-sync` | 11 | Reconhece S/V/E, pai e composição; confere correspondência dos componentes; preserva formato e estrutura em alterações comuns; marca divergências para revisão |

**Limite da etapa:** componentes, atributos de variação e relações alterados nos dois sentidos ainda exigem implementação de reconciliação; esta etapa não promete espelhamento bidirecional estrutural completo. Nenhum cadastro foi modificado durante o deploy. Família IMPRESSÃO permanece no fluxo normal, sem exceções especiais; alterações estruturais são tratadas com a mesma regra de qualquer outro produto.

Validação: código implantado ACTIVE, GitHub idêntico, cinco registros IMPRESSÃO e suas composições preservados em SQL. Teste real de ida e volta com Bling pendente.
