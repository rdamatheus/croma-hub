// Analise deterministica de continuidade. Sem IA externa, sem gravacoes.
export function analisarContinuidades(tarefas, eventos, agora = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
  }).format(agora);
  const now = agora.getTime();
  const DAY = 86400000;
  const abertas = (tarefas || []).filter(t => ['pendente','em_andamento'].includes(t.status));
  const alertas = [];
  const vista = new Set();
  const add = (id, gravidade, titulo, detalhe) => {
    if (vista.has(id)) return;
    vista.add(id);
    alertas.push({id, gravidade, titulo, detalhe});
  };
  const rotulo = t => String(t.titulo || 'Tarefa sem título');
  const daysOld = date => {
    if (!date) return null;
    const ms = Date.parse(date);
    return Number.isFinite(ms) ? Math.floor((now - ms) / DAY) : null;
  };
  for (const t of abertas) {
    if (t.data_limite && t.data_limite < today) {
      add('prazo:'+t.id,'critica', 'Prazo vencido: '+rotulo(t),
        'Prazo registrado: '+t.data_limite+'; confirmar se permanece pendente');
    }
  }
  for (const t of abertas) {
    if (vista.has('prazo:'+t.id)) continue;
    const idade = daysOld(t.updated_at);
    if (t.status === 'em_andamento' && idade !== null && idade >= 7) {
      add('sem-atualizacao:'+t.id,'alta', 'Sem atualização há '+idade+' dias: '+rotulo(t),
        'Confirmar andamento real, bloqueios e próximo passo');
    } else if (t.status === 'em_andamento' && !t.descricao && !t.data_limite) {
      add('sem-proximo-passo:'+t.id,'media', 'Definir próximo passo: '+rotulo(t),
        'Em andamento, sem descrição nem prazo');
    }
  }
  const supersedidos = new Set((eventos || []).map(r=>r.supersedes_id).filter(Boolean));
  for (const r of eventos || []) {
    if (r.kind==='decisao' && r.state==='proposto' && !supersedidos.has(r.id)) {
      add('decisao:'+r.id,'alta','Decisão aguardando aprovação: '+String(r.title || 'Sem título'),
        'Verificar autorização explícita antes de qualquer mudança');
    }
  }
  const bloqueios = (eventos || []).filter(r=>r.kind==='bloqueio');
  if (bloqueios.length) {
    add('historico-bloqueios','media',bloqueios.length+' bloqueio(s) registrados no histórico',
      'Verificar quais continuam abertos; eventos antigos não comprovam bloqueio atual');
  }
  const rank={critica:0,alta:1,media:2};
  alertas.sort((a,b)=>rank[a.gravidade]-rank[b.gravidade]);
  return {
    alertas:alertas.slice(0,5),
    restantes:Math.max(0,alertas.length-5),
    abertas:abertas.length,
    vencidas:abertas.filter(t=>t.data_limite&&t.data_limite<today).length,
    decisoesPendentes:(eventos||[]).filter(r=>r.kind==='decisao'&&r.state==='proposto'&&!supersedidos.has(r.id)).length
  };
}
