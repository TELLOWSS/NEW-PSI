import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4182/';
const outputDir = resolve('artifacts/audit/browser/worker-report');
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
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
        sidebarOrder: ['dashboard', 'reports', 'worker-management', 'settings'],
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

const record = (patch) => ({
    id: 'record',
    worker_uuid: 'worker',
    workerUuid: 'worker',
    name: 'SOVAN',
    jobField: '형틀',
    teamLeader: '정용현',
    date: '2026-06-20',
    nationality: '캄보디아',
    language: 'km',
    handwrittenAnswers: [],
    fullText: '',
    koreanTranslation: '',
    safetyScore: 85,
    safetyLevel: '고급',
    strengths: ['추락 위험에 대한 인지가 정확함'],
    strengths_native: ['យល់ដឹងច្បាស់អំពីហានិភ័យនៃការធ្លាក់'],
    weakAreas: ['안전대 체결 위치 확인 부족'],
    weakAreas_native: ['ត្រូវពិនិត្យទីតាំងភ្ជាប់ខ្សែក្រវាត់សុវត្ថិភាពឱ្យច្បាស់'],
    improvement: '작업 전 안전대 체결 확인',
    improvement_native: 'ពិនិត្យការភ្ជាប់ខ្សែក្រវាត់សុវត្ថិភាពមុនការងារ',
    suggestions: [],
    suggestions_native: [],
    aiInsights: '형틀 작업 전 추락 위험과 안전대 체결 위치를 확인해야 합니다.',
    aiInsights_native: 'មុនការងារពុម្ព ត្រូវពិនិត្យហានិភ័យនៃការធ្លាក់ និងទីតាំងភ្ជាប់ខ្សែក្រវាត់សុវត្ថិភាព។',
    score_reason: '작업 전 보호조치의 구체성이 확인됩니다.',
    score_reason_native: 'បានបញ្ជាក់ភាពច្បាស់លាស់នៃវិធានការការពារមុនការងារ។',
    actionable_coaching: '작업 전 안전대와 작업구역을 확인하세요.',
    actionable_coaching_native: 'មុនការងារ សូមពិនិត្យខ្សែក្រវាត់សុវត្ថិភាព និងតំបន់ការងារ។',
    selfAssessedRiskLevel: '중',
    ...patch,
});

const seedRecords = [
    record({ id: 'kh-2026-04', worker_uuid: 'monthly-kh-04', workerUuid: 'monthly-kh-04', date: '2026-04-20', safetyScore: 72, safetyLevel: '중급' }),
    record({ id: 'kh-2026-05', worker_uuid: 'monthly-kh-05', workerUuid: 'monthly-kh-05', date: '2026-05-20', safetyScore: 79, safetyLevel: '중급' }),
    record({ id: 'kh-2026-06', worker_uuid: 'monthly-kh-06', workerUuid: 'monthly-kh-06', date: '2026-06-20', safetyScore: 85, safetyLevel: '고급' }),
    record({
        id: 'vi-2026-06',
        worker_uuid: 'worker-vi',
        workerUuid: 'worker-vi',
        name: 'NGUYEN VAN MINH',
        nationality: '베트남',
        language: 'vi',
        jobField: '철근',
        strengths_native: ['Nhận biết rõ nguy cơ vật rơi'],
        weakAreas_native: ['Cần kiểm tra lại điểm móc dây an toàn'],
        improvement_native: 'Kiểm tra điểm móc dây an toàn trước khi làm việc',
        aiInsights_native: 'Trước khi làm việc, cần kiểm tra nguy cơ vật rơi và điểm móc dây an toàn.',
        score_reason_native: 'Đã xác nhận mức độ cụ thể của biện pháp bảo vệ trước công việc.',
        actionable_coaching_native: 'Trước khi làm việc, hãy kiểm tra dây an toàn và khu vực làm việc.',
    }),
];

const seedDatabase = async () => {
    await page.evaluate(async (records) => {
        await new Promise((resolve, reject) => {
            const request = indexedDB.open('PSI_Enterprise_V4', 1);
            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('worker_records')) {
                    db.createObjectStore('worker_records', { keyPath: 'id' });
                }
            };
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                const db = request.result;
                const transaction = db.transaction('worker_records', 'readwrite');
                const store = transaction.objectStore('worker_records');
                store.clear();
                records.forEach((item) => store.put(item));
                transaction.oncomplete = () => {
                    db.close();
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            };
        });
    }, seedRecords);
};

