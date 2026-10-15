const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
let chromium;
try{({chromium}=require(require.resolve('playwright',{paths:[process.env.CROMA_TEST_NODE_MODULES,process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES,__dirname].filter(Boolean)})));}catch{}
const root=path.join(__dirname,'..');
const creator='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';

test('Desktop and mobile support a simulated test, human review, history and failure recovery', {skip:!chromium,timeout:60000}, async()=>{
  const server=http.createServer((req,res)=>{
    let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    try{if(fs.statSync(file).isDirectory())file=path.join(file,'index.html');const content=fs.readFileSync(file);
      res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(content);
    }catch{res.writeHead(404);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  let browser;
  const contextFor=async(viewport,session,seed=[])=>{
    const context=await browser.newContext({viewport});
    await context.addInitScript(({session,seed})=>{window.__labSession=session;window.__labSeed=seed;},{session,seed});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(!url.href.startsWith(base)) return route.abort();
      if(url.pathname==='/js/croma-supabase.js') return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'fixtures/whatsapp-lab-browser.js'),'utf8')});
      if(url.pathname==='/js/interno-auth.js') return route.fulfill({contentType:'text/javascript',body:`export const roleLabel=()=> 'Equipe'; export async function protectInternalPage(){const s=window.__labSession;if(!s?.profile?.ativo)return null;document.body.hidden=false;return s;}`});
      return route.continue();
    });
    return context;
  };
  try{
    const launch={headless:true,args:['--no-sandbox']};
    if(process.env.CROMA_TEST_CHROMIUM){launch.executablePath=process.env.CROMA_TEST_CHROMIUM;launch.args.push('--no-zygote');}
    browser=await chromium.launch(launch);
    for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:740}]){
      const context=await contextFor(viewport,{user:{id:creator},profile:{id:creator,nome:'Equipe de teste',role:'equipe',ativo:true}});
      const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
      assert.equal((await page.goto(base+'/interno/whatsapp-lab/')).status(),200);
      await page.waitForFunction(()=>document.body.hidden===false && window.__labState?.calls.length>0);
      await page.locator('#loadExample').click();
      assert.match(await page.locator('#manualBody').inputValue(),/500/);
      assert.equal(await page.evaluate(()=>window.__labState.calls.filter(c=>c[0]==='invoke').length),0);
      await page.locator('#saveTest').click();
      await page.waitForFunction(()=>window.__labState.lab_whatsapp_atendimentos.length===1 && document.querySelector('#reviewForm').classList.contains('hidden')===false);
      assert.equal(await page.locator('#reviewCategory').inputValue(),'');
      await page.locator('[data-process]').click();
      await page.waitForFunction(()=>window.__labState.lab_whatsapp_analises.length===1 && !document.querySelector('#analysisBox').classList.contains('hidden'));
      assert.equal(await page.locator('#reviewCategory').inputValue(),'');
      assert.equal(await page.locator('#reviewWorkflow').inputValue(),'novo');
      await page.locator('#useSuggestion').click();
      assert.equal(await page.evaluate(()=>window.__labState.lab_whatsapp_atendimentos[0].category),null);
      await page.locator('#reviewCategory').selectOption('arte_arquivo');
      await page.locator('#reviewWorkflow').selectOption('aguardando_cliente');
      await page.locator('#saveReview').click();
      await page.waitForFunction(()=>document.querySelector('#reviewStatus').textContent==='Revisão salva.');
      await page.locator('[data-process]').click();
      await page.waitForFunction(()=>document.querySelectorAll('#analysisHistory details').length===2);
      assert.equal(await page.locator('#reviewCategory').inputValue(),'arte_arquivo');
      assert.equal(await page.locator('#reviewWorkflow').inputValue(),'aguardando_cliente');
      await page.evaluate(()=>{window.__labFailAnalysis=true;});
      await page.locator('[data-process]').click();
      await page.waitForFunction(()=>document.querySelectorAll('#analysisHistory details').length===3);
      assert.match(await page.locator('#analysisSummary').textContent(),/Analise 2/);
      assert.equal(await page.locator('#reviewWorkflow').inputValue(),'aguardando_cliente');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      assert.deepEqual(errors,[]);
      if(process.env.CROMA_QA_DIR){
        fs.mkdirSync(process.env.CROMA_QA_DIR,{recursive:true});
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:path.join(process.env.CROMA_QA_DIR,`whatsapp-lab-${viewport.width}.png`),fullPage:true});
      }
      await page.locator('#importMode').click();
      await page.locator('#jsonFile').setInputFiles({name:'fictitious-chat.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({chat:{name:'Cliente legado ficticio'},messages:[{id:'legacy-message',author:'Cliente ficticio',text:'Mensagem importada',direction:'recebida'}]}))});
      await page.locator('#saveTest').click();
      await page.waitForFunction(()=>window.__labState.lab_whatsapp_atendimentos.length===2 && document.querySelector('#formStatus').textContent.includes('Atendimento salvo'));
      assert.equal(await page.evaluate(()=>window.__labState.lab_whatsapp_mensagens[1].body),'Mensagem importada');
      await context.close();
    }
    const signedOut=await contextFor({width:390,height:844},null);
    const anonymous=await signedOut.newPage();await anonymous.goto(base+'/interno/whatsapp-lab/');
    await anonymous.waitForFunction(()=>!!window.__labState);
    assert.equal(await anonymous.evaluate(()=>document.body.hidden),true);
    assert.equal(await anonymous.evaluate(()=>window.__labState.calls.length),0);await signedOut.close();
    const readOnly=await contextFor({width:390,height:844},{user:{id:other},profile:{id:other,role:'equipe',ativo:true}},
      [{id:'20000000-0000-4000-8000-000000000001',created_by:creator,contact_name:'Outro teste ficticio',message_count:0,status:'novo',created_at:new Date().toISOString()}]);
    const staff=await readOnly.newPage();await staff.goto(base+'/interno/whatsapp-lab/');
    await staff.waitForSelector('[data-process]');assert.equal(await staff.locator('[data-process]').isDisabled(),true);
    await staff.locator('[data-view]').click();await staff.waitForSelector('#reviewForm:not(.hidden)');
    assert.equal(await staff.locator('#saveReview').isDisabled(),true);await readOnly.close();
  }finally{
    if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));
  }
});
