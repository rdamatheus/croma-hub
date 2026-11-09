# Protocolo dos agentes e chats

## Entrada
Receber a intenção e localizar `managed_projects.id` / `slug`. Ler: `docs/INDEX.md`, regras aplicáveis, tarefas abertas do projeto, últimos eventos e aprovações relevantes.

## Saída
Ao terminar uma etapa autorizada, registrar: resultado, evidência, estado da tarefa, pendência, dependência, próximo passo, responsável e data de reavaliação, quando existir.

## Registros
- **Tarefa**: trabalho acionável, com status, prioridade e prazo.
- **Diário**: decisão, observação, bloqueio, progresso, transferência de contexto ou validação, sem apagar histórico.
- **Manual**: regra estável e aprovada, em GitHub, com histórico de versão.
- **Campanha**: aprovação na Central de Aprovações, nunca apenas no diário.

## Resolução de divergências
Preferir fontes operacionais atuais para estado, documentos versionados para regras estáveis e decisões explicitamente aprovadas para autorização. Havendo contradição, **parar a mudança**, registrar a divergência e solicitar validação.

## Limitação
Chats não recebem sincronização automática do diário por este arquivo. O início de um novo trabalho deve incluir uma consulta explícita à fonte oficial; agentes externos precisam de integração e permissões próprias.
