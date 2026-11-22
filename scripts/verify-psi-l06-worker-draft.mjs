// Synthetic Chromium QA of the actual L06 worker draft route.
// Contains only invented safety text; no identity, worker token, or server write.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

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
    // L28: simulate the native cancelable beforeunload event without actually
    // navigating or saving safety answers. Real mobile prompt UI varies.
    const probeUnloadWarning = () => page.evaluate(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    });
    assert.equal(await probeUnloadWarning(), false,
        'Blank practice form must not block browser navigation');
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '0 / 5문항');
    assert.equal(await page.getByRole('button', { name: /Q5 5단계/ }).isDisabled(), true, 'Future steps must not be skipped');
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.getByRole('status').getByText(/Q1 문항을 먼저 작성/).waitFor();

    await page.locator('#psi-l06-Q1').fill('가설 작업발판 설치');
    await page.waitForFunction(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    });
    assert.equal(await probeUnloadWarning(), true,
        'After entering Q1, accidental refresh/tab close must request confirmation');

    // L26: browser Ctrl+P is available before a draft is complete. It must
    // print only a non-submission notice, never incomplete worker safety text.
    await page.emulateMedia({ media: 'print' });
    const unfinishedStyles = await page.evaluate(() => ({
        visibleRoot: getComputedStyle(document.getElementById('root')).display !== 'none',
        hiddenEditForm: getComputedStyle(document.querySelector('.psi-l06-edit-form')).display === 'none',
        visibleWarning: getComputedStyle(document.querySelector('.psi-l06-incomplete-print-warning')).display !== 'none',
    }));
    assert.deepEqual(unfinishedStyles, { visibleRoot: true, hiddenEditForm: true, visibleWarning: true },
        'L26 unfinished Q1-Q5 print must replace partial inputs with a visible warning');
    await mkdir('artifacts/audit/psi-l06-worker-risk-draft', { recursive: true });
    const unfinishedBytes = await page.pdf({
        path: 'artifacts/audit/psi-l06-worker-risk-draft/a4-unfinished-trial-no-answers.pdf',
        format: 'A4', printBackground: true, preferCSSPageSize: true,
    });
    const unfinishedPdf = await getDocument({ data: new Uint8Array(unfinishedBytes) }).promise;
    assert.equal(unfinishedPdf.numPages, 1, 'Unfinished practice print should be a single A4 notice');
    const unfinishedText = (await (await unfinishedPdf.getPage(1)).getTextContent()).items
        .map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, '');
    assert.ok(unfinishedText.includes('작성중인연습기록은인쇄할수없습니다'),
        'Unfinished print must explain why the answers were not printed');
    assert.ok(unfinishedText.includes('정식제출이아닙니다'),
        'Unfinished print must clearly state this is not a formal submission');
    assert.ok(!unfinishedText.includes('가설작업발판설치'),
        'Unfinished print must not expose a partially-entered worker answer');
    await page.emulateMedia({ media: 'screen' });

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

    // L24: the shared report-print CSS hides #root. The trial route must be
    // isolated so its own A4 printout contains the five written answers.
    await page.emulateMedia({ media: 'print' });
    const printStatus = await page.evaluate(() => ({
        rootVisible: getComputedStyle(document.getElementById('root')).display !== 'none',
        progressHidden: getComputedStyle(document.querySelector('.psi-l06-progress-screen')).display === 'none',
        reviewVisible: getComputedStyle(document.querySelector('.psi-l06-review-print')).display !== 'none',
        actionHidden: getComputedStyle(document.querySelector('.psi-l06-review-actions')).display === 'none',
    }));
    assert.deepEqual(printStatus, {
        rootVisible: true, progressHidden: true, reviewVisible: true, actionHidden: true,
    }, 'L06 print CSS must show ONLY the review, unlike the generic report print shell');
    await mkdir('artifacts/audit/psi-l06-worker-risk-draft', { recursive: true });
    const pdfBytes = await page.pdf({
        path: 'artifacts/audit/psi-l06-worker-risk-draft/a4-five-question-trial.pdf',
        format: 'A4', printBackground: true, preferCSSPageSize: true,
    });
    const pdf = await getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    assert.equal(pdf.numPages, 1, 'Normal-length five-question L06 trial must print as one A4 page');
    const pageText = (await (await pdf.getPage(1)).getTextContent()).items
        .map(item => 'str' in item ? item.str : '').join(' ');
    for (const key of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) {
        assert.ok(pageText.includes(key), 'Trial print must contain ' + key);
    }
    assert.ok(!pageText.includes('서버 접수번호'), 'Practice print must not invent a server receipt');
    await page.emulateMedia({ media: 'screen' });

    await page.getByRole('button', { name: '수정하기' }).click();
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '가설 작업발판 설치', 'Review edit returns to preserved Q1');

    // L27: one tap on reset cannot discard a completed worksheet.
    await page.getByRole('button', { name: '전체 초기화' }).click();
    const resetPrompt = page.getByRole('group', { name: '작성 내용 초기화 확인' });
    await resetPrompt.getByText('작성한 Q1~Q5 내용을 모두 지우시겠습니까?').waitFor();
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '가설 작업발판 설치',
        'First reset tap must preserve typed Q1 and every other answer');
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '5 / 5문항');
    await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '취소하고 계속 작성');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()),
        '취소하고 계속 작성', 'Keyboard focus should start on the safer Cancel action');
    await resetPrompt.getByRole('button', { name: '취소하고 계속 작성' }).click();
    assert.equal(await resetPrompt.count(), 0, 'Cancel dismisses the inline confirmation');
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '가설 작업발판 설치',
        'Cancel must preserve Q1');
    assert.equal(await probeUnloadWarning(), true,
        'Canceling reset must preserve the unload warning and the user text');

    // Escape is another safe exit, with no new storage or API calls.
    await page.getByRole('button', { name: '전체 초기화' }).click();
    await resetPrompt.getByRole('button', { name: '취소하고 계속 작성' }).press('Escape');
    assert.equal(await resetPrompt.count(), 0, 'Escape must dismiss reset confirmation');
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '가설 작업발판 설치');

    await page.getByRole('button', { name: '전체 초기화' }).click();
    await resetPrompt.getByRole('button', { name: '초기화 확정' }).click();
    assert.equal(await page.locator('#psi-l06-Q1').inputValue(), '');
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '0 / 5문항');
    await page.waitForFunction(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return !event.defaultPrevented;
    });
    assert.equal(await probeUnloadWarning(), false,
        'After confirmed clear, navigation must no longer be warned');

    // L25: all five answers may legally approach 500 characters. Long Korean
    // responses must paginate instead of clipping the final safety promise.
    // This is a synthetic print stress test, not a real worker submission.
    const longAnswer = key => {
        const endMarker = 'END' + key;
        const line = key + ' 위험구역을 확인하고 안전조치를 다시 점검한 후 관리자와 공유한다.\n';
        return line.repeat(20).slice(0, 500 - endMarker.length) + endMarker;
    };
    await page.locator('#psi-l06-Q1').fill(longAnswer('Q1'));
    await page.waitForFunction(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
    });
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-Q2').fill(longAnswer('Q2'));
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-grade').selectOption('상');
    await page.locator('#psi-l06-grade-reason').fill(longAnswer('Q3'));
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-Q4').fill(longAnswer('Q4'));
    await page.getByRole('button', { name: '다음 문항' }).click();
    await page.locator('#psi-l06-Q5').fill(longAnswer('Q5'));
    await page.getByRole('button', { name: '작성 내용 확인' }).click();
    await page.getByRole('heading', { name: '내가 작성한 내용 확인' }).waitFor();
    await page.emulateMedia({ media: 'print' });
    const longPdfBytes = await page.pdf({
        path: 'artifacts/audit/psi-l06-worker-risk-draft/a4-five-question-long-trial.pdf',
        format: 'A4', printBackground: true, preferCSSPageSize: true,
    });
    const longPdf = await getDocument({ data: new Uint8Array(longPdfBytes) }).promise;
    assert.ok(longPdf.numPages > 1 && longPdf.numPages <= 10,
        'Five maximum-length Korean answers must paginate without excessive blank pages');
    let fullLongText = '';
    for (let n = 1; n <= longPdf.numPages; n++) {
        fullLongText += (await (await longPdf.getPage(n)).getTextContent()).items
            .map(item => 'str' in item ? item.str : '').join(' ') + ' ';
    }
    const normalizedLongText = fullLongText.replace(/\s+/g, '');
    for (const key of ['Q1', 'Q2', 'Q3', 'Q4', 'Q5']) {
        assert.ok(normalizedLongText.includes('END' + key),
            'L25 long A4 output lost the ending of ' + key);
    }
    assert.ok(normalizedLongText.includes('정식제출이아닙니다'),
        'L25 long print must retain unofficial-trial warning');
    await page.emulateMedia({ media: 'screen' });
    await page.getByRole('button', { name: '수정하기' }).click();
    await page.getByRole('button', { name: '전체 초기화' }).click();
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '5 / 5문항',
        'Long Q1-Q5 record must survive until the explicit confirmation');
    await page.getByRole('group', { name: '작성 내용 초기화 확인' })
        .getByRole('button', { name: '초기화 확정' }).click();
    assert.equal(await page.locator('[data-testid=l06-progress]').textContent(), '0 / 5문항');
    await page.waitForFunction(() => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return !event.defaultPrevented;
    });
    assert.equal(await probeUnloadWarning(), false,
        'Final confirmed clear must release the beforeunload guard');
    assert.deepEqual(apiCalls, [], 'Long worksheet must never call any API');
    assert.deepEqual(externalCalls, [], 'Long worksheet must never call external services');

    await mkdir('artifacts/audit/psi-l06-worker-risk-draft', { recursive: true });
    await page.screenshot({ path: 'artifacts/audit/psi-l06-worker-risk-draft/390-empty.png', fullPage: true });
    await writeFile('artifacts/audit/psi-l06-worker-risk-draft/result.json', JSON.stringify({
        result: 'SYNTHETIC_PASS',
        route: '/worker-risk-draft',
        formQuestions: 5,
        apiCalls: apiCalls.length,
        externalCalls: externalCalls.length,
        storageWrites: 0,
        resetSafety: 'first-tap-prompt, cancel-preserves, Escape-preserves, confirmed-only-deletion',
        unloadGuard: 'blank-allows, typed-warns, cancel-preserves, confirmed-reset-releases; mobile-prompt-not-guaranteed',
        a4TrialPrint: { pages: 1, questions: 5, unfinishedWarningOnly: true, longAnswerPages: longPdf.numPages, longAnswersIntact: true, receiptCreated: false, syntheticOnly: true },
        navigation: 'one-question-at-a-time, incomplete-step-blocked, back-and-forth-preserved',
        note: 'In-memory trial only, no worker submission/identity/Android validation',
    }, null, 2) + '\n');

    console.log('[PSI L06] SYNTHETIC_PASS: unsaved unload protection + safe reset + A4 normal/long; zero API/storage calls');
} finally {
    await browser?.close();
    server.kill('SIGTERM');
}
