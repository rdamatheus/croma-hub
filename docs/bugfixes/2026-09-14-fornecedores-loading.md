# Correção de carregamento — Fornecedores

Data: 2026-09-14

## Problema

A rota `/interno/fornecedores/` usava `<body hidden>` e só removia o estado oculto depois da validação assíncrona da sessão. Uma falha, demora ou erro de módulo podia deixar a página completamente branca, sem feedback ao usuário.

## Correção

- corpo da página deixa de iniciar oculto;
- conteúdo administrativo permanece oculto até a autorização de `owner`/`manager`;
- estado visível de `Validando acesso…` durante a autenticação;
- timeout de 10 segundos na validação da sessão;
- estado de erro com `Tentar novamente` e retorno ao painel;
- fallback estático de 12 segundos caso o módulo JavaScript nem conclua a inicialização;
- falhas de carregamento de dados são exibidas dentro da própria tabela;
- cache-bust do módulo `interno-fornecedores.js` atualizado.

Nenhuma regra de negócio, permissão de banco, catálogo ou preço foi alterada.
