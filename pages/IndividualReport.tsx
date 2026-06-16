
import React, { Suspense, lazy, useRef, useState, useEffect, useMemo } from 'react';
import type { WorkerRecord } from '../types';
import { generateReportUrl, getReportShareDiagnostics } from '../utils/qrUtils';
import { postAdminJson } from '../utils/adminApiClient';
import { BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { ReportGenerationProgress } from '../components/shared/ReportGenerationProgress';
import { ensureFileSaver, ensureHtml2Canvas, ensureJsPdfConstructor, ensureJsZip } from '../utils/externalScripts';
import { canvasToBlob, captureReportCanvases, saveCanvasesAsA4Pdf } from '../utils/pdfCapture';
import { BRAND_TONE } from '../utils/brandToneTokens';
import { useMobileBackGuard } from '../hooks/useMobileBackGuard';
import { sanitizeOperationalNote } from '../utils/ocrVerificationLanguageUtils';
import { toVercelFriendlyMessage } from '../utils/errorUtils';
import { buildAdminWorkerInsightReport } from '../utils/reportBuilders';

const ReportTemplate = lazy(() => import('../components/ReportTemplate').then(module => ({ default: module.ReportTemplate })));

const ReportTemplateFallback: React.FC = () => (
    <div className="bg-white border border-slate-200 rounded-2xl animate-pulse w-[210mm] min-h-[297mm] p-8">
        <div className="h-6 w-48 bg-slate-200 rounded mb-4" />
        <div className="h-3 w-72 bg-slate-100 rounded mb-8" />
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="h-24 rounded-xl bg-slate-100" />
            <div className="h-24 rounded-xl bg-slate-100" />
        </div>
        <div className="h-48 rounded-xl bg-slate-100 mb-6" />
        <div className="h-32 rounded-xl bg-slate-100" />
    </div>
);

interface IndividualReportProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onBack: () => void;
    onUpdateRecord?: (record: WorkerRecord) => void;
    isQrScanMode?: boolean;
}

type GenerationAction = 'pdf' | 'image' | 'message';

const REPORT_MESSAGE_PHONE_KEY = 'psi-report-message-phone';
const REPORT_MESSAGE_NOTE_KEY = 'psi-report-message-note';
const REPORT_MESSAGE_HISTORY_KEY = 'psi-report-message-history';
const MAX_MMS_IMAGE_BYTES = 190 * 1024;

type MessageImagePayload = {
    fileName: string;
    dataUrl: string;
    pageLabel: string;
};

type MessageHistoryEntry = {
    sentAt: string;
    phoneNumber: string;
    sentCount: number;
};

type ServerMessageLogEntry = {
    id: string;
    phone_number: string;
    send_mode?: string;
    status: string;
    sent_count: number;
    message: string;
    created_at: string;
};

interface GenerationProgressState {
    status: 'idle' | 'running' | 'success' | 'error';
    progress: number;
    phaseLabel: string;
    action: GenerationAction | null;
    errorMessage?: string;
}

