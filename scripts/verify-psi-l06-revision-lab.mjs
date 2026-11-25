// L06 synthetic-only visual regression. Never loads an authenticated API or real worker record.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const vite = resolve('node_modules/vite/bin/vite.js');
const path = '/_dev/psi-l06-revisions';
const servers = [];
const sleep = ms => new Promise(done => setTimeout(done,ms));
const server = (mode, port) => {
  const args = mode === 'dev'
    ? [vite,'--host','127.0.0.1','--port',String(port),'--strictPort']
    : [vite,'preview','--host','127.0.0.1','--port',String(port),'--strictPort'];
  const child = spawn(process.execPath,args,{stdio:'ignore'});
  servers.push(child);
  return 'http://127.0.0.1:' + port;
};
async function ready(host) {
  for(let i=0;i<100;i++){
    try { if((await fetch(host+path)).ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('L06 dev/production route did not become available: '+host);
}
let browser;
try {
  const dev = server('dev',5197);
  await ready(dev);
  browser = await chromium.launch({headless:true});
  const results=[];
  await mkdir('artifacts/audit/psi-l06-revision-lab',{recursive:true});
  for(const width of [390,1280]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    const api=[],external=[];
    await page.route('**/*',async route=>{
      const url=route.request().url();
      if(url.includes('/api/') || url.includes('/rest/v1/') || url.includes('/rpc/')){
        api.push(url);return route.abort();
      }
      if(!url.startsWith(dev+'/')&&!url.startsWith('data:')&&!url.startsWith('blob:')){
        external.push(url);return route.abort();
      }
      await route.continue();
    });
    await page.goto(dev+path,{waitUntil:'domcontentloaded'});
    await page.getByRole('heading',{name:'근로자 보완기록 대조 · 개발 검수'}).waitFor();
    await page.getByTestId('psi-l06-revision-evidence').waitFor();
    const timeline = page.getByTestId('psi-l06-evidence-timeline');
    await timeline.waitFor();
    assert.equal(await timeline.locator('time').count(),4,'Four real-source evidence timestamps are expected');
    assert.ok((await timeline.textContent()).includes('한국시간(KST)'),'Time zone must be visible');
    assert.ok((await timeline.textContent()).includes('보완본 별도 접수'),'Show independent replacement receipt');
    assert.equal(await page.locator('article').count(),5);
    assert.ok(await page.getByText('문구 변경').count()>=2);
    assert.ok(await page.getByText('원문 동일').count()>=1);
    assert.equal(await page.getByTestId('psi-l06-changed-count').textContent(),'2');
    await page.getByRole('button',{name:'변경 문항만 보기 (2)'}).click();
    assert.equal(await page.locator('article').count(),2,'Changed-only manager review must show exactly 2 paragraphs');
    await page.screenshot({path:`artifacts/audit/psi-l06-revision-lab/${width}-changed-only.png`,fullPage:true});
    await page.getByRole('button',{name:'전체 5문항 보기'}).click();
    assert.equal(await page.locator('article').count(),5,'Manager review must restore every original paragraph');
    assert.equal(await page.locator('button[aria-pressed="true"]').count(),1);
    assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,
      'Unexpected horizontal overflow: '+width);
    await page.screenshot({path:`artifacts/audit/psi-l06-revision-lab/${width}-valid.png`,fullPage:true});
    await page.getByRole('button',{name:'다른 현장 연결 차단 시험'}).click();
    await page.getByTestId('psi-l06-revision-unavailable').waitFor();
    assert.equal(await page.getByTestId('psi-l06-evidence-timeline').count(),0,
      'Cross-site source chronology must not leak');
    assert.equal(await page.locator('article').count(),0,'Cross-site data must never be shown');
    await page.screenshot({path:`artifacts/audit/psi-l06-revision-lab/${width}-cross-site-blocked.png`,fullPage:true});
    await page.getByRole('button',{name:'정상 보완 대조'}).click();
    await page.getByTestId('psi-l06-revision-evidence').waitFor();
    assert.deepEqual(api,[],'No backend access allowed in synthetic lab');
    assert.deepEqual(external,[],'No external services allowed in synthetic lab');
    results.push({width,questionPairs:5,serverTimestamps:4,chronologyDisplay:'Asia/Seoul',changedOnlyPairs:2,changeFilterRestoresOriginals:true,
      crossSiteBlocked:true,apiCalls:0,externalCalls:0});
    await page.close();
  }
  const prod = server('preview',5198);
  await ready(prod);
  const prodPage = await browser.newPage({viewport:{width:390,height:844}});
  await prodPage.goto(prod+path,{waitUntil:'domcontentloaded'});
  await prodPage.getByRole('alert').getByText('해당 내부 검수 화면은 운영 환경에서 제공되지 않습니다.').waitFor();
  assert.equal(await prodPage.getByTestId('psi-l06-revision-lab').count(),0,
    'Synthetic lab must be excluded in production mode');
  await prodPage.close();
  await writeFile('artifacts/audit/psi-l06-revision-lab/result.json',
    JSON.stringify({status:'SYNTHETIC_PASS',mode:'DEV_ONLY',screens:results,
      productionDenied:true,androidVerified:false,realAuthorizationVerified:false,
      serverSubmissionVerified:false},null,2)+'\n');
  console.log('[PSI L06] SYNTHETIC_PASS: 390/1280 compare/deny; dev-only route, no API/external calls');
} finally {
  await browser?.close();
  for(const p of servers) p.kill('SIGTERM');
}
