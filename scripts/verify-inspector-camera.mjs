import {preview} from 'vite';
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const external=process.env.PSI_CAMERA_BASE,base=external||'http://127.0.0.1:3036',out=process.env.PSI_CAMERA_OUT||'artifacts/audit/inspector-camera';
const config=JSON.parse(await readFile('vercel.json','utf8')),headers=Object.fromEntries(config.headers.find(r=>r.source==='/(.*)').headers.map(h=>[h.key,h.value]));
const server=external?null:await preview({build:{outDir:process.env.PSI_CAMERA_DIST||'dist'},preview:{port:3036,host:'127.0.0.1',strictPort:true,headers}});
let proxy;if(external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)){const u=new URL(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);proxy={server:u.protocol+'//'+u.host,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};}
const browser=await chromium.launch({executablePath:process.env.PSI_CHROMIUM_PATH,headless:true,...(proxy?{proxy}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
const results=[];await mkdir(out,{recursive:true});
try{
 for(const scenario of ['landscape','portrait','unsupported','late-stream','native-fallback','storage-blocked']){
  if(process.env.PSI_CAMERA_SCENARIOS&&!process.env.PSI_CAMERA_SCENARIOS.split(',').includes(scenario))continue;
  console.log('START '+scenario);
  const context=await browser.newContext({viewport:scenario==='landscape'?{width:844,height:390}:{width:390,height:900},ignoreHTTPSErrors:!!external,reducedMotion:'reduce'}),page=await context.newPage(),ops=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
  await page.route('**/api/admin/inspector',r=>{const b=r.request().postDataJSON();ops.push(b.op);assert.equal(b.op,'ai-status','Capture must not create, upload or analyze');return r.fulfill({json:{ok:true,ready:true,provider:'gemini',model:'fixture'}});});
  await page.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:'',contentType:'text/css'}));await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'text/css'}));
  if(process.env.PSI_QA_KOREAN_FONT)await page.route('**/__qa-korean.otf',async r=>r.fulfill({body:await readFile(process.env.PSI_QA_KOREAN_FONT),contentType:'font/otf'}));
  await page.addInitScript(scenario=>{
   window.__cameraRequests=[];window.__streams=[];window.__stops=0;window.__torchCalls=[];window.__torchFail=false;
   if(scenario==='storage-blocked'){const get=Storage.prototype.getItem,set=Storage.prototype.setItem;Object.defineProperty(Storage.prototype,'getItem',{value:function(key){if(key==='psi.inspector.camera.mode.v1')throw new DOMException('blocked','SecurityError');return get.call(this,key);}});Object.defineProperty(Storage.prototype,'setItem',{value:function(key,value){if(key==='psi.inspector.camera.mode.v1')throw new DOMException('blocked','SecurityError');return set.call(this,key,value);}});}
   Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async constraints=>{
    window.__cameraRequests.push(constraints);
    if(scenario==='native-fallback')throw new DOMException('denied','NotAllowedError');
    const portrait=constraints.video.aspectRatio.ideal<1&&scenario!=='unsupported',c=document.createElement('canvas');c.width=portrait?720:1280;c.height=portrait?960:720;
    const g=c.getContext('2d');const paint=()=>{g.fillStyle='#214f60';g.fillRect(0,0,c.width,c.height);g.fillStyle='#67b7a5';g.fillRect(0,0,c.width/3,c.height);g.fillStyle='#e4b971';g.fillRect(c.width*2/3,0,c.width/3,c.height);g.fillStyle='white';g.font='30px sans-serif';g.fillText('SYNTHETIC CAMERA',30,80);};paint();const stream=c.captureStream(10),track=stream.getVideoTracks()[0],timer=setInterval(paint,100),stop=track.stop.bind(track);track.stop=()=>{clearInterval(timer);window.__stops++;stop();};if(scenario==='portrait'){let torch=false;const settings=track.getSettings.bind(track);track.getCapabilities=()=>({torch:true});track.getSettings=()=>({...settings(),torch});track.applyConstraints=async constraints=>{window.__torchCalls.push(constraints.advanced[0].torch);if(window.__torchFail)throw new DOMException('blocked','NotAllowedError');torch=constraints.advanced[0].torch;};}window.__streams.push(stream);
    if(scenario==='late-stream'&&window.__cameraRequests.length===1)return new Promise(resolve=>{window.__releaseFirst=()=>resolve(stream);});
    return stream;
   }});
  },scenario);
  await page.goto(base+'/?mode=photo-inspector',{waitUntil:'domcontentloaded'});await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor();
  if(process.env.PSI_QA_KOREAN_FONT){await page.addStyleTag({content:"@font-face{font-family:PSIQA;src:url('/__qa-korean.otf')}body,.si-workspace *{font-family:PSIQA,sans-serif!important}"});await page.evaluate(()=>document.fonts.load('16px PSIQA','가로 촬영'));}
  await page.getByRole('button',{name:'사진 찍고 점검하기',exact:true}).click();const dialog=page.getByRole('dialog',{name:'카메라로 바로 촬영',exact:true});await dialog.waitFor();
  assert.equal(await dialog.getByRole('button',{name:'가로',exact:false}).count(),0,'orientation requires no manual mode selection');
  if(scenario==='native-fallback'){
   await dialog.getByRole('alert').waitFor();assert.equal(await dialog.getByRole('button',{name:'지금 촬영',exact:true}).isDisabled(),true);
   const input=dialog.getByLabel('기기 카메라로 촬영',{exact:true});assert.equal(await input.getAttribute('capture'),'environment');const source=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=720;c.height=960;c.getContext('2d').fillRect(0,0,720,960);return c.toDataURL('image/jpeg').split(',')[1];});await input.setInputFiles({name:'native-portrait.jpg',mimeType:'image/jpeg',buffer:Buffer.from(source,'base64')});
  }else{
   // Repeated rotations must follow the device without a tap, including a return to portrait.
   for(const turn of [{width:390,height:900,ratio:3/4},{width:844,height:390,ratio:16/9},{width:390,height:900,ratio:3/4},{width:844,height:390,ratio:16/9}]){
    await page.setViewportSize({width:turn.width,height:turn.height});
    await page.waitForFunction(ratio=>window.__cameraRequests.at(-1)?.video?.aspectRatio?.ideal===ratio,turn.ratio);
   }
   if(scenario!=='landscape'){
    await page.setViewportSize({width:390,height:900});
    await page.waitForFunction(()=>window.__cameraRequests.at(-1)?.video?.aspectRatio?.ideal===3/4);
   }
   await page.waitForFunction(()=>document.querySelector('.si-camera-actions .si-primary')?.disabled===false);
   if(scenario==='late-stream'){await page.evaluate(()=>window.__releaseFirst());await page.waitForFunction(()=>window.__streams[0].getTracks().every(t=>t.readyState==='ended'));}
   const request=await page.evaluate(()=>window.__cameraRequests.at(-1));assert.equal(request.audio,false);assert.equal(request.video.facingMode.ideal,'environment');assert.equal(request.video.resizeMode.ideal,'none');assert.equal(request.video.aspectRatio.ideal,['landscape'].includes(scenario)?16/9:3/4);assert.ok(!JSON.stringify(request).includes('exact'));
   const actual=await dialog.locator('video').evaluate(v=>({width:v.videoWidth,height:v.videoHeight}));assert.deepEqual(actual,scenario==='landscape'||scenario==='unsupported'?{width:1280,height:720}:{width:720,height:960});
   if(scenario==='unsupported'){assert.match((await dialog.locator('.si-camera-frame-status').textContent())||'',/화면 방향과 카메라 영상 비율이 다릅니다/);assert.equal(await dialog.locator('.si-camera-torch').count(),0,'unsupported devices must not show a torch control');}
   else assert.equal(await dialog.locator('.si-camera-frame-status>span').count(),0);
   if(scenario==='portrait'){
    const light=dialog.getByRole('button',{name:'기기 조명 켜기'});await light.waitFor();await light.click();
    assert.equal(await dialog.getByRole('button',{name:'기기 조명 끄기'}).getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>window.__torchFail=true);await dialog.getByRole('button',{name:'기기 조명 끄기'}).click();
    await dialog.getByText('기기 조명을 변경하지 못했습니다.',{exact:false}).waitFor();assert.equal(await dialog.getByRole('button',{name:'기기 조명 끄기'}).getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>window.__torchFail=false);await dialog.getByRole('button',{name:'기기 조명 끄기'}).click();
    assert.deepEqual(await page.evaluate(()=>window.__torchCalls),[true,false,false]);
    await dialog.getByRole('button',{name:'전면·후면 전환',exact:true}).click();await page.waitForFunction(()=>window.__cameraRequests.at(-1)?.video.facingMode.ideal==='user'&&!document.querySelector('.si-camera-actions .si-primary').disabled);assert.match(await dialog.locator('.si-camera-auto-direction').innerText(),/세로/);assert.equal(await dialog.getByRole('button',{name:'기기 조명 켜기'}).getAttribute('aria-pressed'),'false','switching cameras resets the light state');
   }
   if(scenario==='landscape'){const input=dialog.getByLabel('기기 카메라로 촬영',{exact:true});const chooser=page.waitForEvent('filechooser');await input.click();await chooser;await input.dispatchEvent('cancel',{bubbles:true});await page.waitForFunction(()=>window.__cameraRequests.length>=2&&!document.querySelector('.si-camera-actions .si-primary').disabled);await dialog.getByRole('heading',{name:'카메라로 바로 촬영'}).waitFor();await dialog.locator('.si-camera-heading .si-camera-guide-options > summary').click();await dialog.locator('.si-camera-guide-more>summary').click();await dialog.getByText('구도만 참고로 표시합니다.',{exact:false}).waitFor();await dialog.getByRole('button',{name:'구도 선택 닫기'}).click();}
   if(scenario==='portrait'){
    // New framing questions are selectable in narrow portrait and landscape.
    // They remain guidance, do not claim detection, and do not require a request.
    for(const viewport of [{width:320,height:740},{width:844,height:390}]){
     await page.setViewportSize(viewport);await page.waitForFunction(()=>!document.querySelector('.si-camera-shutter')?.disabled);
     for(const label of ['갱폼','거푸집·동바리','철근','장비']){
      await dialog.getByLabel('구도 선택',{exact:true}).click();
      await dialog.getByText('참고 질문 초안',{exact:false}).waitFor();
      await dialog.getByRole('button',{name:label,exact:true}).click();
      await dialog.getByRole('status').filter({hasText:label+' 촬영 구도 가이드가 적용됐습니다.'}).waitFor();
      await dialog.getByLabel('구도 선택',{exact:true}).click();
      assert.equal(await dialog.getByRole('button',{name:label,exact:true}).getAttribute('aria-pressed'),'true');
      const content=dialog.locator('.si-camera-guide-content');assert.ok(await content.evaluate(e=>e.scrollWidth<=e.clientWidth+1),'guide panel must not overflow horizontally');
      if(!await dialog.locator('.si-camera-guide-more').evaluate(e=>e.open))await dialog.locator('.si-camera-guide-more>summary').click();
      await dialog.getByText('안전한 위치에서',{exact:false}).last().waitFor();
      await dialog.getByRole('button',{name:'구도 선택 닫기'}).click();
     }
    }
    await dialog.getByLabel('구도 선택',{exact:true}).click();await dialog.getByRole('button',{name:'구도 끄기'}).click();
   }
   for(const viewport of [{width:320,height:740},{width:390,height:900},{width:844,height:390}]){await page.setViewportSize(viewport);await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);const shell=await dialog.boundingBox();assert.ok(shell&&Math.abs(shell.width-viewport.width)<3&&Math.abs(shell.height-viewport.height)<3,'mobile capture dialog must fill viewport');assert.ok(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth+1));await dialog.getByRole('button',{name:'지금 촬영',exact:true}).scrollIntoViewIfNeeded();const button=await dialog.getByRole('button',{name:'지금 촬영',exact:true}).boundingBox();assert.ok(button.y>=0&&button.y+button.height<=viewport.height);if(viewport.width===844&&['landscape','portrait'].includes(scenario)){const box=await dialog.locator('.si-camera-stage').boundingBox();assert.ok(Math.abs(box.width/box.height-(16/9))<0.03,'camera stage must retain selected aspect ratio');}if(scenario==='portrait'&&viewport.width<viewport.height){const stage=await dialog.locator('.si-camera-stage').boundingBox(),shutter=await dialog.getByRole('button',{name:'지금 촬영',exact:true}).boundingBox(),flip=await dialog.getByRole('button',{name:'전면·후면 전환',exact:true}).boundingBox();assert.ok(stage&&shutter&&flip&&stage.y+stage.height<=shutter.y,'preview must stay above the shutter');assert.ok(shutter.width>=70&&Math.abs(shutter.width-shutter.height)<2,'shutter must be a large circle');const shutterStyle=await dialog.getByRole('button',{name:'지금 촬영',exact:true}).evaluate(el=>({radius:getComputedStyle(el).borderTopLeftRadius,background:getComputedStyle(el).backgroundColor}));assert.equal(shutterStyle.radius,'50%','shutter must render round');assert.equal(shutterStyle.background,'rgb(245, 250, 248)','shutter must render in the camera color');assert.ok(flip.width>=48&&flip.height>=48,'camera switch touch target must be usable');}
   if(['landscape','portrait'].includes(scenario))await page.screenshot({path:out+'/'+scenario+'-'+viewport.width+'.png'});}
   if(scenario==='landscape'){await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.waitForTimeout(250);await page.screenshot({path:out+'/landscape-dark.png'});await page.evaluate(()=>document.documentElement.classList.remove('dark'));await page.waitForTimeout(250);}
   await page.setViewportSize(scenario==='landscape'?{width:844,height:390}:{width:390,height:900});await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary')?.disabled);await dialog.getByRole('button',{name:'지금 촬영',exact:true}).click();
  }
  const captured=page.getByRole('dialog',{name:'촬영 사진 바로 확인',exact:true});await captured.getByAltText('등록 전 촬영 사진 미리보기').waitFor();await page.waitForFunction(()=>!document.querySelector('.si-camera-actions .si-primary').disabled);const size=await captured.locator('img').evaluate(i=>({width:i.naturalWidth,height:i.naturalHeight}));assert.deepEqual(size,scenario==='landscape'||scenario==='unsupported'?{width:1280,height:720}:{width:720,height:960});
  // Rotate capture without changing server evidence and recover exact source dimensions.
  const initialDownload=page.waitForEvent('download');
  await captured.getByRole('link',{name:'촬영 사진 기기에 저장',exact:true}).click();
  const initialFile=await initialDownload;
  const sourceHash=createHash('sha256').update(await readFile(await initialFile.path())).digest('hex');
  const before=await captured.getByAltText('등록 전 촬영 사진 미리보기').evaluate(i=>({w:i.naturalWidth,h:i.naturalHeight}));
  await captured.getByRole('button',{name:'오른쪽 90°'}).click();
  await page.waitForFunction(({w,h})=>{const i=document.querySelector('img[alt="등록 전 촬영 사진 미리보기"]');return i?.naturalWidth===h&&i?.naturalHeight===w;},before);
  assert.match(await captured.locator('.si-camera-photo-editor-heading').innerText(),/90° 회전/);
  // Original download must be discoverable without scrolling the compact mobile editor.
  for(const viewport of [{width:320,height:740},{width:390,height:900},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   const editor=captured.locator('.si-camera-photo-editor'),original=captured.getByRole('link',{name:'최초 촬영 파일 기기에 저장'});
   await editor.evaluate(element=>{element.scrollTop=0;});
   const bounds=await original.evaluate(element=>{const button=element.getBoundingClientRect(),panel=element.closest('.si-camera-photo-editor').getBoundingClientRect();return {top:button.top,bottom:button.bottom,panelTop:panel.top,panelBottom:panel.bottom};});
   assert.ok(bounds.top>=bounds.panelTop&&bounds.bottom<=bounds.panelBottom&&bounds.top>=0&&bounds.bottom<=viewport.height,'original download is visible without scrolling at '+viewport.width+'x'+viewport.height);
  }
  await page.setViewportSize({width:390,height:900});
  const originalDownload=page.waitForEvent('download');
  await captured.getByRole('link',{name:'최초 촬영 파일 기기에 저장'}).click();
  const downloaded=await originalDownload;
  assert.equal(createHash('sha256').update(await readFile(await downloaded.path())).digest('hex'),sourceHash,'original download matches first captured file byte-for-byte');
  assert.equal(await captured.getByRole('link',{name:'회전한 사본 기기에 저장'}).count(),1,'edited copy is clearly labelled');
  await captured.getByRole('button',{name:'원래 방향'}).click();
  await page.waitForFunction(({w,h})=>{const i=document.querySelector('img[alt="등록 전 촬영 사진 미리보기"]');return i?.naturalWidth===w&&i?.naturalHeight===h;},before);
  page.once('dialog',d=>d.dismiss());
  await captured.getByRole('button',{name:'첫 화면'}).click();
  assert.equal(await captured.getByAltText('등록 전 촬영 사진 미리보기').isVisible(),true,'cancelling home retains the photo');
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;}),true);page.once('dialog',d=>d.dismiss());await captured.getByRole('button',{name:'닫기',exact:true}).click();assert.equal(await captured.getByAltText('등록 전 촬영 사진 미리보기').isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))),true);assert.equal(ops.filter(op=>op!=='ai-status').length,0);
  page.once('dialog',d=>d.dismiss());
  await captured.getByRole('button',{name:'다시 촬영',exact:true}).click();
  assert.equal(await captured.getByAltText('등록 전 촬영 사진 미리보기').isVisible(),true,'cancelling retake retains the unregistered photo');
  page.once('dialog',d=>d.accept());
  await captured.getByRole('button',{name:'다시 촬영',exact:true}).click();await page.getByRole('dialog',{name:'카메라로 바로 촬영',exact:true}).waitFor();assert.match(await page.getByRole('dialog').locator('.si-camera-auto-direction').innerText(),/세로/);
  await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  if(scenario!=='storage-blocked'){
   await page.getByRole('button',{name:'사진 찍고 점검하기',exact:true}).click();await page.locator('.si-camera-auto-direction').waitFor();assert.match(await page.locator('.si-camera-auto-direction').innerText(),/세로/,'portrait phone must open in portrait');await page.getByRole('dialog').getByRole('button',{name:'닫기',exact:true}).click();await page.waitForFunction(()=>window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended')));
  }
  assert.deepEqual(errors,[]);assert.equal(ops.filter(op=>op!=='ai-status').length,0);results.push({scenario,status:'PASS',captured:size,businessWrites:0,paidAI:0,allStreamsStopped:true});console.log('PASS '+scenario);await context.close();
 }
 await writeFile(out+'/simulation.json',JSON.stringify({externalFrontend:!!external,results},null,2));console.log(JSON.stringify({status:'PASS',scenarios:results.length}));
}catch(error){console.error(error);throw error;}finally{await browser.close();await server?.close();}
