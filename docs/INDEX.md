# Diretório Mestre — índice

**Objetivo:** preservar continuidade entre gestão, agentes e conversas, sem criar fonte paralela de verdade.

## Navegação
- [Governança, estados e responsabilidades](GOVERNANCA.md)
- [Cadastro de projetos e frentes conhecidas](PROJETOS.md)
- [Protocolo de trabalho dos agentes](AGENTES.md)
- [Agente de Continuidade e situação de ativação](AGENTE-CONTINUIDADE.md)
- [Migração e validação](MIGRACAO.md)
- [Instruções curtas para agentes](../AGENTS.md)

## O que mora onde

| Tipo de informação | Fonte oficial |
| --- | --- |
| Projetos cadastrados | Supabase `public.managed_projects` |
| Agenda e tarefas | Supabase `public.tasks` |
| Diário de progresso, decisões e validações | Supabase `public.project_journal` (migração aplicada; interface em PR) |
| Conhecimento de operação | Supabase `public.knowledge_entries` |
| Evolução de sistema | Supabase `public.system_evolution_items` |
| Aprovações comerciais | Supabase `public.site_approval_proposals` e versões |
| Manual técnico e regras estáveis | GitHub `docs/` |

## Como usar
1. Consulte o cadastro do projeto e o diário mais recente; confirme a data.
2. Verifique tarefas pendentes, aprovações e bloqueios.
3. Trabalhe apenas com autorização aplicável.
4. Registre decisões, fatos e validação; atualize status e próximo passo da tarefa.
5. Não trate notas históricas como status atual sem validação.

**Observação:** o acesso por diferentes chats depende dos conectores disponíveis e de instruções explícitas de consulta. Este índice não sincroniza automaticamente conversas.
