-- Controle de leitura de anexos oficiais: campos adicionais, sem alterar RLS nem conteúdo.
alter table public.lab_whatsapp_anexos
 add column if not exists processing_started_at timestamptz,
 add column if not exists processing_token uuid,
 add column if not exists processing_error text;
