# Governança e continuidade

## Princípio
Uma única referência oficial para cada tipo de dado. A página `/interno/projetos/` apresenta os projetos e o acompanhamento; o Centro Operacional preserva sua função de agenda diária.

## Ciclo de tarefa
- `pendente`: aguardando início ou autorização.
- `em_andamento`: trabalho efetivamente iniciado; registrar próximo passo.
- `concluida`: resultado validado, com evidência identificável.
- `cancelada`: encerrada com motivo documentado.

Não criar um estado duplicado em outro módulo; para impedimentos, registrar evento `bloqueio` no diário e manter tarefa aberta.

## Diário de projeto
Eventos são **acrescentados**, não sobrescritos. Tipos: `progresso`, `decisao`, `bloqueio`, `validacao`, `handoff`, `nota`.
- Decisão: registrar proposta ou aprovação explícita e referência da autorização.
- Validação: registrar teste e resultado observável; não declarar conclusão sem isso.
- Handoff: informar o estado, arquivos ou referências e o próximo passo para outro agente.
- Correções: criar novo evento com referência ao anterior; preservar o histórico.

## Aprovação e controle
- Pesquisa e diagnóstico não destrutivos não exigem aprovação adicional dentro do pedido.
- Mudanças em código, DNS, dados, APIs, publicação, permissões ou automações exigem aprovação explícita anterior.
- Aprovações comerciais continuam na Central de Aprovações já existente.
- Eventos do diário não executam alterações por si e não substituem a aprovação original.

## Segurança e escopo
- Projetos compartilhados: acesso de gestão conforme RLS. Não expor `project_journal` ao público.
- Personal OS: manter informações pessoais apenas em seu domínio isolado; seu cadastro mestre pode ser exibido sem conteúdo privado.
- Operações concorrentes: reler o estado antes de gravar; rejeitar atualizações baseadas em estado desatualizado.
- Novas tabelas: RLS, GRANT explícito e validação com perfis distintos.
- Não copiar dados sensíveis para o repositório público.

## Revisão de continuidade
A rotina futura deve sinalizar tarefas atrasadas, projetos sem próximo passo, bloqueios e validações faltantes. Não presumir uma automação ativa até ela existir e ser testada.
