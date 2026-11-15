# Propostas comerciais

O módulo de propostas preserva o contexto financeiro de cada cotação no momento em que ela foi montada.

## Campos de preço por item

- `base_cost`: custo do fornecedor sem frete.
- `freight_cost`: frete atribuído ao lote.
- `total_cost`: custo completo considerado na cotação.
- `applied_markup`: markup definido para a proposta.
- `line_total`: preço calculado pelo markup definido.
- `market_reference_price`: referência de mercado pesquisada para o mesmo item/lote ou o comparável mais próximo.
- `suggested_price`: preço comercial sugerido com base em custo, posicionamento e referência de mercado.
- `final_offer_price`: preço final decidido para encaminhamento ao cliente.
- `market_reference_source`: descrição da principal fonte da pesquisa.
- `market_researched_at`: data da pesquisa.
- `market_reference_metadata`: snapshot das fontes e observações da pesquisa.
- `image_url`: snapshot da imagem usada no card da proposta.
- `share_description`: descrição curta usada na mensagem e no card comercial.

Preço por markup, valor de mercado, preço sugerido e preço final são referências independentes. Editar uma proposta não altera automaticamente o cadastro mestre do produto.

## Navegação

O painel interno possui um acesso direto **Propostas** na seção `Cadastros e operação comercial`.

Rota: `/interno/propostas/`

A página permite localizar propostas por número, nome ou telefone e exibe custo, frete, markup, preço pelo markup, valor de mercado, preço sugerido e preço final.

## Edição

O botão **Editar** abre o formulário da cotação. É possível alterar cliente, telefone, status, observações, produto vinculado, descrição comercial, quantidade, custo, frete, markup, preço de mercado, preço sugerido, preço final e imagem.

Quando o produto vinculado é trocado, o formulário busca o fornecedor preferencial, custo/frete e imagem do novo produto para revisão antes de salvar. Essas mudanças permanecem na proposta; o produto mestre não é modificado.

## Encaminhamento e WhatsApp

O botão **Encaminhar proposta** gera uma prévia comercial com imagem, descrição, quantidade e preço final.

A tela oferece:

- copiar mensagem;
- copiar a imagem PNG para colar no WhatsApp Web;
- compartilhar imagem + mensagem pela Web Share API em dispositivos compatíveis;
- abrir `wa.me` no telefone da proposta com a mensagem preenchida.

O `wa.me` não anexa arquivos. Por isso, no computador o fluxo confiável é copiar a imagem, abrir o WhatsApp com o texto pronto e colar a imagem. No celular, quando o navegador/sistema suporta compartilhamento de arquivos, a imagem e a mensagem podem ser enviados pelo compartilhamento nativo.

## Permissões

As tabelas `sales_proposals` e `sales_proposal_items` usam RLS e também precisam de privilégios SQL para o papel `authenticated`.

Checklist obrigatório para novas tabelas internas expostas via Supabase:

1. ativar RLS;
2. criar a política correta por perfil;
3. conceder apenas os `GRANT`s necessários ao papel `authenticated`;
4. não conceder acesso ao papel `anon` quando o módulo for interno;
5. validar a leitura e a escrita pela mesma sessão usada no frontend.

No módulo de propostas, `authenticated` possui `SELECT`, `INSERT`, `UPDATE` e `DELETE`, mas a política RLS continua limitando o acesso efetivo a perfis ativos `owner` e `manager`.

## Exemplo inicial

A Proposta #1, de Laura Giacomini, foi consolidada somente na grade de 250 credenciais. O item preserva custo da Zap, frete, markup 2,5, referência de mercado, sugestão comercial e preço final como campos independentes.


## Cotações originadas no ChatGPT — procedimento operacional (15/11/2026)

### Fonte única e alcance

O cadastro canônico é `public.sales_proposals` com alternativas em `public.sales_proposal_items`, no Supabase do Croma Hub. Conversas do ChatGPT são **origem de trabalho**, e não uma segunda base de propostas. Reaproveitar o módulo `/interno/propostas/`, o vínculo existente com o Bling e os controles de aprovação.

**Limitação operacional:** não existe comprovação de captura automática de *todas* as conversas do ChatGPT. Enquanto não houver ponte autenticada e testada que entregue os eventos de todos os chats, cada atendimento com acesso autorizado ao Supabase precisa registrar e conferir explicitamente a cotação, ou informar que o registro não ocorreu. Não afirmar "sincronização automática habilitada" sem teste ponta a ponta.

### Procedimento obrigatório no atendimento

