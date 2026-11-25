# Pagamento em dinheiro — pedidos presenciais e Bling (18/11/2026)

## Objetivo
Registrar corretamente vendas presenciais já recebidas em espécie, sem usar Pix/crédito/débito fictícios nem gerar novas cobranças.

## Decisão aprovada
- `orders.payment_method` passou a aceitar `dinheiro` além das três modalidades anteriores.
- O checkout público continua com as modalidades existentes. Dinheiro é usado para lançamentos presenciais autorizados.
- Lista interna de pedidos e tela de detalhes mostram a modalidade.
- Para pedidos concluídos em dinheiro ainda não vinculados ao Bling, a gestão possui a ação **Enviar pedido ao Bling** na tela de detalhes.
- A Edge Function existente `croma-order-outbound` foi evoluída em seu ambiente de execução: acesso via chave de serviço preservado, acesso adicional por JWT validado para gestores ativos; CORS limitado às origens da Croma. O envio procura uma forma de pagamento **Dinheiro** ativa e não ambígua **já existente** no Bling, associa uma parcela à vista com o valor total e nunca chama os endpoints de lançar contas/estorno. Se não houver forma única, interrompe antes de criar o pedido remoto.
- A Edge Function `bling-order-sync` também reconhece `Dinheiro` no mapeamento de pagamentos de retorno.

## Registro comercial associado
Pedido local `CR-20261117-GILMAR-5290`, data da venda 17/11/2026, total R$ 52,90, três itens de catálogo vinculados ao Bling (digitação R$ 25,00, impressão R$ 16,00 e carnê GPS Brasil R$ 11,90). Venda presencial recebida integralmente, sem cobrança adicional. O preço do carnê no catálogo **não** foi alterado.

## Compatibilidade e cuidados
- O fluxo de `payments` continua exclusivo do Mercado Pago; uma venda em espécie não cria transação online.
- O sincronizador não cria formas de pagamento e não dispara contas a receber.
- O cadastro do cliente é preservado; sincronização de contatos e pedido dependem de acesso real ao Bling.
- Evitar expor chaves internas em código-fonte público.
- O botão no painel só aparece para gestores e exige confirmação explícita.

## Validação
- Constraint verificada no banco com os quatro valores.
- Pedido e seus três itens persistidos no Supabase; soma dos itens bate com o total; os três itens têm IDs vinculados ao Bling.
- Edge Functions implantadas e ativas.
- Código-fonte da interface atualizado no GitHub (main).
- **Pendente**: executar o envio autenticado a partir da tela de detalhes e verificar ID, número, parcelas e total no Bling; não registrar `synced` nem afirmar a criação remota antes da verificação.

## Extensão: Pix externo já recebido — 25/11/2026
- Confirmar por gestor autenticado no registro existente de ações, com referência e conferência explícita. Preservar etapa de produção, impedir confirmação duplicada e não criar transação do Mercado Pago.
- Enviar somente com confirmação integral única, contato sincronizado, forma Pix estático ativa e única destinada a Caixas e Bancos. Reutilizar referência do pedido, conferir possíveis duplicatas, reservar envio antes do POST, validar retorno de itens, total, cliente e parcela. Se resposta incerta, não repetir criação automaticamente.
- Sincronização do pedido não equivale a baixa financeira. Conferir lançamento existente em Caixas e Bancos antes de lançar contas. Nenhuma nova cobrança, alteração de forma de pagamento ou lançamento de contas é solicitado pela função. A configuração real da conta Bling e eventual lançamento automático permanecem sujeitos a homologação.
- Código e migração do PR 121; testes simulados de envio e bloqueios, verificação de sintaxe e Portaria. Validar sessão autenticada e retorno real antes de declarar a venda concluída. Reversão: restaurar função e interface anteriores, preservar eventos históricos.

## Despacho autorizado por fila — revisão de 25/11/2026
- Decisão: não exigir segunda confirmação na tela quando o recebimento já foi expressamente confirmado pela gestão na origem. O envio administrativo usa tarefa existente `erp_sync_jobs`, com aprovação explícita, referência da origem, pedido, valor em centavos e data; não infere pagamento de observação nem simula sessão de usuário. Somente o serviço pode gravar a fila; trabalhador reutiliza autenticação cron existente e restringe a ação a tarefas aprovadas. A reserva e conferência remota do Pix continuam obrigatórias. O envio não cria cobrança e não comprova baixa financeira.
- Este ajuste cobre despacho de pedidos Pix externos já recebidos e autorizados. Automatizar todos os lançamentos definitivos na origem e homologar conciliação financeira são etapas ainda não concluídas. Reversão: restaurar versão anterior da função, preservar tarefas, vínculos e histórico.

