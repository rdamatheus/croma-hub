# Histórico funcional de versões — Croma Hub

Este arquivo resume mudanças funcionais relevantes. O histórico técnico detalhado permanece nos commits, migrations e logs de sincronização.

## 2026-09-07 — Redesenho comercial público — RC1 (em revisão)

- Implementação comitada e enviada ao GitHub no branch `feat/redesenho-comercial`, proposta #27.
- Home com hero aprovado, três áreas Croma e CTAs de catálogo e WhatsApp.
- Navegação pública compartilhada; novas rotas de Digital, portfólio, contato e detalhe de produto.
- Links de produto acessíveis por teclado e correção das quebras de linha da mensagem de orçamento.
- Validação: 27 verificações de navegação em Edge, nas larguras 375, 768 e 1440 px; menu e formulário verificados.
- **Não publicada:** categorias retornam HTTP 401 / 42501 no Supabase, relacionado à permissão de profiles. Nenhuma permissão de banco foi alterada.
- Pendências: fluxo completo com dados reais, relacionados e variações, revisão visual integral, auditoria de acessibilidade e performance.
- Área interna, autenticação, Bling, carrinho, pedidos e banco preservados.
- Relatório de validação e rollback: [REDESENHO-COMERCIAL-RELATORIO.md](REDESENHO-COMERCIAL-RELATORIO.md).

## 2026-09-06 — Central de Taxonomia v4.1

### Objetivo
Remover a funcionalidade de Auditoria/IA do painel e simplificar a Central de Taxonomia para gestão manual da estrutura e conferência do Bling.

### Alterado
- removida a aba Auditoria;
- removidos os controles de análise em páginas de 10 itens;
- removidas chamadas do frontend para `taxonomy-classify`;
- a página voltou a se chamar **Central de Taxonomia**;
- mantida gestão manual de Família → Categoria → Subcategoria;
- mantida visualização de produtos vinculados por categoria;
- mantida pesquisa por nome/SKU e paginação de 10 itens na inspeção de categoria;
- mantida opção de mover um produto para outra categoria ou deixá-lo sem categoria;
- mantida a aba de conferência do Bling.

### Infraestrutura
- `taxonomy-classify` foi desativada funcionalmente: sua versão v5 retorna HTTP 410 e não executa classificação;
- `taxonomy_market_references` permanece preservada para uso em análises conduzidas pelo ChatGPT;
- `public.apply_taxonomy_audit(jsonb)` permanece disponível como mecanismo transacional seguro para aplicação futura de classificações aprovadas;
- não foram recriadas filas, execuções ou tabelas de propostas.

### Novo processo
A classificação em massa passa a ser conduzida no ChatGPT: leitura do catálogo → análise global → proposta de Família/Categoria/Subcategoria → revisão humana → aplicação controlada no Supabase → validação → futura publicação no Bling.

## 2026-09-06 — Auditoria de Taxonomia v4

### Objetivo
Substituir o fluxo instável baseado em execuções e filas por uma auditoria simples, stateless e controlada em páginas de 10 produtos ou serviços.

### Novo fluxo
- catálogo ativo pré-carregado no painel;
- páginas de 10 itens;
- pesquisa por nome ou SKU;
- filtros por situação, família e categoria;
- IA analisa somente os itens visíveis na página;
- sugestões permanecem temporárias no navegador até a confirmação;
- categorias sugeridas exibem explicitamente os produtos envolvidos;
- cada produto pode aceitar a sugestão, ser reclassificado manualmente, ficar sem categoria ou ser deixado para depois;
- aba Estrutura permite pesquisar produtos de uma categoria, mover ou remover classificações.

### Aplicação segura
- criada `public.apply_taxonomy_audit(jsonb)`;
- decisões de uma página são aplicadas em uma única transação;
- validação obrigatória de Tipo → Família → Categoria → Subcategoria;
- terceiro nível é bloqueado;
- categorias novas nascem ativas, mas ocultas do site e fora da navegação;
- alteração exclusiva da classificação local não marca o produto para sincronização automática com o Bling.

