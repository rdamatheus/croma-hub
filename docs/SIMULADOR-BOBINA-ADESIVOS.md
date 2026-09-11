# Simulador de Bobina de Adesivos — Croma Hub

## Objetivo

Ferramenta interna para calcular o melhor encaixe encontrado de vários adesivos em uma bobina com largura máxima configurável. O foco não é somar apenas a área geométrica dos adesivos: o sistema calcula a área efetivamente encomendada ao fornecedor, considerando margens, espaçamento, rotação, sobras internas e segmentação quando vantajosa.

## Regra comercial do fornecedor

O fornecedor cobra por **m² do retângulo efetivamente encomendado**. Sobras externas ao segmento solicitado não são cobradas. Espaços vazios dentro de um segmento encomendado entram no m² pago.

Por isso, a métrica principal de otimização é a **menor soma de áreas dos segmentos encomendados**, e não apenas o menor comprimento linear.

## Entradas

### Bobina
- largura máxima da bobina;
- margem lateral única, aplicada dos dois lados;
- espaçamento único entre adesivos, aplicado horizontal e verticalmente;
- rotação automática em 90°;
- máximo de segmentos permitido.

Não existe margem final obrigatória no sentido do avanço da bobina. O comprimento termina no último adesivo efetivamente colocado.

### Adesivos
Cada item possui:
- descrição;
- largura;
- altura;
- quantidade.

A interface permite adicionar, duplicar e remover tamanhos.

### Financeiro
- valor por m²;
- frete total da cotação;
- markup opcional.

O frete é somado uma única vez ao custo total de todos os adesivos da simulação.

## Saídas

- soma dos comprimentos dos segmentos;
- área geométrica dos adesivos;
- área efetivamente encomendada;
- área em branco paga;
- aproveitamento;
- perda técnica;
- quantidade de segmentos;
- dimensões de cada segmento;
- quantidade solicitada e alocada por item;
- quantidade de unidades rotacionadas;
- custo do material;
- custo total com frete;
- preço final de revenda com markup.

## Estratégia de encaixe

A engine está em `/js/roll-optimizer.js` e é independente da interface.

Ela usa heurísticas de strip packing/skyline e compara diferentes ordenações e critérios de posicionamento. Quando permitido, também testa a orientação rotacionada de cada adesivo. Para conjuntos de tamanho moderado, executa estratégias dinâmicas adicionais.

A solução é apresentada como **melhor encaixe encontrado**, não como ótimo matemático garantido.

## Segmentação

Depois do encaixe inicial, a engine procura divisões que reduzam a área total encomendada. São avaliados:
- cortes em níveis do encaixe atual;
- separação de tipos inteiros;
- combinações de tipos em conjuntos pequenos;
- sobras de quantidade do mesmo item, especialmente finais de linha que criariam uma faixa larga quase vazia.

A segmentação só é mantida quando reduz efetivamente a soma dos m². Existe um limite configurável de segmentos para evitar soluções operacionalmente excessivas.

## Visualização

A página `/interno/simulador-bobina/` desenha cada segmento em Canvas usando as posições retornadas pela engine. Os retângulos representam o envelope geométrico dos adesivos; cores distinguem os itens e as linhas laterais indicam as margens.

## Persistência

Nenhuma nova tabela foi criada.

- Regras técnicas públicas reutilizáveis continuam em `public.public_config`, na chave `production.plotter_cut.labels`, agora com o bloco `roll`.
- Valor padrão por m² e markup ficam em `public.internal_module_state`, chave `roll_simulator_preferences`, protegida pelas políticas internas já existentes.
- O frete não é salvo como padrão porque é específico de cada cotação.

A gravação dos padrões técnicos fica disponível somente para perfis `owner` e `manager`. O uso do simulador é permitido para `owner`, `manager` e `equipe`.

## Compatibilidade

O cálculo de cartelas A3/A4 existente em `calculateSheetLayout()` foi preservado. A normalização de `production-rules.js` apenas passou a incluir o bloco de configuração de bobina.

A engine foi separada para que futuramente a mesma lógica possa ser reutilizada no configurador público de adesivos sem duplicar fórmulas.

## Validações implementadas

- largura e altura positivas;
- quantidade inteira maior que zero;
- margem não pode eliminar a largura útil;
- item deve caber na largura útil em alguma orientação autorizada;
- todas as unidades precisam ser alocadas;
- rotação respeita a configuração;
- número máximo de segmentos respeitado;
- custo usa a área efetivamente encomendada, não apenas a área geométrica.

## Casos de validação técnica

A engine foi testada localmente com:
- item pequeno que criaria uma cauda larga: a segmentação reduziu a área encomendada;
- sobra de quantidade do mesmo tamanho: o restante foi separado em segmento menor quando vantajoso;
- mistura de três tamanhos com rotação e espaçamento;
- lote com 17.000 unidades para verificar desempenho e alocação completa.

## Próxima evolução prevista

Depois de validar o uso interno em produção, a mesma engine poderá alimentar a área pública de adesivos. Preço de venda público, regras comerciais e experiência do cliente devem continuar separados do cálculo técnico interno.
