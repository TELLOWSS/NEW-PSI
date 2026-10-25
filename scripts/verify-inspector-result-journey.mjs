import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const target=process.env.PSI_QA_BASE_URL,built=process.env.PSI_QA_BUILT==='1',base=target||'http://127.0.0.1:3039';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(h=>h.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=target?null:built?await preview({preview:{host:'127.0.0.1',port:3039,strictPort:true,headers}}):await createServer({server:{host:'127.0.0.1',port:3039,strictPort:true}});if(server&&!built)await server.listen();
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const output='artifacts/audit/inspector-result-journey'+(target?'-deployed':built?'-built':'');await mkdir(output,{recursive:true});const results=[];
const allowed={policy:'free-only',state:'free-project',allowed:true,message:'fixture only',remainingRequests:null,billingCheck:'verified'};
try{
for(const scenario of ['review','short-opinion','rejected','changed-input','print-loading','print-failed']){
 console.log('scenario',scenario);
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write']});const page=await context.newPage();const ops=[],errors=[];let item,photo,bytes,heldStatus,heldPhotoRoute;
 page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);page.on('pageerror',e=>{errors.push(e.message);console.log('pageerror',e.message);});
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.route('https://cdn.tailwindcss.com/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 if(process.env.PSI_QA_KOREAN_FONT)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'}));
 await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
 await page.route('**/__fixture-photo',r=>{if(scenario==='print-loading'){heldPhotoRoute=r;return;}if(scenario==='print-failed')return r.fulfill({status:404,body:'not found'});return r.fulfill({body:bytes,contentType:'image/jpeg'});});
 await page.route('**/api/admin/inspector',async r=>{const b=r.request().postDataJSON();ops.push(b.op);let result={ok:true};
  if(b.op==='ai-status'&&scenario==='waiting'){heldStatus=r;return;}
  if(b.op==='ai-status')Object.assign(result,{ready:scenario!=='unavailable',provider:'gemini',model:'fixture',cost:scenario==='blocked'||scenario==='advanced'?{...allowed,state:'unverified',allowed:false,billingCheck:'not-configured'}:allowed});
  else if(b.op==='create'){item={id:b.id,revision:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'합성 점검',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',photoNotes:{},urgent:false,photoIds:[],analyses:{},reviews:{},actions:[],ocrResults:{}}};result.item=item;}
  else if(b.op==='upload'){bytes=Buffer.from(b.base64,'base64');photo={id:b.photoId,inspection_id:item.id,sha256:createHash('sha256').update(bytes).digest('hex'),mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString(),optimization_receipt:b.optimizationReceipt};result.photo=photo;}
  else if(b.op==='save'){assert.equal(b.expectedRevision,item.revision);item={...item,revision:item.revision+1,document:structuredClone(b.document)};result.item=item;}
  else if(b.op==='analyze-photo'){
   assert.equal(b.expectedRevision,item.revision);
   const analysis={schema_version:'1.1',inspection_id:item.id,photo_id:photo.id,source_photo_sha256:photo.sha256,processing_mode:'PAID_API_APPROVED',observed_facts:[{text:'합성 사진 중앙에 틈새가 보입니다.',visual_basis:'합성 사진 중앙',confidence:'medium'}],ai_hypotheses:[{text:'낙하 위험 검토',reason:'틈새 주변'}],risk_findings:[{observation_index:'0',problem:'발판 틈새 확인 필요',risk:'추락 가능성',action:'현장에서 덮개·난간 상태를 확인하세요.',priority:'immediate'}],requires_confirmation:[{question:'사진 밖 하부 통제 상태는?',why:'사진만으로 확인 불가'}],recommended_controls:[{action:'접근통제 필요성을 검토하세요.',priority:'immediate'}],law_candidate_keywords:[],limitations:['합성 자료 · 실제 현장 아님']};
   item={...item,revision:item.revision+1,document:{...item.document,analyses:{...item.document.analyses,[photo.id]:analysis}}};result.item=item;
  }else if(b.op==='confirm-photo'){
   assert.equal(b.expectedRevision,item.revision);assert.equal(b.photoId,photo.id);
   item={...item,revision:item.revision+1,document:{...item.document,reviews:{...item.document.reviews,[photo.id]:{decision:b.decision,note:b.reviewNote||'점검자가 사진·설명과 분석을 대조하여 확인함',confirmedAt:new Date().toISOString(),actor:'dedicated-admin'}}}};result.item=item;
  }else if(b.op==='complete-materials'){
   assert.equal(b.expectedRevision,item.revision);assert.equal(item.document.reviews[photo.id].decision,'accepted');item={...item,revision:item.revision+1,document:{...item.document,materialCompletion:{revision:item.revision,photoIds:item.document.photoIds,completedAt:new Date().toISOString()}}};result.item=item;
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
 await page.locator('.si-quick').waitFor();await page.evaluate(()=>{window.__printCalls=0;window.__confirmCalls=0;window.print=()=>{window.__printCalls++};window.confirm=()=>{window.__confirmCalls++;return false};});if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
 const source=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=640;c.height=480;c.getContext('2d').fillRect(0,0,640,480);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
 await page.locator('.si-quick input[type=file]').first().setInputFiles({name:'synthetic.jpg',mimeType:'image/jpeg',buffer:source});
 await page.locator('.si-consent-cue').getByText('다음 단계 · 사진 보관 안내 확인').waitFor();
 assert.equal(await page.locator('.si-quick-start').isDisabled(),true,'Consent must not be implicitly accepted');
 assert.equal(await page.locator('.si-quick-start').innerText(),'먼저 사진 보관 안내 확인');
 await page.waitForFunction(()=>document.activeElement?.classList.contains('si-consent-input'));
 await page.waitForFunction(()=>{const el=document.querySelector('.si-quick-consent');if(!el)return false;const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight;});
 if(scenario==='review'){await page.screenshot({path:output+'/first-photo-consent.png'});assert.equal(ops.filter(x=>x==='upload').length,0);}
 await page.locator('.si-quick-consent input').check();
 await page.getByText('확인 완료 · 이제 점검할 수 있습니다',{exact:true}).waitFor();
 assert.equal(await page.locator('.si-quick-start').isDisabled(),false);
 await page.locator('.si-photo-hint summary').click();await page.locator('.si-quick textarea').first().fill('직접 확인한 발판 틈새.');
 await page.locator('.si-quick-start').click();const journey=page.getByRole('region',{name:'점검 다음 단계'});await journey.waitFor();
 assert.equal(ops.filter(x=>x==='analyze-photo').length,1);assert.equal(ops.filter(x=>x==='confirm-photo').length,0);
 assert.equal(await journey.getByRole('button',{name:'현장 대조 후 검토 저장',exact:true}).count(),1);
 assert.equal(await page.locator('.si-photo-action-entry').count(),0,'Duplicate result-page primary action');
 assert.equal(await page.locator('.si-quick-finish').getByRole('button',{name:'확인하고 다음 사진',exact:true}).isDisabled(),true);
 if(scenario==='changed-input'){
  await page.getByRole('button',{name:'사진·설명 수정',exact:true}).click();await page.locator('#si-quick-note').fill('수정한 설명을 아직 저장하지 않았습니다.');
  await journey.getByRole('button',{name:'수정한 설명 확인하기',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='si-quick-note');
  assert.equal(item.document.photoNotes[photo.id],'직접 확인한 발판 틈새.');assert.equal(ops.filter(x=>x==='confirm-photo').length,0);assert.equal(ops.filter(x=>x==='report').length,0);
 }else{
  if(scenario==='short-opinion'||scenario==='rejected'){
   await page.getByRole('button',{name:'판단·조치 보완',exact:true}).click();
   if(scenario==='rejected')await page.getByRole('radio',{name:'AI 해석과 다름',exact:true}).check();else await page.locator('#si-expert-note').fill('짧음');
   await journey.getByRole('button',{name:'검토 의견 보완하기',exact:true}).click();await page.waitForFunction(()=>document.activeElement?.id==='si-expert-note');assert.equal(await page.getByRole('button',{name:'검토만 저장',exact:true}).isDisabled(),true);
   await page.locator('#si-expert-note').fill('현장에서 확인한 상태를 직접 기록합니다.');
  }
  await journey.getByRole('button',{name:'현장 대조 후 검토 저장',exact:true}).click();await journey.getByRole('button',{name:'보고서로 기록하기',exact:true}).waitFor();
  assert.equal(ops.filter(x=>x==='confirm-photo').length,1);assert.equal(ops.filter(x=>x==='analyze-photo').length,1);assert.equal(item.document.reviews[photo.id].decision,scenario==='rejected'?'rejected':'accepted');
  await journey.screenshot({path:`${output}/${scenario}-guide.png`});await journey.getByRole('button',{name:'보고서로 기록하기',exact:true}).click();await page.locator('.si-report').waitFor();await page.waitForFunction(()=>document.activeElement?.classList.contains('si-report'));const reportTop=await page.locator('.si-report').evaluate(e=>e.getBoundingClientRect().top);assert.ok(reportTop>=-10&&reportTop<480,`New report should be visible after creation, got top=${reportTop}`);
  assert.equal(ops.filter(x=>x==='report').length,1);assert.equal(ops.filter(x=>x==='upload').length,1);assert.ok((await page.locator('.si-report').innerText()).includes('직접 확인한 발판 틈새.'));
  const print=page.locator('.si-quick-print .si-primary');
  if(scenario==='print-loading'){
   await page.locator('[data-report-photo-state="loading"]').waitFor();
   assert.equal(await print.isDisabled(),true,'Print must wait for evidence photo');
   for(let n=0;n<30&&!heldPhotoRoute;n++)await page.waitForTimeout(100);
   assert.ok(heldPhotoRoute,'Expected delayed photo fetch');
   await page.screenshot({path:output+'/print-loading-blocked.png'});
   await heldPhotoRoute.fulfill({body:bytes,contentType:'image/jpeg'});
   await page.locator('[data-report-photo-state="ready"]').waitFor();
   assert.equal(await print.isDisabled(),false);
   await print.click();assert.equal(await page.evaluate(()=>window.__printCalls),1);
  }else if(scenario==='print-failed'){
   await page.locator('[data-report-photo-state="failed"]').waitFor();
   assert.equal(await print.isDisabled(),false);
   await print.click();assert.deepEqual(await page.evaluate(()=>[window.__confirmCalls,window.__printCalls]),[1,0]);
   await page.evaluate(()=>{window.confirm=()=>{window.__confirmCalls++;return true};});
   await print.click();assert.deepEqual(await page.evaluate(()=>[window.__confirmCalls,window.__printCalls]),[2,1]);
   assert.match(await page.locator('.si-report-readers-guide').innerText(),/불러오지 못/);
  }else{
   await page.locator('[data-report-photo-state="ready"]').waitFor();
   assert.equal(await print.isDisabled(),false);
  }

 }
 for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,scenario+' overflow '+width);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/${scenario}.png`,fullPage:true});assert.deepEqual(errors,[]);results.push({scenario,ops,passed:true});await context.close();
}
await writeFile(output+'/results.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({scenario,passed})=>({scenario,passed}))));
}finally{await browser.close();if(server)await server.close();}
