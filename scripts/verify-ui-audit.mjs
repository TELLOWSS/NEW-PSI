import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:3000/';
const outputDir = resolve('artifacts/audit/browser');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const failedResponses = [];
const checks = [];

page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => failedRequests.push({
    url: request.url(),
    error: request.failure()?.errorText || 'unknown',
}));
page.on('response', (response) => {
    if (response.status() >= 400) failedResponses.push({
        url: response.url(),
        status: response.status(),
    });
});

await page.route('**/api/admin/auth', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authenticated: true }),
    });
});

await page.route('**/api/admin/survey-risk-baselines', async (route) => {
    let action = '';
    try {
        action = String(route.request().postDataJSON()?.action || '');
    } catch {
        action = '';
    }
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            ok: true,
            action,
            items: [],
            item: action === 'upsert' ? {} : undefined,
        }),
    });
});

await page.route('**/api/admin/training', async (route) => {
    const request = route.request();
    let action = '';
    try {
        action = String(request.postDataJSON()?.action || '');
    } catch {
        action = '';
    }

    const responses = {
        'list-sessions': { ok: true, sessions: [] },
        'list-target-workers': {
            ok: true,
            workers: [
                { id: 'worker-stable-001', name: '검증 근로자', nationality: '대한민국', jobField: '형틀' },
            ],
        },
        'awareness-stats': {
            ok: true,
            submittedWorkers: 0,
            confirmedWorkers: 0,
            targetWorkers: null,
            targetScopeDefined: false,
            unconfirmedWorkers: null,
            confirmationRate: null,
            nationalityCount: 0,
            ackDataSource: 'submission_gate',
            unconfirmedTargetWorkerIds: [],
        },
    };

    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responses[action] || { ok: true }),
    });
});

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await page.getByText('현장 안전 관제센터', { exact: false }).first().waitFor({ state: 'visible' });
await page.screenshot({ path: resolve(outputDir, 'initial-dashboard.png'), fullPage: true });

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

const openPage = async (pageName, expectedText, screenshotName) => {
    const hasDevNavigator = await page.evaluate(() => typeof window.__setCurrentPage === 'function');
    if (hasDevNavigator) {
        await page.evaluate((name) => window.__setCurrentPage(name), pageName);
    } else {
        const navigationLabels = {
            'safety-checks': '위험 인지 점검',
            'safety-behavior-management': '안전조치 및 개선관리',
            'performance-analysis': '안전성과 분석',
            'survey-intelligence': '근로자 의견 분석',
            'admin-training': '다국어 교육 / QR',
        };
        await page.getByText(navigationLabels[pageName], { exact: true }).first().click();
    }
    await page.getByText(expectedText, { exact: false }).first().waitFor({ state: 'visible' });
    await page.screenshot({ path: resolve(outputDir, screenshotName), fullPage: true });
};

await openPage('safety-checks', '등록된 실제 근로자가 없어 점검 대상을 선택할 수 없습니다.', 'safety-checks-empty.png');
const today = new Date();
const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
recordCheck('안전점검 빈 대상 안내', await page.getByText('등록된 실제 근로자가 없어 점검 대상을 선택할 수 없습니다.').isVisible(), '운영 대상 0명 안내 표시');
recordCheck('안전점검 로컬 오늘 날짜', await page.locator('input[type="date"]').inputValue() === todayKey, await page.locator('input[type="date"]').inputValue());
recordCheck('안전점검 제출 차단', await page.locator('button[type="submit"]').isDisabled(), '실제 근로자 0명일 때 제출 버튼 비활성화');

await openPage('safety-behavior-management', '등록된 실제 근로자가 없어 관찰·코칭·자동 판정을 실행할 수 없습니다.', 'safety-behavior-empty.png');
recordCheck('가상 근로자 운영 혼입 차단', await page.getByText('데모 대상은 운영/API 요청에 사용하지 않습니다.', { exact: false }).isVisible(), '명시적 빈 상태 및 데모 차단 안내');

