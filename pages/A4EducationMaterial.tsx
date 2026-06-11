import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalAiHandoffPanel } from '../components/tbm/ExternalAiHandoffPanel';
import { CountryFlag } from '../components/shared/CountryFlag';
import { TRAINING_LANGUAGE_LABELS } from '../utils/constructionTrainingTranslation';
import type { WorkerRecord } from '../types';
import { ensureHtml2Canvas, ensureJsPdfConstructor } from '../utils/externalScripts';
import { buildPsiExportFileName } from '../utils/exportFileNaming';
import { captureReportCanvas, saveCanvasAsA4Pdf } from '../utils/pdfCapture';
import {
    buildMonthlyEducationPackageText,
    buildFieldRecordSource,
    buildTbmEducationDraft,
    estimateEducationTokens,
    getFiveMinuteVideoDuration,
    normalizeTbmEducationDraft,
    TBM_MONTHLY_PACKAGE_STORAGE_KEY,
    type TbmEducationDraft,
    type TbmEvidenceSource,
} from '../utils/tbmEducationStudio';
import { extractTbmSourceFromFile } from '../utils/tbmSourceExtraction';

interface Props {
    workerRecords: WorkerRecord[];
    onOpenTraining?: () => void;
}

type StudioTab = 'sources' | 'ai' | 'package' | 'editor' | 'preview';

const getNextMonth = (): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const MESSAGE_TEMPLATES = [
    '작업 시작 전 오늘의 작업, 주요 위험, 안전조치를 전원이 함께 확인하고 조건 변경 시 즉시 멈춘다.',
    '위험요인은 발견 즉시 제거하거나 차단하고, 불가능하면 작업을 중지한 뒤 관리자에게 알린다.',
    '서두르지 않고 정해진 작업순서와 보호구 착용 기준을 지키며 동료의 위험도 함께 확인한다.',
];

const CHECKLIST_TEMPLATES = [
    '작업 장소와 이동 동선의 위험요인을 직접 확인했는가?',
    '장비, 안전시설, 보호구의 이상 유무를 확인했는가?',
    '작업자별 역할과 신호 방법을 모두 이해했는가?',
    '기상, 공정, 인원 변경 시 작업중지 기준을 알고 있는가?',
];

const STUDIO_STORAGE_KEY = 'psi_tbm_education_studio_v2';

interface StoredStudioState {
    educationMonth: string;
    workType: string;
    sources: TbmEvidenceSource[];
    draft: TbmEducationDraft;
    translatedTexts?: Record<string, string>;
    translationSourceText?: string;
}

const loadStudioState = (): StoredStudioState | null => {
    if (typeof window === 'undefined') return null;
    try {
        const parsed = JSON.parse(localStorage.getItem(STUDIO_STORAGE_KEY) || 'null') as StoredStudioState | null;
        return parsed?.draft && Array.isArray(parsed.sources)
            ? { ...parsed, draft: normalizeTbmEducationDraft(parsed.draft) }
            : null;
    } catch {
        return null;
    }
};

const updateAt = (items: string[], index: number, value: string): string[] =>
    items.map((item, itemIndex) => itemIndex === index ? value : item);


interface ParsedTbmTranslation {
    title: string;
    opening: string;
    videoText: string;
    accidentText: string;
    risksText: string;
    focusText: string;
    noticesText: string;
    pledgeText: string;
}

const parseTbmTranslation = (text: string): ParsedTbmTranslation => {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    let title = '';
    let opening = '';
    const videoLines = [];
    const accidentLines = [];
    const riskLines = [];
    const focusLines = [];
    const noticeLines = [];
    const pledgeLines = [];

    let currentSection = 0; // 0: title/opening, 1: video, 2: accident, 3: risks, 4: focus, 5: notices, 6: pledge

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();

        if (i === 0 && line.startsWith('[') && line.endsWith(']')) {
            title = line.slice(1, -1).trim();
            continue;
        }

        if (/^1[.)]\s|^1\s|^1\./.test(line) || lowerLine.startsWith('1.') || lowerLine.includes('1. ') || lowerLine.includes('video') || lowerLine.includes('동영상')) {
            currentSection = 1;
            continue;
        }
        if (/^2[.)]\s|^2\s|^2\./.test(line) || lowerLine.startsWith('2.') || lowerLine.includes('2. ') || lowerLine.includes('accident') || lowerLine.includes('사례') || lowerLine.includes('재해')) {
            currentSection = 2;
            continue;
        }
        if (/^3[.)]\s|^3\s|^3\./.test(line) || lowerLine.startsWith('3.') || lowerLine.includes('3. ') || lowerLine.includes('risk') || lowerLine.includes('위험') || lowerLine.includes('상등급')) {
            currentSection = 3;
            continue;
        }
        if (/^4[.)]\s|^4\s|^4\./.test(line) || lowerLine.startsWith('4.') || lowerLine.includes('4. ') || lowerLine.includes('focus') || lowerLine.includes('중점') || lowerLine.includes('포인트')) {
            currentSection = 4;
            continue;
        }
        if (/^5[.)]\s|^5\s|^5\./.test(line) || lowerLine.startsWith('5.') || lowerLine.includes('5. ') || lowerLine.includes('notice') || lowerLine.includes('공지')) {
            currentSection = 5;
            continue;
        }
        if (line.startsWith('[') || lowerLine.includes('이해 확인') || lowerLine.includes('행동 약속') || lowerLine.includes('pledge') || lowerLine.includes('확약') || lowerLine.includes('약속')) {
            currentSection = 6;
            continue;
        }

        if (currentSection === 0) {
            if (!title) {
                title = line;
            } else {
                opening += (opening ? '\n' : '') + line;
            }
        } else if (currentSection === 1) {
            videoLines.push(line);
        } else if (currentSection === 2) {
            accidentLines.push(line);
        } else if (currentSection === 3) {
            riskLines.push(line);
        } else if (currentSection === 4) {
            focusLines.push(line);
        } else if (currentSection === 5) {
            noticeLines.push(line);
        } else if (currentSection === 6) {
            pledgeLines.push(line);
        }
    }

    return {
        title: title || 'TBM Safety Guide',
        opening: opening || 'Please review the safety guidelines carefully before beginning work.',
        videoText: videoLines.join('\n'),
        accidentText: accidentLines.join('\n'),
        risksText: riskLines.join('\n'),
        focusText: focusLines.join('\n'),
        noticesText: noticeLines.join('\n'),
        pledgeText: pledgeLines.join('\n'),
    };
};

