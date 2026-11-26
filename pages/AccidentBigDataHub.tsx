import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PSI_RISK_TYPE_CATALOG } from '../config/psiFormMaster';
import type {
    AccidentBigDataRecord,
    AccidentSeverity,
    AccidentTimeSlot,
    Page,
    WorkerRecord,
} from '../types';
import {
    ACCIDENT_BIGDATA_UPDATED_EVENT,
    ACCIDENT_JOB_FIELD_OPTIONS,
    ACCIDENT_SEVERITY_LEVELS,
    ACCIDENT_SEVERITY_META,
    auditAccidentImportCandidates,
    buildAccidentConversionPrompt,
    computeAccidentBigDataAnalytics,
    computeAccidentFingerprint,
    detectAccidentPiiMatches,
    exportAccidentRecordsToCsv,
    exportAccidentRecordsToJson,
    getSampleAccidentBigDataRecords,
    maskAccidentRecordPii,
    parseExternalAiAccidentPayload,
    persistAccidentBigDataStore,
    readAccidentBigDataStore,
    updateAccidentRecordInList,
    type AccidentAuditCandidate,
    type AccidentPromptFormat,
    type AccidentPromptProvider,
} from '../utils/accidentBigData';

interface AccidentBigDataHubProps {
    workerRecords?: WorkerRecord[];
    onNavigateToPage?: (page: Page) => void;
}

type HubTab = 'import' | 'dashboard' | 'archive';

const SEVERITY_OPTIONS: readonly AccidentSeverity[] = ACCIDENT_SEVERITY_LEVELS;
const TIME_SLOT_OPTIONS: readonly AccidentTimeSlot[] = ['오전 작업전', '오전', '점심 직후', '오후', '야간', '미상'];
const HAZARD_OPTIONS = PSI_RISK_TYPE_CATALOG.map((item) => item.label);

const SEVERITY_BADGE_MAP: Record<AccidentSeverity, string> = {
    '중대재해': 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-200',
    '중상(장기·입원)': 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-500/40 dark:bg-orange-950/60 dark:text-orange-200',
    '휴업재해(3일↑)': 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200',
    '경미(응급·외래)': 'border-cyan-300 bg-cyan-50 text-cyan-800 dark:border-cyan-500/40 dark:bg-cyan-950/60 dark:text-cyan-200',
    '아차사고': 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200',
};

const SAMPLE_PASTE_JSON = `[
  {
    "occurredDate": "2026-11-24",
    "timeSlot": "오전",
    "sourceContractor": "대한종합건설",
    "siteName": "서울 동부 물류센터 2공구",
    "jobField": "형틀",
    "workTask": "3층 보 거푸집 동바리 수평연결재 체결",
    "hazardType": "떨어짐",
    "severity": "휴업재해(3일↑)",
    "causingAgent": "이동식 작업대 난간 미설치 구간",
    "summary": "재해자: 김OO(010-1234-5678)이 작업대 상부에서 볼트 체결 중 균형을 잃고 추락함.",
    "directCause": "작업대 상부 안전난간 일부 미설치 및 안전대 고리 미체결",
    "rootCause": "작업 전 안전시설물 완비 확인 및 관리감독자 승인 절차 누락",
    "preventionMeasure": "난간 선행 설치 완료 후 상부 작업 허가, 2줄걸이 안전대 체결 확인",
    "preWorkCheckpoints": ["작업대 난간 전 구간 설치 확인", "2m 이상 고소작업 안전대 2줄 체결"],
    "educationKeywords": ["형틀고소", "선행난간", "안전대체결"],
    "sourceAiProvider": "gemini"
  }
]`;

function useAnimatedNumber(target: number, durationMs = 460): number {
    const [display, setDisplay] = useState(target);
    const prevRef = useRef(target);

    useEffect(() => {
        const reduced =
            typeof window !== 'undefined'
            && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
                || document.documentElement.getAttribute('data-psi-motion-paused') === 'true');
        if (reduced) {
            prevRef.current = target;
            setDisplay(target);
            return;
        }

        const startVal = prevRef.current;
        const delta = target - startVal;
        if (delta === 0) {
            setDisplay(target);
            return;
        }

        let rafId = 0;
        const startTime = performance.now();
        const step = (now: number) => {
            const elapsed = Math.min(1, (now - startTime) / durationMs);
            const eased = 1 - Math.pow(1 - elapsed, 3);
            const nextVal = Math.round(startVal + delta * eased);
            setDisplay(nextVal);
            if (elapsed < 1) {
                rafId = window.requestAnimationFrame(step);
            } else {
                prevRef.current = target;
            }
        };

        rafId = window.requestAnimationFrame(step);
        return () => window.cancelAnimationFrame(rafId);
    }, [durationMs, target]);

    return display;
}

const triggerDownloadFile = (filename: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
};

