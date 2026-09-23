# Croma → CorelDRAW

Automação piloto para montar no CorelDRAW o encaixe calculado pelo Simulador de Produção.

## Arquivos

- `CromaMapaProducao.bas`: macro VBA.
- O simulador gera o CSV com coordenadas, dimensões, rotação, pasta do material e arquivo de origem.

## Organização esperada dos arquivos

A macro não exige copiar todas as artes para uma pasta temporária. Ela usa a organização já existente do Google Drive:

```text
In House/
└── PRODUÇÃO/
    ├── Adesivos Brilho/
    ├── ADESIVOS CORTE ESPECIAL/
    ├── ADESIVOS CORTE VAZADO/
    └── PLACAS PVC/
```

No computador que roda o CorelDRAW, a pasta `PRODUÇÃO` deve estar disponível localmente, por exemplo através do Google Drive para computador ou por download manual.

O CSV contém a coluna `material`. A macro procura primeiro:

```text
PRODUÇÃO\<material>\<arquivo>
```

Se não encontrar, faz uma busca recursiva abaixo de `PRODUÇÃO`.

## Fluxo

1. Abra o simulador e calcule o encaixe.
2. Clique em **Exportar mapa para CorelDRAW**.
3. No CorelDRAW, importe `CromaMapaProducao.bas` em um projeto VBA/GMS.
4. Execute a macro `CromaImportarMapa`.
5. Selecione o CSV exportado.
6. Selecione a pasta local `PRODUÇÃO`.
7. A macro:
   - cria uma página para cada segmento/placa;
   - importa o PDF correspondente;
   - aplica a rotação do mapa;
   - confere a proporção do arquivo;
   - dimensiona para o tamanho calculado;
   - posiciona nas coordenadas X/Y;
   - grava `corel-import-log.txt` ao lado do CSV.

## Sistema de coordenadas

O simulador exporta coordenadas em centímetros com origem no canto superior esquerdo.

- X: da esquerda para a direita;
- Y: de cima para baixo.

A macro converte Y para o sistema de coordenadas do CorelDRAW.

## Validação dimensional

Antes de redimensionar a arte, a macro compara a proporção do conteúdo importado com a proporção esperada no mapa.

- tolerância padrão: 3%;
- dentro da tolerância: dimensiona exatamente para o envelope calculado;
- acima da tolerância: remove a importação, registra no log e não força uma deformação.

Essa validação evita que um arquivo incorreto seja achatado apenas para caber nas medidas do simulador.

## CSV

Colunas atuais:

```text
segmento
peca
item
material
arquivo
drive_file_id
drive_url
x_cm
y_cm
largura_cm
altura_cm
rotacao_graus
pagina_largura_cm
pagina_altura_cm
```

O CSV é UTF-8 e separado por ponto e vírgula. A macro o lê em UTF-8 para preservar nomes com acentos.

## CorelDRAW API utilizada

A macro utiliza APIs nativas do CorelDRAW, incluindo:

- `Layer.ImportEx` + `ImportFilter.Finish`;
- `ShapeRange.GetSize`;
- `ShapeRange.SetSize`;
- `ShapeRange.SetPosition`;
- `Document.AddPagesEx`;
- `Page.SetSize`;
- `CorelScriptTools.GetFileBox`;
- `CorelScriptTools.GetFolder`.

Referência oficial: https://community.coreldraw.com/sdk/api/draw/
