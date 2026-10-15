# Página pública de Impressões e Cópias — 2026-10-15

## Objetivo
Corrigir o configurador público antes dependente de slugs inexistentes e permitir solicitação de orçamento sem criar produtos paralelos nem contornar controles de compra.

## Decisão implementada
- Página mantida em `/servicos/impressoes-copias/`, com alternância de Impressões e Cópias.
- Código do configurador isolado em `/js/printing-public-configurator.js`.
- Tabela **comercial** consultada em `public_config.config_key='print_pricing'` (versão 2), por formato, modo, faces e faixa de quantidade; preços não foram copiados para o frontend.
- Estimativa somente para **Impressões + material padrão + sem acabamento + faixa comercial única e positiva**. Outros materiais, acabamentos, cópias ou quantidades sem faixa válida resultam em **Sob consulta**.
- Serviços reais já cadastrados no Bling são referenciados pelos identificadores existentes (IMPRESSÃO 16411218543; CÓPIAS 16265579117/16265579042/16265581415/16265581594). O identificador da referência pública disponível acompanha a mensagem de orçamento.
- Nenhum custo técnico, margem, tabela `product_costs` nem insumo privado é exposto. Nenhum registro do banco, regra de preço, SKU ou produto foi criado/alterado.
- Carrinho e pagamento online **não liberados para serviços**. As RPCs `sync_active_cart` e `checkout_active_cart` rejeitam serviços, além de existirem limitações de preço/estoque para esse fluxo.
- Arquivos podem ser selecionados na página para facilitar a identificação; os bytes **não** são transmitidos por URL nem enviados ao Storage. O texto orienta anexar os arquivos à conversa de WhatsApp. Não apresentar esse seletor como upload concluído.
- Listas de materiais/acabamentos são rótulos comerciais conservadores para cotação, coerentes com os formatos dos insumos existentes. Não substituem o cadastro mestre e não garantem disponibilidade.

## Validação realizada
- Nova versão do módulo passou por compilação sintática de JavaScript.
- HTML conferido quanto aos IDs utilizados pelo controlador e ausência do CTA antigo de compra.
- Oito verificações de regras comerciais passaram: limites 1, 10, 11 e 51; combinação sem preço; face sem faixa; A3; faixas sobrepostas.
- Repositório `rdamatheus/croma-hub`: commits `92933fc` e `ed86e0c`. GitHub Pages workflow `38739211982` concluiu com **success**.
- Não foram criados pedidos reais, cobrados pagamentos nem gravados dados de cliente.
- A inspeção visual interativa e teste real com usuários anônimos/logados ainda não foram executados; acesso à página via ferramenta de navegação externa estava indisponível.

## Próximas dependências (não aprovadas nesta etapa)
1. Revisar com o gerente a grade de preço comercial `print_pricing` e validar custo/margem por configuração.
2. Se a compra online de serviços for desejada, desenhar a validação de preço/variações no servidor e o fluxo de serviços sem estoque físico, em etapa própria.
3. Evoluir a lista pública de materiais para uma projeção segura do cadastro mestre, evitando atualização manual dos rótulos.
4. Testar no navegador desktop/mobile, abrir o WhatsApp e confirmar o texto gerado; validar fluxo completo de arquivos pelo atendimento.