const recordCheck = (name, passed, evidence) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

await page.goto(baseUrl, { waitUntil: 'networkidle' });
await seedDatabase();
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('근로자 리포트 (관리자 분석)', { exact: true }).click();
await page.getByRole('heading', { name: '안전 리포트 센터' }).last().waitFor({ state: 'visible' });
await page.getByText('생성 대상 근로자 2명', { exact: false }).waitFor({ state: 'visible' });

const listText = await page.locator('body').innerText();
const workerTabClass = await page.getByRole('button', { name: '개인별 안전보고서' }).getAttribute('class');
recordCheck('첫 진입부터 개인별 통합목록 표시', workerTabClass?.includes('text-indigo-600') && listText.includes('생성 대상 근로자 2명'), {
    activeTab: '개인별 안전보고서',
});
recordCheck('근로자별 한 줄 집계', listText.includes('생성 대상 근로자 2명') && listText.includes('3개월 · 총 3건'), {
    expectedWorkers: 2,
    expectedGroupedRecordText: '3개월 · 총 3건',
});
recordCheck('기간과 변화 표시', listText.includes('2026.04 - 2026.06') && listText.includes('+13점') && listText.includes('첫 평가 대비'), {
    period: '2026.04 - 2026.06',
    delta: '+13',
});
recordCheck('모국어 준비 상태 표시', listText.includes('크메르어') && listText.includes('전달 준비 완료'), {
    language: '크메르어',
});
await page.getByText('생성 대상 근로자 2명', { exact: false }).scrollIntoViewIfNeeded();
await page.screenshot({ path: resolve(outputDir, 'worker-target-list.png'), fullPage: false });

await page.getByText('SOVAN', { exact: true }).first().click();
const reportRoot = page.locator('[data-report-template-root="true"]').last();
await reportRoot.waitFor({ state: 'visible' });
const pages = reportRoot.locator(':scope > [data-report-page="true"]');
const pageCount = await pages.count();
const frontPage = pages.first();
const frontText = await frontPage.innerText();
const forbiddenFrontTerms = ['[KO]', '안전 역량 인증서', '상세 품질 판단 근거', '총점', '6개월', '강점', '취약점', '종합진단'];
const exposedTerms = forbiddenFrontTerms.filter((term) => frontText.includes(term));
recordCheck('관리자 분석본은 인증서와 부록 2장', pageCount === 2, { pageCount });
recordCheck('외국인 인증서 전면 모국어 전용', exposedTerms.length === 0 && frontText.includes('វិញ្ញាបនបត្រសមត្ថភាពសុវត្ថិភាព'), {
    exposedTerms,
});
recordCheck('공식 발행 정보 표시', frontText.includes('PSI-20260620-') && frontText.includes('2026. 04. 20 - 2026. 06. 20'), {
    hasDocumentId: frontText.includes('PSI-20260620-'),
});
await frontPage.screenshot({ path: resolve(outputDir, 'khmer-certificate.png') });
page.once('dialog', (dialog) => dialog.accept());
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: '현재 보고서 내보내기' }).click();
const download = await downloadPromise;
const pdfPath = resolve(outputDir, 'khmer-manager-report-sample.pdf');
await download.saveAs(pdfPath);
recordCheck('실제 PDF 생성 완료', Boolean(await download.path()), { file: 'khmer-manager-report-sample.pdf' });

