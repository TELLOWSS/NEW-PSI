import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
import {chromium} from 'playwright';
const server=await createServer({server:{port:0,host:'127.0.0.1'}});
await server.listen();
const base='http://127.0.0.1:'+server.httpServer.address().port;
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});
 const page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/api/'))requests.push(request.url());});
 await page.goto(base+'/scripts/inspector-safety-card-fixture.html',{waitUntil:'domcontentloaded'});
 const deck=page.locator('[data-psi-safety-deck="v1"]');
 await deck.waitFor();
 assert.equal(await deck.getByRole('navigation',{name:'안전카드 종류'}).locator('button').count(),5);
 await deck.getByText('합성 위험 단서 1').waitFor();
 await deck.getByRole('button',{name:'위험 2'}).click();
 await deck.getByText('합성 위험 단서 2').waitFor();
 const riskTheme=await deck.locator('.si-safety-card').evaluate(el=>getComputedStyle(el).backgroundImage);
 assert.match(riskTheme,/linear-gradient/,'risk card has premium dark atmosphere');
 await deck.getByRole('button',{name:'이 위험에 필요한 조치 살펴보기'}).click();
 assert.equal(await deck.locator('.si-safety-card').getAttribute('data-panel'),'action','summary connects directly to action');
 const actionColor=await deck.locator('.si-safety-card').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(actionColor,'rgb(248, 251, 249)','action card uses deliberately light professional theme');
 await deck.getByRole('button',{name:'조치 제안'}).click();
 await deck.getByText('현장에서 이격 상태를 확인하세요.',{exact:false}).waitFor();
 await deck.getByRole('button',{name:'현장 대조'}).click();
 assert.equal(await deck.locator('.si-safety-card').getAttribute('data-panel'),'evidence');
 await deck.getByText('점검자 진술 · AI 판독 아님').waitFor();
 await deck.getByText('추정 · 확인된 사실 아님').waitFor();
 await deck.getByRole('button',{name:'법령·사례'}).click();
 const legalColor=await deck.locator('.si-safety-card').evaluate(el=>getComputedStyle(el).backgroundColor);
 assert.equal(legalColor,'rgb(248, 251, 249)','legal card is light and readable');
 await deck.getByText('합성 법령 검토 후보 · 실제 법령 아님').waitFor();
 await deck.getByText('기존 자료 · 검토 이력 보완 필요').waitFor();
 await deck.getByRole('button',{name:'보고·공유'}).click();
 await deck.getByRole('button',{name:'사진·조치 전달 카드 만들기'}).click();
 assert.equal(await page.locator('#compose-count').innerText(),'1');
 await deck.getByRole('button',{name:'상세 점검·보고서 단계로 이동'}).click();
 assert.equal(await page.locator('#details-count').innerText(),'1');
 await page.locator('#toggle-rejected').click();
 await deck.getByRole('button',{name:'위험 요약'}).click();
 await deck.getByText('전문가 의견을 우선 확인하세요').waitFor();
 await deck.getByText('합성 전문가 판단: 사진만으로 상태 확정 불가').waitFor();
 await page.locator('#toggle-saved').click();
 await deck.getByText('AI 해석 미수용',{exact:true}).first().waitFor();
 await page.locator('#toggle-rejected').click();
 await deck.getByText('전문가 검토 저장',{exact:true}).waitFor();
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    assert.equal(over,false,'card UI must not overflow at '+viewport.width+'x'+viewport.height);
    const rect=await deck.locator('.si-safety-card').boundingBox();
    assert.ok(rect&&rect.width<=viewport.width,'card exceeds screen width');
 }
 // Simulation matrix: four content states, five screens, all five card types.
 const screenshotDir=path.resolve('artifacts/audit/inspector-safety-cards');
 await mkdir(screenshotDir,{recursive:true});
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    for(const label of ['위험 요약','조치 제안','현장 대조','법령·사례','보고·공유']){
      await deck.getByRole('button',{name:label}).click();
      await deck.locator('.si-safety-card').waitFor();
      const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
      assert.equal(over,false,label+' creates document overflow at '+viewport.width+'x'+viewport.height);
      const rect=await deck.locator('.si-safety-card').boundingBox();
      assert.ok(rect&&rect.width<=viewport.width,label+' has no horizontal crop at '+viewport.width);
      if(viewport.width===390||viewport.width===844){
        const file=path.join(screenshotDir,viewport.width+'x'+viewport.height+'-'+deckSanitize(label)+'.png');
        await page.screenshot({path:file,fullPage:true});
      }
    }
 }
 await page.setViewportSize({width:390,height:844});
 await deck.getByRole('button',{name:'위험 요약'}).click();
 await page.locator('#toggle-photo').click();
 await deck.getByText('사진 미리보기 없음').waitFor();
 assert.equal(await deck.locator('.si-safety-card-media img').count(),0,'missing photo is explicit');
 await page.locator('#toggle-photo').click();
 const photo=deck.locator('.si-safety-card-media img');
 await photo.waitFor();assert.equal(await photo.evaluate(img=>img.complete&&img.naturalWidth>0),true,'synthetic photo loaded before PNG export');
 await page.locator('#toggle-empty').click();
 await deck.getByText('구체적 위험 특정 전').waitFor();
 assert.equal(await deck.getByRole('group',{name:'위험 단서 전환'}).count(),0,'no fake finding cards');
 await page.locator('#toggle-empty').click();
 await deck.getByText('합성 위험 단서 1').waitFor();
 await page.locator('#toggle-long').click();
 await deck.getByText(/합성 위험 단서 1 긴 설명/).waitFor();
 for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390}]){
   await page.setViewportSize(viewport);
   for(const label of ['위험 요약','조치 제안','현장 대조']){
     await deck.getByRole('button',{name:label}).click();
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'long text overflow in '+label+' at '+viewport.width);
   }
 }
 await page.locator('#toggle-long').click();
 await deck.getByRole('button',{name:'위험 요약'}).click();
 await page.setViewportSize({width:390,height:844});
 function deckSanitize(s){return s==='위험 요약'?'risk':s==='조치 제안'?'action':s==='현장 대조'?'evidence':s==='법령·사례'?'reference':'handoff';}
 
 const download=page.waitForEvent('download',{timeout:20000});
 await deck.getByRole('button',{name:'카드 저장·공유'}).click();
 const saved=await download;
 assert.match(saved.suggestedFilename(),/^PSI_SAFETY_RISK_.*\.png$/,'the current selected card has an exportable PNG');
 const png=await readFile(await saved.path());
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a','export is real PNG');
 assert.ok(png.readUInt32BE(16)>=390&&png.readUInt32BE(20)>300,'PNG has meaningful card dimensions');
 assert.ok(png.byteLength>5000,'PNG has nontrivial image content');
 assert.equal(await deck.getByText('현재 카드 PNG 저장을 요청했습니다.',{exact:false}).count(),1);
  assert.deepEqual(requests,[],'card presentation must not initiate network API calls');
 // Do not hide a broken photo behind a visually attractive (but misleading) card.
 await page.locator('#toggle-photo').click();
 await page.locator('#toggle-photo').click();
 await deck.locator('.si-safety-card-media img').evaluate(img=>img.src='data:image/png;base64,not-a-real-photo');
 await deck.getByRole('button',{name:'카드 저장·공유'}).click();
 await deck.getByText('카드 이미지 생성에 실패했습니다.',{exact:false}).waitFor();
 assert.deepEqual(errors,[],'no browser runtime errors');
 await context.close();
 console.log('PASS PSI safety cards: five panels, real status boundaries, inspector rejection, share handoff and responsive viewports');
}finally{
 await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
 server.httpServer?.closeAllConnections();
 await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
}
