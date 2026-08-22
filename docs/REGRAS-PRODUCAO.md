# Regras de Produção — Croma Hub

## Princípio

Os configuradores devem **apresentar mais e perguntar menos**. O cliente informa apenas o necessário para definir o produto; regras técnicas de produção ficam centralizadas no Supabase e são aplicadas automaticamente.

## Fonte oficial

Configuração pública segura: `public.public_config`

Chave inicial: `production.plotter_cut.labels`

O painel interno para edição fica em `/interno/configuracoes-producao/` e exige perfil `owner` ou `manager`.

## Rótulos e Etiquetas

Fluxo inicial:

1. Cliente escolhe **Cartela** ou **Bobina**.
2. Informa largura, altura e quantidade.
3. Para cartela, o sistema sugere A3 por padrão e permite trocar para A4.
4. O sistema calcula automaticamente o aproveitamento e a quantidade de cartelas.

Regras iniciais:

- Margem técnica: 10 mm em cada borda.
- Espaçamento entre artes: 3 mm.
- Mínimo recomendado para recorte: 15 × 15 mm. Medidas menores geram alerta, não bloqueio.
- Se qualquer lado tiver menos de 30 mm, o aproveitamento calculado é reduzido para 50%.
- Rotação automática pode ser usada para melhorar o aproveitamento.
- A3: 297 × 420 mm.
- A4: 210 × 297 mm.

Todos esses parâmetros são editáveis no painel interno e não devem ser duplicados dentro de páginas de produto.

## Código compartilhado

`/js/production-rules.js` concentra carregamento, normalização e cálculo das regras. Novos configuradores devem reutilizar esse módulo ou evoluí-lo, em vez de criar fórmulas isoladas.
