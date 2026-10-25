import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

/** Synthetic, read-only usability verification of six-department quality disclosure. */
const baseUrl=process.env.PSI_UI_URL||'http://127.0.0.1:4182/';
const outputDir=resolve('artifacts/audit/browser/company-visibility');
await mkdir(outputDir,{recursive:true});
const progress=JSON.parse(await readFile('config/psi-company-progress.json','utf8'));
const expectedBlocked=progress.departments.filter(item=>item.status==='blocked').length;
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const checks=[],pageErrors=[];
page.on('pageerror',e=>pageErrors.push(e.message));
page.on('dialog',d=>d.dismiss());
await page.addInitScript(()=>{
 sessionStorage.setItem('isAdminAuthenticated','true');
 localStorage.setItem('psi_ui_composition_v1',JSON.stringify({version:4,sidebarOrder:['dashboard','settings','reports','ocr-analysis'],hiddenSidebarPages:[]}));
});
await page.route('**/api/admin/auth',r=>r.fulfill({json:{ok:true,authenticated:true}}));
const check=(name,passed,details)=>checks.push({name,passed:Boolean(passed),details});
try{
 await page.goto(baseUrl,{waitUntil:'networkidle'});
 await page.getByText('시스템 설정',{exact:true}).first().click();
 await page.getByRole('heading',{name:'부서별 품질·개선 현황'}).waitFor({state:'visible'});
 const panel=page.locator('#settings-company-qa');
 check('설정에서 품질 현황판 접근',await panel.isVisible(),{menu:'시스템 설정'});
 check('6개 부서 책임 상태 표시',(await panel.locator('[data-psi-department]').count())===6,{expected:6});
 check('실시간 아닌 증거 기준 표시',(await panel.getByText(/실시간 상태가 아닙니다/).count())===1,{snapshot:true});
 check('미검증 자동 합격 방지',await panel.getByText('미검증',{exact:true}).count()>0,{type:'unverified'});
 const urls=await panel.locator('a[href]').evaluateAll(nodes=>nodes.map(n=>({label:n.textContent,href:n.getAttribute('href')})));
 check('검증 근거는 검토 가능한 GitHub 링크',urls.length>=6&&urls.every(x=>x.href?.startsWith('https://github.com/TELLOWSS/NEW-PSI/')),{count:urls.length});
 await panel.getByRole('button',{name:/발견 사항 · 개선 내용 보기/}).first().click();
 check('개선 내용 접기·펼치기',await panel.getByText('개선 및 다음 조치').first().isVisible(),{expanded:true});
 await panel.getByRole('button',{name:'보완 필요'}).click();
 check('보완 필요 부서만 표시',(await panel.locator('[data-psi-department]').count())===expectedBlocked,{expected:expectedBlocked});
 await panel.getByRole('button',{name:'미검증'}).click();
 check('검증하지 않은 디자인 부서 숨기지 않음',(await panel.locator('[data-psi-department]').count())===1&&await panel.locator('[data-psi-department="design"]').count()===1,{expected:'design'});
 await panel.getByRole('button',{name:'전체 부서'}).click();
 await panel.scrollIntoViewIfNeeded();
 await page.screenshot({path:resolve(outputDir,'desktop.png'),fullPage:false});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:850});
  await panel.scrollIntoViewIfNeeded();
  const m=await panel.evaluate(el=>({content:el.scrollWidth,box:el.clientWidth,document:document.documentElement.scrollWidth,viewport:window.innerWidth}));
  check(width+'px 현황판 카드 넘침 없음',m.content<=m.box+2,{width,...m});
  if(width===390)await page.screenshot({path:resolve(outputDir,'mobile.png')});
 }
 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await page.screenshot({path:resolve(outputDir,'dark.png')});
 check('스크립트 오류 없음',pageErrors.length===0,pageErrors);
 const result={pass:checks.every(c=>c.passed),passedCount:checks.filter(c=>c.passed).length,totalCount:checks.length,checks,fixtureOnly:true,source:'settings read-only reviewed snapshot'};
 await writeFile(resolve(outputDir,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log('[verify-psi-company-visibility] '+result.passedCount+'/'+result.totalCount+' checks passed');
 if(!result.pass)process.exitCode=1;
}finally{await browser.close();}
