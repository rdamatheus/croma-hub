const user='10000000-0000-4000-8000-000000000001';
const manager='10000000-0000-4000-8000-000000000003';
export const STORAGE_BUCKET='fake-private-bucket';
const state=window.__labState={
  profiles:[{id:user,nome:'Equipe de teste',role:'equipe',ativo:true},{id:manager,nome:'Gerencia de teste',role:'manager',ativo:true}],
  lab_whatsapp_atendimentos:window.__labSeed || [],lab_whatsapp_mensagens:[],lab_whatsapp_anexos:[],lab_whatsapp_analises:[],calls:[]
};
class Query{
  constructor(table){this.table=table;this.filters=[];this.operation='select';}
  select(){return this;} eq(key,value){this.filters.push([key,value]);return this;}
  order(key,options={}){this.sort={key,ascending:options.ascending!==false};return this;}
  limit(value){this.max=value;return this;}
  insert(value){this.operation='insert';this.value=value;return this;}
  update(value){this.operation='update';this.value=value;return this;}
  delete(){this.operation='delete';return this;}
  execute(){
    state.calls.push([this.operation,this.table]);
    let rows=(state[this.table] || []).filter(row=>this.filters.every(([key,value])=>row[key]===value));
    if(this.operation==='insert'){
      rows=(Array.isArray(this.value)?this.value:[this.value]).map(row=>({id:crypto.randomUUID(),created_at:new Date().toISOString(),status:'novo',category:null,priority:'normal',workflow_status:'novo',...row}));
      state[this.table].push(...rows);
    }
    if(this.operation==='update') for(const row of rows) Object.assign(row,this.value);
    if(this.operation==='delete'){
      state[this.table]=state[this.table].filter(row=>!rows.includes(row));
      if(this.table==='lab_whatsapp_atendimentos') for(const table of ['lab_whatsapp_mensagens','lab_whatsapp_anexos','lab_whatsapp_analises'])
        state[table]=state[table].filter(row=>!rows.some(parent=>parent.id===row.atendimento_id));
    }
    if(this.sort) rows.sort((a,b)=>String(a[this.sort.key]).localeCompare(String(b[this.sort.key]))*(this.sort.ascending?1:-1));
    if(this.max) rows=rows.slice(0,this.max);
    return {data:rows.map(row=>({...row,lab_whatsapp_anexos:[{count:0}]})),error:null};
  }
  then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject);}
  async maybeSingle(){const result=this.execute();return {...result,data:result.data[0] || null};}
  single(){return this.maybeSingle();}
}
export const supabase={
  from:table=>new Query(table),
  async rpc(name,input){
    state.calls.push(['rpc',name,input]);
    if(name!=='save_lab_whatsapp_manual_test') throw Error('Unexpected RPC');
    const existing=state.lab_whatsapp_atendimentos.find(row=>row.input_key===input.p_input_key);
    if(existing) return {data:existing.id,error:null};
    const id=crypto.randomUUID();
    state.lab_whatsapp_atendimentos.push({id,created_by:user,contact_name:input.p_contact_name,contact_phone:input.p_contact_phone,
      source:input.p_source,message_count:1,input_key:input.p_input_key,status:'novo',workflow_status:'novo',category:null,priority:'normal',created_at:new Date().toISOString()});
    state.lab_whatsapp_mensagens.push({id:crypto.randomUUID(),atendimento_id:id,author:input.p_contact_name,direction:'recebida',body:input.p_body,sequence:1});
    return {data:id,error:null};
  },
  functions:{async invoke(name,{body}){
    state.calls.push(['invoke',name,body]);
    const count=state.lab_whatsapp_analises.length+1;
    const atendimento=state.lab_whatsapp_atendimentos.find(row=>row.id===body.atendimento_id);
    if(window.__labFailAnalysis){
      state.lab_whatsapp_analises.push({id:crypto.randomUUID(),atendimento_id:atendimento.id,status:'erro',error:'Falha simulada',created_at:new Date().toISOString()});
      return {data:null,error:{message:'Mock failure',context:Response.json({error:'Falha simulada',request_completed:true})}};
    }
    const analysis={resumo:`Analise ${count}: pedido de 500 cartoes.`,pedido_cliente:['500 cartoes'],especificacoes:[],pendencias:['Confirmar material'],tarefas_internas:[],
      resposta_sugerida:'Qual material voce deseja para os cartoes?',categoria_sugerida:'orcamento',prioridade_sugerida:'urgente',tags:['recompra','urgente','falta_informacao'],
      dados_extraidos:{produto:'Cartao de visita',quantidade:500,medidas:null,material:null,acabamento:null,prazo_solicitado:'amanha',forma_recebimento:null},dados_faltantes:['Material'],erros_anexos:[]};
    atendimento.analysis=analysis;atendimento.status='concluido';
    state.lab_whatsapp_analises.push({id:crypto.randomUUID(),atendimento_id:atendimento.id,status:'concluida',result:analysis,created_at:new Date().toISOString(),finished_at:new Date().toISOString()});
    return {data:{analysis,processed_attachments:0,attachment_errors:[]},error:null};
  }},
  storage:{from(){throw Error('Storage was not requested by this test');}}
};
