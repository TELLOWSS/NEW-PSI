import {createServer} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const server=await createServer({server:{port:0,host:'127.0.0.1'}});
await server.listen();
const base='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(),api=[],errors=[];
 page.on('request',req=>{if(new URL(req.url()).pathname.startsWith('/api/'))api.push({method:req.method(),url:req.url()});});
 page.on('pageerror',cause=>errors.push(cause.message));
 await page.goto(base+'/camera',{waitUntil:'domcontentloaded'});
 await page.getByRole('heading',{name:'현장 사진을 간편하게'}).waitFor();
 // Exercise the browser's own file input. Camera device/rotation is already
 // covered independently by verify-inspector-camera.mjs.
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a8sAAAAASUVORK5CYII=','base64');
 await page.getByLabel('사진첩에서 선택').setInputFiles({name:'demo-local.png',mimeType:'image/png',buffer:png});
 await page.getByRole('heading',{name:'이 브라우저의 사진 1장'}).waitFor();
 const stored=await page.evaluate(()=>new Promise((resolve,reject)=>{
  const r=indexedDB.open('psi-field-camera',1);
  r.onerror=()=>reject(r.error);
  r.onsuccess=()=>{const db=r.result,tx=db.transaction('photos','readonly'),g=tx.objectStore('photos').getAll();
   g.onsuccess=()=>resolve(g.result.map(p=>({name:p.name,size:p.blob.size})));
   g.onerror=()=>reject(g.error);tx.oncomplete=()=>db.close();
  };
 }));
 assert.deepEqual(stored,[{name:'demo-local.png',size:png.length}]);
 const next=page.getByRole('link',{name:'내 기기 점검 열기 →'});
 assert.equal(await next.getAttribute('href'),'/field-local/');
 assert.equal(await page.getByRole('link',{name:'관리자 클라우드 점검 (로그인 필요) →'}).getAttribute('href'),'/inspector');
 await next.click();
 await page.getByRole('heading',{name:'PSI 기기 점검'}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/field-local/');
 await page.getByText('체험·직접 점검 · 이 기기 저장').waitFor();
 assert.deepEqual(api,[],'guest local camera and inspection entry must not call cloud API');
 assert.deepEqual(errors,[]);
 console.log('PASS guest photo saved to IndexedDB then navigated to local inspection; owner remains separate; zero API calls');
 await context.close();
}finally{
 await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
 server.httpServer?.closeAllConnections();
 await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
}
