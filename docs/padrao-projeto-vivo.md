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

## Apresentação da interface interna — revisão de 22/11/2026
- A mesma página de detalhes é usada para todos os projetos: `/interno/projetos/detalhe/?slug=<slug>`.
- A navegação contém seis seções: visão geral, diagnóstico, decisões, plano de ação, histórico e referências.
- O topo resume a quantidade de registros, decisões vigentes aprovadas, propostas em análise e próximos passos **descritos** (não confundir com tarefas efetivas).
- Decisões aprovadas, propostas e rejeitadas/substituídas aparecem em grupos independentes, mantendo o histórico íntegro.
- O histórico é cronológico, expansível, agrupado por mês e filtrável por situação/tipo. Textos narrativos extensos são divididos apenas para exibição; nenhuma reclassificação ou alteração dos registros é feita no banco.
- A visualização permanece somente para leitura e protegida pela autenticação existente de owner/manager. Falhas de consulta devem ser exibidas explicitamente, sem declarar falsamente que não há registros.
- Validação executada: verificação dos arquivos no GitHub, sintaxe JS, existência de IDs esperados e teste funcional de renderização com dados simulados. **A publicação e o acesso autenticado em navegador real ainda precisam de conferência.**

## Extensão unificada de execução (v1.1) — projetos internos e de clientes

**Decisão:** manter um único Projeto Vivo, sem módulo, tabela ou página de projeto paralela. `project_type` já aceita `internal`, `venture`, `client` e `external`. A estrutura base, as seis seções e o marcador `metadata.standard = "projeto-vivo-v1"` permanecem compatíveis. Projetos antigos não exigem migração.

- Para projetos do tipo `client` (ou qualquer projeto que tenha `metadata.execution` preenchido), a **Visão geral** exibe também um painel operacional condicional, na mesma página de detalhes.
- `metadata.execution` é **opcional** e contém apenas dados de acompanhamento específicos do projeto. Exemplo de formato, com dados fictícios (não cadastrar este exemplo):
  ```json
  {
    "customer_name": "Cliente ilustrativo",
    "order_ref": {"system": "Bling", "number": "OS-exemplo", "url": "https://exemplo.invalid/os"},
    "deliverables": [
      {"name": "Placa ilustrativa", "quantity": 1, "unit": "un.", "specification": "medidas a confirmar", "supplier": "a definir", "stage": "levantamento"}
    ],
    "pending_checks": ["Confirmar medidas antes de produzir"]
  }
  ```
- `order_ref` aponta para a **OS de origem**; não cria, modifica nem sincroniza essa OS. Não inventar número, link, produto, custo, situação ou cliente. Confirmar a referência antes de preenchê-la.
- `deliverables` apresenta o acompanhamento de produção, **não uma segunda lista comercial de itens**. Os valores de venda, pagamentos e dados oficiais da OS continuam no Bling/pedido de origem. Referenciar a origem, não duplicar dados sensíveis, arquivos ou preços sem necessidade.
- `pending_checks` registra dúvidas do levantamento; não representa tarefas aprovadas. Tarefas reais continuam em `public.tasks`; decisões e progresso permanecem no histórico imutável `public.project_journal`; imagens e documentos ficam em `metadata.references[]` apontando para a origem.
- A interface é somente leitura, controlada pela autenticação existente de owner/manager. As URLs externas são limitadas a HTTP(S) e abertas com `noopener noreferrer`.
- A integração automática OS → Projeto e o cadastro do projeto dos Correios **não estão implementados** nesta etapa. Eles dependem de conferência da existência da OS, identificador estável, autorização de alterações e verificação de idempotência (não duplicar projetos).
- Para atualizar o padrão, evoluir este documento e a mesma tela; evitar módulos de produção paralelos. Preservar proteção de dados, auditabilidade e os projetos já existentes.

**Validações exigidas antes de publicar:** sintaxe, IDs de interface, acessos internos, exibição sem `execution` em projeto interno, exibição com `execution` em projeto cliente, link externo seguro e ausência de escrita no Bling/Supabase. Publicação e teste autenticado em navegador real permanecem etapas distintas.
