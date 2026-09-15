# NFS-e a partir de Pedidos do Bling

## Objetivo

A NFS-e da Croma não é criada manualmente no Croma Hub. O documento fiscal parte de um **Pedido de Venda existente no Bling**, que é analisado e faturado de forma assistida.

## Decisão

Fluxo aprovado:

```text
Pedido de venda no Bling
  -> Croma Hub consulta o pedido
  -> analisa cliente e itens
  -> identifica produto x serviço
  -> exige perfil fiscal explícito para cada serviço
  -> bloqueia pedido misto ou não classificado
  -> prepara processo fiscal local
  -> cria a NFS-e no Bling mediante confirmação
  -> transmite ao Ambiente Nacional mediante nova confirmação
  -> registra o retorno e vincula a NFS-e ao pedido
```

A integração OAuth existente da Edge Function `bling-erp` continua sendo a única porta de acesso ao Bling. A Edge Function `nfse-order-workflow` é apenas uma camada de orquestração fiscal e chama a integração existente; não mantém credenciais ou tokens próprios do Bling.

## Regras de negócio

- Só o perfil `owner` pode acessar e executar o faturamento NFS-e.
- Um pedido do Bling pode originar no máximo um processo NFS-e local (`bling_order_id` único).
- Mercadorias não podem ser faturadas como NFS-e.
- Pedido que mistura mercadoria e serviço fica bloqueado na primeira versão.
- Serviço sem classificação fiscal explícita fica bloqueado.
- Pedido com mais de um perfil fiscal fica bloqueado até existir suporte a divisão fiscal.
- A classificação `product_type = servico` não define sozinha a tributação; o produto deve estar vinculado a `product_fiscal_profiles`.
- Variações podem herdar o perfil fiscal do produto pai quando este estiver explicitamente classificado.
- Pedido cancelado ou com NF-e já vinculada no Bling não é liberado automaticamente para NFS-e.
- Cliente precisa estar sincronizado e ativo na Croma e ter CPF/CNPJ válido.
- O valor da NFS-e da primeira versão é o total do pedido, somente quando o pedido inteiro é elegível como serviço de um único perfil fiscal.
- Criar a NFS-e no Bling e transmitir ao Ambiente Nacional são duas ações separadas e ambas exigem confirmação do usuário.

## Estrutura de dados

### `nfse_documents`

Passou a registrar também:

- `source_type = bling_order`
- `bling_order_id`
- `bling_order_number`
- `order_snapshot`

O snapshot preserva os dados usados na preparação para auditoria. O índice único em `bling_order_id` impede faturamento duplicado pelo Croma Hub.

### `product_fiscal_profiles`

Relaciona explicitamente um produto/serviço cadastrado com um `fiscal_service_profile`. A classificação é feita manualmente pelo proprietário durante a análise de um pedido.

## Perfil fiscal inicial

O único perfil liberado nesta fase é o já validado operacionalmente para **Impressão**. Outros serviços, como plastificação, encadernação e recarga de cartuchos, devem ser configurados e validados antes de serem classificados.

## Componentes afetados

- `interno/nfse/index.html`: Central de faturamento por Pedidos do Bling.
- `js/interno-nfse.js`: listagem, análise, classificação e comandos de faturamento.
- `supabase/functions/nfse-order-workflow/index.ts`: orquestração e travas fiscais.
- `supabase/functions/bling-erp/index.ts`: permanece como gateway OAuth e executor das operações do Bling/NFS-e.
- `nfse_documents`, `nfse_events`, `fiscal_service_profiles` e `product_fiscal_profiles`.

## Segurança

- `nfse-order-workflow` exige JWT válido e confirma `role = owner` no backend.
- Usuários autenticados não podem mais inserir/alterar/excluir diretamente `nfse_documents`.
- Alterações de classificação fiscal são feitas pelo backend e auditadas com `classified_by` e `classified_at`.
- A transmissão real permanece protegida por confirmação explícita no frontend e pelas transições de estado do backend fiscal.

## Validação

A migração foi aplicada no Supabase, a função de orquestração foi implantada com `verify_jwt = true`, e o frontend foi publicado no GitHub Pages. O teste ponta a ponta com pedidos reais do Bling deve ser feito com a sessão autenticada do proprietário; nenhum pedido ou NFS-e real é criado automaticamente durante implantação/validação técnica.

## Próximos passos

1. Abrir um pedido de serviço real no Croma Hub e confirmar que itens/cliente são carregados corretamente.
2. Classificar somente os serviços efetivamente pertencentes ao perfil `Impressão`.
3. Preparar um pedido elegível e validar o registro local.
4. Criar a NFS-e no Bling sem transmitir e conferir o rascunho.
5. Após conferência, transmitir uma NFS-e real ao Ambiente Nacional.
6. Cadastrar e homologar os demais perfis fiscais antes de ampliar a automação.
