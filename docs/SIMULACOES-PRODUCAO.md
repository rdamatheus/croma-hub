# Simulações de Produção — Croma Hub

## Objetivo

O módulo `/interno/simulador-bobina/` passou a concentrar dois tipos de otimização:

1. **Adesivos em bobina (`roll`)** — largura limitada, comprimento variável.
2. **Placas / chapas (`sheet`)** — largura e altura máximas.

A interface, persistência, histórico e vínculo com propostas são compartilhados. As engines geométricas são separadas porque os problemas de encaixe são diferentes.

## Persistência

### production_simulations

Registro mestre da simulação.

- `simulation_type`: `roll` ou `sheet`
- `title`
- `proposal_id`: vínculo opcional com `sales_proposals`
- `customer_id` / `customer_name`: snapshot de contexto
- `current_version`
- `source` e `source_metadata`
- auditoria de criação/atualização

### production_simulation_versions

Snapshot imutável de cada salvamento.

- `version_number`
- `config`
- `items`
- `result`
- `financials`
- `notes`

Salvar novamente uma simulação cria uma nova versão. Alterações futuras nos padrões não modificam o cálculo que sustentou uma cotação antiga.

## Vínculo com propostas

O fluxo é bidirecional.

**Simulador → Proposta**
- selecionar uma proposta no campo "Proposta vinculada";
- salvar a simulação;
- o vínculo passa a ser `production_simulations.proposal_id`.

**Proposta → Simulador**
- a tela de propostas mostra as simulações já vinculadas;
- "Simular produção" abre o simulador com `?proposal=<uuid>`;
- abrir uma simulação existente usa `?simulation=<uuid>`.

Usuários de equipe podem salvar simulações independentes. O vínculo com propostas segue a restrição gerencial já existente para propostas.

## Bobina de adesivos

Configuração principal:

- largura máxima da bobina;
- margem lateral única, aplicada nos dois lados;
- espaçamento horizontal e vertical com o mesmo valor;
- rotação automática 90°;
- máximo de segmentos.

Objetivo:

1. encaixar 100% das unidades;
2. minimizar a área efetivamente encomendada;
3. permitir segmentação quando a soma das áreas dos segmentos é menor que uma faixa única;
4. informar metros lineares, m², aproveitamento e sobra paga.

Financeiro opcional:

- preço por m²;
- frete;
- markup.

## Placas / chapas

Configuração principal:

- largura máxima;
- altura máxima;
- margem;
- espaçamento de corte;
- rotação automática.

Padrão inicial: **200 × 100 cm**, editável.

Objetivo:

1. encaixar 100% das peças;
2. minimizar primeiro a quantidade de chapas;
3. entre soluções com a mesma quantidade de chapas, escolher o melhor aproveitamento;
4. informar quantidade de chapas, m² totais, aproveitamento e sobra.

Financeiro opcional:

- custo por chapa;
- frete;
- markup.

A engine de chapas usa empacotamento retangular 2D com múltiplas ordens de inserção e rotações.

## Importação inicial do Google Drive

Fonte: `In House / PRODUÇÃO`.

Foram criadas duas simulações independentes:

### In House — Adesivos Brilho

Fonte: pasta `Adesivos Brilho`.

- 21 tipos de arquivo
- 36 unidades
- dimensões e quantidades extraídas dos nomes dos PDFs
- bobina inicial de 120 cm
- margem de 0,5 cm
- espaçamento de 0,3 cm
- rotação automática
- até 4 segmentos

Resultado inicial: 4 segmentos, 3,000 m lineares somados, 3,051 m² considerados e aproximadamente 93,68% de aproveitamento.

### In House — Placas PVC

Fonte: pasta `PLACAS PVC`.

- 5 tipos
- 7 unidades
- chapa inicial 200 × 100 cm
- rotação automática

Resultado inicial: 1 chapa e aproximadamente 55,34% de aproveitamento.

Cada item importado mantém em `metadata` o ID, nome e URL do arquivo de origem no Drive.

## Observações

- Dimensões com apenas um número no nome do arquivo, como `20CM`, foram interpretadas como envelope quadrado `20 × 20 cm` para fins de encaixe.
- O arquivo continua associado ao item através do metadata do snapshot.
- As simulações importadas não foram vinculadas automaticamente a cliente ou proposta, pois a pasta `In House` não identifica de forma inequívoca uma proposta comercial existente.
