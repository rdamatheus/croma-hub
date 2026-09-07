# Normalização de produtos Bling → Croma Hub

## Objetivo

O Bling é a fonte operacional dos produtos definitivos. O Croma Hub espelha a identidade e a estrutura do ERP e adiciona organização comercial, taxonomia, catálogo, dados internos e recursos de consulta.

Esta implementação não recria produtos nem categorias e não consolida automaticamente produtos repetidos. A consolidação de produtos soltos em pais/variações é uma fase posterior e exige revisão.

## Escopo

A normalização automática desta etapa é exclusiva de `product_type = 'produto'`. Serviços continuam no fluxo manual já definido.

A hierarquia comercial permanece:

```text
Família → Categoria → Subcategoria → Produto
```

A classificação definitiva continua em `products.catalog_category_id`. O campo textual `categoria` não volta a ser fonte de verdade.

## Identidade

- `products.id`: identidade local.
- `products.bling_product_id`: identidade externa persistente.
- `sku` / `bling_sku`: códigos operacionais, não chaves primárias.
- `metadata.bling_raw`: payload bruto preservado para auditoria, debugging e evolução da API.

## Produto simples, pai, variação e composição

As relações são tratadas como dimensões independentes.

### Produto pai de variações

No payload real observado, `formato = V` e/ou `variacoes` preenchido identifica o pai.

### Variação

A relação do filho é determinada prioritariamente por:

```text
metadata.bling_raw.variacao.produtoPai.id
```

com fallback para caminhos legados já suportados.

O vínculo normalizado fica em:

```text
products.bling_parent_id
products.parent_product_id
```

O pai também recebe uma projeção em `product_variants`, ligada ao produto-filho real por `child_product_id`.

### Composição

No payload observado, `formato = E` e/ou `estrutura.componentes` preenchido representa composição.

A composição é espelhada em `product_components` somente quando o Bling envia componentes reais e suas quantidades. Não são criados consumos artificiais para produtos terceirizados comprados prontos.

Um filho pode simultaneamente ser uma variação e possuir composição:

```text
parent_product_id != null
+
product_format = composition
```

### Produto simples

`formato = S`, sem relação com pai e sem componentes, permanece `simple`.

## Atributos de variação

O campo `variacao.nome` é preservado integralmente em `_raw` e, quando possui sintaxe estruturada, é convertido em atributos.

Exemplo:

```text
COR:4/0;TAMANHO:A5
```

vira:

```json
{
  "_raw": "COR:4/0;TAMANHO:A5",
  "COR": "4/0",
  "TAMANHO": "A5"
}
```

Os atributos são projetados em:

- `product_variants.option_values`
- `product_option_groups`
- `product_options`

Valores legados malformados não são adivinhados. O valor original permanece em `_raw` para posterior revisão.

## Estoque

O saldo recebido do Bling não é convertido em `stock_movements`, pois um saldo atual não representa um movimento histórico.

Foi criada a tabela:

```text
product_stock_snapshots
```

Ela preserva snapshots externos por fonte, atualmente `bling`, com:

- saldo disponível;
- saldo virtual;
- mínimo;
- máximo;
- localização;
- cross-docking;
- data da sincronização;
- metadados brutos do bloco de estoque.

`estoque.saldoVirtualTotal` é tratado como saldo disponível/virtual. Não é rotulado como saldo físico quando a API não fornece essa garantia.

Na listagem interna:

- produto simples/filho: mostra seu próprio saldo;
- produto pai: soma os saldos disponíveis das variações quando existem snapshots dos filhos.

## Fornecedores e custo de compra

Quando `fornecedor.contato.id` do Bling possui mapeamento em `erp_entity_mappings`, o Croma Hub resolve o contato local e reutiliza o registro correspondente em `suppliers`.

O vínculo é criado em `product_suppliers`, preservando:

- fornecedor;
- código no fornecedor;
- unidade de compra;
- preço de compra.

Não é criado fornecedor duplicado apenas por diferença de nome.

## Campos personalizados

Os `camposCustomizados` do Bling são projetados em:

