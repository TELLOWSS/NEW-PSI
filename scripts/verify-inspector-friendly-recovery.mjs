import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const target=process.env.PSI_QA_BASE_URL,built=process.env.PSI_QA_BUILT==='1',base=target||'http://127.0.0.1:3039';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=target?null:built?await preview({preview:{host:'127.0.0.1',port:3039,strictPort:true,headers}}):await createServer({server:{host:'127.0.0.1',port:3039,strictPort:true}});if(server&&!built)await server.listen();
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const output='artifacts/audit/inspector-friendly-recovery'+(target?'-deployed':built?'-built':'');await mkdir(output,{recursive:true});const results=[];
const allowed={policy:'free-only',state:'free-project',allowed:true,message:'fixture only',remainingRequests:null,billingCheck:'verified'};
try{
for(const scenario of ['blocked','unavailable','retry','quota','settings','unknown','copy-fallback','advanced','waiting']){
 if(process.env.PSI_RECOVERY_SCENARIOS&&!process.env.PSI_RECOVERY_SCENARIOS.split(',').includes(scenario))continue;
 console.log('scenario',scenario);
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const ops=[],errors=[];let item,photo,bytes,heldStatus;
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 if(process.env.PSI_QA_KOREAN_FONT)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'}));
 await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
 await page.route('**/__fixture-photo',r=>r.fulfill({body:bytes,contentType:'image/jpeg'}));
 await page.route('**/api/admin/inspector',async r=>{const b=r.request().postDataJSON();ops.push(b.op);let result={ok:true};
  if(b.op==='ai-status'&&scenario==='waiting'){heldStatus=r;return;}
  if(b.op==='ai-status')Object.assign(result,{ready:scenario!=='unavailable',provider:'gemini',model:'fixture',cost:scenario==='blocked'||scenario==='advanced'?{...allowed,state:'unverified',allowed:false,billingCheck:'not-configured'}:allowed});
  else if(b.op==='create'){item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'합성 점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',photoNotes:{},urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}};result.item=item;}
  else if(b.op==='upload'){bytes=Buffer.from(b.base64,'base64');photo={id:b.photoId,inspection_id:item.id,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};result.photo=photo;}
  else if(b.op==='save'){assert.equal(b.expectedRevision,item.revision);item={...item,revision:item.revision+1,document:structuredClone(b.document)};result.item=item;}
  else if(b.op==='analyze-photo'){
   if(scenario==='unknown'){await r.abort();return;}
   const code=scenario==='quota'?'AI_QUOTA_REACHED':scenario==='settings'?'AI_AUTH_REJECTED':'AI_CONNECTION_FAILED';await r.fulfill({status:409,json:{ok:false,code,retryable:code!=='AI_AUTH_REJECTED',message:'RAW_PROVIDER_PRIVATE_DO_NOT_SHOW'}});return;
  }else if(b.op==='detail')Object.assign(result,{item,evidence:photo?[photo]:[],control:{state:'active'}});
  else if(b.op==='list')result.items=item?[{id:item.id,title:item.document.title,created_at:item.created_at,updated_at:item.updated_at,revision:item.revision,photo_count:1,open_actions:0,needs_review:false}]:[];
  else if(b.op==='photo')result.url=base+'/__fixture-photo';
  else if(b.op==='usage')result.usage={projectBytes:100,uploadCeilingBytes:900000000};
  else if(['reports','events'].includes(b.op))result.items=[];
  else if(b.op==='report'){
   result.report={id:crypto.randomUUID(),inspection_id:item.id,inspection_revision:item.revision,created_at:new Date().toISOString(),snapshot_sha256:'fixture-snapshot',snapshot:{inspection:structuredClone(item),evidence:[photo],generatedAt:new Date().toISOString(),legalStatus:'UNVERIFIED',reportStatus:'DRAFT'}};
  }else throw new Error('Unexpected fixture operation: '+b.op);
  await r.fulfill({json:result});
 });
 await page.goto(base+'/?mode=photo-inspector',{waitUntil:'domcontentloaded'});
 await page.locator('.si-quick').waitFor();if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
 const source=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
 await page.locator('.si-quick input[type=file]').first().setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:source});
 await page.locator('.si-quick-consent input').check();await page.locator('.si-photo-hint summary').click();await page.locator('.si-quick textarea').first().fill('직접 확인한 발판 틈새.');
 if(['blocked','unavailable','advanced','waiting'].includes(scenario)){
  const help=page.locator('.si-cost-notice .si-analysis-help');const manual=page.getByRole('button',{name:'AI 없이 사진 저장 · 직접 점검 계속하기',exact:true});if(await manual.isVisible()){await page.screenshot({path:`${output}/${scenario}-notice.png`,fullPage:true});await manual.click();}else{await help.screenshot({path:`${output}/${scenario}-notice.png`});await help.getByRole('button',{name:'직접 점검 계속하기',exact:true}).click();}await page.locator('.si-quick-result').waitFor();if(scenario==='waiting'){await page.getByRole('button',{name:'사진·설명 수정',exact:true}).click();await page.locator('.si-quick-start:not(:disabled)').waitFor();await heldStatus.fulfill({json:{ok:true,ready:true,provider:'gemini',model:'fixture',cost:allowed}});}
  assert.equal(ops.filter(x=>x==='analyze-photo').length,0);assert.equal(item.document.apiEnabled,false);assert.equal(item.document.photoNotes[photo.id],'직접 확인한 발판 틈새.');
 }else{
  await page.locator('.si-quick-start').click();const help=page.locator('.si-quick-error .si-analysis-help');await help.waitFor();await help.screenshot({path:`${output}/${scenario}-notice.png`});assert.equal(ops.filter(x=>x==='analyze-photo').length,1);assert.equal(await page.getByText('RAW_PROVIDER_PRIVATE_DO_NOT_SHOW',{exact:true}).count(),0);assert.equal(await help.getByText('사진과 설명은 저장되어 있습니다. 같은 사진을 다시 올릴 필요가 없습니다.',{exact:true}).count(),1);
  if(scenario==='retry'){assert.equal(await help.getByRole('button',{name:'사진 분석 다시 시도',exact:true}).count(),1);await help.getByRole('button',{name:'사진 분석 다시 시도',exact:true}).click();await help.waitFor();await help.screenshot({path:`${output}/${scenario}-notice.png`});assert.equal(ops.filter(x=>x==='analyze-photo').length,2);assert.equal(ops.filter(x=>x==='upload').length,1);}
  if(scenario==='quota'){assert.equal(await help.getByRole('button',{name:'사진 분석 다시 시도',exact:true}).count(),0);await help.getByText(/다시 사용할 수 있는 시각은 확인되지 않았습니다/).waitFor();}
  if(scenario==='settings'){assert.equal(await help.getByRole('button',{name:'사진 분석 다시 시도',exact:true}).count(),0);await help.getByText(/사용자가 설정을 바꿀 필요는 없습니다/).waitFor();}
  if(scenario==='unknown'){assert.equal(await help.getByRole('button',{name:'직접 점검 계속하기',exact:true}).count(),0);await help.getByRole('button',{name:'저장 결과 먼저 확인',exact:true}).click();await page.getByRole('alert').filter({hasText:'저장된 분석 결과가 아직 없습니다'}).waitFor();assert.equal(ops.filter(x=>x==='analyze-photo').length,1);}
  if(scenario==='copy-fallback')await page.evaluate(()=>{Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new Error('denied');}});});
  await help.getByRole('button',{name:'관리자에게 전달할 안내 복사',exact:true}).click();const text=await help.getByRole('textbox',{name:'관리자에게 전달할 안내'}).inputValue();assert.ok(!text.includes('직접 확인한')&&!text.includes('RAW_PROVIDER')&&!text.includes(photo.id));
  if(scenario==='unknown')assert.equal(await help.getByRole('button',{name:'직접 점검 계속하기',exact:true}).count(),1);
  {await help.getByRole('button',{name:'직접 점검 계속하기',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.si-quick fieldset')?.disabled);assert.equal(item.document.apiEnabled,false);assert.equal(ops.filter(x=>x==='upload').length,1);}
 }
 if(scenario==='blocked'){await page.getByRole('region',{name:'점검 다음 단계'}).getByRole('button',{name:'보고서로 기록하기',exact:true}).click();await page.locator('.si-report').waitFor();await page.locator('.si-report img').first().waitFor();assert.equal(ops.filter(x=>x==='analyze-photo').length,0);assert.equal(ops.filter(x=>x==='report').length,1);assert.ok((await page.locator('.si-report').innerText()).includes('직접 확인한 발판 틈새.'));}
 if(scenario==='advanced'){
  await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();await page.locator('.si-record').first().waitFor({timeout:1000}).catch(()=>{});
  // Open the saved fixture through the actual records list.
  await page.locator('.si-list').getByRole('button').filter({hasText:'사진 현장점검'}).first().click();
  await page.locator('.si-tabs button').filter({hasText:'관찰·사실 검토'}).click();const help=page.locator('.si-analysis-input .si-analysis-help');await help.waitFor();await help.getByRole('button',{name:'직접 점검 계속하기',exact:true}).click();await page.locator('.si-quick').waitFor();console.log('quick ready');assert.equal(item.document.apiEnabled,false);assert.equal(ops.filter(x=>x==='analyze-photo').length,0);
 }
 for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,scenario+' overflow '+width);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/${scenario}.png`,fullPage:true});assert.deepEqual(errors,[]);results.push({scenario,ops,passed:true});await context.close();
}
await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({scenario,passed})=>({scenario,passed}))));
}finally{await browser.close();if(server)await server.close();}
