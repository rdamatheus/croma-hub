# Arquitetura — Assistente Administrativo Croma

## Objetivo

Permitir que a equipe converse em linguagem natural com o painel interno da Croma e que o sistema transforme mensagens em ações estruturadas, revisáveis e auditáveis, usando Supabase como fonte oficial dos dados.

Exemplos:
- "Criar uma tarefa para falar com João amanhã sobre os rótulos."
- "Registrar que a cliente Ana pediu 500 adesivos 5x5."
- "Isso é uma ideia de marketing, guardar para revisar depois."
- "O que está pendente com este cliente?"

## Princípios

1. Linguagem natural é a interface; banco estruturado continua sendo a fonte da verdade.
2. A IA nunca recebe permissão ampla para escrever SQL ou alterar tabelas arbitrariamente.
3. A IA escolhe apenas entre ferramentas previamente definidas pelo sistema.
4. Ações destrutivas, financeiras, de estoque, preço, produção ou código exigem confirmação explícita.
5. Toda ação executada gera log de auditoria.
6. O browser usa somente a chave publishable/anon e JWT do usuário.
7. Segredos de IA e service role permanecem em Supabase Edge Functions.
8. O Copiloto deve aproveitar a autenticação e os papéis internos já existentes.

## Arquitetura de alto nível

Painel interno / WhatsApp / formulário rápido
        ↓
Caixa de entrada do Assistente
        ↓
Supabase Edge Function `croma-assistente`
        ↓
Validação JWT + `profiles.role`
        ↓
Context Builder (busca somente dados necessários)
        ↓
Modelo de IA com ferramentas estruturadas
        ↓
Plano de ação tipado
        ↓
Policy Engine
        ↓
[executar automaticamente] ou [pedir confirmação]
        ↓
Função determinística executa operação no Supabase
        ↓
Audit log + resposta ao usuário

## Interface sugerida

Adicionar ao `/interno/copiloto/` uma área de conversa com:

- caixa de texto principal;
- botão enviar;
- atalhos: Tarefa, Cliente, Comercial, Produção, Marketing, Ideia, Nota;
- respostas curtas;
- cards de ações propostas;
- botões `Confirmar`, `Editar`, `Cancelar`;
- histórico das últimas ações;
- indicação visual de ações executadas e apenas sugeridas.

O assistente deve aceitar texto e, futuramente, áudio, imagens e documentos.

## Modelo de dados mínimo

### `assistant_threads`
Sessões/conversas do assistente.

Campos sugeridos:
- `id uuid`
- `user_id uuid`
- `title text`
- `context_type text` (`general`, `customer`, `order`, `production`, `marketing`, etc.)
- `context_id uuid nullable`
- `created_at timestamptz`
- `updated_at timestamptz`

### `assistant_messages`
Histórico bruto das mensagens.

Campos sugeridos:
- `id uuid`
- `thread_id uuid`
- `user_id uuid`
- `role text` (`user`, `assistant`, `system`)
- `content text`
- `source text` (`panel`, `whatsapp`, `form`, `api`)
- `metadata jsonb`
- `created_at timestamptz`

### `assistant_actions`
Ações interpretadas pela IA.

Campos sugeridos:
- `id uuid`
- `thread_id uuid`
- `message_id uuid`
- `user_id uuid`
- `action_type text`
- `payload jsonb`
- `risk_level text` (`low`, `medium`, `high`, `critical`)
- `status text` (`proposed`, `confirmed`, `executed`, `failed`, `cancelled`)
- `confirmation_required boolean`
- `result jsonb`
- `created_at timestamptz`
- `confirmed_at timestamptz`
- `executed_at timestamptz`

### `assistant_audit_log`
Registro imutável da operação.

Campos sugeridos:
- `id uuid`
- `user_id uuid`
- `action_id uuid nullable`
- `event text`
- `entity_type text`
- `entity_id text`
- `before_data jsonb nullable`
- `after_data jsonb nullable`
- `created_at timestamptz`

## Ferramentas iniciais do agente

Começar pequeno. O modelo não conhece o banco diretamente; ele conhece somente estas funções:

- `create_task(title, area, due_at, priority, related_type, related_id)`
- `create_note(title, content, area, related_type, related_id)`
- `create_idea(title, content, area, tags)`
- `find_customer(query)`
- `get_customer_context(customer_id)`
- `add_customer_note(customer_id, content)`
- `create_commercial_followup(customer_id, description, due_at)`
- `search_internal_memory(query, area, limit)`

Fase seguinte:
- criar/alterar pedido;
- produção;
- estoque;
- financeiro;
- preço;
- mensagens externas.

Essas ferramentas posteriores devem possuir níveis mais altos de risco.

## Policy Engine

### Baixo risco — pode executar automaticamente
- criar ideia;
- criar nota;
- registrar memória;
- criar tarefa comum;
- buscar dados;
- resumir informações.

### Médio risco — confirmar inicialmente
- alterar tarefa existente;
- criar follow-up comercial;
- vincular registro a cliente/pedido;
- mudar status operacional.

