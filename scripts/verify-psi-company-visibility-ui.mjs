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
 for(const name of ['아틀라스','나비','루미','코어','세이프','키퍼','프루프']) check(name+' 책임 애칭 노출',(await panel.getByText(name,{exact:false}).count())>0,{name});
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
 // L20: verify real Chromium focus/scroll behavior across CSS lg breakpoint.
 // All test data are synthetic; no live Auth, Supabase, paid API or worker data.
 await page.setViewportSize({width:390,height:850});
 const moreButton=page.locator('.psi-mobile-nav button[aria-haspopup="dialog"]');
 await moreButton.click();
 const mobileDrawer=page.locator('#psi-mobile-navigation-dialog');
 await mobileDrawer.waitFor({state:'visible'});
 const phoneOpen=await page.evaluate(()=>document.body.style.overflow==='hidden');
 check('모바일 전체메뉴 진입 시 실제 body 스크롤 잠금',phoneOpen,{width:390});
 check('모바일 모달에서 뒤쪽 본문·데스크톱 메뉴·본문 바로가기가 inert',await page.evaluate(()=>{
    const background=document.querySelector('[data-psi-shell-background]');
    const desktop=document.querySelector('[data-psi-desktop-sidebar]');
    const skipLink=document.querySelector('a[href="#psi-main-content"]');
    const button=background?.querySelector('button');
    button?.focus();
    return Boolean(background?.inert && desktop?.inert && skipLink?.inert &&
        button && document.activeElement!==button);
 }),{mode:'synthetic Chromium native inert'});
 await page.setViewportSize({width:1200,height:850});
 await page.waitForFunction(()=>!document.getElementById('psi-mobile-navigation-dialog'));
 const restored=await page.evaluate(()=>({
    bodyOverflow:document.body.style.overflow,
    desktopFocused:Boolean(document.activeElement?.matches(
        '[data-psi-desktop-sidebar] [aria-current="page"]')),
 }));
 check('1024px 전환에서 숨겨진 메뉴 종료·body 스크롤 복원',
    restored.bodyOverflow!=='hidden',restored);
 check('모바일 모달 종료 시 본문·데스크톱 메뉴·본문 바로가기 inert 해제',
    await page.evaluate(()=>{
       return ['[data-psi-shell-background]','[data-psi-desktop-sidebar]',
           'a[href="#psi-main-content"]'].every(selector=>
               document.querySelector(selector)?.inert===false);
    }),{width:1200});
 check('모바일 opener가 사라진 뒤 활성 데스크톱 메뉴에 키보드 포커스 복귀',
    restored.desktopFocused,restored);
 await page.setViewportSize({width:390,height:850});
 await moreButton.click();
 await mobileDrawer.waitFor({state:'visible'});
 await page.keyboard.press('Escape');
 await mobileDrawer.waitFor({state:'detached'});
 const escReturn=await page.evaluate(()=>document.activeElement?.matches(
    '.psi-mobile-nav button[aria-haspopup="dialog"]')===true &&
    document.body.style.overflow!=='hidden');
 check('Escape 닫기 시 모바일 더보기 버튼·스크롤 복귀',escReturn,{width:390});
 check('Escape 종료 후 모바일 배경 inert 제거',await page.evaluate(()=>
     document.querySelector('[data-psi-shell-background]')?.inert===false
 ),{width:390});

 // L22: Choosing a route must focus the content, not return to '더보기'.
 // Test both the already-current page and a new route; the former does not
 // trigger Layout's currentPage effect and used to leave focus on the opener.
 await moreButton.click();
 await mobileDrawer.waitFor({state:'visible'});
 await mobileDrawer.locator('.psi-sidebar-item[aria-current="page"]').first().click();
 await mobileDrawer.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.activeElement?.id==='psi-main-content',null,{timeout:3000}).catch(()=>{});
 check('모바일 메뉴에서 현재 페이지 선택 시 새 작업화면으로 포커스 이동',
     await page.evaluate(()=>document.activeElement?.id==='psi-main-content' &&
         document.querySelector('[data-psi-shell-background]')?.inert===false),{type:'same-route'});
 await moreButton.click();
 await mobileDrawer.waitFor({state:'visible'});
 const otherRoute=mobileDrawer.locator('.psi-sidebar-item:not([aria-current="page"])').first();
 await otherRoute.click();
 await mobileDrawer.waitFor({state:'detached'});
 await page.waitForFunction(()=>document.activeElement?.id==='psi-main-content',null,{timeout:3000}).catch(()=>{});
 check('모바일 메뉴로 다른 페이지 이동 시 포커스·스크롤 잠금·inert 복원',
     await page.evaluate(()=>document.activeElement?.id==='psi-main-content' &&
         document.body.style.overflow!=='hidden' &&
         document.querySelector('[data-psi-shell-background]')?.inert===false),{type:'route-change'});

 await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
 await page.screenshot({path:resolve(outputDir,'dark.png')});
 check('스크립트 오류 없음',pageErrors.length===0,pageErrors);
 const result={pass:checks.every(c=>c.passed),passedCount:checks.filter(c=>c.passed).length,totalCount:checks.length,checks,fixtureOnly:true,source:'settings read-only reviewed snapshot'};
 await writeFile(resolve(outputDir,'result.json'),JSON.stringify(result,null,2)+'\n');
 console.log('[verify-psi-company-visibility] '+result.passedCount+'/'+result.totalCount+' checks passed');
 if(!result.pass)process.exitCode=1;
}finally{await browser.close();}
