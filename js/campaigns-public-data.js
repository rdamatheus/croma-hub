export const PUBLIC_CAMPAIGNS={
  'empresa-v2':{
    title:'Sua empresa precisa aparecer.',
    intro:'Escolha o material e conte o que precisa. Confirmaremos preço, produção e recebimento no orçamento.',
    products:[
      {
        id:'b7cb09f8-1949-4d91-a3bc-dcf584580c0e',
        label:'Cartão de visita',
        summary:'Cartão em couchê 250 g, impressão frente e verso e verniz total na frente.',
        materialDefault:'Couchê 250 g',
        finishPlaceholder:'Ex.: frente e verso, verniz, quantidade por lote'
      },
      {
        id:'c89ab487-a081-4733-bbd4-2c6f3a5fab28',
        label:'Adesivo vinil',
        summary:'Adesivo em vinil com impressão colorida. Tipo de vinil, corte e acabamento são definidos conforme a aplicação.',
        materialPlaceholder:'Ex.: vinil branco brilho, fosco, transparente',
        finishPlaceholder:'Ex.: corte reto, corte especial, laminação'
      },
      {
        id:'bc444bb7-e0df-4d34-b364-6e117ef56f2f',
        label:'Panfleto A4',
        summary:'Panfleto A4 em couchê 150 g, formato 21 × 30 cm e impressão colorida frente e verso.',
        materialDefault:'Couchê 150 g',
        finishPlaceholder:'Ex.: frente e verso, dobra ou acabamento desejado'
      },
      {
        id:'c086cd87-507a-4d00-b7c5-df21656a2802',
        label:'Bloco autocopiativo A5',
        summary:'Bloco A5 de 15 × 21 cm, com 50 folhas e 3 vias autocopiativas.',
        materialDefault:'Autocopiativo, 3 vias',
        finishPlaceholder:'Ex.: numeração, blocagem, personalização'
      }
    ]
  }
};

export function getPublicCampaign(key){
  return PUBLIC_CAMPAIGNS[key]||null;
}
