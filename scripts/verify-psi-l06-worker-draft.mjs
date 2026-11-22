// Synthetic Chromium QA of the actual L06 worker draft route.
// Contains only invented safety text; no identity, worker token, or server write.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const host = 'http://127.0.0.1:5195';
const delay = milliseconds => new Promise(done => setTimeout(done, milliseconds));
const server = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5195', '--strictPort',
], { stdio: 'ignore' });

let browser;
try {
    let online = false;
    for (let step = 0; step < 80; step++) {
        if (server.exitCode !== null) throw new Error('Vite failed before readiness');
        try {
            if ((await fetch(host + '/worker-risk-draft')).ok) { online = true; break; }
        } catch {}
        await delay(250);
    }
    assert.ok(online, 'Local worker-draft UI did not start');
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const apiCalls = [];
    const externalCalls = [];
    await page.route('**/*', async route => {
        const url = route.request().url();
        if (url.includes('/api/')) { apiCalls.push(url); return route.abort(); }
        if (!url.startsWith(host + '/') && !url.startsWith('data:') && !url.startsWith('blob:')) {
            externalCalls.push(url); return route.abort();
        }
        return route.continue();
    });
    await page.goto(host + '/worker-risk-draft', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '작업 전 위험성평가 직접 작성 연습' }).waitFor();
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '0 / 5문항');
    assert.equal(await page.getByRole('button', { name: /Q5 5단계/ }).isDisabled(), true, 'Future steps must not be skipped');
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.getByRole('status').getByText(/Q1 문항을 먼저 작성/).waitFor();

    await page.locator('#psi-l06-Q1').fill('가설 작업발판 설치');
    await page.getByRole('button', { name: '다음 문항' }).click();
    assert.equal(await page.locator('#psi-l06-Q1').count(), 0, 'One question at a time');
    await page.locator('#psi-l06-Q2').fill('단부 안전난간 미설치로 추락 위험');
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-grade').selectOption('상');
    await page.locator('#psi-l06-grade-reason').fill('단부가 개방되어 있습니다');
    await page.getByRole('button', { name: '이전 문항' }).click();
    assert.equal(await page.locator('#psi-l06-Q2').inputValue(), '단부 안전난간 미설치로 추락 위험', 'Back navigation keeps in-memory text');
    await page.getByRole('button', { name: '다음 문항' }).click();
    assert.equal(await page.locator('#psi-l06-grade').inputValue(), '상', 'Back/forward keeps risk grade');
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-Q4').fill('난간 설치 확인, 안전대 고정');
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-Q5').fill('미설치 시 작업을 중단하고 관리자에게 보고');
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '5 / 5문항');

    await page.getByRole('button', { name: '작성 내용 확인' }).click();
    await page.getByRole('heading', { name: '내가 작성한 내용 확인' }).waitFor();
    await page.getByText('가설 작업발판 설치', { exact: true }).waitFor();
    await page.getByText(/서버 제출·관리자 확인·현장 조치 완료가 아닙니다/).waitFor();
    assert.equal(await page.locator('dl dt').count(), 5);
    assert.equal(await page.evaluate(() => localStorage.length), 0, 'Worksheet must not persist in localStorage');
    assert.equal(await page.evaluate(() => sessionStorage.length), 0, 'Worksheet must not persist in sessionStorage');
    assert.deepEqual(apiCalls, [], 'Worksheet must not call any /api endpoint');
    assert.deepEqual(externalCalls, [], 'Worksheet must not call external services');

    await page.getByRole('button', { name: '수정하기' }).click();
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '가설 작업발판 설치', 'Review edit returns to preserved Q1');
    await page.getByRole('button', { name: '전체 초기화' }).click();
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '');
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '0 / 5문항');

    await mkdir('artifacts/audit/psi-l06-worker-risk-draft', { recursive: true });
    await page.screenshot({ path: 'artifacts/audit/psi-l06-worker-risk-draft/390-empty.png', fullPage: true });
    await writeFile('artifacts/audit/psi-l06-worker-risk-draft/result.json', JSON.stringify({
        result: 'SYNTHETIC_PASS',
        route: '/worker-risk-draft',
        formQuestions: 5,
        apiCalls: apiCalls.length,
        externalCalls: externalCalls.length,
        storageWrites: 0,
        navigation: 'one-question-at-a-time, incomplete-step-blocked, back-and-forth-preserved',
        note: 'In-memory trial only, no worker submission/identity/Android validation',
    }, null, 2) + '\n');

    console.log('[PSI L06] SYNTHETIC_PASS: 5-step keyboard-accessible navigation/review/reset; zero API/storage calls');
} finally {
    await browser?.close();
    server.kill('SIGTERM');
}
