
import React, { Suspense, lazy, useRef, useState, useEffect } from 'react';
import type { WorkerRecord } from '../types';
import { generateReportUrl } from '../utils/qrUtils';
import { ReportGenerationProgress } from '../components/shared/ReportGenerationProgress';
import { ensureHtml2Canvas, ensureJsPdfConstructor } from '../utils/externalScripts';
import { captureReportCanvas, saveCanvasAsA4Pdf } from '../utils/pdfCapture';

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

type GenerationAction = 'pdf' | 'image';

interface GenerationProgressState {
    status: 'idle' | 'running' | 'success' | 'error';
    progress: number;
    phaseLabel: string;
    action: GenerationAction | null;
    errorMessage?: string;
}

const IndividualReport: React.FC<IndividualReportProps> = ({ record, history = [], onBack, onUpdateRecord, isQrScanMode = false }) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [generationProgress, setGenerationProgress] = useState<GenerationProgressState>({
        status: 'idle',
        progress: 0,
        phaseLabel: '대기 중',
        action: null,
    });
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
    const reassessmentTitle = isKorean ? '재평가(Reassessment) 타임라인' : 'Reassessment Timeline';
    const reassessmentFallback = isKorean ? '2차 재가공' : 'Secondary reassessment';
    const reassessmentTag = isKorean ? '[재평가]' : '[reassessment]';
    const reassessmentTrail = (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-5).reverse();
    const isGenerating = isGeneratingPdf || isGeneratingImage;

    const clearProgressInterval = () => {
        if (progressIntervalRef.current !== null) {
            window.clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
    };

    const beginGenerationProgress = (action: GenerationAction) => {
        const actionLabel = action === 'pdf' ? 'PDF 보고서 생성' : '이미지 보고서 생성';

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
            phaseLabel: '오류 발생',
            errorMessage,
        }));
    };

    useEffect(() => {
        return () => {
            clearProgressInterval();
        };
    }, []);

    const startCamera = async () => {
        setIsCameraOpen(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            streamRef.current = stream;
        } catch (e) {
            try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); streamRef.current = stream; } catch (err) { alert('카메라 권한 오류'); setIsCameraOpen(false); }
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
        const url = generateReportUrl(record);
        if (!url) {
            alert('공유 URL 생성 실패');
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
            } else {
                await navigator.clipboard.writeText(url);
                alert(`📋 링크가 복사되었습니다.\n\n${url}`);
            }
        } catch (err) { console.error('Share failed:', err); }
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
            const canvas = await captureReportCanvas(reportRef.current, html2canvas, { scale: 3 });
            updateGenerationProgress(65, '렌더링 결과 변환 중');
            updateGenerationProgress(82, 'PDF 문서 구성 중');
            saveCanvasAsA4Pdf(canvas, PDFCtor as new (orientation: string, unit: string, format: string) => {
                addImage: (...args: unknown[]) => void;
                save: (filename: string) => void;
            }, `PSI_Report_${record.name}.pdf`, 'PNG', 1);
            updateGenerationProgress(95, '파일 저장 중');
            completeGenerationProgress();
        } catch (err: unknown) {
            console.error('PDF generation failed:', err);
            failGenerationProgress('PDF 생성에 실패했습니다. 다시 시도해 주세요.');
            alert('PDF 생성 실패');
        } finally { setIsGeneratingPdf(false); }
    };

    const handleDownloadImage = async () => {
        if (!reportRef.current || isGenerating) return;
        const html2canvas = await ensureHtml2Canvas().catch(() => null);
        if (!html2canvas) {
            failGenerationProgress('이미지 라이브러리가 로드되지 않았습니다. 다시 시도해 주세요.');
            return;
        }

        beginGenerationProgress('image');
        setIsGeneratingImage(true);
        try {
            updateGenerationProgress(20, '데이터 수집 중');
            const canvas = await captureReportCanvas(reportRef.current, html2canvas, { scale: 3 });
            updateGenerationProgress(72, '이미지 변환 중');
            const link = document.createElement('a');
            link.download = `PSI_Report_${record.name}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            updateGenerationProgress(94, '파일 저장 중');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            completeGenerationProgress();
        } catch (err: unknown) {
            console.error('Image save failed:', err);
            failGenerationProgress('이미지 저장에 실패했습니다. 다시 시도해 주세요.');
            alert('이미지 저장 실패');
        } finally { setIsGeneratingImage(false); }
    };

    const handleRetryGeneration = () => {
        if (generationProgress.status !== 'error' || !generationProgress.action || isGenerating) return;

        if (generationProgress.action === 'pdf') {
            void handleDownloadPDF();
            return;
        }

        void handleDownloadImage();
    };

    return (
        <div className="bg-slate-100 min-h-screen p-3 sm:p-6 flex flex-col items-center gap-4 sm:gap-6 pb-20 no-print font-sans">
            <div className="bg-white px-3 sm:px-6 py-3 rounded-2xl sm:rounded-full shadow-lg flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 sm:gap-3 w-full max-w-[210mm] border border-slate-200 sticky top-2 sm:top-4 z-50">
                <button onClick={onBack} className="text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-900">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7 7-7m-7 7h18" strokeWidth={2}/></svg> 대시보드
                </button>
                <div className="hidden sm:flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span><p className="text-xs font-bold text-slate-800">PSI A4 Professional Report</p></div>
                <div className="grid grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
                    <button onClick={handleShare} disabled={isGenerating} className="bg-yellow-400 text-slate-900 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-black hover:bg-yellow-500 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-1 sm:gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 6.63 5.4 12 12 12 6.63 0 12-5.37 12-12 0-5.52-4.48-10-10-10zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                        공유
                    </button>
                    <button onClick={handleDownloadImage} disabled={isGenerating} className="bg-emerald-600 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm flex items-center justify-center gap-1 transition-all">
                        {isGeneratingImage ? '변환 중...' : '이미지 저장'}
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isGenerating} className="bg-slate-900 px-2 sm:px-5 py-2 rounded-xl sm:rounded-full text-[11px] sm:text-xs font-bold text-white hover:bg-black disabled:opacity-60 disabled:cursor-not-allowed transition-all">
                        {isGeneratingPdf ? '생성 중...' : 'PDF 발급'}
                    </button>
                </div>
            </div>

            {generationProgress.status !== 'idle' && (
                <ReportGenerationProgress
                    status={generationProgress.status === 'running' ? 'running' : generationProgress.status === 'success' ? 'success' : 'error'}
                    progress={generationProgress.progress}
                    phaseLabel={generationProgress.phaseLabel}
                    actionLabel={generationProgress.action === 'image' ? '이미지 보고서 생성' : 'PDF 보고서 생성'}
                    errorMessage={generationProgress.errorMessage}
                    onRetry={generationProgress.status === 'error' ? handleRetryGeneration : undefined}
                />
            )}

            {isQrScanMode && (
                <div className="w-full max-w-[210mm] md:hidden sticky top-20 z-40 bg-white border border-indigo-200 rounded-2xl shadow-sm p-3">
                    <h4 className="text-xs font-black text-indigo-700 mb-2">QR 스캔 현장 조회 (핵심 6)</h4>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">성명</span><div className="font-black text-slate-800 truncate">{record.name || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">사번</span><div className="font-black text-slate-800 truncate">{record.employeeId || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">QR ID</span><div className="font-black text-slate-800 truncate">{record.qrId || '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">등급/점수</span><div className="font-black text-slate-800">{record.safetyLevel} / {record.safetyScore}점</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">무결성</span><div className="font-black text-slate-800">{typeof record.integrityScore === 'number' ? `${record.integrityScore}점` : '-'}</div></div>
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2"><span className="text-slate-400 font-bold">OCR 신뢰도</span><div className="font-black text-slate-800">{typeof record.ocrConfidence === 'number' ? `${Math.round(record.ocrConfidence * 100)}%` : '-'}</div></div>
                    </div>
                    {Array.isArray(record.scoreReasoning) && record.scoreReasoning.length > 0 && (
                        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2">
                            <p className="text-[11px] font-black text-slate-700">AI 상세 채점 근거</p>
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
                                    <div className="mt-0.5">{entry.note || reassessmentFallback}</div>
                                </div>
                            ))}
                            {reassessmentTrail.length === 0 && <div className="text-[11px] text-violet-500">{isKorean ? '재평가 이력이 없습니다.' : 'No reassessment history.'}</div>}
                        </div>
                    </div>
                </div>
            )}

            {/* A4 REPORT CONTAINER - Using Shared Template */}
            <div className="w-full max-w-[210mm] overflow-x-auto pb-2">
                <div className="shadow-2xl min-w-[210mm]">
                    <Suspense fallback={<ReportTemplateFallback />}>
                        <ReportTemplate record={record} history={history} onPhotoClick={startCamera} ref={reportRef} />
                    </Suspense>
                </div>
            </div>
            
            {isCameraOpen && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center">
                    <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                    <button onClick={capturePhoto} className="absolute bottom-10 bg-white px-8 py-4 rounded-full font-bold">촬영</button>
                    <button onClick={stopCamera} className="absolute top-10 right-10 text-white font-bold">닫기</button>
                </div>
            )}
        </div>
    );
};
export default IndividualReport;
