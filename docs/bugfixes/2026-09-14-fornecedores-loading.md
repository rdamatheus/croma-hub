# Correção de carregamento — Fornecedores

Data: 2026-09-14

## Problema

A rota `/interno/fornecedores/` podia ficar branca ou travar durante a inicialização porque autenticação, interface administrativa e ferramentas de catálogo eram carregadas no mesmo caminho crítico.

A tela também carregava o importador de catálogo diretamente no HTML, antes de concluir a autorização do usuário. Isso aumentava o número de módulos, observers e rotinas de inicialização concorrendo antes de a página principal estar disponível.

## Correção

- corpo da página deixa de iniciar oculto;
- conteúdo administrativo permanece protegido até a autorização de `owner`/`manager`;
- estado visível de `Validando acesso…` durante a autenticação;
- timeout de 10 segundos na validação da sessão;
- estado de erro com `Tentar novamente` e retorno ao painel;
- fallback estático de 12 segundos caso o módulo principal não conclua a inicialização;
- falhas de carregamento de dados são exibidas dentro da própria tabela;
- o importador de catálogo deixa de ser carregado diretamente pelo HTML de fornecedores;
- a tela principal carrega primeiro autenticação e dados de fornecedores;
- as ferramentas de catálogo são carregadas em segundo plano somente após a sessão autorizada;
- o módulo global de autenticação não carrega mais o cleanup da interface de catálogo;
- o importador foi encapsulado por um carregador que aguarda a área `.list-head` existir antes de inicializar o núcleo legado;
- a espera pela área de ferramentas é limitada a 5 segundos, evitando polling permanente;
- o núcleo original do importador foi preservado em `supplier-catalog-importer-core-v21.js` para reduzir risco de regressão funcional.

## Fluxo atual

`abrir página → validar sessão → mostrar área administrativa → carregar dados → carregar ferramentas de catálogo em segundo plano`

Nenhuma regra de negócio, permissão de banco, catálogo, validação de preço ou precificação foi alterada.
