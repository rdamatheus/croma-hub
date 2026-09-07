# Evolução Croma Hub

## Objetivo

Este documento define como o Croma Hub registra e acompanha a evolução do **site, painel interno, catálogo, back-end, integrações, segurança e documentação**. Melhorias gerais da empresa não entram aqui.

O estado vivo fica no módulo interno **Evolução Croma Hub**. Este arquivo explica a arquitetura e as regras; não mantém uma segunda lista concorrente de tarefas.

## Princípios

1. **Banco antes de JSON** — dados operacionais conhecidos e manipuláveis usam tabelas, colunas, chaves e relacionamentos. JSON/JSONB fica restrito a estruturas genuinamente variáveis ou compatibilidade legada em migração.
2. **Uma fonte por conceito** — roadmap/backlog/ideias do sistema usam `system_evolution_*`; P&D continua dedicado a conhecimento de produção; Copiloto/Knowledge continua dedicado à memória e decisões da operação.
3. **Evidência antes de “concluído”** — item só recebe `done` quando implementação e validação correspondentes existem.
4. **Histórico não é roadmap** — `docs/VERSOES.md`, commits e migrations registram o que aconteceu. O módulo Evolução mostra estado atual e futuro.
5. **Atualização contínua** — toda alteração estrutural relevante deve revisar o item correspondente e, quando necessário, a arquitetura/documentação.
6. **Sem redundância** — antes de criar item, procurar iniciativa/tarefa/ideia equivalente e complementar a existente.

## Estrutura do módulo

### Áreas
- Comercial
- Catálogo
- Front-end
- Back-end
- Integrações
- Infraestrutura & Segurança
- Documentação & Qualidade

### Tipos
- `initiative`: conjunto maior de entregas;
- `task`: entrega executável;
- `idea`: hipótese ou possibilidade futura ainda não priorizada;
- `decision`: decisão arquitetural relevante;
- `debt`: dívida técnica conhecida.

### Status
- `idea`
- `planned`
- `in_progress`
- `blocked`
- `done`
- `cancelled`

### Prioridade
- **P0** — segurança, perda/corrupção de dados ou bloqueio de operação/venda;
- **P1** — função central ou impacto comercial relevante;
- **P2** — organização, produtividade e melhoria importante;
- **P3** — otimização ou possibilidade futura.

### Horizonte
- `current`: trabalho atual;
- `next`: próximo ciclo;
- `future`: ideia/futuro sem compromisso imediato.

## Modelo relacional

- `system_evolution_areas`: áreas estáveis do produto;
- `system_evolution_items`: iniciativas, tarefas, ideias, decisões e dívidas;
- `system_evolution_dependencies`: dependências entre itens;
- `parent_id`: permite iniciativa → tarefa → subtarefa sem duplicar estruturas.

Campos textuais como objetivo, critério de aceite e notas continuam colunas próprias. O módulo não usa `internal_module_state` para seu backlog.

## Carrinho persistente

### Regra
- sem login: o navegador mantém uma cópia local persistente; atualizar a página ou reiniciar o aparelho não deve limpar o carrinho;
- com login: existe no máximo **um carrinho ativo por cliente** no Supabase;
- ao autenticar, a aplicação compara a atualização local com a remota e preserva a versão mais recente;
- alterações sincronizam o carrinho para o banco;
- o carrinho só é encerrado por limpeza explícita ou conversão em pedido.

### Tabelas
- `carts`
- `cart_items`
- `cart_item_options`
- `cart_files`

Arquivos binários permanecem no Storage privado; o banco guarda vínculo e metadados.

## Checkout híbrido

1. cliente autentica;
2. carrinho é sincronizado;
3. `checkout_active_cart` fecha o pedido em uma transação;
4. itens, opções e arquivos viram snapshot histórico do pedido;
5. `checkout_reference` impede duplicação por reenvio;
6. somente após sucesso o navegador abre o WhatsApp com resumo do pedido;
7. falha/fechamento do WhatsApp não remove o pedido já registrado.

O WhatsApp é canal de comunicação, não a fonte oficial do pedido.

## Normalização de dados

Novos dados operacionais não devem ser colocados em JSON por conveniência. Nesta evolução:
- opções do carrinho: `cart_item_options`;
- opções históricas do pedido: `order_item_options`;
- endereço de entrega do pedido: colunas `delivery_*`;
- roadmap: tabelas `system_evolution_*`.

`orders.delivery_address` e `order_items.options` permanecem temporariamente por compatibilidade com código/histórico legado, mas novos fluxos usam a estrutura normalizada. A remoção futura desses campos exige migração e verificação de consumidores antigos.

## Ideias futuras já identificadas

As ideias ficam no próprio módulo. Entre as já registradas está a política de limpeza de uploads de rascunhos abandonados. Novas ideias devem ser adicionadas ali, não acumuladas em documentos paralelos.

## Checklist para cada evolução

1. localizar item existente ou criar um sem duplicidade;
2. definir área, tipo, prioridade e objetivo;
3. avaliar impacto em dados, RLS, integrações e histórico;
4. implementar em branch/migration auditável;
5. validar caminhos de sucesso, falha, autorização e regressão;
6. marcar como concluído somente após evidência;
7. atualizar documentação estrutural e histórico quando aplicável.
