# Arquitetura oficial — Croma Hub

Este documento define as regras para novas funcionalidades e refatorações do Croma Hub.

## 1. Fonte de verdade

- **Supabase**: dados permanentes, compartilhados, históricos ou necessários para operação em mais de um aparelho.
- **localStorage**: apenas estado temporário e descartável do navegador, como carrinho ainda não confirmado e preferências de interface.
- Um mesmo dado comercial não deve possuir duas fontes oficiais concorrentes.

## 2. Autenticação e autorização

- Toda autenticação de cliente e equipe usa **Supabase Auth**.
- O acesso interno é autorizado por `public.profiles` e seus papéis (`owner`, `manager`, `equipe`).
- Não criar senhas, hashes ou chaves administrativas dentro do JavaScript público.
- Toda tabela com dados privados usa RLS.

## 3. Dados públicos e internos

Nunca publicar no site do cliente:

- nome de fornecedor;
- referência interna de fornecedor;
- custo de compra;
- margem interna;
- dados de operação ou desenvolvimento;
- chaves secretas ou credenciais.

Dados de custo pertencem a estruturas internas, como `product_costs`.

## 4. Produtos e preços

- `public.products` é a fonte oficial do catálogo público.
- `public.product_costs` contém custo e referência interna e nunca é público.
- Configurações públicas compartilhadas, como precificação de impressão, ficam em `public.public_config`.
- JSON local pode existir apenas como fallback de disponibilidade e não deve conter informação interna.

## 5. Pedidos

- O carrinho não confirmado pode ficar no navegador.
- Ao confirmar, o pedido passa a existir no Supabase.
- O pedido deve guardar um **snapshot** do que foi vendido: nome, quantidade, preço, opções e arquivos daquele momento.
- Alterações futuras no produto não alteram pedidos antigos.
- Quando houver histórico comercial, preferir cancelar/inativar a apagar registros.

## 6. Arquivos

- Arquivos de clientes ficam em bucket privado.
- O acesso ocorre por usuário autenticado ou URL assinada com validade curta.
- Nunca criar leitura pública do bucket de pedidos.
- Arquivos devem ser vinculados ao cliente e ao pedido/item correspondente.

## 7. Organização do código

- **HTML**: estrutura e conteúdo.
- **CSS**: aparência e responsividade.
- **JavaScript**: comportamento e integração.
- Funções compartilhadas devem viver em arquivos compartilhados, não copiadas entre páginas.
- Cada módulo deve ter responsabilidade clara: autenticação, navegação, catálogo, carrinho, pedidos etc.
- Evitar grandes blocos de CSS injetados por JavaScript.

## 8. Área interna

- Todas as páginas internas devem usar `js/interno-auth.js` ou mecanismo compartilhado equivalente.
- Estados internos compartilhados que ainda não justificam tabelas próprias podem usar `internal_module_state`.
- Quando um módulo amadurecer e exigir filtros, relatórios ou relações, migrar de `internal_module_state` para uma tabela própria.

## 9. Regra para novas funções

Antes de implementar uma funcionalidade, definir:

1. o que o cliente vê;
2. o que a equipe interna vê e altera;
3. onde o dado é armazenado;
4. quem pode ler e escrever;
5. qual é o histórico que não pode ser perdido;
6. qual estado pode ser apenas temporário.

Não criar uma segunda versão da mesma informação em outro módulo sem definir qual delas é a fonte oficial.

## 10. Segurança

- Publishable/anon key pode existir no frontend; `service_role`, secret keys e senhas de banco nunca.
- Funções administrativas devem validar o JWT e o papel do usuário no servidor.
- Revisar periodicamente os advisors de segurança/performance do Supabase.
- Habilitar proteção contra senhas vazadas quando disponível no plano/configuração.

## 11. Critério de limpeza

Só remover arquivo ou código quando houver evidência de que não é referenciado nem necessário como fallback.
Refatorar em pequenas etapas, mantendo o comportamento validado antes de avançar.
