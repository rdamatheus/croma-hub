# Diretório Mestre — implantação e validação

## Diagnóstico de 08/11/2026
Estruturas existentes verificadas: `managed_projects`, `tasks`, `calendar_events`, `knowledge_entries`, `system_evolution_items`, `site_approval_proposals`, `ops_incidents`.
O painel de projetos existente está em `/interno/projetos/` e já exige papel `owner` ou `manager`.
Nenhum projeto ou tarefa histórica foi criado automaticamente.

## Evolução proposta
1. Criar instruções versionadas e índice (este diretório).
2. Estender `tasks` com vínculo opcional a `managed_projects`, preservando tarefas preexistentes.
3. Acrescentar diário imutável de projeto com RLS de gestão, sem dados privados do Personal OS.
4. Exibir tarefas e diário na página de projetos existente.
5. Validar permissões, campos, fluxos e navegação; só então agendar revisões periódicas.

## Testes necessários
- Cadastro e listagem autenticados para owner/manager.
- Ausência de leitura pública ou de perfil sem permissão.
- Tarefa sem projeto permanece compatível.
- Registros do diário não podem ser editados/apagados pelo navegador.
- Manutenção do site e autenticação existentes.
- Conferência de versão implantada antes de declarar conclusão.

## Risco residual
Conectores externos e chats só usarão o diretório quando configurados para ler as fontes. Não haverá sincronização bidirecional com conversas antigas nem execução automática por efeito da documentação.
