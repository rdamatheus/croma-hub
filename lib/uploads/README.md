# Uploads provisórios

Esta pasta representa o destino lógico `lib/uploads/` usado pelo front-end da Croma.

No GitHub Pages o navegador não consegue gravar arquivos diretamente no repositório. Por isso, nesta fase os anexos são armazenados localmente no navegador via IndexedDB e recebem uma referência virtual `lib/uploads/...`.

Na migração para Supabase, essas referências deverão apontar para um bucket de Storage e os metadados do carrinho/pedido deverão guardar a URL ou chave do objeto.
