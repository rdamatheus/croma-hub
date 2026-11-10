# Migração de domínio: Croma Hub (10/11/2026)

## Decisão aprovada
- Domínio principal desejado: `https://croma.app.br/`.
- `https://www.croma.app.br/` deve redirecionar ao principal.
- `https://www.cromapel.com.br/` (e, se usado, `https://cromapel.com.br/`) deve permanecer acessível e redirecionar com HTTP **301** para o novo domínio, preservando caminho e parâmetros.
- **Uma única aplicação e um único repositório de produção**: `rdamatheus/croma-hub`.

## Estado confirmado
- No branch `main`, `CNAME` contém `www.cromapel.com.br`.
- `https://www.cromapel.com.br/` respondeu com o conteúdo da Croma na consulta pública de 10/11/2026.
- Captura do usuário: `croma.app.br` exibia `DNS_PROBE_FINISHED_NXDOMAIN`.
- **Não houve acesso para alterar DNS no Registro.br e a zona DNS autoritativa ainda não foi auditada**.
- Esta branch prepara a nova entrada `CNAME`; **não fazer merge enquanto os bloqueios abaixo persistirem**.

## Pré-requisitos e execução controlada
1. Identificar onde são gerenciados DNS e redirecionamentos de **ambos** os domínios; preservar e-mails, registros MX/TXT/SPF/DKIM/DMARC, DNSSEC e outros serviços. Conferir situação do registro do domínio novo.
2. Verificar titularidade de `croma.app.br` na conta GitHub conforme a documentação do Pages, quando aplicável, antes de apontar o DNS para hospedagem.
3. Preparar DNS de `croma.app.br`: quatro registros A no apex `@` para `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`; `www` CNAME para `rdamatheus.github.io`. Adicionar AAAA oficiais se desejado, sem remover registros de e-mail.
4. Preparar **antes da troca** um serviço de redirecionamento que atenda **HTTPS** em `cromapel.com.br` e `www.cromapel.com.br` e devolva HTTP **301**, com URL de destino `https://croma.app.br` + mesmo caminho/query. Redirecionamento simples do Registro.br **não atende a esse requisito**, pois responde 302 e só recebe HTTP.
5. Conferir URLs absolutas, tags canonical, sitemap/SEO, service worker, formulários, integrações e redirecionamentos externos. Revisar as listas de URL permitidas/callbacks do Supabase Auth e dos provedores OAuth utilizados (se aplicável), sem mudar tokens, segredos ou callbacks inadvertidamente.
6. Quando **DNS, redirecionamento antigo e integrações** estiverem prontos, revisar e fazer merge da PR; confirmar domínio personalizado nas configurações GitHub Pages e aguardar ativação do HTTPS.
7. Testar `https://croma.app.br/`, `https://www.croma.app.br/`, `https://www.cromapel.com.br/`, `https://cromapel.com.br/`, rotas internas, autenticação e pedidos. Verificar códigos 301, destino e cadeado HTTPS. **Só declarar concluído depois dos testes**.

## Condições de parada / rollback
- Não alterar o `CNAME` em `main` sem confirmação da zona DNS e disponibilidade de redirecionamento HTTPS do domínio antigo.
- Se falhar, restaurar `CNAME=www.cromapel.com.br`, preservar o DNS funcional antigo e remover/reverter regras de redirecionamento incorretas. Conferir o status de HTTPS novamente.
- Manter este registro atualizado com datas, resultados de validação e pendências reais.

## Documentação
- GitHub Pages: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site
- GitHub: https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages
- Registro.br: https://registro.br/ajuda/gerenciamento-de-conta
