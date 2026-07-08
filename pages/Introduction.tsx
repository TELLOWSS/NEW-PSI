
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Page, WorkerRecord } from '../types';
import { BrandPhilosophyLogo } from '../components/shared/BrandPhilosophyLogo';
import { PSI_APP_VERSION, PSI_CURRENT_RELEASE, PSI_SYSTEM_NAME } from '../lib/appInfo';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { BRAND_TONE } from '../utils/brandToneTokens';
import {
    clearOnePointProofSession,
    getNextOnePointProofStage,
    ONE_POINT_PROOF_SESSION_EVENT,
    readOnePointProofSession,
    startOnePointProofStage,
    type OnePointProofSession,
    type OnePointProofStageId,
} from '../utils/onePointProofSession';

interface IntroductionProps {
    workerRecords: WorkerRecord[];
    onNavigateToPage: (page: Page) => void;
}

type QaAlertRunlogEntry = {
    checkedAt: string;
    connected: number;
    dataReady: number;
    total: number;
    warnItems: number;
    hasWarnings: boolean;
    warningPages: Page[];
};

const QA_ALERT_RUNLOG_KEY = 'psi_intro_mobile_feature_qa_alert_runlog_v1';
const QA_ALERT_RUNLOG_MAX_ITEMS = 20;
const UPGRADE_PLAN_STORAGE_KEY = 'psi_intro_upgrade_plan_v1';
const DASHBOARD_LIVE_SYNC_SNAPSHOT_KEY = 'psi_dashboard_live_sync_snapshot_v1';
const DASHBOARD_RISKMAP_FOCUS_KEY = 'psi_dashboard_riskmap_focus_v1';
const DASHBOARD_RISKMAP_FOCUS_EVENT = 'psi-dashboard-riskmap-focus';
const REPORTS_DELIVERY_SNAPSHOT_KEY = 'psi_reports_delivery_snapshot_v1';
const REPORTS_DELIVERY_SNAPSHOT_EVENT = 'psi-reports-delivery-snapshot-updated';

type DashboardLiveSyncSnapshot = {
    updatedAt: string;
    totalWorkers: number;
    averageScore: number;
    highRiskWorkers: number;
    totalChecks: number;
};

type ReportsDeliverySnapshot = {
    updatedAt: string;
    state: 'idle' | 'running' | 'generated' | 'verified' | 'attention';
    generationStatus: 'idle' | 'running' | 'success' | 'error';
    generationProgress: number;
    filteredCount: number;
    isPackagingEvidence: boolean;
    verificationChecked: boolean;
    verificationPassed: boolean;
};

type UpgradePlanStatus = 'todo' | 'verifying' | 'done';

type UpgradePlanItem = {
    id: string;
    phase: '검증' | '구현' | '안정화';
    title: string;
    summary: string;
    page: Page;
    status: UpgradePlanStatus;
};

const UPGRADE_PLAN_DEFAULT_ITEMS: UpgradePlanItem[] = [
    {
        id: 'intro-mockup-layout',
        phase: '검증',
        title: '목업형 소개 레이아웃 정합성 확인',
        summary: '밝은 보드형 구성, 모듈 카드, 정보 계층이 실제 소개 화면에 반영되었는지 점검',
        page: 'introduction',
        status: 'done',
    },
    {
        id: 'pc-mobile-composition',
        phase: '검증',
        title: 'PC + 모바일 동시 구성 품질 점검',
        summary: '대시보드와 12스크린 블록이 한 흐름으로 읽히는지 확인',
        page: 'introduction',
        status: 'done',
    },
    {
        id: 'qa-12screen-runtime',
        phase: '검증',
        title: '12스크린 QA 경보/런로그 상태 검증',
        summary: '연결 상태, 데이터 상태, 경보 항목을 점검해 실행 리스크를 줄임',
        page: 'introduction',
        status: 'verifying',
    },
    {
        id: 'dashboard-live-sync',
        phase: '구현',
        title: '메인 KPI 카드 라이브 동기화 고도화',
        summary: '소개 화면 요약 카드와 대시보드 실데이터 동기화 강화를 구현',
        page: 'dashboard',
        status: 'todo',
    },
    {
        id: 'predictive-execution-flow',
        phase: '구현',
        title: '예측-개입 실행 흐름 연결 강화',
        summary: 'predictive-analysis와 intervention-coaching 연계 UX를 강화',
        page: 'predictive-analysis',
        status: 'todo',
    },
    {
        id: 'reports-proof-polish',
        phase: '안정화',
        title: '리포트/증빙 전달 완성도 마감',
        summary: '보고서 생성과 증빙 전달 흐름을 실사용 관점으로 마감 점검',
        page: 'reports',
        status: 'todo',
    },
];

const getStoredUpgradePlanItems = (): UpgradePlanItem[] => {
    if (typeof window === 'undefined') return UPGRADE_PLAN_DEFAULT_ITEMS;
    try {
        const raw = window.localStorage.getItem(UPGRADE_PLAN_STORAGE_KEY);
        if (!raw) return UPGRADE_PLAN_DEFAULT_ITEMS;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return UPGRADE_PLAN_DEFAULT_ITEMS;

        const allowedStatus = new Set<UpgradePlanStatus>(['todo', 'verifying', 'done']);
        const allowedPhase = new Set<UpgradePlanItem['phase']>(['검증', '구현', '안정화']);

        const sanitized = parsed
            .filter((item) => item && typeof item === 'object')
            .map((item) => ({
                id: String(item.id || '').trim(),
                phase: String(item.phase || ''),
                title: String(item.title || '').trim(),
                summary: String(item.summary || '').trim(),
                page: String(item.page || '').trim() as Page,
                status: String(item.status || 'todo') as UpgradePlanStatus,
            }))
            .filter((item) => item.id && item.title && item.summary && allowedStatus.has(item.status) && allowedPhase.has(item.phase as UpgradePlanItem['phase']))
            .map((item) => ({
                ...item,
                phase: item.phase as UpgradePlanItem['phase'],
            }));

        if (sanitized.length === 0) return UPGRADE_PLAN_DEFAULT_ITEMS;
        return sanitized;
    } catch {
        return UPGRADE_PLAN_DEFAULT_ITEMS;
    }
};

