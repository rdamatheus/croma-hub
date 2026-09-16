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
