import { chromium } from 'playwright';
import assert from 'node:assert/strict';

// Isolated, disposable browser storage. Never invokes an OCR or paid API.
const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.pathname === '/api/admin/auth') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"authenticated":true,"ok":true}' });
        if (url.pathname.startsWith('/api/') || !['127.0.0.1', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net'].includes(url.hostname)) return route.fulfill({ status: 503, body: '{"ok":false}' });
        return route.continue();
    });
    await page.addInitScript(() => {
        localStorage.setItem('psi_dashboard_ui_mode_lock_v2', 'false');
    });
    await page.goto('http://127.0.0.1:5177', { waitUntil: 'networkidle' });
    await page.locator('.psi-sidebar nav button').filter({ hasText: '안전조치 통합 허브' }).click();
    await page.getByRole('button', { name: '공통', exact: true }).click();
    await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key, value) {
            if (key === 'psi_risk_check_sessions_v1') throw new DOMException('Synthetic fault', 'QuotaExceededError');
            return original.call(this, key, value);
        };
    });
    const dialogPromise = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: '이행점검 기록 저장', exact: true }).click();
    const dialog = await dialogPromise;
    assert.match(dialog.message(), /저장하지 못했습니다/);
    await dialog.accept();
    await click;
    assert.equal(await page.getByText('✅ 저장되었습니다.', { exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('psi_risk_check_sessions_v1')), null);
    await page.locator('.psi-sidebar nav button').first().click();
    await page.getByRole('button', { name: '상세 분석 대시보드', exact: true }).click();
    await page.getByRole('button', { name: '3. 팀 비교', exact: true }).click();
    await page.locator('#advanced-team-comparison').waitFor({ state: 'visible' });
    console.log('PASS: quota failure remains unsaved; direct team comparison is visible. API calls blocked.');
} finally {
    await browser.close();
}
