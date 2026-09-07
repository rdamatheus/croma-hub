# Redesenho comercial — entrega para revisão

## Estado

Proposta em branch separado. Não integrar à produção antes de resolver as pendências abaixo.
Base anterior: `8fd82f7f0f5bb04867f1c4cdeb406ffbed1acb6d`.

## Alterações

- Home com o hero aprovado, três áreas da marca, serviços, destaques, portfólio, processo, diferenciais e chamadas para WhatsApp.
- Navegação pública compartilhada e rodapé com rotas de conta, pedidos, carrinho e segmentos preservadas.
- Produto individual por ID, galeria e consulta; cards com links nativos acessíveis por teclado.
- Portfólio limitado a registros ativos, próprios e não marcados como referência; nenhum acervo fictício.
- Contato com preparação local da mensagem, sem persistência e com envio decidido pelo visitante.
- CSS compartilhado, foco visível, menu com Escape e fechamento ao sair, adaptação a movimento reduzido.
- Páginas de serviço simples com orientações de orçamento; configuradores existentes preservados.

## Validações realizadas

- Sintaxe JavaScript, presença das novas rotas e comparação das áreas protegidas com a base.
- Teste real em Microsoft Edge headless: 9 rotas × 3 larguras (375, 768 e 1440 px), sem transbordamento horizontal ou exceções JavaScript.
- Um cabeçalho por página; abertura e fechamento do menu com Escape.
- Formulário: mensagem com quebras de linha reais; edição invalida o link preparado.
- Consulta real ao Supabase com cliente público. Resultado: categorias retornam HTTP 401 / código 42501, `permission denied for table profiles`.

## Pendências e limites

- A falha de permissão nas categorias impede validar o fluxo completo com produtos e serviços reais. Requer diagnóstico de políticas/permissões do Supabase com autorização específica; não aplicar indiscriminadamente o GRANT sugerido pela resposta.
- Testes de navegação aprovados não equivalem a auditoria completa de acessibilidade ou performance. Medição Lighthouse, revisão visual integral, imagens remotas e teste em aparelho físico permanecem pendentes.
- Detalhe de produto ainda não apresenta relacionados ou variações; precisa confirmar os campos públicos existentes. Não foram inventados estoque, marca ou prazo.
- Não houve alteração de banco, migrations, autenticação, Bling, carrinho, pedidos ou arquivos internos.

## Rollback

Enquanto a proposta estiver no branch, a produção permanece na versão anterior e basta não integrar a proposta.
Depois de uma integração, usar um commit de reversão no GitHub, preservando o histórico, e executar novamente a publicação do GitHub Pages. Se a integração for um merge commit, reverter com o primeiro pai (`git revert -m 1 <merge>`); se for squash, reverter o commit resultante (`git revert <squash>`). Não usar reset forçado em main.
Conferir home, catálogo, configuradores e status de publicação após a reversão. Esta mudança não depende de restauração de banco.

## Reprodução

Com Node e Playwright disponíveis, executar `node tests/public-smoke.cjs` (Microsoft Edge instalado). O teste usa servidor local, navegador anônimo e apenas leituras públicas de dados. A indisponibilidade do catálogo é informada no resultado e não deve ser interpretada como validação bem-sucedida do catálogo.
