import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const outputDir = resolve('artifacts/audit/browser/core-metrics');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [];
const consoleErrors = [];
const pageErrors = [];

page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.addInitScript(() => {
    window.sessionStorage.setItem('isAdminAuthenticated', 'true');
    window.localStorage.setItem('psi_dashboard_ui_mode_lock_v2', 'false');
});
await page.route('**/api/admin/auth', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authenticated: true }),
    });
});
await page.route('**/api/admin/training', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, summary: { trainingSessions: 0, trainingSubmissions: 0 } }),
    });
});

const breakdown = (improvementExecution) => ({
    psychological: 8,
    jobUnderstanding: 16,
    riskAssessmentUnderstanding: 16,
    proficiency: 24,
    improvementExecution,
    repeatViolationPenalty: 0,
});
const baseRecord = {
    id: 'metric-record',
    name: '김근로',
    jobField: '형틀',
    teamLeader: '김팀장',
    date: '2026-06-20',
    nationality: '대한민국',
    language: 'ko',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 80,
    safetyLevel: '고급',
    strengths: [],
    strengths_native: [],
    weakAreas: ['추락 위험 확인'],
    weakAreas_native: ['추락 위험 확인'],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '',
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    scoreBreakdown: breakdown(10),
};
const seedRecords = [
    { ...baseRecord, id: 'kim-apr', worker_uuid: 'monthly-kim-04', workerUuid: 'monthly-kim-04', date: '2026-04-10', safetyScore: 20, safetyLevel: '초급' },
    { ...baseRecord, id: 'kim-jun', worker_uuid: 'monthly-kim-06', workerUuid: 'monthly-kim-06', date: '2026-06-20', safetyScore: 80, safetyLevel: '초급' },
    { ...baseRecord, id: 'park-jun', worker_uuid: 'worker-park', workerUuid: 'worker-park', name: '박근로', date: '2026-06-21', safetyScore: 50, safetyLevel: '고급', scoreBreakdown: breakdown(20) },
];

const seedDatabase = async () => {
    await page.evaluate(async (records) => {
        await new Promise((resolvePromise, rejectPromise) => {
            const request = indexedDB.open('PSI_Enterprise_V4', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('worker_records')) {
                    db.createObjectStore('worker_records', { keyPath: 'id' });
                }
            };
            request.onerror = () => rejectPromise(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction('worker_records', 'readwrite');
                const store = transaction.objectStore('worker_records');
                store.clear();
                records.forEach((record) => store.put(record));
                transaction.oncomplete = () => {
                    db.close();
                    resolvePromise();
                };
                transaction.onerror = () => rejectPromise(transaction.error);
            };
        });
    }, seedRecords);
};

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

// Check the *current* dashboard card API, not historic removed labels.
try{
 await page.goto(baseUrl,{waitUntil:'networkidle'});
 await seedDatabase();
 await page.reload({waitUntil:'networkidle'});
 const metric=title=>page.getByRole('region',{name:title+' 지표'});
 const safety=metric('현장 안전 지수');
 const workers=metric('활동 중인 근로자');
 const protection=metric('보호 우선 모니터링');
 await safety.waitFor({timeout:15000});
 const diagnostic=await page.evaluate(()=>({cards:Array.from(document.querySelectorAll('section[aria-label$=" 지표"]')).map(e=>({label:e.getAttribute('aria-label'),text:e.innerText.slice(0,240)})),snapshot:localStorage.getItem('psi_dashboard_live_sync_snapshot_v1'),recordCount:document.body.innerText.length,login:document.body.innerText.slice(0,180)}));
 console.log('[PSI metric diagnostic] '+JSON.stringify(diagnostic).slice(0,3500));
 await page.screenshot({path:resolve(outputDir,'current-dashboard-diagnostic.png'),fullPage:true});
 const values={
  average:Number(await safety.locator('strong').innerText()),
  workers:Number(await workers.locator('strong').innerText()),
  protection:Number(await protection.locator('strong').innerText())
 };
 recordCheck('근로자별 최신 점수 평균 65.0',values.average===65,values);
 recordCheck('동일 근로자 중복 기록 제외 후 2명',values.workers===2,values);
 recordCheck('보호 우선 점수 기준 1명',values.protection===1,values);
 const snapshot=await page.evaluate(()=>{try{return JSON.parse(localStorage.getItem('psi_dashboard_live_sync_snapshot_v1')||'null')}catch{return null}});
 recordCheck('공식 계산 규칙·평균·보호대상 동기화',snapshot?.averageScore===65&&snapshot?.highRiskWorkers===1&&snapshot?.totalWorkers===2&&snapshot?.metricRuleVersion==='psi-core-metrics-2026-06-22-v1',snapshot);
 await page.screenshot({path:resolve(outputDir,'current-dashboard-desktop.png')});
 await page.setViewportSize({width:390,height:844});
 await safety.waitFor({state:'visible'});
 const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));
 recordCheck('390px에서 대시보드의 횡스크롤 넘침 없음',width.scroll<=width.viewport+1,width);
 await page.screenshot({path:resolve(outputDir,'current-dashboard-mobile.png')});
 recordCheck('브라우저 실행 오류 없음',pageErrors.length===0,pageErrors);
 const result={passed:checks.every(c=>c.passed),passedCount:checks.filter(c=>c.passed).length,totalCount:checks.length,checks,fixtureOnly:true,paidAiCalls:0};
 await writeFile(resolve(outputDir,'current-metrics-verification.json'),JSON.stringify(result,null,2)+'\n');
 console.log('[verify-current-metrics-ui] '+result.passedCount+'/'+result.totalCount+' checks passed');
 if(!result.passed)process.exitCode=1;
}finally{await browser.close();}
