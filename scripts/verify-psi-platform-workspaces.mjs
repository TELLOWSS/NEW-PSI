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
     rootWidth:rect.width,
     x:rect.x,
     documentOverflow:document.documentElement.scrollWidth>innerWidth+2,
     background:styles.backgroundImage,
     mainWidth:main?.getBoundingClientRect().width||0,
     buttons:[...el.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0)
      .slice(0,16).map(b=>({name:(b.getAttribute('aria-label')||b.innerText||'').trim().slice(0,45),height:Math.round(b.getBoundingClientRect().height)})),
    };
   });
   assert.ok(metrics.rootWidth>0 && metrics.rootWidth<=width+2,id+' root width on '+width+': '+metrics.rootWidth);
   assert.ok(metrics.x>=-1,id+' screen begins outside viewport on '+width+': '+metrics.x);
   assert.equal(metrics.documentOverflow,false,id+' document scroll overflow on '+width);
   await page.screenshot({path:`${out}/${id}-${width}.png`,fullPage:false});
   checks.push({viewportWidth:width,id,...metrics});
   return metrics;
  };
  await goHome();
  await page.locator('summary[aria-label="운영자 메뉴 열기"]').click();
  await page.getByRole('button',{name:/PSI 브랜드 스토리/}).click();
  const introGuide=page.locator('[data-psi-onboarding-l13="true"]');
  await introGuide.waitFor({timeout:32000});
  await inspect('introduction-l13','[data-psi-onboarding-l13="true"]');
  assert.equal(await introGuide.getByRole('tab').count(),5,'L13 must offer five actual step navigation choices');
  await introGuide.getByRole('tab',{name:/교육/}).click();
  await introGuide.locator('[data-psi-onboarding-stage="education"]')
   .getByText(/교육 발행/).waitFor();
  await introGuide.getByText('실제 메뉴 연결 · 자동 완료 아님',{exact:true}).waitFor();
  if(width===390){
   await introGuide.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/introduction-first-use-l13-390.png`,fullPage:false});
   await introGuide.getByRole('button',{name:'교육 환류 확인'}).click();
   await page.locator('[data-psi-screen="education-return"]').waitFor({timeout:32000});
  }
  await goEducation();
  const edu=await inspect('education','[data-psi-screen="education-return"]');
  const educationEvidence=page.locator('[data-education-return="evidence-loop-l10"]');
  await educationEvidence.waitFor();
  assert.equal(await educationEvidence.locator('[data-return-stage]').count(),6,
   'L10 must retain six distinct source, authoring, language, delivery, understanding and field states');
  await educationEvidence.getByText('기록 현황 · 배포 승인 아님',{exact:true}).waitFor();
  assert.equal(await educationEvidence.locator('[data-return-stage="language"]').getByText('언어별 출력·의미 검증 별도',{exact:true}).count(),1);
  if(width===390){
   await educationEvidence.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/education-l10-evidence-390.png`,fullPage:false});
   await educationEvidence.getByRole('button',{name:'언어별 확인'}).click();
   await page.locator('[data-psi-screen="a4-education-studio"]').waitFor();
   await goEducation();
  }
  assert.ok(await page.locator('[data-education-return="three-step-flow"]').count()>0,'Education 3-step verification missing');
  assert.ok(await page.getByText('교육 이수·이해 답변과 작업 중 실제 안전행동 관찰은 별개입니다.',{exact:false}).count()>0,'Education completion is not field completion');
  const eduBg=await page.locator('[data-education-return="hero"]').evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(eduBg,/120deg/i,'Education hero must have Field Canvas gradient');
  const steps=await page.locator('[data-education-return="three-step-flow"]').evaluate(el=>{
   const grid=el.querySelector(':scope>div');
   const first=grid?.querySelector(':scope>div');
   const title=first?.querySelector('.psi-section-title');
   return{
    columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,
    textColor:title?getComputedStyle(title).color:'',
    stepBg:first?getComputedStyle(first).backgroundColor:'',
    steps:grid?.querySelectorAll(':scope>div').length||0
   };
  });
  if(width<=630){
   assert.equal(steps.columns,1,'Education 3-step flow must stack on '+width+'px');
   assert.equal(steps.steps,3,'All three education steps must remain visible');
   assert.equal(steps.textColor,'rgb(255, 255, 255)','Education step title not legible at '+width);
   assert.equal(steps.stepBg,'rgba(0, 0, 0, 0)','Education step should remain transparent over dark flow');
  }


  await page.getByRole('button',{name:'보호 리포트 확인'}).click();
  await inspect('reports','[data-psi-screen="reports"]');
  assert.ok(await page.getByRole('heading',{name:'안전 리포트 센터'}).count()>0,'Report center did not open');
  const reportDelivery=page.locator('[data-psi-report-delivery-l12="true"]');
  await reportDelivery.waitFor();
  assert.equal(await reportDelivery.locator('[data-psi-l12-stage]').count(),6,
   'L12 must separate report creation, device saving, external handoff, recipient receipt, validation and approval');
  await reportDelivery.locator('[data-psi-l12-stage="device"]')
   .getByText('실제 다운로드·보관 미확인',{exact:true}).waitFor();
  await reportDelivery.locator('[data-psi-l12-stage="receipt"]')
   .getByText('열람·접수 근거 없음',{exact:true}).waitFor();
  await reportDelivery.getByText('배포·수신 자동 확인 없음',{exact:true}).waitFor();
  if(width===390){
   await reportDelivery.scrollIntoViewIfNeeded();
   await page.screenshot({path:`${out}/reports-delivery-l12-390.png`,fullPage:false});
  }

  if(width===390||width===1440){
   await goEducation();
   await page.getByRole('button',{name:/추적 보기/}).click();
   await inspect('monthly-guidance','[data-psi-screen="monthly-guidance"]');
   const sixMetrics=page.locator('[data-monthly-guidance="l11-six-metric-evidence"]');
   await sixMetrics.waitFor();
   assert.equal(await sixMetrics.locator('[data-metric-key]').count(),6,
    'L11 must display all six existing scored fields with observed denominators');
   await sixMetrics.getByText('6개 평가점수 · 표본과 결측 근거',{exact:true}).waitFor();
   await sixMetrics.locator('[data-metric-key="repeatViolationPenalty"]')
    .getByText('감점 크기:',{exact:false}).waitFor();
   assert.equal(await page.locator('[data-l11-group-chart="empty"]').count(),1,
    'empty group charts must show no evidence rather than fabricated zero');
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
  // R78 actual navigation: survey is intentionally hidden by the default
  // minimalist sidebar, but directly discoverable from education follow-up.
  // Do NOT bypass role/operational-mode checks or inject a dev-only route.
  await goEducation();
  await page.locator('[data-education-return="practice-verification"]')
   .getByRole('button',{name:'근로자 의견 분석'}).click();
  await inspect('survey-intelligence','[data-psi-screen="survey-intelligence"]');
  await page.getByRole('heading',{name:'위험성평가 설문 분석 대시보드'}).waitFor({timeout:32000});
  const surveyTrade=page.getByRole('combobox',{name:'분석 공종 선택'});
  const surveyPeriod=page.getByRole('combobox',{name:'분석 기간 선택'});
  const surveyReset=page.getByRole('button',{name:'필터 초기화'});
  assert.equal(await surveyTrade.count(),1,'survey trade filter must have an accessible name');
  assert.equal(await surveyPeriod.count(),1,'survey period filter must have an accessible name');
  const filterRects=await Promise.all([surveyTrade,surveyPeriod,surveyReset].map(el=>el.boundingBox()));
  assert.ok(filterRects.every(rect=>rect&&rect.height>=44),'survey filter touch controls must be >=44px');
  const firstTrade=await surveyTrade.inputValue();
  const totalOptions=await surveyTrade.locator('option').count();
  assert.ok(totalOptions>1,'survey trade filter must offer a real choice');
  await surveyTrade.selectOption({index:1});
  assert.notEqual(await surveyTrade.inputValue(),firstTrade,'trade filter interaction failed');
  await surveyReset.click();
  assert.equal(await surveyTrade.inputValue(),firstTrade,'survey filter reset failed');
  const kpis=page.locator('[data-psi-screen="survey-intelligence"] [data-psi-survey="metric"]');
  assert.equal(await kpis.count(),3,'three evidence KPI cards must remain visible');
  const cols=await page.locator('[data-psi-survey="metrics"]').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length);
  assert.equal(cols,width<=630?1:3,'survey KPI grid breaks at '+width);
  if(width===390){
   await page.evaluate(()=>localStorage.setItem('psi_theme_mode','dark'));
   await page.reload({waitUntil:'domcontentloaded'});
   await goEducation();
   await page.locator('[data-education-return="practice-verification"]')
    .getByRole('button',{name:'근로자 의견 분석'}).click();
   await page.locator('[data-psi-screen="survey-intelligence"]').waitFor({timeout:32000});
   const dark=await page.locator('[data-psi-screen="survey-intelligence"] [data-psi-survey="header"]').evaluate(el=>({color:getComputedStyle(el).color,bg:getComputedStyle(el).backgroundImage}));
   assert.ok(await page.evaluate(()=>document.documentElement.classList.contains('dark')),'survey dark mode lost after reload');
   assert.match(dark.bg,/gradient/i,'survey dark header not themed');
   await page.screenshot({path:`${out}/survey-intelligence-dark-390.png`,fullPage:false});
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
