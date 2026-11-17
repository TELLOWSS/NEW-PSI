import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto(new URL('/tests/fixtures/evidence-panels.html',process.env.PSI_UI_URL||'http://127.0.0.1:4194/').href);
 const panel=page.getByRole('region',{name:'교육·현장 확인 근거'});
 await panel.getByRole('heading',{name:'교육 전달 기록 근거 30회'}).waitFor();
 assert.equal(await panel.locator('li').count(),25);
 await panel.getByRole('button',{name:'근거 25개 더 보기'}).click();
 assert.equal(await panel.locator('li').count(),30);
 await panel.getByRole('button',{name:'현장 관찰 기록 0회'}).click();
 await panel.getByRole('button',{name:'교육 전달 기록 30회'}).click();
 assert.equal(await panel.locator('li').count(),25);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'overflow at '+width);
 }
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
 await page.evaluate(()=>document.documentElement.classList.add('dark'));
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 34, 50)');
 await page.emulateMedia({forcedColors:'active'});
 assert.equal(await panel.getByRole('button',{name:'교육 전달 기록 30회'}).isVisible(),true);
 await page.emulateMedia({forcedColors:'none',media:'print'});
 await panel.locator('details').first().evaluate(el=>el.open=true);
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
 assert.equal(await panel.locator('li').count(),30,'print includes all selected evidence');
 assert.equal(await panel.locator('details[open]').count(),30,'print expands evidence notes');
 assert.equal(await panel.getByRole('button',{name:'교육 전달 기록 30회'}).isVisible(),true,'print retains counts');
 assert.equal(await panel.getByRole('button',{name:'이 근거의 기록 열기'}).first().isVisible(),false);
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).color),'rgb(0, 0, 0)');
 await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 await page.emulateMedia({media:'screen'});
 assert.equal(await panel.locator('li').count(),25);
 assert.equal(await panel.locator('details[open]').count(),1,'restore pre-print disclosure');
 console.log('PASS: evidence light/dark/forced-colors, bounded list, full print and screen restoration');
} finally {await browser.close();}
