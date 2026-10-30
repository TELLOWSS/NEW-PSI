import {readFile,writeFile} from 'node:fs/promises';import {preview} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=await preview({preview:{port:3048,host:'127.0.0.1',strictPort:true}}),base='http://127.0.0.1:3048';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['camera']});let page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/field-local/',{waitUntil:'networkidle'});
 // Deterministic browser storage responses: approval is never inferred from a request.
 await page.evaluate(()=>{
  Object.defineProperty(navigator.storage,'estimate',{configurable:true,value:async()=>({usage:2*1024*1024,quota:100*1024*1024})});
  Object.defineProperty(navigator.storage,'persisted',{configurable:true,value:async()=>false});
  Object.defineProperty(navigator.storage,'persist',{configurable:true,value:async()=>false});
 });
 await page.getByRole('button',{name:'저장 공간 확인'}).click();
 await page.getByText('이 사이트의 사용량 약 2MB / 브라우저가 추정한 한도 약 100MB.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'기록 지속 보관 요청'}).click();
 await page.getByText('브라우저가 지속 보관 요청을 허용하지 않았습니다.',{exact:false}).waitFor();
 await page.evaluate(()=>Object.defineProperty(navigator.storage,'persist',{configurable:true,value:async()=>true}));
 await page.getByRole('button',{name:'기록 지속 보관 요청'}).click();
 await page.getByText('브라우저가 지속 보관 요청을 허용했습니다.',{exact:false}).waitFor();
 await page.getByText('사용자의 데이터 삭제나 기기 분실을 막지 못합니다.',{exact:false}).waitFor();
 await page.getByRole('button',{name:'이 기기 오프라인 준비'}).click();
 await page.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor({timeout:30000});
 await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 let panel=page.getByRole('region',{name:'기기 직접 점검'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a8sAAAAASUVORK5CYII=','base64');
 await panel.getByLabel('기기 점검 사진 선택').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});
 await panel.getByLabel('직접 확인한 내용').fill('합성 현장 개구부 확인');
 await panel.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
 await panel.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 const readiness=await page.evaluate(async()=>{
  const reg=await navigator.serviceWorker.getRegistration('/field-local/'),key=(await caches.keys()).find(k=>k.startsWith('psi-local-shell-')),cache=await caches.open(key),entries=await cache.keys(),request=entries.find(r=>new URL(r.url).pathname.startsWith('/assets/')),response=await cache.match(request);
  const verify=()=>new Promise(resolve=>{const channel=new MessageChannel();channel.port1.onmessage=e=>resolve(e.data.ok);reg.active.postMessage({type:'VERIFY_LOCAL_ASSETS'},[channel.port2]);});
  const before=await verify();await cache.delete(request);const missing=await verify();await cache.put(request,response);const restored=await verify();return {before,missing,restored};
 });
 assert.deepEqual(readiness,{before:true,missing:false,restored:true},'readiness detects missing required cache assets');
 const cacheKeys=await page.evaluate(async()=>{const keys=await caches.keys(),cache=await caches.open(keys.find(k=>k.startsWith('psi-local-shell-')));return (await cache.keys()).map(r=>new URL(r.url).pathname);});
 assert.ok(cacheKeys.includes('/field-local/index.html'));assert.ok(!cacheKeys.some(k=>k.startsWith('/api/')||k.includes('inspection-reply')),'no private responses cached');
 // Simulate a new version whose required static file cannot be fetched.
 // Always restore the production build bytes before any later regression.
 const workerPath='dist/field-local/sw.js',workerBytes=await readFile(workerPath,'utf8');
 try{
  const broken=workerBytes.replace("const CACHE='psi-local-shell-","const CACHE='psi-local-shell-broken-").replace("self.addEventListener('install'","URLS.push('http://127.0.0.1:1/unavailable');self.addEventListener('install'");
  assert.notEqual(broken,workerBytes);
  await writeFile(workerPath,broken);
  const result=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.getRegistration('/field-local/');
   const prior=registration.active.scriptURL;
   let candidate=null;
   registration.addEventListener('updatefound',()=>{candidate=registration.installing;},{once:true});
   try{await registration.update();}catch{/* A rejected update must preserve the active version. */}
   if(!candidate)await new Promise(resolve=>setTimeout(resolve,1000));
   if(candidate&&candidate.state!=='redundant')await new Promise(resolve=>{const done=()=>{if(candidate.state==='redundant')resolve();};candidate.addEventListener('statechange',done);setTimeout(resolve,10000);});
   return {sawUpdate:!!candidate,candidateState:candidate?.state,active:registration.active?.scriptURL===prior,waiting:!!registration.waiting,keys:await caches.keys()};
  });
  assert.equal(result.sawUpdate,true,'the broken update must actually be installed');
  assert.equal(result.candidateState,'redundant','the new worker must fail installation');
  assert.equal(result.active,true,'failed update must retain active worker');
  assert.equal(result.waiting,false,'failed update must not be ready for activation');
  assert.ok(result.keys.some(k=>k.startsWith('psi-local-shell-')&&!k.includes('-broken-')),'old offline assets remain');
  assert.ok(!result.keys.some(k=>k.includes('-broken-')),'failed partial cache is discarded');
 }finally{await writeFile(workerPath,workerBytes);}
 await page.close();await context.setOffline(true);page=await context.newPage();const requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.goto(base+'/field-local/',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'PSI 기기 점검'}).waitFor();
 await page.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor();
 await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();panel=page.getByRole('region',{name:'기기 직접 점검'});
 await panel.getByText('이 브라우저에 보관된 점검 1건').waitFor();await panel.getByText('합성 현장 개구부 확인',{exact:false}).waitFor();
 await panel.getByRole('button',{name:'기기 점검 사진 촬영'}).click();
 await page.waitForFunction(()=>document.querySelector('.si-camera-shutter')&&!document.querySelector('.si-camera-shutter').disabled);
 await page.getByRole('button',{name:'지금 촬영'}).click();
 await page.getByRole('dialog',{name:'촬영 사진 바로 확인'}).getByRole('button',{name:'이 사진 사용'}).click();
 await panel.getByLabel('직접 확인한 내용').fill('오프라인 재실행 후 점검');
 await panel.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();await panel.getByText('이 브라우저에 보관된 점검 2건').waitFor();
 assert.ok(!requests.some(url=>new URL(url).pathname.startsWith('/api/')||new URL(url).origin!==base),'offline local flow must not contact APIs or external hosts');assert.deepEqual(errors,[]);
 console.log('PASS offline prepared entry, page close and offline restart, existing record and new save');await context.close();
 // An installed update must wait for the controlled page to close, then preserve
 // the IndexedDB record and provide a complete shell on an offline reopen.
 const upgradeContext=await browser.newContext({viewport:{width:390,height:844}});
 let oldPage=await upgradeContext.newPage();
 try{
  await oldPage.goto(base+'/field-local/',{waitUntil:'networkidle'});
  await oldPage.getByRole('button',{name:'이 기기 오프라인 준비'}).click();
  await oldPage.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor({timeout:30000});
  await oldPage.reload({waitUntil:'networkidle'});
  await oldPage.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await oldPage.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
  const oldPanel=oldPage.getByRole('region',{name:'기기 직접 점검'});
  await oldPanel.getByLabel('기기 점검 사진 선택').setInputFiles({name:'upgrade.png',mimeType:'image/png',buffer:png});
  await oldPanel.getByLabel('직접 확인한 내용').fill('업데이트 전 합성 기록');
  await oldPanel.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
  await oldPanel.getByText('이 브라우저에 보관된 점검 1건').waitFor();
  try{
   const upgraded=workerBytes.replace("const CACHE='psi-local-shell-","const CACHE='psi-local-shell-upgrade-test-");
   assert.notEqual(upgraded,workerBytes,'test must change the cache version');
   await writeFile(workerPath,upgraded);
   const waiting=await oldPage.evaluate(async()=>{
    const reg=await navigator.serviceWorker.getRegistration('/field-local/');
    const original=navigator.serviceWorker.controller;
    let candidate;
    reg.addEventListener('updatefound',()=>{candidate=reg.installing;},{once:true});
    await reg.update();
    if(!candidate) await new Promise(resolve=>setTimeout(resolve,1000));
    if(candidate&&candidate.state!=='installed') await new Promise(resolve=>{
     const done=()=>{if(candidate.state==='installed'||candidate.state==='redundant')resolve();};
     candidate.addEventListener('statechange',done);done();setTimeout(resolve,15000);
    });
    return {state:candidate?.state,waiting:reg.waiting===candidate,unchanged:navigator.serviceWorker.controller===original,keys:await caches.keys()};
   });
   assert.equal(waiting.state,'installed','new worker installs successfully');
   assert.equal(waiting.waiting,true,'new worker waits for the open controlled page');
   assert.equal(waiting.unchanged,true,'the open page keeps its original controller');
   assert.ok(waiting.keys.some(k=>k.startsWith('psi-local-shell-upgrade-test-')),'new complete cache exists');
   assert.ok(waiting.keys.some(k=>k.startsWith('psi-local-shell-')&&!k.includes('-upgrade-test-')),'old cache remains while page is open');
   await oldPage.close();
   await upgradeContext.setOffline(true);
   const reopened=await upgradeContext.newPage();
   await reopened.goto(base+'/field-local/',{waitUntil:'domcontentloaded'});
   await reopened.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor({timeout:30000});
   await reopened.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
   const restoredPanel=reopened.getByRole('region',{name:'기기 직접 점검'});
   await restoredPanel.getByText('이 브라우저에 보관된 점검 1건').waitFor();
   await restoredPanel.getByText('업데이트 전 합성 기록',{exact:false}).waitFor();
   await reopened.waitForFunction(async()=>{const keys=await caches.keys();return keys.some(k=>k.startsWith('psi-local-shell-upgrade-test-'))&&!keys.some(k=>k.startsWith('psi-local-shell-')&&!k.includes('-upgrade-test-'));});
   console.log('PASS successful worker upgrade waits for active page and preserves offline record');
  }finally{await writeFile(workerPath,workerBytes);}
 }finally{await upgradeContext.close();}
}finally{await browser.close();await server.close();}
