import {createServer,preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const external=process.env.PSI_RESUME_BASE,dev=process.env.PSI_RESUME_DEV==='1',base=external||'http://127.0.0.1:3034',out=process.env.PSI_RESUME_OUT||'artifacts/audit/inspector-resume';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=external?null:dev?await createServer({server:{port:3034,host:'127.0.0.1',strictPort:true}}):await preview({preview:{port:3034,host:'127.0.0.1',strictPort:true,headers}});if(dev&&server)await server.listen();
let proxy;if(external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,...(proxy?{proxy}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[];await mkdir(out,{recursive:true});
try{
 for(const scenario of ['review','actions','stale-review','stale-actions','empty','legacy-actions','locked','missing-photo','corrupt-photo','retry','purged','dirty-history','overview']){
  if(process.env.PSI_RESUME_SCENARIOS&&!process.env.PSI_RESUME_SCENARIOS.split(',').includes(scenario))continue;
  console.log('START '+scenario);
  const context=await browser.newContext({viewport:{width:390,height:900},ignoreHTTPSErrors:!!external,reducedMotion:'reduce',permissions:['clipboard-read','clipboard-write']}),page=await context.newPage();
  await page.clock.install({time:new Date('2026-10-23T03:00:00Z')});
  const id=randomUUID(),other=randomUUID(),pids=Array.from({length:3},()=>randomUUID()),errors=[],ops=[];let detailCalls=0,cancelExit=false;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>cancelExit?d.dismiss():d.accept());
  const pictures=await page.evaluate(()=>[0,1,2].map(i=>{const c=document.createElement('canvas');c.width=400;c.height=300;const g=c.getContext('2d');g.fillStyle=['#468','#284','#874'][i];g.fillRect(0,0,400,300);g.fillStyle='white';g.font='24px sans-serif';g.fillText('SYNTHETIC PHOTO '+(i+1),30,150);return c.toDataURL('image/jpeg').split(',')[1];}));
  const images=new Map(pids.map((pid,i)=>[pid,Buffer.from(pictures[i],'base64')]));
  let evidence=pids.map(pid=>({id:pid,inspection_id:id,sha256:createHash('sha256').update(images.get(pid)).digest('hex'),mime_type:'image/jpeg',byte_size:images.get(pid).length,created_at:'2026-10-23T00:00:00Z'}));
  const analysis=(n)=>({schema_version:'1.1',inspection_id:id,photo_id:pids[n],source_photo_sha256:evidence[n].sha256,processing_mode:'CHATGPT_MANUAL',observed_facts:[{text:n?'두 번째 사진의 바닥 개구부가 보입니다.':'첫 번째 사진의 방호시설입니다.',visual_basis:n?'사진 오른쪽 바닥':'사진 왼쪽',confidence:'high'}],ai_hypotheses:[],requires_confirmation:[],recommended_controls:[{action:'접근통제와 방호 상태를 확인하세요.',priority:'immediate'}],risk_findings:[{observation_index:'0',problem:'개구부 방호 상태 확인 필요',risk:'발을 헛디뎌 추락할 가능성',action:'개구부 주변 접근을 통제하세요.',priority:'immediate'}],law_candidate_keywords:['개구부'],limitations:['합성 QA · 실제 현장 아님']});
  const doc={title:'합성 · 선택한 점검',siteName:'',location:'합성 구역',workType:'형틀',eventAt:'2026-10-23T00:00:00Z',notes:'실제 현장 아님',urgent:false,apiEnabled:false,photoIds:pids,photoNotes:{[pids[0]]:'검토한 사진',[pids[1]]:'검토할 사진',[pids[2]]:'개선 증빙'},analyses:{[pids[0]]:analysis(0),[pids[1]]:analysis(1)},reviews:{[pids[0]]:{decision:'accepted',note:'기존 검토 완료'}},actions:[],ocrResults:{}};
  const action=(title,status,date)=>({id:randomUUID(),title,status,dueDate:date,owner:'형틀반장',sourcePhotoIds:[pids[0]],completionPhotoId:status==='open'?'':pids[2],note:status==='open'?'기존 요청':'기존 개선 기록',...(status==='verified'?{verifiedAt:'2026-10-22T00:00:00Z'}:{})});
  const actionMode=['actions','stale-actions','legacy-actions','locked'].includes(scenario);
  if(actionMode){doc.actions=[action('나중 조치','open','2026-10-25'),action('검토 요청 조치','review-requested','2026-10-20'),action('오늘 조치','open','2026-10-23'),action('재점검 완료 조치','verified','2026-10-19')];}
  if(['actions','stale-actions','legacy-actions','overview','stale-review','empty'].includes(scenario))doc.reviews[pids[1]]={decision:'accepted',note:'다른 기기에서 검토 완료'};
  if(scenario==='stale-actions')doc.actions=doc.actions.map(a=>({...a,status:'verified',verifiedAt:'2026-10-23T00:00:00Z'}));
  if(['empty','legacy-actions'].includes(scenario)){doc.photoIds=[];doc.analyses={};doc.reviews={};doc.photoNotes={};evidence=[];if(scenario==='legacy-actions')doc.actions=doc.actions.map(({sourcePhotoIds,completionPhotoId,...a})=>({...a,completionPhotoId:''}));}
  if(scenario==='missing-photo')evidence=evidence.filter(p=>p.id!==pids[1]);
  const item={id,revision:7,document:doc,created_at:'2026-10-23T00:00:00Z',updated_at:'2026-10-23T01:00:00Z'},before=JSON.stringify(item);
  const needsReview=!actionMode&&!['empty','overview','legacy-actions'].includes(scenario);
  const summary={id,revision:7,title:doc.title,work_type:doc.workType,location:doc.location,urgent:false,open_actions:actionMode?3:0,needs_review:needsReview,created_at:item.created_at,updated_at:item.updated_at};
  const status={state:scenario==='purged'?'purged':scenario==='locked'?'files-deleted':'active',mode:scenario==='purged'?'all':scenario==='locked'?'files':null,verified:['purged','locked'].includes(scenario),remainingFiles:0,remainingBytes:0,remainingRecords:{inspections:scenario==='purged'?0:1,evidence:0,reports:0,events:0,operations:0},pendingOperations:0,verifyAfter:null,checkedAt:'2026-10-23T03:00:00Z',receipt:{}};
  await context.addInitScript(other=>sessionStorage.setItem('psi.inspector.quick.last.v1',other),other);
  await page.route('**/*',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname==='/__qa-korean.otf')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});
   if(u.origin!==base)return r.fulfill({body:'',contentType:'text/css'});
   if(u.pathname.startsWith('/__resume-photo/'))return r.fulfill({body:images.get(scenario==='corrupt-photo'?pids[0]:u.pathname.split('/').pop()),contentType:'image/jpeg'});
   if(u.pathname==='/api/admin/auth')return r.fulfill({json:{ok:true,authenticated:true}});
   if(u.pathname!=='/api/admin/inspector')return r.continue();
   const b=r.request().postDataJSON();ops.push(b);
   if(b.op==='ai-status')return r.fulfill({json:{ok:true,ready:true,provider:'gemini',model:'fixture',maxCalls:20}});
   if(b.op==='list')return r.fulfill({json:{ok:true,items:[summary,{...summary,id:other,title:'합성 · 다른 점검',needs_review:false,open_actions:0}],hasMore:false,nextCursor:null}});
   if(b.op==='detail'){assert.equal(b.id,id,'Selected record must override prior tab pointer');detailCalls++;if(scenario==='purged')return r.fulfill({status:404,json:{ok:false,message:'이미 삭제된 점검입니다.'}});if(scenario==='retry'&&detailCalls===1)return r.fulfill({status:503,json:{ok:false,message:'선택 점검 연결 실패 · 다시 확인하세요.'}});return r.fulfill({json:{ok:true,item,evidence,reports:[],events:[],control:{state:status.state}}});}
   if(b.op==='photo'){assert.equal(b.id,id);assert.equal(b.photoId,pids[scenario==='dirty-history'?0:1]);return r.fulfill({json:{ok:true,url:base+'/__resume-photo/'+b.photoId}});}
   if(b.op==='deletion-status'){assert.equal(b.id,id);return r.fulfill({json:{ok:true,status}});}
   if(b.op==='usage')return r.fulfill({json:{ok:true,usage:{projectBytes:100000,databaseBytes:100000}}});
   errors.push('Unexpected business write '+b.op);return r.fulfill({status:503,json:{ok:false,message:'QA mutation blocked'}});
  });
  await page.goto(base+'/?mode=photo-inspector');await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();const list=page.getByLabel('점검 기록 목록',{exact:true});const label=needsReview?'검토 이어보기':actionMode?'조치 이어보기':'간편 화면 열기';
  const shortcut=list.getByRole('button',{name:doc.title+' · '+label,exact:true});await shortcut.waitFor();
  if(scenario==='dirty-history'){
   await list.locator('.si-record-row').filter({hasText:doc.title}).locator('.si-record').click();await page.getByText('현장 공통정보 · 선택 입력',{exact:true}).click();await page.getByLabel('점검명',{exact:true}).fill('저장 전 제목');assert.equal(await shortcut.isDisabled(),true);assert.equal(ops.filter(b=>b.op==='detail').length,1);
  }else{
   await shortcut.click();
   if(scenario==='retry'){await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('현재 저장 점검').count(),0);await page.getByRole('button',{name:'이전 점검 이어하기',exact:true}).click();}
   if(scenario==='purged'){await page.getByRole('heading',{name:'선택 범위 삭제 검증 완료'}).waitFor();assert.equal(await page.getByLabel('현재 저장 점검').count(),0);}
   else if(scenario==='locked'){await page.getByText('삭제 중이거나 사진이 삭제된 점검입니다.',{exact:false}).waitFor();assert.equal(await page.locator('.si-action-planner').isVisible(),false);}
   else{
    await page.getByLabel('현재 저장 점검').getByRole('heading',{name:doc.title,exact:true}).waitFor();
    if(['review','retry'].includes(scenario)){
     await page.getByLabel('핵심 답변').waitFor();assert.match(await page.locator('.si-current-photo-scope').innerText(),/사진 2\/3/);assert.match(await page.getByLabel('핵심 답변').innerText(),/두 번째 사진/);assert.equal(ops.filter(b=>b.op==='photo').length,1);
     if(scenario==='review'){
      const review=page.locator('.si-expert-review');await review.getByRole('button',{name:'판단·조치 보완',exact:true}).click();await review.locator('textarea').fill('저장하지 않은 전문가 의견');cancelExit=true;await page.getByRole('button',{name:'저장 기록 · 상세 관리',exact:true}).click();assert.equal(await review.locator('textarea').inputValue(),'저장하지 않은 전문가 의견');assert.equal(await list.count(),0);cancelExit=false;
     }
    }else if(scenario==='missing-photo'||scenario==='corrupt-photo'){
     await page.getByRole('alert').waitFor();assert.equal(await page.getByLabel('핵심 답변').count(),0);assert.match(await page.getByRole('alert').innerText(),scenario==='missing-photo'?/보관 정보/:/무결성/);
    }else if(scenario==='stale-review'){await page.getByText('최신 저장 내용에는 검토 대기 사진이 없습니다.',{exact:false}).waitFor();assert.equal(ops.filter(b=>b.op==='photo').length,0);}
    else if(actionMode){
     const planner=page.locator('.si-action-planner');await planner.locator('.si-registered-actions').waitFor();assert.match(await planner.locator('.si-action-record-title').innerText(),/합성 · 선택한 점검/);assert.equal(await planner.evaluate(el=>el.open),true);assert.equal(await planner.getByRole('button',{name:'등록 조치 4',exact:true}).getAttribute('aria-pressed'),'true');
     if(scenario==='stale-actions'){assert.equal(await planner.locator('.si-registered-actions>section').count(),0);assert.equal(await planner.getByRole('button',{name:'미결 조치요청문 복사',exact:true}).isDisabled(),true);}
     else{assert.equal(await planner.locator('.si-queue-tools').evaluate(el=>el.open),false);assert.equal(await planner.locator('.si-registered-actions>section').count(),3);assert.equal(await planner.locator('.si-registered-actions>section h3').first().innerText(),'검토 요청 조치');await planner.locator('.si-queue-tools>summary').click();assert.equal(await planner.getByRole('button',{name:'미결 전체 3',exact:true}).getAttribute('aria-pressed'),'true');assert.equal(await planner.getByLabel('목록 순서',{exact:true}).inputValue(),'due');await planner.getByRole('button',{name:'미결 조치요청문 복사',exact:true}).click();const text=await page.evaluate(()=>navigator.clipboard.readText());assert.match(text,/검토 요청 조치/);assert.match(text,/오늘 조치/);assert.doesNotMatch(text,/재점검 완료 조치/);await planner.locator('.si-queue-tools>summary').click();}
     assert.equal(ops.filter(b=>b.op==='photo').length,0);
    }else assert.equal(await page.getByRole('button',{name:'카메라로 바로 촬영',exact:true}).isVisible(),true);
   }
   assert.equal(detailCalls,scenario==='retry'?2:1);if(scenario!=='purged')assert.equal(await page.evaluate(()=>sessionStorage.getItem('psi.inspector.quick.last.v1')),id);
  }
  if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}
  for(const width of [360,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}
  if(['review','actions'].includes(scenario)){await page.setViewportSize({width:390,height:900});await page.locator(scenario==='review'?'.si-quick-result':'.si-action-planner').evaluate(el=>el.scrollIntoView({block:'start',behavior:'instant'}));await page.screenshot({path:out+'/'+scenario+'-mobile.png',fullPage:true});}
  assert.equal(JSON.stringify(item),before);assert.deepEqual(errors,[]);assert.ok(!ops.some(b=>['save','upload','create','report','analyze-photo','confirm-photo','verify-action','delete-inspection'].includes(b.op)));results.push({scenario,status:'PASS',detailCalls,photoRequests:ops.filter(b=>b.op==='photo').length,businessWrites:0,paidAiCalls:0});console.log('PASS '+scenario);await context.close();
 }
 await writeFile(out+'/simulation.json',JSON.stringify({status:'PASS',externalFrontend:!!external,dev,results},null,2));console.log(JSON.stringify({status:'PASS',scenarios:results.length}));
}catch(e){for(const c of browser.contexts())for(const p of c.pages())await p.screenshot({path:out+'/failure.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();if(server){if(dev)await server.close();else await new Promise(resolve=>server.httpServer.close(resolve));}}
