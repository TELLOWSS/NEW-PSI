
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { isSupportedOcrFile, OCR_FILE_ACCEPT, OCR_MAX_FILE_SIZE_BYTES } from '../utils/ocrFilePolicy';
import {
    assessOcrUploadBatch,
    getOcrFileKey,
    mergeUniqueOcrFiles,
    type OcrUploadPreflight,
} from '../utils/ocrUploadQuality';

interface FileUploadProps {
    onFilesChange: (files: File[]) => void;
    onAnalyze: () => void;
    isAnalyzing: boolean;
    fileCount: number;
    files: File[];
    onPreflightChange?: (reports: OcrUploadPreflight[]) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
    onFilesChange,
    onAnalyze,
    isAnalyzing,
    fileCount,
    files,
    onPreflightChange,
}) => {
    const [isDragging, setIsDragging] = useState<boolean>(false);
    const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
    const [selectionMessage, setSelectionMessage] = useState('');
    const [preflightReports, setPreflightReports] = useState<OcrUploadPreflight[]>([]);
    const [isCheckingQuality, setIsCheckingQuality] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
        if (selectedFiles && selectedFiles.length > 0) {
            const fileArray = Array.from(selectedFiles);
            const supportedFiles = fileArray.filter(isSupportedOcrFile);
            const uploadableFiles = supportedFiles.filter((file) => file.size <= OCR_MAX_FILE_SIZE_BYTES);
            const merged = mergeUniqueOcrFiles(files, uploadableFiles);
            onFilesChange(merged.files);
            const messages = [
                supportedFiles.length !== fileArray.length
                    ? `지원하지 않는 형식 ${fileArray.length - supportedFiles.length}개 제외`
                    : '',
                uploadableFiles.length !== supportedFiles.length
                    ? `20MB 초과 파일 ${supportedFiles.length - uploadableFiles.length}개 제외`
                    : '',
                merged.duplicateCount > 0
                    ? `이미 선택된 중복 파일 ${merged.duplicateCount}개 제외`
                    : '',
            ].filter(Boolean);
            setSelectionMessage(messages.length > 0
                ? messages.join(' · ')
                : `${merged.addedCount}개 파일을 목록에 추가했습니다.`);
        }
    }, [files, onFilesChange]);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const onFileUploadClick = () => {
        fileInputRef.current?.click();
    };

    const startCamera = async () => {
        try {
            // First try to get the back camera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            streamRef.current = stream;
            setIsCameraActive(true);
        } catch (err) {
            console.warn("Back camera not found or access denied, trying default camera...", err);
            try {
                // Fallback to any available video device
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
                streamRef.current = stream;
                setIsCameraActive(true);
            } catch (fallbackErr) {
                console.error("Camera Error:", fallbackErr);
                alert('카메라 접근 권한이 필요하거나 사용 가능한 카메라가 없습니다.');
                setIsCameraActive(false);
            }
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
    };

    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                        const merged = mergeUniqueOcrFiles(files, [file]);
                        onFilesChange(merged.files);
                        setSelectionMessage('촬영 이미지를 목록에 추가했습니다. 아래 품질 점검 결과를 확인해 주세요.');
                        stopCamera();
                    }
                }, 'image/jpeg', 0.95);
            }
        }
    };

    useEffect(() => {
        if (isCameraActive && videoRef.current && streamRef.current) {
            videoRef.current.srcObject = streamRef.current;
        }
    }, [isCameraActive]);

    useEffect(() => {
        return () => stopCamera();
    }, []);

    useEffect(() => {
        const urls: Record<string, string> = {};
        files.forEach((file) => {
            if (file.type.startsWith('image/')) {
                urls[getOcrFileKey(file)] = URL.createObjectURL(file);
            }
        });
        setPreviewUrls(urls);
        return () => Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    }, [files]);

    useEffect(() => {
        let active = true;
        if (files.length === 0) {
            setPreflightReports([]);
            setIsCheckingQuality(false);
            onPreflightChange?.([]);
            return () => { active = false; };
        }

        setIsCheckingQuality(true);
        void assessOcrUploadBatch(files).then((reports) => {
            if (!active) return;
            setPreflightReports(reports);
            onPreflightChange?.(reports);
            setIsCheckingQuality(false);
        });
        return () => { active = false; };
    }, [files, onPreflightChange]);

    const removeFile = (targetKey: string) => {
        onFilesChange(files.filter((file) => getOcrFileKey(file) !== targetKey));
        setSelectionMessage('선택한 파일을 목록에서 제거했습니다.');
    };

    if (isCameraActive) {
        return (
            <div className="relative w-full h-96 bg-black rounded-3xl overflow-hidden flex flex-col items-center justify-center shadow-2xl">
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-0 left-0 w-full h-full border-[30px] border-black/30"></div>
                    <div className="absolute top-[10%] left-[10%] w-[80%] h-[80%] border-2 border-white/50 rounded-xl"></div>
                    {/* Scanning Line */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500/80 shadow-[0_0_15px_rgba(99,102,241,0.8)] animate-scan"></div>
                </div>

                <div className="absolute bottom-8 flex gap-6 z-20">
                    <button onClick={stopCamera} className="px-6 py-3 bg-white/20 backdrop-blur-md border border-white/30 text-white rounded-full font-bold hover:bg-white/30 transition-all text-sm">
                        취소
                    </button>
                    <button onClick={capturePhoto} className="px-8 py-3 bg-white text-indigo-600 rounded-full font-black shadow-lg hover:scale-105 transition-transform flex items-center gap-2">
                        <div className="w-4 h-4 rounded-full border-4 border-indigo-600"></div>
                        촬영하기
                    </button>
                </div>

                <style>{`
                    @keyframes scan {
                        0% { top: 10%; opacity: 0; }
                        10% { opacity: 1; }
                        90% { opacity: 1; }
                        100% { top: 90%; opacity: 0; }
                    }
                    .animate-scan { animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
                `}</style>
            </div>
        );
    }

    return (
        <div 
            className={`border-2 border-dashed rounded-3xl p-10 text-center transition-all duration-300 ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-slate-300 bg-white hover:border-indigo-300'}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept={OCR_FILE_ACCEPT}
                multiple
                onChange={(e) => {
                    handleFileSelect(e.target.files);
                    e.currentTarget.value = '';
                }}
            />
             <div className="flex flex-col items-center text-slate-500">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
                
                {fileCount > 0 ? (
                    <div className="mb-6 animate-fade-in-up">
                        <p className="text-xl font-black text-indigo-600">{fileCount}개의 파일이 준비됨</p>
                        <p className="text-sm text-slate-400 font-bold mt-1">추가 업로드 또는 분석을 시작하세요</p>
                    </div>
                ) : (
                    <div className="mb-6">
                        <p className="text-lg font-bold text-slate-700">위험성 평가표를 여기에 놓으세요</p>
                        <p className="text-sm text-slate-400 mt-1 font-medium">또는 아래 버튼을 눌러 선택하세요</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                    <button type="button" onClick={onFileUploadClick} className="px-8 py-3.5 bg-slate-100 text-slate-700 rounded-2xl text-sm font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>이미지 / PDF 찾기</span>
                    </button>
                    <button type="button" onClick={startCamera} className="px-8 py-3.5 bg-indigo-600 text-white rounded-2xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                        <span>카메라 촬영</span>
                    </button>
                </div>
                {selectionMessage && (
                    <p role="status" className="mt-4 text-sm font-bold text-slate-600">{selectionMessage}</p>
                )}
            </div>

            {files.length > 0 && (
                <div className="mt-8 border-t border-slate-200 pt-6 text-left">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-base font-black text-slate-900">분석 전 사진 품질 점검</h3>
                            <p className="mt-1 text-xs font-bold text-slate-500">차단 항목은 다시 촬영하고, 주의 항목은 원본과 분석 결과를 대조해 주세요.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onFilesChange([])}
                            disabled={isAnalyzing}
                            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-50"
                        >
                            전체 비우기
                        </button>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {files.map((file) => {
                            const key = getOcrFileKey(file);
                            const report = preflightReports.find((item) => item.key === key);
                            const tone = !report || isCheckingQuality
                                ? 'border-slate-200 bg-slate-50'
                                : report.status === 'blocked'
                                    ? 'border-rose-300 bg-rose-50'
                                    : report.status === 'warning'
                                        ? 'border-amber-300 bg-amber-50'
                                        : 'border-emerald-300 bg-emerald-50';
                            const statusLabel = !report || isCheckingQuality
                                ? '점검 중'
                                : report.status === 'blocked' ? '다시 촬영 필요' : report.status === 'warning' ? '원본 확인 필요' : '분석 가능';

                            return (
                                <div key={key} className={`overflow-hidden rounded-2xl border ${tone}`}>
                                    <div className="flex gap-3 p-3">
                                        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-xl border border-white/80 bg-white">
                                            {previewUrls[key] ? (
                                                <img src={previewUrls[key]} alt={`${file.name} 미리보기`} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-xs font-black text-slate-500">PDF</div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-slate-900" title={file.name}>{file.name}</p>
                                                    <p className="mt-1 text-[11px] font-bold text-slate-500">
                                                        {(file.size / 1024 / 1024).toFixed(1)}MB
                                                        {report?.width && report?.height ? ` · ${report.width}×${report.height}px` : ''}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(key)}
                                                    disabled={isAnalyzing}
                                                    aria-label={`${file.name} 제거`}
                                                    className="min-h-11 min-w-11 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-600 disabled:opacity-50"
                                                >
                                                    제거
                                                </button>
                                            </div>
                                            <p className="mt-2 text-xs font-black text-slate-700">{statusLabel}</p>
                                        </div>
                                    </div>
                                    {report && report.issues.length > 0 && (
                                        <ul className="space-y-1 border-t border-black/5 px-3 py-2 text-xs font-bold text-slate-700">
                                            {report.issues.map((issue) => (
                                                <li key={`${key}-${issue.code}`}>• {issue.message}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
