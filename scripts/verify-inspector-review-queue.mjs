import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const external=process.env.PSI_REVIEW_BASE,dist=process.env.PSI_REVIEW_DIST,base=external||'http://127.0.0.1:3036',out=process.env.PSI_REVIEW_OUT||'artifacts/audit/inspector-review-queue';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=external?null:dist?await preview({build:{outDir:dist},preview:{host:'127.0.0.1',port:3036,strictPort:true,headers}}):await createServer({server:{host:'127.0.0.1',port:3036,strictPort:true,headers}});if(server&&!dist)await server.listen();
let proxy;if(external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH,...(proxy?{proxy}:{})});await mkdir(out,{recursive:true});const results=[];
console.log('Browser ready');
try{for(const scenario of ['continuous','rejected','short-opinion','save-failed','lost-response','corrupt-next','dirty-hint']){
 console.log('START '+scenario);
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',ignoreHTTPSErrors:!!external}),page=await context.newPage(),id=randomUUID(),pids=Array.from({length:5},()=>randomUUID()),errors=[],ops=[];
 page.on('pageerror',e=>errors.push(e.message));
 const bytes=await page.evaluate(()=>[0,1,2,3,4].map(i=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle=['#468','#285','#b65','#739','#333'][i];g.fillRect(0,0,400,300);return c.toDataURL('image/jpeg').split(',')[1];}));
 const images=new Map(pids.map((pid,n)=>[pid,Buffer.from(bytes[n],'base64')]));const evidence=pids.map(pid=>({id:pid,inspection_id:id,sha256:createHash('sha256').update(images.get(pid)).digest('hex'),byte_size:images.get(pid).length,mime_type:'image/jpeg',created_at:'2026-10-23T00:00:00Z'}));
 const analysis=(n,priority)=>({schema_version:'1.1',inspection_id:id,photo_id:pids[n],source_photo_sha256:evidence[n].sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'합성 사진의 방호 상태를 확인할 필요',visual_basis:'사진 중앙',confidence:'medium'}],risk_findings:[{observation_index:'0',problem:['현재 사진 단서','나중 검토 단서','먼저 검토할 개구부 단서'][n],risk:'통행 중 접촉 가능성',action:'접근 통제와 방호 상태 확인',priority}],recommended_controls:[],requires_confirmation:[],ai_hypotheses:[],law_candidate_keywords:[],limitations:['합성 검증용 · 실제 현장 아님']});
 let item={id,revision:7,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T00:00:00Z',document:{title:'합성 연속 검토',siteName:'',location:'',workType:'',eventAt:'2026-10-23T00:00:00Z',notes:'',urgent:false,apiEnabled:false,photoIds:pids,photoNotes:Object.fromEntries(pids.map(pid=>[pid,''])),analyses:{[pids[0]]:analysis(0,'routine'),[pids[1]]:analysis(1,'soon'),[pids[2]]:analysis(2,'immediate')},reviews:{},actions:[{id:randomUUID(),title:'기존 개선 요청',owner:'합성 담당',dueDate:'2026-10-30',status:'review-requested',sourcePhotoIds:[pids[0]],completionPhotoId:pids[4],note:'합성 증빙'}],ocrResults:{}}};const original=structuredClone(item);let confirms=0;
 await context.addInitScript(({id,pid})=>{sessionStorage.setItem('psi.inspector.quick.last.v1',id);sessionStorage.setItem('psi.inspector.quick.review-position.v1',JSON.stringify({inspectionId:id,photoId:pid}));},{id,pid:pids[0]});
 await page.route('**/*',async r=>{
  const u=new URL(r.request().url());if(u.protocol==='blob:')return r.continue();if(u.pathname==='/__qa-korean.otf')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});
  if(u.origin!==base)return r.fulfill({body:'',contentType:'text/css'});
  if(u.pathname.startsWith('/__review-photo/'))return r.fulfill({body:images.get(scenario==='corrupt-next'&&u.pathname.endsWith(pids[2])?pids[0]:u.pathname.split('/').pop()),contentType:'image/jpeg'});
  if(u.pathname==='/api/admin/auth')return r.fulfill({json:{ok:true,authenticated:true}});
  if(u.pathname!=='/api/admin/inspector')return r.continue();const b=r.request().postDataJSON();ops.push(b);
  if(b.op==='ai-status')return r.fulfill({json:{ok:true,ready:true,provider:'gemini',model:'fixture'}});
  if(b.op==='detail')return r.fulfill({json:{ok:true,item,evidence,reports:[],control:{state:'active'}}});
  if(b.op==='photo'){assert.equal(b.id,id);return r.fulfill({json:{ok:true,url:base+'/__review-photo/'+b.photoId}});}
  if(b.op==='confirm-photo'){
   confirms++;assert.equal(b.expectedRevision,item.revision);assert.ok(item.document.analyses[b.photoId]);
   if(scenario==='save-failed')return r.fulfill({status:503,json:{ok:false,message:'합성 검토 저장 실패'}});
   item=structuredClone(item);item.revision++;item.document.reviews[b.photoId]={decision:b.decision,note:b.reviewNote?.trim()||'점검자가 사진·설명과 분석을 대조하여 확인함',confirmedAt:'2026-10-23T01:00:00Z',actor:'dedicated-admin'};
   if(scenario==='lost-response'&&confirms===1)return r.fulfill({status:503,json:{ok:false,message:'합성 응답 유실'}});
   return r.fulfill({json:{ok:true,item}});
  }
  errors.push('Unexpected operation '+b.op);return r.fulfill({status:503,json:{ok:false,message:'Unexpected mutation blocked'}});
 });
 console.log('Loading '+scenario);
 await page.goto(base+'/?mode=photo-inspector');await page.getByRole('button',{name:'이전 점검 이어하기',exact:true}).click();await page.getByLabel('핵심 답변').waitFor();const nav=page.getByRole('region',{name:'위험 단서 우선 연속 검토'}),go=nav.getByRole('button',{name:'검토 저장 · 다음 대기',exact:true});
 assert.match(await nav.innerText(),/사진 3 · 우선 통제 검토/);assert.match(await nav.innerText(),/먼저 검토할 개구부 단서/);assert.match(await nav.innerText(),/AI 검토 대기 3장/);
 if(['rejected','short-opinion'].includes(scenario)){const review=page.getByLabel('전문가 판단 보완');await review.getByRole('button',{name:'판단·조치 보완'}).click();await review.getByLabel('AI 해석과 다름',{exact:true}).check();await review.locator('textarea').fill(scenario==='short-opinion'?'다름':'현장 확인한 방호 상태가 AI 해석과 다름');}
 if(scenario==='dirty-hint'){await page.getByRole('button',{name:'사진·설명 수정',exact:true}).click();await page.locator('.si-photo-hint summary').click();await page.locator('#si-quick-note').fill('저장 전 현장 설명');assert.equal(await go.isDisabled(),true);assert.equal(confirms,0);}
 else{
  await go.click();
  if(['short-opinion','save-failed','corrupt-next'].includes(scenario)){
   await page.getByRole('alert').waitFor();assert.match(await page.getByLabel('핵심 답변').innerText(),/현재 사진 단서/);
   assert.equal(confirms,scenario==='short-opinion'?0:1);assert.equal(Object.keys(item.document.reviews).length,scenario==='corrupt-next'?1:0);
   assert.equal(JSON.parse(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.quick.review-position.v1'))).photoId,pids[0]);
  }else{
   await page.getByLabel('핵심 답변').getByRole('heading',{name:'먼저 검토할 개구부 단서',exact:true}).waitFor({timeout:6000}).catch(async e=>{console.log(JSON.stringify({ops,errors,body:await page.locator('body').innerText()}));await page.screenshot({path:out+'/failed.png',fullPage:true});throw e;});assert.equal(confirms,1);assert.equal(item.document.reviews[pids[0]].decision,scenario==='rejected'?'rejected':'accepted');
   assert.equal(await page.getByText('검토 저장 전',{exact:true}).count(),1);assert.equal(JSON.parse(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.quick.review-position.v1'))).photoId,pids[2]);
   assert.match(await nav.innerText(),/AI 검토 대기 2장/);await page.waitForFunction(async()=>{try{const img=document.querySelector('.si-input-recap img');if(!img?.src)return false;await img.decode();const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.drawImage(img,0,0);const pixel=g.getImageData(200,150,1,1).data;return Math.abs(pixel[0]-187)<5&&Math.abs(pixel[1]-102)<5&&Math.abs(pixel[2]-85)<5;}catch{return false;}});
   if(scenario==='continuous'){
    await go.click();await page.getByLabel('핵심 답변').getByRole('heading',{name:'나중 검토 단서',exact:true}).waitFor();assert.equal(confirms,2);assert.match(await nav.innerText(),/AI 검토 대기 1장/);assert.equal(await go.count(),0);
   }
  }
 }
 assert.deepEqual(item.document.actions,original.document.actions);assert.deepEqual(item.document.analyses,original.document.analyses);assert.deepEqual(item.document.photoIds,original.document.photoIds);
 assert.ok(!ops.some(b=>['analyze-photo','save','upload','create','report','verify-action','delete-inspection'].includes(b.op)));
 if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
 for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:width===844?390:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 await page.setViewportSize({width:390,height:844});await nav.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/'+scenario+'.png'});assert.deepEqual(errors,[]);results.push({scenario,status:'PASS',confirmRequests:confirms,paidAiCalls:0,fixtureOnly:true});console.log('PASS '+scenario);await context.close();
}await writeFile(out+'/verification.json',JSON.stringify({status:'PASS',externalFrontend:!!external,results},null,2));}finally{await browser.close();if(server){if(dist)await new Promise(r=>server.httpServer.close(r));else await server.close();}}
