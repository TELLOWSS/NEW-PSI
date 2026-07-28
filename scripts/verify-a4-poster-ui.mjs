import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PSI_UI_URL || 'http://127.0.0.1:4181/';
const outputDir = resolve('artifacts/audit/browser/a4-poster');
await mkdir(outputDir, { recursive: true });

const checks = [];
const screenshots = [];
const consoleErrors = [];
const pageErrors = [];
const startedAt = new Date().toISOString();

const recordCheck = (name, passed, evidence = {}) => {
    checks.push({ name, passed: Boolean(passed), evidence });
};

const draft = {
    month: '2026-08',
    workType: '전체 공종',
    title: '양중 작업 시작 전 안전 안내',
    coreMessage: '매달린 하중 아래에는 들어가지 말고, 신호가 끊기면 즉시 작업을 멈춥니다.',
    opening: '작업 시작 전 인양 경로와 통제구역을 함께 확인합니다.',
    risks: [],
    videoScenes: [
        {
            id: 'video-high-risk',
            seconds: 300,
            title: '다음 달 상등급 위험 공유',
            narration: '인양 경로, 통제구역, 신호 방법을 확인합니다.',
            visualGuide: '인양 구역과 정지 신호를 그림으로 표시',
        },
    ],
    accidentCases: [],
    focusPoints: [
        '인양 경로와 통제구역을 확인합니다.',
        '지정 신호수의 신호만 따르고 시야가 끊기면 멈춥니다.',
        '작업 전 안전모와 안전화의 착용 상태를 확인합니다.',
    ],
    notices: ['인양물 아래 출입을 금지하고 통제선을 유지합니다.'],
    checklist: [
        '인양 경로에 사람과 장애물이 없는지 확인합니다.',
        '신호수와 장비 운전원의 신호 방법을 맞춥니다.',
        '안전모와 안전화의 착용 상태를 확인합니다.',
    ],
    confirmationQuestions: [
        '신호가 끊기면 무엇을 해야 합니까?',
        '매달린 하중 아래로 들어가도 됩니까?',
    ],
    closingCommitment: '위험하거나 신호가 끊기면 즉시 멈추고 관리자에게 알리겠습니다.',
    sourceCount: 2,
    generatedAt: '2026-07-28T00:00:00.000Z',
};

