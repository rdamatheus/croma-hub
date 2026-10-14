# MVP do laboratorio de atendimento

## Objetivo e escopo aprovado

Evoluir a prova de conceito existente com mensagens manuais/ficticias, classificacao sugerida, revisao humana e historico. A preparacao em branch foi aprovada em 13/10/2026; aplicar a migracao, publicar a funcao e atualizar o site precisam de aprovacao posterior.

O piloto permanece isolado de `customer_profiles`, pedidos, produtos, Bling, pagamentos e producao. Nao cria um segundo cadastro de clientes. A importacao legada e os anexos existentes continuam disponiveis no modo de importacao; o modo manual usa apenas texto. Nao ha envio de WhatsApp nem conexao nova ao WhatsApp real.

## Dados e regras

`lab_whatsapp_atendimentos` conserva suas colunas e valores antigos. As novas colunas sao:

| Campo | Regra |
| --- | --- |
| `category` | Categoria confirmada pelo atendente; pode ficar vazia |
| `priority` | `normal`, `alta` ou `urgente`; padrao `normal` |
| `workflow_status` | Andamento comercial revisado pelo atendente; padrao `novo` |
| `responsible_id` | Vinculo opcional a um perfil interno |
| `input_key` | Identificador de repeticao da entrada manual, unico por criador |

O `status` original continua identificando o processamento do laboratorio. `concluido` nao significa pagamento confirmado, arte aprovada ou producao liberada. O andamento comercial usa os oito valores acordados: `novo`, `em_analise`, `aguardando_cliente`, `aguardando_producao`, `orcamento_enviado`, `aprovado`, `finalizado`, `cancelado`.

Categorias: `orcamento`, `arte_arquivo`, `prazo_producao`, `aprovacao_pagamento`, `retirada_entrega`, `problema_reclamacao`. Tags: `cliente_novo`, `cliente_recorrente`, `empresa_b2b`, `urgente`, `falta_informacao`, `arquivo_recebido`, `nota_fiscal_dados`, `recompra`, `fora_do_escopo`.

`lab_whatsapp_analises` registra cada tentativa com solicitante, identificador de requisicao, modelo, versao do prompt, IDs das mensagens usadas, status, resultado/erro e datas. Os resultados concluidos sao imutaveis. Sao removidos em cascata apenas quando o atendimento de teste e excluido, como os demais dados deste laboratorio.

O resultado guarda as sugestoes e os dados extraidos, com `null` para informacoes nao mencionadas. As colunas antigas `analysis`, `summary` e `suggested_reply` continuam como cache da ultima versao valida para compatibilidade. Uma unica transacao atualiza o historico e esse cache. Erros nao substituem a analise anterior.

## Fluxo

1. O usuario digita uma mensagem ou carrega um exemplo ficticio.
2. Salvar chama `save_lab_whatsapp_manual_test`: atendimento e mensagem sao gravados na mesma transacao. Repetir a mesma chave e conteudo retorna o registro existente. A mensagem original e preservada.
3. Uma acao manual chama `whatsapp-lab-processar`. A funcao verifica a sessao, o perfil ativo e se o solicitante e criador ou gestor.
4. `start_lab_whatsapp_analysis` registra a tentativa. A mesma requisicao nao roda novamente; so uma tentativa por atendimento pode estar em processamento. Tentativas paradas por mais de 15 minutos sao encerradas quando uma nova solicitacao manual chega.
5. A funcao solicita saida estruturada e valida o resultado. Recusa, truncamento da resposta da IA e JSON invalido geram erro registrado.
6. `finish_lab_whatsapp_analysis` grava o resultado e o cache atomicamente. Conversas maiores que 100.000 caracteres usam o trecho mais recente e exibem uma indicacao de contexto parcial.
7. Usar a classificacao sugerida apenas preenche o formulario. Salvar revisao confirma categoria/prioridade, responsavel e andamento. Reanalisar nunca sobrescreve esses campos.

## Permissoes

A imagem de referencia destacou RLS e grants. O MVP conserva RLS nas tabelas antigas, revoga grants publicos/anonimos do laboratorio e habilita RLS na nova tabela. A equipe ativa pode ler o historico; clientes, visitantes e perfis inativos nao podem. O navegador nao pode inserir, editar ou excluir tentativas de analise diretamente.

