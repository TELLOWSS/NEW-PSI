import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
    AccidentBigDataRecord,
    AccidentSeverity,
    AccidentTimeSlot,
    AccidentWorkStage,
    Page,
    WorkerRecord,
} from '../types';
import {
    ACCIDENT_BIGDATA_UPDATED_EVENT,
    ACCIDENT_FRAME_STANDARD_TRADES,
    ACCIDENT_HAZARD_TYPE_OPTIONS,
    ACCIDENT_JOB_FIELD_OPTIONS,
    ACCIDENT_SEVERITY_LEVELS,
    ACCIDENT_SEVERITY_META,
    ACCIDENT_WORK_STAGE_OPTIONS,
    applyBulkSiteAndContractorToCandidates,
    auditAccidentImportCandidates,
    buildAccidentConversionPrompt,
    computeAccidentBigDataAnalytics,
    computeAccidentFingerprint,
    computeCandidateTradeReviewHint,
    detectAccidentPiiMatches,
    exportAccidentRecordsToCsv,
    exportAccidentRecordsToJson,
    getMultiSiteBatchSampleText,
    getSampleAccidentBigDataRecords,
    maskAccidentRecordPii,
    normalizeAccidentWorkStage,
    parseExternalAiAccidentPayload,
    parseMultipleAccidentFiles,
    persistAccidentBigDataStore,
    readAccidentBigDataStore,
    updateAccidentRecordInList,
    type AccidentAuditCandidate,
    type AccidentBatchFileReport,
    type AccidentPromptFormat,
    type AccidentPromptProvider,
} from '../utils/accidentBigData';
import {
    buildAccidentEducationHandoffFromAlert,
    buildAccidentEducationHandoffFromRecord,
    saveAccidentEducationHandoff,
} from '../utils/accidentEducationBridge';

interface AccidentBigDataHubProps {
    workerRecords?: WorkerRecord[];
    onNavigateToPage?: (page: Page) => void;
}

type HubTab = 'import' | 'dashboard' | 'archive';

interface HubFilterState {
    site: string;
    contractor: string;
    severity: string;
    jobField: string;
    hazard: string;
    workStage: string;
    search: string;
}

const DEFAULT_HUB_FILTERS: HubFilterState = {
    site: '전체',
    contractor: '전체',
    severity: '전체',
    jobField: '전체',
    hazard: '전체',
    workStage: '전체',
    search: '',
};

const countActiveHubFilters = (filters: HubFilterState): number => {
    let count = 0;
    if (filters.site !== '전체') count += 1;
    if (filters.contractor !== '전체') count += 1;
    if (filters.severity !== '전체') count += 1;
    if (filters.jobField !== '전체') count += 1;
    if (filters.hazard !== '전체') count += 1;
    if (filters.workStage !== '전체') count += 1;
    if (filters.search.trim()) count += 1;
    return count;
};

const applyHubFilters = (
    items: readonly AccidentBigDataRecord[],
    filters: HubFilterState,
): AccidentBigDataRecord[] => {
    const q = filters.search.trim().toLowerCase();
    return items.filter((rec) => {
        const recStage = rec.workStage || normalizeAccidentWorkStage('', `${rec.workTask} ${rec.summary}`);
        if (filters.site !== '전체' && rec.siteName !== filters.site) return false;
        if (filters.contractor !== '전체' && rec.sourceContractor !== filters.contractor) return false;
        if (filters.severity !== '전체' && rec.severity !== filters.severity) return false;
        if (filters.jobField !== '전체' && rec.jobField !== filters.jobField) return false;
        if (filters.hazard !== '전체' && rec.hazardType !== filters.hazard) return false;
        if (filters.workStage !== '전체' && recStage !== filters.workStage) return false;
        if (!q) return true;
        return [
            rec.sourceContractor,
            rec.siteName,
            rec.jobField,
            recStage,
            rec.hazardType,
            rec.workTask,
            rec.causingAgent,
            rec.summary,
            rec.preventionMeasure,
        ].join(' ').toLowerCase().includes(q);
    });
};