const translations = {
    'en-US': {
        workType: 'Lifting operations',
        title: 'Pre-start lifting safety briefing',
        opening: 'Review the lift path and exclusion zone together before work.',
        coreMessage: 'Never stand under a suspended load. Stop immediately if the signal is lost.',
        video: [],
        accident: [],
        risks: [],
        focus: [
            'Confirm the lift path and keep the exclusion zone clear.',
            'Follow only the designated signaler and stop if visual contact is lost.',
            'Check the safety helmet and safety boots before work.',
        ],
        notices: ['Keep everyone outside the area below the suspended load.'],
        questions: [
            'What must you do when the signal is lost?',
            'May anyone stand below a suspended load?',
        ],
        closingCommitment: 'I will stop work and report unsafe conditions to the supervisor.',
    },
    'km-KH': {
        workType: 'ការងារលើកទំនិញ',
        title: 'ការណែនាំសុវត្ថិភាពមុនចាប់ផ្តើមលើកទំនិញ',
        opening: 'ពិនិត្យផ្លូវលើក និងតំបន់ហាមចូលជាមួយគ្នាមុនធ្វើការ។',
        coreMessage: 'កុំឈរនៅក្រោមទំនិញព្យួរ។ ឈប់ភ្លាមបើបាត់សញ្ញា។',
        video: [],
        accident: [],
        risks: [],
        focus: [
            'ពិនិត្យផ្លូវលើក និងរក្សាតំបន់ហាមចូលឱ្យទំនេរ។',
            'ធ្វើតាមតែអ្នកផ្តល់សញ្ញាដែលបានកំណត់។',
            'ពិនិត្យមួកសុវត្ថិភាព និងស្បែកជើងសុវត្ថិភាពមុនធ្វើការ។',
        ],
        notices: ['ហាមមនុស្សចូលក្រោមទំនិញព្យួរ។'],
        questions: [
            'តើត្រូវធ្វើអ្វីនៅពេលបាត់សញ្ញា?',
            'តើអាចឈរនៅក្រោមទំនិញព្យួរបានទេ?',
        ],
        closingCommitment: 'ខ្ញុំនឹងឈប់ធ្វើការ និងរាយការណ៍ពេលមានគ្រោះថ្នាក់។',
    },
    'ur-PK': {
        workType: 'لفٹنگ کا کام',
        title: 'لفٹنگ شروع کرنے سے پہلے حفاظتی ہدایت',
        opening: 'کام سے پہلے اٹھانے کا راستہ اور ممنوعہ علاقہ مل کر دیکھیں۔',
        coreMessage: 'لٹکے ہوئے بوجھ کے نیچے نہ جائیں۔ اشارہ منقطع ہو تو فوراً کام روک دیں۔',
        video: [],
        accident: [],
        risks: [],
        focus: [
            'اٹھانے کا راستہ دیکھیں اور ممنوعہ علاقہ خالی رکھیں۔',
            'صرف مقررہ اشارہ دینے والے کی ہدایت پر عمل کریں۔',
            'کام سے پہلے حفاظتی ہیلمٹ اور جوتے جانچیں۔',
        ],
        notices: ['لٹکے ہوئے بوجھ کے نیچے داخلہ ممنوع ہے۔'],
        questions: [
            'اشارہ منقطع ہونے پر کیا کرنا ہے؟',
            'کیا لٹکے ہوئے بوجھ کے نیچے جانا درست ہے؟',
        ],
        closingCommitment: 'خطرہ ہو تو میں کام روک کر نگران کو اطلاع دوں گا۔',
    },
};

const longPhrase = 'Перед началом каждой операции необходимо полностью остановить работу, проверить путь перемещения груза, ограждение опасной зоны, устойчивость оборудования и подтверждение ответственного руководителя';
translations['ru-RU'] = {
    workType: 'Такелажные работы',
    title: Array(18).fill('Чрезмерно длинная инструкция по безопасному выполнению такелажных работ').join(' · '),
    opening: Array(12).fill(longPhrase).join(' '),
    coreMessage: Array(16).fill('Немедленно остановите работу при потере сигнала или изменении условий').join(' — '),
    video: [],
    accident: [],
    risks: [],
    focus: Array.from({ length: 12 }, (_, index) => `${index + 1}. ${Array(6).fill(longPhrase).join(' ')}`),
    notices: Array.from({ length: 12 }, () => Array(5).fill(longPhrase).join(' ')),
    questions: [],
    closingCommitment: Array(10).fill('Я остановлю работу и сообщу руководителю обо всех небезопасных изменениях').join(' '),
};

const getHighGradeRiskShareItems = (risks) => risks.filter((risk) => (
    (risk.evidenceLabels || []).some((label) => /회의자료\s*상등급|문서\s*상등급|업로드\s*상등급|PPT\s*상등급|PDF\s*상등급|관리자\s*상등급|수동\s*확인/i.test(label))
));

