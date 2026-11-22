# Projeto Vivo Croma — padrão de gestão (v1)

## Finalidade
Centralizar o estado atual, o histórico de raciocínio, as decisões, as tarefas e as referências de **cada projeto**, sem duplicar sistemas nem perder justificativas. O painel interno de Projetos deve ser o ponto de consulta; o banco existente é a fonte de verdade.

## Estrutura padrão de cada projeto
1. **Visão geral** — objetivo, situação atual, resultado esperado e status.
2. **Contexto e diagnóstico** — fatos observados, problemas/oportunidades, incertezas e restrições.
3. **Decisões** — propostas, aprovações, rejeições, justificativas e eventuais substituições explícitas.
4. **Plano de ação** — próximos passos e tarefas efetivas, com responsáveis, prioridades, status e prazos quando definidos.
5. **Histórico de evolução** — eventos cronológicos, imutáveis e rastreáveis: notas, progresso, bloqueios, validações, transferências e decisões.
6. **Referências** — links para arquivos, imagens, pesquisas e sistemas de origem.

## Mapeamento à arquitetura existente
- `public.managed_projects`: um projeto por `slug`. A descrição deve ser curta. Usar `metadata.brief` para `objective`, `expected_result`, `current_state`, `context`, `issues[]`, `constraints[]` e `next_steps[]`. Usar `metadata.references[]` para objetos `{label,url}` e `metadata.standard = "projeto-vivo-v1"`.
- `public.project_journal`: histórico append-only associado ao `project_id`. `kind` admite `progresso`, `decisao`, `bloqueio`, `validacao`, `handoff` e `nota`. Apenas decisões podem usar `state=proposto|aprovado|rejeitado`; os outros eventos usam `registrado`. Preencher `source_ref` e, se pertinente, `supersedes_id` para substituição explícita. Nunca editar/excluir a versão anterior.
- `public.tasks`: criar somente ações reais acordadas, vinculadas por `project_id`. Não transformar uma hipótese em tarefa aprovada.
- Não criar novas tabelas, projetos duplicados ou arquivos de contexto concorrentes.

## Procedimento recomendado por conversa ou agente
1. Recuperar **estado atual + decisões vigentes + pendências + últimos registros** antes de orientar mudanças.
2. Capturar as novas informações e separar **fato**, **inferência**, **hipótese**, **proposta**, **decisão aprovada** e **execução validada**.
3. Atualizar a síntese do projeto apenas quando a mudança do estado atual estiver confirmada; a síntese não substitui o histórico.
4. Apresentar as mutações propostas, impactos e riscos. Aguardar autorização explícita do responsável antes de gravar, alterar código ou agir externamente.
5. Escrever um novo registro com origem, data, decisão/resultado e justificativa. Em caso de mudança de decisão, referenciar o registro anterior em `supersedes_id`.
6. Consultar novamente o banco para confirmar a escrita. Para código, validar sintaxe, autenticação, navegação e publicação. Não declarar conclusão sem verificação.

## Regras de qualidade e segurança
- Priorizar texto **enxuto e completo**, sem transcrever toda a conversa.
- Não afirmar que uma proposta foi executada apenas por ter sido aprovada.
- Não preencher medidas, custos, responsáveis ou prazos por inferência.
- Não expor registros internos no site público; usar autenticação e políticas RLS existentes.
- Manter detalhes confidenciais fora de documentação pública no GitHub.
- Guardar arquivos nos locais de origem; no projeto registrar links ou referências, não duplicatas.
- Integração de retomada automática entre novos chats e Croma Hub é uma **etapa separada ainda não validada**.

## Definição de pronto
- Projeto abre a partir do cartão da lista.
- As seis seções exibem dados reais do projeto ou mensagens honestas de ausência de dados.
- Diário exibe todos os tipos, status e origem, preservando histórico.
- Os projetos já existentes continuam acessíveis.
- Nenhuma informação interna é visível sem autenticação.
- Gravação e leitura foram verificadas, e a versão publicada foi conferida.

## Caso inicial: Melhoria da Loja Física Croma
Criado em `managed_projects`, com histórico em `project_journal` e referências à pasta de fotos original. A etapa 6.1 de coleta do contexto foi aprovada. Propostas de alterações físicas, compra e produção de artes permanecem **não aprovadas**.