const fontSamples = [
    { code: 'ko', label: '한국어', sample: '안전 역량 인증서', font: 'Noto Sans KR' },
    { code: 'vi', label: 'Tiếng Việt', sample: 'Chứng nhận Năng lực An toàn', font: 'Noto Sans' },
    { code: 'zh', label: '中文', sample: '安全能力认证书', font: 'Noto Sans SC' },
    { code: 'th', label: 'ภาษาไทย', sample: 'ใบรับรองสมรรถนะด้านความปลอดภัย', font: 'Noto Sans Thai' },
    { code: 'my', label: 'မြန်မာ', sample: 'ဘေးကင်းလုံခြုံရေး စွမ်းရည် လက်မှတ်', font: 'Noto Sans Myanmar' },
    { code: 'uz', label: 'Oʻzbekcha', sample: 'Xavfsizlik malakasi sertifikati', font: 'Noto Sans' },
    { code: 'km', label: 'ភាសាខ្មែរ', sample: 'វិញ្ញាបនបត្រសមត្ថភាពសុវត្ថិភាព', font: 'Noto Sans Khmer' },
    { code: 'id', label: 'Bahasa Indonesia', sample: 'Sertifikat Kompetensi Keselamatan', font: 'Noto Sans' },
    { code: 'ms', label: 'Bahasa Melayu', sample: 'Sijil Kompetensi Keselamatan', font: 'Noto Sans' },
    { code: 'mn', label: 'Монгол', sample: 'Аюулгүй ажиллагааны чадамжийн гэрчилгээ', font: 'Noto Sans' },
    { code: 'ru', label: 'Русский', sample: 'Сертификат компетенции по безопасности', font: 'Noto Sans' },
    { code: 'kk', label: 'Қазақша', sample: 'Қауіпсіздік құзыреті сертификаты', font: 'Noto Sans' },
    { code: 'ne', label: 'नेपाली', sample: 'सुरक्षा क्षमता प्रमाणपत्र', font: 'Noto Sans Devanagari' },
    { code: 'en', label: 'English', sample: 'Safety Competency Certificate', font: 'Noto Sans' },
];
await page.evaluate((samples) => {
    const matrix = document.createElement('div');
    matrix.id = 'psi-font-matrix';
    matrix.style.cssText = 'position:fixed;inset:20px;z-index:999999;background:#f8fafc;padding:24px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;overflow:auto;';
    matrix.innerHTML = samples.map((item) => `
        <div style="background:white;border:1px solid #cbd5e1;border-radius:14px;padding:14px;font-family:'${item.font}',sans-serif">
            <div style="font-size:11px;font-weight:800;color:#64748b">${item.code.toUpperCase()} · ${item.label}</div>
            <div style="margin-top:6px;font-size:20px;font-weight:800;color:#0f172a">${item.sample}</div>
        </div>
    `).join('');
    document.body.appendChild(matrix);
}, fontSamples);
const fontResults = await page.evaluate(async (samples) => {
    await document.fonts.ready;
    await Promise.all(samples.map((item) => document.fonts.load(`16px "${item.font}"`, item.sample)));
    return samples.map((item) => ({
        code: item.code,
        font: item.font,
        loaded: document.fonts.check(`16px "${item.font}"`, item.sample),
    }));
}, fontSamples);
recordCheck('지원 언어 글꼴 14종 브라우저 로드', fontResults.every((item) => item.loaded), { fontResults });
await page.locator('#psi-font-matrix').screenshot({ path: resolve(outputDir, 'language-font-matrix.png') });
await page.evaluate(() => document.getElementById('psi-font-matrix')?.remove());

await page.setViewportSize({ width: 390, height: 844 });
await page.getByRole('button', { name: '목록 보기', exact: true }).last().click();
await page.waitForTimeout(300);
const mobileWidth = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
}));
recordCheck('모바일 화면 가로 넘침 없음', mobileWidth.scrollWidth <= mobileWidth.innerWidth + 1, mobileWidth);
await page.screenshot({ path: resolve(outputDir, 'worker-target-list-mobile.png'), fullPage: false });

const unexpectedConsoleErrors = consoleErrors.filter((message) => (
    !message.includes('VITE_SUPABASE_URL')
    && !message.includes('NEXT_PUBLIC_SUPABASE_URL')
    && !message.includes('Failed to load resource')
));
recordCheck('브라우저 실행 오류 없음', pageErrors.length === 0 && unexpectedConsoleErrors.length === 0, {
    pageErrors,
    consoleErrors: unexpectedConsoleErrors,
});

const result = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    passed: checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots: ['worker-target-list.png', 'khmer-certificate.png', 'language-font-matrix.png', 'worker-target-list-mobile.png'],
    pdf: 'khmer-manager-report-sample.pdf',
};
await writeFile(resolve(outputDir, 'worker-report-verification.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
await browser.close();

console.log(`[verify-worker-report-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-worker-report-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
