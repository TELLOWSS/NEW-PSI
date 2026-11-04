import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

/**
 * Browser integration: truly clicks the operator download buttons and opens
 * the emitted ZIP/PDF. All records/translations are synthetic; no API spend.
 * Chromium at 390px is NOT a real Samsung Internet physical-device test.
 */
const base = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const out = resolve('artifacts/audit/psi-r88-download');
await mkdir(out, { recursive: true });

const draft = {
    month: '2026-11', workType: '형틀', title: '양중 전 확인',
    opening: '작업 전 통제구역 확인', coreMessage: '인양물 아래 접근 금지',
    risks: [], videoScenes: [], accidentCases: [], focusPoints: [], notices: [],
    checklist: [], confirmationQuestions: [], closingCommitment: '위험 시 작업 중지',
    sourceCount: 0, generatedAt: '2026-11-01T00:00:00.000Z',
};
const sourceText = [
    '[양중 전 확인]', '작업 전 통제구역 확인', '', '[오늘 반드시 전달할 한 문장]',
    '인양물 아래 접근 금지', '', '1. 교육 전 5분 핵심 동영상',
    '- 관리자 검수에서 동영상 장면표를 제외했습니다. 원페이지 교육자료 중심으로 진행합니다.',
    '', '2. 최근 재해사례와 현장 연관성',
    '- 관리자 검수에서 부적합한 재해사례를 제외했습니다. 현장 기록 기반 위험공유로 대체합니다.',
    '', '3. 다음 달 위험성평가 상등급 공유',
    '- 다음 달 위험성평가 회의자료(PPT/PDF/문서)에서 상등급으로 지정된 공유 항목이 없습니다. 일반 추천 위험은 이 영역에 넣지 않습니다.',
    '', '4. 현장 중점관리 포인트',
    '- 작업구역, 일정, 인원, 장비 조건이 바뀌면 작업 전 다시 확인합니다.',
    '', '5. 공지사항', '- 별도 공지 없음. 현장 변경사항은 교육 전 최종 확인합니다.',
    '', '[이해 확인 및 행동 약속]', '- 위험 시 작업 중지',
].join('\n');
const key = draft.month + '::' + draft.workType;
const studio = {
    version: 3, lastScopeKey: key, snapshots: {
        [key]: {
            educationMonth: draft.month, workType: draft.workType, draft, sources: [],
            translatedTexts: {}, translationSourceText: sourceText,
            structuredTranslations: {
                'en-US': {
                    workType: 'Formwork', title: 'Check before lifting',
                    opening: 'Check the exclusion zone before starting',
                    coreMessage: 'Never walk beneath a suspended load',
                    video: [], accident: [], risks: [], focus: [],
                    notices: [], questions: [], closingCommitment: 'Stop work when unsafe',
                },
            },
            savedAt: '2026-11-01T00:00:00.000Z',
        },
    },
};