const buildMonthlyEducationPackageText = (value) => {
    const accident = value.accidentCases[0];
    const risksToShare = getHighGradeRiskShareItems(value.risks);
    const accidentMeta = [accident?.occurredAt, accident?.source].filter(Boolean).join(' · ') || '출처와 발생일 확인 필요';
    const highRiskStageTitle = value.videoScenes.find((scene) => scene.id === 'video-high-risk')?.title
        || '다음 달 상등급 위험 공유';
    const targetCycleLabel = highRiskStageTitle.replace(/\s*상등급 위험 공유$/, '').trim() || '다음 달';

    return [
        `[${value.title}]`,
        value.opening,
        '',
        '[오늘 반드시 전달할 한 문장]',
        value.coreMessage,
        '',
        '1. 교육 전 5분 핵심 동영상',
        ...(value.videoScenes.length
            ? value.videoScenes.map((scene) => `- ${scene.title} (${scene.seconds}초): ${scene.narration}`)
            : ['- 관리자 검수에서 동영상 장면표를 제외했습니다. 원페이지 교육자료 중심으로 진행합니다.']),
        '',
        '2. 최근 재해사례와 현장 연관성',
        ...(accident
            ? [
                `- ${accident.title || '사례 입력 필요'} (${accidentMeta})`,
                `- 사례 요약: ${accident.summary || '관리자 입력 필요'}`,
                `- 현장 연관성: ${accident.siteRelevance || '관리자 입력 필요'}`,
                `- 핵심 교훈: ${accident.lesson || '관리자 입력 필요'}`,
            ]
            : ['- 관리자 검수에서 부적합한 재해사례를 제외했습니다. 현장 기록 기반 위험공유로 대체합니다.']),
        '',
        `3. ${targetCycleLabel} 위험성평가 상등급 공유`,
        ...(risksToShare.length
            ? risksToShare.map((risk) => `- ${risk.risk}: ${risk.action} / 담당 ${risk.owner} / ${risk.managerConfirmed ? '관리자 확인 완료' : '상등급 최종 확인 필요'}`)
            : [`- ${targetCycleLabel} 위험성평가 회의자료(PPT/PDF/문서)에서 상등급으로 지정된 공유 항목이 없습니다. 일반 추천 위험은 이 영역에 넣지 않습니다.`]),
        '',
        '4. 현장 중점관리 포인트',
        ...(value.focusPoints.length
            ? value.focusPoints.map((point) => `- ${point}`)
            : ['- 작업구역, 일정, 인원, 장비 조건이 바뀌면 작업 전 다시 확인합니다.']),
        '',
        '5. 공지사항',
        ...(value.notices.length
            ? value.notices.map((notice) => `- ${notice}`)
            : ['- 별도 공지 없음. 현장 변경사항은 교육 전 최종 확인합니다.']),
        '',
        '[이해 확인 및 행동 약속]',
        ...value.confirmationQuestions.slice(0, 2).map((question, index) => `Q${index + 1}. ${question}`),
        `- ${value.closingCommitment}`,
    ].join('\n');
};

const scopeKey = `${draft.month}::${draft.workType}`;
const studioStore = {
    version: 3,
    lastScopeKey: scopeKey,
    snapshots: {
        [scopeKey]: {
            educationMonth: draft.month,
            workType: draft.workType,
            sources: [],
            draft,
            translatedTexts: {},
            structuredTranslations: translations,
            translationSourceText: buildMonthlyEducationPackageText(draft),
            savedAt: '2026-07-28T00:00:00.000Z',
        },
    },
};

let browser;
let page;

const screenPage = () => page.locator(
    'article[data-report-template-root="true"].mx-auto > [data-report-page="true"]',
);

const poster = () => screenPage().locator('[data-a4-safety-poster="true"]');

const screenshotPoster = async (fileName) => {
    await screenPage().screenshot({
        path: resolve(outputDir, fileName),
        animations: 'disabled',
    });
    screenshots.push(fileName);
};

const waitForPoster = async (languageCode) => {
    await screenPage().waitFor({ state: 'visible' });
    await page.waitForFunction((code) => {
        const candidate = document.querySelector(
            'article[data-report-template-root="true"].mx-auto [data-a4-safety-poster="true"]',
        );
        return candidate?.getAttribute('lang') === code;
    }, languageCode);
    await page.evaluate(async () => {
        await Promise.race([
            document.fonts?.ready,
            new Promise((resolveFontWait) => window.setTimeout(resolveFontWait, 4_000)),
        ]);
    });
    await page.waitForTimeout(500);
};

const languageButtons = {
    'ko-KR': '한국어 원문',
    'en-US': '영어',
    'km-KH': '크메르어',
    'ur-PK': '우르두어',
    'ru-RU': '러시아어',
};

const chooseLanguage = async (languageCode) => {
    const button = page.getByRole('button').filter({ hasText: languageButtons[languageCode] }).first();
    await button.waitFor({ state: 'visible' });
    await button.click();
    await waitForPoster(languageCode);
};

