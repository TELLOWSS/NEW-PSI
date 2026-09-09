// Private, disposable localhost restore verification. No source records in logs/reports.
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const folder = resolve(process.argv[2] || '');
const rel = relative(process.cwd(), folder);
assert(process.argv[2] && (rel.startsWith('..') || isAbsolute(rel)), 'Private recovery folder must be outside repository');
const manifest = JSON.parse(await readFile(resolve(folder, '복구검증결과.json'), 'utf8'));
const hash = value => createHash('sha256').update(String(value || '')).digest('hex');
const expected = new Map();
for (const file of manifest.files) {
    const envelope = JSON.parse(await readFile(resolve(folder, file.name), 'utf8'));
    for (const record of envelope.records) expected.set(record.id, {
        score: record.safetyScore, level: record.safetyLevel,
        text: hash(record.fullText), image: hash(record.originalImage),
    });
}
const started = performance.now();
const browser = await chromium.launch({ headless: true });
let blockedRequests = 0;
const results = [];
try {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' || url.port !== '5177') { blockedRequests++; return route.abort(); }
        if (url.pathname === '/api/admin/auth') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"authenticated":true}' });
        if (url.pathname.startsWith('/api/')) { blockedRequests++; return route.fulfill({ status: 503, body: '{"ok":false,"error":"LOCAL_ONLY_QA"}' }); }
        return route.continue();
    });
    let completion = 0;
    let failure = false;
    page.on('dialog', async dialog => {
        if (dialog.type() === 'confirm') {
            if (/^(대용량 백업|백업 사전검증이 완료)/.test(dialog.message())) await dialog.accept();
            else { failure = true; await dialog.dismiss(); }
        } else {
            if (dialog.message().startsWith('백업 복구 완료')) completion++;
            else failure = true;
            await dialog.accept();
        }
    });
    await page.goto('http://127.0.0.1:5177', { waitUntil: 'networkidle' });
    await page.locator('.psi-sidebar nav button').filter({ hasText: '위험성평가 분석' }).first().click();
    const files = manifest.files;
    for (const file of files) {
        const before = completion;
        await page.locator('input[type="file"][accept=".json"]').setInputFiles(resolve(folder, file.name));
        const deadline = Date.now() + 180000;
        while (completion === before && !failure && Date.now() < deadline) await page.waitForTimeout(500);
        assert(!failure && completion > before, 'Restore did not complete; no private dialog text logged');
        results.push({ month: file.month, restored: file.records });
        console.log(JSON.stringify({ phase: 'browser-restored', month: file.month, records: file.records }));
    }
    await page.reload({ waitUntil: 'networkidle' });
    const actual = await page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const request = indexedDB.open('PSI_Enterprise_V4', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('DB open failed')); });
        const keys = await new Promise((resolve, reject) => { const request = db.transaction('worker_records').objectStore('worker_records').getAllKeys(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('DB keys failed')); });
        const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(value || ''))))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const output = [];
        for (const key of keys) {
            const record = await new Promise((resolve, reject) => { const request = db.transaction('worker_records').objectStore('worker_records').get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error('DB read failed')); });
            output.push({ id: record.id, score: record.safetyScore, level: record.safetyLevel, text: await digest(record.fullText), image: await digest(record.originalImage) });
        }
        db.close();
        return output;
    });
    assert.equal(actual.length, expected.size, 'Persisted count mismatch');
    for (const { id, ...record } of actual) assert.deepEqual(record, expected.get(id), 'Persisted evidence mismatch (private ID omitted)');
    const report = { status: 'passed', records: actual.length, months: results, reloadVerified: true, imageTextScoreLevelHashesMatched: true, externalRequestsBlocked: blockedRequests, seconds: Math.round((performance.now() - started) / 1000), scope: 'Disposable Chromium context, localhost API blocked; production storage unchanged' };
    await writeFile(resolve(folder, '브라우저복원검증.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
    console.log(JSON.stringify(report));
} finally { await browser.close(); }