### Alto risco — confirmação obrigatória
- alterar pedido;
- mexer em estoque;
- preço/custo/margem;
- enviar mensagem para cliente;
- criar ou excluir cliente;
- operações financeiras.

### Crítico — fora do agente operacional
- mudanças no código em produção;
- GitHub/deploy;
- chaves/credenciais;
- RLS/permissões;
- exclusões em massa.

## Contrato de saída da IA

A Edge Function pede ao modelo um plano estruturado, nunca texto livre para execução.

Exemplo conceitual:

```json
{
  "reply": "Entendi. Posso criar um retorno comercial para amanhã.",
  "actions": [
    {
      "tool": "create_commercial_followup",
      "arguments": {
        "customer_id": "uuid",
        "description": "Falar sobre os rótulos",
        "due_at": "2026-08-29T09:00:00-03:00"
      }
    }
  ]
}
```

O servidor valida os argumentos antes de qualquer execução.

## Fluxo de uma mensagem

Exemplo: `A cliente Ana pediu 500 adesivos 5x5 e preciso retornar amanhã.`

1. Frontend envia mensagem + JWT + contexto atual.
2. Edge Function valida usuário e papel interno.
3. Context Builder procura clientes chamados Ana.
4. Se houver ambiguidade, o assistente pergunta qual Ana.
5. IA sugere duas ações: nota comercial + follow-up.
6. Policy Engine classifica risco.
7. UI mostra ações propostas.
8. Usuário confirma.
9. Backend executa funções determinísticas.
10. O sistema grava `assistant_actions` e `assistant_audit_log`.

## Context Builder

Nunca enviar o banco inteiro ao modelo.

O backend recebe a mensagem e busca somente o contexto relevante, por exemplo:
- usuário e papel;
- página atual;
- cliente selecionado;
- últimos registros relacionados;
- memória interna relevante;
- tabelas explicitamente necessárias para a intenção detectada.

Isso reduz custo, latência e risco de vazamento.

## WhatsApp

A prova de conceito existente deve ser reaproveitada.

Futuro fluxo:

WhatsApp oficial → webhook → tabela de mensagens → processamento de anexos → classificador → `assistant_actions` → fila de revisão interna.

No início mensagens recebidas de clientes nunca devem alterar pedidos, estoque, financeiro ou produção sozinhas.

Exemplo:
Cliente: `Pode separar duas unidades? Amanhã passo aí.`

Resultado sugerido:
- intenção: reserva / comercial;
- pendência: identificar produto e quantidade exata;
- ação proposta: criar follow-up;
- resposta sugerida: perguntar/confirmação necessária.

## Reuso do laboratório atual

O laboratório WhatsApp já possui:
- tabelas isoladas;
- storage privado;
- processamento de áudio, imagem e documento;
- Edge Function;
- validação de autenticação e papel;
- segredo `OPENAI_API_KEY` no servidor.

A evolução correta é extrair os componentes genéricos desse laboratório para funções compartilhadas em vez de criar uma segunda integração de IA.

## Estratégia de custo

MVP:
- Supabase atual;
- Edge Functions;
- modelo barato para interpretação/classificação;
- modelo melhor somente como fallback para casos ambíguos/complexos;
- contexto pequeno e seletivo;
- sem banco vetorial inicialmente;
- sem framework pesado de agentes.

A maioria das operações CRUD não precisa de IA depois que a intenção é identificada.

## Fases

### Fase 1 — Assistente interno de texto
- tela de chat;
- tabelas `assistant_*`;
- Edge Function;
- 8 ferramentas seguras;
- confirmação por cards;
- logs.

### Fase 2 — Contexto profundo
- cliente/pedido selecionado vira contexto automático;
- perguntas sobre histórico;
- memória do Copiloto integrada;
- atalhos e links pré-preenchidos.

### Fase 3 — WhatsApp
- webhook oficial;
- mensagens e mídia;
- sugestões automáticas de tarefas, notas e respostas;
- fila de revisão.

### Fase 4 — Automação controlada
- regras de autoexecução para ações repetitivas de baixo risco;
- notificações internas;
- rotinas programadas.

### Fase 5 — Agente de desenvolvimento separado
Um agente específico pode preparar mudanças no GitHub, mas sempre via branch/PR e aprovação humana. Nunca compartilhar permissões desse agente com o assistente operacional.

## Primeiro incremento recomendado

Implementar dentro do Copiloto atual:

1. caixa de conversa;
2. tabelas `assistant_threads`, `assistant_messages`, `assistant_actions`, `assistant_audit_log`;
3. função `croma-assistente`;
4. ferramentas `create_task`, `create_note`, `create_idea`, `find_customer`, `get_customer_context`, `add_customer_note`, `create_commercial_followup`, `search_internal_memory`;
5. cards de confirmação;
6. log de auditoria.

Esse incremento já permite conversar com o painel de forma semelhante a um assistente, sem precisar automatizar módulos críticos de uma vez.
