# Composição de produtos, Bling e custos

## Objetivo

Manter uma única composição operacional para produtos e serviços da Croma, espelhada com o Bling quando aplicável, sem misturar regras internas de custo com a estrutura enviada ao ERP.

## Decisão

- **Fonte oficial da composição:** `product_components`.
- `sync_to_bling=true`: componente pertence à estrutura do Bling.
- `sync_to_bling=false`: componente existe somente para custo interno da Croma.
- `product_cost_components` permanece apenas como estrutura legada para compatibilidade histórica e não deve receber novos cadastros.
- Tipo e lançamento de estoque da composição ficam em `product_composition_settings`.
- Frete fixo de lote, mão de obra e outros custos internos ficam em `product_cost_adjustments`.
- O custo é recalculado por `croma_refresh_product_cost` e propagado para produtos compostos dependentes.

## Sincronização Bling

### Bling → Croma

A normalização operacional lê `metadata.bling_raw.estrutura` para **produtos e serviços**. Os componentes remotos substituem somente as linhas `sync_to_bling=true`; componentes internos `sync_to_bling=false` são preservados.

### Croma → Bling

Alterações em componentes espelháveis ou em `product_composition_settings` marcam `erp_product_sync_state.dirty_fields` com `estrutura`. Os workers `bling-product-auto-sync` e `bling-service-auto-sync` enviam `formato=E`, `estrutura.componentes`, `tipoEstoque` e `lancamentoEstoque`.

A proteção por baseline/hash continua impedindo sobrescrita automática quando Croma e Bling mudaram antes da reconciliação.

## Custo e perda

A regra de custo de componente é:

`quantidade × custo unitário × (1 + perda%)`

Custos adicionais:

`frete fixo / quantidade do lote + mão de obra unitária + outros custos unitários`

Para chapas, a Croma usa **rendimento real da unidade comprada**. A sobra só deixa de ser perda quando houver controle explícito como estoque reutilizável.

### Frisilk — PS 2,00 × 1,00 m

| Espessura | Chapa | Frete | Rendimento A2 | Custo A2 entregue |
|---|---:|---:|---:|---:|
| 1 mm | R$ 60,00 | R$ 15,00 | 6 | R$ 12,50 |
| 2 mm | R$ 120,00 | R$ 15,00 | 6 | R$ 22,50 |
| 3 mm | R$ 160,00 | R$ 15,00 | 6 | R$ 29,17 |

## Preço normal x promoção de fornecedor

`supplier_catalog_items` separa:

- `list_price`: preço normal/de tabela;
- `promotional_price`: promoção observada;
- `cost_price_policy`: `list` ou `current`.

Com política `list`, reconciliação e custo usam o preço normal. Promoção pode melhorar a margem na compra, mas não reduz automaticamente a base de precificação.

### Zap VBFM2

- Preço normal confirmado: **R$ 45,50/m²**.
- Promoção observada em 17/09/2026: **R$ 40,04/m²**.
- Política de custo: **list**.
- Frete Zap permanece custo de lote; não é embutido no custo unitário do m².

## Validação — Placa A2 3 mm

Serviço Bling: `PLACA PVC TAMANHO:A2;COR:(4/0);ES:3MM` (Bling 16491193091).

Composição conhecida:

- 1 × chapa PS A2 3 mm: R$ 29,17;
- 0,25 m² × VBFM2: R$ 11,375;
- aplicação: custo interno ainda não definido;
- frete Zap: R$ 18,00 / 6 = R$ 3,00.

**Custo conhecido recalculado: R$ 43,545 por placa (R$ 43,55 arredondado).**

O preço de venda de R$ 62,90 não foi alterado porque ainda não há custo de mão de obra nem regra de markup definida para este item.

## Riscos e controles

- Componente marcado para Bling precisa ter `bling_product_id`; caso contrário o worker bloqueia o envio com erro explícito.
- Alterações concorrentes Croma/Bling continuam gerando conflito pela comparação do baseline.
- Componentes locais de custo nunca são enviados para o Bling.
- Preços suspeitos continuam sujeitos à fila de validação de catálogo.
