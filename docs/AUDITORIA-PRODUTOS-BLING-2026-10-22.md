# Auditoria de produtos, atributos e integração Bling — 22/10/2026

**Projeto:** Croma Hub  
**Escopo:** diagnóstico somente de leitura do banco Supabase e revisão da estrutura de integração; não houve consulta autenticada comparativa de todos os produtos diretamente à API do Bling nesta auditoria.  
**Regra:** não alterar cadastros, tributação, estoque, preços, integrações ou documentos fiscais automaticamente com base nestes números.

## 1. Situação encontrada

| Indicador | Quantidade | Interpretação |
|---|---:|---|
| Produtos Croma | 3.326 | Universo cadastrado |
| `products.bling_sync_status = sincronizado` | 3.314 | Estado local informado; não é prova de igualdade campo a campo com o Bling |
| `pendente` | 4 | Revisar antes de reprocessar |
| `nao_sincronizado` | 8 | Revisar origem e intenção de cadastro |
| Produtos com `bling_product_id` | 3.318 | IDs externos conhecidos |
| Mapeamentos ERP de produto `synced` | 3.317 | Sem referência a produto local inexistente ou ID divergente entre os mapeamentos conferidos |
| Produtos com pelo menos uma imagem ativa | 1.927 | Imagens locais, não necessariamente sincronizadas com o Bling |
| Linhas de detalhes técnicos | 2.142 | Há produtos sem linha em `product_details` |
| Produtos com preço nulo, zero ou negativo | 424 | Separar serviços, produtos sem preço e possíveis erros; não corrigir em lote |
| Linhas de preços por quantidade | 8 | Cobertura baixa para produtos de gráfica; não implica erro dos preços básicos |
| Linhas de `product_pricing` | 16 | Motor de precificação ainda pouco preenchido |
| Vínculos produto-fornecedor | 1.205 | Reutilizar, não criar catálogo paralelo |
| Registros de campos personalizados | 6.523 | Preservados como dados importados do Bling |
| Campos personalizados sem rótulo legível em `item` | 6.515 | Ponto prioritário de interpretação/mapeamento |
| Produtos com algum campo personalizado | 1.207 | Não presumir que os demais devam ter atributos |
| Associações em `product_fiscal_profiles` | 0 | Conferir uso real do módulo fiscal antes de qualquer preenchimento |

Os números refletem o estado da base no momento da consulta. Alguns contadores têm universos diferentes: linhas de mídia, detalhes, produtos e atributos não são equivalentes.

## 2. Estruturas existentes que devem ser reaproveitadas

- **Identidade do produto:** `products.id`, `sku`, `bling_sku`, `bling_product_id`, `nome`, `product_type`, `unidade`, `parent_product_id`.
- **Descrição e atributos comerciais:** `products.descricao`, `short_description`, `complementary_description`, `product_details.specifications`, `product_custom_field_values`.
- **Dimensões e fiscal:** `product_details` contém dimensões, GTIN, NCM, CEST, origem, campos tributários e outras informações. `product_fiscal_profiles` existe, mas não possui vínculos cadastrados.
- **Imagens:** `product_media`, com `kind`, `url`, `is_primary`, `ativo`, `source`; a origem está vazia na maioria das imagens ativas.
- **Custo e venda:** `product_suppliers`, `product_pricing`, `product_price_tiers`, `products.preco` e `default_markup`.
- **Integração:** `erp_entity_mappings`, `erp_product_sync_state`, `erp_sync_jobs`, `erp_sync_conflicts` e `products.metadata.bling_raw`.

### Campos personalizados

Os 6.523 registros em `product_custom_field_values` têm `value` do tipo JSON string, e 6.515 têm `item` nulo ou vazio. Os IDs externos foram retidos em `external_field_id` e `external_link_id`, e os metadados originais incluem `idCampoCustomizado` e `idVinculo`. Portanto, **não deduzir o nome do atributo a partir do valor** (por exemplo, `false`, `***` ou `Branco`).

**Próximo diagnóstico:** obter as definições dos campos personalizados do Bling por ID, quando houver acesso autorizado; criar uma correspondência revisável entre ID externo, nome, tipo, unidade, aplicação e destino no Croma Hub. Campos sem definição continuam identificados pelo ID externo e não são publicados como atributo comercial.

### Estoque

Somente 25 produtos do tipo `produto` estão com `controls_stock=true` no Croma Hub. O espelho bruto `metadata.bling_raw.estoque` contém informações de saldo para muitos outros produtos. **Não assumir que `controls_stock=false` seja erro de sincronização**: pode representar uma política local de estoque. Antes de corrigir, definir a fonte de verdade para saldo, local de estoque e operações de entrada/saída, distinguindo mercadoria de serviço gráfico sob encomenda.

### Dados fiscais

`product_details` possui 2.065 registros com NCM, 2.138 com origem e 1.602 com GTIN; 29 registros com marca. A tabela `product_fiscal_profiles` está vazia. **Não gerar NCM, CFOP, CST/CSOSN, NBS ou alíquotas por inferência**. Validar primeiro o fluxo fiscal em uso e, quando necessário, com responsável fiscal.

### Qualidade da integração

