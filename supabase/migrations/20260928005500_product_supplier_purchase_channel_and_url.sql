alter table public.product_suppliers
  add column if not exists purchase_channel text,
  add column if not exists purchase_url text;

comment on column public.product_suppliers.purchase_channel is
  'Canal onde a compra/cotacao e realizada (ex.: mercado_livre, shopee, direto). O fornecedor continua sendo a empresa/vendedor real.';

comment on column public.product_suppliers.purchase_url is
  'URL da oferta/cotacao deste fornecedor para este produto. Pode mudar ou expirar sem alterar o cadastro mestre do produto.';
