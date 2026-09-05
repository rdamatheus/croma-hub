const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const tr={unknown:'Não informado',unit:'Por unidade',lot:'Por lote',fixed:'Tamanho fixo',area:'Por área',linear:'Por medida linear',m2:'m²',cm2:'cm²',linear_m:'metro linear',exact:'Quantidade exata',range:'Faixa de quantidade',free:'Quantidade livre',ok:'OK',review:'Revisar',reject:'Não importar'};

function enhanceSummary(){const e=document.querySelector('#scSummary');if(!e)return;const text=e.textContent||'';const m=text.match(/Padrão v([^·]+)\s*·\s*(\d+) item\(ns\)\s*·\s*(\d+) para revisar\s*·\s*(\d+) rejeitado\(s\)\s*·\s*(\d+) SKU\(s\)/i);if(!m)return;const [,v,total,review,reject,missing]=m;const parts=[`<strong>Arquivo lido com sucesso</strong> · padrão Croma v${v.trim()} · <strong>${fmt(total)} itens</strong>`];if(+review)parts.push(`<span style="color:#8a6b00">${fmt(review)} precisam de revisão</span>`);else parts.push('nenhum item precisa de revisão');if(+reject)parts.push(`<span style="color:#a63838">${fmt(reject)} bloqueados para importação</span>`);if(+missing)parts.push(`${fmt(missing)} SKUs do catálogo atual não apareceram neste arquivo e serão preservados`);else parts.push('nenhum SKU atual ficou ausente');e.innerHTML=parts.join(' · ')}

function enhanceStatus(){const e=document.querySelector('#scStatus');if(!e)return;const t=(e.textContent||'').trim();if(t==='Prévia pronta. Itens OK já vêm selecionados; itens “revisar” exigem seleção manual.')e.textContent='Prévia pronta. Os itens validados já estão selecionados. Itens marcados para revisão ficam desmarcados até você conferir.';if(/^Concluído:/i.test(t)){const m=t.match(/Concluído:\s*(\d+) item\(ns\) importados\/atualizados\.\s*(\d+) SKU\(s\) ausentes foram preservados\./i);if(m)e.textContent=`Importação concluída: ${fmt(m[1])} itens foram criados ou atualizados. ${fmt(m[2])} itens que não vieram neste arquivo foram mantidos no catálogo.`}}

function enhanceTable(){const table=document.querySelector('#scTable table');if(!table)return;table.querySelectorAll('tbody tr').forEach(row=>{
  const cells=row.querySelectorAll('td');if(cells.length<9)return;
  // Quantidade: traduz subtexto técnico.
  const q=cells[4];q.querySelectorAll('.muted').forEach(x=>{const k=(x.textContent||'').trim();if(tr[k])x.textContent=tr[k]});
  // Medida: traduz combinações técnicas como unknown / unknown.
  const measure=cells[5];let html=measure.innerHTML;Object.entries(tr).forEach(([k,v])=>{html=html.replace(new RegExp(`\\b${k}\\b`,'g'),v)});measure.innerHTML=html;
  // Validação.
  const val=cells[7];const raw=(val.childNodes[0]?.textContent||'').trim();if(tr[raw])val.childNodes[0].textContent=tr[raw];
  const sit=cells[8];if((sit.textContent||'').trim()==='Atualizar')sit.title='Este SKU já existe para este fornecedor e terá seus dados atualizados.';if((sit.textContent||'').trim()==='Novo')sit.title='Este SKU ainda não existe para este fornecedor e será adicionado.';
})}

function addHelp(){const d=document.querySelector('#supplierCatalogDialog');if(!d||d.querySelector('#scHumanHelp'))return;const anchor=d.querySelector('#scStatus');if(!anchor)return;const box=document.createElement('div');box.id='scHumanHelp';box.className='scm-note';box.style.margin='8px 0 12px';box.innerHTML='<strong>Como interpretar esta tela:</strong> <span class="muted">“Atualizar” significa que o SKU já existe e será atualizado; “Novo” será adicionado. “Não informado” quer dizer que o arquivo antigo não trouxe aquela classificação técnica — isso não impede a atualização dos campos existentes.</span>';anchor.after(box)}

function run(){addHelp();enhanceSummary();enhanceStatus();enhanceTable()}
const mo=new MutationObserver(run);mo.observe(document.documentElement,{subtree:true,childList:true,characterData:true});setInterval(run,700);run();