const checks = [];
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const externalCalls = [];
    // R96: proof that the print renderer does not rely on third-party webfont
    // availability. These are synthetic browser routes, never field data.
    const blockedRemoteFonts = [];
    await page.route(/^https:\/\/fonts\.(?:googleapis|gstatic)\.com\//, route => {
        blockedRemoteFonts.push(route.request().url());
        return route.abort('failed');
    });
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('request', request => {
        if (/cdnjs\.cloudflare\.com\/ajax\/libs\/(jspdf|html2canvas)/.test(request.url())) externalCalls.push(request.url());
    });
    await page.addInitScript(({ storedStudio }) => {
        sessionStorage.setItem('isAdminAuthenticated', 'true');
        localStorage.setItem('psi_tbm_education_studio_v2', JSON.stringify(storedStudio));
        localStorage.setItem('psi_ui_composition_v1', JSON.stringify({
            version: 4,
            sidebarOrder: ['dashboard', 'a4-education-material', 'survey-intelligence'],
            hiddenSidebarPages: [],
        }));
    }, { storedStudio: studio });
    await page.route('**/api/admin/auth', route => route.fulfill({ json: { ok: true, authenticated: true } }));
    await page.route('**/api/admin/survey-risk-baselines', route => route.fulfill({ json: { ok: true, items: [], historyAvailable: false } }));
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.dataset.psiMounted === '1', undefined, { timeout: 30_000 });
    const rail = page.getByRole('navigation', { name: '모바일 하단 탐색' });
    await rail.getByRole('button', { name: '더보기' }).click();
    await page.getByRole('dialog', { name: '전체 메뉴' }).getByRole('button', { name: '위험성평가 교육자료', exact: true }).click();
    await page.getByRole('heading', { name: '위험성평가 교육자료 스튜디오' }).waitFor();
    await page.getByRole('button', { name: '5. 출력 확인' }).click();
    const a4 = page.locator('[data-psi-a4-preview-scroll] [data-a4-safety-poster="true"]');
    await a4.waitFor({ timeout: 25_000 });
    assert.equal(await a4.getAttribute('lang'), 'ko-KR', 'Korean poster missing');
    const pageWidth = await page.locator('[data-psi-a4-preview-scroll] [data-report-page="true"]').evaluate(el => el.getBoundingClientRect().width);
    assert.ok(Math.abs(pageWidth - 210 * 96 / 25.4) < 2, 'mobile A4 page width is not physically 210mm');
    // R92: webfont load is observable but NEVER equivalent to visual/glyph approval.
    await page.getByRole('button', { name: '현재 언어 글꼴 점검' }).click();
    const fontResult = page.locator('[data-psi-a4-font-result]');
    await fontResult.waitFor({ state: 'visible', timeout: 5_000 });
    const fontSample = await page.getByLabel('선택 언어의 글자 모양 확인용 샘플').innerText();
    assert.ok(fontSample.includes('가나다라마'), 'Korean script sample missing');
    assert.match(await fontResult.innerText(), /직접 확인|검증된 것은 아닙니다|육안 확인/);
    checks.push({ label: 'R92 advisory font check', sample: fontSample, status: await fontResult.getAttribute('data-psi-a4-font-result') });

    // R96: keep a synthetic FontFace pending throughout the two-language
    // export. The app must NOT need document.fonts.ready or external font data
    // to finish these local files. No actual font bytes are downloaded.
    let heldFontRoute;
    await page.route('**/__psi_qa_slow_webfont__.woff2', route => { heldFontRoute = route; });
    await page.evaluate(() => {
        const face = new FontFace('PSI-QA-Slow-Font', 'url(/__psi_qa_slow_webfont__.woff2)');
        document.fonts.add(face);
        window.__psiQaSlowFontFace = face;
        void face.load().catch(() => undefined);
    });
    await page.waitForFunction(() => document.fonts.status === 'loading', undefined, { timeout: 5_000 });
    checks.push({ label: 'R96 pending remote font setup', loading: true });

    const requestDownload = async label => {
        const button = page.getByRole('button', { name: label, exact: true });
        await button.waitFor({ state: 'visible' });
        assert.equal(await button.isDisabled(), false, 'download must be enabled: ' + label);
        const event = page.waitForEvent('download', { timeout: 75_000 });
        await button.click();
        let download;
        try {
            download = await Promise.race([
                event,
                page.getByText(/묶음 다운로드는 요청하지 않았습니다/).waitFor({ state: 'visible', timeout: 75_000 })
                    .then(async () => { throw new Error('Education export was blocked: ' + (await page.locator('body').innerText()).slice(-1200)); }),
            ]);
        } catch (error) {
            const diagnostics = await page.evaluate(() => {
                const root = document.querySelector('[data-psi-screen="a4-education-studio"]');
                const pageNode = root?.querySelector('[data-psi-a4-preview-scroll] [data-report-page="true"]');
                const posterNode = pageNode?.querySelector('[data-a4-safety-poster="true"]');
                return {
                    lastText: (root?.textContent || '').slice(-2200),
                    paperWidth: pageNode?.getBoundingClientRect().width,
                    posterWidth: posterNode?.getBoundingClientRect().width,
                    currentLanguage: pageNode?.getAttribute('lang'),
                    fonts: document.fonts?.status,
                };
            });
            // This test intentionally keeps document.fonts.status='loading'.
            // Playwright screenshots wait for fonts by default and can hang,
            // masking the ORIGINAL download failure. Keep diagnostics even if
            // the screenshot is impossible, and always report the root cause.
            if (diagnostics.fonts !== 'loading') {
                await page.screenshot({
                    path: resolve(out, 'download-error.png'),
                    fullPage: false,
                    timeout: 5_000,
                }).catch(() => undefined);
            }
            throw new Error('Browser did not download ' + label + ': ' + String(error) + ' :: ' + JSON.stringify(diagnostics));
        }
        const path = await download.path();
        assert.ok(path, 'browser did not retain the downloaded file');
        const bytes = await readFile(path);
        assert.ok(bytes.length > 500, 'download unexpectedly empty');
        checks.push({ label, filename: download.suggestedFilename(), bytes: bytes.length });
        await page.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible' });
        return { bytes, download };
    };

    // First prove a real ZIP is emitted with exactly two UTF-8 named PNG images.
    const zip = await requestDownload('전체 다국어 PNG · ZIP 한 파일');
    assert.match(zip.download.suggestedFilename(), /\.zip$/i);
    const dv = new DataView(zip.bytes.buffer, zip.bytes.byteOffset, zip.bytes.byteLength);
    const end = zip.bytes.length - 22;
    assert.equal(dv.getUint32(end, true), 0x06054b50, 'ZIP end directory absent');
    assert.equal(dv.getUint16(end + 10, true), 2, 'ZIP must contain two languages');
    let central = dv.getUint32(end + 16, true);
    const names = [];
    for (let i = 0; i < 2; i++) {
        assert.equal(dv.getUint32(central, true), 0x02014b50, 'ZIP central directory invalid');
        const nameLen = dv.getUint16(central + 28, true);
        const extraLen = dv.getUint16(central + 30, true);
        const commentLen = dv.getUint16(central + 32, true);
        const name = new TextDecoder().decode(zip.bytes.subarray(central + 46, central + 46 + nameLen));
        names.push(name);
        const local = dv.getUint32(central + 42, true);
        const localNameLen = dv.getUint16(local + 26, true);
        const localExtraLen = dv.getUint16(local + 28, true);
        const data = local + 30 + localNameLen + localExtraLen;
        assert.deepEqual([...zip.bytes.subarray(data, data + 8)], [137,80,78,71,13,10,26,10], 'ZIP member not PNG');
        assert.equal(dv.getUint16(central + 10, true), 0, 'ZIP must use STORE method');
        central += 46 + nameLen + extraLen + commentLen;
    }
    assert.equal(new Set(names).size, 2);
    assert.ok(names.some(name => name.includes('한국어')));
    assert.ok(names.some(name => name.includes('영어')));
    checks.push({ label: 'PNG ZIP UTF-8 members', names });

    // Then prove a PDF emitted from real browser canvases opens with two A4 pages.
    const pdf = await requestDownload('전체 다국어 PDF · 한 파일');
    assert.match(pdf.download.suggestedFilename(), /\.pdf$/i);
    assert.equal(pdf.bytes.subarray(0, 8).toString(), '%PDF-1.4');
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = getDocument({ data: Uint8Array.from(pdf.bytes), useSystemFonts: true });
    const document = await task.promise;
    assert.equal(document.numPages, 2, 'PDF lost a language page');
    const page1 = await document.getPage(1);
    const page2 = await document.getPage(2);
    for (const pdfPage of [page1, page2]) {
        const viewport = pdfPage.getViewport({ scale: 1 });
        assert.ok(Math.abs(viewport.width - 210 * 72 / 25.4) < 0.02, 'PDF width is not A4');
        assert.ok(Math.abs(viewport.height - 297 * 72 / 25.4) < 0.02, 'PDF height is not A4');
        assert.ok((await pdfPage.getOperatorList()).fnArray.length > 0, 'PDF page content missing');
    }
    await task.destroy();
    checks.push({ label: 'PDF parsed', pages: 2, format: 'A4' });

    // R104-R106: real ZIP -> PDF on a device WITHOUT createImageBitmap.
    // The old implementation failed before producing a PDF on such browsers.
    await page.evaluate(() => {
        window.__psiQaOriginalCreateImageBitmap = window.createImageBitmap;
        window.__psiQaOriginalCreateObjectURL = URL.createObjectURL;
        window.__psiQaLocalPngDecodes = 0;
        URL.createObjectURL = function (blob) {
            if (blob instanceof Blob && blob.type === 'image/png') window.__psiQaLocalPngDecodes++;
            return window.__psiQaOriginalCreateObjectURL.call(this, blob);
        };
        window.createImageBitmap = undefined;
    });
    const fallbackPdf = await requestDownload('전체 다국어 PDF · 한 파일');
    assert.equal(fallbackPdf.bytes.subarray(0, 8).toString(), '%PDF-1.4');
    const fallbackTask = getDocument({ data: Uint8Array.from(fallbackPdf.bytes), useSystemFonts: true });
    const fallbackDoc = await fallbackTask.promise;
    assert.equal(fallbackDoc.numPages, 2, 'WebKit-style decoder fallback lost a language page');
    await fallbackTask.destroy();
    assert.equal(await page.evaluate(() => window.__psiQaLocalPngDecodes), 2, 'local image fallback did not decode two cached PNGs');
    checks.push({ label: 'R104 missing createImageBitmap fallback', pages: 2, localPngLoads: 2 });

    // A function may exist but reject on valid PNGs: still use local decoding,
    // do not recapture the DOM or call a remote API.
    await page.evaluate(() => {
        window.createImageBitmap = () => Promise.reject(new Error('unsupported bitmap decoder (synthetic)'));
    });
    const rejectedPdf = await requestDownload('전체 다국어 PDF · 한 파일');
    const rejectedTask = getDocument({ data: Uint8Array.from(rejectedPdf.bytes), useSystemFonts: true });
    const rejectedDoc = await rejectedTask.promise;
    assert.equal(rejectedDoc.numPages, 2);
    await rejectedTask.destroy();
    assert.equal(await page.evaluate(() => window.__psiQaLocalPngDecodes), 4);
    checks.push({ label: 'R105 rejected native decode fallback', pages: 2, localPngLoads: 2 });

    // Both native decoder and local URL are unavailable. Must fail closed,
    // release the export UI and NEVER emit an incorrect PDF download.
    await page.evaluate(() => {
        window.createImageBitmap = undefined;
        URL.createObjectURL = blob => {
            if (blob instanceof Blob && blob.type === 'image/png') {
                throw new Error('temporary image URLs blocked (synthetic)');
            }
            return window.__psiQaOriginalCreateObjectURL.call(URL, blob);
        };
    });
    await page.getByRole('button', { name: '전체 다국어 PDF · 한 파일', exact: true }).click();
    await page.getByText(/묶음 다운로드는 요청하지 않았습니다.*임시 이미지 주소를 만들 수 없습니다/).waitFor({
        state: 'visible', timeout: 15_000,
    });
    assert.equal(await page.getByRole('button', { name: '전체 다국어 PDF · 한 파일', exact: true }).isDisabled(), false,
        'PDF export controls remained locked after decoder failure');
    assert.equal(await page.locator('[data-psi-export-host]').count(), 0,
        'stalled local conversion left an isolated report clone');
    await page.evaluate(() => {
        window.createImageBitmap = window.__psiQaOriginalCreateImageBitmap;
        URL.createObjectURL = window.__psiQaOriginalCreateObjectURL;
    });
    const recoveredPdf = await requestDownload('전체 다국어 PDF · 한 파일');
    const recoveredTask = getDocument({ data: Uint8Array.from(recoveredPdf.bytes), useSystemFonts: true });
    const recoveredDoc = await recoveredTask.promise;
    assert.equal(recoveredDoc.numPages, 2);
    await recoveredTask.destroy();
    checks.push({ label: 'R106 unavailable local decoder recovery', failedClosed: true, exportUnlocked: true, recoveredPages: 2 });

    assert.deepEqual(externalCalls, [], 'external jsPDF or html2canvas CDN was required');
    assert.deepEqual(pageErrors, [], 'uncaught browser error during download');
    checks.push({ label: 'network and browser errors', externalCalls, pageErrors });
    assert.equal(await page.evaluate(() => document.fonts.status), 'loading',
        'the deliberately stalled FontFace completed before offline export proof');
    if (heldFontRoute) await heldFontRoute.abort('failed').catch(() => {});
    await page.unroute('**/__psi_qa_slow_webfont__.woff2');
    await page.evaluate(() => document.fonts.delete(window.__psiQaSlowFontFace));
    checks.push({ label: 'R96 offline captures while font load is pending', blockedRemoteFonts: blockedRemoteFonts.length });

    // R93: an unresolved external A4 image must fail with an actionable message,
    // never leave the phone waiting indefinitely or claim a successful file.
    let stalledImageRoute;
    await page.route('**/__psi_qa_stalled_a4_image__.png', route => { stalledImageRoute = route; });
    await page.evaluate(() => {
        const poster = document.querySelector('[data-psi-a4-preview-scroll] [data-a4-safety-poster="true"]');
        if (!poster) throw new Error('A4 poster is absent before stalled-image preflight');
        const img = document.createElement('img');
        img.src = '/__psi_qa_stalled_a4_image__.png';
        img.alt = 'Synthetic unavailable image';
        img.width = 1;
        img.height = 1;
        img.style.position = 'absolute';
        img.style.left = '0';
        img.style.top = '0';
        img.id = 'psi-qa-unavailable-image';
        poster.appendChild(img);
    });
    await page.getByRole('button', { name: 'PNG 이미지', exact: true }).click();
    await page.getByText(/A4 이미지가 준비되지 않았습니다/).waitFor({ state: 'visible', timeout: 24_000 });
    assert.equal(await page.getByRole('button', { name: 'PNG 이미지', exact: true }).isDisabled(), false,
        'stalled capture did not release export state');
    // R105: even when waitForImages fails before cleanup is returned, hidden
    // report clones must be reclaimed instead of consuming mobile memory.
    assert.equal(await page.locator('[data-psi-export-host]').count(), 0,
        'failed A4 capture leaked a hidden report host');
    checks.push({ label: 'R93/R105 stalled image recovery', message: 'Clear failure, released controls and report DOM' });
    if (stalledImageRoute) await stalledImageRoute.abort().catch(() => {});
    await page.unroute('**/__psi_qa_stalled_a4_image__.png');
    await page.evaluate(() => document.getElementById('psi-qa-unavailable-image')?.remove());

    // R100: local, operator-acknowledged proof is not automatic certification.
    // First ensure nobody is silently marked as having reviewed the file.
    const review = page.locator('[data-psi-a4-output-review="true"]');
    await review.waitFor({ state: 'visible' });
    const reviewState = review.locator('[data-psi-a4-review-status]');
    assert.equal(await reviewState.getAttribute('data-psi-a4-review-status'), 'needs-review');
    assert.match(await review.locator('[data-psi-a4-review-count]').innerText(), /0\/2/);
    const saveReview = review.locator('[data-psi-a4-review-save]');
    assert.equal(await saveReview.isDisabled(), true, 'review cannot be saved without all three human confirmations');
    for (const check of ['fileOpened', 'glyphsLegible', 'safetyMeaningCompared']) {
        await review.locator('[data-psi-a4-review-check="' + check + '"]').check();
    }
    await saveReview.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
        const button = document.querySelector('[data-psi-a4-review-save]');
        return button && !button.disabled;
    }, undefined, { timeout: 10_000 });
    await saveReview.click();
    await page.waitForFunction(() => document.querySelector('[data-psi-a4-review-status]')?.getAttribute('data-psi-a4-review-status') === 'recorded');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('psi_a4_local_output_review_v1') || '{}'));
    assert.equal(Object.keys(stored).length, 1, 'one local review expected');
    assert.match(JSON.stringify(stored), /[a-f0-9]{64}/, 'content SHA-256 missing');
    assert.doesNotMatch(JSON.stringify(stored), /Never walk beneath a suspended load|인양물 아래 접근 금지/, 'source text leaked into local review record');
    assert.match(await review.locator('[data-psi-a4-review-count]').innerText(), /1\/2/);

    // R103: real browser download, UTF-8 CSV bytes (NOT just button visibility).
    const ledgerDownload = await requestDownload('현재 검수 현황 CSV 저장');
    assert.match(ledgerDownload.download.suggestedFilename(), /\.csv$/i);
    // TextDecoder strips a BOM by default. Assert the original downloaded
    // bytes, not a decoded string that already discarded those bytes.
    assert.deepEqual([...ledgerDownload.bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf],
        'Excel UTF-8 BOM bytes missing from downloaded CSV');
    const ledgerCsv = new TextDecoder().decode(ledgerDownload.bytes);
    assert.match(ledgerCsv, /이 기기 확인기록 있음/);
    assert.match(ledgerCsv, /"영어","en-US","미확인"/);
    assert.match(ledgerCsv, /법정 증빙·서버 승인이 아님/);
    assert.doesNotMatch(ledgerCsv, /Never walk beneath a suspended load|인양물 아래 접근 금지/, 'source material leaked into local CSV');
    const rowsFromCsv = ledgerCsv.split('\r\n').filter(Boolean);
    assert.equal(rowsFromCsv.length, 4, 'CSV must contain disclaimer, header and two scope-language rows');
    checks.push({ label: 'R103 review-ledger CSV download', rows: rowsFromCsv.length, reviewStatus: '1 recorded / 1 pending', privacySafe: true });

    await review.getByRole('button', { name: /영어 · 확인 필요/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-psi-a4-preview-scroll] [data-a4-safety-poster]')?.getAttribute('lang') === 'en-US');
    assert.equal(await reviewState.getAttribute('data-psi-a4-review-status'), 'needs-review', 'other language incorrectly inherited Korean review');
    await review.getByRole('button', { name: /한국어 · 기기 기록 있음/ }).click();
    await page.waitForFunction(() => document.querySelector('[data-psi-a4-review-status]')?.getAttribute('data-psi-a4-review-status') === 'recorded');

    await page.getByRole('button', { name: '4. 한 장 편집' }).click();
    await page.getByLabel('교육자료 제목').fill('양중 전 확인 - 내용 수정');
    await page.getByRole('button', { name: '5. 출력 확인' }).click();
    await page.waitForFunction(() => {
        const reviewSection = document.querySelector('[data-psi-a4-output-review]');
        return reviewSection?.querySelector('[data-psi-a4-review-count]')?.textContent?.includes('0/2')
            && reviewSection?.querySelector('[data-psi-a4-review-status]')?.getAttribute('data-psi-a4-review-status') === 'needs-review';
    }, undefined, { timeout: 15_000 });
    const changedRow = review.locator('[data-psi-a4-ledger-language="ko-KR"]');
    assert.equal(await changedRow.getAttribute('data-psi-a4-ledger-status'), 'recheck',
        'the old approval remains marked as valid after a content change');
    const staleDownload = await requestDownload('현재 검수 현황 CSV 저장');
    const staleCsv = new TextDecoder().decode(staleDownload.bytes);
    assert.match(staleCsv, /"한국어","ko-KR","변경됨 · 다시 확인"/);
    assert.doesNotMatch(staleCsv, /"관리자와 모국어 확인자 공동"/, 'obsolete role appeared as a new approval');

    // R103: blocked device storage must NOT emit a false confirmation.
    await page.evaluate(() => {
        window.__psiQaOriginalReviewSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
            if (key === 'psi_a4_local_output_review_v1') throw new DOMException('denied', 'QuotaExceededError');
            return window.__psiQaOriginalReviewSetItem.call(this, key, value);
        };
    });
    for (const check of ['fileOpened', 'glyphsLegible', 'safetyMeaningCompared']) {
        await review.locator('[data-psi-a4-review-check="' + check + '"]').check();
    }
    await page.waitForFunction(() => !document.querySelector('[data-psi-a4-review-save]')?.disabled);
    await saveReview.click();
    await review.getByText(/저장공간 사용이 차단됐습니다/).waitFor({ state: 'visible', timeout: 5_000 });
    assert.equal(await reviewState.getAttribute('data-psi-a4-review-status'), 'needs-review');
    await page.evaluate(() => { Storage.prototype.setItem = window.__psiQaOriginalReviewSetItem; });

    // Browser blocks a programmatic CSV request: the user must have a manual retry.
    await page.evaluate(() => {
        window.__psiQaOriginalObjectURL = URL.createObjectURL;
        URL.createObjectURL = () => { throw new Error('download blocked (synthetic)'); };
    });
    await review.locator('[data-psi-a4-review-export]').click();
    await review.getByText(/브라우저가 다운로드 요청을 차단했습니다/).waitFor({ state: 'visible', timeout: 5_000 });
    const retryCsv = review.locator('[data-psi-a4-review-ready-download]');
    await retryCsv.waitFor({ state: 'visible', timeout: 5_000 });
    await page.evaluate(() => { URL.createObjectURL = window.__psiQaOriginalObjectURL; });
    const retryEvent = page.waitForEvent('download', { timeout: 15_000 });
    await retryCsv.getByRole('button', { name: '검수 현황 CSV 파일 다시 다운로드' }).click();
    const retryFile = await retryEvent;
    assert.match(retryFile.suggestedFilename(), /\.csv$/i);
    assert.ok((await readFile(await retryFile.path())).length > 200);

    await page.setViewportSize({ width: 320, height: 720 });
    const widths = await review.locator('[data-psi-a4-review-ledger="true"] [role="region"]').evaluate(el => ({
        scroll: el.scrollWidth, viewport: el.clientWidth, outer: el.getBoundingClientRect().width,
    }));
    assert.ok(widths.scroll > widths.viewport, 'mobile ledger should be horizontally scrollable, not squashed');
    assert.ok(widths.outer <= 320, 'review ledger region exceeds mobile viewport');

    // Copy permission unavailable: no unhandled exception, clear recovery message.
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    });
    await review.locator('[data-psi-a4-review-copy]').click();
    await review.getByText(/클립보드 복사가 지원되지 않습니다/).waitFor({ state: 'visible', timeout: 5_000 });
    assert.deepEqual(pageErrors, [], 'browser threw during blocked local storage, download or clipboard simulation');

    checks.push({ label: 'R103 negative-path simulations', staleCsv: true, quotaDenied: true, downloadBlockedAndRetried: true, mobile320: true, clipboardDenied: true });
    checks.push({ label: 'R100 human device attestation', initial: 'unchecked', saved: true, languageIsolation: true, editInvalidates: true });
    console.log('PASS R104–R106 native bitmap missing/rejected + local PNG fallback + failed decoder recovery + capture DOM cleanup (synthetic only)');
    console.log('PASS R101–R103 CSV actual download + scope recheck + storage/download/clipboard failure recovery + 320px mobile (synthetic only)');
    console.log('PASS R98–R100 operator review checkboxes + SHA-256 source invalidation (synthetic browser only)');
    console.log('PASS R92–R97 mobile font + stalled-image failure + offline ZIP/PDF (synthetic only)');
    await writeFile(resolve(out, 'results.json'), JSON.stringify({ result: 'PASS', syntheticOnly: true, checks }, null, 2));
} catch (error) {
    await writeFile(resolve(out, 'results.json'), JSON.stringify({
        result: 'FAIL', syntheticOnly: true, error: error.stack || String(error), checks,
    }, null, 2));
    throw error;
} finally {
    await browser.close();
}
