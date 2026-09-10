import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
    for (const width of [1440, 390]) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
        await context.route('**/*', route => {
            const url = new URL(route.request().url());
            if (url.hostname !== '127.0.0.1' || url.port !== '5177') return route.abort();
            if (url.pathname === '/api/admin/auth') return route.fulfill({ json: { ok: true, authenticated: true } });
            if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, body: 'OFFLINE_QA' });
            return route.continue();
        });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        await page.goto('http://127.0.0.1:5177', { waitUntil: 'networkidle' });
        await page.locator('.psi-sidebar nav button').filter({ hasText: '위험성평가 분석' }).first().click();
        await page.getByRole('heading', { name: '오늘 어떤 작업을 하시나요?' }).waitFor();
        await page.setViewportSize({ width, height: 900 });
        assert.equal(await page.locator('#ocr-operation-tools').evaluate(element => element.open), false);
        await page.screenshot({ path: `artifacts/ocr-start-${width}.png` });
        await page.getByRole('button', { name: /1\. 새 문서 분석/ }).click();
        await page.waitForFunction(() => document.activeElement?.id === 'new-ocr-capture-section');
        await page.locator('#new-ocr-capture-section').getByRole('button', { name: '처음 작업 선택으로', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.id === 'ocr-start-guide');
        await page.getByRole('button', { name: /2\. 백업에서 이어하기/ }).click();
        const picker = page.waitForEvent('filechooser');
        await page.getByRole('button', { name: 'JSON 파일 불러오기 · 50MiB 미만', exact: true }).click();
        await picker;
        await page.getByRole('button', { name: '큰 JSON·PC 보관함 열기', exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.id === 'ocr-archive-workspace');
        assert.equal(await page.locator('#ocr-operation-tools').evaluate(element => element.open), true);
        assert.equal(await page.locator('#ocr-archive-workspace details').evaluate(element => element.open), true);
        await page.getByRole('button', { name: /3\. 기존 기록 확인/ }).click();
        await page.waitForFunction(() => document.activeElement?.id === 'ocr-record-workspace');
        assert.equal(await page.locator('[data-ocr-collapse-delete="toggle-controls"]').innerText().then(text => text.includes('접기')), true);
        assert.deepEqual(errors, []);
        results.push({ width, passed: true, tasks: ['new-document', 'json-picker', 'archive-expanded', 'record-search-expanded'], apiCallsAllowed: false });
        await context.close();
    }
    await writeFile('artifacts/ocr-start-guide.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
} finally { await browser.close(); }
