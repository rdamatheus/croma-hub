# Taxonomia de catálogo — Croma Hub

## Objetivo

A Central de Taxonomia organiza produtos e serviços da Croma e controla a relação entre a estrutura comercial do Croma Hub e as categorias do Bling.

## Estrutura oficial

A organização do Croma Hub segue:

`Tipo → Família Croma → Categoria → Subcategoria → Item`

- **Tipo**: usa os tipos já existentes no ERP: `produto` ou `servico`.
- **Família Croma**: camada comercial exclusiva da Croma. Não é enviada ao Bling.
- **Categoria/Subcategoria**: podem ser vinculadas e sincronizadas com o Bling.
- **Item**: produto ou serviço cadastrado.

Não criar um terceiro tipo de item para custos internos. Papel, toner e equipamentos continuam produtos; mão de obra, terceirização e outros componentes não materiais podem ser serviços quando fizer sentido no ERP.

## Visibilidade

Uma categoria possui controles independentes:

- `ativo`: existe e pode ser usada internamente;
- `public_visible`: pode aparecer no site público;
- `show_in_navigation`: pode aparecer na navegação principal;
- `featured_home`: pode receber destaque na Home.

Categorias internas de insumos, equipamentos, custos ou composição podem ficar **ativas e ocultas no site**.

## Bling

Regras de integração:

1. importar categorias do Bling nunca sobrescreve automaticamente a árvore Croma;
2. uma categoria Bling pode ser vinculada a uma categoria Croma;
3. o vínculo canônico é 1:1 dentro de `provider + entity_type`;
4. duas categorias Bling não podem apontar para a mesma categoria Croma;
5. renomear/sincronizar uma categoria oficial pode atualizar o Bling mediante ação explícita;
6. categoria pai deve estar vinculada/sincronizada antes da subcategoria;
7. exclusão do Bling exige verificação de dependências e confirmação explícita;
8. se houver itens ativos ou subcategorias dependentes, a exclusão é bloqueada.

## Moderação por IA

A IA pode sugerir:

- reutilizar categoria existente;
- criar nova categoria;
- classificar como alta certeza;
- enviar para revisão;
- marcar como dúvida.

Toda sugestão deve mostrar, quando disponível:

- família sugerida;
- categoria sugerida;
- confiança;
- justificativa;
- itens que motivaram a sugestão.

A moderação humana pode:

- usar a sugestão;
- criar uma categoria diferente;
- vincular a uma categoria existente;
- rejeitar apenas a sugestão da IA;
- na área do Bling, excluir uma categoria externa quando for seguro.

## Regra de segurança

A classificação automática não deve alterar produtos em massa nem enviar categorias ao Bling silenciosamente. Aplicação e sincronização são etapas explícitas.

## Legado

Categoria sem família é tratada como legado durante a migração.

Regra de limpeza:

- pode ser excluída permanentemente quando não possui item vinculado, não possui subcategoria dependente e não possui vínculo ativo com categoria do Bling;
- se ainda tiver item ou dependência estrutural, deve permanecer até a migração;
- após recategorizar os itens dependentes, repetir a verificação e eliminar o legado restante quando estiver seguro.

Na limpeza de 06/09/2026 foram removidas 50 categorias legado seguras. Permaneceram 20 categorias legado porque ainda possuem itens e/ou subcategorias dependentes.

## Estado atual — 06/09/2026

- 4 famílias de produtos;
- 7 famílias de serviços;
- 25 categorias importadas do Bling;
- sugestões de taxonomia registradas para as 25 categorias externas;
- nenhum vínculo Bling↔Croma aplicado automaticamente;
- piloto de classificação com 30 produtos e 9 propostas de categoria;
- controle `public_visible` implementado;
- proteção 1:1 de mapeamento implementada;
- exclusão segura no Bling implementada no servidor;
- moderação visual ampliada no painel;
- 50 categorias legado vazias/seguras removidas;
- 20 categorias legado ainda preservadas por dependência;
- nenhum item ativo ficou sem categoria após a limpeza.
