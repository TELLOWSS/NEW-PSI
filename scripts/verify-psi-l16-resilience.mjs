import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const root='http://127.0.0.1:3082';
const out='artifacts/audit/psi-l16-resilience';
await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:3082,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const evidence=[];
try{
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 const network=[];
 const errors=[];
 const page=await context.newPage();
 page.setDefaultTimeout(35000);
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{
  const url=new URL(request.url());
  if(url.pathname.startsWith('/api/')||url.origin!==root)
   network.push({method:request.method(),origin:url.origin,path:url.pathname});
 });
 // Inject only a small document network delay, with no synthetic device battery claim.
 let delayCount=0;
 await context.route('**/field-local/**',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===root&&route.request().resourceType()==='document'){
   delayCount+=1;
   await new Promise(resolve=>setTimeout(resolve,150));
  }
  await route.continue();
 });
 const begin=Date.now();
 await page.goto(root+'/field-local/',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'PSI 기기 점검'}).waitFor();
 await page.getByText('브라우저 연결 신호: 온라인',{exact:true}).waitFor();
 const initialMs=Date.now()-begin;
 const initial=await page.evaluate(()=>({
  online:navigator.onLine,
  documentNavigation:performance.getEntriesByType('navigation').map(x=>({duration:Math.round(x.duration),transferSize:x.transferSize||0})),
  resourceCount:performance.getEntriesByType('resource').length,
  documentWidth:document.documentElement.scrollWidth,
  viewportWidth:innerWidth,
 }));
 assert.equal(initial.online,true);
 assert.ok(initial.documentWidth<=initial.viewportWidth+2,'initial local screen horizontal overflow');
 evidence.push({stage:'initial-online',documentReadyMs:initialMs,slowDocumentDelayApplied:delayCount>0,...initial});
 await page.getByRole('button',{name:'이 기기 오프라인 준비'}).click();
 await page.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor({timeout:35000});
 const cache=await page.evaluate(async()=>{
  const keys=(await caches.keys()).filter(x=>x.startsWith('psi-local-shell-'));
  const names=[];
  for(const key of keys)for(const request of await (await caches.open(key)).keys())names.push(new URL(request.url).pathname);
  return {keys,paths:names};
 });
 assert.ok(cache.keys.length>0,'no manually prepared local cache');
 assert.ok(cache.paths.includes('/field-local/index.html'),'offline entry not in cache');
 assert.ok(cache.paths.includes('/field-local-l14.webmanifest'),'PWA manifest not in verified cache');
 assert.ok(!cache.paths.some(x=>x.startsWith('/api/')||x.startsWith('/inspection-reply')),'sensitive route cached');
 evidence.push({stage:'prepared',cacheKeys:cache.keys.length,cacheAssets:cache.paths.length});

 await context.setOffline(true);
 const offlineStart=Date.now();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'PSI 기기 점검'}).waitFor();
 await page.getByText('브라우저 연결 신호: 오프라인',{exact:true}).waitFor();
 await page.getByText('이 기기의 오프라인 점검 준비가 확인됐습니다.',{exact:false}).waitFor();
 evidence.push({stage:'offline-reopen',documentReadyMs:Date.now()-offlineStart,navigatorOnline:await page.evaluate(()=>navigator.onLine)});
 await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 const panel=page.getByRole('region',{name:'기기 직접 점검'});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a8sAAAAASUVORK5CYII=','base64');
 await panel.getByLabel('기기 점검 사진 선택').setInputFiles({name:'l16-synthetic.png',mimeType:'image/png',buffer:png});
 await panel.getByLabel('직접 확인한 내용').fill('L16 합성 오프라인 점검 메모');
 await panel.getByRole('button',{name:'사진과 내용 기기에 저장'}).click();
 await panel.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('브라우저 연결 신호: 오프라인',{exact:true}).waitFor();
 await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 const restored=page.getByRole('region',{name:'기기 직접 점검'});
 await restored.getByText('이 브라우저에 보관된 점검 1건').waitFor();
 await restored.getByText('L16 합성 오프라인 점검 메모',{exact:false}).waitFor();
 evidence.push({stage:'offline-local-save-and-reopen',recordCount:1,serverReceipt:'unverified'});

 await context.setOffline(false);
 await page.getByText('브라우저 연결 신호: 온라인',{exact:true}).waitFor();
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('브라우저 연결 신호: 온라인',{exact:true}).waitFor();
 await page.getByText('통신 없이 기기에서 직접 점검',{exact:true}).click();
 await page.getByRole('region',{name:'기기 직접 점검'}).getByText('이 브라우저에 보관된 점검 1건').waitFor();
 assert.deepEqual(network,[],'local-only flow must not call server API or third-party origins');
 assert.deepEqual(errors,[],'browser runtime errors');
 evidence.push({stage:'reconnected-no-automatic-cloud-sync',networkCalls:network.length,recordCount:1});
 await writeFile(out+'/result.json',JSON.stringify({result:'PASS',scope:'Chromium synthetic run; no real 3G, server health, field battery or device proof',evidence},null,2));
 console.log('PASS L16 simulated network transition, offline cached restart + local IndexedDB save, reconnect with no API');
 await context.close();
}catch(error){
 await writeFile(out+'/result.json',JSON.stringify({result:'FAIL',error:String(error),evidence},null,2));
 throw error;
}finally{
 await browser.close();
 await new Promise(resolve=>server.httpServer.close(resolve));
}
