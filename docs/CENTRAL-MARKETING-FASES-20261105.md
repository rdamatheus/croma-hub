# Central de Marketing Croma — Arquitetura em três fases
Data: 2026-11-05
Projeto: `rdamatheus/croma-hub` | URL interna: `/interno/marketing/`

## Decisão e autorização
- Arquitetura completa das Fases 1, 2 e 3 aprovada.
- **Apenas a Fase 1 está autorizada para implementação**. Fases 2 e 3 dependem de nova aprovação.
- Evoluir o módulo existente, sem criar um segundo setor de Marketing.
- Preservar Croma Gráfica e Croma Papelaria como marcas selecionáveis.
- Não copiar identidade visual, textos comerciais nem código do site externo usado como referência.
- Nenhuma publicação ou mensagem externa é disparada por esta entrega.

## Fase 1 — Implementada na branch da entrega
### Interface
- Visão geral: estado da produção, fila de próximas entregas, atalhos para campanhas e aprovações.
- Estúdio de Conteúdo: briefings/roteiros por marca, formato, canal, objetivo, público, data, etapa e referências.
- Calendário editorial mensal: leitura unificada de `marketing_posts`, `marketing_productions_v1` e peças de `marketing_campaigns_v1`.
- Biblioteca: links de mídia de produção e campanhas (Drive, Canva, editor, publicação). Não copia arquivos.
- Abas existentes (itens recentes, gerador de post, calendário clássico, histórico e campanhas) permanecem operacionais.
- Canais manuais contemplam Instagram, Facebook, WhatsApp e YouTube.

### Fontes de verdade
| Informação | Fonte oficial | Operação |
| --- | --- | --- |
| Briefings e produção | `internal_module_state.module_key='marketing_productions_v1'` | CRUD de criação e edição na interface |
| Itens recentes | `marketing_recent` | Cadastro legado preservado |
| Sugestões/ideias | `marketing_ideas` | Gerador legado preservado |
| Postagens | `marketing_posts` | Calendário legado; Estúdio solicita sincronização via evento |
| Campanhas e peças | `marketing_campaigns_v1` | Editor de campanhas legado preservado |
| Aprovações da vitrine | Tabelas `site_approval_*` | Apenas atalho, nenhum fluxo alterado |
| Produtos e portfólio | Estruturas já existentes | Campanhas retêm vínculo ao produto; sem criar cópias |

O registro de produção contém `id`, `title`, `brand`, `format`, `channel`, `stage`, `planned_date`, `goal`, `audience`, `brief`, `script`, `notes`, `campaign_id`, `source_name`, `asset_url`, `edit_url`, `created_at` e `updated_at`.

Etapas: `ideia → roteiro → captacao → edicao → revisao → pronto → publicado`. Essa sequência é indicativa, **não** executa ações automáticas. Publicado é um registro manual.

### Sincronização com postagens
- O botão **Levar ao calendário** envia um evento local ao controlador legado `interno-marketing.js`.
- O controlador grava no `marketing_posts` com `production_id`; novos envios atualizam o registro vinculado, sem duplicá-lo.
- Se o status do calendário foi editado manualmente, ele é preservado no reenvio.
- O calendário mensal omite a duplicata visual do briefing quando já há um post vinculado.
- Mudanças de itens recentes, campanhas e posts notificam o novo painel; dados são relidos somente nesses eventos, sem polling.
- Peças de campanhas com datas aparecem no calendário apenas em modo de leitura, mantendo a edição na aba Campanhas.

### Segurança e custos
- Mesmo controle de acesso interno atual: Supabase Auth, `profiles` e RLS de `internal_module_state` para `owner`, `manager` e `equipe`.
- Não existem chaves novas, funções privilegiadas, tabela pública ou alteração de GRANT.
- URLs de mídia são somente HTTPS; texto de conteúdo dinâmico passa por escape de HTML.
- Arquivos grandes continuam fora do Supabase, reduzindo storage/egress.
- Sem migração de banco ou mutação de dados pré-existentes durante a entrega.
- **Limitação de concorrência:** `internal_module_state` usa arrays JSON por chave. Dois operadores salvando a mesma coleção simultaneamente podem sobrescrever alterações. Para uso multiusuário intensivo, propor tabela por registro com revisão otimista antes de avançar.
- Os links externos só funcionam para pessoas que já possuem permissão no serviço de origem.

### Verificação
- Testes de lógica para mês local, unificação de calendário, idempotência, preservação de status, URL segura e campanhas.
- Verificação estática do HTML, dos scripts e da inexistência de publicação social por API.
- RLS e estrutura do Supabase inspecionados em modo leitura.
- Teste autenticado manual recomendado no navegador: criar briefing → salvar → editar → vincular ao calendário duas vezes → conferir um único post → verificar biblioteca → verificar campanha e aprovações.
- Caso não haja teste autenticado realizado, não declarar validação de ponta a ponta.

## Fase 2 — Apenas arquitetura, não autorizada para execução
**Objetivo:** apoio à criação e integrações opcionais.
- Assistência de IA para briefing, legenda, roteiro e variações.
- Integração controlada com Drive/Canva/Descript quando houver capacidade real nas APIs/autorização.
- Conectores sociais e autorização por canal; manutenção da aprovação explícita para publicar.
- Biblioteca aprimorada e migração de briefings para tabela própria se houver necessidade real de colaboração/histórico granular.
- Contratos versionados de integração, limites de custo, trilha de auditoria e rollback.

**Dependências:** consentimento e credenciais OAuth via ambiente seguro, validação das APIs, LGPD e modelo de custos.

## Fase 3 — Apenas arquitetura, não autorizada para execução
**Objetivo:** mensuração e automação comercial.
- Métricas por campanha/canal: alcance, visualizações, visitas, mensagens, propostas e pedidos onde os dados forem disponibilizados.
- Associar contatos e oportunidades ao cadastro e comercial existentes, sem duplicar clientes do Bling.
- Automações graduais de lembretes, monitoramento de campanhas e acompanhamento, sem envios não autorizados.
- Relatórios de conversão e retorno condicionado à qualidade dos dados.
- Revisão de governança, privacidade, quotas, retenção e custos antes de habilitar.

## Operação e rollback
1. Entrar no painel interno > Marketing > Estúdio.
2. Criar um briefing, vincular campanha opcional e informar links de mídia; salvar.
3. Revisar/editar as etapas conforme o trabalho avança.
4. Usar **Levar ao calendário** para sincronizar uma postagem; a publicação externa segue manual.
5. Conferir o mês em Calendário editorial e os links em Biblioteca.
6. Se necessário, reverter o commit de frontend. O estado `marketing_productions_v1` permanece preservado para recuperação, sem afetar dados anteriores.

## Pendências deliberadas
- Não existe publicação automática nem métricas de redes sociais.
- Não há captura de leads nova nem envio de campanhas ao WhatsApp.
- Não há upload ou edição de mídia dentro do Croma Hub.
- Não há bot ou agente de IA ativo nesta fase.
- Fases 2/3 exigem autorização independente, com plano técnico e riscos atualizados.
