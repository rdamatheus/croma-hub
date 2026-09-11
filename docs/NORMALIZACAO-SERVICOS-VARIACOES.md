# Normalização comercial de serviços, variações e grades

Data: 2026-09-10

## Objetivo
Organizar os serviços sincronizados do Bling para que o site e o painel interno apresentem uma estrutura comercial legível, preservando o cadastro operacional e a rastreabilidade com o ERP.

## Estado auditado
- 888 serviços ativos, vendáveis e não classificados como insumo.
- 281 registros raiz.
- 607 registros filhos/variações.
- 637 registros com preço maior que zero.
- 251 registros com preço zero.
- 119 serviços principais possuem filhos.
- 96 desses pais possuem preço próprio igual a zero.
- As tabelas `product_option_groups`, `product_options`, `product_variants` e `product_price_tiers` já existem, mas estavam vazias na auditoria.

## Regra comercial de preço
O valor original do Bling não é substituído por texto no banco.

A camada comercial interpreta o valor da seguinte forma:

1. Item simples com preço maior que zero: exibir o preço.
2. Item simples com preço zero ou nulo: exibir **Sob consulta**.
3. Serviço pai com filhos e pelo menos um filho com preço válido: exibir **A partir de R$ ...**, usando o menor preço positivo dos filhos.
4. Serviço pai cujos filhos não possuam preço válido: exibir **Sob consulta**.
5. Variação específica com preço zero ou nulo: exibir **Sob consulta**.
6. O cliente nunca deve visualizar `R$ 0,00` como preço comercial.
7. Quando estiver sob consulta, o CTA deve ser de consulta/orçamento, nunca de compra por valor zero.

## Padrão de interpretação das variações do Bling
O Bling fornece variações em pares no formato:

`ATRIBUTO:VALOR;ATRIBUTO:VALOR`

Exemplo:

`TAMANHO:A3;COR:(4/4);ES:3MM`

Interpretação comercial:
- `TAMANHO` / `TAM` -> **Tamanho**
- `TAM.ESTAMPA` -> **Tamanho da estampa**
- `KIT`, `QUANTIDADE`, `QUANTIDADES`, `QUANT`, `UN` -> **Quantidade**
- `GRAMAT.` -> **Gramatura**
- `ES` -> **Espessura**
- `CORTE` -> **Tipo de corte**
- `ACABAMENTO` -> **Acabamento**
- `MATERIAL` -> **Material**
- `CERAMICA` -> **Cerâmica**
- `COR` / `CORES` com valores 4/0, 4/4, 1/0 ou 1/1 -> **Impressão**
- `COR` em contexto cromático -> **Cor**
- `TIPO` -> **Tipo**

Valores técnicos de impressão devem receber apresentação legível sem perder o código original:
- 4/0 -> Frente — 4/0
- 4/4 -> Frente e verso — 4/4
- 1/0 -> Preto e branco frente — 1/0
- 1/1 -> Preto e branco frente e verso — 1/1

## Tipos de apresentação comercial
A estrutura deve ser escolhida pela natureza da diferença entre os filhos:

- apenas quantidade -> grade de quantidade/preço;
- uma característica -> seletor de opção;
- duas ou mais características -> seletores + variação resultante;
- características + quantidade -> opções primeiro e grade de quantidade depois;
- serviço sob medida -> campos/configurador + orçamento.

## Separação de responsabilidades
- `products` e dados espelhados do Bling: fonte operacional e de rastreabilidade.
- tabelas de opções/variações/faixas: normalização comercial da Croma.
- site público: leitura e apresentação comercial.
- painel interno: mesma leitura comercial, acrescida de campos internos e ações de edição.

A normalização comercial não deve apagar nem reescrever a identificação técnica necessária ao Bling.

## Painel administrativo
A ficha interna deve mostrar:
- como o item será apresentado comercialmente;
- estado de preço (preço, Sob consulta ou A partir de);
- produto pai, quando o item for filho;
- filhos/variações vinculados;
- atributos interpretados do padrão do Bling;
- composição e componentes quando disponíveis;
- atalhos para editar cada variação/componente;
- campos internos de custo, fornecedor, tributação, estoque e integração somente no ambiente administrativo.

## Situação da implementação em 2026-09-10
Foi implementada a camada de apresentação de **Sob consulta** no catálogo público de serviços, sem alterar preços armazenados.

Também foi adicionada ao painel interno uma visão estrutural que interpreta as relações já existentes de pai/filho e a composição recebida do Bling. Essa visualização é não destrutiva: não popula automaticamente as tabelas de normalização.

## Próxima etapa — obrigatoriamente com auditoria antes de gravar
Gerar um dry-run dos 888 serviços classificando cada registro em:
- serviço principal;
- variação;
- opção;
- grade de quantidade;
- composição;
- caso ambíguo para revisão manual.

Somente após revisão humana devem ser populadas `product_option_groups`, `product_options`, `product_variants` e `product_price_tiers`.

Nenhuma normalização definitiva dos 607 filhos deve ser aplicada em massa sem essa conferência.