- 3.317 mapeamentos ERP de produtos estão `synced`; os mapeamentos examinados não apresentaram ID externo diferente do `products.bling_product_id`.
- `erp_product_sync_state` tem 3.314 linhas; uma está marcada como `local_dirty=true` e nenhuma como `remote_change_detected=true` no momento da consulta. Isso não substitui uma comparação com a API do Bling.
- O campo `metadata.bling_raw` existe em 3.318 produtos e inclui dados originais de produto, preço, categoria, estoque, mídia, tributação e campos personalizados.
- Há 12 produtos com status de taxonomia `blocked`, 3 `waiting_baseline` e 10 sem status registrado. Tratar em revisão separada, não misturar com correção de nomes.

## 3. Contrato recomendado de dados

| Informação | Fonte de referência proposta | Destino no Croma Hub | Regra |
|---|---|---|---|
| ID Bling, código/SKU, unidade, tipo | Bling para produtos importados | `products` + `erp_entity_mappings` | Verificar conflitos antes de sobrescrever |
| Nome e descrição comercial | Cadastro mestre Croma com origem rastreada | `products` | Decidir política de atualização antes de enviar ao Bling |
| Especificações técnicas | Bling quando estruturadas; Croma para parâmetros de produção | `product_details` e atributos normalizados | Não fundir medidas físicas, formato de impressão e acabamento |
| Campos personalizados Bling | Definições oficiais por ID externo | `product_custom_field_values` e apresentação mapeada | Não inventar rótulos |
| Imagem principal e galeria | Fonte identificada e validada | `product_media` | Não substituir imagens em lote sem conferir correspondência |
| Preço de venda atual | Política comercial definida no Croma/Bling | `products.preco` / `product_pricing` | Não confundir preço-base, preço de lote e preço unitário |
| Faixas por quantidade | Grade de produto/serviço validada | `product_price_tiers` | Diferenciar `lot`, `unit`, mínimo e validade |
| Custos, frete e fornecedor | Pesquisa/fornecedor, com data e origem | `product_suppliers` | Não enviar custos históricos para o Bling automaticamente |
| Fiscal | Dados de ERP + validação fiscal | `product_details` / perfil fiscal quando adotado | Não completar códigos por adivinhação |
| Saldo e movimentações | Política de estoque ainda a validar | Estoque/snapshots | Não ativar `controls_stock` em massa |
| Preço e condições de proposta enviada | Snapshot da própria proposta | `sales_proposal_items` | Preservar histórico; não atualizar retroativamente |

## 4. Plano incremental de correção

1. **P0 — Definir o dicionário dos atributos Bling:** recuperar definições por `external_field_id`, conferir amostras e aprovar destino sem escrever dados de produtos.
2. **P0 — Verificar 12 produtos com sincronização pendente ou ausente:** distinguir produtos locais intencionais, erros e bloqueios, sem reenvio em massa.
3. **P1 — Comparação campo a campo:** amostra estratificada de produtos simples, serviços, variantes, itens com imagem, NCM e campos personalizados; comparar API Bling × `bling_raw` × colunas normalizadas.
4. **P1 — Cadastro reutilizável para propostas:** exibir imagem, descrição, atributos técnicos e grades válidas na escolha de produto; confirmar explicitamente antes de copiar dados para uma nova cotação. Propostas antigas permanecem imutáveis por padrão.
5. **P1 — Identificar lacunas de preços e fotos:** separar ausências legítimas de inconsistências; sem completar com dados inferidos.
6. **P2 — Validar estoque, fiscal e categorias:** decidir fonte de verdade e política de reconciliação antes de pedidos, NF-e/NFC-e, NFS-e e entrada de notas.
7. **P3 — Financeiro:** somente depois de conferir identidade do fornecedor, produto, documento fiscal e pedido; manter conciliação e lançamentos financeiros rastreáveis.

## 5. Decisões que exigem opinião do responsável

- Para **preço de venda**, qual sistema é a fonte de verdade: Bling, Croma Hub ou fluxo com aprovação?
- Para **estoque**, o Bling será a referência única, ou o Croma Hub terá controle próprio? A configuração atual sugere que essa decisão ainda não está consolidada.
- Para **campos personalizados**, quais atributos de produção gráfica devem ser estruturados (material, medida final, impressão, acabamento, quantidade) e quais permanecem apenas informativos?
- Qual a regra de atualização de **propostas já enviadas ou sincronizadas** quando o produto mestre mudar? Recomendação: nunca sobrescrever automaticamente.

## 6. Critérios de aceite

- Identidade externa/local sem duplicação e com vínculo rastreável.
- Nome, unidade, SKU, preço, imagem, atributos e fiscal comparados com dados reais do Bling em amostras representativas.
- Campos personalizados legíveis somente quando seu significado foi verificado.
- Preço unitário, preço de lote e frete explicitamente separados.
- Alterações com trilha de auditoria, revisão e possibilidade de reversão.
- Nenhuma sincronização de escrita ou correção fiscal sem validação de impacto.
- Testes de leitura e interface autenticada antes de considerar a etapa concluída.

**Limitação desta auditoria:** alguns cruzamentos SQL foram bloqueados por controles de segurança. Eles não foram considerados verificados. Não houve teste end-to-end com a API do Bling nem alterações nos registros do Supabase.
