import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const target=process.env.PSI_QA_BASE_URL,built=process.env.PSI_QA_BUILT==='1',base=target||'http://127.0.0.1:3040';
const server=target?null:built?await preview({preview:{port:3040,host:'127.0.0.1',strictPort:true}}):await createServer({server:{port:3040,host:'127.0.0.1',strictPort:true}});if(server&&!built)await server.listen();
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const output='artifacts/audit/inspector-result-queue'+(target?'-deployed':built?'-built':'');await mkdir(output,{recursive:true});const results=[];
try{for(const scenario of ['manual-next','review-next']){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),id=randomUUID(),pids=[randomUUID(),randomUUID(),randomUUID()],ops=[],errors=[];
 page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
 const bytes=Buffer.from(await page.evaluate(()=>{const c=document.createElement('canvas');c.width=400;c.height=300;c.getContext('2d').fillRect(0,0,400,300);return c.toDataURL('image/jpeg').split(',')[1];}),'base64');
 const hash=createHash('sha256').update(bytes).digest('hex'),evidence=pids.map(pid=>({id:pid,inspection_id:id,sha256:hash,mime_type:'image/jpeg',byte_size:bytes.length,created_at:new Date().toISOString()}));
 const analysis=(pid,priority)=>({schema_version:'1.1',inspection_id:id,photo_id:pid,source_photo_sha256:hash,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:'합성 방호 상태',visual_basis:'사진 중앙',confidence:'medium'}],ai_hypotheses:[],risk_findings:[{observation_index:'0',problem:pid===pids[2]?'먼저 검토할 단서':'현재 검토할 단서',risk:'현장 확인 필요',action:'현장에서 대조',priority}],recommended_controls:[],requires_confirmation:[],law_candidate_keywords:[],limitations:['합성 검증용']});
 let item={id,revision:3,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),document:{title:'다음 사진 검토',siteName:'',location:'',workType:'',eventAt:new Date().toISOString(),notes:'',urgent:false,apiEnabled:false,photoIds:pids,photoNotes:Object.fromEntries(pids.map(pid=>[pid,''])),analyses:{...(scenario==='review-next'?{[pids[0]]:analysis(pids[0],'routine')} :{}),[pids[1]]:analysis(pids[1],'soon'),[pids[2]]:analysis(pids[2],'immediate')},reviews:{},actions:[],confirmationAnswers:{},ocrResults:{}}};const original=structuredClone(item.document.analyses);
 await context.addInitScript(({id,pid})=>{sessionStorage.setItem('psi.inspector.quick.last.v1',id);sessionStorage.setItem('psi.inspector.quick.review-position.v1',JSON.stringify({inspectionId:id,photoId:pid}));},{id,pid:pids[0]});
 await context.route('**/api/**',r=>r.fulfill({status:503,json:{ok:false,message:'합성 검증 범위 밖'}}));
 await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile('artifacts/fonts/NotoSansCJKkr-Regular.otf'),contentType:'font/otf'}));
 await page.route('**/__queue-photo',r=>r.fulfill({body:bytes,contentType:'image/jpeg'}));
 await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
 await page.route('**/api/admin/inspector',async r=>{const b=r.request().postDataJSON();ops.push(b.op);let result={ok:true};
 if(b.op==='ai-status')Object.assign(result,{ready:false,cost:{policy:'free-only',state:'unverified',allowed:false,remainingRequests:null}});
 else if(b.op==='detail')Object.assign(result,{item,evidence,control:{state:'active'}});
 else if(b.op==='photo')result.url=base+'/__queue-photo';
 else if(b.op==='save'){assert.equal(b.expectedRevision,item.revision);item={...item,revision:item.revision+1,document:b.document};result.item=item;}
 else if(b.op==='confirm-photo'){assert.equal(b.expectedRevision,item.revision);assert.equal(b.photoId,pids[0]);item={...item,revision:item.revision+1,document:{...item.document,reviews:{...item.document.reviews,[b.photoId]:{decision:b.decision,note:b.reviewNote||'점검자가 사진·설명과 분석을 대조하여 확인함'}}}};result.item=item;}
 else throw new Error('Unexpected operation '+b.op);
 await r.fulfill({json:result});});
 await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
 await page.goto(base+'/?mode=photo-inspector',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'이전 점검 이어하기',exact:true}).click();const guide=page.getByRole('region',{name:'점검 다음 단계'});await guide.waitFor();
 if(scenario==='review-next'){await guide.getByRole('button',{name:'현장 대조 후 검토 저장',exact:true}).click();await guide.getByRole('button',{name:'다음 검토 사진 보기',exact:true}).waitFor();}
 await guide.getByRole('button',{name:'다음 검토 사진 보기',exact:true}).click();await page.getByLabel('핵심 답변').getByRole('heading',{name:'먼저 검토할 단서',exact:true}).waitFor();
 assert.equal(ops.filter(op=>op==='confirm-photo').length,scenario==='manual-next'?0:1);if(scenario==='manual-next')assert.equal(item.document.reviews[pids[0]],undefined);
 await guide.getByText('현재 진행 상태 보기',{exact:true}).click();await guide.getByText('사진 2 · 빠른 개선 검토',{exact:true}).waitFor();
 assert.deepEqual(item.document.analyses,original);assert.ok(!ops.some(op=>['analyze-photo','upload','create','report'].includes(op)));
 assert.equal(JSON.parse(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.quick.review-position.v1'))).photoId,pids[2]);
 await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));
 for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
 await page.setViewportSize({width:390,height:844});await guide.screenshot({path:output+'/'+scenario+'.png'});assert.deepEqual(errors,[]);results.push({scenario,passed:true,ops});await context.close();
}console.log(JSON.stringify(results));await writeFile(output+'/results.json',JSON.stringify(results,null,2));}finally{await browser.close();if(server)await server.close();}
