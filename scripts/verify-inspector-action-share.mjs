import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const external=process.env.PSI_SHARE_BASE,base=external||'http://127.0.0.1:3038',out=process.env.PSI_SHARE_OUT||'artifacts/audit/action-share';await mkdir(out,{recursive:true});
const cfg=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(cfg.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=external?null:await preview({build:{outDir:process.env.PSI_SHARE_DIST||'artifacts/share-dist'},preview:{host:'127.0.0.1',port:3038,strictPort:true,headers}});
let proxy;if(external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const loadFont=async p=>{if(process.env.PSI_QA_KOREAN_FONT){await p.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await p.evaluate(()=>document.fonts.load('16px PSIQA','현장점검'));}};
const browser=await chromium.launch({headless:true,executablePath:process.env.PSI_CHROMIUM_PATH,...(proxy?{proxy}:{})}),results=[];
try{for(const scenario of ['flow','lost-plan-ack','lost-photo-ack','offline-before-send','reload-lost-plan-ack','reload-lost-photo-ack','reload-offline-before-send','revoked','expired','invalid']){
 console.log('START '+scenario);const context=await browser.newContext({viewport:{width:390,height:900},permissions:['clipboard-read','clipboard-write'],reducedMotion:'reduce',ignoreHTTPSErrors:!!external}),page=await context.newPage(),id=randomUUID(),pid=randomUUID(),aid=randomUUID(),token='Q'.repeat(43),ops=[],errors=[];let shares=[],publicReplies=0,authCalls=0,closed=false,offlineInjected=false;
 page.on('pageerror',e=>errors.push(e.message));
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=2000;c.height=1400;const g=c.getContext('2d');g.fillStyle='#184e67';g.fillRect(0,0,2000,1400);g.fillStyle='#f7b14c';g.fillRect(300,300,700,600);return c.toDataURL('image/jpeg').split(',')[1];});const bytes=Buffer.from(image,'base64'),sha=createHash('sha256').update(bytes).digest('hex'),images=new Map([[pid,bytes]]);
 const doc={title:'합성 공유 검증 · 실제 현장 아님',siteName:'',location:'',workType:'',eventAt:'2026-10-24T00:00:00Z',notes:'',urgent:false,apiEnabled:false,photoIds:[pid],photoNotes:{[pid]:'합성 원본'},analyses:{},reviews:{},ocrResults:{},actions:[{id:aid,title:'전선 피복 상태 확인 후 보완 요청',owner:'합성 전기 담당',dueDate:'2026-10-30',status:'open',sourcePhotoIds:[pid],completionPhotoId:'',note:'합성 조치'}]};let item={id,revision:3,document:doc,created_at:'2026-10-24T00:00:00Z',updated_at:'2026-10-24T00:00:00Z'},evidence=[{id:pid,inspection_id:id,sha256:sha,mime_type:'image/jpeg',byte_size:bytes.length,created_at:'2026-10-24T00:00:00Z'}];
 const snapshot={title:doc.actions[0].title,owner:doc.actions[0].owner,dueDate:doc.actions[0].dueDate,photoSha256:sha,photoNumber:1};
 await context.addInitScript(id=>{sessionStorage.setItem('psi.inspector.quick.last.v1',id);window.__shares=[];Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async d=>window.__shares.push({text:d.text,files:(d.files||[]).map(f=>({size:f.size,type:f.type})),activation:navigator.userActivation.isActive}),configurable:true});},id);
 await context.route('**/*',async r=>{const u=new URL(r.request().url());if(u.protocol==='blob:')return r.continue();assert.ok(!r.request().url().includes(token),'Capability must not appear in an HTTP URL');if(u.pathname==='/__qa-korean.otf')return r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'});if(u.origin!==base)return r.fulfill({body:'',contentType:'text/css'});
 if(u.pathname==='/api/admin/auth'){authCalls++;return r.fulfill({json:{ok:true,authenticated:true}});}if(u.pathname.startsWith('/__share-photo/'))return r.fulfill({body:images.get(u.pathname.split('/').pop()),contentType:'image/jpeg'});
 if(u.pathname==='/api/inspection-share'){
  const b=r.request().postDataJSON();ops.push('public:'+b.op);assert.equal(b.token,token);if(closed||scenario==='expired'||scenario==='revoked')return r.fulfill({status:410,json:{ok:false,message:'만료·차단된 링크입니다.'}});
  const s=shares[0];if(b.op==='detail')return r.fulfill({json:{ok:true,snapshot,createdAt:s?.created_at,expiresAt:s?.expires_at,responses:s?.responses||[]}});if(b.op==='photo')return r.fulfill({json:{ok:true,mime:'image/jpeg',base64:image}});
  assert.equal(b.op,'reply');assert.equal(b.consent,true);const prior=s.responses.find(v=>v.requestId===b.requestId);if(prior)return r.fulfill({json:{ok:true,response:prior,replayed:true}});
  if((scenario==='offline-before-send'||scenario==='reload-offline-before-send')&&b.kind==='planned'&&!offlineInjected){offlineInjected=true;return r.abort('internetdisconnected');}
  publicReplies++;let hash=null;if(b.kind==='photo'){const f=Buffer.from(b.base64,'base64');assert.ok(f.length<=1048576);assert.ok(Math.max(b.receipt.uploaded_width,b.receipt.uploaded_height)<=1280);hash=createHash('sha256').update(f).digest('hex');assert.equal(hash,b.receipt.uploaded_asset_sha256);images.set(b.photoId,f);evidence.push({id:b.photoId,inspection_id:id,sha256:hash,mime_type:'image/jpeg',byte_size:f.length,created_at:'2026-10-24T01:00:00Z'});}
  const response={requestId:b.requestId,kind:b.kind,name:b.name,note:b.note,photoId:b.photoId||null,sha256:hash,submittedAt:'2026-10-24T01:00:00Z'};s.responses.push(response);if(b.kind==='planned'&&publicReplies===1&&scenario==='flow')return r.fulfill({status:503,json:{ok:false,message:'합성 응답 유실 · 같은 내용으로 재시도'}});
  if(b.kind==='planned'&&(scenario==='lost-plan-ack'||scenario==='reload-lost-plan-ack'))return r.fulfill({status:503,json:{ok:false,message:'합성 접수 완료 후 응답 유실'}});
  if(b.kind==='photo'&&(scenario==='lost-photo-ack'||scenario==='reload-lost-photo-ack'))return r.fulfill({status:503,json:{ok:false,message:'합성 사진 접수 완료 후 응답 유실'}});return r.fulfill({json:{ok:true,response}});
 }
 if(u.pathname!=='/api/admin/inspector')return r.continue();const b=r.request().postDataJSON();ops.push(b.op);
 if(b.op==='ai-status')return r.fulfill({json:{ok:true,ready:false,provider:'',model:''}});if(b.op==='detail')return r.fulfill({json:{ok:true,item,evidence,reports:[],control:{state:'active'}}});if(b.op==='photo')return r.fulfill({json:{ok:true,url:base+'/__share-photo/'+b.photoId}});if(b.op==='share-list')return r.fulfill({json:{ok:true,shares}});
 if(b.op==='share-create'){assert.equal(b.expectedRevision,item.revision);assert.equal(b.photoId,pid);shares=[{id:b.shareId,inspection_id:id,action_id:aid,photo_id:pid,creation_revision:item.revision,snapshot,created_at:'2026-10-24T00:00:00Z',expires_at:new Date(Date.now()+24*60*60*1000).toISOString(),revoked_at:null,adopted_at:null,responses:[],token}];return r.fulfill({json:{ok:true,share:shares[0]}});}
 if(b.op==='share-revoke'){closed=true;shares[0].revoked_at='2026-10-24T01:00:00Z';delete shares[0].token;return r.fulfill({json:{ok:true,revoked:true}});}
 if(b.op==='share-adopt'){assert.equal(b.confirmed,true);assert.equal(b.expectedRevision,item.revision);const reply=shares[0].responses.find(v=>v.kind==='photo');assert.ok(reply);item=structuredClone(item);item.revision++;item.document.photoIds.push(reply.photoId);Object.assign(item.document.actions[0],{status:'review-requested',completionPhotoId:reply.photoId,note:'외부 회신 검토 후 반영'});shares[0].adopted_at='2026-10-24T02:00:00Z';delete shares[0].token;closed=true;return r.fulfill({json:{ok:true,item,evidence}});}
 throw Error('Unexpected op '+b.op);
 });
 if(['flow','lost-plan-ack','lost-photo-ack','offline-before-send','reload-lost-plan-ack','reload-lost-photo-ack','reload-offline-before-send'].includes(scenario)){
  await page.goto(base+'/?mode=photo-inspector');await loadFont(page);await page.getByRole('button',{name:'이전 점검 이어하기',exact:true}).click();await page.locator('.si-action-planner>summary').click();await page.getByRole('button',{name:'등록 조치 1',exact:true}).click();const manager=page.locator('.si-share-manager');assert.equal(ops.filter(v=>v==='share-list').length,0);await manager.locator('summary').click();await manager.getByRole('button',{name:'확인한 범위로 회신 링크 만들기'}).waitFor();assert.equal(await manager.getByRole('button',{name:'확인한 범위로 회신 링크 만들기'}).isDisabled(),true);await manager.getByRole('checkbox').first().check();await manager.getByRole('button',{name:'확인한 범위로 회신 링크 만들기'}).click();await manager.getByRole('button',{name:'위치 표시·QR 카드 만들기'}).click();const dialog=page.getByRole('dialog',{name:'사진·조치 전달 카드'});await dialog.waitFor();await dialog.locator('.si-card-mark-controls>summary').click();await dialog.getByRole('button',{name:'동그라미',exact:true}).click();await dialog.getByRole('button',{name:'중앙에 표시 추가'}).click();await dialog.getByRole('button',{name:'화살표',exact:true}).click();await dialog.getByRole('button',{name:'중앙에 표시 추가'}).click();assert.match(await dialog.innerText(),/위치 표시 2개/);await dialog.getByRole('button',{name:'내용 확인 · 카드 미리보기 만들기'}).click();await dialog.getByRole('region',{name:'전달 카드 미리보기'}).waitFor();const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'카드 다운로드',exact:true}).click();await(await download).saveAs(out+'/annotated-qr-card.jpg');await dialog.getByRole('button',{name:'카드 공유창 열기'}).click();const shared=await page.evaluate(()=>window.__shares);assert.equal(shared.length,1);assert.match(shared[0].text,/inspection-reply#/);assert.ok(shared[0].files[0].size<3145728);assert.equal(shared[0].activation,true);await page.keyboard.press('Escape');
  const authBefore=authCalls,receiver=await context.newPage();await receiver.goto(base+'/inspection-reply#'+token);await receiver.getByRole('heading',{name:snapshot.title,exact:true}).waitFor();await loadFont(receiver);receiver.on('pageerror',e=>errors.push(e.message));await receiver.screenshot({path:out+'/receiver-request.png',fullPage:true});assert.equal(authCalls,authBefore);await receiver.getByRole('button',{name:'요청 사진 보기'}).click();await receiver.getByAltText('공유된 조치 전 원본사진').waitFor();await receiver.getByLabel('조치 일정 알리기',{exact:true}).check();await receiver.getByLabel('응답자·공종 (본인 입력)',{exact:true}).fill('합성 전기 담당');await receiver.getByLabel('언제, 어떻게 조치할 예정인가요? (5자 이상)',{exact:true}).fill('내일 담당자가 조치 상태를 확인합니다');await receiver.getByRole('checkbox').check();await receiver.getByRole('button',{name:'조치 예정 회신하기'}).click();
  if(['lost-plan-ack','offline-before-send','reload-lost-plan-ack','reload-offline-before-send'].includes(scenario)){
   const safety=receiver.locator('.si-reply-uncertain');await safety.waitFor();
   assert.equal(await receiver.getByLabel('응답자·공종 (본인 입력)',{exact:true}).isDisabled(),true);
   assert.equal(await receiver.getByLabel('언제, 어떻게 조치할 예정인가요? (5자 이상)',{exact:true}).isDisabled(),true);
   assert.equal(await safety.getByRole('button',{name:'같은 회신 다시 확인·보내기'}).count(),0);
   if(scenario.startsWith('reload-')){
    receiver.on('dialog',dialog=>dialog.accept());
    await receiver.reload();
    await receiver.getByRole('heading',{name:snapshot.title,exact:true}).waitFor();
    assert.equal(await receiver.getByText(/민감정보 보호를 위해 사진·설명을 브라우저에 저장하지 않았습니다/).count(),scenario==='reload-offline-before-send'?1:0);
    if(scenario==='reload-lost-plan-ack'){
     await receiver.getByText('새로고침 전에 보낸 회신이 접수된 것을 확인했습니다.',{exact:false}).waitFor();
    }else{
     const recover=receiver.locator('.si-reply-uncertain');await recover.waitFor();
     assert.equal(await receiver.getByRole('button',{name:'먼저 이전 회신 접수 여부 확인'}).isDisabled(),true);
     await recover.getByRole('button',{name:'회신 접수 여부 다시 확인'}).click();
     await receiver.getByText('현재 조회에는 이 회신이 보이지 않습니다.',{exact:false}).waitFor();
     await recover.getByRole('button',{name:'다른 내용으로 새로 작성'}).click();
     await receiver.getByLabel('조치 일정 알리기',{exact:true}).check();
     await receiver.getByLabel('응답자·공종 (본인 입력)',{exact:true}).fill('합성 전기 담당');
     await receiver.getByLabel('언제, 어떻게 조치할 예정인가요? (5자 이상)',{exact:true}).fill('내일 담당자가 조치 상태를 확인합니다');
     await receiver.getByRole('checkbox').check();
     await receiver.getByRole('button',{name:'조치 예정 회신하기'}).click();
    }
   }else{
    await safety.getByRole('button',{name:'회신 접수 여부 다시 확인'}).click();
   }
   if(scenario==='offline-before-send'){
    await receiver.getByText('현재 조회에는 이 회신이 보이지 않습니다.',{exact:false}).waitFor();
    assert.equal(shares[0].responses.length,0);
    await receiver.getByRole('button',{name:'같은 회신 다시 확인·보내기'}).click();
   }
  }else if(scenario==='lost-photo-ack'||scenario==='reload-lost-photo-ack'){
   await receiver.getByRole('region',{name:'접수한 회신'}).waitFor();
  }else{
   await receiver.getByRole('alert').waitFor();
   assert.equal(await receiver.getByLabel('응답자·공종 (본인 입력)',{exact:true}).isDisabled(),true);
   await receiver.getByRole('button',{name:'같은 회신 다시 확인·보내기'}).click();
  }
  await receiver.getByRole('region',{name:'접수한 회신'}).waitFor();assert.equal(shares[0].responses.length,1);assert.equal(item.document.actions[0].status,'open');await receiver.getByLabel('개선사진 보내기',{exact:true}).check();await receiver.getByLabel('응답자·공종 (본인 입력)',{exact:true}).fill('합성 전기 담당');const improved=Buffer.from(await receiver.evaluate(()=>{const c=document.createElement('canvas');c.width=2500;c.height=1800;const g=c.getContext('2d');g.fillStyle='#377b44';g.fillRect(0,0,2500,1800);return c.toDataURL('image/png').split(',')[1];}),'base64');await receiver.getByLabel('회신 개선사진 선택',{exact:true}).setInputFiles({name:'synthetic-improvement.png',mimeType:'image/png',buffer:improved});await receiver.getByAltText('회신할 개선사진 미리보기').waitFor();await receiver.getByLabel('어떤 부분을 개선했나요? (5자 이상)',{exact:true}).fill('절연 보완 상태를 촬영하여 회신합니다');await receiver.getByRole('checkbox').check();await receiver.getByRole('button',{name:'개선사진과 내용 회신하기'}).click();
  if(scenario==='lost-photo-ack'||scenario==='reload-lost-photo-ack'){
   const safety=receiver.locator('.si-reply-uncertain');await safety.waitFor();
   assert.equal(await receiver.getByLabel('어떤 부분을 개선했나요? (5자 이상)',{exact:true}).isDisabled(),true);
   assert.equal(await receiver.getByLabel('회신 개선사진 선택',{exact:true}).isDisabled(),true);
   assert.equal(shares[0].responses.length,2);
   if(scenario==='reload-lost-photo-ack'){
    receiver.on('dialog',dialog=>dialog.accept());await receiver.reload();
    await receiver.getByText('새로고침 전에 보낸 회신이 접수된 것을 확인했습니다.',{exact:false}).waitFor();
   }else await safety.getByRole('button',{name:'회신 접수 여부 다시 확인'}).click();
  }
  await receiver.getByText('이 링크의 회신이 모두 접수되었습니다.',{exact:false}).waitFor();assert.equal(shares[0].responses.length,2);assert.equal(item.document.actions[0].status,'open');
  await manager.getByRole('button',{name:'회신·링크 상태 다시 확인'}).click();await manager.getByRole('button',{name:'접수한 전후 사진 비교'}).click();await manager.getByRole('img',{name:'개선 후 사진',exact:true}).waitFor();assert.equal(await manager.getByRole('button',{name:'확인한 개선사진 반영'}).isDisabled(),true);await manager.getByRole('checkbox',{name:'전후 사진·적용 범위를 대조했습니다.',exact:false}).check();await manager.getByRole('button',{name:'확인한 개선사진 반영'}).click();await manager.getByText('개선사진 반영 · 최종 재점검 별도',{exact:true}).waitFor();assert.equal(item.document.actions[0].status,'review-requested');assert.equal(item.document.actions[0].verifiedAt,undefined);assert.equal(item.document.photoIds.length,2);await receiver.reload();await receiver.getByRole('alert').waitFor();assert.equal(await receiver.getByRole('heading',{name:snapshot.title,exact:true}).count(),0);
  for(const width of [320,390,844,1440]){await page.setViewportSize({width,height:width===844?390:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);}await page.setViewportSize({width:390,height:900});await manager.scrollIntoViewIfNeeded();await page.screenshot({path:out+'/admin-received.png'});await receiver.screenshot({path:out+'/closed-receiver.png'});
 }else{
  await page.goto(base+'/inspection-reply#'+(scenario==='invalid'?'bad':token));await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('heading',{name:snapshot.title,exact:true}).count(),0);assert.equal(ops.filter(v=>v==='public:photo'||v==='public:reply').length,0);
 }
 assert.deepEqual(errors,[]);assert.ok(!ops.includes('analyze-photo'));results.push({scenario,status:'PASS',fixtureOnly:true,paidAiCalls:0,actualRecipientSend:false});console.log('PASS '+scenario);await context.close();
}await writeFile(out+'/verification.json',JSON.stringify({status:'PASS',externalFrontend:!!external,results},null,2));}finally{await browser.close();if(server)await new Promise(r=>server.httpServer.close(r));}
