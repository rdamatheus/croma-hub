# Personal OS integrado ao Croma Hub — migração e validação
Data: 2026-11-16. Estado: branch isolada, sem deploy, restauração ou importação. Os prompts dos cinco agentes receberam somente a instrução de transição e rastreabilidade, preservando horários, permissões e estados.

## Fontes canônicas

| Domínio | Fonte responsável |
| --- | --- |
| Metas, tarefas e decisões pessoais/transversais | schema personal_os no Supabase croma-hub, por workspace |
| Sistemas gerenciados | public.managed_projects (catálogo, não agenda) |
| Evolução técnica | public.system_evolution_* |
| Operação Croma | Centro Operacional e módulos comerciais/financeiros, sem duplicar tarefas |
| Marketing/aprovações | Central de Marketing e public.site_approval_* |
| LUFF e Liberty | Sistemas próprios; referenciar somente o necessário e autorizado |
| Decisões de código | Documentação/PR do repositório dono |

## Estado verificado (16/11/2026)
- Projeto Supabase antigo personal-os está INACTIVE. Conteúdo não auditado; não restaurar nem descartar sem aprovação e análise de custos.
- Supabase croma-hub está ACTIVE_HEALTHY. Schema personal_os, RLS e RPC ensure_personal_workspace() existentes.
- Na instância ativa: 0 workspaces pessoais, 0 projetos pessoais, 0 tarefas pessoais, 0 decisões pessoais. Existem 3 registros no catálogo managed_projects.
- PR #105 (Diretório Mestre) e PR #107 (Central de Adequações) permanecem abertos. Reconciliar antes de merge, sem criar sistemas paralelos.
- O Personal OS original é uma aplicação Next.js exportada como estática; parte do dashboard e do copiloto continua protótipo.

## Etapas e limites

### Etapa 1 — módulo integrado isolado
- Incluir entrada apenas para proprietário na navegação atual, sem afetar funções comerciais.
- Reutilizar cliente Supabase autenticado do Croma Hub com acesso ao schema personal_os.
- Consultar workspace existente. Só inicializar workspace novo após clique explícito do usuário, via RPC existente.
- Oferecer consulta e CRUD inicial de projetos, tarefas, metas, ideias e decisões com arquivamento reversível e trilha de auditoria.
- Não duplicar tarefas/rotinas da Croma nem forçar sincronização com outros sistemas.
- Não copiar informações privadas para repositório público.

### Etapa 2 — validação anterior à publicação
- Conferir RLS, autorização do proprietário, grants e exposição da Data API; grants sozinhos não garantem que o schema esteja exposto.
- Testar login autenticado do proprietário, inicialização idempotente, leitura/escrita, arquivos/restauração e auditoria.
- Confirmar que gerência/equipe não conseguem abrir a interface e que outra conta não consegue acessar o workspace.
- Não usar credenciais administrativas para simular um usuário.
- Somente após inventário autorizado do Supabase antigo, mapear identidade/IDs, avaliar duplicatas, fazer backup e plano de rollback antes de importar.
- Preservar os 391 registros de tarefas e 15 rotinas verificados no Centro Operacional na auditoria inicial, sem migração automática.
- Portar as demais funcionalidades do Personal OS original em fases; não confundir acesso ao núcleo inicial com migração total.

### Etapa 3 — integração dos cinco agentes
Atualizar as AUTOMAÇÕES EXISTENTES depois que o módulo estiver funcional e publicado, sem criar agentes duplicados e mantendo suas regras, frequências e escopos.

| Agente | Integração específica |
| --- | --- |
| Coordenador | Retomar ID canônico, dependências, bloqueios e evidência; não criar agenda paralela |
| Tecnologia | Acompanhar PRs, testes e publicações; backlog técnico oficial |
| Marketing | Preparar artes/campanhas e encaminhar aprovações; não publicar sem autorização |
| Comercial | Usar cotações, produtos e fornecedores nas fontes operacionais |
| Administração | Segregar empresas/dados privados e retomar sua automação somente com aprovação específica |

Em todos: consultar fonte oficial e autorização, executar o permitido, validar persistência antes de marcar concluído; declarar não sincronizado se apenas houve proposta ou conversa. Nunca tratar memória/chat como gravação confirmada.
Em 16/11: quatro agentes habilitados; Administração e Financeiro desabilitado. Não presumir autorização para reativá-lo.

**Registro verificado nesta execução:** os cinco prompts existentes foram acrescidos da nota de transição para o PR #109. Quatro permaneceram habilitados e Administração permaneceu desabilitado. Nenhum prompt redireciona operações para a nova rota em produção enquanto a implantação e os testes autenticados estiverem pendentes.

## Segurança, compatibilidade e reversão
- Dados pessoais protegidos por owner + workspace RLS; nenhuma credencial secreta em código público.
- A autenticação do Croma Hub não prova existência de dados na conta antiga do Personal OS.
- Não mesclar projetos com nomes semelhantes sem IDs e estratégia de conflito.
- Reverter publicação por PR/commit; não apagar dados antigos ou registros de teste automaticamente.
- Branch e PR não são deploy. Sem merge, mudança de DNS, permissões, banco legado ou automações nesta etapa.

## Validação
- [x] Arquivos da branch relidos por SHA; sintaxe JS compilada e cinco testes estáticos passaram
- [x] RLS, políticas de workspace e grants autenticados inspecionados por consultas somente leitura
- [ ] Schema exposto na Data API confirmado em sessão autenticada (ainda não testado)
- [ ] Fluxos autenticados do proprietário validados
- [ ] Negação de acesso de gerente/equipe/outra conta confirmada
- [ ] PRs #105/#107 reconciliados
- [ ] Dados antigos inventariados após aprovação
- [x] Prompts dos cinco agentes atualizados para reconhecer a transição; status preservados e relidos
- [ ] Acesso operacional dos agentes à nova fonte e resultados validados depois da publicação
- [ ] Publicação confirmada antes de informar reativação concluída
