# Taxonomia de catálogo — Croma Hub

## Objetivo

A Central de Taxonomia organiza produtos e serviços da Croma e controla a relação entre a estrutura comercial do Croma Hub e as categorias do Bling.

## Estrutura oficial

A organização segue:

`Tipo → Família Croma → Categoria → Subcategoria → Item`

- **Tipo**: `produto` ou `servico`.
- **Família Croma**: camada comercial exclusiva da Croma e preservada durante a reconstrução.
- **Categoria/Subcategoria**: estrutura comercial moderada e, depois de aprovada, sincronizável com o Bling.
- **Item**: produto ou serviço cadastrado.

Não criar um terceiro tipo de item para custos internos. Papel, toner e equipamentos continuam produtos; mão de obra, terceirização e outros componentes não materiais podem ser serviços quando fizer sentido no ERP.

## Reconstrução da taxonomia

Em 06/09/2026 a estrutura de categorias foi zerada para reconstrução controlada.

Durante essa fase:

- produtos e serviços podem ter `catalog_category_id = NULL`;
- nenhuma categoria técnica falsa deve ser criada apenas para satisfazer o banco;
- as 11 famílias oficiais permanecem como base obrigatória;
- toda categoria nova deve nascer vinculada a uma família;
- nenhuma proposta da IA vira categoria oficial sem moderação.

## Base comercial da IA

A IA não deve inventar a árvore apenas a partir dos nomes dos itens. Ela recebe uma base de referências comerciais reais armazenada em `taxonomy_market_references`.

Fontes iniciais:

- **Kalunga**: papelaria, escolar, escrita, organização e artes;
- **Mercado Livre**: Arte, Papelaria e Armarinho, Materiais Escolares, Escolar, Informática e categorias relacionadas;
- **FuturaIM**: Adesivos e Rótulos, Cartões de Visita, Folhetos, Comunicação Visual, Brindes e outras linhas gráficas.

As referências funcionam como evidência e padrão de mercado, não como obrigação de copiar a árvore de outro site.

Critérios:

1. priorizar nomes comerciais que clientes reconheçam;
2. evitar categorias por marca, SKU, cor, tamanho ou variação;
3. evitar tanto categorias genéricas demais quanto microcategorias para um único item;
4. reutilizar categoria existente quando ela for semanticamente correta;
5. propor categoria nova somente quando for reutilizável;
6. conectar toda proposta à família correta;
7. registrar `market_basis` quando a referência comercial influenciar a decisão;
8. reduzir a confiança quando houver conflito entre referências de mercado e a realidade da Croma.

## Confiança e moderação

- `>= 0.90`: Alta certeza;
- `0.70 a 0.89`: Revisar;
- `< 0.70`: Dúvida.

Toda sugestão deve apresentar, quando disponível:

- família;
- categoria;
- confiança;
- justificativa;
- base comercial utilizada;
- itens que originaram a sugestão.

A moderação humana pode aceitar, criar diferente, reaproveitar uma categoria existente ou rejeitar apenas a sugestão.

## Rotina técnica de IA

A Edge Function `taxonomy-classify` usa:

- modelo `gpt-5.6-terra`;
- lotes de até 20 itens;
- descrições limpas e reduzidas para limitar ruído e tamanho de contexto;
- saída estruturada por JSON Schema com fallback controlado;
- referências comerciais carregadas do banco;
- registro de itens não resolvidos para impedir repetição infinita do mesmo erro;
- retorno de mensagem de erro legível ao painel.

## Visibilidade

Uma categoria possui controles independentes:

- `ativo`: existe e pode ser usada internamente;
- `public_visible`: pode aparecer no site público;
- `show_in_navigation`: pode aparecer na navegação principal;
- `featured_home`: pode receber destaque na Home.

Categorias internas de insumos, equipamentos, custos ou composição podem ficar **ativas e ocultas no site**.

## Bling

Regras de integração:

1. importar categorias nunca sobrescreve automaticamente a árvore Croma;
2. o vínculo canônico Bling↔Croma é 1:1;
3. categoria pai deve ser resolvida antes da subcategoria;
4. exclusão exige verificação de itens e subcategorias;
5. categoria com dependência não pode ser apagada silenciosamente;
6. criar/renomear categoria no Bling só acontece por ação explícita;
7. a nova taxonomia deve ser aprovada no Croma antes de ser usada como estrutura canônica do ERP.

## Limpeza do Bling — 06/09/2026

Das 25 categorias externas encontradas:

- 17 categorias sem dependências foram excluídas do Bling;
- 8 permanecem por possuírem item ativo e/ou dependência hierárquica;
- 9 itens ativos ainda estão ligados a essas categorias restantes;
- nenhuma atribuição de categoria dos produtos foi alterada sem autorização específica.

## Estado atual

- famílias ativas: 11;
- categorias Croma: 0;
- execuções/propostas antigas de IA: 0;
- referências comerciais ativas: 22;
- itens aguardando classificação Croma: 3.325;
- categorias antigas ainda presentes no Bling: 8.