## Regra comercial vigente — decisão aprovada em 25/11/2026
Substitui a exigência anterior de Pix estático / Caixas e Bancos e a reconfirmação de recebimento para vendas internas definitivas autorizadas. Pix, Dinheiro, C.Crédito e C.Débito significam recebimento já efetuado pela operação; Crediário significa a receber. O checkout público continua sujeito à confirmação do provedor de pagamento. Não inferir recebimento de rascunhos ou pedidos online. O despacho autorizado existente usa as formas ativas e únicas já cadastradas no Bling, pelo nome e tipo; não cria formas de pagamento, não gera cobranças, não altera situação remota para disparar automações. Preserva a referência, os bloqueios de duplicidade e a validação de retorno. O estado comercial recebido não equivale à prova da baixa no ERP: verificar o lançamento financeiro separadamente, sem presumir conciliação. O gatilho geral na origem e a baixa automática permanecem pendentes de homologação; o fluxo legado de checkout não muda. Reversão: restaurar a versão anterior do servidor e preservar tarefas e vínculos.

## Disparo na origem das vendas internas definitivas — revisão de 25/11/2026
- O registro comercial interno autorizado deve persistir pedido e itens e acionar `public.queue_finalized_internal_sale(p_order_id, p_sale_date, p_source_ref)` na mesma transação, sem reconfirmação pelo operador. A origem é explícita e rastreável; não inferir vendas internas de `status`, observações, pedido importado ou checkout.
- A função é exclusiva do serviço autorizado, sem concessão a anon/authenticated. Reutiliza `erp_sync_jobs`, bloqueia a linha do pedido para idempotência, verifica venda definitiva, itens, valor, ausência de checkout e pagamentos online, vínculo existente e tarefas anteriores. Pix/Dinheiro/C.Crédito/C.Débito usam `payment_confirmed=true`; crediário usa `false` e vencimento registrado.
- O trabalhador existente recebe tarefas estruturadas, valida novamente o pedido e preserva a referência remota. Cron exclusivo de pedidos internos deve acionar somente tarefas da nova origem, a cada dois minutos e somente se houver fila; não reativar outros crons. Erro ou envio ambíguo permanece para revisão, sem reenvio automático cego.
- A criação/validação comercial e a baixa financeira são independentes. Consulta real de homologação em 25/11 retornou venda vinculada, parcela Pix correta e nenhuma conta a receber para o contato nem lançamento de mesmo valor em Caixas e Bancos no período consultado. A modalidade Pix existente tem tipo dinâmico; não lançar contas nem solicitar cobrança enquanto a semântica da baixa e destino efetivo não forem validados. Não modificar a modalidade nem presumir conciliação.
- O checkout público, pedidos importados, ordens de serviço e registros históricos não sofrem reclassificação ou reenvio. A listagem interna não possui fluxo de criação própria; as origens internas autorizadas que persistem diretamente devem usar o contrato na mesma transação. Homologar uma próxima venda real antes de declarar automação integral.
- Reversão: desativar apenas o cron de pedidos internos, restaurar a função anterior e manter tarefas e mapeamentos. O contrato de origem não autoriza ampliar escopo nem alterar permissões de funcionários.

## Recebimentos parcelados em espécie — correção pontual
- O pedido interno definitivo pode registrar mais de uma confirmação manual de recebimento. O envio autorizado pelo registro de origem valida **cada valor positivo, a mesma modalidade e a soma exata do total**; nenhuma confirmação divergente pode ser ignorada.
- Sem tarefa aprovada, o fluxo manual mantém a exigência de que todos os eventos estejam revisados financeiramente. Com tarefa `internal_sale_finalized` autorizada, a soma comprovada dos eventos é aceita sem reconfirmação redundante.
- A regra permanece restrita à validação de comprovantes operacionais. Preserva o vínculo do cliente, a proteção de duplicidade, a parcela única no Bling e a separação da conciliação financeira. Não altera cobrança, estoque, catálogo, permissões ou estrutura do banco.
- Validar testes de soma correta, parcial, modalidade divergente e valores negativos; depois homologar no pedido real por fila autorizada e conferir ID, itens, total e parcela no Bling, sem repetir POST se o retorno for incerto.