const Introduction: React.FC<IntroductionProps> = ({ workerRecords, onNavigateToPage }) => {
    const [isGravityOff, setIsGravityOff] = useState(false);
    const [showAllMobileFeatures, setShowAllMobileFeatures] = useState(false);
    const [qaAlertRunlog, setQaAlertRunlog] = useState<QaAlertRunlogEntry[]>([]);
    const [upgradePlanItems, setUpgradePlanItems] = useState<UpgradePlanItem[]>(() => getStoredUpgradePlanItems());
    const [showOpenItemsOnly, setShowOpenItemsOnly] = useState(false);
    const [dashboardLiveSyncSnapshot, setDashboardLiveSyncSnapshot] = useState<DashboardLiveSyncSnapshot | null>(null);
    const [reportsDeliverySnapshot, setReportsDeliverySnapshot] = useState<ReportsDeliverySnapshot | null>(null);
    const [onePointProofSession, setOnePointProofSession] = useState<OnePointProofSession | null>(() => readOnePointProofSession());

    useEffect(() => {
        if (isGravityOff) {
            document.body.classList.add('zero-gravity-active');
        } else {
            document.body.classList.remove('zero-gravity-active');
        }
        return () => {
            document.body.classList.remove('zero-gravity-active');
        };
    }, [isGravityOff]);

    const toggleGravity = () => {
        setIsGravityOff(!isGravityOff);
    };

    useEffect(() => {
        const syncSession = () => setOnePointProofSession(readOnePointProofSession());
        syncSession();
        window.addEventListener(ONE_POINT_PROOF_SESSION_EVENT, syncSession);
        window.addEventListener('storage', syncSession);
        return () => {
            window.removeEventListener(ONE_POINT_PROOF_SESSION_EVENT, syncSession);
            window.removeEventListener('storage', syncSession);
        };
    }, []);

    useEffect(() => {
        if (!onePointProofSession?.returnedAt) return;
        window.setTimeout(() => {
            document.querySelector('[data-one-point-proof="panel"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
    }, [onePointProofSession?.returnedAt]);

    const latestUpgradeColumns = [
        PSI_CURRENT_RELEASE.highlights.slice(0, 3),
        PSI_CURRENT_RELEASE.highlights.slice(3),
    ];
    const recentOpsUpgradeNotes = [
        '모바일 하단 뒤로가기 실수 방지 정책(더블백/작업중 확인창) 전면 적용',
        'OCR · 개인리포트 · 근로자관리 화면의 뒤로가기 보호 흐름 공통화',
        'UI 모드 실험 KPI 최근 이벤트를 3건 중심으로 축약해 핵심만 즉시 확인',
    ];

    const introSummaryCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'intro-status',
            eyebrow: '지금 상태',
            title: `PSI ${PSI_APP_VERSION}의 현재 정체성과 신뢰 기반을 소개하는 화면입니다.`,
            description: '이 화면은 단순 소개서가 아니라 PSI가 왜 보호 중심 안전 파트너인지 사용자에게 처음 설명하는 진입점 역할을 합니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'intro-evidence',
            eyebrow: '판단 근거',
            title: '브랜드 원칙, 권리화 현황, 연혁, 철학, 최신 업그레이드가 함께 배치됩니다.',
            description: '제품의 기능보다 먼저 어떤 태도로 현장을 읽고 보호하는지 보여줘야 PSI의 차별성이 더 분명하게 전달됩니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'intro-action',
            eyebrow: '다음 행동',
            title: isGravityOff ? '브랜드 경험 모드를 유지한 채 핵심 메시지를 읽어보세요.' : '소개 화면에서 PSI의 보호 원칙을 먼저 이해하세요.',
            description: '사용자는 여기서 PSI가 사람을 평가하는 도구가 아니라 위험 신호를 보호 언어로 바꾸는 파트너라는 인상을 받아야 합니다.',
            tone: isGravityOff ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
    ], [isGravityOff]);

    const philosophyCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'philosophy-status',
            eyebrow: '지금 상태',
            title: '브랜드 철학이 시각 요소와 함께 설명되고 있습니다.',
            description: '방패, 비대칭 구조, AI의 눈은 각각 보호, 능동 개입, 따뜻한 관찰이라는 PSI의 태도를 시각화합니다.',
            tone: BRAND_TONE.slate,
        },
        {
            key: 'philosophy-evidence',
            eyebrow: '판단 근거',
            title: '브랜드 원칙 3가지가 실제 UX 문장 구조의 기준입니다.',
            description: '평가보다 해석, 지적보다 보완, 감시보다 보호라는 원칙은 이후 대시보드와 운영 화면의 정보 구조로 이어집니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'philosophy-action',
            eyebrow: '다음 행동',
            title: '소개 문구와 실제 제품 경험이 같은 톤으로 이어져야 합니다.',
            description: '브랜드 페이지에서 약속한 메시지가 운영 화면에서도 그대로 느껴질 때 PSI의 신뢰가 더 강해집니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
    ], []);

    const previewMetrics = useMemo(() => {
        const totalWorkers = workerRecords.length;
        const averageScore = totalWorkers > 0
            ? Math.round((workerRecords.reduce((sum, record) => sum + Number(record.safetyScore || 0), 0) / totalWorkers) * 10) / 10
            : 0;
        const highRiskWorkers = workerRecords.filter((record) => Number(record.safetyScore || 0) < 60).length;
        const alertSignals = workerRecords.filter((record) => Boolean(record.ocrErrorType) || record.secondPassStatus === 'NEEDED').length;
        const interventionTargets = workerRecords.filter((record) => {
            const score = Number(record.safetyScore || 0);
            return score < 70 || record.selfAssessedRiskLevel === '상';
        }).length;
        const taggingQueue = workerRecords.filter((record) => record.secondPassStatus === 'NEEDED' || record.secondPassStatus === 'IN_PROGRESS').length;
        const approvedRecords = workerRecords.filter((record) => record.approvalStatus === 'APPROVED' || record.reviewStatus === 'APPROVED').length;
        const qaValidationTargets = workerRecords.filter((record) => Boolean(record.ocrErrorType) || record.secondPassStatus !== 'DONE').length;

        const todayKey = new Date().toDateString();
        const todayRecords = workerRecords.filter((record) => {
            if (!record.date) return false;
            const parsed = new Date(record.date);
            return !Number.isNaN(parsed.getTime()) && parsed.toDateString() === todayKey;
        }).length;

        return {
            totalWorkers,
            averageScore,
            highRiskWorkers,
            alertSignals,
            interventionTargets,
            taggingQueue,
            approvedRecords,
            qaValidationTargets,
            todayRecords,
        };
    }, [workerRecords]);

    const topSignalPatterns = useMemo<Array<{ label: string; pct: number; color: string }>>(() => {
        const patternMap = new Map<string, number>();

        for (const record of workerRecords) {
            const weakAreas = Array.isArray(record.weakAreas) ? record.weakAreas : [];
            for (const weak of weakAreas) {
                const raw = String(weak || '').trim();
                if (!raw) continue;
                const normalized = raw.length > 8 ? raw.slice(0, 8) : raw;
                patternMap.set(normalized, (patternMap.get(normalized) || 0) + 1);
            }
        }

        const fallback = [
            { label: '반복 지각', pct: 88, color: 'bg-rose-400' },
            { label: '고강도 연속', pct: 71, color: 'bg-amber-400' },
            { label: '수면 부족', pct: 59, color: 'bg-orange-300' },
            { label: '언어 장벽', pct: 43, color: 'bg-sky-300' },
            { label: '혼잡 작업', pct: 29, color: 'bg-violet-300' },
        ];

        if (patternMap.size === 0) {
            return fallback;
        }

        const top = Array.from(patternMap.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        const maxCount = Math.max(...top.map(([, count]) => count), 1);
        const palette = ['bg-rose-400', 'bg-amber-400', 'bg-orange-300', 'bg-sky-300', 'bg-violet-300'];

        return top.map(([label, count], index) => ({
            label,
            pct: Math.max(18, Math.round((count / maxCount) * 100)),
            color: palette[index] || 'bg-indigo-300',
        }));
    }, [workerRecords]);

    const mobileFlowCards = useMemo<Array<{ title: string; desc: string; page: Page }>>(() => ([
        { title: '1. 홈 대시보드', desc: `${previewMetrics.totalWorkers}명 분석`, page: 'dashboard' },
        { title: '2. 경보 알림', desc: `전조 신호 ${previewMetrics.alertSignals}건`, page: 'site-issue-management' },
        { title: '3. 개인인지 프로파일', desc: `추가 확인 ${previewMetrics.highRiskWorkers}명`, page: 'worker-management' },
        { title: '4. 위험인지 진단', desc: `오늘 입력 ${previewMetrics.todayRecords}건`, page: 'worker-training' },
        { title: '5. 현장 컨텍스트', desc: `오늘 입력 ${previewMetrics.todayRecords}건`, page: 'field-context-input' },
        { title: '6. 행동 패턴 분석', desc: `승인 완료 ${previewMetrics.approvedRecords}건`, page: 'safety-behavior-management' },
        { title: '7. 선행 위험신호', desc: `확인 대상 ${previewMetrics.interventionTargets}건`, page: 'predictive-analysis' },
        { title: '8. 개입 추천', desc: `개입 대상 ${previewMetrics.interventionTargets}명`, page: 'intervention-coaching' },
        { title: '9. 수기 데이터 입력', desc: `태깅 대기 ${previewMetrics.taggingQueue}건`, page: 'judgment-tagging-input' },
        { title: '10. 태깅 검증', desc: `QA 대상 ${previewMetrics.qaValidationTargets}건`, page: 'ocr-analysis' },
        { title: '11. 분석 리포트', desc: `리포트 대상 ${previewMetrics.totalWorkers}명`, page: 'reports' },
        { title: '12. 메뉴/설정', desc: `현재 릴리스 ${PSI_APP_VERSION}`, page: 'settings' },
    ]), [previewMetrics, PSI_APP_VERSION]);

    const heroMobileCards = useMemo<Array<{ title: string; desc: string; page: Page }>>(() => ([
        { title: '1. 홈 대시보드', desc: `${previewMetrics.totalWorkers}명 분석`, page: 'dashboard' },
        { title: '2. 경보 알림', desc: `전조 신호 ${previewMetrics.alertSignals}건`, page: 'site-issue-management' },
        { title: '3. 작업자 프로파일', desc: `추가 확인 ${previewMetrics.highRiskWorkers}명`, page: 'worker-management' },
        { title: '4. 현장 지도 (위험)', desc: `위험 핫스팟 ${previewMetrics.alertSignals}건`, page: 'dashboard' },
        { title: '5. 선행 위험신호', desc: `확인 대상 ${previewMetrics.interventionTargets}건`, page: 'predictive-analysis' },
        { title: '6. 개입 관리', desc: `개입 대상 ${previewMetrics.interventionTargets}명`, page: 'intervention-coaching' },
        { title: '7. 데이터 입력', desc: `태깅 대기 ${previewMetrics.taggingQueue}건`, page: 'judgment-tagging-input' },
        { title: '8. 더보기', desc: '리포트/설정/검증', page: 'reports' },
    ]), [previewMetrics]);

    const mobileFeatureChecklist = useMemo<Array<{ title: string; feature: string; state: '연결됨' | '검증필요'; dataState: '데이터확인' | '데이터대기'; page: Page }>>(() => {
        const labels: Array<{ title: string; feature: string; page: Page; dataCount: number }> = [
            { title: '1. 홈 대시보드', feature: '위험 분포/KPI 요약', page: 'dashboard', dataCount: previewMetrics.totalWorkers },
            { title: '2. 경보 알림', feature: '전조 알림 우선 대응', page: 'site-issue-management', dataCount: previewMetrics.alertSignals },
            { title: '3. 개인인지 프로파일', feature: '근로자 위험 프로파일', page: 'worker-management', dataCount: previewMetrics.highRiskWorkers },
            { title: '4. 위험인지 진단', feature: '현장 진단 입력', page: 'worker-training', dataCount: previewMetrics.todayRecords },
            { title: '5. 현장 컨텍스트', feature: '작업 맥락 저장', page: 'field-context-input', dataCount: previewMetrics.todayRecords },
            { title: '6. 행동 패턴 분석', feature: '시간대/행동 패턴', page: 'safety-behavior-management', dataCount: previewMetrics.approvedRecords },
            { title: '7. 선행 위험신호', feature: '개입 우선순위 확인', page: 'predictive-analysis', dataCount: previewMetrics.interventionTargets },
            { title: '8. 개입 추천', feature: '코칭/조치 추천', page: 'intervention-coaching', dataCount: previewMetrics.interventionTargets },
            { title: '9. 수기 데이터 입력', feature: '사례 수기 입력', page: 'judgment-tagging-input', dataCount: previewMetrics.taggingQueue },
            { title: '10. 태깅 검증', feature: 'AI 결과 검증', page: 'ocr-analysis', dataCount: previewMetrics.qaValidationTargets },
            { title: '11. 분석 리포트', feature: '주간 리포트 생성', page: 'reports', dataCount: previewMetrics.totalWorkers },
            { title: '12. 메뉴/설정', feature: '환경/권한 설정', page: 'settings', dataCount: 1 },
        ];

        const availablePages = new Set<Page>(mobileFlowCards.map((card) => card.page));

        return labels.map((item) => ({
            title: item.title,
            feature: item.feature,
            page: item.page,
            state: availablePages.has(item.page) ? '연결됨' : '검증필요',
            dataState: item.dataCount > 0 ? '데이터확인' : '데이터대기',
        }));
    }, [mobileFlowCards, previewMetrics]);

    const mobileFeatureValidation = useMemo(() => {
        const total = mobileFeatureChecklist.length;
        const connected = mobileFeatureChecklist.filter((item) => item.state === '연결됨').length;
        const dataReady = mobileFeatureChecklist.filter((item) => item.dataState === '데이터확인').length;
        const warnItems = mobileFeatureChecklist.filter((item) => item.state !== '연결됨' || item.dataState !== '데이터확인').length;
        return {
            total,
            connected,
            dataReady,
            warnItems,
            allConnected: connected === total,
            hasWarnings: warnItems > 0,
        };
    }, [mobileFeatureChecklist]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            const raw = window.localStorage.getItem(QA_ALERT_RUNLOG_KEY);
            if (!raw) {
                setQaAlertRunlog([]);
                return;
            }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                setQaAlertRunlog([]);
                return;
            }

            const safeRunlog = parsed
                .filter((entry) => entry && typeof entry === 'object')
                .map((entry) => ({
                    checkedAt: String(entry.checkedAt || new Date(0).toISOString()),
                    connected: Number(entry.connected || 0),
                    dataReady: Number(entry.dataReady || 0),
                    total: Number(entry.total || 0),
                    warnItems: Number(entry.warnItems || 0),
                    hasWarnings: Boolean(entry.hasWarnings),
                    warningPages: Array.isArray(entry.warningPages)
                        ? entry.warningPages.filter((page): page is Page => typeof page === 'string')
                        : [],
                }))
                .sort((a, b) => new Date(b.checkedAt).getTime() - new Date(a.checkedAt).getTime())
                .slice(0, QA_ALERT_RUNLOG_MAX_ITEMS);

            setQaAlertRunlog(safeRunlog);
        } catch {
            setQaAlertRunlog([]);
        }
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const warningPages = mobileFeatureChecklist
            .filter((item) => item.state !== '연결됨' || item.dataState !== '데이터확인')
            .map((item) => item.page);

        const nextEntry: QaAlertRunlogEntry = {
            checkedAt: new Date().toISOString(),
            connected: mobileFeatureValidation.connected,
            dataReady: mobileFeatureValidation.dataReady,
            total: mobileFeatureValidation.total,
            warnItems: mobileFeatureValidation.warnItems,
            hasWarnings: mobileFeatureValidation.hasWarnings,
            warningPages: Array.from(new Set(warningPages)),
        };

        try {
            const previous = qaAlertRunlog[0];
            const previousSignature = previous
                ? `${previous.connected}-${previous.dataReady}-${previous.total}-${previous.warnItems}-${previous.warningPages.join('|')}`
                : '';
            const nextSignature = `${nextEntry.connected}-${nextEntry.dataReady}-${nextEntry.total}-${nextEntry.warnItems}-${nextEntry.warningPages.join('|')}`;

            if (previousSignature === nextSignature) {
                return;
            }

            const nextRunlog = [nextEntry, ...qaAlertRunlog].slice(0, QA_ALERT_RUNLOG_MAX_ITEMS);
            setQaAlertRunlog(nextRunlog);
            window.localStorage.setItem(QA_ALERT_RUNLOG_KEY, JSON.stringify(nextRunlog));
        } catch {
            // ignore storage failures
        }
    }, [mobileFeatureChecklist, mobileFeatureValidation, qaAlertRunlog]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(UPGRADE_PLAN_STORAGE_KEY, JSON.stringify(upgradePlanItems));
        } catch {
            // ignore storage failures
        }
    }, [upgradePlanItems]);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const readDashboardSnapshot = () => {
            try {
                const raw = window.localStorage.getItem(DASHBOARD_LIVE_SYNC_SNAPSHOT_KEY);
                if (!raw) {
                    setDashboardLiveSyncSnapshot(null);
                    return;
                }
                const parsed = JSON.parse(raw) as Partial<DashboardLiveSyncSnapshot>;
                if (!parsed || typeof parsed !== 'object') {
                    setDashboardLiveSyncSnapshot(null);
                    return;
                }

                const sanitized: DashboardLiveSyncSnapshot = {
                    updatedAt: String(parsed.updatedAt || ''),
                    totalWorkers: Number(parsed.totalWorkers || 0),
                    averageScore: Number(parsed.averageScore || 0),
                    highRiskWorkers: Number(parsed.highRiskWorkers || 0),
                    totalChecks: Number(parsed.totalChecks || 0),
                };

                if (!sanitized.updatedAt) {
                    setDashboardLiveSyncSnapshot(null);
                    return;
                }

                setDashboardLiveSyncSnapshot(sanitized);
            } catch {
                setDashboardLiveSyncSnapshot(null);
            }
        };

        readDashboardSnapshot();
        const onStorage = (event: StorageEvent) => {
            if (!event.key || event.key === DASHBOARD_LIVE_SYNC_SNAPSHOT_KEY) {
                readDashboardSnapshot();
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const readReportsSnapshot = () => {
            try {
                const raw = window.localStorage.getItem(REPORTS_DELIVERY_SNAPSHOT_KEY);
                if (!raw) {
                    setReportsDeliverySnapshot(null);
                    return;
                }
                const parsed = JSON.parse(raw) as Partial<ReportsDeliverySnapshot>;
                if (!parsed || typeof parsed !== 'object' || !parsed.updatedAt) {
                    setReportsDeliverySnapshot(null);
                    return;
                }
                const sanitized: ReportsDeliverySnapshot = {
                    updatedAt: String(parsed.updatedAt || ''),
                    state: (parsed.state as ReportsDeliverySnapshot['state']) || 'idle',
                    generationStatus: (parsed.generationStatus as ReportsDeliverySnapshot['generationStatus']) || 'idle',
                    generationProgress: Number(parsed.generationProgress || 0),
                    filteredCount: Number(parsed.filteredCount || 0),
                    isPackagingEvidence: Boolean(parsed.isPackagingEvidence),
                    verificationChecked: Boolean(parsed.verificationChecked),
                    verificationPassed: Boolean(parsed.verificationPassed),
                };
                setReportsDeliverySnapshot(sanitized);
            } catch {
                setReportsDeliverySnapshot(null);
            }
        };

        readReportsSnapshot();
        const onStorage = (event: StorageEvent) => {
            if (!event.key || event.key === REPORTS_DELIVERY_SNAPSHOT_KEY) {
                readReportsSnapshot();
            }
        };

        window.addEventListener('storage', onStorage);
        window.addEventListener(REPORTS_DELIVERY_SNAPSHOT_EVENT, readReportsSnapshot);
        return () => {
            window.removeEventListener('storage', onStorage);
            window.removeEventListener(REPORTS_DELIVERY_SNAPSHOT_EVENT, readReportsSnapshot);
        };
    }, []);

    const isDashboardSyncFresh = useMemo(() => {
        if (!dashboardLiveSyncSnapshot?.updatedAt) return false;
        const updatedAtMs = new Date(dashboardLiveSyncSnapshot.updatedAt).getTime();
        if (Number.isNaN(updatedAtMs)) return false;
        return Date.now() - updatedAtMs <= 30 * 60 * 1000;
    }, [dashboardLiveSyncSnapshot]);

    const reportsUpgradeStatus = useMemo<UpgradePlanStatus>(() => {
        if (!reportsDeliverySnapshot) return 'todo';
        if (reportsDeliverySnapshot.state === 'verified' || reportsDeliverySnapshot.verificationPassed) return 'done';
        if (
            reportsDeliverySnapshot.state === 'running'
            || reportsDeliverySnapshot.state === 'generated'
            || reportsDeliverySnapshot.state === 'attention'
            || reportsDeliverySnapshot.generationStatus === 'running'
            || reportsDeliverySnapshot.generationStatus === 'error'
            || reportsDeliverySnapshot.generationStatus === 'success'
            || reportsDeliverySnapshot.verificationChecked
        ) {
            return 'verifying';
        }
        return 'todo';
    }, [reportsDeliverySnapshot]);

    useEffect(() => {
        setUpgradePlanItems((prev) => prev.map((item) => {
            if (item.id === 'qa-12screen-runtime') {
                const nextStatus: UpgradePlanStatus = mobileFeatureValidation.hasWarnings ? 'verifying' : 'done';
                return item.status === nextStatus ? item : { ...item, status: nextStatus };
            }

            if (item.id === 'dashboard-live-sync') {
                const nextStatus: UpgradePlanStatus = dashboardLiveSyncSnapshot
                    ? (isDashboardSyncFresh ? 'done' : 'verifying')
                    : 'todo';
                return item.status === nextStatus ? item : { ...item, status: nextStatus };
            }

            if (item.id === 'reports-proof-polish') {
                return item.status === reportsUpgradeStatus ? item : { ...item, status: reportsUpgradeStatus };
            }

            return item;
        }));
    }, [mobileFeatureValidation.hasWarnings, dashboardLiveSyncSnapshot, isDashboardSyncFresh, reportsUpgradeStatus]);

    const cycleUpgradeTaskStatus = useCallback((taskId: string) => {
        setUpgradePlanItems((prev) => prev.map((item) => {
            if (item.id !== taskId) return item;
            if (item.status === 'todo') return { ...item, status: 'verifying' };
            if (item.status === 'verifying') return { ...item, status: 'done' };
            return { ...item, status: 'todo' };
        }));
    }, []);

    const upgradePlanSummary = useMemo(() => {
        const total = upgradePlanItems.length;
        const done = upgradePlanItems.filter((item) => item.status === 'done').length;
        const verifying = upgradePlanItems.filter((item) => item.status === 'verifying').length;
        const todo = total - done - verifying;
        const completionRate = total > 0 ? Math.round((done / total) * 100) : 0;
        return { total, done, verifying, todo, completionRate };
    }, [upgradePlanItems]);

    const nextUpgradeTarget = useMemo(() => {
        const verifying = upgradePlanItems.find((item) => item.status === 'verifying');
        if (verifying) return verifying;
        return upgradePlanItems.find((item) => item.status === 'todo') || null;
    }, [upgradePlanItems]);

    const visibleUpgradePlanItems = useMemo(() => {
        if (!showOpenItemsOnly) return upgradePlanItems;
        return upgradePlanItems.filter((item) => item.status !== 'done');
    }, [upgradePlanItems, showOpenItemsOnly]);

    const startNextUpgradeTarget = useCallback(() => {
        if (!nextUpgradeTarget) return;
        setUpgradePlanItems((prev) => prev.map((item) => {
            if (item.id !== nextUpgradeTarget.id) return item;
            if (item.status === 'todo') return { ...item, status: 'verifying' };
            return item;
        }));
        onNavigateToPage(nextUpgradeTarget.page);
    }, [nextUpgradeTarget, onNavigateToPage]);

    const heroPrinciples: Array<{ label: string; icon: React.ReactNode }> = [
        {
            label: '인간 중심',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <circle cx="10" cy="7" r="3" />
                    <path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" />
                </svg>
            ),
        },
        {
            label: '예측 · 개입',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M3 14l4-5 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="15" cy="5" r="2" />
                </svg>
            ),
        },
        {
            label: '안전 문화',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <path d="M10 2l6 3v5c0 4-2.7 6.5-6 8-3.3-1.5-6-4-6-8V5l6-3z" strokeLinejoin="round" />
                    <path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            ),
        },
        {
            label: '데이터 기반',
            icon: (
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
                    <rect x="2" y="12" width="3" height="6" rx="1" />
                    <rect x="8.5" y="8" width="3" height="10" rx="1" />
                    <rect x="15" y="4" width="3" height="14" rx="1" />
                </svg>
            ),
        },
    ];

    const productStorySteps = [
        {
            title: '현장 문제',
            summary: '수기로 작성된 위험성평가 기록지는 현장에는 쌓이지만, 누가 어떤 위험을 이해하지 못했는지 바로 보이기 어렵습니다.',
            points: ['외국인 근로자 모국어 전달 한계', '수기 이미지 판독 품질 편차', '교육·추적관리 연결 부족'],
        },
        {
            title: 'PSI 전환',
            summary: 'PSI는 종이 기록지를 OCR로 구조화하고, 관리자 검증을 거쳐 개인 리포트와 교육 안내로 다시 현장에 돌려보냅니다.',
            points: ['OCR 분석과 관리자 보호 해석', '개인 안전역량 지표 자동 반영', '모국어 안내와 개선 이력 보존'],
        },
        {
            title: '구매자가 확인하는 가치',
            summary: '도입자는 단순 작성 여부가 아니라 근로자 이해 수준, 위험 신호, 개입 결과, 실증 증빙을 한 흐름으로 확인합니다.',
            points: ['월별 추적관리 자료', '리포트·증빙 패키지', '현장별 교육 환류 데이터'],
        },
    ];

    const proofChips = ['수기 OCR', '모국어 안내', '개인 리포트', '월별 추적관리', '교육 환류', '실증 증빙'];

    const actualProgramScreens: Array<{ label: string; desc: string; stat: string; page: Page }> = [
        { label: '현장 안전 관제센터', desc: '현장 작성물, 위험 신호, 개선 이행을 한 화면에서 확인', stat: `기록 ${previewMetrics.totalWorkers}건`, page: 'dashboard' },
        { label: '위험성평가 분석', desc: '수기 이미지와 PDF를 OCR로 읽고 관리자 검증까지 연결', stat: `확인 ${previewMetrics.qaValidationTargets}건`, page: 'ocr-analysis' },
        { label: '근로자 의견 분석', desc: '근로자 의견과 응답 경향을 위험 신호로 정리', stat: '의견 분석', page: 'survey-intelligence' },
        { label: '안전성과 분석', desc: '개선 이행률과 성과 추이를 현장별로 확인', stat: `승인 ${previewMetrics.approvedRecords}건`, page: 'performance-analysis' },
        { label: '월별 계도 리포트', desc: '월별 위험 항목을 익명화해 계도자료로 정리', stat: '월별 분류', page: 'monthly-guidance-report' },
        { label: '위험성평가 교육자료', desc: '분석 결과를 교육자료 제작 흐름으로 연결', stat: '교육자료', page: 'a4-education-material' },
        { label: '다국어 교육 / QR', desc: '외국인 근로자에게 모국어 교육과 확인 경로 제공', stat: '모국어', page: 'admin-training' },
        { label: '근로자 리포트', desc: '개인별 안전역량과 관리자 보호 해석을 리포트화', stat: `대상 ${previewMetrics.totalWorkers}명`, page: 'reports' },
        { label: '시스템 설정', desc: 'API, 가중치, 권한, 운영 기준을 현장에 맞게 조정', stat: '운영 설정', page: 'settings' },
    ];

    const actualMobileTabs: Array<{ label: string; desc: string; page: Page }> = [
        { label: '홈', desc: '현장 안전 관제센터', page: 'dashboard' },
        { label: '위험분석', desc: 'OCR 분석과 확인', page: 'ocr-analysis' },
        { label: '계도', desc: '월별 리포트', page: 'monthly-guidance-report' },
        { label: '교육/QR', desc: '다국어 교육 전달', page: 'admin-training' },
        { label: '더보기', desc: '설정과 리포트', page: 'settings' },
    ];

    const actualMobileActions: Array<{ label: string; desc: string; page: Page }> = [
        { label: 'OCR 분석', desc: '현장에서 촬영한 수기 기록지를 바로 분석', page: 'ocr-analysis' },
        { label: '근로자 리포트', desc: '개인별 보호 해석과 교육 필요 신호 확인', page: 'reports' },
        { label: '다국어 QR', desc: '모국어 교육 안내와 확인 경로 전달', page: 'admin-training' },
    ];

    const onePointProofSteps: Array<{ marker: OnePointProofStageId; title: string; desc: string; page: Page; tone: string }> = [
        {
            marker: 'stage-scan',
            title: '1. 기록지 1장 촬영',
            desc: '모바일이나 PC에서 수기 위험성평가 기록지를 넣고 OCR 분석을 시작합니다.',
            page: 'ocr-analysis',
            tone: BRAND_TONE.indigoWhite,
        },
        {
            marker: 'stage-q1-separation',
            title: '2. 공종과 Q1 분리',
            desc: '공종은 근로자의 기본 작업이고, Q1은 그 작업 안에서 오늘 가장 위험하다고 느낀 세부작업으로 따로 봅니다.',
            page: 'ocr-analysis',
            tone: BRAND_TONE.amberWhite,
        },
        {
            marker: 'stage-manager-review',
            title: '3. 관리자 검증',
            desc: 'AI 판단을 그대로 확정하지 않고 한국어 보호 해석, 점수 근거, 수정 이력을 관리자가 확인합니다.',
            page: 'ocr-analysis',
            tone: BRAND_TONE.slateWhite,
        },
        {
            marker: 'stage-native-feedback',
            title: '4. 모국어·리포트·추적',
            desc: '수정된 판단은 모국어 안내, 개인 안전역량, 월별 추적자료로 다시 연결됩니다.',
            page: 'reports',
            tone: BRAND_TONE.emeraldWhite,
        },
    ];

    const onePointProofMetrics = [
        { marker: 'metric-two-minute', label: '시연 시간', value: '2분', desc: '촬영부터 교육 환류까지 한 장면으로 설명' },
        { marker: 'metric-one-record', label: '시작 단위', value: '1장', desc: '수기 기록지 한 장이 분석 데이터로 전환' },
        { marker: 'metric-closed-loop', label: '닫힌 흐름', value: '4단계', desc: 'OCR, 검증, 전달, 추적이 끊기지 않음' },
    ];

    const completedOnePointProofStages = onePointProofSession?.completedStageIds || [];
    const completedOnePointProofStageSet = new Set<OnePointProofStageId>(completedOnePointProofStages);
    const nextOnePointProofStage = getNextOnePointProofStage(completedOnePointProofStages);
    const onePointProofProgressLabel = completedOnePointProofStages.length >= onePointProofSteps.length
        ? '4단계 시연 흐름을 모두 확인했습니다.'
        : nextOnePointProofStage
            ? `다음 확인: ${nextOnePointProofStage.title}`
            : '다음 확인 대기';

    const handleOpenOnePointProofStage = (stageId: OnePointProofStageId, page: Page) => {
        setOnePointProofSession(startOnePointProofStage(stageId));
        onNavigateToPage(page);
    };

    const handleClearOnePointProof = () => {
        clearOnePointProofSession();
        setOnePointProofSession(null);
    };

    const getStepTone = (stepNoNum: number) => {
        if (stepNoNum === 2 || stepNoNum === 7 || stepNoNum === 8) {
            return {
                cardBorder: BRAND_TONE.amberHover,
                badgeBg: 'bg-amber-500',
                panelBg: 'bg-amber-50',
                bars: ['bg-amber-100', 'bg-amber-200', 'bg-amber-300'],
                descText: 'text-amber-700',
            };
        }

        if (stepNoNum === 10) {
            return {
                cardBorder: BRAND_TONE.violetHover,
                badgeBg: 'bg-violet-600',
                panelBg: 'bg-violet-50',
                bars: ['bg-violet-100', 'bg-violet-200', 'bg-violet-300'],
                descText: 'text-violet-700',
            };
        }

        if (stepNoNum === 5 || stepNoNum === 9 || stepNoNum === 11) {
            return {
                cardBorder: BRAND_TONE.emeraldHover,
                badgeBg: 'bg-emerald-600',
                panelBg: 'bg-emerald-50',
                bars: ['bg-emerald-100', 'bg-emerald-200', 'bg-emerald-300'],
                descText: 'text-emerald-700',
            };
        }

        return {
            cardBorder: BRAND_TONE.indigoSoftHover,
            badgeBg: 'bg-indigo-600',
            panelBg: 'bg-slate-50',
            bars: ['bg-indigo-100', 'bg-violet-100', 'bg-sky-100'],
            descText: 'text-indigo-700',
        };
    };

    const getCore8CardStatus = (stepNoNum: number) => {
        if (stepNoNum === 1) {
            return previewMetrics.totalWorkers > 0
                ? { label: 'LIVE', tone: 'bg-emerald-100 text-emerald-700' }
                : { label: 'SAMPLE', tone: 'bg-slate-200 text-slate-600' };
        }

        if (stepNoNum === 2) {
            return previewMetrics.alertSignals > 0
                ? { label: '주의', tone: 'bg-amber-100 text-amber-700' }
                : { label: '정상', tone: 'bg-emerald-100 text-emerald-700' };
        }

        if (stepNoNum === 3) {
            return previewMetrics.highRiskWorkers > 0
                ? { label: '관찰중', tone: 'bg-amber-100 text-amber-700' }
                : { label: '정상', tone: 'bg-emerald-100 text-emerald-700' };
        }

        if (stepNoNum === 4) {
            return previewMetrics.alertSignals > 0
                ? { label: '핫스팟', tone: 'bg-rose-100 text-rose-700' }
                : { label: '지도정상', tone: 'bg-emerald-100 text-emerald-700' };
        }

        if (stepNoNum === 5) {
            return previewMetrics.interventionTargets > 0
                ? { label: '예측중', tone: 'bg-indigo-100 text-indigo-700' }
                : { label: '대기', tone: 'bg-slate-200 text-slate-600' };
        }

        if (stepNoNum === 6) {
            return previewMetrics.interventionTargets > 0
                ? { label: '개입필요', tone: 'bg-amber-100 text-amber-700' }
                : { label: '대기', tone: 'bg-slate-200 text-slate-600' };
        }

        if (stepNoNum === 7) {
            return previewMetrics.taggingQueue > 0
                ? { label: '입력대기', tone: 'bg-violet-100 text-violet-700' }
                : { label: '정상', tone: 'bg-emerald-100 text-emerald-700' };
        }

        if (stepNoNum === 8) {
            const isVerified = reportsDeliverySnapshot?.state === 'verified' || reportsDeliverySnapshot?.verificationPassed;
            return isVerified
                ? { label: '검증완료', tone: 'bg-emerald-100 text-emerald-700' }
                : { label: '확인필요', tone: 'bg-indigo-100 text-indigo-700' };
        }

        return { label: 'READY', tone: 'bg-slate-200 text-slate-600' };
    };

    const getCore8CardCTA = (stepNoNum: number) => {
        if (stepNoNum === 1) return '대시보드 열기';
        if (stepNoNum === 2) return '경보 확인';
        if (stepNoNum === 3) return '프로파일 보기';
        if (stepNoNum === 4) return '위험지도 보기';
        if (stepNoNum === 5) return '예측 열기';
        if (stepNoNum === 6) return '개입 실행';
        if (stepNoNum === 7) return '입력 시작';
        if (stepNoNum === 8) return '리포트 이동';
        return '열기';
    };

    return (
        <div className="space-y-12 pb-12">
            <div className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-slate-100 p-4 shadow-xl sm:p-5 lg:p-6 card-gravity-target">
                <div className="relative z-10 space-y-3.5 sm:space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 sm:px-4.5 sm:py-3.5">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex items-start gap-3">
                                <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${BRAND_TONE.indigo}`}>
                                    <BrandPhilosophyLogo className="h-8 w-8" />
                                </div>
                                <div className="max-w-3xl">
                                    <p className="text-[10px] font-black text-indigo-500">PSI 브랜드 스토리 / 상품 소개</p>
                                    <h1 className="mt-1 text-[24px] sm:text-[28px] leading-tight font-black text-slate-900 break-keep">종이 위험성평가 기록지를 현장 보호 데이터로 바꾼 이야기</h1>
                                    <p className="mt-2 text-[11px] sm:text-[12px] font-semibold leading-relaxed text-slate-600 break-keep">
                                        PSI는 수기 기록지에 담긴 근로자의 위험 인식, 언어 장벽, 교육 필요 신호를 OCR 분석과 관리자 검증으로 구조화하고 개인 리포트와 추적 교육까지 연결하는 Human Risk Intelligence 플랫폼입니다.
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {proofChips.map((chip) => (
                                            <span key={chip} className={`rounded-full border px-2 py-1 text-[9px] font-black text-indigo-700 ${BRAND_TONE.indigoSoft}`}>
                                                {chip}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {heroPrinciples.map((item) => (
                                    <div key={item.label} className={`rounded-xl border px-2.5 py-2 text-center ${BRAND_TONE.indigoSoft}`}>
                                        <span className="flex justify-center text-indigo-500">{item.icon}</span>
                                        <p className="mt-1 text-[10px] font-black text-indigo-700">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
                        {productStorySteps.map((step, index) => (
                            <div key={step.title} className={`rounded-2xl border px-3.5 py-3 shadow-sm ${BRAND_TONE.slateWhite}`}>
                                <div className="flex items-center gap-2">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-black text-white">{index + 1}</span>
                                    <p className="text-[12px] font-black text-slate-900">{step.title}</p>
                                </div>
                                <p className="mt-2 text-[10px] sm:text-[11px] font-semibold leading-relaxed text-slate-600 break-keep">{step.summary}</p>
                                <div className="mt-2 flex flex-wrap gap-1">
                                    {step.points.map((point) => (
                                        <span key={point} className="rounded-full bg-slate-100 px-2 py-1 text-[8px] font-black text-slate-600">
                                            {point}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1.14fr_1fr]">
                        <section className="rounded-3xl border border-indigo-200 bg-white p-3.5 shadow-sm">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <div className="inline-flex items-center rounded-full bg-indigo-600 px-3 py-1 text-[10px] font-black text-white">실제 프로그램 기능 연결</div>
                                    <p className="mt-1.5 text-[10px] font-bold text-slate-500 break-keep">아래 카드는 이미지 목업이 아니라 현재 프로그램의 실제 메뉴와 직접 연결됩니다.</p>
                                </div>
                                <p className="text-[10px] font-bold text-slate-500 break-keep">수기 기록 → OCR 분석 → 리포트/교육 → 추적관리</p>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {actualProgramScreens.map((screen) => (
                                    <button
                                        key={screen.label}
                                        type="button"
                                        onClick={() => onNavigateToPage(screen.page)}
                                        className={`rounded-2xl border bg-white px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${BRAND_TONE.indigoWhite}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[12px] font-black leading-tight text-slate-900 break-keep">{screen.label}</p>
                                            <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-[8px] font-black text-indigo-700">{screen.stat}</span>
                                        </div>
                                        <p className="mt-1.5 text-[10px] font-semibold leading-relaxed text-slate-500 break-keep">{screen.desc}</p>
                                    </button>
                                ))}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => onNavigateToPage('dashboard')}
                                    className="rounded-xl bg-indigo-600 px-3 py-2 text-[11px] font-black text-white transition duration-200 hover:bg-indigo-500"
                                >
                                    현장 안전 관제센터 열기
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onNavigateToPage('ocr-analysis')}
                                    className={`rounded-xl border px-3 py-2 text-[11px] font-black text-indigo-700 transition duration-200 hover:bg-indigo-50 ${BRAND_TONE.indigoWhite}`}
                                >
                                    위험성평가 분석 열기
                                </button>
                            </div>
                        </section>

                        <section className={`rounded-3xl border p-3.5 shadow-sm ${BRAND_TONE.indigoSoft70}`}>
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <div className="inline-flex items-center rounded-full bg-indigo-500 px-3 py-1 text-[10px] font-black text-white">모바일 실제 메뉴 흐름</div>
                                    <p className="mt-1.5 text-[10px] font-bold text-slate-500 break-keep">현재 모바일 하단 탭과 같은 이름으로 구성했습니다.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowAllMobileFeatures((prev) => !prev)}
                                    className={`rounded-xl border px-2.5 py-1.5 text-[10px] font-black text-indigo-700 transition duration-200 hover:bg-indigo-50 ${BRAND_TONE.indigoWhite}`}
                                >
                                    {showAllMobileFeatures ? '기능 점검 접기' : '기능 연결 점검'}
                                </button>
                            </div>
                            <div className="rounded-2xl border border-indigo-100 bg-white/90 p-3.5">
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
                                    {actualMobileTabs.map((tabItem, index) => (
                                        <button
                                            key={tabItem.label}
                                            type="button"
                                            onClick={() => onNavigateToPage(tabItem.page)}
                                            className={`rounded-2xl border px-2 py-3 text-center transition duration-200 ${BRAND_TONE.slateWhiteHoverIndigo}`}
                                        >
                                            <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700">{index + 1}</span>
                                            <p className="mt-1.5 text-[10px] font-black text-slate-800">{tabItem.label}</p>
                                            <p className="mt-0.5 text-[8px] font-semibold leading-tight text-slate-500 break-keep">{tabItem.desc}</p>
                                        </button>
                                    ))}
                                </div>
                                <div className={`mt-3 rounded-2xl border p-3 ${BRAND_TONE.slate}`}>
                                    <p className="text-[10px] font-black text-slate-700">현장 핵심 실행 3단계</p>
                                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {actualMobileActions.map((action) => (
                                            <button
                                                key={action.label}
                                                type="button"
                                                onClick={() => onNavigateToPage(action.page)}
                                                className={`rounded-xl border px-2.5 py-2 text-left transition duration-200 ${BRAND_TONE.slateWhiteHoverIndigo}`}
                                            >
                                                <p className="text-[10px] font-black text-indigo-700">{action.label}</p>
                                                <p className="mt-0.5 text-[8px] font-semibold leading-tight text-slate-500 break-keep">{action.desc}</p>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            {showAllMobileFeatures && (
                                <div className="mt-2.5 rounded-2xl border border-indigo-100 bg-white/90 p-2.5">
                                    {mobileFeatureValidation.hasWarnings ? (
                                        <div className={`mb-2 rounded-xl border px-2.5 py-2 ${BRAND_TONE.amber}`}>
                                            <p className="text-[9px] font-black text-amber-700">기능 점검 · 확인 필요 {mobileFeatureValidation.warnItems}건</p>
                                            <p className="mt-0.5 text-[8px] font-semibold text-amber-700/90">현장 데이터 대기 항목이 있어 실제 운영 데이터가 쌓이면 자동으로 갱신됩니다.</p>
                                        </div>
                                    ) : (
                                        <div className={`mb-2 rounded-xl border px-2.5 py-2 ${BRAND_TONE.emerald}`}>
                                            <p className="text-[9px] font-black text-emerald-700">기능 점검 · 연결 상태 정상</p>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-[10px] font-black text-indigo-700">기능 연결 상태</p>
                                        <div className="flex items-center gap-1.5 text-[8px] font-black">
                                            <span className={`rounded-full px-1.5 py-0.5 ${mobileFeatureValidation.allConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                연결 {mobileFeatureValidation.connected}/{mobileFeatureValidation.total}
                                            </span>
                                            <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-indigo-700">
                                                데이터 {mobileFeatureValidation.dataReady}/{mobileFeatureValidation.total}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                                        {mobileFeatureChecklist.map((item) => (
                                            <button
                                                key={item.title}
                                                type="button"
                                                onClick={() => onNavigateToPage(item.page)}
                                                className={`rounded-xl border px-2 py-1.5 text-left ${item.state !== '연결됨' || item.dataState !== '데이터확인' ? BRAND_TONE.amberSoft70 : BRAND_TONE.slate}`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className="text-[9px] font-black text-slate-700 leading-tight">{item.title}</p>
                                                    <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-black ${item.state === '연결됨' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{item.state}</span>
                                                </div>
                                                <div className="mt-0.5 flex items-center justify-between gap-2">
                                                    <p className="text-[8px] font-semibold text-slate-500 leading-tight">{item.feature}</p>
                                                    <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black ${item.dataState === '데이터확인' ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'}`}>{item.dataState}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>

                    <section data-one-point-proof="panel" className={`rounded-3xl border p-4 shadow-sm ${BRAND_TONE.slateWhite}`}>
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-3xl">
                                <div className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-[10px] font-black text-white">2분 원포인트 증명 모드</div>
                                <h2 className="mt-2 text-[20px] font-black leading-tight text-slate-900 sm:text-[24px]">기록지 1장이 근로자 보호·교육·추적자료로 바뀌는 장면</h2>
                                <p className="mt-2 text-[11px] font-semibold leading-relaxed text-slate-600 sm:text-[12px] break-keep">
                                    공모전, 바이어 미팅, 내부 보고에서는 기능을 길게 설명하기보다 한 장의 수기 기록지가 OCR 분석, 관리자 검증, 모국어 전달, 월별 추적관리로 이어지는 흐름을 바로 보여주는 것이 핵심입니다.
                                </p>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center">
                                {onePointProofMetrics.map((metric) => (
                                    <div key={metric.marker} data-one-point-proof={metric.marker} className={`min-w-[86px] rounded-2xl border px-2.5 py-2 ${BRAND_TONE.indigoSoft70}`}>
                                        <p className="text-[9px] font-black text-indigo-500">{metric.label}</p>
                                        <p className="mt-1 text-[18px] font-black text-slate-900">{metric.value}</p>
                                        <p className="mt-0.5 text-[8px] font-semibold leading-tight text-slate-500 break-keep">{metric.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {onePointProofSession?.active && (
                            <div data-one-point-proof="progress-state" className={`mt-4 flex flex-col gap-2 rounded-2xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${BRAND_TONE.emeraldSoft80}`}>
                                <div>
                                    <p className="text-[10px] font-black text-emerald-700">시연 진행 중 · 완료 {completedOnePointProofStages.length}/{onePointProofSteps.length}</p>
                                    <p data-one-point-proof="next-stage" className="mt-1 text-[12px] font-black text-slate-900 break-keep">{onePointProofProgressLabel}</p>
                                    <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-600 break-keep">기능 화면에서 확인 후 돌아오면 이 자리에서 다음 단계를 이어서 보여줍니다.</p>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5 text-[10px] font-black sm:min-w-[180px]">
                                    <button
                                        type="button"
                                        data-one-point-proof="action-restart"
                                        onClick={handleClearOnePointProof}
                                        className={`rounded-xl border px-2.5 py-2 text-slate-700 hover:bg-slate-50 ${BRAND_TONE.slateWhite}`}
                                    >
                                        처음부터
                                    </button>
                                    <button
                                        type="button"
                                        data-one-point-proof="action-end-session"
                                        onClick={handleClearOnePointProof}
                                        className={`rounded-xl border px-2.5 py-2 text-emerald-700 hover:bg-emerald-50 ${BRAND_TONE.emeraldWhite}`}
                                    >
                                        시연 종료
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-4">
                            {onePointProofSteps.map((step) => {
                                const isCompleted = completedOnePointProofStageSet.has(step.marker);
                                const isNext = nextOnePointProofStage?.id === step.marker;
                                const cardTone = isCompleted ? BRAND_TONE.emeraldWhite : step.tone;
                                return (
                                    <button
                                        key={step.marker}
                                        type="button"
                                        data-one-point-proof={step.marker}
                                        onClick={() => handleOpenOnePointProofStage(step.marker, step.page)}
                                        className={`min-h-[118px] rounded-2xl border px-3 py-3 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${cardTone} ${isNext ? 'ring-2 ring-indigo-400 ring-offset-2' : ''}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-[12px] font-black text-slate-900 break-keep">{step.title}</p>
                                            <span data-one-point-proof={`state-${step.marker}`} className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-black ${isCompleted ? 'bg-emerald-100 text-emerald-700' : isNext ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                                                {isCompleted ? '완료' : isNext ? '다음' : '대기'}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-[10px] font-semibold leading-relaxed text-slate-600 break-keep">{step.desc}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <div className={`mt-4 flex flex-col gap-2 rounded-2xl border px-3 py-3 sm:flex-row sm:items-center sm:justify-between ${BRAND_TONE.indigoSoft50}`}>
                            <p className="text-[11px] font-bold leading-relaxed text-slate-700 break-keep">
                                발표 문장: “PSI는 OCR 결과를 보여주는 데서 끝나지 않고, 공종과 Q1 실제 위험작업을 분리해 관리자 검증 후 모국어 안내와 개인 안전역량, 월별 추적관리까지 이어줍니다.”
                            </p>
                            <div className="grid grid-cols-2 gap-1.5 text-[10px] font-black sm:min-w-[330px]">
                                <button type="button" data-one-point-proof="action-ocr" onClick={() => handleOpenOnePointProofStage('stage-scan', 'ocr-analysis')} className="rounded-xl bg-indigo-600 px-2.5 py-2 text-white hover:bg-indigo-500">OCR 시연</button>
                                <button type="button" data-one-point-proof="action-report" onClick={() => handleOpenOnePointProofStage('stage-native-feedback', 'reports')} className={`rounded-xl border px-2.5 py-2 text-indigo-700 hover:bg-indigo-50 ${BRAND_TONE.indigoWhite}`}>리포트</button>
                                <button type="button" data-one-point-proof="action-native-guidance" onClick={() => handleOpenOnePointProofStage('stage-native-feedback', 'admin-training')} className={`rounded-xl border px-2.5 py-2 text-emerald-700 hover:bg-emerald-50 ${BRAND_TONE.emeraldWhite}`}>모국어 안내</button>
                                <button type="button" data-one-point-proof="action-tracking" onClick={() => handleOpenOnePointProofStage('stage-native-feedback', 'monthly-guidance-report')} className={`rounded-xl border px-2.5 py-2 text-slate-700 hover:bg-slate-50 ${BRAND_TONE.slateWhite}`}>월별 추적</button>
                            </div>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-600">WHY PSI</p>
                            <p className="mt-2 text-[10px] sm:text-[11px] font-semibold leading-relaxed text-slate-600 break-keep">PSI는 작성된 종이를 보관하는 프로그램이 아니라, 근로자가 무엇을 위험으로 이해했고 어떤 보호 안내가 필요한지 증명하는 현장 안전 인텔리전스입니다.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-600">BRANDING MARK</p>
                            <div className="mt-2 flex items-center gap-2">
                                <BrandPhilosophyLogo className="h-8 w-8" />
                                <p className="text-xl font-black text-indigo-600">psi</p>
                            </div>
                            <p className="mt-2 text-[9px] sm:text-[10px] font-semibold leading-relaxed text-slate-500">높아지는 위험 전조를 먼저 읽고 개입하는 보호 흐름</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-600">COLOR SYSTEM</p>
                            <div className="mt-2 space-y-1.5">
                                {[
                                    { bg: 'bg-indigo-500', hex: '#6366F1', name: 'Primary' },
                                    { bg: 'bg-emerald-500', hex: '#10B981', name: 'Safe' },
                                    { bg: 'bg-rose-500', hex: '#F43F5E', name: 'Risk' },
                                    { bg: 'bg-slate-900', hex: '#0F172A', name: 'Dark' },
                                    { bg: 'bg-slate-200', hex: '#E2E8F0', name: 'Base' },
                                ].map(({ bg, hex, name }) => (
                                    <div key={hex} className="flex items-center gap-2">
                                        <div className={`h-4 w-4 rounded-md shrink-0 ${bg}`}></div>
                                        <p className="text-[8px] font-black text-slate-500 w-10 shrink-0">{name}</p>
                                        <p className="text-[8px] font-mono text-slate-400">{hex}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-600">TYPOGRAPHY</p>
                            <p className="mt-1.5 text-xl font-black text-slate-800 leading-tight">Pretendard</p>
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">가나다 ABC 123</p>
                            <p className="text-[9px] font-semibold text-slate-400 leading-tight">안전·현장·보호 / Safety · Risk</p>
                            <p className="text-[9px] font-semibold text-slate-400 mt-0.5">运営 · 안전관리 · Sécurité</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                            <p className="text-[10px] font-black text-indigo-600">ICONOGRAPHY</p>
                            <div className="mt-2 grid grid-cols-3 gap-1">
                                {[
                                    { title: '사람', path: <><circle cx="10" cy="7" r="3" /><path d="M3 17c0-3.3 3.1-6 7-6s7 2.7 7 6" strokeLinecap="round" /></> },
                                    { title: '예측', path: <><path d="M3 14l4-5 3 3 4-6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="15" cy="5" r="2" /></> },
                                    { title: '보호', path: <><path d="M10 2l6 3v5c0 4-2.7 6.5-6 8-3.3-1.5-6-4-6-8V5l6-3z" strokeLinejoin="round" /><path d="M7 10l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></> },
                                    { title: '추이', path: <><path d="M2 15l5-5 3 3 5-7" strokeLinecap="round" strokeLinejoin="round" /></> },
                                    { title: '연결', path: <><circle cx="5" cy="10" r="2" /><circle cx="15" cy="5" r="2" /><circle cx="15" cy="15" r="2" /><path d="M7 10l6-4M7 10l6 4" strokeLinecap="round" /></> },
                                    { title: '데이터', path: <><rect x="2" y="12" width="3" height="6" rx="1" /><rect x="8.5" y="8" width="3" height="10" rx="1" /><rect x="15" y="4" width="3" height="14" rx="1" /></> },
                                ].map(({ title, path }) => (
                                    <span key={title} className={`flex flex-col items-center rounded-lg border px-1 py-1.5 gap-0.5 ${BRAND_TONE.slate}`}>
                                        <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 text-indigo-500" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">{path}</svg>
                                        <span className="text-[7px] font-bold text-slate-400">{title}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <InterpretationCardGrid
                    items={introSummaryCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-indigo-600">PSI Origin Story</p>
                            <h2 className="mt-2 text-2xl font-black text-slate-900">종이 위험성평가 기록지를 현장 보호 데이터로 바꾼 이야기</h2>
                            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                                PSI는 현장을 더 감시하려고 시작한 프로그램이 아닙니다. 외국인 근로자가 각자의 언어로 적은 짧은 수기 기록 속에서 위험 신호를 놓치지 않고,
                                관리자가 고친 판단이 모국어 안내와 다음 교육까지 이어지게 만들기 위해 시작했습니다.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onNavigateToPage('ocr-analysis')}
                            className="min-h-[44px] rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white transition-colors hover:bg-indigo-700"
                        >
                            실제 OCR 흐름 보기
                        </button>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-5">
                        {[
                            ['1', '수기 기록', '사진·PDF로 받은 위험성평가 기록지를 원본 증빙으로 보존'],
                            ['2', 'AI 구조화', 'Q1~Q5 답변, 위험요인, 점수 근거, 모국어 신호를 분리'],
                            ['3', '관리자 검증', '한국어 보호 해석과 점수 근거를 현장 판단으로 수정'],
                            ['4', '모국어 전달', '수정된 내용이 외국인 근로자 안내와 개인 지표에 동기화'],
                            ['5', '추적 교육', '월별 리포트와 다음 위험성평가 교육자료로 다시 환류'],
                        ].map(([step, title, desc]) => (
                            <div key={step} className={`rounded-2xl border px-4 py-4 ${BRAND_TONE.slate}`}>
                                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white">{step}</div>
                                <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
                                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{desc}</p>
                            </div>
                        ))}
                    </div>

                    <div className={`mt-5 rounded-2xl border px-4 py-4 ${BRAND_TONE.emeraldSoft80}`}>
                        <p className="text-sm font-black text-emerald-900">상품 한 문장</p>
                        <p className="mt-1 text-sm font-bold leading-6 text-emerald-800">
                            PSI는 위험성평가 OCR 결과를 보여주는 데서 끝나지 않고, 관리자의 현장 판단이 근로자 모국어 안내와 개인 안전역량, 월별 교육 환류까지 같은 기준으로 이어지는지 검증하는 현장 안전 인텔리전스입니다.
                        </p>
                    </div>
                </section>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.violetSoft80}`}>
                    <div className="flex items-center gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm">🧩</span>
                        <div>
                            <h3 className="text-lg font-black text-slate-900">최근 운영 업그레이드 반영</h3>
                            <p className="text-sm font-semibold text-slate-600">현장 조작 실수 방지와 핵심 KPI 가독성 개선 항목을 소개 화면에 동기화했습니다.</p>
                        </div>
                    </div>
                    <ul className="mt-4 space-y-2 text-sm font-bold text-slate-700">
                        {recentOpsUpgradeNotes.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-violet-500"></span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="rounded-3xl border border-indigo-100 bg-white p-6 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-black tracking-[0.16em] text-indigo-600">PROGRAM UPGRADE BOARD</p>
                            <h3 className="mt-1 text-lg font-black text-slate-900">완성 검증 기반 다음 구현 계획</h3>
                            <p className="mt-1 text-sm font-semibold text-slate-600">목업 반영 상태를 확인하고, 다음 구현 항목을 체크하면서 클리어할 수 있습니다.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5 text-[10px] font-black sm:grid-cols-4">
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">완료 {upgradePlanSummary.done}</span>
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">검증중 {upgradePlanSummary.verifying}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-1 text-slate-700">대기 {upgradePlanSummary.todo}</span>
                            <span className="rounded-full bg-indigo-100 px-2 py-1 text-indigo-700">진척 {upgradePlanSummary.completionRate}%</span>
                        </div>
                    </div>

                    <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                            className="h-2.5 rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all duration-300"
                            style={{ width: `${upgradePlanSummary.completionRate}%` }}
                        ></div>
                    </div>

                    <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-3 py-2 ${BRAND_TONE.slate}`}>
                        <div>
                            <div className="text-[11px] font-bold text-slate-600">
                                {nextUpgradeTarget
                                    ? `다음 실행 대상: ${nextUpgradeTarget.title}`
                                    : '모든 계획 항목이 완료되었습니다.'}
                            </div>
                            <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                {dashboardLiveSyncSnapshot
                                    ? `대시보드 동기화 ${isDashboardSyncFresh ? '정상' : '점검 필요'} · 근로자 ${dashboardLiveSyncSnapshot.totalWorkers} · 응답품질 ${dashboardLiveSyncSnapshot.averageScore.toFixed(1)} · 추가 확인 ${dashboardLiveSyncSnapshot.highRiskWorkers}`
                                    : '대시보드 동기화 스냅샷 없음 · 대시보드 화면을 열어 최신 상태를 반영하세요.'}
                            </div>
                            <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                {reportsDeliverySnapshot
                                    ? `리포트 전달 상태 ${reportsDeliverySnapshot.state === 'verified' ? '검증 완료' : reportsDeliverySnapshot.state === 'generated' ? '생성 완료' : reportsDeliverySnapshot.state === 'running' ? '실행 중' : reportsDeliverySnapshot.state === 'attention' ? '점검 필요' : '대기'} · 대상 ${reportsDeliverySnapshot.filteredCount}건 · 진행률 ${reportsDeliverySnapshot.generationProgress}%`
                                    : '리포트 전달 스냅샷 없음 · Reports 화면에서 생성/증빙 검증 실행 후 자동 반영됩니다.'}
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setShowOpenItemsOnly((prev) => !prev)}
                                className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-black text-slate-700 transition duration-200 hover:bg-slate-100 ${BRAND_TONE.slateWhite}`}
                            >
                                {showOpenItemsOnly ? '전체 보기' : '미완료만 보기'}
                            </button>
                            <button
                                type="button"
                                onClick={startNextUpgradeTarget}
                                disabled={!nextUpgradeTarget}
                                className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-black text-white transition duration-200 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 ${BRAND_TONE.indigoStrong}`}
                            >
                                다음 구현 시작
                            </button>
                        </div>
                    </div>

                    <div className="mt-4 space-y-2.5">
                        {visibleUpgradePlanItems.map((item) => {
                            const statusMeta = item.status === 'done'
                                ? { label: '완료', chip: 'bg-emerald-100 text-emerald-700', button: `${BRAND_TONE.emeraldHover} text-emerald-700` }
                                : item.status === 'verifying'
                                    ? { label: '검증중', chip: 'bg-amber-100 text-amber-700', button: `${BRAND_TONE.amberHover} text-amber-700` }
                                    : { label: '대기', chip: 'bg-slate-200 text-slate-700', button: `${BRAND_TONE.slateWhite} text-slate-700 hover:bg-slate-100` };

                            return (
                                <div key={item.id} className={`rounded-2xl border p-3 sm:p-4 ${BRAND_TONE.slateSoft90}`}>
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700">{item.phase}</span>
                                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${statusMeta.chip}`}>{statusMeta.label}</span>
                                            </div>
                                            <p className="mt-1 text-sm font-black text-slate-900">{item.title}</p>
                                            <p className="mt-1 text-[12px] font-semibold text-slate-600">{item.summary}</p>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <button
                                                type="button"
                                                onClick={() => onNavigateToPage(item.page)}
                                                className={`rounded-xl border px-2.5 py-1.5 text-[11px] font-black text-indigo-700 transition duration-200 hover:bg-indigo-50 ${BRAND_TONE.indigoWhite}`}
                                            >
                                                화면 열기
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => cycleUpgradeTaskStatus(item.id)}
                                                className={`rounded-xl border bg-white px-2.5 py-1.5 text-[11px] font-black transition duration-200 ${statusMeta.button}`}
                                            >
                                                상태 변경
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* System Trust & Patent Status */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
                    <div className="flex flex-wrap items-center gap-3 mb-5">
                        <div
                            className="relative group/patent rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                            title="특허출원 제10-2026-0039151호 (발명자: 박성훈)"
                            aria-label="특허출원 상태"
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    (e.currentTarget as HTMLDivElement).blur();
                                }
                            }}
                        >
                            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-black text-sky-700 ${BRAND_TONE.sky}`}>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l7 4v5c0 5-3.5 7.5-7 9-3.5-1.5-7-4-7-9V7l7-4z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
                                </svg>
                                Pat. Pending
                            </div>
                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 max-w-[min(260px,calc(100vw-2rem))] rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white opacity-0 shadow-lg transition-all duration-200 group-hover/patent:translate-y-0 group-hover/patent:opacity-100 group-focus-within/patent:translate-y-0 group-focus-within/patent:opacity-100 translate-y-1 sm:left-1/2 sm:w-max sm:max-w-none sm:-translate-x-1/2">
                                특허출원 제10-2026-0039151호 (발명자: 박성훈)
                            </div>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">시스템 공신력 및 권리화 현황</h2>
                    </div>
                    <dl className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-x-4 gap-y-2 text-sm">
                        <dt className="font-bold text-slate-600">시스템명</dt>
                        <dd className="text-slate-800">{PSI_SYSTEM_NAME}</dd>

                        <dt className="font-bold text-slate-600">출원번호</dt>
                        <dd className="text-slate-800">10-2026-0039151</dd>

                        <dt className="font-bold text-slate-600">출원일자</dt>
                        <dd className="text-slate-800">2026.03.04</dd>

                        <dt className="font-bold text-slate-600">발명자</dt>
                        <dd className="text-slate-800">박성훈</dd>

                        <dt className="font-bold text-slate-600">법적 상태</dt>
                        <dd className="text-slate-800">대한민국 특허청 심사 대기 및 우선권 주장(선출원) 완료</dd>
                    </dl>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.emeraldSoft}`}>
                        <p className="text-xs font-black tracking-[0.18em] text-emerald-700 mb-3">BRAND PRINCIPLE 01</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">평가보다 해석</h3>
                        <p className="text-sm leading-relaxed text-slate-700">PSI는 점수만 보여주지 않고 왜 그런 판단이 나왔는지 설명해 현장의 신뢰를 높입니다.</p>
                    </div>
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.indigoSoft}`}>
                        <p className="text-xs font-black tracking-[0.18em] text-indigo-700 mb-3">BRAND PRINCIPLE 02</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">지적보다 보완</h3>
                        <p className="text-sm leading-relaxed text-slate-700">근로자에게는 불합격 대신 보완 권고를, 관리자에게는 재검토 근거를 제시하는 코칭형 구조를 따릅니다.</p>
                    </div>
                    <div className={`rounded-3xl border p-6 shadow-sm ${BRAND_TONE.skySoft}`}>
                        <p className="text-xs font-black tracking-[0.18em] text-sky-700 mb-3">BRAND PRINCIPLE 03</p>
                        <h3 className="text-lg font-black text-slate-900 mb-2">감시보다 보호</h3>
                        <p className="text-sm leading-relaxed text-slate-700">동일한 분석 결과도 역할별 안전 언어로 바꿔 현장을 압박하지 않고 보호 중심의 행동으로 연결합니다.</p>
                    </div>
                </div>
            </div>

            {/* Timeline Section - History */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold text-slate-900 mb-3">PSI 탄생 배경</h2>
                    <p className="text-slate-500">PSI는 단순한 AI 기능에서 출발하지 않았습니다. 현장의 심리와 위험 신호를 더 정확하게 이해하고, 그것을 사람을 살리는 언어로 바꾸기 위한 고민에서 시작되었습니다.</p>
                </div>

                <div className="relative border-l-4 border-indigo-100 ml-4 md:ml-1/2 space-y-12">
                    {/* 2026 Apr - v2.2 (NEW) */}
                    <div className="relative md:flex items-center justify-between md:flex-row-reverse group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-auto md:right-1/2 md:-mr-[11px] top-0 w-10 h-10 bg-white border-4 border-emerald-600 rounded-full z-10 shadow-lg shadow-emerald-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-emerald-600 rounded-full animate-pulse"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-emerald-50 to-white rounded-2xl shadow-xl border border-emerald-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-emerald-100">
                            <span className="text-emerald-700 font-bold text-sm mb-2 block">{PSI_CURRENT_RELEASE.periodLabel}</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">PSI {PSI_APP_VERSION} - {PSI_CURRENT_RELEASE.title}</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                {PSI_CURRENT_RELEASE.summary}
                            </p>
                            <ul className="mt-4 space-y-1.5 text-[13px] font-semibold text-slate-700">
                                {PSI_CURRENT_RELEASE.highlights.slice(0, 3).map((item) => (
                                    <li key={item} className="flex items-start gap-2">
                                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                                        <span>{item}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2026 Feb - v2.1 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-600 rounded-full z-10 shadow-lg shadow-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-indigo-100">
                            <span className="text-indigo-700 font-bold text-sm mb-2 block">2026년 02월</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">PSI 2.1 - Enterprise Grade</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                대규모 현장을 위한 안정성 강화. 300명 이상의 근로자 데이터를 안정적으로 처리하고, 무한 재시도 방지, 메모리 최적화 등 기업 환경에 필수적인 안정성과 확장성을 확보했습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2026 (EXISTING) */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-600 rounded-full z-10 shadow-lg shadow-indigo-200 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-gradient-to-br from-indigo-50 to-white rounded-2xl shadow-xl border border-indigo-100 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ring-1 ring-indigo-100">
                            <span className="text-indigo-700 font-bold text-sm mb-2 block">2026년 01월</span>
                            <h3 className="text-xl font-bold text-slate-900 mb-3">자율 안전 AI의 원년</h3>
                            <p className="text-slate-700 text-sm leading-relaxed">
                                PSI 2.0 런칭. 단순 관리 도구를 넘어, 현장의 위험을 스스로 학습하고 예측하는 '인공지능 안전 파트너'로서 건설 현장의 새로운 표준을 제시하고 있습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2025 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-indigo-400 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                             <div className="w-3 h-3 bg-indigo-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-indigo-600 font-bold text-sm mb-2 block">2025년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">통합 시스템 PSI의 탄생</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                단순한 데이터 변환을 넘어, 분석, 예측, 관리, 보고까지 이어지는 통합 플랫폼의 필요성을 절감했습니다. 그렇게 현장의 모든 데이터를 연결하고 예측하는 안전의 두뇌, PSI 1.0이 구축되었습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2024 */}
                    <div className="relative md:flex items-center justify-between md:flex-row-reverse group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-auto md:right-1/2 md:-mr-[11px] top-0 w-10 h-10 bg-white border-4 border-slate-300 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-slate-500 font-bold text-sm mb-2 block">2024년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">데이터화의 필요성과 OCR 기술 도입</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                쌓여가는 종이 기록지 속에서 의미 있는 패턴을 찾기 어려웠습니다. 데이터의 정량화와 빅데이터화를 위해, 수기 문서를 디지털로 변환하는 AI OCR 기술을 도입하여 분석의 초석을 다졌습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>

                    {/* 2023 */}
                    <div className="relative md:flex items-center justify-between group card-gravity-target">
                        <div className="absolute -left-[22px] md:left-1/2 md:-ml-[11px] top-0 w-10 h-10 bg-white border-4 border-slate-300 rounded-full z-10 shadow-md flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                            <div className="w-3 h-3 bg-slate-400 rounded-full"></div>
                        </div>
                        <div className="ml-10 md:ml-0 md:w-[45%] p-6 bg-white rounded-2xl shadow-lg border border-slate-100 hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                            <span className="text-slate-500 font-bold text-sm mb-2 block">2023년</span>
                            <h3 className="text-xl font-bold text-slate-800 mb-3">수기 위험성 평가 기록지 개발</h3>
                            <p className="text-slate-600 text-sm leading-relaxed">
                                현장의 목소리를 담기 위해 시작된 첫 걸음. 외국인 근로자와의 소통 장벽을 넘기 위해 직관적인 그림과 모국어 번역을 병기한 기록지를 개발하고 현장에 적용했습니다.
                            </p>
                        </div>
                        <div className="hidden md:block md:w-[45%]"></div>
                    </div>
                </div>
            </div>

            {/* Philosophy & Values */}
            <div className="bg-slate-50 rounded-3xl p-12 card-gravity-target">
                <div className="text-center mb-10">
                    <h2 className="text-3xl font-bold text-slate-900">PSI 브랜드 철학: 현장의 신호를 보호의 언어로 번역하다</h2>
                </div>

                <InterpretationCardGrid
                    items={philosophyCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    <div className="flex justify-center">
                        {/* Visual Representation of Logo - LARGE VERSION */}
                        <div className="w-64 h-64 relative animate-float">
                            <BrandPhilosophyLogo className="w-full h-full drop-shadow-2xl" />
                            <div className="absolute -bottom-10 left-1/2 transform -translate-x-1/2 text-4xl font-black text-slate-800 tracking-widest">PSI</div>
                        </div>
                    </div>
                    
                    <div className="space-y-8">
                        <p className="text-slate-600 leading-relaxed">
                            PSI 로고는 단순한 상징이 아닙니다. 현장의 신호를 읽고, 그것을 보호와 실행의 언어로 바꾸는 브랜드 철학을 담고 있습니다. 각 요소는 정확함, 신뢰, 보호라는 핵심 가치를 시각적으로 표현합니다.
                        </p>
                        
                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-blue-100 rounded-xl text-blue-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">견고한 방패 (The Shield)</h3>
                                <p className="text-slate-500 text-sm mt-1">기본 형태인 방패는 현장과 근로자를 위험으로부터 지키겠다는 굳건한 약속, 그리고 PSI가 끝까지 사용자 편에 서겠다는 브랜드 태도를 상징합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">비대칭적 형태 (The Asymmetry)</h3>
                                <p className="text-slate-500 text-sm mt-1">정적인 대칭을 벗어난 형태는 위험을 기다리는 수동적 방어가 아니라, <span className="font-bold text-indigo-600">먼저 읽고 먼저 개입하는 능동적 보호</span>와 실행 중심의 안전 문화를 의미합니다.</p>
                            </div>
                        </div>

                        <div className="flex items-start space-x-4">
                            <div className="p-3 bg-violet-100 rounded-xl text-violet-600 shrink-0">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-800 text-lg">AI의 눈 (The AI Eye)</h3>
                                <p className="text-slate-500 text-sm mt-1">중심부의 눈동자는 보이지 않는 패턴을 읽어내는 AI의 예리함을 나타내지만, 그 목적은 감시가 아니라 현장의 작은 신호까지 놓치지 않는 따뜻한 관찰입니다.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Latest Upgrade Snapshot */}
            <div className="max-w-5xl mx-auto px-4 card-gravity-target">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 3v2.25m4.5-2.25v2.25M4.5 9h15m-15 0v8.25A2.25 2.25 0 006.75 19.5h10.5a2.25 2.25 0 002.25-2.25V9m-15 0A2.25 2.25 0 016.75 6.75h10.5A2.25 2.25 0 0119.5 9M9 14.25h6" /></svg>
                        </div>
                        <h2 className="text-xl sm:text-2xl font-black text-slate-900">최신 누적 업그레이드 스냅샷</h2>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mb-5 break-keep">
                        PSI {PSI_APP_VERSION} 기준으로 최근 누적된 핵심 개선사항을 영역별로 정리했습니다. 보고서 전달 품질, 운영 추적성, 현장 실행성을 동시에 끌어올리는 방향으로 업데이트가 반영되었습니다.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.indigoSoft}`}>
                            <h3 className="font-black text-indigo-800 mb-2">리포트/전달 체계</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[0].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.emeraldSoft}`}>
                            <h3 className="font-black text-emerald-800 mb-2">운영/성능 안정화</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {latestUpgradeColumns[1].map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.amberSoft}`}>
                            <h3 className="font-black text-amber-800 mb-2">검증 상태</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                {PSI_CURRENT_RELEASE.validations.map((item) => <li key={item}>{item}</li>)}
                            </ul>
                        </div>
                        <div className={`rounded-2xl border p-4 ${BRAND_TONE.slate}`}>
                            <h3 className="font-black text-slate-800 mb-2">다음 협업 초점</h3>
                            <ul className="text-slate-700 font-semibold space-y-1 list-disc list-inside">
                                <li>피드백 탭 카테고리 기반 의사결정 기록 강화</li>
                                <li>문서 중심 변경 제안 → 코드 반영 → 검증 루프 유지</li>
                                <li>월 단위 로드맵 리뷰에서 리포트 품질·발송 효율 동시 점검</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Service Message */}
            <div className="mt-20 bg-white rounded-3xl p-12 text-center shadow-xl border border-slate-100 relative overflow-hidden card-gravity-target">
                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
                <h2 className="text-2xl font-bold text-slate-900 mb-8">서비스 운영 메시지</h2>
                <div className="max-w-3xl mx-auto">
                    <div className="flex items-start">
                        <div className="hidden sm:block mr-6">
                            <div className="w-1 bg-indigo-200 h-full rounded-full"></div>
                        </div>
                        <div className="text-left">
                            <p className="text-slate-700 text-lg leading-8 italic font-medium">
                                "PSI는 현장을 판단하려는 시스템이 아니라 현장을 이해하려는 시스템입니다. 우리는 수기 기록 속 짧고 투박한 문장에서도 위험의 신호를 놓치지 않고, 그 신호를 사람이 바로 행동할 수 있는 보호의 언어로 바꾸고자 했습니다. PSI가 2026년에도 현장에서 가장 믿을 수 있는 안전 파트너로 남기를 바랍니다."
                            </p>
                            <div className="mt-6 flex items-center justify-end gap-3">
                                <div className="text-right">
                                    <p className="text-slate-900 font-black text-lg">박성훈 부장</p>
                                    <p className="text-indigo-600 text-sm font-bold">(주)휘강건설</p>
                                    <p className="text-slate-400 text-xs mt-0.5">PSI 서비스 책임자</p>
                                </div>
                                <div className="relative group shrink-0">
                                    {/* Golden Glow Effect */}
                                    <div className="absolute -inset-1 bg-gradient-to-tr from-amber-200 to-yellow-500 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
                                    <div className={`relative w-12 h-12 rounded-xl flex items-center justify-center border shadow-xl overflow-hidden ${BRAND_TONE.slateDarkSoft}`}>
                                        {/* Metallic Texture Overlay */}
                                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                                        
                                        {/* Stylized 'P' Logo */}
                                        <svg className="w-7 h-7 z-10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <linearGradient id="gold-leaf-intro" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                                                    <stop offset="0%" stopColor="#FDE68A" /> {/* Amber 200 */}
                                                    <stop offset="40%" stopColor="#D97706" /> {/* Amber 600 */}
                                                    <stop offset="70%" stopColor="#F59E0B" /> {/* Amber 500 */}
                                                    <stop offset="100%" stopColor="#FFFBEB" /> {/* Amber 50 */}
                                                </linearGradient>
                                            </defs>
                                            <path d="M7 4V20" stroke="url(#gold-leaf-intro)" strokeWidth="2.5" strokeLinecap="round"/>
                                            <path d="M7 6H12C15.5 6 18 8.5 18 12C18 15.5 15.5 18 12 18H7" stroke="url(#gold-leaf-intro)" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.9"/>
                                            <circle cx="13" cy="12" r="1.5" fill="url(#gold-leaf-intro)" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Introduction;
