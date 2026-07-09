import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4181/';
const outputDir = resolve('artifacts/audit/browser/plain-language');
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
    window.localStorage.setItem('psi_ui_composition_v1', JSON.stringify({
        version: 3,
        sidebarOrder: [
            'dashboard',
            'site-issue-management',
            'worker-management',
            'survey-intelligence',
            'predictive-analysis',
            'safety-behavior-management',
            'performance-analysis',
            'monthly-guidance-report',
            'a4-education-material',
            'ppt-pdf-one-page-summary',
            'admin-training',
            'reports',
            'ocr-analysis',
            'settings',
        ],
        hiddenSidebarPages: [],
    }));
});
await page.route('**/api/admin/auth', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, authenticated: true }),
    });
});
await page.route('**/api/admin/survey-risk-baselines', async (route) => {
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, items: [], historyAvailable: false }),
    });
});

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

await page.goto(baseUrl, { waitUntil: 'networkidle' });

const navigationLabels = {
    'survey-intelligence': '근로자 의견 분석',
    'ocr-analysis': '위험성평가 분석',
    reports: '근로자 리포트 (관리자 분석)',
    'worker-management': '근로자 안전 프로파일',
    settings: '시스템 설정',
};

const clickVisibleText = async (text) => {
    const matches = await page.getByText(text, { exact: true }).all();
    for (const match of matches) {
        if (await match.isVisible()) {
            await match.click();
            return;
        }
    }
    throw new Error(`화면 이동 항목을 찾지 못했습니다: ${text}`);
};

const pages = [
    {
        page: 'dashboard',
        anchor: '현장 안전 관제센터',
        expected: [],
        screenshot: 'dashboard.png',
    },
    {
        page: 'survey-intelligence',
        anchor: '관리자 기준 위험도 등록',
        expected: [],
        expectedAny: ['팀 공동 저장소', '이 기기에 임시 저장'],
        screenshot: 'survey-intelligence.png',
    },
    {
        page: 'ocr-analysis',
        anchor: '위험성평가 문서 분석 현황',
        expected: ['다국어 문서 글자 인식(OCR)'],
        screenshot: 'document-analysis.png',
    },
    {
        page: 'reports',
        anchor: '안전 리포트 센터',
        expected: [],
        screenshot: 'reports.png',
    },
    {
        page: 'worker-management',
        anchor: '등록 근로자 관리자 센터',
        expected: [],
        screenshot: 'worker-management.png',
    },
    {
        page: 'settings',
        anchor: '현장 운영 설정',
        expected: ['Google Gemini 분석 서비스 연결', '확인단계 등급 기준점수'],
        screenshot: 'settings.png',
    },
];

const forbiddenTerms = [
    '승인 백로그',
    '팀 공유 DB',
    '현재 브라우저 저장',
    'BULK MODE',
    'INDIVIDUAL MODE',
    'SUCCESS RATE',
    'TOP PROVIDER',
    'MESSAGE HISTORY',
    'API Cooling Down',
    'Preflight 검증',
    '운영 집계 뷰',
    'Manifest / JSON 메타',
    '증빙 해시',
];

for (const target of pages) {
    const canNavigateDirectly = await page.evaluate(() => typeof window.__setCurrentPage === 'function');
    if (canNavigateDirectly) {
        await page.evaluate((pageName) => window.__setCurrentPage(pageName), target.page);
    } else if (target.page !== 'dashboard') {
        await clickVisibleText(navigationLabels[target.page]);
    }
    await page.getByText(target.anchor, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible' });
    await page.waitForTimeout(350);
    const visibleText = await page.locator('body').innerText();

    recordCheck(
        `${target.page} 쉬운 표현`,
        target.expected.every((text) => visibleText.includes(text))
            && (!target.expectedAny || target.expectedAny.some((text) => visibleText.includes(text))),
        { expected: target.expected, expectedAny: target.expectedAny || [] },
    );
    const exposedForbidden = forbiddenTerms.filter((term) => visibleText.includes(term));
    recordCheck(
        `${target.page} 개발자 표현 미노출`,
        exposedForbidden.length === 0,
        { exposedForbidden },
    );
    await page.screenshot({
        path: resolve(outputDir, target.screenshot),
        fullPage: false,
    });
}

await page.setViewportSize({ width: 390, height: 844 });
const canNavigateMobileDirectly = await page.evaluate(() => typeof window.__setCurrentPage === 'function');
if (canNavigateMobileDirectly) {
    await page.evaluate((pageName) => window.__setCurrentPage(pageName), 'settings');
}
await page.waitForTimeout(400);
const mobileWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
}));
recordCheck(
    '쉬운 설정 화면 모바일 가로 넘침 없음',
    mobileWidth.scrollWidth <= mobileWidth.innerWidth + 1,
    mobileWidth,
);
await page.screenshot({
    path: resolve(outputDir, 'settings-mobile.png'),
    fullPage: false,
});

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

const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: [...pages.map((target) => target.screenshot), 'settings-mobile.png'],
};
await writeFile(
    resolve(outputDir, 'plain-language-verification.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
);
await browser.close();

console.log(`[verify-plain-language-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-plain-language-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