await openPage('performance-analysis', '근로자 안전 성과 심층 분석', 'performance-analysis.png');
const threeMonthButton = page.getByRole('button', { name: '최근 3개월' });
await threeMonthButton.click();
recordCheck('성과 기간 선택 반영', (await threeMonthButton.getAttribute('class') || '').includes('bg-white'), '최근 3개월 버튼 활성 스타일');

await openPage('survey-intelligence', '관리자 기준 위험도 등록', 'survey-risk-baseline-wizard.png');
const monthSelects = page.locator('select');
const monthSelect = monthSelects.nth(1);
const monthOptions = await monthSelect.locator('option').evaluateAll((options) => options.map((option) => option.value));
const specificMonth = monthOptions.find((value) => /^\d{4}-\d{2}$/.test(value));
if (specificMonth) await monthSelect.selectOption(specificMonth);
await page.getByRole('button', { name: '3문항 빠른 판정' }).click();
await page.getByRole('button', { name: /중대/ }).click();
await page.getByRole('button', { name: /반복/ }).click();
await page.getByRole('button', { name: /일부/ }).click();
recordCheck('관리자 기준 3문항 판정', await page.getByText('권고 기준: 중 · 50점', { exact: false }).isVisible(), '중대 피해·반복 노출·일부 방호 입력에 중등급 권고');
recordCheck('관리자 기준 독립성 안내', await page.getByText('근로자 응답을 계산에 사용하지 않습니다.', { exact: false }).isVisible(), '근로자 체감은 참고자료로만 사용');
recordCheck('관리자 기준 진행률 표시', await page.getByText(/등록 \d+\/\d+개 공종/).isVisible(), '월별 등록 완료/전체 공종 표시');

await openPage('admin-training', '교육명', 'admin-training-targeting.png');
recordCheck('교육명 입력 제공', await page.getByText('교육명', { exact: true }).isVisible(), '세션 생성 필수 필드');
recordCheck('지정 대상자 분모 선택', await page.getByText('지정 대상자 전체 기준', { exact: false }).isVisible(), '이수율 대상 범위 선택');
await page.getByText('지정 대상자 전체 기준', { exact: false }).click();
await page.getByText('검증 근로자', { exact: false }).waitFor({ state: 'visible' });
recordCheck('대상자 안정 ID 목록 로드', await page.getByText('검증 근로자', { exact: false }).isVisible(), '관리자 인증 API 모의 응답으로 안정 ID 대상 표시');

await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: resolve(outputDir, 'admin-training-mobile.png'), fullPage: true });
recordCheck('모바일 가로 넘침', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)}, innerWidth=${await page.evaluate(() => window.innerWidth)}`);

const unexpectedConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('VITE_SUPABASE_URL')
    && !message.includes('NEXT_PUBLIC_SUPABASE_URL')
    && !message.includes('Failed to load resource')
));
const relevantFailedResponses = failedResponses.filter(({ url }) => !url.endsWith('/favicon.ico'));
const relevantFailedRequests = failedRequests.filter(({ url }) => !url.includes('fonts.googleapis.com') && !url.includes('fonts.gstatic.com'));
recordCheck('브라우저 런타임 오류 없음', (
    pageErrors.length === 0
    && unexpectedConsoleErrors.length === 0
    && relevantFailedResponses.length === 0
    && relevantFailedRequests.length === 0
), {
    pageErrors,
    consoleErrors: unexpectedConsoleErrors,
    failedResponses: relevantFailedResponses,
    failedRequests: relevantFailedRequests,
});

const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: [
        'safety-checks-empty.png',
        'safety-behavior-empty.png',
        'performance-analysis.png',
        'survey-risk-baseline-wizard.png',
        'admin-training-targeting.png',
        'admin-training-mobile.png',
    ],
};

await writeFile(resolve(outputDir, 'browser-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await browser.close();

console.log(`[verify-ui-audit] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-ui-audit] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