1. Identificar cliente (nome e telefone quando disponíveis); se não confirmado, usar identificador parcial, sem inventar cadastro. Localizar o arquivo original no Drive, preservando ID/link e verificando acesso.
2. Conferir formato, páginas, cores, materiais, tiragem, acabamento, prazo e eventuais premissas; classificar cada informação como **confirmada**, **estimada** ou **pendente**.
3. Consultar os produtos/serviços e preços em `public.products` e suas relações com o Bling (`bling_product_id`, `bling_sync_status`, `bling_last_synced_at`). **Preço sincronizado anteriormente não equivale a preço conferido em tempo real no Bling.** Anotar fonte e data.
4. Demonstrar a fórmula comercial por alternativa (quantidade × tarifa de impressão + acabamento + frete e serviços adicionais aplicáveis), diferenciando **preço de tabela**, **custo de produção**, **frete**, **markup**, **margem**, **preço sugerido** e **preço final aprovado**. Não calcular margem com custo ausente.
5. Antes de gravar, buscar proposta existente por chave de origem estável, para não duplicar registros. Inserir cabeçalho e opções de forma transacional e idempotente. Registrar chave no campo `notes` e em `sales_proposal_items.metadata.source_key`.
6. Se uma opção reúne serviços diferentes, **não vinculá-la incorretamente a um único produto de serviço**. Usar `product_id = NULL` no item composto e registrar `components` em `metadata`, com IDs de produtos do Hub e do Bling, quantidades e tarifas. Criar produto composto mestre apenas após decisão específica sobre composição e integração.
7. Para preços ainda em estudo, manter `status = 'draft'`, `is_selected = false`, `bling_sync_status = 'not_synced'` e `final_offer_price = NULL`. Usar `suggested_price` e `line_total` como referência comercial preliminar, sem afirmar que o preço foi enviado ou aprovado.
8. Os campos `base_cost`, `freight_cost` e `total_cost` da estrutura atual não aceitam nulos; quando o custo é desconhecido, o preenchimento técnico `0` deve vir acompanhado de `metadata.cost_verified = false` e explicação explícita nas notas. O zero técnico **não significa custo operacional zero**. Não gravar markup fictício.
9. Conferir no banco o número da proposta, total de alternativas, valores, origem, status e ausência de duplicidade. Só declarar registro concluído após leitura de verificação. Se a gravação falhar, avisar de forma explícita.
10. Separar estados: **rascunho** (não enviado), **enviada** (somente mediante confirmação do envio), **aprovada** (opção/preço/cliente confirmados), e pedido/OS mediante autorização própria. Não somar alternativas mutuamente excludentes.

### Sincronização de propostas com o Bling

A funcionalidade existente `bling-proposal-sync` suporta ida e volta e deve ser reutilizada: **não** criar integração paralela. O envio de uma proposta comercial para o Bling deve ocorrer somente após identificação de contato Bling existente, confirmação de uma ou mais opções comerciais efetivamente escolhidas e autorização do envio. A sincronização envia condições comerciais, **não** custo, frete, markup, margem ou documentos privados. Conflitos entre Hub e Bling devem ser revisados, não sobrescritos automaticamente.

Ao converter uma cotação composta em proposta do Bling, revisar se o registro deve ser descritivo ou discriminado nos serviços vinculados, pois o item composto pode ter `product_id=NULL`. Não converter automaticamente propostas em pedidos.

### Piloto verificado: Proposta #41 (15/11/2026)

- Um PDF de 48 páginas em formato Carta, solicitado em A4 com encadernação e prazo urgente.
- Oito **alternativas não cumulativas**: quatro composições de impressão × espiral ou Wire-O.
- Tarifa de referência: P&B A4 R$ 1,00/face, colorida A4 R$ 3,50/face, espiral até 50 folhas R$ 7,00, Wire-O R$ 34,90; fonte: `products.preco` do Croma Hub, vinculados ao Bling, **sem verificação de preço vigente no Bling**.
- Valores são preliminares, entre R$ 55,00 e R$ 202,90. Contagem das páginas coloridas é estimativa de produção e requer verificação antes do fechamento. Custos e prazo não confirmados.
- Registro confirmado como `draft`, oito itens, zero selecionados, `not_synced` no Bling.
- Pendência de revisão: consistência de tabelas de cópias frente/verso versus impressão simples; custo real por face e por acabamento; forma correta de representar composições na sincronização; validação operacional do fluxo ChatGPT → Hub → Bling.

### Segurança e documentação

Não guardar telefones completos de clientes, PDFs privados, tokens, chaves, custos individualizados ou dados internos sensíveis em documentação do **repositório público**. Esses dados ficam em tabelas internas sujeitas a RLS e no Drive com as permissões existentes. Registrar no histórico do projeto apenas referências e decisões necessárias.

### Critério para declarar integração automática concluída

É obrigatório demonstrar um teste ponta a ponta em nova conversa: nova cotação → registro autenticado → leitura de conferência no Croma Hub → deduplicação → atualização controlada após revisão → seleção explícita → prévia Bling → sincronização confirmada e relida no Bling, incluindo tratamento de falhas, sem publicação ou geração de pedido por acidente.
