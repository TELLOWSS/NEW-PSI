// Synthetic data only; disposable browser storage and blocked external/API traffic.
// Native file operations use OPFS as a test substitute for the user folder picker.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const count = Number(process.argv[2] || 180);
assert(Number.isInteger(count) && count > 0 && count <= 500);
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--js-flags=--max-old-space-size=256'] });
const watchdog = setTimeout(() => { console.error('QA timeout'); void browser.close(); }, 180000);
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    let blocked = 0;
    const errors = [];
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' || url.port !== '5177') { blocked++; return route.abort(); }
        if (url.pathname === '/api/admin/auth') return route.fulfill({ json: { ok: true, authenticated: true } });
        if (url.pathname.startsWith('/api/')) { blocked++; return route.fulfill({ status: 503, body: 'OFFLINE_QA' }); }
        return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5177', { waitUntil: 'networkidle' });
    await page.locator('.psi-sidebar nav button').filter({ hasText: '위험성평가 분석' }).first().click();
    const panel = page.locator('details').filter({ has: page.locator('summary', { hasText: 'PC 저메모리 보관함' }) });
    await panel.locator('summary').click({ timeout: 30000 });
    console.log('archive-panel-ready');
    const bytes = await page.evaluate(async count => {
        const root = await navigator.storage.getDirectory();
        window.showDirectoryPicker = async ({ mode }) => {
            if (mode === 'readwrite') return root;
            for await (const [name, handle] of root.entries()) if (name.startsWith('PSI-보관-')) return handle;
            throw new Error('No generated folder');
        };
        const parts = ['['];
        const padding = 'A'.repeat(1024 * 1024);
        for (let i = 0; i < count; i++) {
            if (i) parts.push(',');
            parts.push(new Blob([JSON.stringify({ id: `QA-${i}`, name: `검증-${i}`, date: '2025.11.29', safetyScore: 85, safetyLevel: '중급', fullText: '  원문 보존\n', originalImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', padding })]));
        }
        parts.push(']');
        const file = new File(parts, 'synthetic-month.json', { type: 'application/json' });
        const transfer = new DataTransfer(); transfer.items.add(file);
        const details = [...document.querySelectorAll('details')].find(el => el.querySelector('summary')?.textContent.includes('PC 저메모리'));
        const input = details.querySelector('input[type=file]'); input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return file.size;
    }, count);
    console.log(JSON.stringify({ phase: 'fixture-created', bytes }));
    const started = Date.now();
    await panel.getByRole('button', { name: '새 PC 보관함 만들기', exact: true }).click();
    console.log('archive-started');
    await panel.getByRole('status').filter({ hasText: `${count}건 보관 완료` }).waitFor({ timeout: 240000 });
    const archive = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        for await (const [name, folder] of root.entries()) {
            if (!name.startsWith('PSI-보관-')) continue;
            const index = JSON.parse(await (await (await folder.getFileHandle('index.json')).getFile()).text());
            const records = await folder.getDirectoryHandle('records');
            const last = JSON.parse(await (await (await records.getFileHandle(index.entries.at(-1).file)).getFile()).text());
            return { count: index.records, indexBytes: (await (await folder.getFileHandle('index.json')).getFile()).size, preserved: last.date === '2025.11.29' && last.safetyLevel === '중급' && last.fullText === '  원문 보존\n' && last.padding.length === 1024 * 1024 };
        }
    });
    assert.equal(archive.count, count); assert(archive.preserved);
    await panel.getByRole('button', { name: '보관 폴더 열기', exact: true }).click();
    await panel.getByRole('status').filter({ hasText: '목록을 연결했습니다' }).waitFor();
    assert.equal(await panel.locator('li').count(), Math.min(count, 20));
    await panel.getByLabel('이름·날짜 검색', { exact: true }).fill(`검증-${count - 1}`);
    await panel.getByRole('button', { name: new RegExp(`검증-${count - 1} ·`) }).click();
    await panel.getByRole('region', { name: '선택한 보관 원문' }).waitFor();
    assert((await panel.innerText()).includes('원점수: 85 · 원등급: 중급'));
    await panel.screenshot({ path: 'artifacts/local-archive-browser.png' });
    await panel.getByRole('button', { name: '원문 닫기 · 메모리 해제', exact: true }).click();
    assert.equal(await panel.getByRole('region', { name: '선택한 보관 원문' }).count(), 0);
    assert.deepEqual(errors, []);
    const report = { passed: true, sourceMiB: +(bytes / 1024 / 1024).toFixed(1), records: count, ...archive, seconds: Math.round((Date.now() - started) / 1000), blocked, browserJsOldSpaceLimitMiB: 256, limitations: 'Synthetic data; OPFS substitutes directory picker. Not a measured total-memory guarantee or real low-end PC certification.' };
    await writeFile('artifacts/local-archive-browser.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
} finally { clearTimeout(watchdog); await browser.close(); }