const SEVERITY_OPTIONS: readonly AccidentSeverity[] = ACCIDENT_SEVERITY_LEVELS;
const WORK_STAGE_OPTIONS: readonly AccidentWorkStage[] = ACCIDENT_WORK_STAGE_OPTIONS;
const TIME_SLOT_OPTIONS: readonly AccidentTimeSlot[] = ['오전 작업전', '오전', '점심 직후', '오후', '야간', '미상'];
const HAZARD_OPTIONS: readonly string[] = ACCIDENT_HAZARD_TYPE_OPTIONS;

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
    const [multiSiteMode, setMultiSiteMode] = useState(true);
    const [contractorHint, setContractorHint] = useState('');
    const [siteHint, setSiteHint] = useState('');
    const [showPromptPreview, setShowPromptPreview] = useState(false);
    const [copiedPrompt, setCopiedPrompt] = useState(false);

    // Step 2: Import / Dropzone State
    const [rawInput, setRawInput] = useState('');
    const [appendMode, setAppendMode] = useState(true);
    const [multiFileReports, setMultiFileReports] = useState<AccidentBatchFileReport[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [parseNotice, setParseNotice] = useState<{ tone: 'info' | 'warn' | 'error'; text: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Step 3: Pre-Commit Audit State
    const [auditQueue, setAuditQueue] = useState<AccidentAuditCandidate[]>([]);
    const [auditSiteFilter, setAuditSiteFilter] = useState<string>('전체');
    const [bulkSiteInput, setBulkSiteInput] = useState('');
    const [bulkContractorInput, setBulkContractorInput] = useState('');
    const [commitBanner, setCommitBanner] = useState<string>('');

    // Dashboard & Archive Independent Filters (대시보드와 보관함 필터를 독립 관리해 드릴다운 후 복귀 시 전체 뷰 유지)
    const [dashboardFilters, setDashboardFilters] = useState<HubFilterState>(DEFAULT_HUB_FILTERS);
    const [archiveFilters, setArchiveFilters] = useState<HubFilterState>(DEFAULT_HUB_FILTERS);
    const [matrixSortMode, setMatrixSortMode] = useState<'risk' | 'count' | 'alpha'>('risk');
    const [showZeroTrades, setShowZeroTrades] = useState(false);
    const [selectedRecord, setSelectedRecord] = useState<AccidentBigDataRecord | null>(null);
    const [isEditingDrawer, setIsEditingDrawer] = useState(false);
    const [editDraft, setEditDraft] = useState<AccidentBigDataRecord | null>(null);
    const [customCandidateJobs, setCustomCandidateJobs] = useState<Record<string, boolean>>({});
    const [customDraftJob, setCustomDraftJob] = useState(false);
    const [customCandidateHazards, setCustomCandidateHazards] = useState<Record<string, boolean>>({});
    const [customDraftHazard, setCustomDraftHazard] = useState(false);

    useEffect(() => {
        if (!selectedRecord) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                setSelectedRecord(null);
                setIsEditingDrawer(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedRecord]);

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
        multiSiteMode,
    }), [contractorHint, multiSiteMode, outputFormat, provider, siteHint]);

    const contractorOptions = useMemo(() => {
        const set = new Set(records.map((r) => r.sourceContractor).filter(Boolean));
        return ['전체', ...Array.from(set)];
    }, [records]);

    const siteOptions = useMemo(() => {
        const set = new Set(records.map((r) => r.siteName).filter(Boolean));
        return ['전체', ...Array.from(set)];
    }, [records]);

    const jobFieldOptions = useMemo(() => {
        const set = new Set(records.map((r) => r.jobField).filter(Boolean));
        return ['전체', ...Array.from(set)];
    }, [records]);

    const hazardFilterOptions = useMemo(() => {
        const set = new Set<string>(HAZARD_OPTIONS);
        records.forEach((r) => {
            if (r.hazardType?.trim()) set.add(r.hazardType.trim());
        });
        return ['전체', ...Array.from(set)];
    }, [records]);

    const dashboardFilteredRecords = useMemo(
        () => applyHubFilters(records, dashboardFilters),
        [dashboardFilters, records],
    );

    const archiveFilteredRecords = useMemo(
        () => applyHubFilters(records, archiveFilters),
        [archiveFilters, records],
    );

    const activeDashboardFilterCount = useMemo(
        () => countActiveHubFilters(dashboardFilters),
        [dashboardFilters],
    );

    const activeArchiveFilterCount = useMemo(
        () => countActiveHubFilters(archiveFilters),
        [archiveFilters],
    );

    const openArchiveWithFilter = (patch: Partial<HubFilterState>) => {
        setArchiveFilters({
            ...dashboardFilters,
            ...patch,
        });
        setActiveTab('archive');
    };

    const analytics = useMemo(
        () => computeAccidentBigDataAnalytics(dashboardFilteredRecords, workerRecords),
        [dashboardFilteredRecords, workerRecords],
    );

    const heatmapDisplayTrades = useMemo(() => {
        const baseTrades = showZeroTrades
            ? Array.from(new Set([...analytics.riskMatrix.trades, ...ACCIDENT_FRAME_STANDARD_TRADES]))
            : [...analytics.riskMatrix.trades];

        return baseTrades.sort((a, b) => {
            const statA = analytics.riskMatrix.tradeTotals[a] || { count: 0, severeCount: 0 };
            const statB = analytics.riskMatrix.tradeTotals[b] || { count: 0, severeCount: 0 };
            if (matrixSortMode === 'alpha') {
                return a.localeCompare(b, 'ko-KR');
            }
            if (matrixSortMode === 'count') {
                return statB.count - statA.count || statB.severeCount - statA.severeCount || a.localeCompare(b, 'ko-KR');
            }
            return statB.severeCount - statA.severeCount || statB.count - statA.count || a.localeCompare(b, 'ko-KR');
        });
    }, [analytics.riskMatrix.tradeTotals, analytics.riskMatrix.trades, matrixSortMode, showZeroTrades]);

    const heatmapCellMap = useMemo(() => {
        const map = new Map<string, (typeof analytics.riskMatrix.cells)[number]>();
        for (const cell of analytics.riskMatrix.cells) {
            map.set(`${cell.trade}::${cell.hazard}`, cell);
        }
        return map;
    }, [analytics.riskMatrix.cells]);

    const animatedTotal = useAnimatedNumber(analytics.totalCount);
    const animatedReportableRate = useAnimatedNumber(analytics.reportableRatePct);
    const animatedSevereRate = useAnimatedNumber(analytics.severeRatePct);
    const animatedNearMiss = useAnimatedNumber(analytics.nearMissCount);
    const animatedContractors = useAnimatedNumber(analytics.contractorCount);
    const animatedSites = useAnimatedNumber(analytics.siteCount);

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

    const mergeCandidatesIntoQueue = (
        incomingRecords: AccidentBigDataRecord[],
        sourceSummaryLabel: string,
        shouldAppend = appendMode,
    ) => {
        const existingQueued = shouldAppend ? auditQueue.map((item) => item.record) : [];
        const combined = [...existingQueued, ...incomingRecords];
        const audited = auditAccidentImportCandidates(combined, records);
        setAuditQueue(audited);
        setAuditSiteFilter('전체');

        const dupCount = audited.filter((c) => c.isDuplicate).length;
        const piiCount = audited.filter((c) => c.piiFindings.length > 0).length;
        const siteSetCount = new Set(audited.map((c) => c.record.siteName).filter(Boolean)).size;
        setParseNotice({
            tone: piiCount > 0 || dupCount > 0 ? 'warn' : 'info',
            text: `${incomingRecords.length}건 새로 인식(${sourceSummaryLabel}) → 검수 대기 총 ${audited.length}건(${siteSetCount}개 현장) · 개인정보 의심 ${piiCount}건 · 중복 의심 ${dupCount}건`,
        });
    };

    const runParseAndAudit = (inputText: string, overrideAppend?: boolean) => {
        const parsed = parseExternalAiAccidentPayload(inputText, { defaultProvider: provider });
        if (!parsed.ok) {
            if (!(overrideAppend ?? appendMode)) {
                setAuditQueue([]);
            }
            setParseNotice({ tone: 'error', text: parsed.error });
            return;
        }
        setMultiFileReports([]);
        const blockText = parsed.blocksParsed > 1 ? ` · ${parsed.blocksParsed}개 응답 묶음` : '';
        mergeCandidatesIntoQueue(
            parsed.candidates,
            `${parsed.formatDetected.toUpperCase()}${blockText}`,
            overrideAppend ?? appendMode,
        );
    };

    const handleMultiFileUpload = async (fileList: FileList | File[]) => {
        const files = Array.from(fileList);
        if (files.length === 0) return;

        try {
            const loaded = await Promise.all(
                files.map(async (file) => ({
                    fileName: file.name,
                    content: await file.text(),
                })),
            );
            if (loaded.length === 1) {
                setRawInput(loaded[0].content);
            }
            const batchResult = parseMultipleAccidentFiles(loaded, { defaultProvider: provider });
            setMultiFileReports(batchResult.fileReports);

            if (batchResult.candidates.length === 0) {
                setParseNotice({
                    tone: 'error',
                    text: `${loaded.length}개 파일 중 인식된 사고 데이터가 없습니다. 파일별 배지 오류를 확인해 주세요.`,
                });
                return;
            }

            mergeCandidatesIntoQueue(
                batchResult.candidates,
                `파일 ${batchResult.okCount}/${loaded.length}개 성공`,
                appendMode,
            );
        } catch {
            setParseNotice({ tone: 'error', text: '선택한 파일 묶음을 읽지 못했습니다. JSON/CSV/TXT 파일인지 확인해 주세요.' });
        }
    };

    const auditSiteSummary = useMemo(() => {
        const map = new Map<string, number>();
        for (const item of auditQueue) {
            const site = item.record.siteName || '현장 미지정';
            map.set(site, (map.get(site) || 0) + 1);
        }
        return Array.from(map.entries()).map(([siteName, count]) => ({ siteName, count }));
    }, [auditQueue]);

    const visibleAuditQueue = useMemo(() => {
        if (auditSiteFilter === '전체') return auditQueue;
        return auditQueue.filter((item) => item.record.siteName === auditSiteFilter);
    }, [auditQueue, auditSiteFilter]);

    const handleBulkSelectMode = (mode: 'newOnly' | 'all' | 'none') => {
        setAuditQueue((prev) => prev.map((item) => {
            if (auditSiteFilter !== '전체' && item.record.siteName !== auditSiteFilter) {
                return item;
            }
            if (mode === 'all') return { ...item, selected: true };
            if (mode === 'none') return { ...item, selected: false };
            return { ...item, selected: !item.isDuplicate };
        }));
    };

    const handleApplyBulkSiteContractor = (onlyWhenMissing: boolean) => {
        if (!bulkSiteInput.trim() && !bulkContractorInput.trim()) {
            setParseNotice({ tone: 'warn', text: '일괄 적용할 현장명 또는 원도급사명을 먼저 입력해 주세요.' });
            return;
        }
        setAuditQueue((prev) => applyBulkSiteAndContractorToCandidates(prev, records, {
            siteName: bulkSiteInput,
            sourceContractor: bulkContractorInput,
            onlyWhenMissing,
        }));
        setParseNotice({
            tone: 'info',
            text: onlyWhenMissing
                ? '미지정/미기재된 선택 항목에만 현장명·원도급사명을 채웠습니다.'
                : '선택한 대기 항목에 현장명·원도급사명을 일괄 반영했습니다.',
        });
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
                tradeReviewHint: computeCandidateTradeReviewHint(reAudited.record),
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

        const siteTotal = new Set(selected.map((item) => item.siteName).filter(Boolean)).size;
        setCommitBanner(`신규 사고 ${selected.length}건(${siteTotal}개 현장)이 빅데이터 DB에 반영되었습니다. (추가 API 비용 0원)`);
        setAuditQueue([]);
        setMultiFileReports([]);
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
        setCustomDraftHazard(!HAZARD_OPTIONS.includes(record.hazardType));
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
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-teal-300/60 bg-slate-950/65 px-3.5 py-2 text-xs font-bold text-teal-100 hover:bg-slate-900 transition-colors"
                        >
                            <span>체험 예시 6건 불러오기</span>
                        </button>
                        <button
                            type="button"
                            disabled={records.length === 0}
                            onClick={() => triggerDownloadFile(`psi-accident-bigdata-${new Date().toISOString().slice(0, 10)}.json`, exportAccidentRecordsToJson(records), 'application/json;charset=utf-8')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/30 bg-slate-950/60 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-40 transition-colors"
                        >
                            <span>JSON 내보내기</span>
                        </button>
                        <button
                            type="button"
                            disabled={records.length === 0}
                            onClick={() => triggerDownloadFile(`psi-accident-bigdata-${new Date().toISOString().slice(0, 10)}.csv`, exportAccidentRecordsToCsv(records), 'text/csv;charset=utf-8')}
                            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-white/30 bg-slate-950/60 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-40 transition-colors"
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
                    <span className="psi-ab-tab-count">
                        {activeDashboardFilterCount > 0 ? `${dashboardFilteredRecords.length}/${records.length}` : records.length}
                    </span>
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === 'archive'}
                    className="psi-ab-tab-btn flex-1 sm:flex-initial"
                    onClick={() => setActiveTab('archive')}
                >
                    <span>3. 누적 사례 보관함</span>
                    <span className="psi-ab-tab-count">
                        {activeArchiveFilterCount > 0 ? `${archiveFilteredRecords.length}/${records.length}` : records.length}
                    </span>
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
                                                ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            Gemini 유료
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setProvider('chatgpt')}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${provider === 'chatgpt'
                                                ? 'border-teal-700 bg-teal-700 text-white shadow-sm'
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

                                <div className="min-w-0 sm:col-span-2">
                                    <label className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        일괄 변환 범위 (다건 · 다수 현장 대응)
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMultiSiteMode(true)}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${multiSiteMode
                                                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            다수 현장 · 다건 일괄 (현장 분리 유지)
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setMultiSiteMode(false)}
                                            className={`min-h-[42px] rounded-xl border px-3 text-xs font-extrabold transition-all ${!multiSiteMode
                                                ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            단일 현장 집중 변환
                                        </button>
                                    </div>
                                </div>

                                <div className="min-w-0">
                                    <label htmlFor="ab-contractor-hint" className="mb-1.5 block text-xs font-bold text-slate-700 dark:text-slate-300">
                                        원도급사명 기본 힌트 (선택)
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
                                        현장명 기본 힌트 (선택)
                                    </label>
                                    <input
                                        id="ab-site-hint"
                                        type="text"
                                        value={siteHint}
                                        onChange={(e) => setSiteHint(e.target.value)}
                                        placeholder="문서에 현장명 없으면 적용될 기본값"
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
                                        STEP 2 · 다수 파일 · 다건 일괄 가져오기
                                    </span>
                                    <h2 className="mt-2 text-lg font-extrabold text-slate-900 dark:text-white">
                                        AI 결과 여러 건 붙여넣기 또는 다수 파일 한꺼번에 드롭
                                    </h2>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setAppendMode((prev) => !prev)}
                                        className={`rounded-full border px-2.5 py-1 text-xs font-extrabold transition-colors ${appendMode
                                            ? 'border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-200'
                                            : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}
                                        title="검수 대기 목록이 있을 때 기존 대기 목록 뒤에 누적 추가할지, 새로 교체할지 선택합니다"
                                    >
                                        {appendMode ? '기존 대기에 누적 추가' : '새 목록으로 교체'}
                                    </button>
                                    {detectedPasteFormat && (
                                        <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-extrabold text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/50 dark:text-teal-200">
                                            {detectedPasteFormat}
                                        </span>
                                    )}
                                </div>
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
                                    if (e.dataTransfer.files?.length > 0) {
                                        void handleMultiFileUpload(e.dataTransfer.files);
                                    }
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
                                                변환 파일(.json · .csv · .txt)을 여러 개 한꺼번에 끌어오세요
                                            </p>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                현장별 파일 여러 개나 AI 응답 블록 여러 개를 이어 붙여도 모두 자동 분리·통합합니다.
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        multiple
                                        accept=".json,.csv,.tsv,.txt"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files && e.target.files.length > 0) {
                                                void handleMultiFileUpload(e.target.files);
                                            }
                                            e.target.value = '';
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                    >
                                        여러 파일 선택
                                    </button>
                                </div>

                                <textarea
                                    value={rawInput}
                                    onChange={(e) => setRawInput(e.target.value)}
                                    rows={6}
                                    placeholder="Gemini · ChatGPT에서 여러 현장의 사고보고서를 각각 변환한 뒤, 답변 블록을 여러 개 이어서 붙여넣어도 한 번에 분석됩니다..."
                                    aria-label="AI 변환 결과 붙여넣기"
                                    className="mt-3 w-full rounded-xl border border-slate-300 bg-white/90 p-3 font-mono text-xs leading-relaxed text-slate-900 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100"
                                />
                            </div>

                            {multiFileReports.length > 0 && (
                                <div className="psi-ab-file-chips" aria-label="업로드 파일 처리 결과">
                                    {multiFileReports.map((rep) => (
                                        <span
                                            key={rep.fileName}
                                            className={`psi-ab-file-chip ${rep.ok ? 'is-ok' : 'is-err'}`}
                                            title={rep.ok ? `${rep.formatDetected.toUpperCase()} ${rep.count}건` : rep.error}
                                        >
                                            <span>{rep.ok ? '✓' : '✕'} {rep.fileName}</span>
                                            <span>{rep.ok ? `${rep.count}건` : '오류'}</span>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                    type="button"
                                    disabled={!rawInput.trim()}
                                    onClick={() => runParseAndAudit(rawInput)}
                                    className="psi-ab-cta disabled:opacity-45"
                                >
                                    <span>{appendMode && auditQueue.length > 0 ? '대기 목록에 추가 분석' : '자동 분석 및 사전 검수 실행'}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const sampleBatch = getMultiSiteBatchSampleText();
                                        setRawInput(sampleBatch);
                                        runParseAndAudit(sampleBatch, false);
                                    }}
                                    className="inline-flex min-h-[44px] items-center rounded-xl border border-indigo-300 bg-indigo-50 px-3.5 text-xs font-extrabold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-950/60 dark:text-indigo-200"
                                >
                                    다수 현장 4건 묶음 테스트
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setRawInput(SAMPLE_PASTE_JSON);
                                        runParseAndAudit(SAMPLE_PASTE_JSON, false);
                                    }}
                                    className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                >
                                    단건 예시 테스트
                                </button>
                                {(rawInput.trim() || auditQueue.length > 0) && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setRawInput('');
                                            setAuditQueue([]);
                                            setMultiFileReports([]);
                                            setParseNotice(null);
                                        }}
                                        className="inline-flex min-h-[44px] items-center rounded-xl px-3 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                    >
                                        전체 비우기
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
                                        STEP 3 · 다수 현장 일괄 검수 · 개인정보 보호
                                    </span>
                                    <h2 className="mt-1.5 text-lg font-extrabold text-slate-900 dark:text-white">
                                        표준화 및 비식별 확인 ({selectedCommitCount}/{auditQueue.length}건 · {auditSiteSummary.length}개 현장 반영 예정)
                                    </h2>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => handleBulkSelectMode('newOnly')}
                                        className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        신규만 선택
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleBulkSelectMode('all')}
                                        className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        전체 선택
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleBulkSelectMode('none')}
                                        className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                                    >
                                        선택 해제
                                    </button>
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

                            {/* 현장별 필터 칩 & 선택 항목 현장/원도급사 일괄 보정 바 */}
                            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/75 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setAuditSiteFilter('전체')}
                                        className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors ${auditSiteFilter === '전체'
                                            ? 'bg-slate-900 text-white dark:bg-sky-500 dark:text-slate-950'
                                            : 'border border-slate-300 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                        }`}
                                    >
                                        전체 현장 ({auditQueue.length})
                                    </button>
                                    {auditSiteSummary.map((site) => (
                                        <button
                                            key={site.siteName}
                                            type="button"
                                            onClick={() => setAuditSiteFilter(site.siteName)}
                                            className={`rounded-full px-3 py-1 text-xs font-extrabold transition-colors ${auditSiteFilter === site.siteName
                                                ? 'bg-indigo-600 text-white'
                                                : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            {site.siteName} ({site.count})
                                        </button>
                                    ))}
                                </div>

                                <div className="flex flex-wrap items-end gap-2">
                                    <div className="min-w-[170px] flex-1">
                                        <label htmlFor="ab-bulk-site" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                            선택 항목 현장명 일괄 지정
                                        </label>
                                        <input
                                            id="ab-bulk-site"
                                            type="text"
                                            value={bulkSiteInput}
                                            onChange={(e) => setBulkSiteInput(e.target.value)}
                                            placeholder="예: 판교 R&D 센터 신축"
                                            className="w-full min-h-[36px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                    <div className="min-w-[170px] flex-1">
                                        <label htmlFor="ab-bulk-contractor" className="mb-1 block text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                            선택 항목 원도급사 일괄 지정
                                        </label>
                                        <input
                                            id="ab-bulk-contractor"
                                            type="text"
                                            value={bulkContractorInput}
                                            onChange={(e) => setBulkContractorInput(e.target.value)}
                                            placeholder="예: 태백엔지니어링"
                                            className="w-full min-h-[36px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleApplyBulkSiteContractor(true)}
                                        className="min-h-[36px] rounded-xl border border-teal-500/40 bg-teal-50 px-3 text-xs font-extrabold text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-200"
                                    >
                                        미지정만 채우기
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleApplyBulkSiteContractor(false)}
                                        className="min-h-[36px] rounded-xl border border-indigo-400 bg-indigo-600 px-3 text-xs font-extrabold text-white hover:bg-indigo-500"
                                    >
                                        선택 건 전체 덮어쓰기
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {visibleAuditQueue.map((cand) => (
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
                                                <span>{cand.record.occurredDate} · {cand.record.siteName} · {cand.record.sourceContractor}</span>
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

                                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">현장명</label>
                                                <input
                                                    type="text"
                                                    value={cand.record.siteName}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'siteName', e.target.value)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                />
                                            </div>
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
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">공종 (소속 팀·직종 · 직접입력)</label>
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
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">작업공정 (작업 단계)</label>
                                                <select
                                                    value={cand.record.workStage || '미상'}
                                                    onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'workStage', e.target.value as AccidentWorkStage)}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                >
                                                    {WORK_STAGE_OPTIONS.map((stage) => (
                                                        <option key={stage} value={stage}>{stage}</option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="min-w-0">
                                                <label className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">재해유형 (개별 분류 · 직접입력)</label>
                                                <select
                                                    value={customCandidateHazards[cand.candidateId] || !HAZARD_OPTIONS.includes(cand.record.hazardType) ? '__custom__' : cand.record.hazardType}
                                                    onChange={(e) => {
                                                        if (e.target.value === '__custom__') {
                                                            setCustomCandidateHazards((prev) => ({ ...prev, [cand.candidateId]: true }));
                                                            return;
                                                        }
                                                        setCustomCandidateHazards((prev) => ({ ...prev, [cand.candidateId]: false }));
                                                        handleUpdateCandidateField(cand.candidateId, 'hazardType', e.target.value);
                                                    }}
                                                    className="w-full min-h-[38px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                                >
                                                    {HAZARD_OPTIONS.map((hazard) => (
                                                        <option key={hazard} value={hazard}>{hazard}</option>
                                                    ))}
                                                    <option value="__custom__">+ 직접 입력...</option>
                                                </select>
                                                {(customCandidateHazards[cand.candidateId] || !HAZARD_OPTIONS.includes(cand.record.hazardType)) && (
                                                    <input
                                                        type="text"
                                                        value={cand.record.hazardType}
                                                        onChange={(e) => handleUpdateCandidateField(cand.candidateId, 'hazardType', e.target.value)}
                                                        placeholder="예: 전도(넘어짐), 비래, 화학물질..."
                                                        className="mt-1.5 w-full min-h-[36px] rounded-lg border border-teal-400 bg-white px-2.5 text-xs font-semibold text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                                                    />
                                                )}
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

                                        {cand.tradeReviewHint && (
                                            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-300/70 bg-indigo-50/85 px-3 py-2 text-xs text-indigo-950 dark:border-indigo-500/40 dark:bg-indigo-950/50 dark:text-indigo-100">
                                                <span className="font-bold">{cand.tradeReviewHint}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleUpdateCandidateField(cand.candidateId, 'jobField', '해체정리')}
                                                    className="shrink-0 rounded-lg border border-indigo-400 bg-white px-2.5 py-1 text-[11px] font-extrabold text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500 dark:bg-slate-900 dark:text-indigo-200"
                                                >
                                                    해체정리 팀으로 변경
                                                </button>
                                            </div>
                                        )}

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
                    {/* Dashboard Filter Bar (보관함과 독립 유지) */}
                    <section className="psi-ab-card flex flex-col gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="min-w-[145px] flex-1">
                                <label htmlFor="ab-filter-site" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    현장별 필터
                                </label>
                                <select
                                    id="ab-filter-site"
                                    value={dashboardFilters.site}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, site: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    {siteOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[145px] flex-1">
                                <label htmlFor="ab-filter-contractor" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    원도급사 필터
                                </label>
                                <select
                                    id="ab-filter-contractor"
                                    value={dashboardFilters.contractor}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, contractor: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    {contractorOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[125px] flex-1">
                                <label htmlFor="ab-filter-job" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    공종 (팀)
                                </label>
                                <select
                                    id="ab-filter-job"
                                    value={dashboardFilters.jobField}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, jobField: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    {jobFieldOptions.map((job) => <option key={job} value={job}>{job}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[125px] flex-1">
                                <label htmlFor="ab-filter-stage" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    작업공정
                                </label>
                                <select
                                    id="ab-filter-stage"
                                    value={dashboardFilters.workStage}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, workStage: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    <option value="전체">전체 공정</option>
                                    {WORK_STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[135px] flex-1">
                                <label htmlFor="ab-filter-hazard" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    재해유형 (개별)
                                </label>
                                <select
                                    id="ab-filter-hazard"
                                    value={dashboardFilters.hazard}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, hazard: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    {hazardFilterOptions.map((haz) => (
                                        <option key={haz} value={haz}>{haz === '전체' ? '전체 재해유형' : haz}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="min-w-[140px] flex-1">
                                <label htmlFor="ab-filter-severity" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    심각도
                                </label>
                                <select
                                    id="ab-filter-severity"
                                    value={dashboardFilters.severity}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, severity: e.target.value }))}
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                >
                                    <option value="전체">전체 등급</option>
                                    {SEVERITY_OPTIONS.map((sev) => <option key={sev} value={sev}>{sev}</option>)}
                                </select>
                            </div>
                            <div className="min-w-[180px] flex-[1.5]">
                                <label htmlFor="ab-filter-search" className="mb-1 block text-xs font-bold text-slate-600 dark:text-slate-300">
                                    키워드 검색 (공종·공정·원인)
                                </label>
                                <input
                                    id="ab-filter-search"
                                    type="search"
                                    value={dashboardFilters.search}
                                    onChange={(e) => setDashboardFilters((prev) => ({ ...prev, search: e.target.value }))}
                                    placeholder="예: 알폼, 해체·탈형, 유도봉..."
                                    className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                />
                            </div>
                        </div>

                        {activeDashboardFilterCount > 0 && (
                            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-400/40 bg-teal-50/70 px-3 py-2 text-xs dark:border-teal-500/30 dark:bg-teal-950/35">
                                <div className="flex flex-wrap items-center gap-1.5 font-bold text-teal-950 dark:text-teal-100">
                                    <span>대시보드 조건 적용 중 ({dashboardFilteredRecords.length}/{records.length}건):</span>
                                    {dashboardFilters.site !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">현장: {dashboardFilters.site}</span>
                                    )}
                                    {dashboardFilters.contractor !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">원청: {dashboardFilters.contractor}</span>
                                    )}
                                    {dashboardFilters.jobField !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">공종: {dashboardFilters.jobField}</span>
                                    )}
                                    {dashboardFilters.workStage !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">공정: {dashboardFilters.workStage}</span>
                                    )}
                                    {dashboardFilters.hazard !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">유형: {dashboardFilters.hazard}</span>
                                    )}
                                    {dashboardFilters.severity !== '전체' && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">등급: {dashboardFilters.severity}</span>
                                    )}
                                    {dashboardFilters.search.trim() && (
                                        <span className="rounded-full bg-white/90 px-2.5 py-0.5 dark:bg-slate-900">검색: {dashboardFilters.search.trim()}</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setDashboardFilters(DEFAULT_HUB_FILTERS)}
                                    className="min-h-[34px] shrink-0 rounded-lg border border-teal-700 bg-teal-700 px-3 text-xs font-extrabold text-white hover:bg-teal-600"
                                >
                                    전체 사고 보기 (초기화)
                                </button>
                            </div>
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
                                        {animatedSites}개 현장 · {animatedContractors}개 원도급사 통합 집계
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
                                    <p className="text-xs font-bold text-slate-600 dark:text-slate-300">최다 재해유형 (개별 집계)</p>
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
                                                    onClick={() => openArchiveWithFilter({ severity: tier.severity })}
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
                                                        onClick={() => openArchiveWithFilter({ severity: seg.severity })}
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
                                                        onClick={() => openArchiveWithFilter({ severity: tier.severity })}
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

                            {/* Signature Full-Width Row 2: Complete Untruncated Trade x Hazard Heatmap */}
                            <section className="psi-ab-card psi-ab-rise flex flex-col gap-3.5">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                공종 × 재해유형 전체 위험 히트맵 (누락 없음)
                                            </h2>
                                            <span className="rounded-full border border-teal-300 bg-teal-50 px-2.5 py-0.5 text-xs font-extrabold text-teal-800 dark:border-teal-500/40 dark:bg-teal-950/60 dark:text-teal-200">
                                                {heatmapDisplayTrades.length}개 공종 × {analytics.riskMatrix.hazards.length}개 재해유형 · 총 {analytics.totalCount}건
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                                            사고가 1건이라도 발생한 모든 공종과 개별 재해유형을 잘림 없이 전수 표시합니다. 칸이나 합계를 누르면 보관함으로 바로 이동합니다.
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-bold dark:border-slate-700 dark:bg-slate-800/80" role="group" aria-label="히트맵 정렬 기준">
                                            <button
                                                type="button"
                                                onClick={() => setMatrixSortMode('risk')}
                                                className={`rounded-lg px-2.5 py-1.5 transition-colors ${matrixSortMode === 'risk'
                                                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                                                }`}
                                            >
                                                위험도(중상↑)순
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMatrixSortMode('count')}
                                                className={`rounded-lg px-2.5 py-1.5 transition-colors ${matrixSortMode === 'count'
                                                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                                                }`}
                                            >
                                                발생 건수순
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setMatrixSortMode('alpha')}
                                                className={`rounded-lg px-2.5 py-1.5 transition-colors ${matrixSortMode === 'alpha'
                                                    ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-950 dark:text-white'
                                                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-300'
                                                }`}
                                            >
                                                가나다순
                                            </button>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setShowZeroTrades((prev) => !prev)}
                                            className={`min-h-[34px] rounded-xl border px-3 text-xs font-extrabold transition-colors ${showZeroTrades
                                                ? 'border-indigo-500 bg-indigo-600 text-white'
                                                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200'
                                            }`}
                                        >
                                            {showZeroTrades ? '표준 골조 공종(0건 포함) 표시 중' : '사고 발생 공종만 보기'}
                                        </button>
                                    </div>
                                </div>

                                {heatmapDisplayTrades.length > 0 && analytics.riskMatrix.hazards.length > 0 ? (
                                    <div className="psi-ab-heatmap-scroll">
                                        <table className="psi-ab-heatmap-table" aria-label="공종별 재해유형 전체 교차 히트맵">
                                            <thead>
                                                <tr>
                                                    <th scope="col" className="psi-ab-sticky-col text-slate-700 dark:text-slate-200">
                                                        공종 ╲ 재해유형
                                                    </th>
                                                    {analytics.riskMatrix.hazards.map((hazard) => (
                                                        <th key={hazard} scope="col" className="text-center text-slate-700 dark:text-slate-200">
                                                            {hazard}
                                                        </th>
                                                    ))}
                                                    <th scope="col" className="text-center text-teal-800 dark:text-teal-200">
                                                        공종 합계
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {heatmapDisplayTrades.map((trade) => {
                                                    const rowTotal = analytics.riskMatrix.tradeTotals[trade] || { count: 0, severeCount: 0 };
                                                    return (
                                                        <tr key={trade}>
                                                            <th scope="row" className="psi-ab-sticky-col text-slate-900 dark:text-slate-100">
                                                                <span className="inline-flex items-center gap-1.5">
                                                                    <span>{trade}</span>
                                                                    {rowTotal.count === 0 && (
                                                                        <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                                                                            무재해
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </th>
                                                            {analytics.riskMatrix.hazards.map((hazard) => {
                                                                const cell = heatmapCellMap.get(`${trade}::${hazard}`);
                                                                const count = cell?.count || 0;
                                                                const severeCount = cell?.severeCount || 0;
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
                                                                    <td key={`${trade}-${hazard}`} className="min-w-[74px]">
                                                                        <button
                                                                            type="button"
                                                                            disabled={count === 0}
                                                                            onClick={() => openArchiveWithFilter({ jobField: trade, hazard })}
                                                                            className={`psi-ab-matrix-cell w-full px-1.5 ${cellStyle}`}
                                                                        >
                                                                            <span>{count > 0 ? `${count}건` : '-'}</span>
                                                                            {severeCount > 0 && (
                                                                                <span className="text-[10px] font-bold">중상↑{severeCount}</span>
                                                                            )}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            })}
                                                            <td>
                                                                <button
                                                                    type="button"
                                                                    disabled={rowTotal.count === 0}
                                                                    onClick={() => openArchiveWithFilter({ jobField: trade })}
                                                                    className="psi-ab-heatmap-total-btn px-2 text-xs text-slate-900 disabled:opacity-45 dark:text-slate-100"
                                                                >
                                                                    {rowTotal.count}건
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr>
                                                    <th scope="row" className="psi-ab-sticky-col text-teal-900 dark:text-teal-200">
                                                        유형 합계
                                                    </th>
                                                    {analytics.riskMatrix.hazards.map((hazard) => {
                                                        const colTotal = analytics.riskMatrix.hazardTotals[hazard] || { count: 0, severeCount: 0 };
                                                        return (
                                                            <td key={`total-${hazard}`}>
                                                                <button
                                                                    type="button"
                                                                    disabled={colTotal.count === 0}
                                                                    onClick={() => openArchiveWithFilter({ hazard })}
                                                                    className="psi-ab-heatmap-total-btn px-1.5 text-xs text-slate-900 disabled:opacity-45 dark:text-slate-100"
                                                                >
                                                                    {colTotal.count}건
                                                                </button>
                                                            </td>
                                                        );
                                                    })}
                                                    <td>
                                                        <span className="psi-ab-heatmap-total-btn border-teal-500/40 bg-teal-50 px-2 text-xs text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
                                                            {analytics.totalCount}건
                                                        </span>
                                                    </td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs text-slate-500 dark:text-slate-400">히트맵을 생성할 데이터가 부족합니다.</p>
                                )}
                            </section>

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
                                                    onClick={() => {
                                                        const primaryAlert = analytics.crossLinkAlerts[0];
                                                        if (primaryAlert) {
                                                            const matching = dashboardFilteredRecords.filter(
                                                                (item) => item.jobField === primaryAlert.jobField,
                                                            );
                                                            saveAccidentEducationHandoff(
                                                                buildAccidentEducationHandoffFromAlert(primaryAlert, matching),
                                                            );
                                                        }
                                                        onNavigateToPage('a4-education-material');
                                                    }}
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
                                {/* Left Column: Hazard Bars + Circadian Rhythm */}
                                <div className="flex flex-col gap-5">
                                    <section className="psi-ab-card psi-ab-rise flex flex-col gap-3">
                                        <div className="flex items-center justify-between gap-2">
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                개별 재해유형 분포 (묶음 없이 정밀 집계)
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
                                                    onClick={() => openArchiveWithFilter({ hazard: bucket.label })}
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

                                {/* Monthly SVG Kinetic Trend + Full JobField Distribution */}
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
                                                공종별 사고 분포 ({analytics.jobFieldDistribution.length}개 공종 전체)
                                            </h2>
                                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                클릭 시 보관함 이동
                                            </span>
                                        </div>
                                        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto pr-1">
                                            {analytics.jobFieldDistribution.map((job) => (
                                                <button
                                                    key={job.label}
                                                    type="button"
                                                    onClick={() => openArchiveWithFilter({ jobField: job.label })}
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

                            {/* Multi-Site Comparative Stacked Board */}
                            {analytics.siteDistribution.length > 0 && (
                                <section className="psi-ab-card psi-ab-rise flex flex-col gap-3.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                                                다수 현장별 사고·위험 비교 보드 ({analytics.siteCount}개 현장)
                                            </h2>
                                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                                현장별 중상·휴업·아차사고 구성 비중과 다빈도 공종·재해를 비교합니다. 행을 누르면 해당 현장 사례만 모아봅니다.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
                                            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300">
                                                <span className="h-2.5 w-2.5 rounded-full bg-rose-600" />중상·중대
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
                                                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />휴업(3일↑)
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />아차·경미
                                            </span>
                                        </div>
                                    </div>
                                    <div className="psi-ab-site-board">
                                        {analytics.siteDistribution.map((site) => {
                                            const totalForSite = Math.max(1, site.count);
                                            const severePct = Math.round((site.severeCount / totalForSite) * 100);
                                            const lostTimeOnly = Math.max(0, site.reportableCount - site.severeCount);
                                            const lostTimePct = Math.round((lostTimeOnly / totalForSite) * 100);
                                            const mildPct = Math.max(0, 100 - severePct - lostTimePct);

                                            return (
                                                <button
                                                    key={site.siteName}
                                                    type="button"
                                                    onClick={() => openArchiveWithFilter({ site: site.siteName })}
                                                    className="psi-ab-site-row flex w-full flex-col gap-2 text-left"
                                                >
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                                                {site.siteName}
                                                            </span>
                                                            <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                                                {site.contractor}
                                                            </span>
                                                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-bold text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-200">
                                                                주 공종: {site.topJobField} · 주 재해: {site.topHazard}
                                                            </span>
                                                        </div>
                                                        <span className="text-xs font-extrabold tabular-nums text-slate-800 dark:text-slate-100">
                                                            총 {site.count}건 ({site.sharePct}%) · 중상·중대 {site.severeCount}건 · 아차 {site.nearMissCount}건
                                                        </span>
                                                    </div>
                                                    <div className="psi-ab-stacked-bar" aria-hidden="true">
                                                        {severePct > 0 && <div className="psi-ab-stacked-seg bg-rose-600" style={{ width: `${severePct}%` }} />}
                                                        {lostTimePct > 0 && <div className="psi-ab-stacked-seg bg-amber-500" style={{ width: `${lostTimePct}%` }} />}
                                                        {mildPct > 0 && <div className="psi-ab-stacked-seg bg-emerald-500" style={{ width: `${mildPct}%` }} />}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}
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
                                누적 원도급사 사고 사례 ({archiveFilteredRecords.length}건{activeArchiveFilterCount > 0 ? ` / 전체 ${records.length}건` : ''})
                            </h2>
                            <p className="text-xs text-slate-600 dark:text-slate-300">
                                카드를 누르면 직접원인·근본원인·재발방지대책·작업 전 필수 점검 전체를 확인할 수 있습니다.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <select
                                aria-label="보관함 현장 필터"
                                value={archiveFilters.site}
                                onChange={(e) => setArchiveFilters((prev) => ({ ...prev, site: e.target.value }))}
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                {siteOptions.map((s) => (
                                    <option key={s} value={s}>{s === '전체' ? '전체 현장' : s}</option>
                                ))}
                            </select>
                            <select
                                aria-label="보관함 공종 필터"
                                value={archiveFilters.jobField}
                                onChange={(e) => setArchiveFilters((prev) => ({ ...prev, jobField: e.target.value }))}
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                {jobFieldOptions.map((job) => (
                                    <option key={job} value={job}>{job === '전체' ? '전체 공종' : job}</option>
                                ))}
                            </select>
                            <select
                                aria-label="보관함 작업공정 필터"
                                value={archiveFilters.workStage}
                                onChange={(e) => setArchiveFilters((prev) => ({ ...prev, workStage: e.target.value }))}
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                <option value="전체">전체 공정</option>
                                {WORK_STAGE_OPTIONS.map((stage) => (
                                    <option key={stage} value={stage}>{stage}</option>
                                ))}
                            </select>
                            <select
                                aria-label="보관함 재해유형 필터"
                                value={archiveFilters.hazard}
                                onChange={(e) => setArchiveFilters((prev) => ({ ...prev, hazard: e.target.value }))}
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            >
                                {hazardFilterOptions.map((haz) => (
                                    <option key={haz} value={haz}>{haz === '전체' ? '전체 재해유형' : haz}</option>
                                ))}
                            </select>
                            <input
                                type="search"
                                value={archiveFilters.search}
                                onChange={(e) => setArchiveFilters((prev) => ({ ...prev, search: e.target.value }))}
                                placeholder="사례 검색..."
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                            />
                            <button
                                type="button"
                                onClick={() => setActiveTab('dashboard')}
                                className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 text-xs font-extrabold text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                                ← 대시보드 보기
                            </button>
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

                    {activeArchiveFilterCount > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-indigo-300/60 bg-indigo-50/75 px-3.5 py-2.5 text-xs dark:border-indigo-500/35 dark:bg-indigo-950/35">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-extrabold text-indigo-950 dark:text-indigo-100">적용된 보관함 필터:</span>
                                {archiveFilters.site !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, site: '전체' }))}
                                        className="rounded-full border border-indigo-300 bg-white px-2.5 py-0.5 font-extrabold text-indigo-900 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-100"
                                    >
                                        현장: {archiveFilters.site} ✕
                                    </button>
                                )}
                                {archiveFilters.contractor !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, contractor: '전체' }))}
                                        className="rounded-full border border-indigo-300 bg-white px-2.5 py-0.5 font-extrabold text-indigo-900 dark:border-indigo-500/40 dark:bg-slate-900 dark:text-indigo-100"
                                    >
                                        원도급사: {archiveFilters.contractor} ✕
                                    </button>
                                )}
                                {archiveFilters.jobField !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, jobField: '전체' }))}
                                        className="rounded-full border border-teal-400 bg-teal-50 px-2.5 py-0.5 font-extrabold text-teal-900 dark:bg-teal-950/60 dark:text-teal-200"
                                    >
                                        공종: {archiveFilters.jobField} ✕
                                    </button>
                                )}
                                {archiveFilters.workStage !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, workStage: '전체' }))}
                                        className="rounded-full border border-violet-400 bg-violet-50 px-2.5 py-0.5 font-extrabold text-violet-900 dark:bg-violet-950/60 dark:text-violet-200"
                                    >
                                        작업공정: {archiveFilters.workStage} ✕
                                    </button>
                                )}
                                {archiveFilters.hazard !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, hazard: '전체' }))}
                                        className="rounded-full border border-sky-400 bg-sky-50 px-2.5 py-0.5 font-extrabold text-sky-900 dark:bg-sky-950/60 dark:text-sky-200"
                                    >
                                        재해유형: {archiveFilters.hazard} ✕
                                    </button>
                                )}
                                {archiveFilters.severity !== '전체' && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, severity: '전체' }))}
                                        className="rounded-full border border-rose-400 bg-rose-50 px-2.5 py-0.5 font-extrabold text-rose-900 dark:bg-rose-950/60 dark:text-rose-200"
                                    >
                                        등급: {archiveFilters.severity} ✕
                                    </button>
                                )}
                                {archiveFilters.search.trim() && (
                                    <button
                                        type="button"
                                        onClick={() => setArchiveFilters((prev) => ({ ...prev, search: '' }))}
                                        className="rounded-full border border-slate-300 bg-white px-2.5 py-0.5 font-extrabold text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                                    >
                                        검색: {archiveFilters.search.trim()} ✕
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setArchiveFilters(DEFAULT_HUB_FILTERS)}
                                className="min-h-[34px] shrink-0 rounded-lg bg-indigo-600 px-3 text-xs font-extrabold text-white hover:bg-indigo-500"
                            >
                                전체 사례 보기 (필터 초기화)
                            </button>
                        </div>
                    )}

                    {archiveFilteredRecords.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
                            조건에 맞는 사고 사례가 없습니다.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {archiveFilteredRecords.map((rec) => (
                                <article
                                    key={rec.id}
                                    className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition-all hover:border-teal-500/50 dark:border-slate-800 dark:bg-slate-900/60"
                                >
                                    <div className="space-y-2">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                                {rec.occurredDate} · {rec.siteName} · {rec.sourceContractor}
                                            </span>
                                            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold ${SEVERITY_BADGE_MAP[rec.severity]}`}>
                                                {rec.severity}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                                            [{rec.jobField} · {rec.workStage || '미상'} · {rec.hazardType}] {rec.workTask}
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
                    className="fixed inset-0 z-[10001] flex justify-end bg-slate-950/55 backdrop-blur-sm"
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
                                    {selectedRecord.severity} · {selectedRecord.jobField} ({selectedRecord.workStage || '미상'}) · {selectedRecord.hazardType}
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
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">작업공정 (단계)</label>
                                        <select
                                            value={editDraft.workStage || '미상'}
                                            onChange={(e) => setEditDraft({ ...editDraft, workStage: e.target.value as AccidentWorkStage })}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {WORK_STAGE_OPTIONS.map((stage) => (
                                                <option key={stage} value={stage}>{stage}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="mb-1 block font-bold text-slate-600 dark:text-slate-300">재해유형 (개별 · 직접입력)</label>
                                        <select
                                            value={customDraftHazard || !HAZARD_OPTIONS.includes(editDraft.hazardType) ? '__custom__' : editDraft.hazardType}
                                            onChange={(e) => {
                                                if (e.target.value === '__custom__') {
                                                    setCustomDraftHazard(true);
                                                    return;
                                                }
                                                setCustomDraftHazard(false);
                                                setEditDraft({ ...editDraft, hazardType: e.target.value });
                                            }}
                                            className="w-full min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                                        >
                                            {HAZARD_OPTIONS.map((hazard) => (
                                                <option key={hazard} value={hazard}>{hazard}</option>
                                            ))}
                                            <option value="__custom__">+ 직접 입력...</option>
                                        </select>
                                        {(customDraftHazard || !HAZARD_OPTIONS.includes(editDraft.hazardType)) && (
                                            <input
                                                type="text"
                                                value={editDraft.hazardType}
                                                onChange={(e) => setEditDraft({ ...editDraft, hazardType: e.target.value })}
                                                placeholder="세부 재해유형 직접 입력..."
                                                className="mt-1.5 w-full min-h-[36px] rounded-xl border border-teal-400 bg-white px-3 font-semibold text-slate-900 dark:bg-slate-950 dark:text-slate-100"
                                            />
                                        )}
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
                                                    saveAccidentEducationHandoff(
                                                        buildAccidentEducationHandoffFromRecord(selectedRecord),
                                                    );
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
