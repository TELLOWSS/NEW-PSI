
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
    const [continuousCapture, setContinuousCapture] = useState<boolean>(false);
    const [capturedSessionCount, setCapturedSessionCount] = useState<number>(0);
    const [selectionMessage, setSelectionMessage] = useState('');
    const [preflightReports, setPreflightReports] = useState<OcrUploadPreflight[]>([]);
    const [isCheckingQuality, setIsCheckingQuality] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const filesRef = useRef<File[]>(files);
    const isMountedRef = useRef<boolean>(true);
    const capturedSessionCountRef = useRef<number>(0);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
        if (isAnalyzing) return;
        if (selectedFiles && selectedFiles.length > 0) {
            const fileArray = Array.from(selectedFiles);
            const supportedFiles = fileArray.filter(isSupportedOcrFile);
            const uploadableFiles = supportedFiles.filter((file) => file.size <= OCR_MAX_FILE_SIZE_BYTES);
            const merged = mergeUniqueOcrFiles(filesRef.current, uploadableFiles);
            filesRef.current = merged.files;
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
    }, [isAnalyzing, onFilesChange]);

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isAnalyzing) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) {
            return;
        }
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
        if (isAnalyzing) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelect(e.dataTransfer.files);
            e.dataTransfer.clearData();
        }
    };

    const onFileUploadClick = () => {
        if (isAnalyzing) return;
        fileInputRef.current?.click();
    };

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
        capturedSessionCountRef.current = 0;
        setCapturedSessionCount(0);
    }, []);

    const startCamera = async () => {
        if (isAnalyzing) return;
        capturedSessionCountRef.current = 0;
        setCapturedSessionCount(0);
        try {
            // First try to get the back camera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            if (!isMountedRef.current) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            streamRef.current = stream;
            setIsCameraActive(true);
        } catch (err) {
            console.warn("Back camera not found or access denied, trying default camera...", err);
            try {
                // Fallback to any available video device
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
                if (!isMountedRef.current) {
                    stream.getTracks().forEach(track => track.stop());
                    return;
                }
                streamRef.current = stream;
                setIsCameraActive(true);
            } catch (fallbackErr) {
                console.error("Camera Error:", fallbackErr);
                alert('카메라 접근 권한이 필요하거나 사용 가능한 카메라가 없습니다.');
                setIsCameraActive(false);
            }
        }
    };

    const capturePhoto = () => {
        if (isAnalyzing) return;
        if (videoRef.current && canvasRef.current) {
            const video = videoRef.current;
            const canvas = canvasRef.current;
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    if (!blob || !isMountedRef.current) return;
                    const file = new File([blob], `camera_capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    const merged = mergeUniqueOcrFiles(filesRef.current, [file]);
                    filesRef.current = merged.files;
                    onFilesChange(merged.files);
                    if (continuousCapture) {
                        const next = capturedSessionCountRef.current + 1;
                        capturedSessionCountRef.current = next;
                        setCapturedSessionCount(next);
                        setSelectionMessage(`연속 촬영 ${next}장 추가됨 · 다음 기록지를 맞춰 촬영하거나 완료를 누르세요.`);
                    } else {
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
    }, [stopCamera]);

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
        void assessOcrUploadBatch(files)
            .then((reports) => {
                if (!active) return;
                setPreflightReports(reports);
                onPreflightChange?.(reports);
                setIsCheckingQuality(false);
            })
            .catch(() => {
                if (!active) return;
                setPreflightReports([]);
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
            <div className="relative w-full h-[26rem] sm:h-[30rem] bg-black rounded-2xl overflow-hidden flex flex-col items-center justify-center shadow-2xl" data-psi-camera-guide="a4-frame">
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <canvas ref={canvasRef} className="hidden" />

                {/* Top guidance bar */}
                <div className="absolute top-3 inset-x-3 z-20 flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md border border-white/15">
                        기록지 4개 모서리가 사각형 안에 들어오게 맞춰주세요
                    </span>
                    <button
                        type="button"
                        aria-pressed={continuousCapture}
                        onClick={() => setContinuousCapture((prev) => !prev)}
                        className={`min-h-[38px] rounded-full px-3.5 py-1.5 text-xs font-black transition-all border backdrop-blur-md ${continuousCapture ? 'border-emerald-300 bg-emerald-600 text-white shadow-lg' : 'border-white/30 bg-slate-950/70 text-slate-100 hover:bg-slate-900'}`}
                    >
                        {continuousCapture ? `연속 촬영 ON (${capturedSessionCount}장)` : '연속 촬영 OFF'}
                    </button>
                </div>

                {/* Overlay A4 Guide UI */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-10">
                    <div className="relative h-full w-full max-w-sm border-2 border-white/60 rounded-xl shadow-[0_0_0_9999px_rgba(2,6,23,0.38)]">
                        <span className="absolute -top-0.5 -left-0.5 h-5 w-5 rounded-tl-xl border-t-4 border-l-4 border-indigo-400" />
                        <span className="absolute -top-0.5 -right-0.5 h-5 w-5 rounded-tr-xl border-t-4 border-r-4 border-indigo-400" />
                        <span className="absolute -bottom-0.5 -left-0.5 h-5 w-5 rounded-bl-xl border-b-4 border-l-4 border-indigo-400" />
                        <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-br-xl border-b-4 border-r-4 border-indigo-400" />
                        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400/85 shadow-[0_0_15px_rgba(99,102,241,0.85)] animate-scan"></div>
                    </div>
                </div>

                {capturedSessionCount > 0 && selectionMessage && (
                    <div role="status" className="absolute bottom-24 inset-x-4 z-20 mx-auto max-w-md rounded-xl bg-emerald-950/90 border border-emerald-400/50 px-3 py-2 text-center text-xs font-bold text-emerald-100 backdrop-blur-md">
                        {selectionMessage}
                    </div>
                )}

                <div className="absolute bottom-5 flex items-center gap-3 z-20">
                    <button type="button" onClick={stopCamera} className="min-h-[44px] px-5 py-2.5 bg-white/20 backdrop-blur-md border border-white/30 text-white rounded-full font-bold hover:bg-white/30 transition-all text-sm">
                        {capturedSessionCount > 0 ? `완료 (${capturedSessionCount}장)` : '취소'}
                    </button>
                    <button type="button" onClick={capturePhoto} className="min-h-[48px] px-7 py-2.5 bg-white text-indigo-700 rounded-full font-black shadow-lg hover:scale-105 transition-transform flex items-center gap-2 text-sm">
                        <div className="w-4 h-4 rounded-full border-4 border-indigo-600"></div>
                        촬영하기
                    </button>
                </div>

                <style>{`
                    @keyframes scan {
                        0% { top: 8%; opacity: 0; }
                        10% { opacity: 1; }
                        90% { opacity: 1; }
                        100% { top: 92%; opacity: 0; }
                    }
                    .animate-scan { animation: scan 2.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
                `}</style>
            </div>
        );
    }

    return (
        <div 
            className={`border-2 border-dashed rounded-2xl p-5 sm:p-7 text-center transition-all duration-300 ${isDragging ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-slate-300 bg-slate-50/50 hover:border-indigo-300 hover:bg-white'}`}
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
             <div className="flex flex-col items-center text-slate-600">
                <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-800">
                    <span>1안 · 2안 양식 자동 판별</span>
                    <span className="text-indigo-300">|</span>
                    <span>JPG · PNG · PDF (최대 20MB)</span>
                </div>
                
                {fileCount > 0 ? (
                    <div className="mb-4 animate-fade-in-up">
                        <p className="text-lg font-black text-indigo-700">{fileCount}개의 기록지가 준비되었습니다</p>
                        <p className="text-xs sm:text-sm text-slate-500 font-semibold mt-1">더 추가하거나 아래 분석 시작 버튼을 눌러 주세요</p>
                    </div>
                ) : (
                    <div className="mb-4">
                        <p className="text-base sm:text-lg font-black text-slate-800">위험성평가 기록지를 끌어다 놓거나 선택하세요</p>
                        <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium">스마트폰 현장 촬영 또는 스캔 이미지·PDF 여러 장을 한 번에 등록할 수 있습니다</p>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-lg justify-center">
                    <button type="button" onClick={onFileUploadClick} disabled={isAnalyzing} className="flex-1 min-h-[46px] px-6 py-3 bg-white border border-slate-300 text-slate-800 rounded-xl text-sm font-bold hover:bg-slate-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 shadow-sm">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                        </svg>
                        <span>이미지 / PDF 찾기</span>
                    </button>
                    <button type="button" onClick={startCamera} disabled={isAnalyzing} className="flex-1 min-h-[46px] px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 shadow-md shadow-indigo-200 transition-all flex items-center justify-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                        <span>카메라 촬영</span>
                    </button>
                </div>
                {selectionMessage && (
                    <p role="status" className="mt-3 text-xs sm:text-sm font-bold text-indigo-700">{selectionMessage}</p>
                )}
            </div>

            {files.length > 0 && (
                <div className="mt-6 border-t border-slate-200 pt-5 text-left">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm sm:text-base font-black text-slate-900">분석 전 사진 품질 점검 ({files.length}건)</h3>
                            <p className="mt-0.5 text-xs font-medium text-slate-600">경고 항목은 분석을 막지 않지만, 다시 촬영 필요(차단) 상태 파일은 재촬영 또는 제거 후 분석을 시작할 수 있습니다.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => onFilesChange([])}
                            disabled={isAnalyzing}
                            className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-4 text-xs sm:text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
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
                            const statusPillTone = !report || isCheckingQuality
                                ? 'bg-slate-200 text-slate-700'
                                : report.status === 'blocked'
                                    ? 'bg-rose-600 text-white'
                                    : report.status === 'warning'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-emerald-600 text-white';
                            const statusLabel = !report || isCheckingQuality
                                ? '점검 중'
                                : report.status === 'blocked' ? '다시 촬영 필요' : report.status === 'warning' ? '원본 확인 필요' : '분석 가능';

                            return (
                                <div key={key} className={`overflow-hidden rounded-xl border ${tone}`}>
                                    <div className="flex gap-3 p-3">
                                        <div className="h-24 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                            {previewUrls[key] ? (
                                                <img src={previewUrls[key]} alt={`${file.name} 미리보기`} className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full items-center justify-center text-xs font-black text-slate-500">PDF</div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-slate-900" title={file.name}>{file.name}</p>
                                                    <p className="mt-1 text-xs font-medium text-slate-600 tabular-nums">
                                                        {(file.size / 1024 / 1024).toFixed(1)}MB
                                                        {report?.width && report?.height ? ` · ${report.width}×${report.height}px` : ''}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => removeFile(key)}
                                                    disabled={isAnalyzing}
                                                    aria-label={`${file.name} 제거`}
                                                    className="min-h-[38px] min-w-[44px] rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                                >
                                                    제거
                                                </button>
                                            </div>
                                            <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${statusPillTone}`}>{statusLabel}</span>
                                        </div>
                                    </div>
                                    {report && report.issues.length > 0 && (
                                        <ul className="space-y-1 border-t border-black/5 px-3 py-2 text-xs font-medium text-slate-700">
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