const inspectGeometry = async () => screenPage().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
        width: rect.width,
        height: rect.height,
        ratio: rect.width / rect.height,
        computedWidth: Number.parseFloat(style.width),
        computedHeight: Number.parseFloat(style.height),
        cssWidth: style.width,
        cssHeight: style.height,
    };
});

const inspectOverflow = async () => screenPage().evaluate((element) => {
    const isUrdu = (element.getAttribute('lang') || '').toLowerCase().startsWith('ur');
    const clippedText = Array.from(element.querySelectorAll('*')).filter((candidate) => (
        candidate instanceof HTMLElement
        && (Boolean(candidate.style.webkitLineClamp) || candidate.style.textOverflow === 'ellipsis')
    ));
    const candidates = Array.from(new Set([
        element,
        ...element.querySelectorAll('[data-overflow-check="true"]'),
        ...clippedText,
    ]));

    return candidates.flatMap((candidate) => {
        if (!(candidate instanceof HTMLElement)) return [];
        const isClampedText = Boolean(candidate.style.webkitLineClamp)
            || candidate.style.textOverflow === 'ellipsis';
        const verticalTolerance = isClampedText ? (isUrdu ? 9 : 6) : 2;
        const deltaHeight = candidate.scrollHeight - candidate.clientHeight;
        const deltaWidth = candidate.scrollWidth - candidate.clientWidth;
        if (deltaHeight <= verticalTolerance && deltaWidth <= 2) return [];
        return [{
            tag: candidate.tagName.toLowerCase(),
            text: (candidate.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180),
            clientWidth: candidate.clientWidth,
            scrollWidth: candidate.scrollWidth,
            clientHeight: candidate.clientHeight,
            scrollHeight: candidate.scrollHeight,
            deltaWidth,
            deltaHeight,
            verticalTolerance,
        }];
    });
});

