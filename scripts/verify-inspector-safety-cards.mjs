import assert from 'node:assert/strict';
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
 await deck.getByRole('button',{name:'조치 제안'}).click();
 await deck.getByText('현장에서 이격 상태를 확인하세요.',{exact:false}).waitFor();
 await deck.getByRole('button',{name:'현장 대조'}).click();
 await deck.getByText('점검자 진술 · AI 판독 아님').waitFor();
 await deck.getByText('추정 · 확인된 사실 아님').waitFor();
 await deck.getByRole('button',{name:'법령·사례'}).click();
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
 await deck.getByText('전문가 검토 저장',{exact:true}).waitFor();
 for(const viewport of [{width:320,height:740},{width:390,height:844},{width:844,height:390},{width:768,height:1024},{width:1440,height:900}]){
    await page.setViewportSize(viewport);
    const over=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    assert.equal(over,false,'card UI must not overflow at '+viewport.width+'x'+viewport.height);
    const rect=await deck.locator('.si-safety-card').boundingBox();
    assert.ok(rect&&rect.width<=viewport.width,'card exceeds screen width');
 }
 assert.deepEqual(requests,[],'card presentation must not initiate network API calls');
 assert.deepEqual(errors,[],'no browser runtime errors');
 await context.close();
 console.log('PASS PSI safety cards: five panels, real status boundaries, inspector rejection, share handoff and responsive viewports');
}finally{
 await Promise.race([browser.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
 server.httpServer?.closeAllConnections();
 await Promise.race([server.close(),new Promise(resolve=>setTimeout(resolve,3000))]);
}
