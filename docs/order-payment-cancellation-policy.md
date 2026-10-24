# Pagamento e cancelamento de pedidos

Regra aprovada em 23/10/2026: o registro do pedido antecede o pagamento. Novos pedidos criados por checkout_active_cart iniciam em aguardando_pagamento para Pix, crédito ou débito. O registro mantém a reserva de estoque existente e não representa confirmação de pagamento.

Cancelamento direto continua restrito ao proprietário do pedido, nos estados recebido (compatibilidade histórica) ou aguardando_pagamento, sem pagamentos approved, processing, action_required ou created com identificador no provedor. A rotina interna libera a reserva. Após o início do processamento ou a aprovação, o cliente solicita cancelamento pelo WhatsApp com o código do pedido; a empresa avalia cancelamento e eventual estorno internamente.

A tela falha de forma conservadora: se não consegue consultar pagamentos, não oferece cancelamento direto nem nova tentativa de cobrança. Pedidos históricos não foram reclassificados.

Validação: teste autenticado em transação revertida confirmou bloqueio de pedido pago e cancelamento de pedido aguardando pagamento com liberação de reserva. Teste JavaScript cobriu pedido sem pagamento, em processamento, aprovado, pago, cancelado e falha de consulta. Nenhum pagamento real foi executado. Mercado Pago em produção e API de frete permanecem pendentes por decisão do usuário.
