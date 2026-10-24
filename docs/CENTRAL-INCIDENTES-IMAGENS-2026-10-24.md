# Croma Hub — Central de Incidentes e Observabilidade

## Acesso
- Tela interna: `/interno/observabilidade/` (owner/manager).
- Auditoria: `public.ops_incidents`, protegida por RLS e permissões explícitas de coluna; `anon` sem acesso.
- Coleta: `app_private.ops_collect_incidents()` via Supabase Cron `croma_ops_monitor_hourly`, minuto 17 de cada hora.
- Alertas de alta prioridade: tarefa do ChatGPT independente do Cron, com verificação horária; a tarefa **não executa correções**.

## Como usar
1. Abra **Central de Incidentes e Observabilidade** na seção de sistema.
2. Leia os totais e filtre por módulo, prioridade e situação.
3. Clique em **Abrir módulo** para investigar a origem; conferir no Bling se o problema envolve ERP.
4. Registre a causa e o que foi feito. Marque **Em análise**, **Resolvida** ou **Ignorada**. A resolução na central é **administrativa**, não reprocessa a integração.
5. Use **Atualizar painel** para reler os incidentes. O coletor roda de hora em hora, mesmo sem a página aberta.

## Política inicial de triagem
- **Alta:** conflitos de atualização ERP, falhas em pedidos/propostas.
- **Média:** falhas de produtos, contatos e jobs travados.
- **Baixa:** sincronizações parciais; verificar quantidade de erros e impacto antes de elevar.
- **Crítica:** reservada para regras futuras com evidência verificável de risco fiscal, financeiro, segurança ou indisponibilidade. Não classificar como crítica apenas por texto genérico de log.
- O monitor não repete a mesma ocorrência: usa fingerprint do job/conflito. Um incidente resolvido não é reaberto por reprocessamento do mesmo evento histórico.
- Logs podem conter informações pessoais. Não copiar mensagens integrais para notificações públicas ou clientes.

## Imagens
- Há 1.399 produtos sem mídia ativa na auditoria, incluindo inativos; a fila de produtos ativos é consultada em lotes.
- **Pesquisar referência** reutiliza a função existente `product-image-enrich`, que consulta a foto original do Bling e, quando não existe, busca candidatos no Mercado Livre por GTIN/nome/marca.
- **Atenção:** se a imagem já existir no Bling, a função existente pode copiá-la imediatamente para o Croma Hub. Se encontrar imagem externa, mantém a candidatura para revisão, sem publicá-la automaticamente.
- Fotos externas podem ter direitos autorais; não presumir licença de uso de anúncios. A referência deve ser conferida quanto a marca, GTIN, embalagem, cor, tamanho e autorização de uso.
- A tela **Gerenciar galeria** permite inserir imagem principal e imagens secundárias, ordená-las e editar textos alternativos.
- Imagens geradas artificialmente devem ser rotuladas **ilustrativas/simulação**, nunca apresentadas como foto real do fabricante. Não gerar variantes que inventem características técnicas.

## Limites desta primeira entrega
- A coleta automática contempla `erp_sync_jobs` falhos/parciais/travados e `erp_sync_conflicts`; ainda não há ingestão automática de fiscal, estoque, financeiro, webhooks ou problemas de foto.
- O agente de imagens é **assistido**: busca por produto sob demanda; ainda não executa varredura e publicação automática em segundo plano. A política de uso de fotos de terceiros e os critérios de confiança devem ser validados antes de automatizar a publicação.
- O código passou por teste de sintaxe, a migração foi aplicada e o Cron foi confirmado ativo; falta teste autenticado de ponta a ponta na página publicada.
- O monitor é baseado em regras e dados estruturados, **não** é um modelo de IA autônomo. Um classificador de IA pode ser acrescentado como apoio à triagem, com justificativas e aprovação para ações de escrita.
