# Croma Hub

Site e área interna da Croma.

## Área interna

O Croma Hub organiza funções operacionais sem substituir o ERP/sistema de vendas.

### Centro de Operações

Rota: `interno/gestao/`

Funções principais:
- quadro de tarefas no estilo Kanban: A fazer, Em andamento e Concluído;
- checklist diário e indicação da próxima função;
- calendário mensal;
- rotinas recorrentes pré-cadastradas;
- tarefas pontuais;
- categorias Comercial, Administrativo, Financeiro, Marketing e Postagens, Limpeza e Organização, Estoque e Compras, Produção e Operação e Pessoas e RH.

A versão atual persiste dados no `localStorage`, mas o modelo já usa campos compatíveis com uma futura migração para Supabase: `id`, `title`, `category`, `date`, `time`, `priority`, `status`, `routineId` e `notes`.

## Autenticação

A proteção atual da área interna é provisória e executada no navegador. Deve ser substituída por autenticação real, preferencialmente Supabase Auth, antes de armazenar dados sensíveis ou liberar múltiplos usuários.
