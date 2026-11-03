import {preview} from 'vite';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base='http://127.0.0.1:3073';
const out='artifacts/audit/psi-platform-field-canvas';
await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:3073,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.setDefaultTimeout(22000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
  await page.route('**/api/admin/training',route=>route.fulfill({json:{ok:true,summary:{trainingSessions:0,trainingSubmissions:0}}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.addInitScript(()=>{
   sessionStorage.setItem('isAdminAuthenticated','true');
   if(!localStorage.getItem('psi_theme_mode'))localStorage.setItem('psi_theme_mode','light');
  });
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:30000});
  const rail=page.getByRole('region',{name:'오늘 현장 업무, 여기서 시작하세요'});
  await rail.waitFor();
  const names=[
   '위험성평가 원문 확인 화면으로 이동',
   '현장 사진점검 화면으로 이동',
   '교육 환류 화면으로 이동',
  ];
  for(const name of names)assert.equal(await rail.getByRole('button',{name}).count(),1,'route action missing: '+name+' at '+width);
  const state=await page.evaluate(()=>{
   const root=document.querySelector('.psi-platform-field-canvas');
   const hero=document.querySelector('.psi-ops-intro');
   const main=document.querySelector('#psi-main-content');
   const fieldRoute=document.querySelector('.psi-ops-field-route');
   if(!root||!hero||!main||!fieldRoute)return{missing:true};
   const heroRect=hero.getBoundingClientRect();
   const routeRect=fieldRoute.getBoundingClientRect();
   return{
    missing:false,
    brand:getComputedStyle(root).getPropertyValue('--psi-brand').trim(),
    heroBackground:getComputedStyle(hero).backgroundImage,
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    heroWidth:heroRect.width,
    routeWidth:routeRect.width,
    routeColumns:getComputedStyle(fieldRoute.querySelector('.psi-ops-field-route-grid')).gridTemplateColumns.split(' ').length,
    minButtonHeight:Math.min(...Array.from(fieldRoute.querySelectorAll('button')).map(el=>el.getBoundingClientRect().height)),
    mainWidth:main.getBoundingClientRect().width,
   };
  });
  assert.equal(state.missing,false,'Field Canvas root not found');
  assert.equal(state.brand,'#117668','brand token mismatch at '+width);
  assert.match(state.heroBackground,/119deg/i,'Field Canvas teal hero overridden by legacy styling at '+width);
  assert.match(state.heroBackground,/rgb\(18, 99, 88\)/i,'teal end stop not applied at '+width);
  assert.equal(state.overflow,false,'horizontal overflow on '+width);
  assert.ok(state.minButtonHeight>=44,'route tap target must be >=44px on '+width);
  assert.ok(state.heroWidth<=width+1,'hero spills on '+width);
  assert.ok(state.routeWidth<=width+1,'start rail spills on '+width);
  if(width<=720)assert.equal(state.routeColumns,1,'phone must stack actions vertically');
  if(width>=1101)assert.equal(state.routeColumns,3,'desktop must show three deliberate actions');
  await page.screenshot({path:`${out}/dashboard-light-${width}.png`,fullPage:false});
  if(width===390){
   await rail.getByRole('button',{name:'현장 사진점검 화면으로 이동'}).click();
   await page.getByRole('heading',{name:'사진만 찍어도 점검을 시작할 수 있습니다'}).waitFor({timeout:30000});
   assert.ok(await page.locator('.si-refresh-hero').count()>=1,'real photo inspection did not open');
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:30000});
   await page.evaluate(()=>localStorage.setItem('psi_theme_mode','dark'));
   await page.reload({waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:30000});
   assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('dark')),'dark mode root not active');
   const brand=await page.locator('.psi-platform-field-canvas').evaluate(el=>getComputedStyle(el).getPropertyValue('--psi-brand').trim());
   assert.equal(brand,'#76deca','dark mode brand token must remain readable');
   await page.screenshot({path:`${out}/dashboard-dark-390.png`,fullPage:false});
  }
  assert.deepEqual(errors,[],'uncaught browser errors at '+width);
  results.push({width,...state,uncaught:errors.length});
  await context.close();
 }
 await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks:results},null,2));
 console.log('PASS PSI platform Field Canvas visual QA: '+results.map(r=>r.width).join(','));
}catch(err){
 await writeFile(`${out}/result.json`,JSON.stringify({result:'FAIL',message:err?.message||String(err),checks:results},null,2));
 throw err;
}finally{
 await browser.close();
 await new Promise(resolve=>server.httpServer.close(resolve));
}
