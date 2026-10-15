import {supabase} from '/js/croma-supabase.js?v=20260821-2';

const PRINT_BLING_ID=16411218543;
const COPY_BLING_IDS={'pb:frente':16265579117,'pb:frente_verso':16265579042,'color:frente':16265581415,'color:frente_verso':16265581594};
const BLING_IDS=[PRINT_BLING_ID,...Object.values(COPY_BLING_IDS)];
const WHATSAPP='5532991779522';
const TYPE=new URLSearchParams(location.search).get('produto')==='copias'?'copias':'impressoes';
const $=s=>document.querySelector(s);
const money=x=>Number(x).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let config=null,services=[],currentEstimate=null;

const materials=[
 ['padrao','Papel padrão do serviço',['A4','A3']],
 ['foto120','Mídia fotográfica brilho 120 g',['A4']],
 ['foto230','Mídia fotográfica brilho 230 g',['A4','A3']],
 ['fosco230','Mídia fotográfica fosca 230 g',['A4']],
 ['offset180','Papel offset 180 g',['A3']],
 ['adesivo108','Papel fotográfico adesivo fosco 108 g',['A4']],
 ['vinil135','Vinil adesivo branco brilho 135 g',['A3']]
];
const finishes=[
 ['nenhum','Sem acabamento',['A4','A3']],
 ['boppbrilho','Laminação BOPP brilho',['A3']],
 ['boppfosco','Laminação BOPP fosca',['A3']],
 ['plastA4','Plastificação A4',['A4']],
 ['plastA3','Plastificação A3',['A3']]
];
const fallbackModes=[
 {id:'pb_texto',label:'P/B — texto'},
 {id:'pb_imagem',label:'P/B — imagem'},
 {id:'color_texto',label:'Colorido — texto'},
 {id:'color_imagem',label:'Colorido — imagem'}
];

