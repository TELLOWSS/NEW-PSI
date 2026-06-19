import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4180/';
const outputDir = resolve('artifacts/audit/browser');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const checks = [];
const consoleErrors = [];
const pageErrors = [];
const baselineRequests = [];
let resolveUpsertRequest;
const upsertRequestPromise = new Promise((resolve) => {
    resolveUpsertRequest = resolve;
});

page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.route('**/api/admin/auth', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authenticated: true }),
    });
});

await page.route('**/api/admin/survey-risk-baselines', async (route) => {
    let requestBody = {};
    try {
        requestBody = route.request().postDataJSON() || {};
    } catch {
        requestBody = {};
    }
    baselineRequests.push(requestBody);
    const action = String(requestBody.action || '');
    if (action === 'upsert') resolveUpsertRequest?.(requestBody);
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            ok: true,
            action,
            items: [],
            item: action === 'upsert' ? requestBody.payload : undefined,
            historyAvailable: false,
        }),
    });
});

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

try {
    await page.addInitScript(() => {
        window.sessionStorage.setItem('isAdminAuthenticated', 'true');
    });
    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.getByText('근로자 의견 분석', { exact: true }).first().click();
    await page.getByText('관리자 기준 위험도 등록', { exact: false }).first().waitFor({ state: 'visible' });
    recordCheck(
        '기본 메뉴 접근',
        await page.getByText('관리자 기준 위험도 등록', { exact: false }).first().isVisible(),
        '기본 사이드바에서 근로자 의견 분석으로 진입',
    );

    const monthSelect = page.locator('select').nth(1);
    const monthValues = await monthSelect.locator('option').evaluateAll((options) => (
        options.map((option) => option.value)
    ));
    const monthKey = monthValues.find((value) => /^\d{4}-\d{2}$/.test(value));
    if (!monthKey) throw new Error('선택 가능한 월이 없습니다.');
    await monthSelect.selectOption(monthKey);

    await page.getByRole('button', { name: '3문항 빠른 판정' }).click();
    await page.getByRole('button', { name: /중대/ }).click();
    await page.getByRole('button', { name: /반복/ }).click();
    await page.getByRole('button', { name: /^일부/ }).click();
    const decisionReason = '금주 인양 작업 집중, 방호조치 추가 확인 필요';
    await page.getByPlaceholder(/금주 타워크레인/).fill(decisionReason);

    recordCheck(
        '3문항 권고 계산',
        await page.getByText('권고 기준: 중 · 50점', { exact: false }).isVisible(),
        '중대 피해·반복 노출·일부 방호 입력에 중등급 권고',
    );
    recordCheck(
        '근로자 응답과 독립된 기준',
        await page.getByText('근로자 응답을 계산에 사용하지 않습니다.', { exact: false }).isVisible(),
        '관리자 기준과 근로자 체감의 순환 계산 방지 문구 표시',
    );
    recordCheck(
        '월별 등록 진행률',
        await page.getByText(/등록 0\/\d+개 공종/).isVisible(),
        '완료 공종과 전체 공종 수 표시',
    );

    await page.screenshot({
        path: resolve(outputDir, 'survey-risk-baseline-wizard.png'),
        fullPage: true,
    });

    await page.evaluate(() => {
        window.sessionStorage.setItem('isAdminAuthenticated', 'true');
    });
    await page.getByRole('button', { name: '이 등급 적용하고 다음' }).click();
    await page.getByText(/등록 1\/\d+개 공종/).waitFor({ state: 'visible' });
    const upsertRequest = await Promise.race([
        upsertRequestPromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    recordCheck(
        '저장 요청 연결',
        Boolean(
            upsertRequest
            && upsertRequest.payload?.monthKey === monthKey
            && upsertRequest.payload?.level === '중'
            && upsertRequest.payload?.trade
            && upsertRequest.payload?.basis?.severity === 'serious'
            && upsertRequest.payload?.basis?.exposure === 'repeated'
            && upsertRequest.payload?.basis?.control === 'partial'
            && upsertRequest.payload?.basis?.reason === decisionReason
        ),
        upsertRequest
            ? {
                action: upsertRequest.action,
                monthKey: upsertRequest.payload?.monthKey,
                trade: upsertRequest.payload?.trade,
                level: upsertRequest.payload?.level,
                basis: upsertRequest.payload?.basis,
            }
            : {
                message: 'upsert 요청 없음',
                observedActions: baselineRequests.map((request) => request.action),
            },
    );
    recordCheck(
        '판정 근거 변경 이력',
        await page.getByText(decisionReason, { exact: true }).isVisible(),
        '등급 변경 전후·판정 방식·작성자·근거 메모 표시',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
        path: resolve(outputDir, 'survey-risk-baseline-mobile.png'),
        fullPage: true,
    });
    const mobileWidth = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
    }));
    recordCheck(
        '모바일 가로 넘침 없음',
        mobileWidth.scrollWidth <= mobileWidth.innerWidth + 1,
        mobileWidth,
    );

    const unexpectedConsoleErrors = consoleErrors.filter((message) => (
        !message.includes('VITE_SUPABASE_URL')
        && !message.includes('NEXT_PUBLIC_SUPABASE_URL')
        && !message.includes('Failed to load resource')
    ));
    recordCheck(
        '브라우저 실행 오류 없음',
        pageErrors.length === 0 && unexpectedConsoleErrors.length === 0,
        { pageErrors, consoleErrors: unexpectedConsoleErrors },
    );
} finally {
    await browser.close();
}

const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: [
        'survey-risk-baseline-wizard.png',
        'survey-risk-baseline-mobile.png',
    ],
};

await writeFile(
    resolve(outputDir, 'survey-risk-baseline-verification.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
);

console.log(`[verify-survey-baseline-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-survey-baseline-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
