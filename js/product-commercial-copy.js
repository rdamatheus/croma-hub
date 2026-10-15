// Apresentação comercial pública; não modifica os campos operacionais sincronizados do Bling.
// Adicione novas fichas somente após aprovação e validação das especificações.
const overrides={
  'bling-16630521070':{
    name:'Mini Caixa de Som Bluetooth RGB S100',
    description:'Compacta e prática, a S100 combina conexão Bluetooth com iluminação colorida RGB. Uma opção para ouvir músicas no dia a dia, complementar seu ambiente ou presentear.',
    tagline:'Som, iluminação RGB e portabilidade em um só produto.',
    highlights:['Conexão Bluetooth','Iluminação LED RGB','Bateria recarregável','Design compacto e portátil','Cor preta']
  }
};
export function commercialCopy(product){
  const copy=overrides[product?.slug];
  return copy?{...copy}:{name:product?.nome||'',description:product?.short_description||product?.descricao||'',tagline:'',highlights:[]};
}
export function commercialName(product){return commercialCopy(product).name||product?.nome||''}