O RPC manual tem `SECURITY INVOKER`, valida `auth.uid()` e perfil interno ativo e usa as permissoes existentes. Os RPCs de inicio/fim sao `SECURITY INVOKER`, sem execucao para `PUBLIC`, `anon` ou `authenticated`; apenas o processador no servidor pode chama-los. A chave administrativa permanece exclusivamente no servidor. Os helpers de autorizacao existentes sao reutilizados.

Antes de baixar um anexo com privilegios de servidor, o processador exige o prefixo `whatsapp-lab/<criador>/<atendimento>/` e um nome de arquivo simples, sem barras ou sequencias codificadas. Referencias a arquivos de pedidos ou caminhos que tentem sair do teste sao rejeitadas sem leitura do arquivo.

## Validacao local

Requer Node 24 (para `stripTypeScriptTypes`). Testes de banco usam PostgreSQL WASM/PGlite; testes de tela usam Playwright com Supabase/IA substituidos por dados ficticios e bloqueio de rede externa. Os testes nao chamam a OpenAI nem acessam o banco real.

Dependencias de teste, sem alterar as dependencias do site:

```bash
npm install --prefix /tmp/croma-test-runtime --no-save --package-lock=false @electric-sql/pglite@0.5.9 playwright@1.62.1
/tmp/croma-test-runtime/node_modules/.bin/playwright install chromium
CROMA_TEST_NODE_MODULES=/tmp/croma-test-runtime/node_modules node --test tests/*.test.cjs
```

Se o ambiente fornecer outro Chromium compativel, `CROMA_TEST_CHROMIUM` aceita o caminho desse executavel. `CROMA_QA_DIR` habilita capturas locais para inspecao. As suites opcionais de banco/tela indicam skip se as respectivas dependencias nao estiverem instaladas; elas precisam passar, sem skips, antes da implantacao.

Cobertura: grants/RLS inclusive com grants automaticos de projeto; visitante, cliente, perfil inativo, criador, outro membro e gestor; repeticao sem duplicar mensagens; contexto e texto original; snapshots imutaveis; rollback de cache/historico; expiracao e rejeicao de respostas atrasadas; recusa/erro de IA; revisao que exige salvar; reanalise preservando a revisao; importacao legada; telas de 1440, 390 e 320 pixels sem overflow horizontal.

Resultado desta preparacao: 11 testes do laboratorio passaram, sem skips. A verificacao da suite geral reproduziu duas falhas preexistentes em `tests/customer-journey.test.cjs`: o mock do carrinho nao define `getCustomerContext`. Ambas foram reproduzidas em um checkout separado do commit-base `9c366775d687e64168af318f1a59a56dd7fdb928`. Os testes e o codigo do carrinho nao foram alterados nesta branch. A tela mostra as dez tentativas mais recentes; os demais snapshots permanecem no banco.

## Implantacao pendente de aprovacao

A migracao `20261014010322_whatsapp_lab_mvp.sql` pressupoe as tres tabelas do laboratorio e os helpers atuais de `app_private`, verificados em leitura. O repositorio nao inclui a migracao original dessas tabelas; os testes tem um fixture minimo separado, nunca usado para inicializar producao. O arquivo novo foi criado pelo CLI Supabase, apos as migracoes adicionadas recentemente na base principal.

Apos aprovar a revisao, a ordem e: aplicar a migracao em ambiente de teste; publicar a funcao com suas dependencias locais (incluindo `js/whatsapp-lab-model.js`); publicar o HTML/JS/CSS; verificar acesso permitido e negado e executar um teste ficticio manual. So depois aprovar a aplicacao equivalente na producao.

A API e os modelos existentes foram preservados. Disponibilidade do modelo na conta, chamada real com saida estruturada, custos e operacao do Storage precisam ser confirmados em teste autorizado; as validacoes locais usam respostas simuladas. Reprocessar anexos legados pode consumir novamente a API. Vincular atendimentos a clientes/OS e integrar WhatsApp oficial sao etapas futuras, fora desta branch.

Fontes tecnicas: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) e [saida estruturada na Responses API](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
