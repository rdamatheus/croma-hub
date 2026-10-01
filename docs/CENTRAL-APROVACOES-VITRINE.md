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


## Revisão diária e arte v2 — 2026-10-01

- Mantida a curadoria semanal; adicionada revisão diária pela manhã, aproximadamente às 8h (America/Sao_Paulo), para tratar comentários e revisões sem duplicações.
- Aprovação de briefing permite preparar a arte; a nova arte volta a pending e exige avaliação própria. A publicação continua separada e manual.
- Previews desktop e celular podem ser abertos em tamanho integral; o histórico mantém links de cada versão. Novos comentários e decisões registram version_id.
- Imagens da campanha “Sua empresa precisa aparecer” são mockups ilustrativos gerados, não fotografias reais dos produtos. Arquivos em assets/approval-previews/empresa-v2; não ativam banner na Home.
- Ao criar versão, preservar decisão anterior no snapshot, limpar decided_at/decided_by do estado corrente e associar os comentários usados como fonte. Não converter um “Gostei” isolado em regra visual permanente.
- A execução agendada depende das conexões disponíveis; agendamento ativo não garante conclusão de cada execução. Registrar bloqueios e verificar gravações.
