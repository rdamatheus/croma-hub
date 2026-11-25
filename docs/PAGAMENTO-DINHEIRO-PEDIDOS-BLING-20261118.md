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