const IndividualReport: React.FC<IndividualReportProps> = ({ record, history = [], onBack, onUpdateRecord, isQrScanMode = false }) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const adminInsightReport = useMemo(() => buildAdminWorkerInsightReport(record, history), [record, history]);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<GenerationProgressState>({
        status: 'idle',
        progress: 0,
        phaseLabel: '대기 중',
        action: null,
    });
    const [messagePhoneNumber, setMessagePhoneNumber] = useState('');
    const [messageNote, setMessageNote] = useState('');
    const [messageSendStatus, setMessageSendStatus] = useState<string>('');
    const [lastMessageHistory, setLastMessageHistory] = useState<MessageHistoryEntry | null>(null);
    const [serverMessageLogs, setServerMessageLogs] = useState<ServerMessageLogEntry[]>([]);
    const [isServerMessageLogsLoading, setIsServerMessageLogsLoading] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const progressIntervalRef = useRef<number | null>(null);
    const isKorean = record.nationality === '대한민국' || record.nationality === '한국' || (record.nationality || '').toLowerCase().includes('korea');
    const timelineLocale = isKorean ? 'ko-KR' : 'en-US';
    const timelineDateTimeOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    };
    const reassessmentTitle = '재평가 타임라인';
    const reassessmentFallback = '2차 재가공';
    const reassessmentTag = '[재평가]';
    const reassessmentTrail = (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-5).reverse();
    const messageWorkerKey = String(record.worker_uuid || record.workerUuid || record.employeeId || `${record.name}_${record.teamLeader || '미지정'}`).trim();
    const isGenerating = isGeneratingPdf || isGeneratingImage || isSendingMessage;
    const hasMessageDraft = messagePhoneNumber.replace(/\D/g, '').slice(0, 11).length > 0 || messageNote.trim().length > 0;
    const { guideMessage: mobileBackGuideMessage } = useMobileBackGuard({
        hasActiveWork: isGenerating || hasMessageDraft || isCameraOpen,
        guardStateKey: '__individualReportBackGuard',
        confirmExitMessage: '리포트 생성 또는 문자 발송 준비가 진행 중입니다.\n저장된 범위까지만 유지하고 이전 화면으로 이동하시겠습니까?',
        stayMessage: '현재 리포트 화면에서 계속 작업합니다.',
        idleBackMessage: '한 번 더 누르면 이전 화면으로 이동합니다.',
        exitMessage: '이전 화면으로 이동합니다.',
    });
    const normalizePhoneInput = (value: string) => value.replace(/\D/g, '').slice(0, 11);
    const formatPhoneForDisplay = (value: string) => {
        const digits = normalizePhoneInput(value);
        if (digits.length < 4) return digits;
        if (digits.length < 8) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        if (digits.length < 11) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    };
    const shareDiagnostics = useMemo(() => getReportShareDiagnostics(record), [record]);
    const generationInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'individual-status',
            eyebrow: '지금 상태',
            title: `${record.name}님의 개별 리포트를 확인 중입니다.`,
            description: isGenerating
                ? `${generationProgress.action === 'message' ? '문자 발송' : generationProgress.action === 'image' ? '이미지 생성' : 'PDF 생성'} 흐름이 진행 중이며 현재 ${generationProgress.phaseLabel} 단계입니다.`
                : '공유, 문자 발송, 이미지 저장, PDF 발급을 한 화면에서 이어서 수행할 수 있습니다.',
            tone: isGenerating ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'individual-evidence',
            eyebrow: '판단 근거',
            title: `응답품질 ${record.safetyScore || '-'}점 · 확인단계 ${record.safetyLevel || '-'}`,
            description: `${record.jobField || '미분류'}${record.teamLeader ? ` · ${record.teamLeader}` : ''} 기준 기록과 이력 데이터를 현재 리포트 템플릿에 함께 반영합니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'individual-action',
            eyebrow: '다음 행동',
            title: isQrScanMode ? '핵심 확인 후 필요한 안내만 빠르게 전달하세요.' : '리포트 확인 후 공유 또는 발송 방식으로 연결하세요.',
            description: isQrScanMode
                ? 'QR 현장 조회 모드에서는 핵심 6개 지표와 재평가 이력을 먼저 보고 즉시 설명이 필요한 부분만 전달할 수 있습니다.'
                : '자동문자, 문자공유, 이미지 저장, PDF 발급 중 현장 상황에 맞는 전달 방식을 선택하면 됩니다.',
            tone: isQrScanMode ? 'border-amber-200 bg-amber-50/80' : 'border-emerald-200 bg-emerald-50/80',
        },
        {
            key: 'individual-qr-diagnostics',
            eyebrow: 'QR 공유 진단',
            title: shareDiagnostics.qrRisk === 'overflow'
                ? 'QR 길이가 한계에 가까워 링크/문서 공유를 함께 준비해야 합니다.'
                : shareDiagnostics.qrRisk === 'warning'
                    ? 'QR 길이가 다소 길어 현장 기기마다 인식 속도 차이가 있을 수 있습니다.'
                    : 'QR 공유 길이가 안정 범위에 있습니다.',
            description: shareDiagnostics.warning
                ? `${shareDiagnostics.warning} 현재 URL 길이 ${shareDiagnostics.urlLength}자입니다.`
                : `현재 URL 길이 ${shareDiagnostics.urlLength}자로 QR 현장 공유에 사용할 수 있습니다.`,
            tone: shareDiagnostics.qrRisk === 'overflow'
                ? 'border-rose-200 bg-rose-50/80'
                : shareDiagnostics.qrRisk === 'warning'
                    ? 'border-amber-200 bg-amber-50/80'
                    : 'border-indigo-200 bg-indigo-50/70',
        },
    ], [generationProgress.action, generationProgress.phaseLabel, isGenerating, isQrScanMode, record.jobField, record.name, record.safetyLevel, record.safetyScore, record.teamLeader, shareDiagnostics.qrRisk, shareDiagnostics.urlLength, shareDiagnostics.warning]);

    const messageInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'message-status',
            eyebrow: '지금 상태',
            title: messagePhoneNumber ? `${formatPhoneForDisplay(messagePhoneNumber)} 번호로 발송 준비 중입니다.` : '수신 번호 입력이 필요합니다.',
            description: lastMessageHistory
                ? `최근 발송 이력이 있어 같은 근로자 리포트에서 번호와 흐름을 이어서 확인할 수 있습니다.`
                : '처음 발송하는 경우에도 번호와 메모를 저장해 다음 리포트에서 바로 이어집니다.',
            tone: messagePhoneNumber ? 'border-indigo-200 bg-indigo-50/70' : 'border-slate-200 bg-slate-50',
        },
        {
            key: 'message-evidence',
            eyebrow: '판단 근거',
            title: '전화번호, 본문 메모, 서버 로그가 발송 기준입니다.',
            description: serverMessageLogs.length > 0
                ? `최근 서버 로그 ${serverMessageLogs.length}건이 있어 성공·실패 여부를 바로 확인할 수 있습니다.`
                : '서버 발송 로그가 없으면 현재 입력한 번호와 메모가 가장 중요한 판단 근거가 됩니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'message-action',
            eyebrow: '다음 행동',
            title: normalizePhoneInput(messagePhoneNumber).length >= 10 ? '자동 문자 발송으로 리포트를 전달할 수 있습니다.' : '전화번호를 먼저 정확히 입력하세요.',
            description: '발송 후에는 서버 로그와 최근 발송 이력에서 실제 전달 여부를 다시 확인하며 후속 설명을 이어갈 수 있습니다.',
            tone: normalizePhoneInput(messagePhoneNumber).length >= 10 ? 'border-emerald-200 bg-emerald-50/80' : 'border-amber-200 bg-amber-50/80',
        },
    ], [lastMessageHistory, messagePhoneNumber, serverMessageLogs.length]);

    const qrInterpretationCards: InterpretationCardItem[] = useMemo(() => [
        {
            key: 'qr-status',
            eyebrow: '지금 상태',
            title: 'QR 현장 조회용 핵심 정보가 열려 있습니다.',
            description: '성명, 공종, 관리자 식별, 응답품질, 무결성, OCR 신뢰도를 작은 화면에서도 빠르게 읽을 수 있도록 묶었습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'qr-evidence',
            eyebrow: '판단 근거',
            title: '재평가 이력과 품질 판단 근거가 즉시 확인 기준이 됩니다.',
            description: reassessmentTrail.length > 0
                ? `최근 재평가 이력 ${reassessmentTrail.length}건이 있어 현장 설명 시 이전 보완 흐름까지 함께 볼 수 있습니다.`
                : '재평가 이력이 없더라도 현재 응답품질과 AI 판단 근거를 기준으로 간단한 설명을 바로 이어갈 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'qr-action',
            eyebrow: '다음 행동',
            title: '핵심 6을 먼저 설명한 뒤 필요 시 전체 리포트로 확장하세요.',
            description: '현장에서는 모든 내용을 다 읽기보다 지금 위험 신호와 다음 행동을 짧게 전달하는 것이 더 중요합니다.',
            tone: BRAND_TONE.amberSoft80,
        },
    ], [reassessmentTrail.length]);

    const readWorkerLocalSetting = (storageKey: string): string => {
        if (typeof window === 'undefined' || !messageWorkerKey) return '';
        try {
            const raw = window.localStorage.getItem(storageKey);
            if (!raw) return '';
            const parsed = JSON.parse(raw) as Record<string, string>;
            return String(parsed?.[messageWorkerKey] || '');
        } catch {
            return '';
        }
    };

    const writeWorkerLocalSetting = (storageKey: string, value: string) => {
        if (typeof window === 'undefined' || !messageWorkerKey) return;
        try {
            const raw = window.localStorage.getItem(storageKey);
            const parsed = raw ? JSON.parse(raw) as Record<string, string> : {};
            const next = { ...parsed, [messageWorkerKey]: value };
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            // noop
        }
    };

    const readWorkerHistory = (): MessageHistoryEntry | null => {
        if (typeof window === 'undefined' || !messageWorkerKey) return null;
        try {
            const raw = window.localStorage.getItem(REPORT_MESSAGE_HISTORY_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Record<string, MessageHistoryEntry>;
            return parsed?.[messageWorkerKey] || null;
        } catch {
            return null;
        }
    };

    const writeWorkerHistory = (entry: MessageHistoryEntry) => {
        if (typeof window === 'undefined' || !messageWorkerKey) return;
        try {
            const raw = window.localStorage.getItem(REPORT_MESSAGE_HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) as Record<string, MessageHistoryEntry> : {};
            parsed[messageWorkerKey] = entry;
            window.localStorage.setItem(REPORT_MESSAGE_HISTORY_KEY, JSON.stringify(parsed));
        } catch {
            // noop
        }
    };

    const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('이미지 인코딩에 실패했습니다.'));
        reader.readAsDataURL(blob);
    });

    const createScaledCanvas = (sourceCanvas: HTMLCanvasElement, scale: number) => {
        const targetCanvas = document.createElement('canvas');
        targetCanvas.width = Math.max(1, Math.round(sourceCanvas.width * scale));
        targetCanvas.height = Math.max(1, Math.round(sourceCanvas.height * scale));
        const ctx = targetCanvas.getContext('2d');
        if (!ctx) {
            throw new Error('문자 발송용 이미지 변환 캔버스를 만들 수 없습니다.');
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceCanvas, 0, 0, targetCanvas.width, targetCanvas.height);
        return targetCanvas;
    };

    const buildMmsImagePayload = async (sourceCanvas: HTMLCanvasElement, pageIndex: number): Promise<MessageImagePayload> => {
        const qualitySteps = [0.82, 0.74, 0.68, 0.6, 0.52, 0.46];
        let scale = Math.min(1, 1280 / Math.max(1, sourceCanvas.width));
        let lastBlob: Blob | null = null;

        for (let scaleAttempt = 0; scaleAttempt < 6; scaleAttempt += 1) {
            const workingCanvas = createScaledCanvas(sourceCanvas, scale);
            for (const quality of qualitySteps) {
                const blob = await canvasToBlob(workingCanvas, 'image/jpeg', quality);
                lastBlob = blob;
                if (blob.size <= MAX_MMS_IMAGE_BYTES) {
                    return {
                        fileName: `PSI_Report_${record.name}_p${pageIndex + 1}.jpg`,
                        dataUrl: await blobToDataUrl(blob),
                        pageLabel: pageIndex === 0 ? '요약 페이지' : '상세 해설 페이지',
                    };
                }
            }
            scale *= 0.86;
        }

        throw new Error(`문자용 이미지 압축에 실패했습니다. 마지막 크기: ${Math.round((lastBlob?.size || 0) / 1024)}KB`);
    };

    const clearProgressInterval = () => {
        if (progressIntervalRef.current !== null) {
            window.clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
    };

    const beginGenerationProgress = (action: GenerationAction) => {
        const actionLabel = action === 'pdf' ? 'PDF 보고서 생성' : action === 'message' ? '리포트 문자 발송' : '이미지 보고서 생성';

        clearProgressInterval();
        setGenerationProgress({
            status: 'running',
            progress: 0,
            phaseLabel: '시작 준비 중',
            action,
        });

        progressIntervalRef.current = window.setInterval(() => {
            setGenerationProgress(prev => {
                if (prev.status !== 'running') return prev;
                if (prev.progress >= 92) return prev;
                return { ...prev, progress: Math.min(92, prev.progress + 1), phaseLabel: `${actionLabel} 진행 중` };
            });
        }, 180);
    };

    const updateGenerationProgress = (progress: number, phaseLabel: string) => {
        setGenerationProgress(prev => {
            if (prev.status !== 'running') return prev;
            return {
                ...prev,
                progress: Math.max(prev.progress, Math.min(99, Math.round(progress))),
                phaseLabel,
            };
        });
    };

    const completeGenerationProgress = () => {
        clearProgressInterval();
        setGenerationProgress(prev => ({
            ...prev,
            status: 'success',
            progress: 100,
            phaseLabel: '완료',
            errorMessage: undefined,
        }));
    };

    const failGenerationProgress = (errorMessage: string) => {
        clearProgressInterval();
        setGenerationProgress(prev => ({
            ...prev,
            status: 'error',
            phaseLabel: BRAND_STATUS_LABELS.attention,
            errorMessage,
        }));
    };

    useEffect(() => {
        return () => {
            clearProgressInterval();
        };
    }, []);

    useEffect(() => {
        const savedPhone = readWorkerLocalSetting(REPORT_MESSAGE_PHONE_KEY);
        const savedNote = readWorkerLocalSetting(REPORT_MESSAGE_NOTE_KEY);
        setMessagePhoneNumber(savedPhone);
        setMessageNote(savedNote || `${record.name}님 안전 리포트입니다. 현장 작업 전 내용을 꼭 확인해 주세요.`);
        setMessageSendStatus('');
        setLastMessageHistory(readWorkerHistory());
    }, [messageWorkerKey, record.name]);

    useEffect(() => {
        writeWorkerLocalSetting(REPORT_MESSAGE_PHONE_KEY, normalizePhoneInput(messagePhoneNumber));
    }, [messagePhoneNumber]);

    useEffect(() => {
        writeWorkerLocalSetting(REPORT_MESSAGE_NOTE_KEY, messageNote);
    }, [messageNote]);

    useEffect(() => {
        let disposed = false;

        const fetchRegisteredPhone = async () => {
            try {
                const response = await postAdminJson<{ ok: true; data: { worker: { phone_number?: string | null } | null; matchCount: number; matchedBy: string } }>(
                    '/api/admin/safety-management',
                    {
                        action: 'get-worker-contact',
                        payload: {
                            workerId: record.worker_uuid || record.workerUuid || '',
                            workerName: record.name,
                            teamName: record.teamLeader || '',
                        },
                    },
                    { fallbackMessage: '등록 근로자 연락처 조회 실패' },
                );

                const phone = normalizePhoneInput(String(response?.data?.worker?.phone_number || ''));
                if (!disposed && phone) {
                    setMessagePhoneNumber(phone);
                        setMessageSendStatus((prev) => prev || (response?.data?.matchCount > 1 ? '등록 근로자 전화번호와 연동했습니다. 후보 중 첫 번째 번호이므로 확인 후 발송해 주세요.' : '등록 근로자 전화번호와 자동 연동했습니다.'));
                }
            } catch {
                // 자동 조회 실패는 조용히 무시
            }
        };

        void fetchRegisteredPhone();

        return () => {
            disposed = true;
        };
    }, [record.worker_uuid, record.workerUuid, record.name, record.teamLeader, messageWorkerKey]);

    useEffect(() => {
        let disposed = false;

        const fetchMessageLogs = async () => {
            setIsServerMessageLogsLoading(true);
            try {
                const response = await postAdminJson<{ ok: true; data: { rows: ServerMessageLogEntry[]; schemaReady?: boolean } }>(
                    '/api/admin/safety-management',
                    {
                        action: 'list-report-message-logs',
                        payload: {
                            workerId: record.worker_uuid || record.workerUuid || '',
                            workerName: record.name,
                            limit: 5,
                        },
                    },
                    { fallbackMessage: '리포트 문자 발송 로그 조회 실패' },
                );

                if (!disposed) {
                    setServerMessageLogs(Array.isArray(response?.data?.rows) ? response.data.rows : []);
                }
            } catch {
                if (!disposed) {
                    setServerMessageLogs([]);
                }
            } finally {
                if (!disposed) {
                    setIsServerMessageLogsLoading(false);
                }
            }
        };

        void fetchMessageLogs();

        return () => {
            disposed = true;
        };
    }, [record.worker_uuid, record.workerUuid, record.name]);

    const startCamera = async () => {
        setIsCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
        } catch (e) {
            try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); streamRef.current = stream; } catch (err) { alert('카메라 권한 확인이 필요합니다.'); setIsCameraOpen(false); }
        }
    };

    useEffect(() => { if (isCameraOpen && streamRef.current && videoRef.current) videoRef.current.srcObject = streamRef.current; }, [isCameraOpen, streamRef.current]);

    const stopCamera = () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); setIsCameraOpen(false); };

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            if (onUpdateRecord) onUpdateRecord({ ...record, profileImage: dataUrl });
            stopCamera();
        }
    };

    const handleShare = async () => {
        const diagnostics = getReportShareDiagnostics(record);
        const url = diagnostics.url || generateReportUrl(record);
        if (!url) {
            alert('공유 URL 생성 확인이 필요합니다.');
            return;
        }
        const shareData = {
            title: `[PSI] ${record.name}님 안전 분석 리포트`,
            text: `PSI 안전 관리 시스템에서 분석된 ${record.name}님의 상세 안전 리포트입니다.`,
            url: url
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
                if (diagnostics.warning) {
                    alert(`공유는 완료되었지만 확인이 필요합니다.\n\n${diagnostics.warning}`);
                }
            } else {
                await navigator.clipboard.writeText(url);
                alert(`📋 링크가 복사되었습니다.\n\n${url}${diagnostics.warning ? `\n\n[QR 안내]\n${diagnostics.warning}` : ''}`);
            }
        } catch (err) { console.error('Share failed:', err); }
    };

    const buildReportImageFiles = async () => {
        if (!reportRef.current) throw new Error('리포트가 아직 렌더링되지 않았습니다.');

        const html2canvas = await ensureHtml2Canvas().catch(() => null);
        if (!html2canvas) {
            throw new Error('이미지 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
        }

        const canvases = await captureReportCanvases(reportRef.current, html2canvas, { scale: 3 });
        const files = await Promise.all(canvases.map(async (canvas, index) => {
            const blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
            return new File([blob], `PSI_Report_${record.name}_p${index + 1}.jpg`, { type: 'image/jpeg' });
        }));

        return { canvases, files };
    };

    const buildReportMessageImages = async (): Promise<MessageImagePayload[]> => {
        if (!reportRef.current) throw new Error('리포트가 아직 렌더링되지 않았습니다.');

        const html2canvas = await ensureHtml2Canvas().catch(() => null);
        if (!html2canvas) {
            throw new Error('이미지 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
        }

        const canvases = await captureReportCanvases(reportRef.current, html2canvas, { scale: 2 });
        return Promise.all(canvases.map((canvas, index) => buildMmsImagePayload(canvas, index)));
    };

    const handleShareImages = async () => {
        if (isGenerating) return;

        beginGenerationProgress('image');
        setIsGeneratingImage(true);
        try {
            updateGenerationProgress(18, '양면 리포트 렌더링 중');
            const { files } = await buildReportImageFiles();
            updateGenerationProgress(72, '공유용 이미지 준비 중');

            const sharePayload = {
                title: `[PSI] ${record.name}님 안전 리포트`,
                text: `${record.name}님 안전 리포트 이미지입니다. 문자/메신저 앱에서 바로 전달할 수 있습니다.`,
                files,
            };

            const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };
            if (navigator.share && nav.canShare?.({ files })) {
                await navigator.share(sharePayload);
                completeGenerationProgress();
                return;
            }

            failGenerationProgress('현재 기기에서는 이미지 첨부 공유를 지원하지 않습니다. 이미지 저장 후 문자/MMS 앱에서 첨부해 주세요.');
            alert('이 기기에서는 이미지 첨부 공유를 지원하지 않습니다. 이미지 저장 후 문자/MMS 앱에서 첨부해 주세요.');
        } catch (err) {
            console.error('Image share failed:', err);
            failGenerationProgress(err instanceof Error ? err.message : `이미지 공유에 ${BRAND_STATUS_LABELS.attention}가 필요합니다.`);
        } finally {
            setIsGeneratingImage(false);
        }
    };

    const handleSendReportMessage = async () => {
        if (isGenerating || isQrScanMode) return;

        const normalizedPhone = normalizePhoneInput(messagePhoneNumber);
        if (normalizedPhone.length < 10) {
            setMessageSendStatus('전화번호를 정확히 입력해 주세요.');
            alert('전화번호를 정확히 입력해 주세요.');
            return;
        }

        beginGenerationProgress('message');
        setIsSendingMessage(true);
        setMessageSendStatus('');

        try {
            updateGenerationProgress(15, '문자용 양면 이미지 생성 중');
            const reportImages = await buildReportMessageImages();
            updateGenerationProgress(70, '문자 발송 요청 중');

            const response = await postAdminJson<{ ok: true; data: { sentCount: number; phonePersistResult?: { updated?: boolean; reason?: string } } }>(
                '/api/admin/send-report-message',
                {
                    workerName: record.name,
                    workerUuid: record.worker_uuid || record.workerUuid || '',
                    teamName: record.teamLeader || '',
                    phoneNumber: normalizedPhone,
                    sendMode: 'INDIVIDUAL',
                    coverMessage: messageNote,
                    reportImages,
                },
                { fallbackMessage: `리포트 문자 발송 ${BRAND_STATUS_LABELS.attention}` },
            );

            updateGenerationProgress(96, '문자 발송 결과 정리 중');
            completeGenerationProgress();
            const persisted = response?.data?.phonePersistResult?.updated ? ' · 전화번호 저장 완료' : '';
            setMessageSendStatus(`문자/MMS ${response?.data?.sentCount || reportImages.length}건 발송 완료${persisted}`);
            const nextHistory = {
                sentAt: new Date().toISOString(),
                phoneNumber: normalizedPhone,
                sentCount: response?.data?.sentCount || reportImages.length,
            };
            writeWorkerHistory(nextHistory);
            setLastMessageHistory(nextHistory);
            setServerMessageLogs((prev) => [{
                id: `local-${nextHistory.sentAt}`,
                phone_number: normalizedPhone,
                send_mode: 'INDIVIDUAL',
                status: 'SUCCESS',
                sent_count: nextHistory.sentCount,
                message: `문자/MMS ${nextHistory.sentCount}건 발송 완료`,
                created_at: nextHistory.sentAt,
            }, ...prev].slice(0, 5));
        } catch (error) {
            console.error('Report message send failed:', error);
            const errorMessage = toVercelFriendlyMessage(
                error,
                `문자 발송에 ${BRAND_STATUS_LABELS.attention}가 필요합니다.`,
            );
            failGenerationProgress(errorMessage);
            setMessageSendStatus(errorMessage);
            setServerMessageLogs((prev) => [{
                id: `local-failed-${new Date().toISOString()}`,
                phone_number: normalizedPhone,
                send_mode: 'INDIVIDUAL',
                status: 'FAILED',
                sent_count: 0,
                message: errorMessage,
                created_at: new Date().toISOString(),
            }, ...prev].slice(0, 5));
            alert(errorMessage);
        } finally {
            setIsSendingMessage(false);
        }
    };

    const handleDownloadPDF = async () => {
        if (!reportRef.current || isGenerating) return;
        const [html2canvas, PDFCtor] = await Promise.all([
            ensureHtml2Canvas().catch(() => null),
            ensureJsPdfConstructor().catch(() => null),
        ]);
        if (!html2canvas || !PDFCtor) {
            failGenerationProgress('PDF 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
            return;
        }

        beginGenerationProgress('pdf');
        setIsGeneratingPdf(true);
        try {
            updateGenerationProgress(15, '데이터 수집 중');
            const canvases = await captureReportCanvases(reportRef.current, html2canvas, { scale: 3 });
            updateGenerationProgress(65, '양면 리포트 변환 중');
            updateGenerationProgress(82, 'PDF 문서 구성 중');
            saveCanvasesAsA4Pdf(canvases, PDFCtor as new (orientation: string, unit: string, format: string) => {
                addImage: (...args: unknown[]) => void;
                save: (filename: string) => void;
            }, `PSI_Report_${record.name}.pdf`, 'JPEG', 0.88);
            updateGenerationProgress(95, '파일 저장 중');
            completeGenerationProgress();
        } catch (err: unknown) {
            console.error('PDF generation failed:', err);
            failGenerationProgress(`PDF 생성에 ${BRAND_STATUS_LABELS.attention}가 필요합니다. 다시 확인해 주세요.`);
            alert('PDF 생성 확인이 필요합니다.');
        } finally { setIsGeneratingPdf(false); }
    };

    const handleDownloadImage = async () => {
        if (!reportRef.current || isGenerating) return;
        const [html2canvas, JSZip, saveAs] = await Promise.all([
            ensureHtml2Canvas().catch(() => null),
            ensureJsZip().catch(() => null),
            ensureFileSaver().catch(() => null),
        ]);
        if (!html2canvas) {
            failGenerationProgress('이미지 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
            return;
        }
        if (!JSZip || !saveAs) {
            failGenerationProgress('이미지 패키징 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
            return;
        }

        beginGenerationProgress('image');
        setIsGeneratingImage(true);
        try {
            updateGenerationProgress(20, '데이터 수집 중');
            const canvases = await captureReportCanvases(reportRef.current, html2canvas, { scale: 3 });
            updateGenerationProgress(72, '양면 이미지 변환 중');
            const zip = new JSZip();
            const pageBlobs = await Promise.all(canvases.map((canvas) => canvasToBlob(canvas, 'image/jpeg', 0.9)));
            pageBlobs.forEach((blob, index) => {
                zip.file(`PSI_Report_${record.name}_p${index + 1}.jpg`, blob);
            });
            updateGenerationProgress(90, 'ZIP 패키징 중');
            const content = await zip.generateAsync({ type: 'blob' });
            updateGenerationProgress(96, '파일 저장 중');
            saveAs(content, `PSI_Report_${record.name}_images.zip`);
            completeGenerationProgress();
        } catch (err: unknown) {
            console.error('Image save failed:', err);
            failGenerationProgress(`이미지 저장에 ${BRAND_STATUS_LABELS.attention}가 필요합니다. 다시 확인해 주세요.`);
            alert('이미지 저장 확인이 필요합니다.');
        } finally { setIsGeneratingImage(false); }
    };

    const handleRetryGeneration = () => {
        if (generationProgress.status !== 'error' || !generationProgress.action || isGenerating) return;

        if (generationProgress.action === 'pdf') {
            void handleDownloadPDF();
            return;
        }

        if (generationProgress.action === 'message') {
            void handleSendReportMessage();
            return;
        }

        void handleDownloadImage();
    };

    if (isQrScanMode) {
        return (
            <div className="min-h-screen bg-slate-100 p-6 flex items-center justify-center">
                <section className="max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-indigo-600">관리자용 분석 자료</p>
                    <h2 className="mt-3 text-2xl font-black text-slate-900">개인별 분석 결과는 교육 현장에 직접 공개하지 않습니다.</h2>
                    <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">근로자 교육에는 지난달 작성사항을 익명화·종합한 월별 계도 리포트만 공유합니다. 개인 점수·순위·감점·반복지적 상세는 관리자 개선 추적에만 사용됩니다.</p>
                    <button type="button" onClick={onBack} className="mt-6 rounded-xl bg-slate-900 px-5 py-3 text-sm font-black text-white">이전 화면으로</button>
                </section>
            </div>
        );
    }

    return (        <div className="bg-slate-100 min-h-screen p-3 sm:p-6 flex flex-col items-center gap-4 sm:gap-6 pb-20 no-print font-sans">
            <div className="bg-white px-3 sm:px-6 py-3 rounded-2xl sm:rounded-full shadow-lg flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3 w-full max-w-[210mm] border border-slate-200 sticky top-2 sm:top-4 z-50">
                <button onClick={onBack} className="text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-900">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7 7-7m-7 7h18" strokeWidth={2}/></svg> 대시보드
                </button>
                <div className="hidden sm:flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span><p className="text-xs font-bold text-slate-800">PSI 관리자용 개인 작성 경향 분석</p></div>
                <div className="flex flex-wrap justify-end gap-2 w-full sm:w-auto">
                    <button hidden onClick={handleShare} disabled={isGenerating} className="bg-yellow-400 text-slate-900 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-black hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1 sm:gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 6.63 5.4 12 12 12 6.63 0 12-5.37 12-12 0-5.52-4.48-10-10-10zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                        공유
                    </button>
                    <button hidden onClick={handleSendReportMessage} disabled={isGenerating || isQrScanMode} className="bg-indigo-600 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1 transition-all">
                        {isSendingMessage ? '문자 중...' : '자동문자'}
                    </button>
                    <button hidden onClick={handleShareImages} disabled={isGenerating} className="bg-fuchsia-600 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-fuchsia-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1 transition-all">
                        문자공유
                    </button>
                    <button onClick={handleDownloadImage} disabled={isGenerating} className="bg-emerald-600 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1 transition-all">
                        {isGeneratingImage ? '생성 중...' : '관리자 보관 이미지'}
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isGenerating} className="bg-slate-900 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                        {isGeneratingPdf ? '생성 중...' : '관리자 보관 PDF'}
                    </button>
                </div>
            </div>

            <div className="w-full max-w-[210mm] rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold leading-6 text-indigo-950">
                <strong>관리자용 분석 자료:</strong> 개인별 작성 경향과 월별 개선이행 확인에만 사용합니다. 교육 현장에는 실명·개인 점수·순위·감점 내역을 공개하지 않으며, 익명화된 월별 계도 리포트를 별도로 공유합니다.
            </div>
            <section className="w-full max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-indigo-600">AdminWorkerInsightReport</p><h3 className="mt-1 text-lg font-black text-slate-900">관리자용 개인 작성 경향</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">{adminInsightReport.assessmentMonth || '-'} · {adminInsightReport.workType}</span></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs font-black text-amber-700">반복 확인 항목</p><p className="mt-2 text-sm font-bold text-slate-700">{adminInsightReport.repeatedIssues.join(' · ') || '확인된 반복 항목 없음'}</p></div><div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-black text-emerald-700">개선이행 확인</p><p className="mt-2 text-sm font-bold text-slate-700">{adminInsightReport.improvementActions.join(' · ') || '관리자 확인 후 개선행동을 등록하세요.'}</p></div></div>
            </section>
            <div className="w-full max-w-[210mm]">
                <InterpretationCardGrid
                    items={generationInterpretationCards}
                    cardClassName="rounded-2xl border p-4 shadow-sm shadow-slate-100"
                />
            </div>

            {shareDiagnostics.warning && !isQrScanMode && (
                <div className={`w-full max-w-[210mm] rounded-2xl border px-4 py-3 text-[12px] font-bold shadow-sm ${shareDiagnostics.qrRisk === 'overflow' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    QR 공유 길이 안내 · {shareDiagnostics.warning} 현재 URL 길이 {shareDiagnostics.urlLength}자 / 제출 내용 {shareDiagnostics.payloadLength}자입니다.
                </div>
            )}

            {generationProgress.status !== 'idle' && (
                <ReportGenerationProgress
                    status={generationProgress.status === 'running' ? 'running' : generationProgress.status === 'success' ? 'success' : 'error'}
                    progress={generationProgress.progress}
                    phaseLabel={generationProgress.phaseLabel}
                    actionLabel={generationProgress.action === 'image' ? '이미지 보고서 생성' : generationProgress.action === 'message' ? '리포트 문자 발송' : 'PDF 보고서 생성'}
                    errorMessage={generationProgress.errorMessage}
                    onRetry={generationProgress.status === 'error' ? handleRetryGeneration : undefined}
                />
            )}

            {false && !isQrScanMode && (
                <div className="w-full max-w-[210mm] rounded-[28px] border border-indigo-100 bg-white px-4 py-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="lg:max-w-[38%]">
                            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-indigo-500">PSI Direct Message</p>
                            <h3 className="mt-1 text-lg font-black text-slate-900">근로자 리포트 자동 문자 발송</h3>
                            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-500">
                                전화번호를 입력하면 앞면/뒷면 리포트를 각각 MMS로 자동 발송합니다. 입력한 번호는 동일 근로자 리포트에서 다시 불러옵니다.
                            </p>
                        </div>
                        <div className="grid flex-1 grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                            <div className="space-y-3">
                                <InterpretationCardGrid
                                    items={messageInterpretationCards}
                                    className="grid grid-cols-1 xl:grid-cols-3 gap-3"
                                    cardClassName="rounded-2xl border p-4"
                                />
                                <label className="block">
                                    <span className="text-[11px] font-black text-slate-600">수신 전화번호</span>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={13}
                                        value={formatPhoneForDisplay(messagePhoneNumber)}
                                        onChange={(event) => setMessagePhoneNumber(normalizePhoneInput(event.target.value))}
                                        placeholder="010-1234-5678"
                                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-[11px] font-black text-slate-600">문자 본문 메모</span>
                                    <textarea
                                        value={messageNote}
                                        onChange={(event) => setMessageNote(event.target.value.slice(0, 180))}
                                        rows={3}
                                        className="mt-1 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none transition focus:border-indigo-400 focus:bg-white"
                                        placeholder="리포트 전달 메모를 입력하세요."
                                    />
                                </label>
                                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
                                    <span className="rounded-full bg-slate-100 px-3 py-1">MMS 2건 발송</span>
                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">이미지당 200KB 이하 자동 압축</span>
                                </div>
                                {lastMessageHistory && (
                                    <p className="text-[11px] font-bold text-slate-500">
                                        최근 발송: {new Date(lastMessageHistory.sentAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} · {formatPhoneForDisplay(lastMessageHistory.phoneNumber)} · {lastMessageHistory.sentCount}건
                                    </p>
                                )}
                                {messageSendStatus && (
                                    <p className={`text-sm font-black ${messageSendStatus.includes('완료') ? 'text-emerald-700' : generationProgress.status === 'error' || messageSendStatus.includes(BRAND_STATUS_LABELS.attention) || messageSendStatus.includes('오류') || messageSendStatus.includes('실패') || messageSendStatus.includes('초과') || messageSendStatus.includes('제한') ? 'text-rose-600' : 'text-indigo-700'}`}>
                                        {messageSendStatus}
                                    </p>
                                )}
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">최근 서버 발송 로그</p>
                                        {isServerMessageLogsLoading && <span className="text-[10px] font-bold text-slate-400">불러오는 중...</span>}
                                    </div>
                                    <div className="mt-2 space-y-2">
                                        {serverMessageLogs.length > 0 ? serverMessageLogs.map((item) => (
                                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                            {item.status === 'SUCCESS' ? '성공' : BRAND_STATUS_LABELS.attention}
                                                        </span>
                                                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${item.send_mode === 'BULK' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}>
                                                            {item.send_mode === 'BULK' ? '일괄발송' : '개별발송'}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] font-bold text-slate-400">{new Date(item.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</span>
                                                </div>
                                                <p className="mt-1 text-[11px] font-black text-slate-700">{formatPhoneForDisplay(item.phone_number)} · {item.sent_count}건</p>
                                                <p className="mt-1 text-[11px] font-bold leading-relaxed text-slate-500">{item.message || '-'}</p>
                                            </div>
                                        )) : (
                                            <p className="text-[11px] font-bold text-slate-400">서버 발송 로그가 아직 없습니다.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 md:w-[180px]">
                                <button
                                    type="button"
                                    onClick={handleSendReportMessage}
                                    disabled={isGenerating}
                                    className="rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {isSendingMessage ? '문자 발송 중...' : '자동 문자 발송'}
                                </button>
                                <p className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] font-bold leading-relaxed text-slate-500">
                                    발신번호는 서버에 등록된 문자 발송 번호를 사용합니다. 문자가 정상 발송되면 등록 근로자 번호도 함께 갱신을 시도합니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div hidden className="w-full max-w-[210mm] rounded-2xl border border-fuchsia-100 bg-fuchsia-50 px-4 py-3 text-[12px] font-bold text-fuchsia-900 shadow-sm">
                모바일에서는 문자공유 버튼으로 양면 리포트 이미지를 문자/MMS·메신저 앱에 바로 첨부할 수 있습니다. 자동문자 버튼은 서버에 연결된 문자 발송 계정으로 직접 MMS를 발송합니다.
            </div>

            {isQrScanMode && (
                <div className="w-full max-w-[210mm] md:hidden sticky top-20 z-40 bg-white border border-indigo-200 rounded-2xl shadow-sm p-3">
                    <h4 className="text-xs font-black text-indigo-700 mb-2">QR 스캔 현장 조회 (핵심 6)</h4>
                    <div className="mb-3">
                        <InterpretationCardGrid
                            items={qrInterpretationCards}
                            className="grid grid-cols-1 gap-3"
                            cardClassName="rounded-2xl border p-3"
                            eyebrowClassName="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500"
                            titleClassName="mt-2 text-xs font-black text-slate-900"
                            descriptionClassName="mt-2 text-[11px] font-semibold text-slate-600 leading-relaxed"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">성명</span><div className="font-black text-slate-800 truncate">{record.name || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">공종</span><div className="font-black text-slate-800 truncate">{record.jobField || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">관리자 식별</span><div className="font-black text-slate-800 truncate">{record.employeeId || record.qrId || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">확인단계/응답품질</span><div className="font-black text-slate-800">{record.safetyLevel} / {record.safetyScore}점</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">무결성</span><div className="font-black text-slate-800">{typeof record.integrityScore === 'number' ? `${record.integrityScore}점` : '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">OCR 신뢰도</span><div className="font-black text-slate-800">{typeof record.ocrConfidence === 'number' ? `${Math.round(record.ocrConfidence * 100)}%` : '-'}</div></div>
                    </div>
                    {Array.isArray(record.scoreReasoning) && record.scoreReasoning.length > 0 && (
                        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
                            <p className="text-[11px] font-black text-slate-700">AI 상세 품질 근거</p>
                            <ul className="mt-1 space-y-1 text-[11px] text-slate-600">
                                {record.scoreReasoning.slice(0, 3).map((reason, index) => (
                                    <li key={index}>• {reason}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="mt-2 bg-violet-50 border border-violet-200 rounded-lg p-2">
                        <p className="text-[11px] font-black text-violet-700">{reassessmentTitle}</p>
                        <div className="mt-1 space-y-1 max-h-28 overflow-y-auto">
                            {reassessmentTrail.map((entry, index) => (
                                <div key={`${entry.timestamp}-${index}`} className="text-[11px] text-violet-700 bg-white/70 border border-violet-100 rounded p-1.5">
                                    <div className="font-bold">{reassessmentTag} {new Date(entry.timestamp).toLocaleString(timelineLocale, timelineDateTimeOptions)}</div>
                                    <div className="mt-0.5">{sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)}</div>
                                </div>
                            ))}
                            {reassessmentTrail.length === 0 && <div className="text-[11px] text-violet-500">재평가 이력이 없습니다.</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* A4 REPORT CONTAINER - Using Shared Template */}
            <div className="w-full max-w-[calc(210mm+20px)] rounded-[20px] border border-slate-200 bg-white p-1.5 sm:p-2 shadow-lg">
                <div className="overflow-auto max-h-[calc(100dvh-220px)] md:max-h-[calc(100vh-220px)] overscroll-contain rounded-xl bg-white p-1 custom-scrollbar" style={{ touchAction: 'pan-x pan-y' }}>
                    <div className="mx-auto flex min-w-fit justify-center">
                        <div className="min-w-[210mm] bg-white">
                            <Suspense fallback={<ReportTemplateFallback />}>
                                <ReportTemplate record={record} history={history} onPhotoClick={startCamera} ref={reportRef} />
                            </Suspense>
                        </div>
                    </div>
                </div>
            </div>
            
            {isCameraOpen && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <button onClick={capturePhoto} className="absolute bottom-10 bg-white px-8 py-4 rounded-full font-bold">촬영</button>
                    <button onClick={stopCamera} className="absolute top-10 right-10 text-white font-bold">닫기</button>
                </div>
            )}

            {mobileBackGuideMessage && (
                <div className="fixed bottom-4 left-1/2 z-[120] w-[calc(100%-32px)] max-w-sm -translate-x-1/2 rounded-2xl border border-slate-200 bg-slate-900/95 px-4 py-3 text-center text-[12px] font-bold text-white shadow-2xl sm:hidden">
                    {mobileBackGuideMessage}
                </div>
            )}
        </div>
    );
};
export default IndividualReport;
