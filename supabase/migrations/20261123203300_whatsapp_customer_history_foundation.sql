-- Vínculo opcional com o cadastro mestre; NULL preserva o laboratório isolado.
alter table public.lab_whatsapp_atendimentos add column customer_id uuid references public.customer_profiles(id) on delete restrict;
create index lab_whatsapp_atendimentos_customer_idx on public.lab_whatsapp_atendimentos(customer_id,created_at desc) where customer_id is not null;
comment on column public.lab_whatsapp_atendimentos.customer_id is 'NULL = teste isolado; preenchido = atendimento oficial vinculado ao cadastro mestre. Não sincronizar com Bling.';
