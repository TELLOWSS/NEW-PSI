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
            await page.screenshot({ path: resolve(out, 'download-error.png'), fullPage: false });
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
    await document.destroy();
    checks.push({ label: 'PDF parsed', pages: 2, format: 'A4' });
    assert.deepEqual(externalCalls, [], 'external jsPDF or html2canvas CDN was required');
    assert.deepEqual(pageErrors, [], 'uncaught browser error during download');
    checks.push({ label: 'network and browser errors', externalCalls, pageErrors });
    console.log('PASS R88–R90 real Chromium mobile-size downloads: ZIP 2 PNG + PDF 2 A4 pages (synthetic only)');
    await writeFile(resolve(out, 'results.json'), JSON.stringify({ result: 'PASS', syntheticOnly: true, checks }, null, 2));
} catch (error) {
    await writeFile(resolve(out, 'results.json'), JSON.stringify({
        result: 'FAIL', syntheticOnly: true, error: error.stack || String(error), checks,
    }, null, 2));
    throw error;
} finally {
    await browser.close();
}
