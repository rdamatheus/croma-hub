# Histórico funcional de versões — Croma Hub

Este arquivo resume mudanças funcionais relevantes. O histórico técnico detalhado permanece nos commits, migrations e logs de sincronização.

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

### Modificado
- categorias internas podem permanecer ativas sem aparecer no site;
- categorias de serviço já organizadas em famílias foram preservadas como públicas;
- importação Bling continua somente leitura/mapeamento e não sobrescreve a árvore Croma;
- nomes de status e instruções do painel foram deixados mais claros para moderação humana.

### Não foi feito automaticamente
- nenhum dos 25 vínculos Bling↔Croma foi aplicado;
- nenhuma categoria do Bling foi excluída;
- nenhum produto foi recategorizado em massa;
- categorias internas de custos/insumos/equipamentos ainda não foram criadas.

### Riscos controlados
- exclusão de categoria com item ativo ou subcategoria é bloqueada;
- dois IDs do Bling não podem apontar para a mesma categoria Croma;
- novas categorias criadas pela moderação ficam ocultas no site por padrão.

### Próximo passo
Revisar as 25 categorias do Bling no painel, consolidar a árvore canônica e só depois processar a classificação completa dos produtos e serviços.
