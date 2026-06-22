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

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await seedDatabase();
await page.reload({ waitUntil: 'networkidle' });

const analysisCardText = await page.getByText('AI 분석 완료', { exact: true }).locator('..').innerText();
const priorityCardText = await page.getByText('보호 우선 집중', { exact: true }).locator('..').innerText();
const boardText = await page.locator('body').innerText();
recordCheck('통합 보드 평균은 근로자별 최신 기록 기준', analysisCardText.includes('응답품질 65점'), {
    expectedAverage: 65,
    actual: analysisCardText,
});
recordCheck('통합 보드 보호 우선은 점수 임계값 기준', priorityCardText.includes('1건'), {
    expectedProtectionPriority: 1,
    actual: priorityCardText,
});
recordCheck('공식 계산 기준 표시', boardText.includes('공식 계산 기준: 근로자별 최신 기록'), {
    ruleVersion: 'psi-core-metrics-2026-06-22-v1',
});
await page.screenshot({ path: resolve(outputDir, 'integrated-board-core-metrics.png'), fullPage: false });

await page.getByRole('button', { name: /상세 분석 대시보드/ }).click();
const dashboardPanelText = await page.locator('section').filter({ hasText: '운영 콘솔 중심 대시보드' }).first().innerText();
recordCheck('상세 대시보드와 통합 보드 평균 일치', dashboardPanelText.includes('65.0'), {
    expectedAverage: 65,
    actual: dashboardPanelText,
});
recordCheck('상세 대시보드와 통합 보드 보호 우선 일치', dashboardPanelText.includes('보호우선') && dashboardPanelText.includes('1'), {
    expectedProtectionPriority: 1,
    actual: dashboardPanelText,
});
const storedSnapshot = await page.evaluate(() => {
    const raw = window.localStorage.getItem('psi_dashboard_live_sync_snapshot_v1');
    return raw ? JSON.parse(raw) : null;
});
recordCheck(
    '저장된 대시보드 지표에 계산 규칙 버전 포함',
    storedSnapshot?.averageScore === 65
        && storedSnapshot?.highRiskWorkers === 1
        && storedSnapshot?.metricRuleVersion === 'psi-core-metrics-2026-06-22-v1',
    storedSnapshot,
);
await page.screenshot({ path: resolve(outputDir, 'dashboard-core-metrics.png'), fullPage: false });

await page.getByText('안전성과 분석', { exact: true }).first().click();
await page.getByText('월별 개선 추적 요약', { exact: true }).waitFor({ state: 'visible' });
const monthlyPanelText = await page.locator('section').filter({ hasText: '월별 개선 추적 요약' }).first().innerText();
recordCheck('성과 분석 최신 월 평균 일치', monthlyPanelText.includes('월 평균 점수') && monthlyPanelText.includes('65'), {
    expectedLatestMonthlyAverage: 65,
    actual: monthlyPanelText,
});
await page.screenshot({ path: resolve(outputDir, 'performance-core-metrics.png'), fullPage: false });

await page.setViewportSize({ width: 390, height: 844 });
const mobileWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
}));
recordCheck('모바일 화면 가로 넘침 없음', mobileWidth.scrollWidth <= mobileWidth.innerWidth + 1, mobileWidth);

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
    ruleVersion: 'psi-core-metrics-2026-06-22-v1',
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: [
        'integrated-board-core-metrics.png',
        'dashboard-core-metrics.png',
        'performance-core-metrics.png',
    ],
};
await writeFile(resolve(outputDir, 'core-metrics-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await browser.close();

console.log(`[verify-core-metrics-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-core-metrics-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
