# Instruções para agentes — Croma Hub

Este arquivo é o ponto inicial de continuidade técnica do Croma Hub. Antes de agir, consultar [docs/INDEX.md](docs/INDEX.md), [docs/GOVERNANCA.md](docs/GOVERNANCA.md) e o estado operacional atual no Supabase.

## Fonte oficial por assunto
- Cadastro de projetos: `public.managed_projects`.
- Agenda e tarefas: `public.tasks`, vinculadas a projetos quando aplicável.
- Diário de decisões, fatos, bloqueios e validações: `public.project_journal` (quando implantado).
- Conhecimento operacional: `public.knowledge_entries`.
- Evolução técnica: `public.system_evolution_items` e dependências.
- Aprovação de campanhas/vitrine: `public.site_approval_*`.
- Documentação técnica e regras estáveis: `docs/`, neste repositório.

## Protocolo antes de qualquer tarefa
1. Identificar o projeto pelo ID/slug oficial, nunca apenas por nome parecido.
2. Ler documentação, estado atual, tarefas abertas, decisões e eventos recentes.
3. Verificar dependências e se outro agente está atuando no mesmo item.
4. Distinguir fatos verificados, hipóteses, propostas e decisões aprovadas.
5. Pesquisar e diagnosticar livremente dentro do escopo; **não fazer mudanças sem autorização explícita**.
6. Quando autorizado, alterar somente o necessário, validar, registrar evidências e próximo passo.
7. Nunca marcar como concluído sem validação. Registrar bloqueios e trabalhos interrompidos.

## Limites
- Não importar pendências de conversas antigas como abertas sem reconciliação.
- Não armazenar senhas, tokens ou dados sensíveis em documentação pública, tarefas ou diários.
- Personal OS mantém isolamento lógico; seus dados particulares não pertencem ao diário compartilhado da Croma.
- A existência deste arquivo **não garante leitura automática por todos os chats**. Interfaces e conectores devem consultar as fontes explicitamente.
- Não duplicar agendas, aprovações ou catálogos; reutilizar módulos existentes.

## Comunicação
Responder objetivamente. Em resultados extensos, concluir com resumo curto: resultado, atenção, pendências, próximo passo e aprovações, somente quando aplicáveis.
