# Croma Hub

## Experiência pública

A camada pública foi redesenhada para conduzir visitantes a três frentes: Croma Gráfica, Croma Papelaria & Presentes e Croma Digital. A home prioriza orçamento pelo WhatsApp, catálogo, portfólio e contato local.

Produtos, mídias, famílias, categorias e serviços continuam sendo lidos do Supabase. A página `/produtos/item/` consulta um produto por `id` e oferece consulta pelo WhatsApp; não há checkout ou migration nova.

O portfólio público usa somente itens ativos marcados como foto própria e não referencia imagens de banco ou registros internos. O formulário `/contato/` prepara a mensagem no navegador e o visitante decide quando abrir o WhatsApp.

MVP local-first e static-first da Croma, preparado para evoluir de uma landing page pública para catálogo, portfólio, orçamento e futuras ferramentas digitais.

## Estrutura

- `index.html` — página principal
- `css/styles.css` — identidade visual e responsividade
- `js/app.js` — comportamento da interface
- `js/data-service.js` — camada de acesso aos dados
- `data/catalogo.json` — fallback legado; Supabase é a fonte oficial

## Princípios

- HTML, CSS e JavaScript sem framework
- Supabase para dados oficiais e autenticação
- dados separados da interface
- compatível com GitHub Pages
- catálogo integrado ao Supabase

## Publicação

Ative o GitHub Pages em **Settings → Pages → Deploy from a branch → main / root**.
