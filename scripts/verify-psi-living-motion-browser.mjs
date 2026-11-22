import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

// Real computed CSS on the built operator shell; no real data, logins, or network calls.
const root='http://127.0.0.1:3091';
const out='artifacts/audit/psi-living-visual';
await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:3091,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[];
try {
 for(const motion of ['no-preference','reduce']){
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:motion});
  const page=await context.newPage();
  page.setDefaultTimeout(30000);
  await page.route('**/api/admin/auth',route=>route.fulfill({json:{ok:true,authenticated:true}}));
  await page.route('**/api/admin/training',route=>route.fulfill({json:{ok:true,summary:{trainingSessions:0,trainingSubmissions:0}}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.route('https://fonts.gstatic.com/**',route=>route.fulfill({body:''}));
  await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.addInitScript(()=>sessionStorage.setItem('isAdminAuthenticated','true'));
  await page.goto(root+'/',{waitUntil:'domcontentloaded'});
  await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:40000});
  await page.getByRole('button',{name:'시스템 설정',exact:true}).click();
  const header=page.locator('.psi-app-shell.psi-platform-field-canvas .psi-page-header.psi-living-page-enter').first();
  await header.waitFor({state:'visible'});
  const state=await page.evaluate(()=>{
   const shell=document.querySelector('.psi-app-shell.psi-platform-field-canvas');
   const sidebar=shell?.querySelector('.psi-sidebar');
   const header=shell?.querySelector('.psi-page-header.psi-living-page-enter');
   return {
    shell:!!shell,sidebar:!!sidebar,header:!!header,
    animation:header?getComputedStyle(header).animationName:null,
    transition:sidebar?getComputedStyle(sidebar).transitionDuration:null,
    reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,
   };
  });
  assert.equal(state.shell&&state.sidebar&&state.header,true,'Operator shell/motion node unavailable');
  assert.equal(state.reduced,motion==='reduce','Media emulation not respected');
  if(motion==='reduce'){
   assert.equal(state.animation,'none','Reduced motion must disable page entrance');
   assert.ok((state.transition||'0s').split(',').every(x=>parseFloat(x)===0),
    'Reduced motion must disable sidebar transition');
  } else {
   assert.ok(state.animation?.includes('psi-living-page-enter'),'Normal motion page entrance missing');
   assert.ok((state.transition||'0s').split(',').some(x=>parseFloat(x)>0),
    'Normal motion sidebar transition missing');
  }
  checks.push({motion,state});
  await page.screenshot({path:`${out}/operator-${motion}.png`,fullPage:false});
  await context.close();
 }
 await writeFile(out+'/result.json',JSON.stringify({result:'PASS',syntheticChromium:true,realDevice:false,checks},null,2));
 console.log('[PSI VISUAL] PASS normal and reduced-motion real rendered Chromium CSS, operator shell only');
} catch(error) {
 await writeFile(out+'/result.json',JSON.stringify({result:'FAIL',message:String(error),checks},null,2));
 throw error;
} finally {
 await browser.close();
 await new Promise(resolve=>server.httpServer.close(resolve));
}
