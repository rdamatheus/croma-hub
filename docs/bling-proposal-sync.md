# Sincronização de propostas com o Bling

## Objetivo

Sincronizar `sales_proposals` do Croma Hub com **Propostas Comerciais** do Bling nos dois sentidos, sem duplicar clientes ou propostas e sem expor a estrutura interna de custos da Croma.

## Regras de negócio

- A proposta local permanece a fonte do contexto comercial interno: custo de fornecedor, frete, markup, margem, pesquisa de mercado e preço sugerido não são enviados ao Bling.
- O cliente precisa existir em `customer_profiles` e possuir `bling_contact_id`. A sincronização de propostas **não cria contatos automaticamente**.
- O Bling recebe somente o contato existente, itens comerciais, quantidades, preço final, validade comercial e identificadores de rastreio da proposta Croma.
- Quando a proposta possui várias alternativas e nenhuma foi marcada como selecionada, a interface exige seleção explícita antes do primeiro envio. Alternativas não são somadas silenciosamente.
- Cada proposta local pode se vincular a somente uma proposta Bling e cada `bling_proposal_id` pode pertencer a somente uma proposta local.

## Idempotência e recuperação

Antes do primeiro `POST /propostas-comerciais`, a função `bling-proposal-sync` procura uma proposta do mesmo contato que contenha o marcador interno `CROMA_PROPOSAL_ID=<uuid>`. Isso permite recuperar uma criação anterior cujo retorno tenha sido interrompido.

Se uma requisição de criação terminar com resultado incerto por timeout/rede, o sistema registra erro e **não repete o POST automaticamente**. A próxima tentativa executa a reconciliação antes de qualquer nova criação.

Após criar ou atualizar, a proposta é relida do Bling antes de receber status `synced`.

## Entrada Bling → Croma Hub

Ao abrir a página interna de propostas, o Hub confere as propostas recentes do Bling antes de carregar a lista. Propostas do Bling ainda inexistentes no Hub são importadas com vínculo pelo `bling_proposal_id`; itens importados entram sem custo interno, pois o Bling não é fonte de custo da Croma.

Quando uma proposta já vinculada mudou no Bling, o Hub não sobrescreve silenciosamente a versão local. Ela passa para `conflict` para revisão. Isso preserva alternativas, custos, fretes, markup e demais dados internos que existem somente no Croma Hub.

A sincronização de saída Croma Hub → Bling continua explícita quando há várias alternativas: é necessário selecionar quais itens comerciais devem compor a proposta enviada ao Bling.

## Conflitos

A sincronização guarda hashes do payload local confirmado e do último snapshot remoto confirmado.

Quando o Bling mudou desde a última confirmação, a proposta passa para `conflict` e é criado um registro em `erp_sync_conflicts`. Nenhuma alteração remota é sobrescrita automaticamente.

A interface permite, após revisão explícita, escolher **Usar Croma no Bling**. Essa ação atualiza a proposta remota e marca o conflito como `resolved_local`.

## Estados

- `not_synced`: ainda sem proposta confirmada no Bling.
- `syncing`: operação em andamento.
- `synced`: criação/atualização confirmada e relida no Bling.
- `conflict`: mudança remota detectada; exige revisão.
- `error`: falha confirmada ou criação com resultado incerto.

## Componentes

- Migration: `supabase/migrations/20260930200000_bling_proposal_sync.sql`
- Edge Function: `supabase/functions/bling-proposal-sync/index.ts` (envio, conferência e importação)
- Migration de habilitação: `supabase/migrations/20261007160000_enable_bling_proposal_entity.sql`
- Interface: `js/proposal-bling-sync.js`
- Página: `/interno/propostas/`

## Segurança

A Edge Function exige JWT válido (`verify_jwt=true`) e também valida perfil ativo `owner` ou `manager`. Tokens OAuth do Bling continuam somente no backend e são lidos pelas RPCs protegidas já usadas pelas demais integrações.

## Validação esperada

1. migration aplicada e constraints aceitando `proposal` em mappings, conflitos e jobs;
2. função publicada com JWT obrigatório;
3. página de propostas exibe status e ação de sincronização;
4. preview não altera estado nem cria registros no Bling;
5. nenhuma proposta real é criada durante a validação de infraestrutura;
6. primeiro envio só é liberado quando o cliente possui `bling_contact_id` e os itens comerciais estão definidos;
7. ao abrir `/interno/propostas/`, propostas recentes do Bling inexistentes no Hub são importadas antes da renderização;
8. alteração detectada no Bling em proposta já vinculada gera conflito, sem sobrescrever silenciosamente os dados internos.
