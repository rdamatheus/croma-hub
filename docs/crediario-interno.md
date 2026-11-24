# Crediário nos pedidos internos

A equipe informa o vencimento em Cadastros ao criar ou editar o pedido. O painel de gestão consulta as formas de recebimento ativas do Bling. As novas modalidades têm uso interno, protegido pela política de inserção de pedidos.

Nos detalhes do pedido aguardando pagamento, o gestor pode enviar uma parcela pelo valor integral. O envio usa o cadastro do cliente já vinculado ao Bling. Para crediário, a integração procura uma única forma ativa com esse nome. Outras formas selecionadas no catálogo usam o ID da conta Bling. A integração verifica no retorno o cliente, total, quantidade de itens, forma, vencimento e valor da parcela. O envio não aciona baixa do pagamento.

Uma referência de envio pendente impede uma segunda criação após resposta incerta. A nova tentativa procura a referência da loja no Bling. Se a referência continuar pendente e o pedido não for localizado, a gestão deve conferir o lançamento antes de liberar outra tentativa. A criação de OS é um fluxo distinto.

A função autentica gestores por JWT. Para implantação do zero com clientes de serviço legados, configurar CROMA_OUTBOUND_KEY como segredo do ambiente.
