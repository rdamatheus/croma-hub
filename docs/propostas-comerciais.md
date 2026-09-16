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
- `market_reference_source`: descrição da principal fonte da pesquisa.
- `market_researched_at`: data da pesquisa.
- `market_reference_metadata`: snapshot das fontes e observações da pesquisa.

O preço de mercado e o preço sugerido não substituem automaticamente o preço calculado pelo markup. Eles são referências separadas para decisão comercial.

## Navegação

O painel interno possui um acesso direto **Propostas** na seção `Cadastros e operação comercial`.

Rota: `/interno/propostas/`

A página permite localizar propostas por número, nome ou telefone e exibe custo, frete, markup, preço pelo markup, valor de mercado e preço sugerido.

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

A Proposta #1, de Laura Giacomini, foi consolidada somente na grade de 250 credenciais, conforme solicitação da cliente. O item preserva o custo da Zap, frete, markup 2,5, referência de mercado e sugestão comercial como campos independentes.
