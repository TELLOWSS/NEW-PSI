import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

const base = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const out = 'artifacts/audit/psi-r79-81-mobile';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const checks = [];

try {
    for (const width of [320, 390, 768]) {
        const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.route('**/api/admin/auth', route => route.fulfill({ json: { ok: true, authenticated: true } }));
        await page.route('**/api/admin/survey-risk-baselines', route => route.fulfill({ json: { ok: true, items: [], historyAvailable: false } }));
        await page.addInitScript(({ dark }) => {
            sessionStorage.setItem('isAdminAuthenticated', 'true');
            localStorage.setItem('psi_theme_mode', dark ? 'dark' : 'light');
            localStorage.setItem('psi_ui_composition_v1', JSON.stringify({
                version: 4,
                sidebarOrder: ['dashboard', 'a4-education-material', 'survey-intelligence', 'reports', 'ocr-analysis'],
                hiddenSidebarPages: [],
            }));
        }, { dark: width === 390 });
        await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => document.documentElement.dataset.psiMounted === '1', undefined, { timeout: 30000 });
        const navigate = async target => {
            // Production preview intentionally does not expose DEV-only __setCurrentPage.
            // Follow the actual phone navigation (bottom rail -> full menu -> destination).
            const label = target === 'a4-education-material' ? '위험성평가 교육자료' : '근로자 의견 분석';
            const rail = page.getByRole('navigation', { name: '모바일 하단 탐색' });
            await rail.getByRole('button', { name: '더보기' }).click();
            const dialog = page.getByRole('dialog', { name: '전체 메뉴' });
            await dialog.getByRole('button', { name: label, exact: true }).click();
        };
        await navigate('a4-education-material');
        const studio = page.locator('[data-psi-screen="a4-education-studio"]');
        await studio.getByRole('heading', { name: '위험성평가 교육자료 스튜디오' }).waitFor();
        const nav = studio.getByRole('navigation', { name: '교육자료 제작 단계' });
        const buttons = nav.getByRole('button');
        assert.equal(await buttons.count(), 5, 'education 5-step navigation missing');
        const studioMetrics = await studio.evaluate(el => {
            const nav = el.querySelector('.psi-segmented-nav');
            const controls = [...el.querySelectorAll(':scope > .psi-enterprise-panel.no-print input, :scope > .psi-enterprise-panel.no-print select')];
            const buttons = [...nav.querySelectorAll('button')];
            const box = item => item.getBoundingClientRect();
            return {
                viewport: innerWidth,
                overflow: document.documentElement.scrollWidth - innerWidth,
                buttonMinHeight: Math.min(...buttons.map(item => box(item).height)),
                inputMinHeight: Math.min(...controls.map(item => box(item).height)),
                navWidth: box(nav).width,
                lastButtonWidth: box(buttons[buttons.length - 1]).width,
                columns: getComputedStyle(nav).gridTemplateColumns.split(' ').length,
            };
        });
        assert.ok(studioMetrics.overflow <= 2, 'education studio overflows screen at ' + width);
        assert.ok(studioMetrics.buttonMinHeight >= 44, 'education stage touch target too small at ' + width);
        assert.ok(studioMetrics.inputMinHeight >= 44, 'education input too small at ' + width);
        if (width <= 720) {
            assert.equal(studioMetrics.columns, 2, 'education steps must use two mobile columns');
            assert.ok(studioMetrics.lastButtonWidth >= studioMetrics.navWidth * 0.75, 'final preview step must be full width');
        }
        await buttons.nth(4).click();
        assert.equal(await buttons.nth(4).getAttribute('aria-current'), 'step', 'current education step is not announced');
        assert.match(await studio.locator('[data-psi-studio-progress]').innerText(), /현재 5\/5단계/);
        const preview = studio.locator('[data-psi-a4-preview-scroll]');
        await preview.waitFor({ state: 'visible' });
        const previewMetrics = await preview.evaluate(el => ({
            areaWidth: el.getBoundingClientRect().width,
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            tabIndex: el.tabIndex,
            paperWidth: el.querySelector('article[data-report-template-root="true"]')?.getBoundingClientRect().width ?? 0,
            pageWidth: el.querySelector('[data-report-page="true"]')?.getBoundingClientRect().width ?? 0,
        }));
        assert.ok(previewMetrics.areaWidth <= width + 1, 'mobile A4 preview must not exceed viewport');
        assert.ok(Math.abs(previewMetrics.paperWidth - 210 * 96 / 25.4) < 2, 'A4 paper shrank in phone preview');
        assert.ok(Math.abs(previewMetrics.pageWidth - 210 * 96 / 25.4) < 2, 'actual A4 page shrank in phone preview');
        assert.equal(previewMetrics.tabIndex, 0, 'A4 scrolling region must be keyboard accessible');
        await page.screenshot({ path: out + '/education-' + width + '.png', fullPage: false });

        await navigate('survey-intelligence');
        const survey = page.locator('[data-psi-screen="survey-intelligence"]');
        const coverage = survey.locator('[data-psi-survey="coverage"]');
        await coverage.waitFor({ state: 'visible', timeout: 25000 });
        assert.equal(await coverage.getByText('비교 가능한 위험도 응답').count(), 1);
        assert.equal(await coverage.getByText('관리자 기준 비교 가능 비율').count(), 1);
        const coverageMetrics = await coverage.evaluate(el => ({
            overflow: document.documentElement.scrollWidth - innerWidth,
            columns: getComputedStyle(el).gridTemplateColumns.split(' ').length,
            width: el.getBoundingClientRect().width,
        }));
        assert.ok(coverageMetrics.overflow <= 2, 'survey overflows viewport at ' + width);
        if (width === 320) assert.equal(coverageMetrics.columns, 1, '320px coverage must be single-column');
        if (width === 390) assert.equal(coverageMetrics.columns, 2, '390px coverage must be two-column');
        await page.screenshot({ path: out + '/survey-' + width + '.png', fullPage: false });
        assert.deepEqual(pageErrors, [], 'uncaught browser errors at ' + width);
        checks.push({ width, studio: studioMetrics, preview: previewMetrics, survey: coverageMetrics, pageErrors });
        await context.close();
    }
    console.log('PASS mobile education+survey visual flow R79–R84: 320, 390, 768');
    await writeFile(out + '/result.json', JSON.stringify({ result: 'PASS', syntheticOnly: true, checks }, null, 2));
} catch (error) {
    await writeFile(out + '/result.json', JSON.stringify({ result: 'FAIL', message: error.message, syntheticOnly: true, checks }, null, 2));
    throw error;
} finally {
    await browser.close();
}
