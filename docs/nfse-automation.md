# Automação assistida de NFS-e — Croma Hub

## Objetivo

Permitir que a Croma prepare, valide, crie e transmita NFS-e pelo Bling/Emissor Nacional sem duplicar a integração OAuth existente e sem liberar emissão fiscal automática nesta primeira fase.

## Decisão

A automação de NFS-e reutiliza a Edge Function `bling-erp`, a conexão OAuth já existente e os cadastros atuais de clientes. O Croma Hub mantém um registro operacional local da nota e um histórico de eventos, enquanto o Bling continua responsável pela criação/transmissão da NFS-e ao Ambiente Nacional.

A emissão continua sendo uma ação explícita do proprietário.

## Escopo implementado

- Central interna em `/interno/nfse/`, exclusiva para `owner`.
- Leitura do estado da conexão Bling.
- Leitura das configurações de NFS-e do Bling por `GET /nfse/configuracoes`.
- Leitura de notas recentes do Bling por `GET /nfse`.
- Rascunho local de NFS-e.
- Validação server-side de cliente, documento, vínculo Bling e perfil fiscal.
- Criação da nota no Bling por `POST /nfse`.
- Transmissão somente após confirmação explícita por `POST /nfse/{id}/enviar`.
- Registro de número, RPS, código de verificação, link e retorno do Bling.
- Auditoria em `nfse_events`.
- Bloqueio contra alteração direta de campos de processamento fiscal pelo frontend.
- Bloqueio de duplo envio por transição atômica `created_bling -> sending`.

## Fora do escopo desta fase

- Emissão sem confirmação do proprietário.
- Cancelamento automático.
- Exclusão automática de nota.
- Alteração automática das configurações fiscais do Bling (`PUT`).
- Classificação fiscal automática dos serviços legados.
- Integração automática Pedido/OS -> NFS-e; o módulo de pedidos ainda não mantém vínculo confiável de `product_id` em cada item.

## Modelo de dados

### `fiscal_service_profiles`

Perfil fiscal reutilizável por tipo de serviço. O primeiro perfil cadastrado é `impressao`, ainda marcado como operacional/provisório para fins de revisão fiscal futura.

Configuração inicial utilizada:

- Código tributação nacional: `13.05.01`
- Código municipal: `002`
- NBS: `121012100`
- Indicador de operação: `100301`
- Natureza da operação: `1`
- ISS: `2,0100%`
- Retenção de ISS: não

Esse perfil deriva da configuração que foi efetivamente utilizada na primeira emissão bem-sucedida da Croma no Ambiente Nacional. Outros serviços não devem ser cadastrados como definitivos sem validação específica.

### `nfse_documents`

Estados permitidos:

`draft -> validated -> created_bling -> sending -> authorized`

Em caso de erro, o documento vai para `rejected`. Quando já existe `bling_nfse_id`, a revalidação retorna a nota para `created_bling`, evitando duplicidade de rascunho no Bling.

### `nfse_events`

Histórico imutável para usuários autenticados. Eventos são inseridos por trigger/backend e apenas lidos no frontend.

## Segurança

- RLS owner-only nas tabelas fiscais.
- `nfse_events` não permite inserção direta pelo cliente web.
- Trigger força novos documentos do frontend a nascerem como `draft` e remove campos externos que não podem ser definidos pelo navegador.
- Alterações de status, ID Bling, número da nota, snapshots e dados de autorização só podem ocorrer pelo backend com service role.
- Após criação no Bling, os dados fiscais centrais do documento deixam de ser editáveis pelo frontend.
- A Edge Function continua com `verify_jwt=false` por causa do callback OAuth, mas todas as requisições POST operacionais passam pela validação customizada `requireOwner`.

## Fluxo

1. Proprietário cria um rascunho no Croma Hub.
2. Croma valida cadastro do cliente e perfil fiscal.
3. Proprietário solicita criação no Bling.
4. O Bling retorna o ID da NFS-e ainda não transmitida.
5. O Croma mostra a etapa de emissão separadamente.
6. Proprietário confirma a transmissão.
7. Bling envia ao Ambiente Nacional e retorna o resultado.
8. Croma registra dados e histórico.

## Tratamento de erros

O backend preserva o payload retornado pelo Bling e tenta extrair códigos de rejeição como `E0120`. A interface mostra uma mensagem resumida e mantém a resposta técnica no snapshot/histórico para diagnóstico.

## Validação

A implantação deve ser considerada validada somente após confirmar:

- migrations aplicadas;
- Edge Function ativa com ações `nfse_*`;
- leitura do endpoint de configuração do Bling autenticada;
- carregamento da Central NFS-e com sessão owner;
- criação e validação de um rascunho sem transmissão;
- em teste fiscal real, criação no Bling e transmissão somente após confirmação explícita.

A primeira emissão manual no Ambiente Nacional já havia sido autorizada antes desta implementação; isso valida a configuração básica do Bling, mas não substitui o teste ponta a ponta do novo fluxo do Croma Hub.
