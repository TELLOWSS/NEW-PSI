import {createServer} from 'vite';import {chromium} from 'playwright';import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const server=await createServer({server:{port:0,host:'127.0.0.1'}});await server.listen();const base=`http://127.0.0.1:${server.httpServer.address().port}`;const browser=await chromium.launch({headless:true});
let failed=false;
try{for(const failure of [false,true]){const context=await browser.newContext({viewport:{width:320,height:740}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{const c=document.createElement('canvas');c.width=640;c.height=480;const g=c.getContext('2d');g.fillStyle='#00ff00';g.fillRect(0,0,640,480);const stream=c.captureStream(10);return stream;}});});
await page.goto(base+'/scripts/inspector-lens-fixture.html'+(failure?'?failure=1':''));const dialog=page.getByRole('dialog');await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);
const guideButton=dialog.locator('.si-camera-heading .si-camera-guide-options');
for(const viewport of [{width:320,height:568},{width:320,height:740},{width:390,height:844},{width:844,height:390}]){
 await page.setViewportSize(viewport);
 const r=await guideButton.boundingBox();const header=await dialog.locator('.si-camera-heading').boundingBox();
 assert.ok(r&&r.width<=90&&r.height<=46,'closed guide toolbar control must be compact');
 assert.ok(header&&r.y>=header.y-1&&r.y+r.height<=header.y+header.height+2,'guide stays in header, never floating over video');
 assert.ok(r.x+r.width<=viewport.width-2,'guide does not escape narrow phone');
 assert.equal(await dialog.locator('.si-camera-guide-content').isVisible(),false,'closed guide sheet is hidden');
}
await page.setViewportSize({width:320,height:740});
await guideButton.locator(':scope > summary').click();
assert.equal(await guideButton.getAttribute('open'),'','guide opens on demand');
const sheet=await dialog.locator('.si-camera-guide-content').boundingBox();
assert.ok(sheet&&sheet.width<=320&&sheet.x>=0&&sheet.x+sheet.width<=321,'on-demand guide sheet fits narrow phone');
await mkdir('artifacts/audit/inspector-lens',{recursive:true});
await page.screenshot({path:'artifacts/audit/inspector-lens/dock-open-320.png'});
assert.ok(sheet.y>=100&&sheet.height<=260,'dock sits in the lower control zone, not as a full-height floating overlay');
const shutter=await dialog.locator('.si-camera-actions').boundingBox();
assert.ok(shutter&&sheet.y+sheet.height<=shutter.y+3,'guide dock stops before shutter controls');
assert.equal(await dialog.locator('.si-camera-reference-controls').isVisible(),false,'reference settings are hidden only while choosing a composition');
for(const size of [{width:390,height:844},{width:844,height:390}]){
  await page.setViewportSize(size);
  const dock=await dialog.locator('.si-camera-guide-content').boundingBox();
  const bar=await dialog.locator('.si-camera-actions').boundingBox();
  assert.ok(dock&&bar&&dock.x>=-1&&dock.x+dock.width<=size.width+1,'guide dock fits viewport '+size.width);
  assert.ok(dock.y+dock.height<=bar.y+3,'guide dock never overlaps shutter '+size.width);
  await page.screenshot({path:'artifacts/audit/inspector-lens/dock-open-'+size.width+'.png'});
}
await page.setViewportSize({width:320,height:740});
await dialog.getByLabel('3×3 격자').check();assert.equal(await dialog.locator('.si-camera-grid').count(),1);
const guideGroup=dialog.getByRole('group',{name:'촬영할 대상'});
await guideGroup.getByRole('button',{name:'시스템비계'}).click();await dialog.locator('.si-camera-target-scaffold').waitFor();
const sweep=await dialog.locator('.si-camera-target-sweep').evaluate(el=>({name:getComputedStyle(el).animationName,area:el.getBoundingClientRect().width}));
assert.match(sweep.name,/si-target-scan-pass/,'dramatic scan plays on selection');assert.ok(sweep.area>10);
assert.equal(await dialog.locator('.si-camera-target-overlay').getAttribute('aria-hidden'),'true');
assert.equal(await dialog.locator('.si-camera-guide-options').getAttribute('open'),null,'guide choices close to return to camera');
assert.equal(await dialog.locator('.si-camera-reference-controls').isVisible(),true,'reference settings return after guide selection');
await guideButton.locator(':scope > summary').click();await dialog.locator('.si-camera-guide-more>summary').click();await dialog.getByText('발판·지지부와 주변', {exact:false}).waitFor();
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'개구부'}).click();await dialog.locator('.si-camera-target-opening').waitFor();
await guideButton.locator(':scope > summary').click();
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'양중'}).click();await dialog.locator('.si-camera-target-lifting').waitFor();
await page.reload();await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);
assert.equal(await dialog.locator('.si-camera-grid').count(),1,'grid setting is remembered in this session');
assert.equal(await dialog.locator('.si-camera-target-overlay').count(),0,'guide does not carry into a new camera session');
await guideButton.locator(':scope > summary').click();
assert.equal(await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'시스템비계'}).getAttribute('aria-pressed'),'false');
await dialog.getByRole('group',{name:'촬영할 대상'}).getByRole('button',{name:'시스템비계'}).click();
await dialog.locator('.si-camera-target-scaffold').waitFor();
if(failure){await dialog.getByText('기준 사진을 불러오지 못했습니다.',{exact:false}).waitFor();assert.equal(await dialog.locator('.si-camera-reference').count(),0);}else{const overlay=dialog.locator('.si-camera-reference');await overlay.waitFor();assert.equal(await overlay.evaluate(e=>getComputedStyle(e).opacity),'0.5');await dialog.getByLabel('기준 사진 겹침 투명도').selectOption('75');assert.equal(await overlay.evaluate(e=>getComputedStyle(e).opacity),'0.75');await dialog.getByRole('button',{name:'기준 사진 끄기'}).click();assert.equal(await overlay.count(),0);await dialog.getByRole('button',{name:'기준 사진 켜기'}).click();await overlay.waitFor();}
for(const size of [{width:320,height:740},{width:390,height:844},{width:844,height:390}]){await page.setViewportSize(size);const geometry=await dialog.evaluate(e=>({scroll:e.scrollWidth,client:e.clientWidth,viewport:innerWidth,problem:Array.from(e.querySelectorAll('*')).map(n=>{const r=n.getBoundingClientRect();return {name:n.tagName.toLowerCase()+'.'+String(n.className).slice(0,55),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),client:n.clientWidth,scroll:n.scrollWidth};}).filter(v=>v.right>innerWidth+3||v.left< -3||v.scroll>v.client+5).slice(0,18),style:{overflow:getComputedStyle(e).overflowX,padding:getComputedStyle(e).paddingRight}}));assert.ok(geometry.scroll<=geometry.client+1,'horizontal overflow at '+size.width+': '+JSON.stringify(geometry));}
await page.setViewportSize({width:390,height:844});await dialog.getByRole('button',{name:'지금 촬영'}).click();await dialog.getByAltText('등록 전 촬영 사진 미리보기').waitFor();assert.equal(await dialog.locator('.si-camera-reference').count(),0);assert.equal(await dialog.locator('.si-camera-grid').count(),0);assert.equal(await dialog.locator('.si-camera-target-overlay').count(),0,'composition guide must disappear after capture');await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);await dialog.getByRole('button',{name:'이 사진 사용'}).click();const pixels=await page.evaluate(async()=>{const img=new Image();img.src=URL.createObjectURL(window.captured);await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return [[100,100],[213,160],[426,320]].map(([x,y])=>[...g.getImageData(x,y,1,1).data]);});for(const pixel of pixels)assert.ok(pixel[1]>220&&pixel[0]<30&&pixel[2]<30,'captured image contains video only, without the reference or grid');assert.deepEqual(errors,[]);console.log('PASS lens '+(failure?'reference failure':'overlay controls and capture pixels'));await context.close();}}
catch(error){failed=true;console.error(error);}
finally{await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);server.httpServer?.closeAllConnections();await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))]);}
process.exit(failed?1:0);
