# Central de Aprovações da Vitrine

## Objetivo

A Central de Aprovações organiza as propostas de vitrine, campanhas e conteúdo visual antes de qualquer publicação no site. O agente pode analisar o catálogo e preparar propostas; a publicação continua dependendo da decisão do proprietário ou da gerência.

## Tipos de proposta

- product_image: foto ou imagem de produto/serviço;
- product_related: conteúdo relacionado ao produto, como texto, composição ou apresentação;
- banner: banner para Home ou área comercial;
- featured_item: produto ou serviço em destaque;
- campaign: campanha comercial;
- seasonal: planejamento de data sazonal.

## Fluxo

pending → approved → publicação manual ou integração futura

pending → changes_requested → nova versão, preservando o histórico

pending → rejected

Toda decisão deve ter comentário. Comentários ficam ligados à proposta e podem orientar versões futuras e preferências recorrentes.

## Tabelas

- site_approval_proposals: estado atual, tipo, área, destino, preview e vínculo opcional com produto;
- site_approval_versions: snapshots das versões;
- site_approval_comments: feedback, decisões e eventos do sistema;
- site_approval_preferences: preferências explícitas ou aprendidas usadas pelo agente.

As quatro tabelas usam RLS e ficam disponíveis somente para perfis internos de gestão (owner e manager).

## Rotina programada

A automação Revisar vitrine Croma roda semanalmente nas manhãs de segunda-feira, no fuso America/Sao_Paulo. Ela revisa catálogo, estoque, imagens, campanhas, sazonalidade e comentários, grava propostas na Central e preserva versões. A automação não publica banners, não troca imagens públicas, não altera preços e não ativa ou remove destaques.

## Validação

- Tabelas e índices criados no projeto croma-hub;
- RLS habilitado nas quatro tabelas;
- painel interno criado em /interno/vitrine-aprovacoes/;
- acesso adicionado ao diretório interno e ao módulo Vitrine & Campanhas;
- sintaxe do JavaScript validada após a criação dos arquivos.