### IA
- `taxonomy-classify` publicada como v4;
- rotina stateless, sem criação de execução ou fila;
- máximo de 10 itens por chamada;
- usa famílias oficiais, categorias já aprovadas e as 22 referências comerciais de mercado;
- retorna família, categoria, subcategoria opcional, confiança, justificativa e base comercial;
- nenhuma sugestão é aplicada automaticamente.

### Limpeza técnica
- removidas `taxonomy_runs`, `taxonomy_category_proposals` e `taxonomy_item_proposals` sem `CASCADE`;
- removido `interno-taxonomy-enhancements.js`, eliminando o segundo controlador da mesma página;
- execuções antigas foram canceladas antes da remoção das tabelas;
- `taxonomy_market_references` foi preservada.

### Bling
- `bling-product-auto-sync` v2 aceita produto local sem categoria;
- `bling-service-auto-sync` v2 aceita serviço local sem categoria;
- `bling-import-product` v4 aceita item importado sem categoria Croma;
- removida a dependência runtime de `bling-importados` e `bling-servicos-importados`;
- auditoria de categoria continua local; publicação no Bling será uma etapa posterior e explícita.

### Validação
- RPC transacional testada com item real dentro de transação e `ROLLBACK`;
- criação temporária de categoria/subcategoria também testada com `ROLLBACK`, sem registros residuais;
- após a limpeza: 11 famílias, 22 referências comerciais, 2.137 produtos ativos e 1.173 serviços ativos preservados;
- busca no código confirmou ausência de referências às três tabelas antigas e às categorias técnicas removidas;
- GitHub Pages run 442 concluiu com sucesso para a nova interface e controlador.

## 2026-09-06 — Segurança do banco v1

### Objetivo
Eliminar os alertas de RLS sem policy e `search_path` mutável apontados pelo Security Advisor, preservando o funcionamento das integrações e adotando privilégio mínimo.

### Contexto de segurança definido
- `erp_connection_audit` é um log técnico de integração e permanece com RLS ativa;
- clientes `anon` não possuem acesso à tabela;
- usuários `authenticated` possuem apenas privilégio SQL de `SELECT`, condicionado por RLS ao papel Owner ativo;
- Manager e demais usuários autenticados não recebem linhas dessa tabela;
- inserção, atualização e exclusão pelo navegador permanecem bloqueadas;
- `service_role` mantém as permissões de servidor necessárias para registrar e administrar o log de integração.

### Search path
- `public.normalize_product_external_category_id()` passou a usar `search_path=pg_catalog`;
- o escopo foi reduzido ao catálogo nativo do PostgreSQL porque a função não depende de tabelas, views ou funções de schemas da aplicação;
- nenhuma função `SECURITY DEFINER` em `public` ou `app_private` foi encontrada sem `search_path` fixo na auditoria complementar.

### Validação
- policy `erp_connection_audit_owner_read` criada e conferida;
- grants conferidos: `authenticated=SELECT`; `service_role` mantém operações de servidor; `anon` sem grants;
- configuração da função conferida como `search_path=pg_catalog`;
- Security Advisor reexecutado após a migration e os alertas de `rls_enabled_no_policy` e `function_search_path_mutable` não aparecem mais.

## 2026-09-06 — Central de Taxonomia v3.2

### Objetivo
Corrigir a criação das execuções da Moderação IA, eliminar o erro `[object Object]`, processar todo o catálogo sem limite de 1.000 registros e simplificar o cabeçalho da página.

### Corrigido
- permissões mínimas de `service_role` para `taxonomy_runs`, `taxonomy_category_proposals`, `taxonomy_item_proposals` e leitura de `taxonomy_market_references`;
- Edge Function `taxonomy-classify` atualizada para v3;
- mensagens de erro estruturadas e legíveis no servidor e no painel;
- leitura paginada dos produtos e serviços, removendo o limite implícito de 1.000 registros;
- leitura paginada dos itens já processados para impedir repetição após grandes execuções;
- contadores da execução calculados por contagem real no banco;
- lote padronizado em 20 itens;
- `Processar tudo` continua até a execução terminar, sem o antigo teto fixo de 130 lotes;
- progresso exibido como `analisados / total` e percentual;
- nomes dos produtos carregados por paginação também nas melhorias visuais da moderação.

