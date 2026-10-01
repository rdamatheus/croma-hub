# Ajustes da jornada do cliente — 2026-10-01

## Objetivo e decisão
Facilitar o caminho da campanha até orçamento/compra, preservando catálogo, preços e autenticação existentes.

- A campanha publicada leva à seleção dos quatro IDs já aprovados, na página Comunicação & Marketing. O catálogo público continua decidindo quais itens podem aparecer; a página não consulta tabelas privadas de aprovação.
- O orçamento recolhe quantidade, acabamento, prazo desejado e situação da arte antes de abrir WhatsApp. Não envia mensagem automaticamente.
- O banner usa a arte responsiva existente; qualquer título auxiliar usa o título comercial, nunca o nome interno. Cache dos módulos alterados atualizado.
- O carrinho permite conferência, quantidade e remoção antes do login. Login continua obrigatório para registrar pedido. Valores exibidos são estimados; validações de preço e estoque no servidor permanecem.
- Sem tarifa de entrega calculada, o site solicita cotação no atendimento e mantém o carrinho. Não registra entrega como pedido com frete zero nem inicia pagamento online de uma entrega nova. Retirada mantém checkout existente.
- Detalhe de produto respeita o modo comercial público e explica disponibilidade, prazo e frete sem prometer estoque.
- Busca preserva a pesquisa mais recente, permite tentar novamente e tolera falha nas imagens. A causa da falha intermitente anterior não foi comprovada.
- Home exclui agendas/calendários de anos anteriores dos destaques automáticos. Nenhum produto ou preço foi alterado no banco.

## Validação
Sintaxe JS, git diff --check e testes Node: carrinho anônimo, alteração/remoção, entrega sem RPC/pagamento, retirada com endpoint existente e respostas atrasadas da busca. Testes usam dados simulados e não criam pedidos reais.

## Limites
Não foi feita transação real. O download do navegador local falhou. O fluxo de frete é cotação manual, não cálculo integrado. A proteção de entrega desta alteração é na interface: o endpoint existente permanece inalterado e clientes antigos podem continuar enviando frete zero. Endurecimento do endpoint e cálculo logístico exigem tratar compatibilidade com clientes e pedidos existentes em etapa própria.

## Manutenção
A seleção desta campanha fica em js/campaign-selection.js e reutiliza os IDs da proposta aprovada. Campanhas novas precisam de seleção própria aprovada. Preferências comerciais permanentes não foram inferidas desta correção.

## Lote 1 — endurecimento da campanha

Implementado após aprovação explícita do lote:

- `site_banners.target_url` da campanha "Sua empresa precisa aparecer" passa a apontar diretamente para `/comunicacao-marketing/#campanha-empresa`;
- removida a exceção por UUID do banner no frontend: o destino publicado volta a ser a única fonte de verdade;
- a Home filtra explicitamente `active = true` e revalida `starts_at`/`ends_at` no cliente, inclusive para sessões internas que possam ler mais registros pelo RLS;
- a consulta pública do banner deixa de carregar o campo interno `name`;
- os quatro produtos da campanha foram movidos para uma configuração pública separada (`js/campaigns-public-data.js`), mantendo somente referências aos IDs reais do catálogo;
- o renderizador (`js/campaign-selection.js`) passou a ser reutilizável e continua consultando catálogo, mídia e ação comercial reais;
- regra preservada: sem preço válido ou sem ação pública de compra/configuração, o CTA permanece em orçamento;
- títulos comerciais não expõem o nome técnico do cadastro no card da campanha;
- orçamento da campanha coleta quantidade, material, medidas/acabamento, prazo desejado e situação da arte antes de abrir o WhatsApp;
- nenhum preço, estoque, produto, RLS, integração financeira ou dado do histórico de aprovação foi alterado.

### Validação específica do Lote 1

Foram adicionados testes para confirmar que o banner exige estado ativo/vigência, não contém exceção por UUID e não consulta o nome interno; a configuração mantém os quatro IDs aprovados; e o formulário coleta material e preserva a decisão comercial baseada em preço válido + ação pública.

A publicação só deve ser considerada validada após conferir o workflow do GitHub Pages e o conteúdo efetivamente servido pelo domínio público.
