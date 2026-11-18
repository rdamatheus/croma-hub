-- 2026-11-18: modalidade Dinheiro para vendas presenciais no Croma Hub.
-- Preserva Pix, credito e debito e nao altera o checkout publico.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY['pix'::text, 'credito'::text, 'debito'::text, 'dinheiro'::text]));