### Interface
- removida a navegação redundante `Produtos / Categorias / Segmentos / Organização` do topo da Central de Taxonomia;
- removido o botão redundante `Produtos` do cabeçalho superior;
- mantida a navegação oficial pela barra lateral;
- removido o carregamento do filtro legado de categorias;
- a base comercial da IA passa a aparecer diretamente junto à rotina e às propostas.

### Validação
- `service_role` foi testada em transação controlada e conseguiu inserir/ler `taxonomy_runs`; a transação de teste foi revertida;
- não ficou nenhuma execução de teste registrada;
- a Edge Function v3 foi publicada com JWT obrigatório;
- o deploy do painel foi concluído com sucesso;
- a validação final autenticada de `Nova análise → Analisar próximos 20` deve ser feita pelo proprietário no painel, pois depende da sessão real do usuário.

### Segurança observada
Naquele momento o Security Advisor ainda apontava `erp_connection_audit` com RLS sem policy e `normalize_product_external_category_id` com `search_path` mutável. Esses dois pontos foram corrigidos posteriormente em **Segurança do banco v1**.

## 2026-09-06 — Central de Taxonomia v3.1

### Objetivo
Concluir o reset completo da taxonomia local e do Bling para iniciar uma nova classificação assistida por IA com base comercial real e famílias Croma preservadas.

### Limpeza concluída
- categorias e subcategorias Croma: 0;
- mapeamentos operacionais Bling↔Croma de categoria: 0;
- execuções e propostas antigas de IA: 0;
- as 11 famílias oficiais foram preservadas;
- os 25 registros de categoria encontrados no Bling foram removidos;
- a API do Bling foi consultada após a limpeza e retornou 0 categorias de produto;
- 9 itens que ainda estavam ligados às 8 últimas categorias foram verificados após a exclusão e passaram a ficar sem categoria no ERP;
- 3.310 referências antigas de categoria presentes no espelho local dos produtos foram limpas, sem alterar nome, SKU, preço, estoque, fornecedor ou demais dados dos itens;
- os registros históricos de sincronização foram preservados para auditoria.

### Segurança e validação
- a exclusão foi executada respeitando o limite de requisições da API do Bling;
- categorias-filhas foram removidas antes das categorias-pai quando necessário;
- cada um dos 9 itens afetados foi consultado no Bling após a exclusão e retornou sem categoria;
- uma consulta final a `/categorias/produtos` retornou lista vazia;
- a Edge Function temporária de manutenção foi novamente desativada após a verificação.

### Classificação comercial por IA
A nova rotina usa referências auditáveis de mercado, com base inicial em Kalunga, Mercado Livre e FuturaIM.

Regras principais:
- toda sugestão deve apontar para uma das 11 famílias existentes;
- referências comerciais funcionam como evidência, não como regra para copiar árvores de terceiros;
- novas categorias continuam dependendo de moderação humana;
- a IA registra confiança, justificativa e `market_basis`;
- lotes são limitados a até 20 itens e descrições extensas são reduzidas antes da análise.

### Próximo passo
Em **Central de Taxonomia → Moderação IA**, criar uma nova análise e executar **Analisar próximos 20**. Revisar primeiro as categorias sugeridas e somente depois aprovar/aplicar a nova estrutura.

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
- saída estruturada por JSON Schema com fallback controlado;
- cada sugestão já deve apontar para uma família oficial;
- evidência da sugestão registra `market_basis`;
- falhas operacionais retornam mensagem legível ao painel em vez de apenas erro HTTP genérico;
- itens que não puderem ser validados ficam registrados como não resolvidos, evitando travar repetidamente no mesmo lote.

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
