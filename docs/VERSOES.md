# Histórico funcional de versões — Croma Hub

Este arquivo resume mudanças funcionais relevantes. O histórico técnico detalhado permanece nos commits, migrations e logs de sincronização.

## 2026-09-06 — Central de Taxonomia v2.1

### Objetivo
Limpar a taxonomia local removendo categorias legado sem utilidade e sem dependências, preservando itens e estruturas ainda necessárias à migração.

### Alterado
- removidas permanentemente 50 categorias legado seguras;
- 46 eram de produto e 4 de serviço;
- a limpeza só considerou categorias sem item vinculado, sem subcategoria dependente e sem vínculo com categoria do Bling;
- categorias-pai que ficaram vazias após a primeira limpeza foram reavaliadas antes da remoção.

### Validação
- 20 categorias legado permanecem porque ainda possuem itens e/ou subcategorias dependentes;
- nenhuma categoria segura e vazia permaneceu pendente de exclusão;
- nenhum item ativo ficou sem categoria como consequência da limpeza;
- nenhum vínculo Bling↔Croma foi removido.

### Próximo passo
Migrar os itens que ainda dependem das 20 categorias legado para a taxonomia canônica. Depois, repetir a verificação e eliminar o legado restante quando estiver sem dependências.

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
