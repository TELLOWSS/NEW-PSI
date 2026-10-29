import {createServer} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=await createServer({server:{port:0,host:'127.0.0.1'}});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;const browser=await chromium.launch({headless:true});
let failed=false;
try{for(const failure of [false,true]){const context=await browser.newContext({viewport:{width:320,height:740}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#00ff00';g.fillRect(0,0,640,480);const stream=c.captureStream(10);return stream;}});});
await page.goto(base+'/scripts/inspector-lens-fixture.html'+(failure?'?failure=1':''));const dialog=page.getByRole('dialog');await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);
const portraitPill=dialog.locator('.si-camera-guide-options');
for(const viewport of [{width:320,height:740},{width:390,height:844}]){
 await page.setViewportSize(viewport);
 const r=await portraitPill.boundingBox();assert.ok(r&&r.width<=90&&r.height<=46,'collapsed guide pill must be compact in portrait');
 const stage=await dialog.locator('.si-camera-stage').boundingBox();
 assert.ok(stage&&r.width*r.height<stage.width*stage.height*.04,'guide should not obscure more than four percent of camera preview');
}
await page.setViewportSize({width:320,height:740});
await dialog.getByText('구도 선택',{exact:true}).click();
assert.equal(await portraitPill.getAttribute('open'),'','guide opens on demand');
const sheet=await portraitPill.boundingBox();assert.ok(sheet&&sheet.width<=300&&sheet.x+sheet.width<=321,'open guide panel fits narrow phone');
await dialog.getByLabel('3×3 격자 표시').check();assert.equal(await dialog.locator('.si-camera-grid').count(),1);
const guideGroup=dialog.getByRole('group',{name:'촬영할 대상'});
await guideGroup.getByRole('button',{name:'시스템비계'}).click();await dialog.locator('.si-camera-target-scaffold').waitFor();
const sweep=await dialog.locator('.si-camera-target-sweep').evaluate(el=>({name:getComputedStyle(el).animationName,area:el.getBoundingClientRect().width}));
assert.match(sweep.name,/si-target-scan-pass/,'dramatic scan plays on selection');assert.ok(sweep.area>10);
assert.equal(await dialog.locator('.si-camera-target-overlay').getAttribute('aria-hidden'),'true');
assert.equal(await dialog.locator('.si-camera-guide-options').getAttribute('open'),null,'guide choices close to return to camera');
await dialog.getByText('구도 · 시스템비계',{exact:true}).click();await dialog.getByText('발판·지지부와 주변', {exact:false}).waitFor();
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'개구부'}).click();await dialog.locator('.si-camera-target-opening').waitFor();
await dialog.getByText('구도 · 개구부',{exact:true}).click();
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'양중'}).click();await dialog.locator('.si-camera-target-lifting').waitFor();
await page.reload();await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);
assert.equal(await dialog.locator('.si-camera-grid').count(),1,'grid setting is remembered in this session');
assert.equal(await dialog.locator('.si-camera-target-overlay').count(),0,'guide does not carry into a new camera session');
await dialog.getByText('구도 선택',{exact:true}).click();
assert.equal(await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'시스템비계'}).getAttribute('aria-pressed'),'false');
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'시스템비계'}).click();
await dialog.locator('.si-camera-target-scaffold').waitFor();
if(failure){await dialog.getByText('기준 사진을 불러오지 못했습니다.',{exact:false}).waitFor();assert.equal(await dialog.locator('.si-camera-reference').count(),0);}else{const overlay=dialog.locator('.si-camera-reference');await overlay.waitFor();assert.equal(await overlay.evaluate(e=>getComputedStyle(e).opacity),'0.5');await dialog.getByLabel('기준 사진 겹침 투명도').selectOption('75');assert.equal(await overlay.evaluate(e=>getComputedStyle(e).opacity),'0.75');await dialog.getByRole('button',{name:'기준 사진 끄기'}).click();assert.equal(await overlay.count(),0);await dialog.getByRole('button',{name:'기준 사진 켜기'}).click();await overlay.waitFor();}
for(const size of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(size);assert.ok(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1));}
await page.setViewportSize({width:390,height:844});await dialog.getByRole('button',{name:'지금 촬영'}).click();await dialog.getByAltText('등록 전 촬영 사진 미리보기').waitFor();assert.equal(await dialog.locator('.si-camera-reference').count(),0);assert.equal(await dialog.locator('.si-camera-grid').count(),0);assert.equal(await dialog.locator('.si-camera-target-overlay').count(),0,'composition guide must disappear after capture');await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);await dialog.getByRole('button',{name:'이 사진 사용'}).click();const pixels=await page.evaluate(async()=>{const img=new Image();img.src=URL.createObjectURL(window.captured);await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [[100,100],[213,160],[426,320]].map(([x,y])=>[...g.getImageData(x,y,1,1).data]);});for(const pixel of pixels)assert.ok(pixel[1]>220&&pixel[0]<30&&pixel[2]<30,'captured image contains video only, without the reference or grid');assert.deepEqual(errors,[]);console.log('PASS lens '+(failure?'reference failure':'overlay controls and capture pixels'));await context.close();}}
catch(error){failed=true;console.error(error);}
finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);server.httpServer?.closeAllConnections();await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))]);}
process.exit(failed?1:0);