const A4EducationMaterial: React.FC<Props> = ({ workerRecords, onOpenTraining }) => {
    const initialState = useRef(loadStudioState());
    const [activeTab, setActiveTab] = useState<StudioTab>('sources');
    const [educationMonth, setEducationMonth] = useState(initialState.current?.educationMonth || getNextMonth);
    const [workType, setWorkType] = useState(initialState.current?.workType || '전체 공종');
    const [manualText, setManualText] = useState('');
    const [sources, setSources] = useState<TbmEvidenceSource[]>(initialState.current?.sources || []);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [notice, setNotice] = useState('');
    const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>(
        initialState.current?.translatedTexts || {},
    );
    const [translationSourceText, setTranslationSourceText] = useState(
        initialState.current?.translationSourceText || '',
    );
    const [draft, setDraft] = useState<TbmEducationDraft>(() =>
        initialState.current?.draft || buildTbmEducationDraft({
            workerRecords,
            sources: [],
            month: getNextMonth(),
            workType: '전체 공종',
        }),
    );
    const [previewLanguage, setPreviewLanguage] = useState<string>('ko-KR');
    const [viewMode, setViewMode] = useState<'split' | 'single'>('split');
    const sheetRef = useRef<HTMLElement>(null);

    const workTypes = useMemo(
        () => ['전체 공종', ...Array.from(new Set(workerRecords.map((item) => item.jobField).filter(Boolean))).sort()],
        [workerRecords],
    );
    const fieldSource = useMemo(
        () => buildFieldRecordSource(workerRecords, workType),
        [workerRecords, workType],
    );
    const allSources = useMemo(
        () => fieldSource ? [fieldSource, ...sources] : sources,
        [fieldSource, sources],
    );
    const estimatedTokens = estimateEducationTokens(allSources);
    const videoDuration = getFiveMinuteVideoDuration(draft);

    useEffect(() => {
        localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({
            educationMonth,
            workType,
            sources,
            draft,
            translatedTexts,
            translationSourceText,
        } satisfies StoredStudioState));
    }, [draft, educationMonth, sources, translatedTexts, translationSourceText, workType]);

    const generateDraft = () => {
        const nextDraft = buildTbmEducationDraft({
            workerRecords,
            sources,
            month: educationMonth,
            workType,
            coreMessage: draft.coreMessage,
        });
        setDraft(nextDraft);
        setTranslatedTexts({});
        setTranslationSourceText('');
        setActiveTab('package');
        setNotice('근거 자료를 기준으로 5단계 월간 교육 패키지를 다시 구성했습니다.');
    };

    const resetStudio = () => {
        const month = getNextMonth();
        const nextDraft = buildTbmEducationDraft({
            workerRecords,
            sources: [],
            month,
            workType: '전체 공종',
        });
        setEducationMonth(month);
        setWorkType('전체 공종');
        setSources([]);
        setManualText('');
        setTranslatedTexts({});
        setTranslationSourceText('');
        setDraft(nextDraft);
        setNotice('교육자료 작업 내용을 초기화했습니다.');
    };

    const addManualSource = () => {
        const text = manualText.trim();
        if (!text) {
            setNotice('붙여넣을 교육 내용이나 다음 달 작업계획을 입력해 주세요.');
            return;
        }
        setSources((current) => [{
            id: `manual-${Date.now()}`,
            kind: 'manual',
            title: `직접 입력 ${current.filter((source) => source.kind === 'manual').length + 1}`,
            text,
            createdAt: new Date().toISOString(),
        }, ...current]);
        setManualText('');
        setNotice('직접 입력 내용을 자료함에 추가했습니다.');
    };

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setIsExtracting(true);
        setNotice('');
        try {
            const extracted: TbmEvidenceSource[] = [];
            for (const file of Array.from(files).slice(0, 6)) {
                extracted.push(await extractTbmSourceFromFile(file));
            }
            setSources((current) => [...extracted, ...current]);
            setNotice(`${extracted.length}개 자료에서 글자를 추출해 자료함에 추가했습니다.`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '자료를 읽지 못했습니다.');
        } finally {
            setIsExtracting(false);
        }
    };

    const sendToTraining = () => {
        const sourceText = buildMonthlyEducationPackageText(draft);
        const translationsMatchCurrentDraft = translationSourceText === sourceText;
        localStorage.setItem(TBM_MONTHLY_PACKAGE_STORAGE_KEY, JSON.stringify({
            draft,
            sourceText,
            translatedTexts: translationsMatchCurrentDraft ? translatedTexts : {},
            savedAt: new Date().toISOString(),
        }));
        setNotice(
            translationsMatchCurrentDraft || Object.keys(translatedTexts).length === 0
                ? '5단계 교육 원문을 다국어 교육에 전달했습니다.'
                : '한국어 초안이 수정되어 기존 AI 번역은 제외했습니다. 배포 단계에서 현재 원문 기준으로 번역합니다.',
        );
        onOpenTraining?.();
    };

    const importExternalAiDraft = (
        nextDraft: TbmEducationDraft,
        nextTranslations: Record<string, string>,
    ) => {
        setDraft(nextDraft);
        setTranslatedTexts(nextTranslations);
        setTranslationSourceText(buildMonthlyEducationPackageText(nextDraft));
        setActiveTab('package');
        const translationCount = Object.keys(nextTranslations).length;
        setNotice(
            translationCount > 0
                ? `AI 초안과 다국어 결과 ${translationCount}개를 반영했습니다. 5단계 내용을 검수해 주세요.`
                : 'AI 초안을 반영했습니다. 5단계 내용을 검수해 주세요.',
        );
    };

    const captureSheet = async () => {
        if (!sheetRef.current) throw new Error('내보낼 한 장 자료를 찾지 못했습니다.');
        const html2canvas = await ensureHtml2Canvas();
        return captureReportCanvas(sheetRef.current, html2canvas, { scale: 3 });
    };

    const exportImage = async () => {
        setIsExporting(true);
        try {
            const canvas = await captureSheet();
            const link = document.createElement('a');
            const langSuffix = previewLanguage !== 'ko-KR' ? previewLanguage.split('-').pop()?.toLowerCase() || '' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langSuffix) exportTokens.push(langSuffix);
            
            link.download = buildPsiExportFileName({
                tokens: exportTokens,
                extension: 'png',
            });
            link.href = canvas.toDataURL('image/png', 1);
            link.click();
            setNotice('화면 품질을 유지한 PNG 이미지를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PNG 이미지를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportPdf = async () => {
        setIsExporting(true);
        try {
            const [canvas, JsPDF] = await Promise.all([captureSheet(), ensureJsPdfConstructor()]);
            if (!JsPDF) throw new Error('PDF 생성 도구를 불러오지 못했습니다.');
            const langSuffix = previewLanguage !== 'ko-KR' ? previewLanguage.split('-').pop()?.toLowerCase() || '' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langSuffix) exportTokens.push(langSuffix);

            saveCanvasAsA4Pdf(canvas, JsPDF, buildPsiExportFileName({
                tokens: exportTokens,
                extension: 'pdf',
            }));
            setNotice('A4 비율과 화면 품질을 유지한 PDF를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PDF를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportPptx = async () => {
        setIsExporting(true);
        try {
            const canvas = await captureSheet();
            const { default: PptxGenJS } = await import('pptxgenjs');
            const pptx = new PptxGenJS();
            pptx.defineLayout({ name: 'PSI_A4', width: 8.27, height: 11.69 });
            pptx.layout = 'PSI_A4';
            pptx.author = 'PSI';
            pptx.subject = '다음 달 위험성평가 전파교육';
            pptx.title = draft.title;
            const slide = pptx.addSlide();
            slide.background = { color: 'FFFFFF' };
            slide.addImage({ data: canvas.toDataURL('image/png', 1), x: 0, y: 0, w: 8.27, h: 11.69 });
            
            const langSuffix = previewLanguage !== 'ko-KR' ? previewLanguage.split('-').pop()?.toLowerCase() || '' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langSuffix) exportTokens.push(langSuffix);

            await pptx.writeFile({
                fileName: buildPsiExportFileName({
                    tokens: exportTokens,
                    extension: 'pptx',
                }),
            });
            setNotice('동일한 한 장 디자인으로 PPTX를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PPTX를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="psi-page space-y-5 pb-16">
            <section className="psi-enterprise-hero no-print">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">Evidence-based TBM Studio</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">다음 달 TBM 교육자료 스튜디오</h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-blue-50">
                    현장 기록과 첨부자료를 근거로 5단계 전파교육 초안을 만들고, 선택한 AI의 정밀 분석 결과를 한 장 자료·다국어 교육으로 이어갑니다.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-white/15 px-3 py-2">ChatGPT · Claude · Gemini</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">로컬 무료 초안</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">출처 표시</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">PNG · PDF · PPTX</span>
                </div>
            </section>

            <nav className="psi-segmented-nav grid grid-cols-2 gap-2 sm:grid-cols-5 no-print" aria-label="교육자료 제작 단계">
                {([
                    ['sources', '1. 자료 모으기'],
                    ['ai', '2. AI 정밀 초안'],
                    ['package', '3. 5단계 검수'],
                    ['editor', '4. 한 장 편집'],
                    ['preview', '5. 출력 확인'],
                ] as Array<[StudioTab, string]>).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setActiveTab(id)}
                        className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-colors sm:text-sm ${
                            activeTab === id
                                ? 'bg-blue-700 text-white shadow-md'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {notice && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 no-print">
                    {notice}
                </p>
            )}

            {activeTab === 'sources' && (
                <div className="space-y-4 no-print">
                    <section className="psi-enterprise-panel grid gap-4 p-5 lg:grid-cols-3">
                        <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                            교육 대상월
                            <input type="month" value={educationMonth} onChange={(event) => setEducationMonth(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3" />
                        </label>
                        <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                            대상 공종
                            <select value={workType} onChange={(event) => setWorkType(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3">
                                {workTypes.map((item) => <option key={item}>{item}</option>)}
                            </select>
                        </label>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                            <p className="text-xs font-black text-emerald-800 dark:text-emerald-200">무료 사용량 보호</p>
                            <p className="mt-2 text-2xl font-black text-emerald-900 dark:text-emerald-100">약 {estimatedTokens.toLocaleString()} 토큰</p>
                            <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">현재 자료를 AI에 보낼 경우의 예상량입니다. 초안 생성은 토큰을 쓰지 않습니다.</p>
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-center transition hover:border-blue-500 dark:border-blue-500/50 dark:bg-blue-500/10">
                            <span className="text-base font-black text-blue-800 dark:text-blue-200">{isExtracting ? '자료에서 글자를 읽는 중...' : 'PDF · PPTX · TXT 자료 추가'}</span>
                            <span className="mt-2 text-xs font-semibold leading-5 text-blue-600 dark:text-blue-300">최대 6개 파일을 한 번에 추가합니다. 스캔 PDF는 아래 직접 입력을 이용해 주세요.</span>
                            <input type="file" multiple accept=".pdf,.pptx,.txt,.md" className="sr-only" disabled={isExtracting} onChange={(event) => void handleFiles(event.target.files)} />
                        </label>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                                다음 달 작업계획 · 교육 원문 직접 입력
                                <textarea
                                    value={manualText}
                                    onChange={(event) => setManualText(event.target.value)}
                                    rows={5}
                                    placeholder="예: 7월 철골 설치 작업, 고소작업대 사용, 개구부 주변 작업이 예정되어 추락 방지조치를 중점 교육한다."
                                    className="mt-2 w-full rounded-xl border p-3 text-sm font-semibold"
                                />
                            </label>
                            <button type="button" onClick={addManualSource} className="mt-3 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white dark:bg-slate-100 dark:text-slate-900">
                                자료함에 추가
                            </button>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black">근거 자료함</h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">각 위험 항목에는 선택에 사용된 출처가 함께 표시됩니다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={resetStudio} className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-xs font-black text-slate-600 dark:border-slate-600 dark:text-slate-300">
                                    작업 초기화
                                </button>
                                <button type="button" onClick={generateDraft} className="psi-button-secondary">
                                    AI 없이 기본 초안
                                </button>
                                <button type="button" onClick={() => setActiveTab('ai')} className="psi-button-primary">
                                    AI 정밀 초안 만들기
                                </button>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {allSources.map((source) => (
                                <article key={source.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                                {source.kind === 'field-record' ? '현장 기록' : source.kind === 'manual' ? '직접 입력' : '업로드 자료'}
                                            </span>
                                            <h4 className="mt-1 text-sm font-black">{source.title}</h4>
                                        </div>
                                        {source.kind !== 'field-record' && (
                                            <button type="button" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} className="text-xs font-bold text-rose-600 dark:text-rose-300">
                                                삭제
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-3 line-clamp-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{source.text}</p>
                                </article>
                            ))}
                            {!allSources.length && (
                                <p className="rounded-xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300 md:col-span-2">
                                    아직 자료가 없습니다. 자료를 추가하지 않아도 기본 안전교육 보기글로 초안을 만들 수 있습니다.
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'ai' && (
                <ExternalAiHandoffPanel
                    sources={allSources}
                    month={educationMonth}
                    workType={workType}
                    draft={draft}
                    onImport={importExternalAiDraft}
                    onUseLocalDraft={generateDraft}
                    onNotice={setNotice}
                />
            )}

            {activeTab === 'package' && (
                <div className="space-y-4 no-print">
                    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-blue-950 dark:text-blue-100">다음 달 위험성평가 5단계 교육 흐름</h3>
                                <p className="mt-1 text-xs font-semibold leading-5 text-blue-700 dark:text-blue-300">공통 이해에서 현장 행동으로 이어지도록 영상 → 사례 → 상등급 → 중점관리 → 공지 순서로 진행하고, 마지막에 이해 확인과 작업중지 약속을 남깁니다.</p>
                            </div>
                            <span className={`rounded-full px-3 py-2 text-xs font-black ${videoDuration === 300 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                                영상 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 {videoDuration === 300 ? '완료' : '조정 필요'}
                            </span>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-black">1. 교육 전 5분 핵심 동영상 구성</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">무료 운영을 위해 MP4 자동 생성 대신 촬영·편집에 바로 쓰는 장면표와 내레이션을 만듭니다.</p>
                        <div className="mt-4 space-y-3">
                            {draft.videoScenes.map((scene, index) => (
                                <article key={scene.id} className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800 md:grid-cols-[90px_1fr_1fr]">
                                    <label className="text-xs font-black">장면 {index + 1} 시간
                                        <input type="number" min={5} value={scene.seconds} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, seconds: Number(event.target.value) } : item) })} className="mt-2 w-full rounded-lg border px-2 py-2" />
                                    </label>
                                    <label className="text-xs font-black">제목 · 내레이션
                                        <input value={scene.title} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, title: event.target.value } : item) })} className="mt-2 w-full rounded-lg border px-3 py-2" />
                                        <textarea value={scene.narration} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, narration: event.target.value } : item) })} rows={3} className="mt-2 w-full rounded-lg border p-3 text-xs font-semibold" />
                                    </label>
                                    <label className="text-xs font-black">화면 구성 지시
                                        <textarea value={scene.visualGuide} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, visualGuide: event.target.value } : item) })} rows={5} className="mt-2 w-full rounded-lg border p-3 text-xs font-semibold" />
                                    </label>
                                </article>
                            ))}
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">2. 최근 재해사례와 현장 연관성</h3>
                            {draft.accidentCases.slice(0, 1).map((item) => (
                                <div key={item.id} className="mt-4 grid gap-3">
                                    <input value={item.title} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, title: event.target.value }] })} aria-label="최근 재해사례 제목" placeholder="사례 제목" className="rounded-xl border px-3 py-3 font-bold" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="date" value={item.occurredAt} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, occurredAt: event.target.value }] })} aria-label="사고 발생일" className="rounded-xl border px-3 py-3 text-sm" />
                                        <input value={item.source} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, source: event.target.value }] })} aria-label="최근 재해사례 출처" placeholder="출처" className="rounded-xl border px-3 py-3 text-sm" />
                                    </div>
                                    <textarea value={item.summary} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, summary: event.target.value }] })} rows={3} aria-label="최근 재해사례 요약" placeholder="사례 요약" className="rounded-xl border p-3 text-sm" />
                                    <textarea value={item.siteRelevance} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, siteRelevance: event.target.value }] })} rows={2} aria-label="최근 재해사례 현장 연관성" placeholder="우리 현장과 밀접한 이유" className="rounded-xl border p-3 text-sm" />
                                    <textarea value={item.lesson} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, lesson: event.target.value }] })} rows={2} aria-label="최근 재해사례 핵심 교훈" placeholder="반드시 실천할 교훈" className="rounded-xl border p-3 text-sm" />
                                    {(!item.occurredAt || !item.source || item.source === '관리자 확인 필요') && <p className="text-xs font-black text-amber-700 dark:text-amber-300">발생일과 공식 출처를 확인하기 전에는 실제 사례로 확정 표시하지 않습니다.</p>}
                                </div>
                            ))}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">3. 다음 달 상등급 위험 공유</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">자동 추천 후 관리자가 등급과 담당자를 최종 확인합니다.</p>
                            <div className="mt-4 space-y-3">
                                {draft.risks.map((item) => (
                                    <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                                        <div className="flex items-center justify-between gap-2">
                                            <b className="text-sm">{item.risk}</b>
                                            <label className="flex items-center gap-2 text-xs font-black text-rose-700 dark:text-rose-300">
                                                <input type="checkbox" checked={item.managerConfirmed} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, managerConfirmed: event.target.checked } : risk) })} />
                                                상등급 확인
                                            </label>
                                        </div>
                                        <input value={item.owner} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, owner: event.target.value } : risk) })} aria-label={`${item.risk} 위험 담당자`} placeholder="담당자" className="mt-2 w-full rounded-lg border px-3 py-2 text-xs" />
                                        <p className="mt-2 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">{item.action}</p>
                                    </article>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">4. 현장 중점관리 포인트</h3>
                            <div className="mt-3 space-y-2">{draft.focusPoints.map((item, index) => <textarea key={index} value={item} onChange={(event) => setDraft({ ...draft, focusPoints: updateAt(draft.focusPoints, index, event.target.value) })} rows={2} aria-label={`현장 중점관리 포인트 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">5. 공지사항</h3>
                            <div className="mt-3 space-y-2">{draft.notices.map((item, index) => <textarea key={index} value={item} onChange={(event) => setDraft({ ...draft, notices: updateAt(draft.notices, index, event.target.value) })} rows={2} aria-label={`공지사항 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />)}</div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/10">
                        <h3 className="text-lg font-black text-orange-950 dark:text-orange-100">교육 마무리: 이해 확인과 행동 약속</h3>
                        <textarea value={draft.closingCommitment} onChange={(event) => setDraft({ ...draft, closingCommitment: event.target.value })} rows={2} aria-label="교육 마무리 행동 약속" className="mt-3 w-full rounded-xl border p-3 text-sm font-bold" />
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => setActiveTab('editor')} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white">한 장 자료 편집</button>
                            <button type="button" onClick={sendToTraining} className="min-h-12 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">다국어 교육 원문으로 보내기</button>
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'editor' && (
                <div className="space-y-4 no-print">
                    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
                        <label className="text-sm font-black">교육자료 제목<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                        <label className="text-sm font-black">교육 시작 안내<input value={draft.opening} onChange={(event) => setDraft({ ...draft, opening: event.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                        <label className="text-sm font-black lg:col-span-2">
                            핵심 전달 문구
                            <textarea value={draft.coreMessage} onChange={(event) => setDraft({ ...draft, coreMessage: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border p-3" />
                        </label>
                        <div className="lg:col-span-2">
                            <p className="text-xs font-black text-slate-500 dark:text-slate-400">보기글 선택</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                                {MESSAGE_TEMPLATES.map((template) => (
                                    <button key={template} type="button" onClick={() => setDraft({ ...draft, coreMessage: template })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold leading-5 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800">
                                        {template}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        {draft.risks.map((item, index) => (
                            <article key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[0.7fr_1.3fr]">
                                <label className="text-sm font-black">주요 위험 {index + 1}<input value={item.risk} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, risk: event.target.value } : risk) })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                                <label className="text-sm font-black">핵심 안전조치<textarea value={item.action} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, action: event.target.value } : risk) })} rows={2} className="mt-2 w-full rounded-xl border p-3" /></label>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 md:col-span-2">선정 근거: {item.evidenceLabels.join(' · ')}</p>
                            </article>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-black">현장 실천 확인</h3>
                            <button type="button" onClick={() => setDraft({ ...draft, checklist: CHECKLIST_TEMPLATES })} className="text-xs font-black text-blue-700 dark:text-blue-300">보기글 적용</button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {draft.checklist.map((item, index) => (
                                <input key={index} value={item} onChange={(event) => setDraft({ ...draft, checklist: updateAt(draft.checklist, index, event.target.value) })} className="rounded-xl border px-3 py-3 text-sm font-semibold" />
                            ))}
                        </div>
                    </section>
                    <button type="button" onClick={() => setActiveTab('preview')} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-4 text-sm font-black text-white">
                        완성된 한 장 확인
                    </button>
                </div>
            )}

            {(activeTab === 'preview' || activeTab === 'editor') && (
                <section className={activeTab === 'editor' ? 'hidden' : ''}>
                    {/* 언어 선택 탭 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl mb-4 no-print">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setPreviewLanguage('ko-KR')}
                                className={`px-4 py-2 text-xs font-black rounded-xl border transition-all flex items-center gap-1.5 ${
                                    previewLanguage === 'ko-KR'
                                        ? 'bg-blue-700 border-blue-700 text-white shadow-sm'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
                                }`}
                            >
                                <CountryFlag code="ko-KR" />
                                한국어 원문
                            </button>
                            {Object.entries(translatedTexts).map(([code, text]) => {
                                if (code === '__quality__' || !text) return null;
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => setPreviewLanguage(code)}
                                        className={`px-4 py-2 text-xs font-black rounded-xl border transition-all flex items-center gap-1.5 ${
                                            previewLanguage === code
                                                ? 'bg-blue-700 border-blue-700 text-white shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
                                        }`}
                                    >
                                        <CountryFlag code={code} />
                                        {TRAINING_LANGUAGE_LABELS[code as keyof typeof TRAINING_LANGUAGE_LABELS] || code}
                                    </button>
                                );
                            })}
                        </div>
                        
                        {/* 분할 대조 뷰 / 단독 뷰 토글 (다국어가 선택된 경우만 노출) */}
                        {previewLanguage !== 'ko-KR' && (
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('split')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        viewMode === 'split'
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    좌우 대조
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('single')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        viewMode === 'single'
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    번역본 단독
                                </button>
                            </div>
                        )}
                    </div>

                    <article ref={sheetRef} data-report-template-root="true" className="mx-auto w-[210mm] max-w-full bg-white text-slate-900 shadow-2xl">
                        <div data-report-page="true" className="flex h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden bg-white p-[12mm]">
                            {previewLanguage === 'ko-KR' ? (
                                <>
                                    <header className="border-b-[5px] border-orange-500 pb-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-black text-blue-700">PSI 다음 달 위험성평가 전파교육</p>
                                                <h1 className="mt-2 text-[28px] font-black leading-tight">{draft.title}</h1>
                                            </div>
                                            <div className="rounded-xl bg-blue-950 px-4 py-3 text-center text-white">
                                                <p className="text-[10px] font-bold text-blue-200">교육 대상</p>
                                                <p className="mt-1 text-sm font-black">{draft.workType}</p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm font-semibold text-slate-600">{draft.opening}</p>
                                    </header>

                                    <section className="mt-5 rounded-2xl bg-blue-950 p-5 text-white">
                                        <p className="text-xs font-black text-blue-200">오늘 반드시 전달할 한 문장</p>
                                        <p className="mt-2 text-[20px] font-black leading-8">{draft.coreMessage}</p>
                                    </section>

                                    <section className="mt-4 grid grid-cols-2 gap-3">
                                        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                            <p className="text-[10px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                            <h2 className="mt-1 text-base font-black">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 · {draft.videoScenes.length}장면</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{draft.videoScenes.map((scene) => scene.title).join(' → ')}</p>
                                        </article>
                                        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                            <p className="text-[10px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                            <h2 className="mt-1 text-base font-black">{draft.accidentCases[0]?.title}</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{draft.accidentCases[0]?.siteRelevance}</p>
                                            <p className="mt-1 text-[10px] font-bold text-amber-800">출처: {draft.accidentCases[0]?.source} · {draft.accidentCases[0]?.occurredAt || '발생일 확인 필요'}</p>
                                        </article>
                                    </section>

                                    <section className="mt-4">
                                        <h2 className="text-sm font-black text-rose-700">3. 다음 달 위험성평가 상등급 공유</h2>
                                        <div className="mt-2 grid grid-cols-3 gap-3">
                                            {draft.risks.map((item) => (
                                                <article key={item.id} className="rounded-xl border border-rose-200 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h3 className="text-sm font-black">{item.risk}</h3>
                                                        <span className={`rounded px-2 py-1 text-[9px] font-black ${item.managerConfirmed ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.managerConfirmed ? '상등급 확인' : '확인 필요'}</span>
                                                    </div>
                                                    <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">{item.action}</p>
                                                    <p className="mt-2 text-[9px] font-bold text-slate-500">담당: {item.owner}</p>
                                                </article>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="mt-4 grid grid-cols-2 gap-4">
                                        <div>
                                            <h2 className="text-sm font-black text-emerald-700">4. 현장 중점관리 포인트</h2>
                                            <ol className="mt-2 space-y-1.5">
                                                {draft.focusPoints.slice(0, 3).map((item, index) => (
                                                    <li key={index} className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4">
                                                        <b className="text-emerald-700">{index + 1}</b><span>{item}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                        <div>
                                            <h2 className="text-sm font-black text-violet-700">5. 공지사항</h2>
                                            <ul className="mt-2 space-y-1.5">
                                                {draft.notices.map((notice, index) => (
                                                    <li key={index} className="rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold leading-4">{notice}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </section>

                                    <section className="mt-4 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-3">
                                        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">이해 확인</h2>
                                                {draft.confirmationQuestions.slice(0, 2).map((question, index) => <p key={index} className="mt-1 text-[10px] font-bold leading-4 text-orange-900">Q{index + 1}. {question}</p>)}
                                            </div>
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">행동 약속</h2>
                                                <p className="mt-1 text-[10px] font-bold leading-4 text-orange-900">{draft.closingCommitment}</p>
                                            </div>
                                        </div>
                                    </section>

                                    <footer className="mt-auto flex items-end justify-between border-t border-slate-200 pt-4 text-[10px] font-semibold text-slate-500">
                                        <div>
                                            <p>근거 자료 {draft.sourceCount}개 · 생성 {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</p>
                                            <p className="mt-1">관리자가 현장 조건과 실제 작업계획을 최종 확인한 후 교육에 사용합니다.</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-center">
                                            <span className="w-20 border-b border-slate-400 pb-1">교육자</span>
                                            <span className="w-20 border-b border-slate-400 pb-1">확인자</span>
                                        </div>
                                    </footer>
                                </>
                            ) : viewMode === 'split' ? (
                                <div className="grid grid-cols-2 gap-6 h-full overflow-hidden text-slate-900">
                                    {/* 좌측: 한국어 요약 */}
                                    <div className="flex flex-col h-full border-r border-slate-200 pr-5">
                                        <header className="border-b-[3px] border-orange-500 pb-3">
                                            <p className="text-[10px] font-black text-blue-700">TBM 위험성평가 전파교육 (요약)</p>
                                            <h2 className="text-base font-black leading-tight mt-1 truncate">{draft.title}</h2>
                                            <p className="text-[10px] font-bold text-slate-500 mt-1">대상: {draft.workType} · 월: {educationMonth}</p>
                                        </header>
                                        
                                        <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                            <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                                <p className="text-[10px] font-bold mt-1">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초</p>
                                                <p className="text-[9px] text-slate-600 mt-1 leading-normal truncate">{draft.videoScenes.map((scene) => scene.title).join(' → ')}</p>
                                            </article>

                                            <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                                <p className="text-[10px] font-bold mt-1 truncate">{draft.accidentCases[0]?.title}</p>
                                                <p className="text-[9px] text-slate-600 mt-1 leading-normal line-clamp-3">{draft.accidentCases[0]?.siteRelevance}</p>
                                            </article>

                                            <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-rose-700">3. 다음 달 위험성평가 상등급 공유</p>
                                                <div className="space-y-1.5 mt-1.5">
                                                    {draft.risks.map((item) => (
                                                        <div key={item.id} className="text-[9px] leading-normal">
                                                            <b className="text-slate-800">• {item.risk}</b>: {item.action} <span className="text-slate-400">({item.owner})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-emerald-700">4. 현장 중점관리 및 공지사항</p>
                                                <div className="space-y-1 mt-1 text-[9px] leading-normal text-slate-700">
                                                    {draft.focusPoints.slice(0, 2).map((item, idx) => (
                                                        <div key={idx} className="truncate">- {item}</div>
                                                    ))}
                                                    {draft.notices.slice(0, 1).map((item, idx) => (
                                                        <div key={idx} className="truncate">- {item}</div>
                                                    ))}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-orange-800">5. 이해 확인과 행동 약속</p>
                                                <p className="text-[9px] font-bold text-slate-800 mt-1 leading-relaxed line-clamp-2">{draft.closingCommitment}</p>
                                            </article>
                                        </div>
                                        
                                        <footer className="border-t border-slate-200 pt-3 text-[9px] font-bold text-slate-500 mt-auto">
                                            <div className="flex justify-between items-center">
                                                <span>교육자: (인) / 확인자: (인)</span>
                                                <span>생성: {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</span>
                                            </div>
                                        </footer>
                                    </div>

                                    {/* 우측: 다국어 번역 전문 (구조화 매칭) */}
                                    <div className="flex flex-col h-full pl-3 overflow-hidden">
                                        {(() => {
                                            const parsed = parseTbmTranslation(translatedTexts[previewLanguage] || '');
                                            const videoLines = parsed.videoText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const accidentLines = parsed.accidentText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const riskLines = parsed.risksText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const focusLines = parsed.focusText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const noticeLines = parsed.noticesText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const pledgeLines = parsed.pledgeText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);

                                            return (
                                                <>
                                                    <header className="border-b-[3px] border-blue-900 pb-3 flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-black text-indigo-700 flex items-center gap-1.5">
                                                                <CountryFlag code={previewLanguage} />
                                                                TBM Safety Guide ({TRAINING_LANGUAGE_LABELS[previewLanguage as keyof typeof TRAINING_LANGUAGE_LABELS] || previewLanguage})
                                                            </p>
                                                            <h2 className="text-xs font-black leading-tight mt-1 text-slate-500 truncate">{parsed.title}</h2>
                                                        </div>
                                                    </header>
                                                    
                                                    <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                                        <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-blue-700">1. Video Guidance</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {videoLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700 truncate">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-amber-700">2. Recent Accident Case</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {accidentLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700 line-clamp-3">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-rose-700">3. High-Priority Risks</p>
                                                            <div className="space-y-1 mt-1">
                                                                {riskLines.map((line, idx) => (
                                                                    <div key={idx} className="text-[9.5px] leading-normal text-slate-700 line-clamp-2">
                                                                        • {line}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-emerald-700">4. Focus Points & Notices</p>
                                                            <div className="space-y-1 mt-1 text-[9.5px] leading-normal text-slate-700">
                                                                {focusLines.slice(0, 2).map((item, idx) => (
                                                                    <div key={idx} className="truncate">- {item}</div>
                                                                ))}
                                                                {noticeLines.slice(0, 1).map((item, idx) => (
                                                                    <div key={idx} className="truncate">- {item}</div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-orange-800">5. Pledge & Checks</p>
                                                            <div className="space-y-0.5 mt-1 text-[9.5px] leading-relaxed text-slate-800 font-semibold">
                                                                {pledgeLines.slice(-2).map((line, idx) => (
                                                                    <p key={idx} className="line-clamp-2">{line}</p>
                                                                ))}
                                                            </div>
                                                        </article>
                                                    </div>
                                                    
                                                    <footer className="border-t border-slate-200 pt-3 text-[9px] font-bold text-slate-500 mt-auto">
                                                        <div className="flex justify-between items-center">
                                                            <span>Instructor: (Sign)</span>
                                                            <span>Date: {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</span>
                                                        </div>
                                                    </footer>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full text-slate-900">
                                    {(() => {
                                        const parsed = parseTbmTranslation(translatedTexts[previewLanguage] || '');
                                        const videoLines = parsed.videoText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const accidentLines = parsed.accidentText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const riskLines = parsed.risksText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const focusLines = parsed.focusText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const noticeLines = parsed.noticesText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const pledgeLines = parsed.pledgeText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);

                                        const qLines = pledgeLines.filter(line => line.startsWith('Q') || /^[qQ][0-9]/.test(line) || line.toLowerCase().includes('question') || line.includes('?'));
                                        const commitmentLines = pledgeLines.filter(line => !qLines.includes(line));

                                        const langLabel = TRAINING_LANGUAGE_LABELS[previewLanguage as keyof typeof TRAINING_LANGUAGE_LABELS] || previewLanguage;

                                        return (
                                            <>
                                                <header className="border-b-[5px] border-orange-500 pb-4">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <p className="text-xs font-black text-blue-700 flex items-center gap-1.5">
                                                                <CountryFlag code={previewLanguage} width={20} />
                                                                PSI TBM Safety Guide ({langLabel})
                                                            </p>
                                                            <h1 className="mt-1.5 text-[22px] font-black leading-tight text-slate-900">{parsed.title}</h1>
                                                        </div>
                                                        <div className="rounded-xl bg-blue-950 px-3 py-2 text-center text-white shrink-0">
                                                            <p className="text-[9px] font-bold text-blue-200">TARGET</p>
                                                            <p className="mt-0.5 text-xs font-black">{draft.workType}</p>
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-xs font-semibold text-slate-600 leading-relaxed">{parsed.opening}</p>
                                                </header>

                                                <section className="mt-3.5 grid grid-cols-2 gap-3">
                                                    <article className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5">
                                                        <p className="text-[9px] font-black text-blue-700">1. Video Guidance</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">TBM Video Scenes</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {videoLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {videoLines.length === 0 && <p className="text-[10.5px] text-slate-400">No scene details available.</p>}
                                                        </div>
                                                    </article>
                                                    <article className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                                                        <p className="text-[9px] font-black text-amber-700">2. Recent Accident Case</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">Accident Summary & Relevance</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {accidentLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {accidentLines.length === 0 && <p className="text-[10.5px] text-slate-400">No accident case available.</p>}
                                                        </div>
                                                    </article>
                                                </section>

                                                <section className="mt-3.5">
                                                    <h2 className="text-xs font-black text-rose-700">3. High-Priority Risk Items</h2>
                                                    <div className="mt-1.5 grid grid-cols-3 gap-3">
                                                        {riskLines.map((line, idx) => (
                                                            <article key={idx} className="rounded-xl border border-rose-200 p-2.5 bg-rose-50/30 flex flex-col justify-between">
                                                                <p className="text-[10px] font-semibold leading-relaxed text-slate-700">{line}</p>
                                                            </article>
                                                        ))}
                                                        {riskLines.length === 0 && (
                                                            <p className="text-[10.5px] text-slate-400 col-span-3 text-center py-2">No risk details configured.</p>
                                                        )}
                                                    </div>
                                                </section>

                                                <section className="mt-3.5 grid grid-cols-2 gap-3">
                                                    <div>
                                                        <h2 className="text-xs font-black text-emerald-700">4. Key Focus Points</h2>
                                                        <ol className="mt-1.5 space-y-1">
                                                            {focusLines.map((item, index) => (
                                                                <li key={index} className="flex gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed">
                                                                    <b className="text-emerald-700">{index + 1}</b>
                                                                    <span className="text-slate-700">{item}</span>
                                                                </li>
                                                            ))}
                                                            {focusLines.length === 0 && <li className="text-[10.5px] text-slate-400">No focus points.</li>}
                                                        </ol>
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xs font-black text-violet-700">5. Notices & Scheduling</h2>
                                                        <ul className="mt-1.5 space-y-1">
                                                            {noticeLines.map((notice, index) => (
                                                                <li key={index} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed text-slate-700">{notice}</li>
                                                            ))}
                                                            {noticeLines.length === 0 && <li className="text-[10.5px] text-slate-400">No active notices.</li>}
                                                        </ul>
                                                    </div>
                                                </section>

                                                <section className="mt-3.5 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-2.5">
                                                    <div className="grid grid-cols-[1fr_1.2fr] gap-3">
                                                        <div>
                                                            <h2 className="text-[10.5px] font-black text-orange-900">Comprehension Checks</h2>
                                                            {qLines.map((question, index) => (
                                                                <p key={index} className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{question}</p>
                                                            ))}
                                                            {qLines.length === 0 && (
                                                                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">Please answer understanding questions before starting work.</p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h2 className="text-[10.5px] font-black text-orange-900">Safety Pledge</h2>
                                                            {commitmentLines.map((line, index) => (
                                                                <p key={index} className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{line}</p>
                                                            ))}
                                                            {commitmentLines.length === 0 && (
                                                                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{draft.closingCommitment}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </section>

                                                <footer className="mt-auto flex items-end justify-between border-t border-slate-200 pt-3 text-[9px] font-semibold text-slate-400">
                                                    <div>
                                                        <p>TBM Safety Translation Guide ({langLabel})</p>
                                                        <p className="mt-0.5">This safety instruction sheet has been translated automatically for non-Korean workers.</p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-center text-slate-500 shrink-0">
                                                        <span className="w-16 border-b border-slate-300 pb-0.5">Instructor</span>
                                                        <span className="w-16 border-b border-slate-300 pb-0.5">Confirmed</span>
                                                    </div>
                                                </footer>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </article>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3 no-print">
                        <button type="button" disabled={isExporting} onClick={() => void exportImage()} className="min-h-12 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-800 disabled:opacity-50 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-200">PNG 이미지</button>
                        <button type="button" disabled={isExporting} onClick={() => void exportPdf()} className="min-h-12 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PDF 저장</button>
                        <button type="button" disabled={isExporting} onClick={() => void exportPptx()} className="min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PPTX 저장</button>
                    </div>
                </section>
            )}
        </div>
    );
};

export default A4EducationMaterial;