const inspectVisualContent = async () => poster().evaluate((element) => {
    const pageElement = element.closest('[data-report-page="true"]');
    const posterRect = element.getBoundingClientRect();
    const pageRect = pageElement?.getBoundingClientRect();
    const visualNodes = Array.from(element.querySelectorAll('section, article'));
    const distinctBackgrounds = Array.from(new Set(
        visualNodes
            .map((node) => getComputedStyle(node).backgroundColor)
            .filter((color) => color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent'),
    ));
    const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
    const lastVisualBottom = visualNodes.reduce(
        (max, node) => Math.max(max, node.getBoundingClientRect().bottom),
        posterRect.top,
    );
    return {
        textLength: Array.from(text).length,
        svgCount: element.querySelectorAll('svg').length,
        sectionCount: element.querySelectorAll(':scope > section').length,
        articleCount: element.querySelectorAll('article').length,
        distinctBackgrounds,
        widthFill: pageRect ? posterRect.width / pageRect.width : 0,
        heightFill: pageRect ? posterRect.height / pageRect.height : 0,
        contentDepth: (lastVisualBottom - posterRect.top) / Math.max(1, posterRect.height),
    };
});

const expectedLanguages = [
    {
        code: 'ko-KR',
        screenshot: 'ko-KR.png',
        title: draft.title,
        core: draft.coreMessage,
        workType: draft.workType,
        badge: '근로자용 안전 한 장',
    },
    {
        code: 'en-US',
        screenshot: 'en-US.png',
        title: translations['en-US'].title,
        core: translations['en-US'].coreMessage,
        workType: translations['en-US'].workType,
        badge: 'WORKER SAFETY ONE-PAGER',
    },
    {
        code: 'km-KH',
        screenshot: 'km-KH.png',
        title: translations['km-KH'].title,
        core: translations['km-KH'].coreMessage,
        workType: translations['km-KH'].workType,
        badge: 'សុវត្ថិភាពមួយទំព័រសម្រាប់កម្មករ',
    },
    {
        code: 'ur-PK',
        screenshot: 'ur-PK.png',
        title: translations['ur-PK'].title,
        core: translations['ur-PK'].coreMessage,
        workType: translations['ur-PK'].workType,
        badge: 'کارکن کے لیے ایک صفحے کی حفاظتی ہدایت',
    },
];

try {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage({ viewport: { width: 1680, height: 1400 } });

    page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.addInitScript(({ storedStudio }) => {
        window.sessionStorage.setItem('isAdminAuthenticated', 'true');
        window.localStorage.setItem('psi_tbm_education_studio_v2', JSON.stringify(storedStudio));
        window.localStorage.setItem('psi_ui_composition_v1', JSON.stringify({
            version: 4,
            sidebarOrder: [
                'dashboard',
                'site-issue-management',
                'worker-management',
                'survey-intelligence',
                'predictive-analysis',
                'safety-behavior-management',
                'performance-analysis',
                'monthly-guidance-report',
                'a4-education-material',
                'ppt-pdf-one-page-summary',
                'admin-training',
                'reports',
                'ocr-analysis',
                'settings',
            ],
            hiddenSidebarPages: [],
        }));
    }, { storedStudio: studioStore });

    await page.route('**/api/admin/auth', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, authenticated: true }),
        });
    });
    await page.route('**/api/admin/survey-risk-baselines', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, items: [], historyAvailable: false }),
        });
    });

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => (
        document.documentElement.dataset.psiMounted === '1'
        && (document.body.innerText || '').trim().length > 100
    ), undefined, { timeout: 20_000 });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
    const initialBodyText = await page.locator('body').innerText();
    recordCheck(
        '애플리케이션이 비어 있지 않게 로드됨',
        initialBodyText.trim().length > 100,
        {
            url: page.url(),
            mounted: await page.evaluate(() => document.documentElement.dataset.psiMounted),
            bodyTextLength: initialBodyText.trim().length,
        },
    );

    const canNavigateDirectly = await page.evaluate(() => typeof window.__setCurrentPage === 'function');
    if (canNavigateDirectly) {
        await page.evaluate(() => window.__setCurrentPage('a4-education-material'));
    } else {
        let navigated = false;
        for (const navigationLabel of ['위험성평가 교육자료', '위험성평가 교육']) {
            const navigationCandidates = await page.getByText(navigationLabel, { exact: true }).all();
            for (const candidate of navigationCandidates) {
                if (await candidate.isVisible()) {
                    await candidate.click();
                    navigated = true;
                    break;
                }
            }
            if (navigated) break;
        }
        if (!navigated) throw new Error('위험성평가 교육자료 화면 이동 항목을 찾지 못했습니다.');
    }
    await page.getByRole('heading', { name: '위험성평가 교육자료 스튜디오' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '5. 출력 확인' }).click();
    await waitForPoster('ko-KR');

    const geometry = await inspectGeometry();
    const expectedRatio = 210 / 297;
    const expectedCssWidth = 210 * 96 / 25.4;
    const expectedCssHeight = 297 * 96 / 25.4;
    recordCheck(
        'A4 출력 페이지가 정확한 210:297 비율과 물리 치수를 유지함',
        Math.abs(geometry.ratio - expectedRatio) < 0.0005
            && Math.abs(geometry.width - expectedCssWidth) < 1.5
            && Math.abs(geometry.height - expectedCssHeight) < 1.5,
        { ...geometry, expectedRatio, expectedCssWidth, expectedCssHeight },
    );

    for (const language of expectedLanguages) {
        await chooseLanguage(language.code);
        const text = (await poster().textContent()) || '';
        const headerWorkType = ((await poster().locator('header strong').first().textContent()) || '').trim();
        const overflow = await inspectOverflow();
        const visual = await inspectVisualContent();
        const exportButtons = {
            pngDisabled: await page.getByRole('button', { name: 'PNG 이미지', exact: true }).isDisabled(),
            pdfDisabled: await page.getByRole('button', { name: 'PDF 저장', exact: true }).isDisabled(),
            pptxDisabled: await page.getByRole('button', { name: 'PPTX 저장', exact: true }).isDisabled(),
            printDisabled: await page.getByRole('button', { name: 'A4 요약 인쇄', exact: true }).isDisabled(),
        };

        recordCheck(
            `${language.code} 포스터가 해당 언어의 제목·핵심문구·고정문구를 사용함`,
            text.includes(language.title)
                && text.includes(language.core)
                && text.includes(language.badge)
                && headerWorkType === language.workType
                && (language.code === 'ko-KR' || !text.includes(draft.title)),
            {
                title: language.title,
                core: language.core,
                badge: language.badge,
                expectedWorkType: language.workType,
                headerWorkType,
                posterLang: await poster().getAttribute('lang'),
            },
        );
        recordCheck(
            `${language.code} 포스터에 잘린 문장이나 A4 넘침이 없음`,
            overflow.length === 0 && Object.values(exportButtons).every((disabled) => !disabled),
            { overflow, exportButtons, fitMode: await poster().getAttribute('data-fit-mode') },
        );
        recordCheck(
            `${language.code} 포스터가 화면을 채우는 의미 있는 시각 구성을 가짐`,
            visual.textLength >= 180
                && visual.svgCount >= 8
                && visual.sectionCount >= 4
                && visual.articleCount >= 6
                && visual.distinctBackgrounds.length >= 4
                && visual.widthFill >= 0.995
                && visual.heightFill >= 0.995
                && visual.contentDepth >= 0.90,
            visual,
        );

        if (language.code === 'en-US') {
            const expectedEnglishFixedCopy = [
                '5 min',
                'Video',
                'Sources 2',
                'REQUIRED PPE',
                'Only PPE explicitly stated in the source',
                'Helmet',
                'Safety boots',
            ];
            recordCheck(
                '영문 포스터의 시간·근거자료·보호구 고정문구가 영어 fallback으로 표시됨',
                expectedEnglishFixedCopy.every((value) => text.includes(value)),
                {
                    expectedEnglishFixedCopy,
                    missing: expectedEnglishFixedCopy.filter((value) => !text.includes(value)),
                },
            );
        }

        if (language.code === 'ur-PK') {
            const pagePolicy = await screenPage().evaluate((element) => ({
                lang: element.getAttribute('lang'),
                dir: element.getAttribute('dir'),
                fontFamily: getComputedStyle(element).fontFamily,
                wordBreak: getComputedStyle(element).wordBreak,
            }));
            const posterPolicy = await poster().evaluate((element) => ({
                dir: element.getAttribute('dir'),
                fontFamily: getComputedStyle(element).fontFamily,
            }));
            recordCheck(
                '우르두어가 RTL 방향과 아랍 문자용 글꼴 정책을 사용함',
                pagePolicy.lang === 'ur-PK'
                    && pagePolicy.dir === 'rtl'
                    && posterPolicy.dir === 'rtl'
                    && pagePolicy.fontFamily.includes('Noto Sans Arabic')
                    && posterPolicy.fontFamily.includes('Noto Sans Arabic'),
                { pagePolicy, posterPolicy },
            );
        }

        await screenshotPoster(language.screenshot);
    }

    await chooseLanguage('ko-KR');
    await page.evaluate(() => {
        window.__a4PrintProbe = { calls: 0 };
        window.print = () => {
            const portals = Array.from(document.querySelectorAll('body > .report-print-container'));
            const reportPages = portals.flatMap((portal) => (
                Array.from(portal.querySelectorAll('[data-report-page="true"]'))
            ));
            window.__a4PrintProbe = {
                calls: (window.__a4PrintProbe?.calls || 0) + 1,
                portalCount: portals.length,
                reportPageCount: reportPages.length,
                selfContainedPageCount: reportPages.filter(
                    (candidate) => candidate.getAttribute('data-self-contained-page') === 'true',
                ).length,
                posterCount: portals.reduce(
                    (count, portal) => count + portal.querySelectorAll('[data-a4-safety-poster="true"]').length,
                    0,
                ),
                portalIsBodyChild: portals.every((portal) => portal.parentElement === document.body),
                pageLanguages: reportPages.map((candidate) => candidate.getAttribute('lang')),
            };
        };
    });
    const printButton = page.getByRole('button', { name: 'A4 요약 인쇄', exact: true });
    await printButton.click();
    await page.waitForFunction(() => window.__a4PrintProbe?.calls > 0, undefined, { timeout: 5_000 });
    const printProbe = await page.evaluate(() => window.__a4PrintProbe);
    recordCheck(
        '인쇄 버튼이 body 포털 안의 독립형 A4 한 장만 인쇄함',
        printProbe.calls === 1
            && printProbe.portalCount === 1
            && printProbe.reportPageCount === 1
            && printProbe.selfContainedPageCount === 1
            && printProbe.posterCount === 1
            && printProbe.portalIsBodyChild
            && printProbe.pageLanguages[0] === 'ko-KR',
        printProbe,
    );

    await chooseLanguage('ru-RU');
    await page.waitForFunction(() => (
        document.body.innerText.includes('A4 넘침 · 저장 차단')
    ), undefined, { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(250);

    const longOverflow = await inspectOverflow();
    const longWarning = page.getByText(
        '고밀도 자동 배치 후에도 일부 내용이 A4 밖으로 나갑니다.',
        { exact: false },
    ).first();
    const warningVisible = await longWarning.isVisible().catch(() => false);
    const longExportButtons = {
        pngDisabled: await page.getByRole('button', { name: 'PNG 이미지', exact: true }).isDisabled(),
        pdfDisabled: await page.getByRole('button', { name: 'PDF 저장', exact: true }).isDisabled(),
        pptxDisabled: await page.getByRole('button', { name: 'PPTX 저장', exact: true }).isDisabled(),
        printDisabled: await page.getByRole('button', { name: 'A4 요약 인쇄', exact: true }).isDisabled(),
    };
    recordCheck(
        '과도하게 긴 번역은 실제 넘침을 감지하고 모든 개별 내보내기를 차단함',
        longOverflow.length > 0
            && warningVisible
            && Object.values(longExportButtons).every(Boolean)
            && (await poster().getAttribute('data-fit-mode')) === 'dense',
        {
            overflow: longOverflow,
            warningVisible,
            exportButtons: longExportButtons,
            fitMode: await poster().getAttribute('data-fit-mode'),
        },
    );
    await screenshotPoster('ru-RU-overflow.png');
    if (warningVisible) {
        await longWarning.screenshot({
            path: resolve(outputDir, 'ru-RU-overflow-warning.png'),
            animations: 'disabled',
        });
        screenshots.push('ru-RU-overflow-warning.png');
    }

    const unexpectedConsoleErrors = consoleErrors.filter((message) => (
        !message.includes('VITE_SUPABASE_URL')
        && !message.includes('NEXT_PUBLIC_SUPABASE_URL')
        && !message.includes('Failed to load resource')
    ));
    recordCheck(
        'A4 검수 흐름에 브라우저 실행 오류나 화면 오류 오버레이가 없음',
        pageErrors.length === 0
            && unexpectedConsoleErrors.length === 0
            && await page.locator('.vite-error-overlay, #webpack-dev-server-client-overlay, [data-nextjs-dialog]').count() === 0,
        { pageErrors, consoleErrors: unexpectedConsoleErrors },
    );
} catch (error) {
    recordCheck(
        'A4 브라우저 검수 스크립트가 끝까지 실행됨',
        false,
        { error: error instanceof Error ? error.stack || error.message : String(error) },
    );
} finally {
    await browser?.close();
}

const result = {
    generatedAt: new Date().toISOString(),
    startedAt,
    baseUrl,
    passed: checks.length > 0 && checks.every((check) => check.passed),
    passedCount: checks.filter((check) => check.passed).length,
    totalCount: checks.length,
    checks,
    screenshots,
    consoleErrors,
    pageErrors,
};

await writeFile(
    resolve(outputDir, 'results.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf8',
);

console.log(`[verify-a4-poster-ui] ${result.passedCount}/${result.totalCount} checks passed`);
console.log(`[verify-a4-poster-ui] output=${outputDir}`);
if (!result.passed) process.exitCode = 1;