```text
product_custom_field_values
```

com:

- produto;
- fonte;
- ID externo do campo;
- ID externo do vínculo;
- item;
- valor;
- payload original;
- data de sincronização.

O `bling_raw` continua preservado mesmo após a projeção.

## Origem operacional do produto

A classificação interna utiliza português:

```text
producao_interna
terceirizado
revenda
misto
```

Na interface:

- Produção interna
- Terceirizado
- Revenda
- Misto

O código `tipoProducao = P` do Bling pode representar produção própria. Já `T` não é usado automaticamente para escolher entre `terceirizado` e `revenda`, pois essa distinção é operacional da Croma e precisa de contexto adicional.

Importadores legados que ainda enviarem `propria`/`terceiros` são protegidos por trigger de compatibilidade:

- `propria` + Bling `P` → `producao_interna`;
- `terceiros` explícito → `terceirizado`;
- `propria` gerado incorretamente a partir de Bling `T` → `null`, aguardando classificação correta.

## Tela interna de produtos

A listagem administrativa foi ampliada para consultar os campos normalizados, sem depender diretamente do JSON bruto no frontend.

### Busca

Pesquisa por:

- nome;
- SKU Croma;
- SKU Bling;
- ID Bling;
- GTIN;
- marca;
- modelo;
- categoria;
- fornecedor.

### Filtros principais

- status;
- categoria, incluindo descendentes da categoria selecionada;
- estrutura: simples, pai, variação, composição;
- estoque: positivo, zero, negativo, abaixo do mínimo ou sem snapshot.

### Filtros avançados

- origem operacional;
- marca;
- fornecedor;
- estado da integração Bling;
- tipo produto/serviço;
- conteúdo: imagem, GTIN e NCM;
- uso: comercial, insumo interno e elegível para catálogo.

### Colunas configuráveis

O usuário pode exibir/ocultar localmente:

- categoria;
- disponível;
- preço;
- origem;
- fornecedor;
- integração.

A preferência é mantida no navegador por `localStorage`.

## Regras de visibilidade pública preservadas

A normalização não altera a regra de elegibilidade do catálogo:

```text
product_type = produto
ativo = true
is_sellable = true
is_input = false
categoria pública
```

`published_on_site` continua reservado para curadoria/destaques e não volta a ser o único controlador do catálogo.

## Idempotência

A normalização é centralizada no banco e acionada sempre que um produto com `metadata.bling_raw` é inserido ou atualizado pelos fluxos de sincronização.

Isso evita implementar regras divergentes em importação manual, sincronização automática e rotinas futuras.

As projeções usam chaves únicas e `upsert`/reconciliação para não duplicar:

- variações;
- grupos de opções;
- opções;
- snapshots;
- componentes;
- campos customizados;
- vínculos de fornecedor.

## Validação inicial

Produto real utilizado como teste:

```text
BLOCOS C/ COLA (SULF. 75gG- 50 F)
Bling ID pai: 16265579428
```

Resultado esperado e confirmado no backfill:

- pai identificado como `variation`;
- 12 filhos ligados ao mesmo pai;
- `bling_parent_id` e `parent_product_id` resolvidos;
- variações simples permanecem `simple` + relação com pai;
- variações compostas permanecem `composition` + relação com pai;
- atributos bem estruturados separados em `COR`, `TAMANHO` etc.;
- valores malformados preservados em `_raw`.

## Próxima fase: consolidação dos produtos soltos

A fase posterior deve identificar produtos repetidos/soltos que representam o mesmo modelo com variações de características.

Regra principal:

> variação representa combinações de características do mesmo produto/modelo; marca ou categoria em comum não são suficientes para agrupar modelos diferentes.

Exemplo recomendado:

```text
Caneta BIC Cristal 1.0
├── Azul
├── Preta
└── Vermelha
```

Se `0.7` for comercialmente outro modelo, terá outro pai.

A rotina de proposta deverá classificar agrupamentos por confiança e não alterar o Bling ou o Croma Hub sem revisão do agrupamento.
