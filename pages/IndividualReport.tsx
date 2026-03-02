
import React, { useRef, useState, useEffect } from 'react';
import type { WorkerRecord } from '../types';
import { generateReportUrl } from '../utils/qrUtils';
import { ReportTemplate } from '../components/ReportTemplate';
import { getWindowProp } from '../utils/windowUtils';

interface IndividualReportProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onBack: () => void;
    onUpdateRecord?: (record: WorkerRecord) => void;
    isQrScanMode?: boolean;
}

const IndividualReport: React.FC<IndividualReportProps> = ({ record, history = [], onBack, onUpdateRecord, isQrScanMode = false }) => {
    const reportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

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
        if (!reportRef.current) return;
        const html2canvas = getWindowProp<any>('html2canvas');
        const jspdf = getWindowProp<any>('jspdf');
        if (!html2canvas || !jspdf) return alert('PDF 라이브러리가 로드되지 않았습니다.');

        setIsGeneratingPdf(true);
        try {
            const canvas = await html2canvas(reportRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
            const imgData = canvas.toDataURL('image/png', 1.0);
            const jsPDFCtor = (jspdf && (jspdf as unknown as { jsPDF?: unknown }).jsPDF) ? (jspdf as unknown as { jsPDF?: unknown }).jsPDF : jspdf;
            const PDFCtor = typeof jsPDFCtor === 'function' ? jsPDFCtor : null;
            if (!PDFCtor) throw new Error('jsPDF constructor not available');
            const pdf = new (PDFCtor as new (...args: any[]) => any)('p', 'mm', 'a4');
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
            pdf.save(`PSI_Report_${record.name}.pdf`);
        } catch (err: unknown) {
            console.error('PDF generation failed:', err);
            alert('PDF 생성 실패');
        } finally { setIsGeneratingPdf(false); }
    };

    const handleDownloadImage = async () => {
        if (!reportRef.current) return;
        const html2canvas = getWindowProp<any>('html2canvas');
        if (!html2canvas) return alert('이미지 라이브러리가 로드되지 않았습니다.');

        setIsGeneratingImage(true);
        try {
            const canvas = await html2canvas(reportRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
            const link = document.createElement('a');
            link.download = `PSI_Report_${record.name}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err: unknown) {
            console.error('Image save failed:', err);
            alert('이미지 저장 실패');
        } finally { setIsGeneratingImage(false); }
    };

    return (
        <div className="bg-slate-100 min-h-screen p-6 flex flex-col items-center gap-6 pb-20 no-print font-sans">
            <div className="bg-white px-6 py-3 rounded-full shadow-lg flex justify-between items-center w-full max-w-[210mm] border border-slate-200 sticky top-4 z-50">
                <button onClick={onBack} className="text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-900">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7 7-7m-7 7h18" strokeWidth={2}/></svg> 대시보드
                </button>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span><p className="text-xs font-bold text-slate-800">PSI A4 Professional Report</p></div>
                <div className="flex gap-2">
                    <button onClick={handleShare} className="bg-yellow-400 text-slate-900 px-5 py-2 rounded-full text-xs font-black hover:bg-yellow-500 flex items-center gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 6.63 5.4 12 12 12 6.63 0 12-5.37 12-12 0-5.52-4.48-10-10-10zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                        공유
                    </button>
                    <button onClick={handleDownloadImage} disabled={isGeneratingImage} className="bg-emerald-600 px-5 py-2 rounded-full text-xs font-bold text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1 transition-all">
                        {isGeneratingImage ? '변환 중...' : '이미지 저장'}
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-slate-900 px-5 py-2 rounded-full text-xs font-bold text-white hover:bg-black transition-all">
                        {isGeneratingPdf ? '생성 중...' : 'PDF 발급'}
                    </button>
                </div>
            </div>

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
                </div>
            )}

            {/* A4 REPORT CONTAINER - Using Shared Template */}
            <div className="shadow-2xl">
                <ReportTemplate record={record} history={history} onPhotoClick={startCamera} ref={reportRef} />
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
