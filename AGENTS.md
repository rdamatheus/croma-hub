# Portaria central do Croma Hub — v1

Ponto de entrada obrigatório para ChatGPT (voz ou texto), Codex, agentes e mantenedores. Vale para todo o repositório e para intervenções no Supabase, Bling, integrações e automações do Hub. Não substitui permissões nem autorizações.

## Entrada — antes de qualquer alteração
1. Ler este arquivo na branch oficial main e registrar o SHA do blob consultado. Ler [Arquitetura](docs/ARQUITETURA.md), [Projeto Vivo](docs/padrao-projeto-vivo.md) e [Evolução do Hub](docs/EVOLUCAO_CROMA_HUB.md); localizar e ler a documentação específica do módulo em docs/.
2. Recuperar estado real, decisões vigentes, pendências e histórico do projeto Croma Hub na estrutura existente de Projetos, e itens pertinentes no módulo Evolução. Conferir central de aprovações aplicável. Não tratar resumo de chat como prova de estado atual.
3. Identificar escopo, fontes oficiais, componentes existentes, impactos, riscos, permissões, compatibilidade e validação. Registrar autorização explícita do responsável e sua origem. Consultas não destrutivas dentro do escopo são permitidas.
4. Se documentação obrigatória, contexto necessário, permissões ou autorização não estiverem acessíveis, parar antes de escrever, explicar o bloqueio e solicitar somente o necessário. Nunca presumir aprovação nem contornar controles.

## Execução
- Reutilizar estruturas e fontes de verdade; preservar dados, histórico, regras e decisões aprovadas. Uma decisão só é substituída explicitamente. Seguir RLS, autenticação e proteção de credenciais da arquitetura oficial.
- Usar branch e pull request auditáveis; não escrever diretamente em main. Alterações de banco, ERP ou automações seguem autorização e validação específicas; não fazer mutações diretas para contornar a portaria.
- Escopo aprovado não autoriza novas funcionalidades, custos, exclusões, mudanças de permissões ou integrações não previstas.
- Para interface, aplicar o padrão abaixo e os componentes compartilhados existentes. Não alterar regras comerciais apenas para simplificar a tela.

## Padrão de experiência (UI)
- Linguagem operacional, títulos curtos, sem detalhes internos de desenvolvimento ou testes na interface comum. Manter instruções necessárias, avisos de segurança e erros acionáveis.
- Ações pontuais (criar, editar, importar, confirmar): janela modal acessível com título, cancelar/fechar, foco gerenciado, navegação por teclado e retorno ao contexto anterior. Fluxos longos: página própria ou assistente em etapas, sem deslocamento automático confuso entre quadros.
- Usar componentes e estilos compartilhados, ações primárias consistentes, carregamento e confirmação claros, prevenção de duplo envio e perda de dados. Não fechar operações em andamento silenciosamente.
- Preservar responsividade, acessibilidade, permissões e comportamento já aprovado. Validar no navegador quando disponível. Não alterar todo o sistema de uma vez sem testes por módulo.

## Saída
- No PR, registrar revisão da portaria, documentos lidos, autorização, escopo, impacto, validações (resultado real e pendências) e reversão. Não publicar dados de clientes ou informações confidenciais no repositório; referências internas devem ser opacas e não sensíveis.
- Registrar decisões e evolução nos módulos existentes, sem criar backlog paralelo. Atualizar documentação específica e histórico quando pertinente; consultar novamente para confirmar escritas.
- Só declarar concluído após evidência adequada. Verificar publicação e uso real quando aplicável; explicitar limitações.
- O check de conformidade é estrutural: não comprova leitura ou aprovação verdadeira. A proteção da branch e controles de acesso devem ser configurados pelo responsável. Sem acesso técnico a esses controles, informar a lacuna, não alegar bloqueio universal.

## Veracidade dos estados operacionais
- Distinguir preparação, envio, persistência, processamento de conteúdo e validação. Exibir sucesso apenas para a etapa efetivamente confirmada; falhas parciais e pendências devem permanecer visíveis, com orientação para retomada. Não declarar conteúdo processado apenas porque um arquivo foi descompactado ou salvo. Não simular progresso nem tratar ausência de erro como comprovação de resultado.