export const AccidentBigDataHub: React.FC<AccidentBigDataHubProps> = ({
    workerRecords = [],
    onNavigateToPage,
}) => {
    const [initialStore] = useState(() => readAccidentBigDataStore());
    const [records, setRecords] = useState<AccidentBigDataRecord[]>(initialStore.items);
    const [storageWarning, setStorageWarning] = useState(initialStore.warning);

    const [activeTab, setActiveTab] = useState<HubTab>(() => (
        initialStore.items.length > 0 ? 'dashboard' : 'import'
    ));

    // Step 1: AI Prompt Builder State
    const [provider, setProvider] = useState<AccidentPromptProvider>('gemini');
    const [outputFormat, setOutputFormat] = useState<AccidentPromptFormat>('json');
    const [contractorHint, setContractorHint] = useState('');
    const [siteHint, setSiteHint] = useState('');
    const [showPromptPreview, setShowPromptPreview] = useState(false);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    // Step 2: Import / Dropzone State
    const [rawInput, setRawInput] = useState('');
    const [isDragging, setIsDragging] = useState(false);
    const [parseNotice, setParseNotice] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Step 3: Pre-Commit Audit State
    const [auditQueue, setAuditQueue] = useState<AccidentAuditCandidate[]>([]);
    const [commitBanner, setCommitBanner] = useState<string>('');

    // Dashboard & Archive Filters
    const [contractorFilter, setContractorFilter] = useState<string>('전체');
    const [severityFilter, setSeverityFilter] = useState<string>('전체');
    const [hazardFilter, setHazardFilter] = useState<string>('전체');
    const [jobFieldFilter, setJobFieldFilter] = useState<string>('전체');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedRecord, setSelectedRecord] = useState<AccidentBigDataRecord | null>(null);
    const [isEditingDrawer, setIsEditingDrawer] = useState(false);
    const [editDraft, setEditDraft] = useState<AccidentBigDataRecord | null>(null);
    const [customCandidateJobs, setCustomCandidateJobs] = useState<Record<string, boolean>>({});
    const [customDraftJob, setCustomDraftJob] = useState(false);

    useEffect(() => {
        const handleExternalUpdate = () => {
            const next = readAccidentBigDataStore();
            if (next.safe) {
                setRecords(next.items);
                setStorageWarning('');
            }
        };
        window.addEventListener(ACCIDENT_BIGDATA_UPDATED_EVENT, handleExternalUpdate);
        return () => window.removeEventListener(ACCIDENT_BIGDATA_UPDATED_EVENT, handleExternalUpdate);
    }, []);

    const saveRecords = (next: AccidentBigDataRecord[]): boolean => {
        if (!initialStore.safe) {
            setStorageWarning('기존 사고 빅데이터 읽기 오류가 있어 덮어쓰기를 차단했습니다.');
            return false;
        }
        const saved = persistAccidentBigDataStore(next);
        if (!saved.ok) {
            setStorageWarning(saved.warning);
            return false;
        }
        setRecords(next);
        setStorageWarning('');
        return true;
    };

    const generatedPrompt = useMemo(() => buildAccidentConversionPrompt({
        provider,
        contractorHint,
        siteHint,
        outputFormat,
        batchMode: true,
    }), [contractorHint, outputFormat, provider, siteHint]);

    const contractorOptions = useMemo(() => {
        const set = new Set(records.map((r) => r.sourceContractor).filter(Boolean));
        return ['전체', ...Array.from(set)];
    }, [records]);

    const filteredRecords = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return records.filter((rec) => {
            if (contractorFilter !== '전체' && rec.sourceContractor !== contractorFilter) return false;
            if (severityFilter !== '전체' && rec.severity !== severityFilter) return false;
            if (hazardFilter !== '전체' && rec.hazardType !== hazardFilter) return false;
            if (jobFieldFilter !== '전체' && rec.jobField !== jobFieldFilter) return false;
            if (!q) return true;
            return [
                rec.sourceContractor,
                rec.siteName,
                rec.jobField,
                rec.hazardType,
                rec.workTask,
                rec.causingAgent,
                rec.summary,
                rec.preventionMeasure,
            ].join(' ').toLowerCase().includes(q);
        });
    }, [contractorFilter, hazardFilter, jobFieldFilter, records, searchQuery, severityFilter]);

    const analytics = useMemo(
        () => computeAccidentBigDataAnalytics(filteredRecords, workerRecords),
        [filteredRecords, workerRecords],
    );

    const animatedTotal = useAnimatedNumber(analytics.totalCount);
    const animatedReportableRate = useAnimatedNumber(analytics.reportableRatePct);
    const animatedSevereRate = useAnimatedNumber(analytics.severeRatePct);
    const animatedNearMiss = useAnimatedNumber(analytics.nearMissCount);
    const animatedContractors = useAnimatedNumber(analytics.contractorCount);

    const donutSegments = useMemo(() => {
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const total = Math.max(1, analytics.totalCount);
        let offset = 0;

        return analytics.severityPyramid
            .filter((tier) => tier.count > 0)
            .map((tier) => {
                const segLength = (tier.count / total) * circumference;
                const currentOffset = offset;
                offset += segLength;
                return {
                    ...tier,
                    radius,
                    circumference,
                    dashArray: `${segLength} ${Math.max(0, circumference - segLength)}`,
                    dashOffset: -currentOffset,
                };
            });
    }, [analytics.severityPyramid, analytics.totalCount]);

    const detectedPasteFormat = useMemo(() => {
        const t = rawInput.trim();
        if (!t) return null;
        if (t.includes('{') || t.includes('[')) return 'JSON 감지';
        if (t.includes(',') || t.includes('\t')) return '표(CSV/TSV) 감지';
        return '텍스트 입력 중';
    }, [rawInput]);

    const handleCopyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(generatedPrompt);
            setCopiedPrompt(true);
            window.setTimeout(() => setCopiedPrompt(false), 2000);
        } catch {
            setParseNotice({ tone: 'warn', text: '클립보드 복사가 차단되었습니다. 아래 미리보기를 열어 수동 복사해 주세요.' });
            setShowPromptPreview(true);
        }
    };

    const runParseAndAudit = (inputText: string) => {
        const parsed = parseExternalAiAccidentPayload(inputText, { defaultProvider: provider });
        if (!parsed.ok) {
            setAuditQueue([]);
            setParseNotice({ tone: 'error', text: parsed.error });
            return;
        }
        const audited = auditAccidentImportCandidates(parsed.candidates, records);
        setAuditQueue(audited);
        const dupCount = audited.filter((c) => c.isDuplicate).length;
        const piiCount = audited.filter((c) => c.piiFindings.length > 0).length;
        setParseNotice({
            tone: piiCount > 0 || dupCount > 0 ? 'warn' : 'info',
            text: `${audited.length}건 인식 완료(${parsed.formatDetected.toUpperCase()}) · 개인정보 의심 ${piiCount}건 · 중복 의심 ${dupCount}건`,
        });
    };

    const handleFileUpload = async (file: File) => {
        try {
            const text = await file.text();
            setRawInput(text);
            runParseAndAudit(text);
        } catch {
            setParseNotice({ tone: 'error', text: `'${file.name}' 파일을 읽지 못했습니다. JSON/CSV/TXT 파일인지 확인해 주세요.` });
        }
    };

    const handleToggleCandidate = (candidateId: string) => {
        setAuditQueue((prev) => prev.map((item) => (
            item.candidateId === candidateId ? { ...item, selected: !item.selected } : item
        )));
    };

    const handleUpdateCandidateField = <K extends keyof AccidentBigDataRecord>(
        candidateId: string,
        field: K,
        value: AccidentBigDataRecord[K],
    ) => {
        setAuditQueue((prev) => prev.map((item) => {
            if (item.candidateId !== candidateId) return item;
            const updatedRecord: AccidentBigDataRecord = {
                ...item.record,
                [field]: value,
            };
            updatedRecord.fingerprint = computeAccidentFingerprint(updatedRecord);
            const reAudited = auditAccidentImportCandidates([updatedRecord], records)[0];
            return {
                ...reAudited,
                candidateId: item.candidateId,
                selected: item.selected,
            };
        }));
    };

    const handleMaskSingleCandidate = (candidateId: string) => {
        setAuditQueue((prev) => prev.map((item) => {
            if (item.candidateId !== candidateId) return item;
            const masked = maskAccidentRecordPii(item.record);
            return {
                ...item,
                record: masked,
                piiFindings: [],
            };
        }));
    };

    const handleMaskAllCandidates = () => {
        setAuditQueue((prev) => prev.map((item) => ({
            ...item,
            record: maskAccidentRecordPii(item.record),
            piiFindings: [],
        })));
    };

    const handleCommitSelected = () => {
        const selected = auditQueue.filter((item) => item.selected).map((item) => ({
            ...item.record,
            importedAt: new Date().toISOString(),
        }));
        if (selected.length === 0) {
            setParseNotice({ tone: 'warn', text: 'DB에 반영할 항목을 최소 1건 이상 선택해 주세요.' });
            return;
        }
        const merged = [...selected, ...records];
        if (!saveRecords(merged)) return;

        setCommitBanner(`신규 사고 사례 ${selected.length}건이 빅데이터 DB에 반영되었습니다. (추가 API 비용 0원)`);
        setAuditQueue([]);
        setRawInput('');
        setParseNotice(null);
        setActiveTab('dashboard');
    };

    const handleLoadSamples = () => {
        const samples = getSampleAccidentBigDataRecords();
        const existingFingerprints = new Set(records.map((r) => r.fingerprint));
        const newOnes = samples.filter((s) => !existingFingerprints.has(s.fingerprint));
        if (newOnes.length === 0) {
            setCommitBanner('체험용 예시 6건이 이미 빅데이터 DB에 반영되어 있습니다.');
            setActiveTab('dashboard');
            return;
        }
        if (saveRecords([...newOnes, ...records])) {
            setCommitBanner(`체험용 원도급사 사고 예시 ${newOnes.length}건을 불러왔습니다. 언제든 삭제·초기화할 수 있습니다.`);
            setActiveTab('dashboard');
        }
    };

    const handleDeleteRecord = (id: string) => {
        const next = records.filter((r) => r.id !== id);
        if (saveRecords(next)) {
            if (selectedRecord?.id === id) {
                setSelectedRecord(null);
                setIsEditingDrawer(false);
                setEditDraft(null);
            }
        }
    };

    const handleOpenDrawer = (record: AccidentBigDataRecord, startInEditMode = false) => {
        setSelectedRecord(record);
        setEditDraft({ ...record });
        setCustomDraftJob(!ACCIDENT_JOB_FIELD_OPTIONS.includes(record.jobField));
        setIsEditingDrawer(startInEditMode);
    };

    const handleSaveEditedRecord = () => {
        if (!editDraft) return;
        const nextList = updateAccidentRecordInList(records, editDraft);
        if (!saveRecords(nextList)) return;
        const savedRecord = nextList.find((item) => item.id === editDraft.id) || editDraft;
        setSelectedRecord(savedRecord);
        setEditDraft({ ...savedRecord });
        setIsEditingDrawer(false);
        setCommitBanner(`'${savedRecord.workTask}' 사례의 수정 내용(공종: ${savedRecord.jobField})이 DB에 반영되었습니다.`);
    };

    const editDraftPiiFindings = useMemo(
        () => (editDraft ? detectAccidentPiiMatches(editDraft) : []),
        [editDraft],
    );

    const selectedCommitCount = auditQueue.filter((item) => item.selected).length;
    const anyPiiRemaining = auditQueue.some((item) => item.piiFindings.length > 0);
    const activeStep = auditQueue.length > 0 ? 3 : rawInput.trim().length > 0 ? 2 : 1;

    // SVG Trend Chart Geometry (420 x 148 viewBox, dual-layer total + severe)
    const chartPoints = useMemo(() => {
        const trend = analytics.monthlyTrend;
        if (trend.length === 0) {
            return {
                linePath: '',
                areaPath: '',
                severeLinePath: '',
                nodes: [] as Array<{ x: number; y: number; severeY: number; month: string; total: number; severe: number; isPeak: boolean }>,
            };
        }
        const maxVal = Math.max(1, ...trend.map((pt) => pt.total));
        const width = 420;
        const height = 148;
        const padX = 24;
        const padY = 22;
        const usableW = width - padX * 2;
        const usableH = height - padY * 2;

        const nodes = trend.map((pt, idx) => {
            const x = trend.length === 1 ? width / 2 : padX + (usableW * idx) / (trend.length - 1);
            const y = height - padY - (pt.total / maxVal) * usableH;
            const severeY = height - padY - (pt.severe / maxVal) * usableH;
            return {
                x: Math.round(x),
                y: Math.round(y),
                severeY: Math.round(severeY),
                month: pt.month.slice(2),
                total: pt.total,
                severe: pt.severe,
                isPeak: pt.total === maxVal,
            };
        });

        const linePath = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.y}`).join(' ');
        const severeLinePath = nodes.map((n, i) => `${i === 0 ? 'M' : 'L'} ${n.x} ${n.severeY}`).join(' ');
        const areaPath = nodes.length > 0
            ? `${linePath} L ${nodes[nodes.length - 1].x} ${height - padY} L ${nodes[0].x} ${height - padY} Z`
            : '';
        return { linePath, areaPath, severeLinePath, nodes };
    }, [analytics.monthlyTrend]);

    return (
        <div data-psi-screen="accident-bigdata" className="pb-10">
            {/* Hero Banner */}
            <header className="psi-ab-hero">
                <div className="psi-ab-hero-grid" aria-hidden="true" />
                <div className="psi-ab-sweep" aria-hidden="true" />
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                        <span className="psi-ab-hero-pill">
                            <span className="psi-ab-sonar" aria-hidden="true" />
                            <span>추가 토큰 비용 0원 · 유료 Gemini / ChatGPT 변환 연동 DB</span>
                        </span>
                        <h1>원도급사 사고 빅데이터 허브</h1>
                        <p>
                            이미 구독 중인 유료 Gemini · ChatGPT로 서로 다른 원도급사 사고보고서 PDF를 표준화한 뒤,
                            한 번에 끌어와 개인정보 비식별 검증·빅데이터 집계·위험성평가 동종재해 경고까지 자동 연결합니다.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={handleLoadSamples}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-teal-300/40 bg-teal-400/15 px-3.5 py-2 text-xs font-bold text-teal-100 hover:bg-teal-400/25 transition-colors"
                        >
                            <span>체험 예시 6건 불러오기</span>
                        </button>
                        <button
                            type="button"
                            disabled={records.length === 0}
                            onClick={() => triggerDownloadFile(`psi-accident-bigdata-${new Date().toISOString().slice(0, 10)}.json`, exportAccidentRecordsToJson(records), 'application/json;charset=utf-8')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
                        >
                            <span>JSON 내보내기</span>
                        </button>
                        <button
                            type="button"
                            disabled={records.length === 0}
                            onClick={() => triggerDownloadFile(`psi-accident-bigdata-${new Date().toISOString().slice(0, 10)}.csv`, exportAccidentRecordsToCsv(records), 'text/csv;charset=utf-8')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-40 transition-colors"
                        >
                            <span>엑셀(CSV) 저장</span>
                        </button>
                    </div>
                </div>
            </header>

            {storageWarning && (
                <div role="alert" className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-100">
                    {storageWarning}
                </div>
            )}

            {commitBanner && (
                <div role="status" className="psi-ab-rise flex items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-100">
                    <span>{commitBanner}</span>
                    <button
                        type="button"
                        onClick={() => setCommitBanner('')}
                        className="rounded-lg px-2.5 py-1 text-xs font-bold hover:bg-emerald-200/60 dark:hover:bg-emerald-800/60"
                    >
                        닫기
                    </button>
                </div>
            )}

            {/* Main Mode Tabs */}
            <nav className="psi-ab-tabs" role="tablist" aria-label="사고 빅데이터 작업 메뉴">
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'import'}
                    className="psi-ab-tab-btn flex-1 sm:flex-initial"
                    onClick={() => setActiveTab('import')}
                >
                    <span>1. AI 변환 가져오기</span>
                    {auditQueue.length > 0 && <span className="psi-ab-tab-count">{auditQueue.length}</span>}
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'dashboard'}
                    className="psi-ab-tab-btn flex-1 sm:flex-initial"
                    onClick={() => setActiveTab('dashboard')}
                >
                    <span>2. 빅데이터 대시보드</span>
                    <span className="psi-ab-tab-count">{records.length}</span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'archive'}
                    className="psi-ab-tab-btn flex-1 sm:flex-initial"
                    onClick={() => setActiveTab('archive')}
                >
                    <span>3. 누적 사례 보관함</span>
                    <span className="psi-ab-tab-count">{filteredRecords.length}</span>
                </button>
            </nav>

            {/* ================= TAB 1: EXTERNAL AI 3-STEP BRIDGE ================= */}
            {activeTab === 'import' && (
                <div className="flex flex-col gap-5">
                    {/* 3-Step Pipeline Status Bar */}
                    <div className="psi-ab-pipeline-track psi-ab-rise" aria-label="외부 AI 변환 단계">
                        <div className={`psi-ab-step-node ${activeStep === 1 ? 'is-active' : 'is-done'}`}>
                            <span className="psi-ab-step-badge">{activeStep > 1 ? '✓' : '1'}</span>
                            <div className="min-w-0">
                                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">전용 변환 지시문 복사</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">유료 Gemini·ChatGPT에 PDF와 함께 전달</p>
                            </div>
                        </div>
                        <div className={`psi-ab-step-node ${activeStep === 2 ? 'is-active' : activeStep > 2 ? 'is-done' : ''}`}>
                            <span className="psi-ab-step-badge">{activeStep > 2 ? '✓' : '2'}</span>
                            <div className="min-w-0">
                                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">변환 결과 드롭·붙여넣기</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">JSON · CSV 파일 또는 AI 답변 그대로 붙여넣기</p>
                            </div>
                        </div>
                        <div className={`psi-ab-step-node ${activeStep === 3 ? 'is-active' : ''}`}>
                            <span className="psi-ab-step-badge">3</span>
                            <div className="min-w-0">
                                <p className="text-xs font-extrabold text-slate-900 dark:text-slate-100">개인정보 방패 · DB 적재</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300">표준공종 매핑 · 비식별 마스킹 · 중복 차단</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 1 + Step 2 Two-Column Workbench */}
                    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                        {/* STEP 1 CARD */}
                        <section className="psi-ab-card psi-ab-rise psi-ab-rise-d1 flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <span className="inline-block rounded-full bg-teal-50 px-2.5 py-1 text-xs font-extrabold text-teal-800 dark:bg-teal-950/60 dark:text-teal-200">
                                        STEP 1 · 0원 외부 AI 지시문
                                    </span>
                                    <h2 className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">
                                        유료 Gemini / ChatGPT 변환 지시문 만들기
                                    </h2>
                                </div>
                                <span className="rounded-lg border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-200">
                                    보안 팁: 임시 채팅 · 학습 제외 권장
                                </span>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div className="min-w-0">
                                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        사용 중인 유료 AI
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setProvider('gemini')}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${provider === 'gemini'
                                                ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            Gemini 유료
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProvider('chatgpt')}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${provider === 'chatgpt'
                                                ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            ChatGPT 유료
                                        </button>
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        변환 출력 형식
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setOutputFormat('json')}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${outputFormat === 'json'
                                                ? 'border-slate-900 bg-slate-900 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            JSON (정확도 최상)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setOutputFormat('csv')}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${outputFormat === 'csv'
                                                ? 'border-slate-900 bg-slate-900 text-white dark:border-sky-400 dark:bg-sky-500 dark:text-slate-950'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            CSV 표 형식
                                        </button>
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <label htmlFor="ab-contractor-hint" className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        원도급사명 힌트 (선택)
                                    </label>
                                    <input
                                        id="ab-contractor-hint"
                                        type="text"
                                        value={contractorHint}
                                        onChange={(e) => setContractorHint(e.target.value)}
                                        placeholder="예: 현대/삼성/GS/포스코 등"
                                        className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                    />
                                </div>

                                <div className="min-w-0">
                                    <label htmlFor="ab-site-hint" className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        현장명 힌트 (선택)
                                    </label>
                                    <input
                                        id="ab-site-hint"
                                        type="text"
                                        value={siteHint}
                                        onChange={(e) => setSiteHint(e.target.value)}
                                        placeholder="예: 수도권 2공구 신축공사"
                                        className="w-full min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={handleCopyPrompt}
                                    className={`psi-ab-cta ${copiedPrompt ? 'is-copied' : ''}`}
                                >
                                    <span>{copiedPrompt ? '✓ 변환 지시문이 복사되었습니다!' : '전용 변환 지시문 복사하기'}</span>
                                </button>
                                <a
                                    href={provider === 'chatgpt' ? 'https://chatgpt.com/' : 'https://gemini.google.com/app'}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                                >
                                    <span>{provider === 'chatgpt' ? 'ChatGPT 바로 열기 ↗' : 'Gemini 바로 열기 ↗'}</span>
                                </a>
                                <button
                                    type="button"
                                    onClick={() => setShowPromptPreview((prev) => !prev)}
                                    className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    <span>{showPromptPreview ? '지시문 접기' : '지시문 내용 미리보기'}</span>
                                </button>
                            </div>

                            {showPromptPreview && (
                                <pre className="max-h-60 overflow-auto rounded-xl border border-slate-200 bg-slate-950 p-3.5 text-xs leading-relaxed text-slate-100">
                                    {generatedPrompt}
                                </pre>
                            )}
                        </section>

                        {/* STEP 2 CARD */}
                        <section className="psi-ab-card psi-ab-rise psi-ab-rise-d2 flex flex-col gap-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <span className="inline-block rounded-full bg-sky-50 px-2.5 py-1 text-xs font-extrabold text-sky-800 dark:bg-sky-950/60 dark:text-sky-200">
                                        STEP 2 · 결과물 가져오기
                                    </span>
                                    <h2 className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">
                                        AI가 만든 결과 붙여넣기 또는 파일 드롭
                                    </h2>
                                </div>
                                {detectedPasteFormat && (
                                    <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-extrabold text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/50 dark:text-teal-200">
                                        {detectedPasteFormat}
                                    </span>
                                )}
                            </div>

                            <div
                                className={`psi-ab-dropzone ${isDragging ? 'is-dragging' : ''}`}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    setIsDragging(true);
                                }}
                                onDragLeave={() => setIsDragging(false)}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    setIsDragging(false);
                                    const droppedFile = e.dataTransfer.files?.[0];
                                    if (droppedFile) void handleFileUpload(droppedFile);
                                }}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="psi-ab-dropzone-icon grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
                                            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                            </svg>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                                                변환된 파일(.json · .csv · .txt)을 여기로 끌어오세요
                                            </p>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                AI 답변 앞뒤에 설명 문장이 섞여 있어도 핵심 표·데이터만 자동 추출합니다.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json,.csv,.tsv,.txt"
                                        className="hidden"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) void handleFileUpload(file);
                                            e.target.value = '';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        파일 직접 선택
                                    </button>
                                </div>

                                <textarea
                                    value={rawInput}
                                    onChange={(e) => setRawInput(e.target.value)}
                                    rows={6}
                                    placeholder="또는 Gemini · ChatGPT 답변창에서 복사한 JSON / CSV 결과를 여기에 그대로 붙여넣기(Ctrl+V) 하세요..."
                                    aria-label="AI 변환 결과 붙여넣기"
                                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white/90 p-3 font-mono text-xs leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
                                />
                            </div>

                            <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                    type="button"
                                    disabled={!rawInput.trim()}
                                    onClick={() => runParseAndAudit(rawInput)}
                                    className="psi-ab-cta disabled:opacity-45"
                                >
                                    <span>자동 분석 및 사전 검수 실행</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRawInput(SAMPLE_PASTE_JSON);
                                        runParseAndAudit(SAMPLE_PASTE_JSON);
                                    }}
                                    className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    변환 예시로 바로 테스트
                                </button>
                                {rawInput.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRawInput('');
                                            setAuditQueue([]);
                                            setParseNotice(null);
                                        }}
                                        className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                    >
                                        입력 비우기
                                    </button>
                                )}
                            </div>

                            {parseNotice && (
                                <div
                                    role="status"
                                    className={`rounded-xl border px-3.5 py-2.5 text-xs font-bold ${
                                        parseNotice.tone === 'error'
                                            ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-100'
                                            : parseNotice.tone === 'warn'
                                                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/50 dark:text-amber-100'
                                                : 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-100'
                                    }`}
                                >
                                    {parseNotice.text}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* STEP 3 CARD: PRE-COMMIT AUDIT QUEUE */}
                    {auditQueue.length > 0 && (
                        <section className="psi-ab-card psi-ab-rise flex flex-col gap-4 border-teal-500/35">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <span className="inline-block rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-extrabold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200">
                                        STEP 3 · 적재 전 자동 검수 · 개인정보 보호
                                    </span>
                                    <h2 className="mt-1.5 text-lg font-extrabold text-slate-900 dark:text-white">
                                        표준화 및 비식별 확인 ({selectedCommitCount}/{auditQueue.length}건 반영 예정)
                                    </h2>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {anyPiiRemaining && (
                                        <button
                                            type="button"
                                            onClick={handleMaskAllCandidates}
                                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-amber-400 bg-amber-500 px-3.5 text-xs font-extrabold text-slate-950 hover:bg-amber-400 transition-colors"
                                        >
                                            <span>감지된 개인정보 일괄 가리기</span>
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        disabled={selectedCommitCount === 0}
                                        onClick={handleCommitSelected}
                                        className="psi-ab-cta disabled:opacity-45"
                                    >
                                        <span>선택 {selectedCommitCount}건 빅데이터 DB 반영하기</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {auditQueue.map((cand) => (
                                    <article
                                        key={cand.candidateId}
                                        className={`rounded-2xl border p-4 transition-colors ${
                                            cand.selected
                                                ? 'border-teal-500/40 bg-slate-50/70 dark:bg-slate-900/70'
                                                : 'border-slate-200 bg-slate-100/60 opacity-75 dark:border-slate-800 dark:bg-slate-900/30'
                                        }`}
                                    >
                                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3 dark:border-slate-800">
                                            <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-extrabold text-slate-900 dark:text-white">
                                                <input
                                                    type="checkbox"
                                                    checked={cand.selected}
                                                    onChange={() => handleToggleCandidate(cand.candidateId)}
                                                    className="h-4 w-4 rounded accent-teal-600"
                                                />
                                                <span>{cand.record.occurredDate} · {cand.record.sourceContractor}</span>
                                            </label>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-xs font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                                                    항목 충실도 {cand.completenessPct}%
                                                </span>
                                                {cand.piiFindings.length > 0 ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleMaskSingleCandidate(cand.candidateId)}
                                                        className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-xs font-extrabold text-rose-800 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-950/60 dark:text-rose-200"
                                                    >
                                                        개인정보 감지({cand.piiFindings.join(', ')}) · 클릭해 가리기
                                                    </button>
                                                ) : (
                                                    <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-extrabold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-950/60 dark:text-emerald-200">
                                                        비식별 안전 확인
                                                    </span>
                                                )}
                                                {cand.isDuplicate && (
                                                    <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200">
                                                        중복 의심(자동 선택 해제됨)
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">원도급사</label>
                                                <input
                                                    type="text"
                                                    value={cand.record.sourceContractor}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'sourceContractor', e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">공종 (골조특화 · 직접입력 가능)</label>
                                                <select
                                                    value={customCandidateJobs[cand.candidateId] || !ACCIDENT_JOB_FIELD_OPTIONS.includes(cand.record.jobField) ? '__custom__' : cand.record.jobField}
                                                    onChange={(e) => {
                                                        if (e.target.value === '__custom__') {
                                                            setCustomCandidateJobs((prev) => ({ ...prev, [cand.candidateId]: true }));
                                                            return;
                                                        }
                                                        setCustomCandidateJobs((prev) => ({ ...prev, [cand.candidateId]: false }));
                                                        handleUpdateCandidateField(cand.candidateId, 'jobField', e.target.value);
                                                    }}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                >
                                                    {ACCIDENT_JOB_FIELD_OPTIONS.map((job) => (
                                                        <option key={job} value={job}>{job}</option>
                                                    ))}
                                                    <option value="__custom__">+ 직접 입력...</option>
                                                </select>
                                                {(customCandidateJobs[cand.candidateId] || !ACCIDENT_JOB_FIELD_OPTIONS.includes(cand.record.jobField)) && (
                                                    <input
                                                        type="text"
                                                        value={cand.record.jobField}
                                                        onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'jobField', e.target.value)}
                                                        placeholder="예: 해체정리, PC조립..."
                                                        className="mt-1.5 w-full min-h-[36px] rounded-lg border border-teal-400 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                                                    />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">12대 재해유형</label>
                                                <select
                                                    value={cand.record.hazardType}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'hazardType', e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                >
                                                    {HAZARD_OPTIONS.map((hazard) => (
                                                        <option key={hazard} value={hazard}>{hazard}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">심각도 (5단계)</label>
                                                <select
                                                    value={cand.record.severity}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'severity', e.target.value as AccidentSeverity)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                >
                                                    {SEVERITY_OPTIONS.map((sev) => (
                                                        <option key={sev} value={sev}>{sev}</option>
                                                    ))}
                                                </select>
                                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                    {ACCIDENT_SEVERITY_META[cand.record.severity]?.criteria}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">사고 개요</label>
                                                <input
                                                    type="text"
                                                    value={cand.record.summary}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'summary', e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">재발방지대책</label>
                                                <input
                                                    type="text"
                                                    value={cand.record.preventionMeasure}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'preventionMeasure', e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                />
                                            </div>
                                        </div>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {/* ================= TAB 2: BIG-DATA DASHBOARD (0 WON DB ANALYTICS) ================= */}
            {activeTab === 'dashboard' && (
                <div className="flex flex-col gap-5">
                    {/* Filter Bar */}
                    <section className="psi-ab-card flex flex-wrap items-end gap-3">
                        <div className="min-w-[160px] flex-1">
                            <label htmlFor="ab-filter-contractor" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                원도급사 필터
                            </label>
                            <select
                                id="ab-filter-contractor"
                                value={contractorFilter}
                                onChange={(e) => setContractorFilter(e.target.value)}
                                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                {contractorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div className="min-w-[150px] flex-1">
                            <label htmlFor="ab-filter-severity" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                심각도
                            </label>
                            <select
                                id="ab-filter-severity"
                                value={severityFilter}
                                onChange={(e) => setSeverityFilter(e.target.value)}
                                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="전체">전체 등급</option>
                                {SEVERITY_OPTIONS.map((sev) => <option key={sev} value={sev}>{sev}</option>)}
                            </select>
                        </div>
                        <div className="min-w-[200px] flex-[2]">
                            <label htmlFor="ab-filter-search" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                키워드 검색 (공종·기인물·원인)
                            </label>
                            <input
                                id="ab-filter-search"
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="예: 알폼, 안전대, 유도봉, 굴착..."
                                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                        </div>
                        {(contractorFilter !== '전체' || severityFilter !== '전체' || hazardFilter !== '전체' || jobFieldFilter !== '전체' || searchQuery) && (
                            <button
                                type="button"
                                onClick={() => {
                                    setContractorFilter('전체');
                                    setSeverityFilter('전체');
                                    setHazardFilter('전체');
                                    setJobFieldFilter('전체');
                                    setSearchQuery('');
                                }}
                                className="min-h-[40px] rounded-xl border border-slate-300 px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                            >
                                필터 초기화
                            </button>
                        )}
                    </section>

                    {records.length === 0 ? (
                        <section className="psi-ab-card psi-ab-rise flex flex-col items-center justify-center gap-4 py-12 text-center">
                            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-teal-600/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300">
                                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
                                </svg>
                            </div>
                            <div className="max-w-md space-y-1.5">
                                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                    아직 축적된 사고 빅데이터가 없습니다
                                </h2>
                                <p className="text-sm text-slate-600 dark:text-slate-300">
                                    유료 Gemini · ChatGPT로 변환한 원도급사 사고보고서를 가져오거나, 상단의 체험 예시 6건을 불러와 빅데이터 분석 화면을 바로 확인해 보세요.
                                </p>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2.5">
                                <button type="button" onClick={() => setActiveTab('import')} className="psi-ab-cta">
                                    AI 변환 가져오기 시작하기
                                </button>
                                <button
                                    type="button"
                                    onClick={handleLoadSamples}
                                    className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                >
                                    체험 예시 6건 먼저 보기
                                </button>
                            </div>
                        </section>
                    ) : (
                        <>
                            {/* 4 Animated KPI Cards */}
                            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                <article className="psi-ab-card psi-ab-rise">
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">누적 사고 사례</p>
                                    <p className="mt-2 text-3xl font-black tracking-tight text-slate-900 tabular-nums dark:text-white">
                                        {animatedTotal}건
                                    </p>
                                    <p className="mt-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
                                        {animatedContractors}개 원도급사 양식 표준화 완료
                                    </p>
                                </article>
                                <article className="psi-ab-card psi-ab-rise psi-ab-rise-d1">
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">산재보고(3일↑ 휴업) 이상 비중</p>
                                    <p className="mt-2 text-3xl font-black tracking-tight text-rose-600 tabular-nums dark:text-rose-400">
                                        {animatedReportableRate}%
                                    </p>
                                    <p className="mt-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                                        장기·중대 {analytics.severeCount}건 ({animatedSevereRate}%) · 아차 {animatedNearMiss}건
                                    </p>
                                </article>
                                <article className="psi-ab-card psi-ab-rise psi-ab-rise-d2">
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">최다 사고 공종</p>
                                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                                        {analytics.topJobField?.label || '집계중'}
                                    </p>
                                    <p className="mt-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                                        {analytics.topJobField ? `${analytics.topJobField.count}건 (${analytics.topJobField.sharePct}%)` : '데이터 대기'}
                                    </p>
                                </article>
                                <article className="psi-ab-card psi-ab-rise psi-ab-rise-d3">
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">최다 재해유형 (12대)</p>
                                    <p className="mt-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                                        {analytics.topHazardType?.label || '집계중'}
                                    </p>
                                    <p className="mt-1.5 text-xs font-semibold text-sky-700 dark:text-sky-300">
                                        {analytics.topHazardType ? `${analytics.topHazardType.count}건 (${analytics.topHazardType.sharePct}%)` : '데이터 대기'}
                                    </p>
                                </article>
                            </section>

                            {/* Signature Graphic-Art Row 1: Kinetic Heinrich Pyramid + Animated Segmented Donut */}
                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                하인리히 5단계 심각도 피라미드
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                아차사고 · 경미(응급) · 휴업(3일↑) · 중상(4주↑) · 중대재해 구조 (단계 클릭 시 필터링)
                                            </p>
                                        </div>
                                    </div>
                                    <div className="psi-ab-pyramid">
                                        {analytics.severityPyramid.map((tier, idx) => {
                                            const widthPercent = [48, 61, 74, 87, 100][idx] ?? 100;
                                            return (
                                                <button
                                                    key={tier.severity}
                                                    type="button"
                                                    onClick={() => {
                                                        setSeverityFilter(tier.severity);
                                                        setActiveTab('archive');
                                                    }}
                                                    style={{ width: `${widthPercent}%`, borderLeftWidth: '5px', borderLeftColor: tier.color }}
                                                    className="psi-ab-pyramid-tier text-left"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-extrabold text-slate-900 dark:text-white">
                                                            {tier.severity}
                                                        </p>
                                                        <p className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
                                                            {tier.criteria}
                                                        </p>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <span className="text-sm font-black tabular-nums" style={{ color: tier.color }}>
                                                            {tier.count}건
                                                        </span>
                                                        <span className="ml-1 text-xs font-bold text-slate-500 tabular-nums dark:text-slate-400">
                                                            ({tier.sharePct}%)
                                                        </span>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>

                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                심각도 링 게이지 & 기준표
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                현장 실무(경미↔휴업↔장기입원) 경계를 한눈에 구분합니다
                                            </p>
                                        </div>
                                        <span className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-extrabold text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/60 dark:text-amber-200">
                                            산재보고 대상 {analytics.reportableCount}건
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-center gap-5 sm:flex-row">
                                        <div className="relative h-40 w-40 shrink-0">
                                            <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label="심각도 5단계 도넛 그래프">
                                                <circle cx="70" cy="70" r="52" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="18" />
                                                {donutSegments.map((seg) => (
                                                    <circle
                                                        key={seg.severity}
                                                        cx="70"
                                                        cy="70"
                                                        r={seg.radius}
                                                        fill="none"
                                                        stroke={seg.color}
                                                        strokeWidth="18"
                                                        strokeDasharray={seg.dashArray}
                                                        strokeDashoffset={seg.dashOffset}
                                                        className="psi-ab-donut-seg"
                                                        onClick={() => {
                                                            setSeverityFilter(seg.severity);
                                                            setActiveTab('archive');
                                                        }}
                                                    />
                                                ))}
                                            </svg>
                                            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">산재이상</span>
                                                <span className="text-2xl font-black text-slate-900 tabular-nums dark:text-white">
                                                    {animatedReportableRate}%
                                                </span>
                                            </div>
                                        </div>
                                        <ul className="grid flex-1 grid-cols-1 gap-2 min-w-0 w-full">
                                            {analytics.severityPyramid.map((tier) => (
                                                <li key={tier.severity}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSeverityFilter(tier.severity);
                                                            setActiveTab('archive');
                                                        }}
                                                        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 text-left hover:border-teal-500/40 dark:border-slate-800 dark:bg-slate-900/60"
                                                    >
                                                        <span className="flex items-center gap-2 min-w-0">
                                                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: tier.color }} />
                                                            <span className="truncate text-xs font-extrabold text-slate-900 dark:text-slate-100">
                                                                {tier.severity}
                                                            </span>
                                                        </span>
                                                        <span className="shrink-0 text-xs font-extrabold tabular-nums text-slate-700 dark:text-slate-200">
                                                            {tier.count}건 ({tier.sharePct}%)
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </section>
                            </div>

                            {/* Signature Graphic-Art Row 2: Trade x Hazard Heatmap + Circadian Rhythm Chart */}
                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                공종 × 재해유형 위험 히트맵
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                강조된 교차 칸을 누르면 해당 공종·재해유형 사례만 바로 모아봅니다
                                            </p>
                                        </div>
                                    </div>
                                    {analytics.riskMatrix.trades.length > 0 && analytics.riskMatrix.hazards.length > 0 ? (
                                        <div className="overflow-x-auto pb-1">
                                            <div
                                                className="psi-ab-matrix-grid min-w-[420px]"
                                                style={{
                                                    gridTemplateColumns: `88px repeat(${analytics.riskMatrix.hazards.length}, minmax(0, 1fr))`,
                                                }}
                                            >
                                                <div />
                                                {analytics.riskMatrix.hazards.map((hazard) => (
                                                    <div key={hazard} className="px-1 text-center text-xs font-extrabold text-slate-600 dark:text-slate-300">
                                                        {hazard}
                                                    </div>
                                                ))}
                                                {analytics.riskMatrix.trades.map((trade) => (
                                                    <React.Fragment key={trade}>
                                                        <div className="flex items-center pr-2 text-xs font-extrabold text-slate-800 dark:text-slate-100">
                                                            {trade}
                                                        </div>
                                                        {analytics.riskMatrix.hazards.map((hazard) => {
                                                            const cell = analytics.riskMatrix.cells.find(
                                                                (c) => c.trade === trade && c.hazard === hazard,
                                                            );
                                                            const count = cell?.count || 0;
                                                            const intensity = cell?.intensity || 0;
                                                            const cellStyle =
                                                                intensity === 3
                                                                    ? 'psi-ab-hotspot-hot border-rose-400/70 bg-rose-500/20 text-rose-900 dark:bg-rose-500/30 dark:text-rose-100 is-clickable'
                                                                    : intensity === 2
                                                                        ? 'border-amber-400/70 bg-amber-500/20 text-amber-900 dark:bg-amber-500/30 dark:text-amber-100 is-clickable'
                                                                        : intensity === 1
                                                                            ? 'border-teal-400/60 bg-teal-500/15 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100 is-clickable'
                                                                            : 'border-slate-200/60 bg-slate-100/50 text-slate-400 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-600';
                                                            return (
                                                                <button
                                                                    key={`${trade}-${hazard}`}
                                                                    type="button"
                                                                    disabled={count === 0}
                                                                    onClick={() => {
                                                                        setJobFieldFilter(trade);
                                                                        setHazardFilter(hazard);
                                                                        setActiveTab('archive');
                                                                    }}
                                                                    className={`psi-ab-matrix-cell ${cellStyle}`}
                                                                >
                                                                    <span>{count > 0 ? `${count}건` : '-'}</span>
                                                                    {cell && cell.severeCount > 0 && (
                                                                        <span className="text-[10px] font-bold">중상↑{cell.severeCount}</span>
                                                                    )}
                                                                </button>
                                                            );
                                                        })}
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">히트맵을 생성할 데이터가 부족합니다.</p>
                                    )}
                                </section>

                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                작업 시간대별 사고 리듬
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                하루 작업 흐름(작업전 · 오전 · 점심직후 · 오후 · 야간) 중 피크 시간대를 포착합니다
                                            </p>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-5 gap-2.5 pt-2">
                                        {analytics.timeSlotDistribution.map((item) => {
                                            const heightPct = item.count === 0 ? 8 : Math.max(18, item.sharePct);
                                            return (
                                                <div key={item.slot} className="flex flex-col items-center gap-2 text-center">
                                                    <div className="psi-ab-pillar-wrap">
                                                        <div
                                                            className={`psi-ab-pillar ${
                                                                item.isPeak
                                                                    ? 'bg-gradient-to-t from-rose-600 to-amber-400 psi-ab-hotspot-hot'
                                                                    : 'bg-gradient-to-t from-teal-700 to-cyan-400'
                                                            }`}
                                                            style={{ height: `${heightPct}%` }}
                                                        />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-extrabold text-slate-900 tabular-nums dark:text-white">
                                                            {item.count}건
                                                        </p>
                                                        <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                                            {item.slot}
                                                        </p>
                                                        {item.isPeak && (
                                                            <span className="mt-0.5 inline-block rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                                                                집중 주의
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            </div>

                            {/* NEW-PSI Risk Assessment Cross-Link Alerts */}
                            {analytics.crossLinkAlerts.length > 0 && (
                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                위험성평가 기록지 동종재해 교차 경보
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                원도급사 사고 DB와 현재 현장 근로자 위험성평가 점수(총 {workerRecords.length}건)를 자동 대조한 결과입니다.
                                            </p>
                                        </div>
                                        {onNavigateToPage && (
                                            <div className="flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigateToPage('ocr-analysis')}
                                                    className="min-h-[38px] rounded-xl border border-teal-500/40 bg-teal-50 px-3 text-xs font-extrabold text-teal-900 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-200"
                                                >
                                                    위험성평가 분석 바로가기 →
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigateToPage('a4-education-material')}
                                                    className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                                >
                                                    교육자료 제작 연결 →
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                        {analytics.crossLinkAlerts.map((alert) => (
                                            <article
                                                key={alert.jobField}
                                                className="rounded-2xl border border-amber-300/60 bg-amber-50/50 p-3.5 dark:border-amber-500/30 dark:bg-amber-950/25"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                                        {alert.jobField} 공종 · 주 위험 [{alert.topHazard}]
                                                    </span>
                                                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-extrabold text-rose-800 dark:bg-rose-950 dark:text-rose-200">
                                                        사고 {alert.accidentCount}건 (중상·중대 {alert.severeCount}건)
                                                    </span>
                                                </div>
                                                <p className="mt-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                                                    {alert.reasonSummary}
                                                </p>
                                                {alert.checkpoints.length > 0 && (
                                                    <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                                                        {alert.checkpoints.map((cp) => (
                                                            <li key={cp}>• {cp}</li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                </section>
                            )}

                            {/* 2-Column Visual Analytics */}
                            <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                                {/* Hazard Bars */}
                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                            12대 재해유형 분포
                                        </h2>
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            막대 클릭 시 보관함 필터링
                                        </span>
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                        {analytics.hazardDistribution.map((bucket) => (
                                            <button
                                                key={bucket.label}
                                                type="button"
                                                onClick={() => {
                                                    setHazardFilter(bucket.label);
                                                    setActiveTab('archive');
                                                }}
                                                className="group flex flex-col gap-1.5 rounded-xl p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                            >
                                                <div className="flex items-center justify-between text-xs font-bold">
                                                    <span className="text-slate-900 dark:text-slate-100">{bucket.label}</span>
                                                    <span className="tabular-nums text-slate-600 dark:text-slate-300">
                                                        {bucket.count}건 ({bucket.sharePct}%) {bucket.severeCount > 0 ? `· 중점 ${bucket.severeCount}건` : ''}
                                                    </span>
                                                </div>
                                                <div className="psi-ab-bar-track">
                                                    <div
                                                        className="psi-ab-bar-fill bg-gradient-to-r from-teal-600 to-cyan-500"
                                                        style={{ width: `${Math.max(8, bucket.sharePct)}%` }}
                                                    />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </section>

                                {/* Monthly SVG Kinetic Trend + Trade Bars */}
                                <div className="flex flex-col gap-5">
                                    <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                월별 사고 발생 추이 (전체 vs 장기·중대)
                                            </h2>
                                            <div className="flex items-center gap-3 text-xs font-bold">
                                                <span className="inline-flex items-center gap-1 text-teal-700 dark:text-teal-300">
                                                    <span className="h-2 w-2 rounded-full bg-teal-600" />전체
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                                                    <span className="h-2 w-2 rounded-full bg-rose-600" />중상·중대
                                                </span>
                                            </div>
                                        </div>
                                        {chartPoints.nodes.length > 0 && (
                                            <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-950/60">
                                                <svg viewBox="0 0 420 148" className="h-36 w-full" role="img" aria-label="월별 사고 발생 건수 및 중상중대 추이 그래프">
                                                    <defs>
                                                        <linearGradient id="psiAbAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.32" />
                                                            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0.02" />
                                                        </linearGradient>
                                                    </defs>
                                                    <line x1="24" y1="126" x2="396" y2="126" stroke="currentColor" strokeOpacity="0.16" strokeWidth="1" />
                                                    {chartPoints.areaPath && (
                                                        <path d={chartPoints.areaPath} fill="url(#psiAbAreaGrad)" />
                                                    )}
                                                    {chartPoints.linePath && (
                                                        <path
                                                            d={chartPoints.linePath}
                                                            fill="none"
                                                            stroke="#0f766e"
                                                            strokeWidth="3"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            className="psi-ab-trend-path"
                                                        />
                                                    )}
                                                    {chartPoints.severeLinePath && (
                                                        <path
                                                            d={chartPoints.severeLinePath}
                                                            fill="none"
                                                            stroke="#e11d48"
                                                            strokeWidth="2.2"
                                                            strokeDasharray="5 4"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                        />
                                                    )}
                                                    {chartPoints.nodes.map((node) => (
                                                        <g key={node.month}>
                                                            {node.isPeak && (
                                                                <circle cx={node.x} cy={node.y} r="9" fill="#14b8a6" className="psi-ab-peak-halo" />
                                                            )}
                                                            <circle cx={node.x} cy={node.y} r="4.5" fill="#ffffff" stroke="#0f766e" strokeWidth="2.5" />
                                                            {node.severe > 0 && (
                                                                <circle cx={node.x} cy={node.severeY} r="3.5" fill="#e11d48" stroke="#ffffff" strokeWidth="1.5" />
                                                            )}
                                                            <text x={node.x} y={Math.max(12, node.y - 10)} textAnchor="middle" fontSize="11" fontWeight="800" fill="currentColor">
                                                                {node.total}
                                                            </text>
                                                            <text x={node.x} y="143" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" opacity="0.7">
                                                                {node.month}
                                                            </text>
                                                        </g>
                                                    ))}
                                                </svg>
                                            </div>
                                        )}
                                    </section>

                                    <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                공종별 사고 집중도 TOP 5
                                            </h2>
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                클릭 시 보관함 이동
                                            </span>
                                        </div>
                                        <div className="flex flex-col gap-2.5">
                                            {analytics.jobFieldDistribution.slice(0, 5).map((job) => (
                                                <button
                                                    key={job.label}
                                                    type="button"
                                                    onClick={() => {
                                                        setJobFieldFilter(job.label);
                                                        setActiveTab('archive');
                                                    }}
                                                    className="flex flex-col gap-1 rounded-xl p-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                                                >
                                                    <div className="flex w-full items-center justify-between text-xs font-bold">
                                                        <span>{job.label}</span>
                                                        <span className="tabular-nums text-slate-600 dark:text-slate-300">
                                                            {job.count}건 ({job.sharePct}%)
                                                        </span>
                                                    </div>
                                                    <div className="psi-ab-bar-track w-full">
                                                        <div
                                                            className="psi-ab-bar-fill bg-gradient-to-r from-amber-500 to-rose-500"
                                                            style={{ width: `${Math.max(8, job.sharePct)}%` }}
                                                        />
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </section>
                                </div>
                            </div>

                            {/* Root Cause & Causing Agent Top 5 */}
                            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <section className="psi-ab-card psi-ab-rise">
                                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">반복 근본·관리적 원인</h2>
                                    <ul className="mt-3 space-y-2 text-xs">
                                        {analytics.rootCauseTop5.map((item, idx) => (
                                            <li key={item.label} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                                    {idx + 1}. {item.label}
                                                </span>
                                                <span className="shrink-0 font-extrabold text-teal-700 dark:text-teal-300">{item.count}건</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                                <section className="psi-ab-card psi-ab-rise">
                                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">주요 기인물 · 장비 · 자재</h2>
                                    <ul className="mt-3 space-y-2 text-xs">
                                        {analytics.causingAgentTop5.map((item, idx) => (
                                            <li key={item.label} className="flex items-start justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/60">
                                                <span className="font-semibold text-slate-800 dark:text-slate-100">
                                                    {idx + 1}. {item.label}
                                                </span>
                                                <span className="shrink-0 font-extrabold text-amber-700 dark:text-amber-300">{item.count}건</span>
                                            </li>
                                        ))}
                                    </ul>
                                </section>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ================= TAB 3: ARCHIVE & INSPECTOR DRAWER ================= */}
            {activeTab === 'archive' && (
                <section className="psi-ab-card psi-ab-rise flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                                누적 원도급사 사고 사례 ({filteredRecords.length}건)
                            </h2>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                카드를 누르면 직접원인·근본원인·재발방지대책·작업 전 필수 점검 전체를 확인할 수 있습니다.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            {jobFieldFilter !== '전체' && (
                                <button
                                    type="button"
                                    onClick={() => setJobFieldFilter('전체')}
                                    className="min-h-[38px] rounded-xl border border-teal-400 bg-teal-50 px-3 text-xs font-extrabold text-teal-900 dark:bg-teal-950/60 dark:text-teal-200"
                                >
                                    공종: {jobFieldFilter} ✕
                                </button>
                            )}
                            {hazardFilter !== '전체' && (
                                <button
                                    type="button"
                                    onClick={() => setHazardFilter('전체')}
                                    className="min-h-[38px] rounded-xl border border-sky-400 bg-sky-50 px-3 text-xs font-extrabold text-sky-900 dark:bg-sky-950/60 dark:text-sky-200"
                                >
                                    재해유형: {hazardFilter} ✕
                                </button>
                            )}
                            <input
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="사례 검색..."
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            {records.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (confirm(`누적 사고 빅데이터 ${records.length}건을 모두 비울까요?`)) {
                                            saveRecords([]);
                                        }
                                    }}
                                    className="min-h-[38px] rounded-xl border border-rose-300 px-3 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300 dark:hover:bg-rose-950/40"
                                >
                                    전체 비우기
                                </button>
                            )}
                        </div>
                    </div>

                    {filteredRecords.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            조건에 맞는 사고 사례가 없습니다.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {filteredRecords.map((rec) => (
                                <article
                                    key={rec.id}
                                    className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-teal-500/50 dark:border-slate-800 dark:bg-slate-900/60"
                                >
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                                {rec.occurredDate} · {rec.sourceContractor}
                                            </span>
                                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${SEVERITY_BADGE_MAP[rec.severity]}`}>
                                                {rec.severity}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                                            [{rec.jobField} · {rec.hazardType}] {rec.workTask}
                                        </h3>
                                        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                                            {rec.summary}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-2.5 dark:border-slate-800">
                                        <span className="text-xs font-semibold text-teal-700 dark:text-teal-300">
                                            대책: {rec.preventionMeasure.slice(0, 32)}{rec.preventionMeasure.length > 32 ? '...' : ''}
                                        </span>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => handleOpenDrawer(rec, true)}
                                                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                                            >
                                                수정
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleOpenDrawer(rec, false)}
                                                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700 dark:bg-teal-600 dark:hover:bg-teal-500"
                                            >
                                                상세 보기
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* ================= SLIDE-OVER DETAIL & EDIT DRAWER ================= */}
            {selectedRecord && (
                <div
                    className="fixed inset-0 z-[10001] flex justify-end bg-slate-950/55 backdrop-blur-xs"
                    role="presentation"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setSelectedRecord(null);
                            setIsEditingDrawer(false);
                        }
                    }}
                >
                    <aside
                        role="dialog"
                        aria-modal="true"
                        aria-label={isEditingDrawer ? '사고 사례 수정' : '사고 사례 상세 분석'}
                        className="psi-ab-drawer flex h-full w-full max-w-xl flex-col gap-4 overflow-y-auto bg-white p-6 text-slate-900 dark:bg-slate-900 dark:text-slate-100"
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-800">
                            <div>
                                <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${SEVERITY_BADGE_MAP[selectedRecord.severity]}`}>
                                    {selectedRecord.severity} · {selectedRecord.jobField} · {selectedRecord.hazardType}
                                </span>
                                <h2 className="mt-2 text-lg font-extrabold">
                                    {isEditingDrawer ? '사고 사례 내용 수정' : selectedRecord.workTask}
                                </h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                    {selectedRecord.occurredDate} ({selectedRecord.timeSlot}) · {selectedRecord.sourceContractor} · {selectedRecord.siteName}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                {!isEditingDrawer ? (
                                    <button
                                        type="button"
                                        onClick={() => handleOpenDrawer(selectedRecord, true)}
                                        className="rounded-xl border border-teal-500/40 bg-teal-50 px-3 py-1.5 text-xs font-extrabold text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-200"
                                    >
                                        수정하기
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditDraft({ ...selectedRecord });
                                            setIsEditingDrawer(false);
                                        }}
                                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                        편집 취소
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedRecord(null);
                                        setIsEditingDrawer(false);
                                    }}
                                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                >
                                    닫기
                                </button>
                            </div>
                        </div>

                        {isEditingDrawer && editDraft ? (
                            <form
                                className="flex flex-1 flex-col gap-3.5 text-xs"
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    handleSaveEditedRecord();
                                }}
                            >
                                {editDraftPiiFindings.length > 0 && (
                                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-rose-900 dark:border-rose-500/40 dark:bg-rose-950/50 dark:text-rose-100">
                                        <span className="font-bold">
                                            개인정보 감지({editDraftPiiFindings.join(', ')})
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => setEditDraft((prev) => (prev ? maskAccidentRecordPii(prev) : prev))}
                                            className="rounded-lg bg-rose-600 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-rose-500"
                                        >
                                            자동 가리기
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">발생일자</label>
                                        <input
                                            type="date"
                                            value={editDraft.occurredDate}
                                            onChange={(e) => setEditDraft({ ...editDraft, occurredDate: e.target.value })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">시간대</label>
                                        <select
                                            value={editDraft.timeSlot}
                                            onChange={(e) => setEditDraft({ ...editDraft, timeSlot: e.target.value as AccidentTimeSlot })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {TIME_SLOT_OPTIONS.map((slot) => (
                                                <option key={slot} value={slot}>{slot}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">원도급사</label>
                                        <input
                                            type="text"
                                            value={editDraft.sourceContractor}
                                            onChange={(e) => setEditDraft({ ...editDraft, sourceContractor: e.target.value })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">현장명</label>
                                        <input
                                            type="text"
                                            value={editDraft.siteName}
                                            onChange={(e) => setEditDraft({ ...editDraft, siteName: e.target.value })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">공종 (골조특화 · 직접입력)</label>
                                        <select
                                            value={customDraftJob || !ACCIDENT_JOB_FIELD_OPTIONS.includes(editDraft.jobField) ? '__custom__' : editDraft.jobField}
                                            onChange={(e) => {
                                                if (e.target.value === '__custom__') {
                                                    setCustomDraftJob(true);
                                                    return;
                                                }
                                                setCustomDraftJob(false);
                                                setEditDraft({ ...editDraft, jobField: e.target.value });
                                            }}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {ACCIDENT_JOB_FIELD_OPTIONS.map((job) => (
                                                <option key={job} value={job}>{job}</option>
                                            ))}
                                            <option value="__custom__">+ 직접 입력...</option>
                                        </select>
                                        {(customDraftJob || !ACCIDENT_JOB_FIELD_OPTIONS.includes(editDraft.jobField)) && (
                                            <input
                                                type="text"
                                                value={editDraft.jobField}
                                                onChange={(e) => setEditDraft({ ...editDraft, jobField: e.target.value })}
                                                placeholder="공종명 직접 입력..."
                                                className="mt-1.5 w-full min-h-[36px] rounded-xl border border-teal-400 bg-white px-3 font-semibold text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">12대 재해유형</label>
                                        <select
                                            value={editDraft.hazardType}
                                            onChange={(e) => setEditDraft({ ...editDraft, hazardType: e.target.value })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {HAZARD_OPTIONS.map((hazard) => (
                                                <option key={hazard} value={hazard}>{hazard}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">심각도 (5단계)</label>
                                        <select
                                            value={editDraft.severity}
                                            onChange={(e) => setEditDraft({ ...editDraft, severity: e.target.value as AccidentSeverity })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {SEVERITY_OPTIONS.map((sev) => (
                                                <option key={sev} value={sev}>{sev}</option>
                                            ))}
                                        </select>
                                        <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                            {ACCIDENT_SEVERITY_META[editDraft.severity]?.criteria}
                                        </p>
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">기인물 · 장비</label>
                                        <input
                                            type="text"
                                            value={editDraft.causingAgent}
                                            onChange={(e) => setEditDraft({ ...editDraft, causingAgent: e.target.value })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">세부 작업내용</label>
                                    <input
                                        type="text"
                                        value={editDraft.workTask}
                                        onChange={(e) => setEditDraft({ ...editDraft, workTask: e.target.value })}
                                        className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">사고 개요</label>
                                    <textarea
                                        rows={2}
                                        value={editDraft.summary}
                                        onChange={(e) => setEditDraft({ ...editDraft, summary: e.target.value })}
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">직접원인</label>
                                    <textarea
                                        rows={2}
                                        value={editDraft.directCause}
                                        onChange={(e) => setEditDraft({ ...editDraft, directCause: e.target.value })}
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">근본 · 관리적 원인</label>
                                    <textarea
                                        rows={2}
                                        value={editDraft.rootCause}
                                        onChange={(e) => setEditDraft({ ...editDraft, rootCause: e.target.value })}
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">재발방지대책</label>
                                    <textarea
                                        rows={2}
                                        value={editDraft.preventionMeasure}
                                        onChange={(e) => setEditDraft({ ...editDraft, preventionMeasure: e.target.value })}
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div>
                                    <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">작업 전 필수 점검 (줄바꿈으로 구분)</label>
                                    <textarea
                                        rows={2}
                                        value={editDraft.preWorkCheckpoints.join('\n')}
                                        onChange={(e) => setEditDraft({
                                            ...editDraft,
                                            preWorkCheckpoints: e.target.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
                                        })}
                                        className="w-full rounded-xl border border-slate-300 bg-white p-2.5 leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                    />
                                </div>

                                <div className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditDraft({ ...selectedRecord });
                                            setIsEditingDrawer(false);
                                        }}
                                        className="min-h-[42px] rounded-xl border border-slate-300 px-4 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                    >
                                        취소
                                    </button>
                                    <button type="submit" className="psi-ab-cta">
                                        수정 내용 저장하기
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <>
                                <div className="space-y-3 text-sm">
                                    <div className="rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                                        <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400">사고 개요</p>
                                        <p className="mt-1 leading-relaxed">{selectedRecord.summary}</p>
                                    </div>
                                    <div className="rounded-2xl bg-slate-50 p-3.5 dark:bg-slate-800/70">
                                        <p className="text-xs font-extrabold text-slate-500 dark:text-slate-400">기인물 · 직접원인</p>
                                        <p className="mt-1 font-semibold">[{selectedRecord.causingAgent}] {selectedRecord.directCause}</p>
                                    </div>
                                    <div className="rounded-2xl bg-amber-50/70 p-3.5 dark:bg-amber-950/30">
                                        <p className="text-xs font-extrabold text-amber-800 dark:text-amber-300">근본 · 관리적 원인</p>
                                        <p className="mt-1 leading-relaxed">{selectedRecord.rootCause}</p>
                                    </div>
                                    <div className="rounded-2xl bg-emerald-50/80 p-3.5 dark:bg-emerald-950/30">
                                        <p className="text-xs font-extrabold text-emerald-800 dark:text-emerald-300">재발방지대책</p>
                                        <p className="mt-1 leading-relaxed font-semibold">{selectedRecord.preventionMeasure}</p>
                                    </div>
                                    {selectedRecord.preWorkCheckpoints.length > 0 && (
                                        <div className="rounded-2xl border border-teal-500/30 p-3.5">
                                            <p className="text-xs font-extrabold text-teal-800 dark:text-teal-300">작업 전 필수 점검 체크리스트</p>
                                            <ul className="mt-1.5 space-y-1 text-xs font-semibold">
                                                {selectedRecord.preWorkCheckpoints.map((cp) => <li key={cp}>• {cp}</li>)}
                                            </ul>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => handleDeleteRecord(selectedRecord.id)}
                                        className="rounded-xl border border-rose-300 px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:text-rose-300"
                                    >
                                        이 사례 삭제
                                    </button>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleOpenDrawer(selectedRecord, true)}
                                            className="rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-bold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                                        >
                                            내용 수정
                                        </button>
                                        {onNavigateToPage && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedRecord(null);
                                                    setIsEditingDrawer(false);
                                                    onNavigateToPage('a4-education-material');
                                                }}
                                                className="psi-ab-cta"
                                            >
                                                교육자료 제작으로 연결 →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                    </aside>
                </div>
            )}
        </div>
    );
};

export default AccidentBigDataHub;
