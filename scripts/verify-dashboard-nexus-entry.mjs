import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:1440,height:960}});
  await page.addInitScript(()=>sessionStorage.setItem('isAdminAuthenticated','true'));
  await page.route('**/api/admin/auth',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,authenticated:true})}));
  await page.goto(process.env.PSI_UI_URL || 'http://127.0.0.1:4187/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'안전지능 연결 보기 · 시제품'}).waitFor();
  await page.evaluate(()=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('PSI_Enterprise_V4',1);
    request.onsuccess=()=>{
      const db=request.result;
      const transaction=db.transaction('worker_records','readwrite');
      transaction.objectStore('worker_records').put({id:'synthetic-trade',name:'가상 작업자',date:'2020-01-01',jobField:'가상 공종',nationality:'한국',handwrittenAnswers:[],safetyScore:50});
      transaction.oncomplete=()=>{db.close();resolve();};
      transaction.onerror=()=>reject(transaction.error);
    };
    request.onerror=()=>reject(request.error);
  }));
  await page.reload({waitUntil:'domcontentloaded'});
  const trade=page.locator('.psi-ops-toolbar .psi-ops-filter select').nth(1);
  await trade.locator('option',{hasText:'가상 공종'}).waitFor({state:'attached'});
  await trade.selectOption({label:'가상 공종'});
  await page.locator('.psi-ops-toolbar .psi-ops-filter select').first().selectOption('all');
  const entry=page.getByRole('button',{name:'안전지능 연결 보기 · 시제품'});
  await entry.click();
  await page.getByRole('main',{name:'PSI 안전지능 네트워크'}).waitFor();
  assert.equal(await page.getByRole('region',{name:'우선 확인할 후속조치'}).count(),1);
  assert.equal(await page.getByRole('combobox',{name:'공종 선택'}).inputValue(),'가상 공종');
  assert.equal(await page.getByRole('combobox',{name:'작성 월 선택'}).inputValue(),'');
  await page.getByRole('combobox',{name:'작성 월 선택'}).selectOption('2020-01');
  await page.getByRole('button',{name:'간결한 보기',exact:true}).click();
  await page.getByRole('button',{name:/기존 관제센터로 돌아가기/}).click();
  assert.equal(await page.locator('.psi-ops-toolbar .psi-ops-filter select').nth(1).inputValue(),'가상 공종');
  assert.equal(await page.locator('.psi-ops-toolbar .psi-ops-filter select').first().inputValue(),'all');
  await page.getByRole('button',{name:'안전지능 연결 보기 · 시제품'}).click();
  assert.equal(await page.getByRole('combobox',{name:'작성 월 선택'}).inputValue(),'2020-01');
  assert.equal(await page.getByRole('button',{name:'입체 보기',exact:true}).count(),1);
  console.log('PASS: 현황판 공종·기간 복귀 및 Nexus 작성월·2D 선택 복원');
} finally { await browser.close(); }
