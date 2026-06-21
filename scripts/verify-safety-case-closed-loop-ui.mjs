import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:3000/';
const outputDir = resolve('artifacts/audit/browser/safety-case');
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

const caseId = 'PSI-CASE-VERIFY000001';
const baseCase = {
    caseId,
    sourcePlanKey: 'verify-plan-1',
    sourceRecordId: 'verify-record-1',
    workerId: 'verify-worker-1',
    workerName: '검증근로자',
    jobField: '형틀',
    teamLeader: '검증팀장',
    riskLabel: '추락 위험',
    actionTitle: '안전대 체결점과 작업발판 확인',
    owner: '검증팀장',
    dueLabel: '2026년 7월 2주차',
    dueAt: '2026-07-14T14:59:59.999Z',
    status: 'awaiting-report',
    completedStages: {
        detected: '2026-06-22T01:00:00.000Z',
        action: '2026-06-22T02:00:00.000Z',
    },
    createdAt: '2026-06-22T01:00:00.000Z',
    updatedAt: '2026-06-22T02:00:00.000Z',
    events: [
        {
            id: `${caseId}-detected`,
            stage: 'detected',
            occurredAt: '2026-06-22T01:00:00.000Z',
            actor: 'PSI 선행 위험신호',
            note: '검증 위험 발견',
        },
        {
            id: `${caseId}-action`,
            stage: 'action',
            occurredAt: '2026-06-22T02:00:00.000Z',
            actor: '검증팀장',
            note: '보호조치 완료',
        },
    ],
};

await page.addInitScript(({ safetyCase, verificationCaseId }) => {
    window.sessionStorage.setItem('isAdminAuthenticated', 'true');
    if (!window.localStorage.getItem('psi_safety_cases_v1')) {
        window.localStorage.setItem('psi_safety_cases_v1', JSON.stringify([safetyCase]));
    }
    if (!window.localStorage.getItem('psi_predictive_intervention_handoff_v1')) {
        window.localStorage.setItem('psi_predictive_intervention_handoff_v1', JSON.stringify({
            generatedAt: new Date().toISOString(),
            topRiskLabel: '추락 위험',
            plans: [{
                key: safetyCase.sourcePlanKey,
                caseId: verificationCaseId,
                sourceRecordId: safetyCase.sourceRecordId,
                workerId: safetyCase.workerId,
                priority: '즉시',
                owner: safetyCase.owner,
                workerName: safetyCase.workerName,
                jobField: safetyCase.jobField,
                teamLeader: safetyCase.teamLeader,
                riskLabel: safetyCase.riskLabel,
                actionTitle: safetyCase.actionTitle,
                dueLabel: safetyCase.dueLabel,
                dueAt: safetyCase.dueAt,
                status: 'completed',
                checkItems: ['안전대 확인', '현장 사진', '팀장 확인'],
            }],
        }));
    }
}, { safetyCase: baseCase, verificationCaseId: caseId });

await page.route('**/api/admin/auth', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authenticated: true }),
    });
});
await page.route('**/api/admin/safety-cases', async (route) => {
    const body = route.request().postDataJSON();
    const response = body?.action === 'list'
        ? { ok: true, schemaReady: false, mode: 'fallback-local', items: [] }
        : { ok: true, schemaReady: false, mode: 'fallback-local', caseId };
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(response),
    });
});
await page.route('**/api/admin/predictive-plan-status', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
    });
});

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

const seedDatabase = async () => {
    const workerRecord = {
        id: 'verify-record-1',
        worker_uuid: 'verify-worker-1',
        workerUuid: 'verify-worker-1',
        name: '검증근로자',
        jobField: '형틀',
        teamLeader: '검증팀장',
        date: '2026-06-20',
        nationality: '대한민국',
        language: 'ko',
        handwrittenAnswers: [],
        fullText: '',
        koreanTranslation: '',
        safetyScore: 58,
        safetyLevel: '초급',
        strengths: ['보호구 필요성 인지'],
        strengths_native: ['보호구 필요성 인지'],
        weakAreas: ['추락 위험 확인 부족'],
        weakAreas_native: ['추락 위험 확인 부족'],
        improvement: '안전대 체결점 확인',
        improvement_native: '안전대 체결점 확인',
        suggestions: ['작업 전 안전대 확인'],
        suggestions_native: ['작업 전 안전대 확인'],
        aiInsights: '추락 위험 보호조치가 필요합니다.',
        aiInsights_native: '추락 위험 보호조치가 필요합니다.',
        selfAssessedRiskLevel: '중',
    };
    await page.evaluate(async (record) => {
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
                store.put(record);
                transaction.oncomplete = () => {
                    db.close();
                    resolvePromise();
                };
                transaction.onerror = () => rejectPromise(transaction.error);
            };
        });
    }, workerRecord);
};

