# Supabase UI — eficiência fase 2

Data: 2026-09-28

## Contexto

Após a correção do loop da ficha de produtos, o reteste manual caiu de 2.268 para 144 requisições no roteiro observado. Esta fase reduz leituras auxiliares que ainda eram redundantes, sem alterar regras de negócio ou reativar sincronizações do Bling.

## Produtos

Antes, o hotfix executava duas contagens HEAD separadas (`produto` e `servico`) e mais três leituras diagnósticas (`product_stock_snapshots`, `product_details` e `product_suppliers`) em toda abertura da tela.

Depois:

- `internal_product_type_counts()` devolve produtos e serviços em uma única chamada;
- as três leituras diagnósticas foram removidas da navegação normal;
- em modo de ficha individual, a contagem da listagem nem é executada;
- os dados reais da ficha continuam sendo carregados pelo fluxo principal, com tratamento próprio de erro.

## Contatos

Antes, a tela fazia quatro chamadas de KPI separadas e usava `select('*')` para cada página de 50 contatos.

Medição física aproximada no banco:

- linha completa de `customer_profiles`: ~1.646 bytes em média;
- `bling_raw`: ~1.043 bytes em média;
- campos realmente necessários pela listagem/edição: ~255 bytes em média.

Depois:

- `internal_contact_kpis()` consolida total, ativos, papéis de cliente e fornecedor em uma chamada;
- a página seleciona somente os campos usados pela interface e pela edição;
- `bling_raw`, `dados_adicionais`, timestamps e outros campos não utilizados deixam de trafegar na listagem;
- busca com debounce de 300 ms permanece preservada.

A redução estimada do payload físico das linhas de contatos é de cerca de 84%, antes de considerar overhead JSON/HTTP.

## Imagens

O reteste mostrou 44 leituras de Storage, mas eram miniaturas distintas e não um loop repetindo o mesmo arquivo. As miniaturas atuais já usam `loading=lazy` e os exemplos observados eram pequenos. Para preservar a utilidade visual da lista, esta fase não remove nem oculta imagens.

## Segurança e escopo

- novas RPCs usam `security invoker`;
- `anon` não pode executá-las;
- `authenticated` pode executá-las;
- nenhuma tabela ou registro comercial foi apagado;
- nenhum cron do Bling foi reativado;
- nenhuma política RLS foi relaxada;
- nenhuma integração externa foi acionada.

## Validação pós-deploy

Repetir o roteiro de Produtos, Contatos, Fornecedores e Pedidos e comparar o volume com o reteste anterior de 144 requisições. O objetivo desta fase é reduzir chamadas auxiliares e egress por página, não eliminar requisições legítimas de imagens, autenticação ou dados selecionados pelo usuário.
