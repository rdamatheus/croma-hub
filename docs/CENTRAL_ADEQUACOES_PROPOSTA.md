# Central de Adequações — proposta de evolução da Croma

Estado: proposta em branch isolada; não implementado nem publicado.

## Reutilização obrigatória
- Reaproveitar public.site_approval_proposals, site_approval_versions, site_approval_comments e site_approval_preferences após conferir colunas, políticas RLS, contratos e UI.
- Preservar o módulo de Evolução public.system_evolution_* como fonte do backlog técnico. Vincular por ID em vez de copiar tarefas.
- Não substituir a lógica de aprovação atual antes de compatibilizar estados e dados legados.

## Experiência desejada
- Menu: Central de Adequações, com filtros por empresa, agente, tipo, data e estado.
- Estados distintos: ideia, proposta, preparada, executada, validada, bloqueada, aguardando aprovação, rejeitada.
- Ações de baixo risco autorizadas: registrar resultado e evidência sem exigir aprovação; críticas: permanecer aguardando decisão humana.
- Cada registro: empresa, tipo, título, escopo, justificativa, impacto, risco, responsável/origem, evidência, arquivos/links, versão, timestamps reais e decisão.
- Preservar trilha de eventos e autoria; não permitir agente marcar como aprovado nem como validado sem evidência.
- Conteúdo de marketing: referência a arte/banner/legenda prontos para cópia e publicação manual, sem publicar automaticamente.
- Manual da Marca por empresa com público, nicho, tom, identidade, canais, decisões e histórico; reutilizar armazenamento existente quando verificado.

## Aceite antes de merge
1. Confirmar UI e schema atuais, contratos e RLS; mapear campos e estados existentes.
2. Testar visualização e filtros com sessão autorizada; impedir leitura/escrita entre empresas.
3. Testar registro de melhoria de baixo risco, histórico e anexos/links sem duplicar backlog.
4. Testar que ação crítica exige aprovação humana e que agente não consegue aprovar a própria proposta.
5. Testar responsividade, acessibilidade e regressão do fluxo anterior.

## Limites
Sem migration, alteração de dados, deploy ou integração externa nesta etapa. Implementação funcional depende do mapeamento de componentes e contratos atuais.