const openInterventionPage = async () => {
    const interventionEntry = page.getByText('현장 개입 추천', { exact: true }).first();
    if (await interventionEntry.count() === 0) {
        await page.getByRole('button', { name: /상세 분석 대시보드/ }).click();
    }
    await page.getByText('현장 개입 추천', { exact: true }).first().click();
    await page.getByText(caseId, { exact: true }).waitFor({ state: 'visible' });
};

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await seedDatabase();
await page.reload({ waitUntil: 'networkidle' });
await writeFile(resolve(outputDir, 'initial-page-text.txt'), await page.locator('body').innerText(), 'utf8');
await page.screenshot({ path: resolve(outputDir, 'initial-page.png'), fullPage: false });
await openInterventionPage();

const interventionText = await page.locator('body').innerText();
const stageLabels = ['위험 발견', '보호조치', '리포트', '교육', '본인확인·서명', '재평가'];
recordCheck('보호사건 식별번호 표시', interventionText.includes(caseId), { caseId });
recordCheck('6단계 진행상태 표시', stageLabels.every((label) => interventionText.includes(label)), { stageLabels });
recordCheck('현재 단계와 다음 행동 표시', interventionText.includes('리포트 대기') && interventionText.includes('리포트 연결하기'), {
    expectedStatus: '리포트 대기',
});
await page.getByText(caseId, { exact: true }).scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(outputDir, 'safety-case-report-stage.png'), fullPage: false });

await page.setViewportSize({ width: 390, height: 844 });
await page.getByText(caseId, { exact: true }).scrollIntoViewIfNeeded();
const mobileWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
}));
recordCheck('모바일 화면 가로 넘침 없음', mobileWidth.scrollWidth <= mobileWidth.innerWidth + 1, mobileWidth);
await page.screenshot({ path: resolve(outputDir, 'safety-case-mobile.png'), fullPage: false });

await page.setViewportSize({ width: 1440, height: 1000 });
await page.getByRole('button', { name: '리포트 연결하기' }).click();
await page.getByRole('heading', { name: '안전 리포트 센터' }).last().waitFor({ state: 'visible' });
recordCheck('리포트 화면 연결', true, { heading: '안전 리포트 센터' });

await page.evaluate((verificationCaseId) => {
    const records = JSON.parse(window.localStorage.getItem('psi_safety_cases_v1') || '[]');
    const next = records.map((record) => record.caseId === verificationCaseId
        ? {
            ...record,
            status: 'awaiting-training',
            completedStages: {
                ...record.completedStages,
                report: '2026-06-22T03:00:00.000Z',
            },
            updatedAt: '2026-06-22T03:00:00.000Z',
        }
        : record);
    window.localStorage.setItem('psi_safety_cases_v1', JSON.stringify(next));
}, caseId);
await page.reload({ waitUntil: 'networkidle' });
await openInterventionPage();
await page.getByRole('button', { name: '교육 연결하기' }).click();
await page.getByText('보호사건 교육 연결', { exact: true }).waitFor({ state: 'visible' });
const trainingText = await page.locator('body').innerText();
recordCheck('교육 작성 화면에 보호사건 인계', trainingText.includes(caseId) && trainingText.includes('검증근로자'), {
    caseId,
    workerName: '검증근로자',
});
await page.getByText('보호사건 교육 연결', { exact: true }).scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(outputDir, 'safety-case-training-handoff.png'), fullPage: false });

const unexpectedConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('VITE_SUPABASE_URL')
    && !message.includes('NEXT_PUBLIC_SUPABASE_URL')
    && !message.includes('Failed to load resource')
));
recordCheck('브라우저 실행 오류 없음', pageErrors.length === 0 && unexpectedConsoleErrors.length === 0, {
    pageErrors,
    consoleErrors: unexpectedConsoleErrors,
});

const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: [
        'safety-case-report-stage.png',
        'safety-case-mobile.png',
        'safety-case-training-handoff.png',
    ],
};
await writeFile(resolve(outputDir, 'safety-case-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await browser.close();

console.log(`[verify-safety-case-closed-loop-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-safety-case-closed-loop-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