function setOptions(node,options,preferred){
 const last=preferred||node.value;
 node.replaceChildren();
 options.forEach(o=>node.add(new Option(o.label,o.id)));
 if(options.some(o=>o.id===last))node.value=last;
}
function linkedService(){
 const id=TYPE==='impressoes'?PRINT_BLING_ID:COPY_BLING_IDS[
  ($('#mode').value.startsWith('pb_')?'pb':'color')+':'+$('#sides').value];
 return services.find(item=>Number(item.bling_product_id)===id)||null;
}
function tierFor(q,format,mode,sides){
 if(!Array.isArray(config?.rows))return null;
 const matches=config.rows.filter(r=>r.sides===sides&&
  Number.isInteger(Number(r.min))&&Number.isInteger(Number(r.max))&&
  q>=Number(r.min)&&q<=Number(r.max)&&
  Number.isFinite(Number(r[format]?.[mode]))&&Number(r[format][mode])>0);
 if(matches.length!==1)return null; // Faixas sobrepostas não podem gerar valor automático.
 return {unit:Number(matches[0][format][mode]),min:Number(matches[0].min),max:Number(matches[0].max)};
}
function chosen(){
 const getLabel=id=>$('#'+id).selectedOptions[0]?.textContent||'';
 return {
  format:$('#format').value,mode:$('#mode').value,modeLabel:getLabel('mode'),
  sides:$('#sides').value,sidesLabel:getLabel('sides'),
  material:$('#material').value,materialLabel:getLabel('material'),
  finish:$('#finish').value,finishLabel:getLabel('finish'),
  qty:Number($('#qty').value),notes:$('#details').value.trim(),
  files:Array.from($('#files').files||[]).map(f=>f.name)
 };
}
function calculate(){
 const s=chosen();
 const valid=Number.isInteger(s.qty)&&s.qty>0&&s.qty<=100000;
 const eligible=TYPE==='impressoes'&&s.material==='padrao'&&s.finish==='nenhum';
 const tier=valid&&eligible?tierFor(s.qty,s.format,s.mode,s.sides):null;
 currentEstimate=tier?{unit:tier.unit,total:Math.round(tier.unit*s.qty*100)/100}:null;
 $('#unit').textContent=currentEstimate?money(currentEstimate.unit):'Sob consulta';
 $('#total').textContent=currentEstimate?money(currentEstimate.total):'Sob consulta';
 $('#tier').textContent=tier?'Faixa comercial: '+tier.min+'–'+tier.max+' folhas.':'Valor a confirmar.';
 $('#detail').textContent=currentEstimate?'Preço estimado, sujeito à confirmação.':'Orçamento individual.';
 $('#pricingNotice').textContent=!valid?
  'Informe uma quantidade inteira entre 1 e 100.000 folhas.':
  currentEstimate?'Estimativa da tabela comercial para impressão padrão sem acabamento. Confirmaremos valor final, prazo e disponibilidade antes da produção.':
  'Esta configuração exige análise de orçamento; não há cobrança ou reserva automática.';
 const linked=linkedService();
 $('#serviceStatus').textContent=linked?
  'Referência vinculada ao serviço existente no Bling. A compra online deste serviço ainda não está habilitada.':
  'Referência comercial indisponível para compra online. Solicite orçamento.';
 $('#productImage').src=s.mode.startsWith('pb_')?'../../assets/produtos/impressao-pb-croma.jpg':'../../assets/produtos/impressao-placeholder.svg';
 $('#productImage').alt='Imagem de referência — '+s.modeLabel;
 const button=$('#requestQuote');
 button.setAttribute('aria-disabled',String(!valid));
 if(!valid){button.removeAttribute('href');return}
 const lines=[
  'Olá! Gostaria de solicitar um orçamento na Croma.',
  'Serviço: '+(TYPE==='copias'?'Cópias':'Impressões'),
  'Formato: '+s.format,'Tipo: '+s.modeLabel,'Faces: '+s.sidesLabel,
  'Material: '+s.materialLabel,'Acabamento: '+s.finishLabel,
  'Quantidade: '+s.qty+' folha(s)'
 ];
 if(linked)lines.push('Referência do serviço Bling: '+linked.bling_product_id);
 if(currentEstimate)lines.push('Estimativa vista no site: '+money(currentEstimate.total)+' (a confirmar)');
 if(s.notes)lines.push('Observações: '+s.notes);
 if(s.files.length)lines.push('Vou anexar estes arquivos: '+s.files.join(', '));
 lines.push('Por favor, confirmem o valor final e o prazo.');
 button.href='https://wa.me/'+WHATSAPP+'?text='+encodeURIComponent(lines.join('\n'));
}
function refreshDependent(){
 const format=$('#format').value;
 setOptions($('#material'),materials.filter(i=>i[2].includes(format)).map(i=>({id:i[0],label:i[1]})));
 setOptions($('#finish'),finishes.filter(i=>i[2].includes(format)).map(i=>({id:i[0],label:i[1]})));
 calculate();
}
async function load(){
 const results=await Promise.allSettled([
  supabase.from('public_config').select('data').eq('config_key','print_pricing').maybeSingle(),
  supabase.from('products').select('id,nome,bling_product_id,ativo,published_on_site').in('bling_product_id',BLING_IDS).eq('ativo',true)
 ]);
 const prices=results[0].status==='fulfilled'?results[0].value:null;
 const catalog=results[1].status==='fulfilled'?results[1].value:null;
 if(!prices?.error&&prices?.data?.data?.version===2)config=prices.data.data;
 if(!catalog?.error&&Array.isArray(catalog?.data))services=catalog.data;
 const formats=TYPE==='copias'?['A4']:
  (Array.isArray(config?.standardFormats)?config.standardFormats.filter(x=>x==='A4'||x==='A3'):['A4','A3']);
 setOptions($('#format'),(formats.length?formats:['A4','A3']).map(f=>({id:f,label:f})));
 setOptions($('#mode'),Array.isArray(config?.modes)&&config.modes.length?
  config.modes.filter(m=>typeof m.id==='string'&&typeof m.label==='string'):fallbackModes,'pb_texto');
 refreshDependent();
}
function init(){
 const title=TYPE==='copias'?'Cópias':'Impressões';
 $('#productTitle').textContent=title;
 $('#crumbProduct').textContent=title;
 $('#switchPrint').classList.toggle('active',TYPE==='impressoes');
 $('#switchCopy').classList.toggle('active',TYPE==='copias');
 $('#productDescription').textContent=TYPE==='copias'?
  'Escolha as características de suas cópias; o atendimento confirma material, prazo e valor.':
  'Configure formato, tipo de impressão, material, faces e quantidade. Consulte a estimativa ou solicite um orçamento.';
 $('#format').addEventListener('change',refreshDependent);
 ['mode','sides','material','finish','files'].forEach(id=>$('#'+id).addEventListener('change',calculate));
 ['qty','details'].forEach(id=>$('#'+id).addEventListener('input',calculate));
 load().catch(e=>{
  console.error('Falha ao carregar configurador',e);
  setOptions($('#format'),[{id:'A4',label:'A4'},{id:'A3',label:'A3'}]);
  setOptions($('#mode'),fallbackModes,'pb_texto');
  refreshDependent();
  $('#pricingNotice').textContent='Não foi possível consultar a tabela. Solicite a confirmação pelo WhatsApp.';
 });
}
init();
