'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const page=fs.readFileSync(path.join(root,'interno/projetos/detalhe/index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'js/interno-projeto-detalhe.js'),'utf8');
test('projeto vivo permanece uma única página, com extensão opcional',()=>{
  assert.match(page,/id="execution-context" hidden/);
  for(const id of ['execution-links','execution-deliverables','execution-pending'])
    assert.match(page,new RegExp('id="'+id+'"'));
  assert.match(controller,/renderExecution\(project\)/);
  assert.match(controller,/project\.project_type==='client'/);
  assert.match(controller,/\.select\('id,slug,name,description,project_type,/);
});
test('execução não cria OS nem duplica tabelas e valida URLs externas',()=>{
  assert.match(controller,/safeUrl\(order\.url\)/);
  assert.match(controller,/noopener noreferrer/);
  assert.doesNotMatch(controller,/\.from\('(?:orders|order_items)'\)/);
  assert.doesNotMatch(controller,/\.insert\(|\.update\(|\.delete\(/);
});
