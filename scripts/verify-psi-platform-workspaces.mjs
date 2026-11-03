import {preview} from 'vite';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';

const base='http://127.0.0.1:3075';
const out='artifacts/audit/psi-platform-workspaces';
await mkdir(out,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:3075,strictPort:true}});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const checks=[];
try {
 for (const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors=[];
  page.setDefaultTimeout(24000);
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
  const goHome=async()=>{
   await page.goto(base+'/',{waitUntil:'domcontentloaded'});
   await page.getByRole('heading',{name:'현장 안전, 한눈에.'}).waitFor({timeout:32000});
  };
  const goEducation=async()=>{
   await goHome();
   await page.getByRole('button',{name:'교육 환류 화면으로 이동'}).click();
   await page.locator('[data-psi-screen="education-return"]').waitFor({timeout:32000});
  };
  const inspect=async(id,selector)=>{
   const root=page.locator(selector);
   await root.waitFor({timeout:32000});
   const metrics=await root.evaluate(el=>{
    const rect=el.getBoundingClientRect();
    const main=document.querySelector('#psi-main-content');
    const styles=getComputedStyle(el);
    return{
     width:rect.width,
     x:rect.x,
     documentOverflow:document.documentElement.scrollWidth>innerWidth+2,
     background:styles.backgroundImage,
     mainWidth:main?.getBoundingClientRect().width||0,
     buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0)
      .slice(0,16).map(b=>({name:(b.getAttribute('aria-label')||b.innerText||'').trim().slice(0,45),height:Math.round(b.getBoundingClientRect().height)})),
    };
   });
   assert.ok(metrics.width>0 && metrics.width<=width+2,id+' root width on '+width+': '+metrics.width);
   assert.ok(metrics.x>=-1,id+' screen begins outside viewport on '+width+': '+metrics.x);
   assert.equal(metrics.documentOverflow,false,id+' document scroll overflow on '+width);
   await page.screenshot({path:`${out}/${id}-${width}.png`,fullPage:false});
   checks.push({width,id,...metrics});
   return metrics;
  };
  await goEducation();
  const edu=await inspect('education','[data-psi-screen="education-return"]');
  assert.ok(await page.locator('[data-education-return="three-step-flow"]').count()>0,'Education 3-step verification missing');
  assert.ok(await page.getByText('교육 이수·이해 답변과 작업 중 실제 안전행동 관찰은 별개입니다.',{exact:false}).count()>0,'Education completion is not field completion');
  const eduBg=await page.locator('[data-education-return="hero"]').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(eduBg,/120deg/i,'Education hero must have Field Canvas gradient');

  await page.getByRole('button',{name:'보호 리포트 확인'}).click();
  await inspect('reports','[data-psi-screen="reports"]');
  assert.ok(await page.getByRole('heading',{name:'안전 리포트 센터'}).count()>0,'Report center did not open');

  if(width===390||width===1440){
   await goEducation();
   await page.getByRole('button',{name:/추적 보기/}).click();
   await inspect('monthly-guidance','[data-psi-screen="monthly-guidance"]');
   assert.ok(await page.getByText('관리자 승인 전 초안',{exact:false}).count()>0,'Unapproved guidance must remain draft');

   await goEducation();
   await page.getByRole('button',{name:'교육자료 만들기'}).click();
   await inspect('a4-studio','[data-psi-screen="a4-education-studio"]');
   assert.ok(await page.getByRole('navigation',{name:'교육자료 제작 단계'}).count()>0,'Five-stage studio navigation missing');
  }

  await goHome();
  await page.getByRole('button',{name:'위험성평가 원문 확인 화면으로 이동'}).click();
  const ocr=await inspect('ocr-start','[data-psi-screen="ocr-analysis"]');
  assert.ok(await page.getByRole('heading',{name:'오늘 어떤 작업을 하시나요?'}).count()>0,'OCR start missing');
  const choices=page.locator('#ocr-start-guide [aria-label="작업 선택"]>button');
  assert.equal(await choices.count(),3,'OCR must have three distinct start routes');
  for (const h of ocr.buttons.slice(0,3))assert.ok(h.height>=44,'OCR target below 44px at '+width);
  if(width===390){
   await page.getByRole('button',{name:/2\. 백업에서 이어하기/}).click();
   assert.ok(await page.getByText('JSON 파일 불러오기',{exact:false}).count()>0,'Backup rescue path missing');
   await page.screenshot({path:`${out}/ocr-backup-open-${width}.png`,fullPage:false});
  }
  assert.deepEqual(errors,[],'Browser runtime errors on '+width);
  await context.close();
 }
 await writeFile(`${out}/result.json`,JSON.stringify({result:'PASS',checks},null,2));
 console.log('PASS PSI platform operator workspaces: '+checks.length+' viewport/screen checks');
}catch(error){
 await writeFile(`${out}/result.json`,JSON.stringify({result:'FAIL',message:error?.message||String(error),checks},null,2));
 throw error;
}finally{
 await browser.close();
 await new Promise(resolve=>server.httpServer.close(resolve));
}
