# Histórico funcional de versões — Croma Hub

Este arquivo resume mudanças funcionais relevantes. O histórico técnico detalhado permanece nos commits, migrations e logs de sincronização.

## 2026-09-06 — Central de Taxonomia v3

### Objetivo
Recomeçar a taxonomia de categorias do zero, preservando as famílias oficiais e fazendo a IA propor a nova estrutura com base em referências comerciais reais antes da aprovação humana.

### Reset realizado
- todas as categorias e subcategorias locais foram removidas;
- todas as execuções e propostas antigas da rotina de IA foram zeradas;
- produtos e serviços foram preservados e podem permanecer temporariamente sem categoria Croma durante a reconstrução;
- as 11 famílias oficiais foram preservadas;
- `products.catalog_category_id` passou a aceitar `NULL` durante o processo de reconstrução;
- o trigger de rótulo de categoria foi ajustado para aceitar item temporariamente não classificado sem criar categoria técnica falsa.

### Base comercial da IA
Foi criada `taxonomy_market_references`, com referências auditáveis de comércio eletrônico e gráfica online.

Fontes iniciais:
- Kalunga — papelaria, escolar, escrita, organização e artes;
- Mercado Livre — Arte, Papelaria e Armarinho, Materiais Escolares, Escolar, Informática e referências relacionadas;
- FuturaIM — Adesivos e Rótulos, Cartões de Visita, Folhetos, Comunicação Visual, Brindes e demais linhas gráficas.

A referência de mercado orienta a sugestão; não cria categorias automaticamente. Família, categoria, confiança e justificativa continuam passando por moderação humana.

### Rotina de IA v2
- Edge Function `taxonomy-classify` atualizada para v2;
- modelo configurado: `gpt-5.6-terra`;
- lote reduzido para no máximo 20 itens;
- descrições HTML são limpas e reduzidas antes de enviar ao modelo;
- saída estruturada por JSON Schema, com fallback controlado;
- cada sugestão já deve apontar para uma família oficial;
- evidência da sugestão registra `market_basis`;
- falhas operacionais retornam mensagem legível ao painel em vez de apenas erro HTTP genérico;
- itens que não puderem ser validados ficam registrados como não resolvidos, evitando travar repetidamente no mesmo lote.

### Limpeza das categorias do Bling
- 25 categorias externas foram verificadas individualmente;
- 17 categorias sem item e sem dependências foram excluídas com sucesso do Bling;
- 8 categorias permanecem porque ainda possuem item ativo e/ou subcategoria dependente;
- nenhuma categoria com dependência foi forçada a excluir;
- a função temporária de manutenção usada na exclusão foi desativada após a execução.

### Estado após a versão
- categorias Croma: 0;
- execuções antigas de IA: 0;
- propostas antigas: 0;
- referências comerciais ativas: 22;
- famílias ativas: 11;
- categorias Bling ainda pendentes: 8;
- itens Croma aguardando nova classificação: 3.325.

### Próximo passo
Iniciar uma nova análise em **Central de Taxonomia → Moderação IA**, revisar as categorias comerciais propostas e aprovar apenas as que formarem uma árvore coerente. Separadamente, decidir se os 9 itens que ainda usam as 8 categorias antigas do Bling podem ficar temporariamente sem categoria no ERP para permitir a exclusão final dessas categorias.

## 2026-09-06 — Central de Taxonomia v2.1

### Objetivo
Limpar a taxonomia local removendo categorias legado sem utilidade e sem dependências, preservando itens e estruturas ainda necessárias à migração.

### Alterado
- removidas permanentemente 50 categorias legado seguras;
- 46 eram de produto e 4 de serviço;
- a limpeza só considerou categorias sem item vinculado, sem subcategoria dependente e sem vínculo com categoria do Bling;
- categorias-pai que ficaram vazias após a primeira limpeza foram reavaliadas antes da remoção.

### Validação
- 20 categorias legado permaneciam porque ainda possuíam itens e/ou subcategorias dependentes;
- nenhuma categoria segura e vazia permaneceu pendente de exclusão;
- nenhum item ativo ficou sem categoria como consequência daquela limpeza;
- nenhum vínculo Bling↔Croma foi removido naquela versão.

## 2026-09-06 — Central de Taxonomia v2

### Objetivo
Transformar o painel de categorias em uma central de gestão, moderação e sincronização segura com o Bling.

### Adicionado
- controle independente de categoria ativa e visível no site;
- `public_visible` em `catalog_categories`;
- proteção de mapeamento canônico 1:1 entre categoria Croma e categoria Bling;
- sugestões de IA exibidas junto às categorias do Bling;
- ação para usar sugestão, criar/editar categoria, vincular existente e excluir do Bling;
- exibição dos itens que originaram propostas da IA;
- ação “Criar diferente” nas propostas de categoria;
- verificação de dependências antes de excluir categoria no Bling;
- confirmação explícita antes de exclusão no ERP;
- registro das exclusões em `erp_sync_jobs`.

### Riscos controlados
- exclusão de categoria com item ativo ou subcategoria é bloqueada;
- dois IDs do Bling não podem apontar para a mesma categoria Croma;
- novas categorias criadas pela moderação ficam ocultas no site por padrão.
