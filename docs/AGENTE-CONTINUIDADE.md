# Agente de Continuidade Croma — especificação

## Objetivo
Revisar o Diretório Mestre, detectar trabalho parado, bloqueios e decisões pendentes, sem executar alterações sem aprovação humana.

## Estado em 08/11/2026
- **Implementado em branch:** módulo `js/diretorio-mestre-analise.js`, acionado na página interna de projetos ao consultar/atualizar os dados.
- **Ainda não publicado:** interface permanece na PR #105 até revisão e merge.
- **Agendamento ChatGPT:** tentativa de criação bloqueada por limite informado pela plataforma (5 automações ativas); **não há agente agendado ativo**.
- **Alternativa futura:** liberar uma vaga de automação com autorização específica ou projetar um executor dedicado com custos, credenciais e segurança avaliados antes de instalar.

## Fontes
1. `public.managed_projects` — cadastro do projeto.
2. `public.tasks` — status, prioridades e prazos.
3. `public.project_journal` — diário append-only, validações, decisões e bloqueios.
4. `public.system_evolution_items`, `public.ops_incidents` — contexto de evolução e incidentes.
5. `public.site_approval_proposals` — exclusivamente para consulta; não duplicar marketing ou aprovações.

## Agente no painel (implementado)
- Analisa **até 100 tarefas e 100 eventos recentes por projeto**.
- Detecta tarefas vencidas, tarefas `em_andamento` sem atualização há 7 dias e decisões propostas não superadas por evento posterior.
- Sinaliza histórico de bloqueios **sem afirmar que continua ativo**.
- Exibe no máximo cinco alertas priorizados. O navegador não envia esses alertas para terceiros nem altera banco automaticamente.

## Rotina programada proposta (NÃO ATIVA)
- Frequência sugerida: dias úteis, manhã, fuso `America/Sao_Paulo`.
- Ler primeiro manuais e status reais; identificar até 3 pontos críticos, com evidências e próximo passo.
- Consultar dados operacionais apenas em modo leitura.
- Não importar conversas históricas como tarefas ativas sem validação.
- Não criar tarefas, mudar status, publicar campanhas, editar código ou alterar dados por conta própria.
- Não duplicar as rotinas existentes de revisão da vitrine, briefing e Instagram.
- Resumo curto com **Resultado, Atenção, Pendências, Próximo passo, Aprovação** se aplicáveis.

## Ativação segura
1. Revisar e aprovar implementação da interface.
2. Fazer testes no navegador com perfis `owner`, `manager`, `equipe` e anônimo.
3. Escolher com autorização qual automação existente pode ser pausada, ou contratar/implementar executor separado sob novo escopo.
4. Criar e validar agendamento; registrar ID e evidência, sem afirmar ativação antes disso.

## Limitações
A análise local não é um LLM e não executa tarefas em segundo plano. A automação agendada dependerá de acesso real aos conectores e de vagas disponíveis. Não pressupor que chats diferentes tenham acesso automático às fontes.
