
import React, { useState, useRef, useMemo, useEffect } from 'react';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';
import { extractMessage } from '../utils/errorUtils';
import { ReportTemplate } from '../components/ReportTemplate';
import { ReportGenerationProgress } from '../components/shared/ReportGenerationProgress';
import { getWindowProp } from '../utils/windowUtils';
import { createEvidencePackagePdfBlob } from '../utils/evidenceReportUtils';
import { verifyEvidenceManifest, formatEvidenceVerificationSummary } from '../utils/evidenceVerificationUtils';
import type { EvidenceManifest, EvidenceManifestVerificationResult } from '../utils/evidenceVerificationUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { captureReportCanvas, getCanvasImageData, getCanvasPlacementOnA4, saveCanvasAsA4Pdf } from '../utils/pdfCapture';

type ReportType = 'worker-report' | 'team-report';
type GenMode = 'combined-pdf' | 'individual-pdf' | 'individual-img';
type ViewMode = 'list' | 'preview';
type DatePreset = 'all' | 'last30' | 'thisMonth' | 'custom';

interface ReportGenerationUiState {
    status: 'idle' | 'running' | 'success' | 'error';
    progress: number;
    phaseLabel: string;
    errorMessage?: string;
}

interface ReportsProps {
    workerRecords?: WorkerRecord[];
    safetyCheckRecords?: SafetyCheckRecord[];
    briefingData: BriefingData | null;
    setBriefingData: (data: BriefingData | null) => void;
    forecastData: RiskForecastData | null;
    setForecastData: (data: RiskForecastData | null) => void;
}

const Reports: React.FC<ReportsProps> = ({ workerRecords = [], safetyCheckRecords = [], briefingData, setBriefingData, forecastData, setForecastData }) => {
    const [activeTab, setActiveTab] = useState<ReportType>('team-report');
    const [isGenerating, setIsGenerating] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
    const [isPackagingEvidence, setIsPackagingEvidence] = useState(false);
    const [reportGenerationUi, setReportGenerationUi] = useState<ReportGenerationUiState>({
        status: 'idle',
        progress: 0,
        phaseLabel: '대기 중',
    });
    
    // 생성 옵션
    const [selectedTeam, setSelectedTeam] = useState('전체');
    const [filterLevel, setFilterLevel] = useState('전체');
    const [genMode, setGenMode] = useState<GenMode>('individual-pdf'); 
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customStartDate, setCustomStartDate] = useState('');
    const [customEndDate, setCustomEndDate] = useState('');
    
    // 뷰 모드 및 미리보기 상태
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [previewIndex, setPreviewIndex] = useState(0);
    const previewRef = useRef<HTMLDivElement>(null); // For single capture in preview

    // Bulk Generation State
    const [generatingRecord, setGeneratingRecord] = useState<WorkerRecord | null>(null);
    const [generatingHistory, setGeneratingHistory] = useState<WorkerRecord[]>([]);
    const bulkReportRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<boolean>(false);

    // Evidence Verification State
    const [verificationManifestFile, setVerificationManifestFile] = useState<File | null>(null);
    const [verificationJsonFiles, setVerificationJsonFiles] = useState<File[]>([]);
    const [isVerifyingEvidence, setIsVerifyingEvidence] = useState(false);
    const [verificationResult, setVerificationResult] = useState<EvidenceManifestVerificationResult | null>(null);
    const [verificationSummary, setVerificationSummary] = useState('');

    const bulkProgressPercent = useMemo(() => {
        if (!bulkProgress.total || bulkProgress.total <= 0) return 0;
        return Math.min(100, Math.round((bulkProgress.current / bulkProgress.total) * 100));
    }, [bulkProgress.current, bulkProgress.total]);

    const scoredRecords = useMemo(
        () => workerRecords.map((record) => ({
            ...record,
            safetyLevel: getSafetyLevelFromScore(Number(record.safetyScore)),
        })),
        [workerRecords],
    );

    // 공종 목록 추출
    const teams = useMemo(() => ['전체', ...Array.from(new Set(scoredRecords.map(r => r.jobField))).sort()], [scoredRecords]);

    const parseRecordDate = (value: string): Date | null => {
        if (!value) return null;
        const normalized = value.replace(/\./g, '-').replace(/\//g, '-').replace(/\s+/g, '').trim();
        const direct = new Date(normalized);
        if (!Number.isNaN(direct.getTime())) return direct;

        const matched = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        if (!matched) return null;

        const [, year, month, day] = matched;
        const parsed = new Date(Number(year), Number(month) - 1, Number(day));
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed;
    };

    const dateFilterLabel = useMemo(() => {
        if (datePreset === 'last30') return '최근30일';
        if (datePreset === 'thisMonth') return '당월';
        if (datePreset === 'custom' && customStartDate && customEndDate) return `${customStartDate}_${customEndDate}`;
        if (datePreset === 'custom') return '사용자지정';
        return '전체기간';
    }, [datePreset, customStartDate, customEndDate]);

    const resolvedDateRange = useMemo(() => {
        const now = new Date();
        now.setHours(23, 59, 59, 999);

        let startDate: Date | null = null;
        let endDate: Date | null = null;

        if (datePreset === 'last30') {
            endDate = new Date(now);
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
        } else if (datePreset === 'thisMonth') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            endDate = new Date(now);
        } else if (datePreset === 'custom') {
            if (customStartDate) {
                const parsedStart = new Date(customStartDate);
                if (!Number.isNaN(parsedStart.getTime())) {
                    parsedStart.setHours(0, 0, 0, 0);
                    startDate = parsedStart;
                }
            }
            if (customEndDate) {
                const parsedEnd = new Date(customEndDate);
                if (!Number.isNaN(parsedEnd.getTime())) {
                    parsedEnd.setHours(23, 59, 59, 999);
                    endDate = parsedEnd;
                }
            }
        }

        const formatYmd = (date: Date | null) => {
            if (!date) return 'N/A';
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        return {
            startDate,
            endDate,
            startLabel: formatYmd(startDate),
            endLabel: formatYmd(endDate),
        };
    }, [datePreset, customStartDate, customEndDate]);

    const isInvalidCustomDateRange = useMemo(() => {
        if (datePreset !== 'custom') return false;
        if (!customStartDate || !customEndDate) return false;
        const start = new Date(customStartDate);
        const end = new Date(customEndDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
        return start > end;
    }, [datePreset, customStartDate, customEndDate]);

    const isIncompleteCustomDateRange = useMemo(() => {
        if (datePreset !== 'custom') return false;
        return !customStartDate || !customEndDate;
    }, [datePreset, customStartDate, customEndDate]);

    const hasCustomDateRangeError = isInvalidCustomDateRange || isIncompleteCustomDateRange;

    // 필터링 로직
    const filteredRecords = useMemo(() => {
        let result = scoredRecords;
        if (activeTab === 'team-report' && selectedTeam !== '전체') {
            result = result.filter(r => r.jobField === selectedTeam);
        }
        if (filterLevel !== '전체') {
            result = result.filter(r => r.safetyLevel === filterLevel);
        }
        if (datePreset !== 'all') {
            result = result.filter(record => {
                const recordDate = parseRecordDate(record.date);
                if (!recordDate) return false;
                const inStart = !resolvedDateRange.startDate || recordDate >= resolvedDateRange.startDate;
                const inEnd = !resolvedDateRange.endDate || recordDate <= resolvedDateRange.endDate;
                return inStart && inEnd;
            });
        }
        // 최신 데이터 기준 정렬 (이름순)
        return result.sort((a,b) => a.name.localeCompare(b.name));
    }, [scoredRecords, activeTab, selectedTeam, filterLevel, datePreset, resolvedDateRange]);

    // 필터 변경 시 미리보기 인덱스 초기화
    useEffect(() => {
        setPreviewIndex(0);
    }, [selectedTeam, filterLevel, datePreset, customStartDate, customEndDate, activeTab]);

    useEffect(() => {
        if (datePreset !== 'custom') return;
        if (customStartDate || customEndDate) return;

        const formatDateInput = (date: Date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        const today = new Date();
        const end = formatDateInput(today);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - 29);
        const start = formatDateInput(startDate);

        setCustomStartDate(start);
        setCustomEndDate(end);
    }, [datePreset, customStartDate, customEndDate]);

    // 현재 미리보기 대상 데이터
    const currentPreviewRecord = filteredRecords[previewIndex];
    const currentPreviewHistory = useMemo(() => {
        if (!currentPreviewRecord) return [];
        return scoredRecords.filter(r => 
            r.name === currentPreviewRecord.name && 
            (r.teamLeader || '미지정') === (currentPreviewRecord.teamLeader || '미지정')
        );
    }, [currentPreviewRecord, scoredRecords]);

    // 렌더링 안정화 대기 함수
    const waitForRender = async (ms: number = 1500) => {
        await new Promise(resolve => setTimeout(resolve, ms)); 
    };

    // [New] 미리보기 네비게이션
    const handlePrev = () => setPreviewIndex(prev => Math.max(0, prev - 1));
    const handleNext = () => setPreviewIndex(prev => Math.min(filteredRecords.length - 1, prev + 1));

    // [Helper] jsPDF Constructor 가져오기
    const getJsPDF = () => {
        const jspdf = getWindowProp<any>('jspdf');
        if (!jspdf) return null;
        try {
            return typeof jspdf.jsPDF !== 'undefined' ? jspdf.jsPDF : jspdf;
        } catch {
            return jspdf;
        }
    };

    // [New] 현재 미리보기 보고서 단건 내보내기
    const handleDownloadCurrent = async () => {
        if (isIncompleteCustomDateRange) return alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
        if (isInvalidCustomDateRange) return alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
        if (!currentPreviewRecord) return alert('내보낼 데이터가 없습니다.');
        if (!previewRef.current) return alert('미리보기 화면이 로드되지 않았습니다.');
        
        const html2canvas = getWindowProp<any>('html2canvas');
        if (!html2canvas) return alert('html2canvas 라이브러리가 로드되지 않았습니다.');
        
        const JsPDF = getJsPDF();
        if (!JsPDF) return alert('jsPDF 라이브러리가 로드되지 않았습니다.');

        if (!confirm(`'${currentPreviewRecord.name}' 근로자의 보고서를 PDF로 내보내시겠습니까?`)) return;

        try {
            const canvas = await captureReportCanvas(previewRef.current, html2canvas, { scale: 3 });
            saveCanvasAsA4Pdf(
                canvas,
                JsPDF as new (orientation: string, unit: string, format: string) => {
                    addImage: (...args: unknown[]) => void;
                    save: (filename: string) => void;
                },
                `PSI_Report_${currentPreviewRecord.name}_${currentPreviewRecord.jobField}.pdf`,
                'PNG',
                1
            );
        } catch (e) {
            console.error(e);
            alert('PDF 생성 중 오류가 발생했습니다.');
        }
    };

    const handleGenerate = async () => {
        if (isIncompleteCustomDateRange) return alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
        if (isInvalidCustomDateRange) return alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
        if (filteredRecords.length === 0) return alert('출력할 대상이 없습니다.');

        // 라이브러리 체크
        const missingLibs: string[] = [];
        if (!getWindowProp<any>('html2canvas')) missingLibs.push('html2canvas');
        const JsPDF = getJsPDF();
        if (!JsPDF) missingLibs.push('jspdf');
        if (!getWindowProp<any>('JSZip')) missingLibs.push('JSZip');
        if (!getWindowProp<any>('saveAs')) missingLibs.push('FileSaver');

        if (missingLibs.length > 0) {
            return alert(`필수 라이브러리가 로드되지 않았습니다.\n(누락: ${missingLibs.join(', ')})\n\n인터넷 연결을 확인하거나 페이지를 새로고침(F5) 해주세요.`);
        }
        
        const modeLabels: Record<GenMode, string> = {
            'combined-pdf': '통합 PDF 파일 (1개)',
            'individual-pdf': '개별 PDF 파일 (ZIP 압축)',
            'individual-img': '개별 이미지 파일 (ZIP 압축)'
        };

        if (!confirm(`${selectedTeam === '전체' ? '전체 팀' : selectedTeam + ' 팀'}의 근로자 ${filteredRecords.length}명에 대해\n[${modeLabels[genMode]}] 생성을 시작하시겠습니까?\n\n* 주의: 생성 중에는 화면을 닫지 말고 기다려주세요.`)) return;

        // 초기화
        setIsGenerating(true);
        setReportGenerationUi({
            status: 'running',
            progress: 0,
            phaseLabel: '생성 시작 준비 중',
        });
        abortRef.current = false;
        setBulkProgress({ current: 0, total: filteredRecords.length });

        const JSZip = getWindowProp<any>('JSZip');
        const saveAs = getWindowProp<any>('saveAs');
        const html2canvas = getWindowProp<any>('html2canvas');

        const zip = new JSZip();
        const timestamp = new Date().toISOString().slice(0,10).replace(/-/g, '');
        const folderName = `PSI_${selectedTeam}_${timestamp}`;
        const folder = zip.folder(folderName);
        
        // [IMPROVED] Track failed records for user feedback
        const failedRecords: string[] = [];
        
        // Combined PDF용 마스터 인스턴스
        let masterPdf: { addPage?: (...args: any[]) => void; addImage?: (...args: any[]) => void; save?: (...args: any[]) => void; } | null = null;
        if (genMode === 'combined-pdf') {
            try { masterPdf = new (JsPDF as unknown as new (...args: any[]) => any)('p', 'mm', 'a4'); } catch { masterPdf = null; }
        }

        try {
            for (let i = 0; i < filteredRecords.length; i++) {
                if (abortRef.current) break;

                const record = filteredRecords[i];
                const workerHistory = scoredRecords.filter(r => 
                    r.name === record.name && 
                    (r.teamLeader || '미지정') === (record.teamLeader || '미지정')
                );

                // 상태 업데이트 -> 렌더링 트리거
                setGeneratingRecord(record);
                setGeneratingHistory(workerHistory);
                setBulkProgress({ current: i + 1, total: filteredRecords.length });
                const baseProgress = Math.floor((i / filteredRecords.length) * 90);
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: Math.max(prev.progress, baseProgress),
                    phaseLabel: `${record.name} 데이터 수집 중`,
                }));

                // DOM 렌더링 대기 (차트 애니메이션 등 고려)
                await waitForRender(1200);
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: Math.max(prev.progress, Math.floor(((i + 0.45) / filteredRecords.length) * 90)),
                    phaseLabel: `${record.name} 보고서 렌더링 중`,
                }));

                if (bulkReportRef.current && !abortRef.current) {
                    try {
                        const canvas = await captureReportCanvas(bulkReportRef.current, html2canvas, { scale: 3 });

                        const fileNameBase = `${record.name}_${record.jobField}`;
                        const placement = getCanvasPlacementOnA4(canvas);

                        // --- 모드별 분기 처리 ---
                        if (genMode === 'combined-pdf') {
                            // [FIXED] Add null check for masterPdf
                            if (!masterPdf || !masterPdf.addPage || !masterPdf.addImage) {
                                throw new Error('PDF 생성기 초기화 실패');
                            }
                            const imgData = getCanvasImageData(canvas, 'PNG', 1);
                            if (i > 0) masterPdf.addPage();
                            masterPdf.addImage(imgData, 'PNG', placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
                        } 
                        else if (genMode === 'individual-pdf') {
                            const imgData = getCanvasImageData(canvas, 'PNG', 1);
                            const tempPdf = new JsPDF('p', 'mm', 'a4');
                            tempPdf.addImage(imgData, 'PNG', placement.offsetX, placement.offsetY, placement.width, placement.height, undefined, 'FAST');
                            // PDF Blob 생성
                            const pdfBlob = tempPdf.output('blob');
                            folder.file(`${fileNameBase}.pdf`, pdfBlob);
                        } 
                        else if (genMode === 'individual-img') {
                            // [FIXED] Add timeout to prevent infinite hang
                            const blob = await Promise.race([
                                new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9)),
                                new Promise<Blob | null>(resolve => setTimeout(() => resolve(null), 10000)) // 10s timeout
                            ]);
                            if (blob) {
                                folder.file(`${fileNameBase}.jpg`, blob);
                            } else {
                                console.warn(`[Warning] ${record.name} 이미지 생성 실패 (timeout or null)`);
                            }
                        }

                        setReportGenerationUi(prev => ({
                            ...prev,
                            status: 'running',
                            progress: Math.max(prev.progress, Math.floor(((i + 0.85) / filteredRecords.length) * 90)),
                            phaseLabel: `${record.name} 저장 처리 중`,
                        }));
                    } catch (err) {
                        console.error(`[Error] ${record.name} 처리 중 오류:`, err);
                        // Notify user of individual failure
                        failedRecords.push(record.name);
                    }
                }
                
                // [IMPROVED] 메모리 해제를 위한 충분한 딜레이 (100ms → 500ms)
                await new Promise(r => setTimeout(r, 500));
            }

            if (!abortRef.current) {
                setReportGenerationUi(prev => ({
                    ...prev,
                    status: 'running',
                    progress: 96,
                    phaseLabel: '최종 파일 패키징 중',
                }));
                if (genMode === 'combined-pdf') {
                    // [FIXED] Check masterPdf exists before calling save
                    if (masterPdf && masterPdf.save) {
                        masterPdf.save(`${folderName}.pdf`);
                    } else {
                        throw new Error('PDF 저장 실패: 마스터 PDF 인스턴스가 없습니다.');
                    }
                } else {
                    const content = await zip.generateAsync({ type: "blob" });
                    saveAs(content,(`${folderName}.zip`));
                }

                setReportGenerationUi({
                    status: 'success',
                    progress: 100,
                    phaseLabel: '완료',
                });
                
                // [IMPROVED] Show detailed completion message with failed records
                if (failedRecords.length > 0) {
                    const displayLimit = 10;
                    const displayedFailures = failedRecords.slice(0, displayLimit);
                    const remainingCount = failedRecords.length - displayLimit;
                    const failureList = displayedFailures.join(', ') + (remainingCount > 0 ? `\n... 외 ${remainingCount}건` : '');
                    
                    alert(`생성이 완료되었습니다.\n\n성공: ${filteredRecords.length - failedRecords.length}건\n실패: ${failedRecords.length}건\n\n실패한 근로자:\n${failureList}\n\n다운로드 폴더를 확인해주세요.`);
                } else {
                    alert(`생성이 완료되었습니다.\n\n총 ${filteredRecords.length}건 성공\n\n다운로드 폴더를 확인해주세요.`);
                }
            } else {
                setReportGenerationUi({
                    status: 'error',
                    progress: Math.max(1, bulkProgressPercent),
                    phaseLabel: '중단됨',
                    errorMessage: '보고서 생성이 중단되었습니다. 다시 시도해 주세요.',
                });
                alert('작업이 중단되었습니다.');
            }

        } catch (e: unknown) {
            console.error("Critical Error:", e);
            const errMsg = extractMessage(e);
            setReportGenerationUi({
                status: 'error',
                progress: Math.max(1, bulkProgressPercent),
                phaseLabel: '오류 발생',
                errorMessage: `오류가 발생했습니다: ${errMsg}`,
            });
            alert(`오류가 발생했습니다: ${errMsg}\n브라우저 메모리가 부족할 수 있습니다. 페이지를 새로고침 후 다시 시도해주세요.`);
        } finally {
            setIsGenerating(false);
            setGeneratingRecord(null);
            setGeneratingHistory([]);
        }
    };

    const retryReportGeneration = () => {
        if (isGenerating || isPackagingEvidence) return;
        void handleGenerate();
    };

    const cancelGeneration = () => {
        if(confirm("작업을 중단하시겠습니까?")) {
            abortRef.current = true;
        }
    };

    const sha256Hex = async (text: string): Promise<string> => {
        const subtle = window?.crypto?.subtle;
        if (!subtle) return '';
        const encoded = new TextEncoder().encode(text);
        const digest = await subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(digest))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    };

    const handleExportEvidenceZip = async () => {
        if (isIncompleteCustomDateRange) {
            alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
            return;
        }
        if (isInvalidCustomDateRange) {
            alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
            return;
        }
        if (filteredRecords.length === 0) {
            alert('내보낼 증빙 대상이 없습니다.');
            return;
        }

        const JSZip = getWindowProp<any>('JSZip');
        const saveAs = getWindowProp<any>('saveAs');
        if (!JSZip || !saveAs) {
            alert('ZIP 생성 라이브러리(JSZip/FileSaver)가 로드되지 않았습니다. 새로고침 후 다시 시도해주세요.');
            return;
        }

        if (!confirm(`필터된 ${filteredRecords.length}명에 대한 증빙 패키지 ZIP(PDF+JSON+CSV)을 생성하시겠습니까?`)) return;

        setIsPackagingEvidence(true);
        setBulkProgress({ current: 0, total: filteredRecords.length });

        try {
            const zip = new JSZip();
            const folderName = `PSI_Evidence_${selectedTeam}_${dateFilterLabel}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
            const root = zip.folder(folderName);
            const pdfFolder = root.folder('pdf');
            const jsonFolder = root.folder('json');
            const manifestEntries: Array<{
                recordId: string;
                name: string;
                date: string;
                pdfFile: string | null;
                jsonFile: string;
                jsonSha256: string;
                evidenceHash: string;
            }> = [];
            const packageGeneratedAt = new Date().toISOString();

            const csvHeader = [
                'dateFilterPreset','dateRangeStart','dateRangeEnd',
                'recordId','name','employeeId','jobField','teamLeader','date','safetyScore','safetyLevel',
                'ocrConfidence','integrityScore','matchMethod','signatureMatchScore','correctionCount','actionCount','approvalCount','evidenceHash'
            ];
            const csvRows: string[] = [csvHeader.join(',')];

            const escapeCsv = (value: unknown) => {
                const str = String(value ?? '');
                if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            for (let i = 0; i < filteredRecords.length; i++) {
                const record = filteredRecords[i];
                setBulkProgress({ current: i + 1, total: filteredRecords.length });

                const safeName = `${record.name}_${record.date}`.replace(/[\\/:*?"<>|]/g, '_');
                const pdfFileName = `${safeName}.pdf`;
                const jsonFileName = `${safeName}.json`;
                let pdfGenerated = false;

                const pdfBlob = await createEvidencePackagePdfBlob(record);
                if (pdfBlob) {
                    pdfFolder.file(pdfFileName, pdfBlob);
                    pdfGenerated = true;
                }

                const jsonPayload = {
                    packageMeta: {
                        generatedAt: packageGeneratedAt,
                        teamFilter: selectedTeam,
                        levelFilter: filterLevel,
                        dateFilterPreset: dateFilterLabel,
                        dateRangeStart: resolvedDateRange.startLabel,
                        dateRangeEnd: resolvedDateRange.endLabel,
                    },
                    record,
                };
                const jsonContent = JSON.stringify(jsonPayload, null, 2);
                const jsonSha256 = await sha256Hex(jsonContent);
                jsonFolder.file(jsonFileName, jsonContent);

                manifestEntries.push({
                    recordId: record.id,
                    name: record.name,
                    date: record.date,
                    pdfFile: pdfGenerated ? `pdf/${pdfFileName}` : null,
                    jsonFile: `json/${jsonFileName}`,
                    jsonSha256,
                    evidenceHash: record.evidenceHash || '',
                });

                const row = [
                    dateFilterLabel,
                    resolvedDateRange.startLabel,
                    resolvedDateRange.endLabel,
                    record.id,
                    record.name,
                    record.employeeId || '',
                    record.jobField,
                    record.teamLeader || '미지정',
                    record.date,
                    record.safetyScore,
                    getSafetyLevelFromScore(Number(record.safetyScore)),
                    typeof record.ocrConfidence === 'number' ? record.ocrConfidence.toFixed(3) : '',
                    typeof record.integrityScore === 'number' ? record.integrityScore : '',
                    record.matchMethod || '',
                    typeof record.signatureMatchScore === 'number' ? record.signatureMatchScore.toFixed(3) : '',
                    (record.correctionHistory || []).length,
                    (record.actionHistory || []).length,
                    (record.approvalHistory || []).length,
                    record.evidenceHash || ''
                ];
                csvRows.push(row.map(escapeCsv).join(','));
            }

            const jsonHashIndexSource = manifestEntries
                .map((entry) => `${entry.jsonFile}:${entry.jsonSha256}`)
                .join('\n');
            const packageJsonIndexSha256 = await sha256Hex(jsonHashIndexSource);

            const csvMetaLines = [
                `# packageName=${folderName}`,
                `# generatedAt=${packageGeneratedAt}`,
                `# teamFilter=${selectedTeam}`,
                `# levelFilter=${filterLevel}`,
                `# dateFilterPreset=${dateFilterLabel}`,
                `# dateRangeStart=${resolvedDateRange.startLabel}`,
                `# dateRangeEnd=${resolvedDateRange.endLabel}`,
                `# packageJsonIndexSha256=${packageJsonIndexSha256}`,
            ];

            root.file('evidence_index.csv', '\uFEFF' + [...csvMetaLines, ...csvRows].join('\n'));
            root.file('README.txt', [
                'PSI 증빙 패키지 ZIP',
                `생성일시: ${new Date().toLocaleString()}`,
                `대상 수: ${filteredRecords.length}`,
                `기간 프리셋: ${dateFilterLabel}`,
                `적용 시작일: ${resolvedDateRange.startLabel}`,
                `적용 종료일: ${resolvedDateRange.endLabel}`,
                '구성: pdf/, json/, evidence_index.csv, manifest.json',
                '무결성 검증: manifest.json의 files[].jsonSha256 값과 json 파일 SHA-256 해시를 비교하세요.',
                '패키지 요약 해시: manifest.summary.packageJsonIndexSha256 값으로 전체 JSON 집합의 일관성을 검증하세요.',
                'CSV 메타: evidence_index.csv 상단 #packageJsonIndexSha256 값으로 동일 검증 가능합니다.',
                'PowerShell 예시: Get-FileHash -Algorithm SHA256 .\\json\\파일명.json',
                'OpenSSL 예시: openssl dgst -sha256 ./json/파일명.json'
            ].join('\n'));

            const manifest = {
                packageName: folderName,
                generatedAt: packageGeneratedAt,
                summary: {
                    totalRecords: filteredRecords.length,
                    teamFilter: selectedTeam,
                    levelFilter: filterLevel,
                    dateFilterPreset: dateFilterLabel,
                    dateRangeStart: resolvedDateRange.startLabel,
                    dateRangeEnd: resolvedDateRange.endLabel,
                    jsonHashAlgorithm: 'SHA-256',
                    packageJsonIndexSha256,
                    packageJsonIndexSourceFormat: 'jsonPath:jsonSha256 per line',
                    csvIncludesMetaHeader: true,
                },
                files: manifestEntries,
            };
            root.file('manifest.json', JSON.stringify(manifest, null, 2));

            const blob = await zip.generateAsync({ type: 'blob' });
            saveAs(blob, `${folderName}.zip`);
            alert(`증빙 패키지 ZIP 생성 완료 (${filteredRecords.length}건)`);
        } catch (e: unknown) {
            const msg = extractMessage(e);
            alert(`증빙 패키지 생성 중 오류가 발생했습니다: ${msg}`);
        } finally {
            setIsPackagingEvidence(false);
            setBulkProgress({ current: 0, total: 0 });
        }
    };

    const handleExportCsv = () => {
        if (isIncompleteCustomDateRange) {
            alert('사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.');
            return;
        }
        if (isInvalidCustomDateRange) {
            alert('기간 필터가 올바르지 않습니다. 시작일과 종료일을 확인해주세요.');
            return;
        }
        if (filteredRecords.length === 0) {
            alert('내보낼 데이터가 없습니다.');
            return;
        }

        const escapeCsv = (value: unknown) => {
            const str = String(value ?? '');
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const header = [
            'recordId',
            'name',
            'employeeId',
            'jobField',
            'teamLeader',
            'date',
            'safetyScore',
            'safetyLevel',
            'ocrConfidence',
            'integrityScore',
            'matchMethod',
            'signatureMatchScore',
            'selfAssessedRiskLevel',
            'weakAreas',
            'correctionCount',
            'actionCount',
            'approvalCount',
            'evidenceHash'
        ];

        const rows = filteredRecords.map((record) => [
            record.id,
            record.name,
            record.employeeId || '',
            record.jobField,
            record.teamLeader || '미지정',
            record.date,
            record.safetyScore,
            getSafetyLevelFromScore(Number(record.safetyScore)),
            typeof record.ocrConfidence === 'number' ? record.ocrConfidence.toFixed(3) : '',
            typeof record.integrityScore === 'number' ? record.integrityScore : '',
            record.matchMethod || '',
            typeof record.signatureMatchScore === 'number' ? record.signatureMatchScore.toFixed(3) : '',
            record.selfAssessedRiskLevel,
            (record.weakAreas || []).join('|'),
            (record.correctionHistory || []).length,
            (record.actionHistory || []).length,
            (record.approvalHistory || []).length,
            record.evidenceHash || '',
        ]);

        const csv = [header, ...rows].map((line) => line.map(escapeCsv).join(',')).join('\n');
        const bom = '\uFEFF';
        const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `PSI_Evidence_${selectedTeam}_${dateFilterLabel}_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleVerifyEvidencePackage = async () => {
        if (!verificationManifestFile) {
            alert('manifest.json 파일을 선택해주세요.');
            return;
        }
        if (verificationJsonFiles.length === 0) {
            alert('검증할 JSON 파일을 하나 이상 선택해주세요.');
            return;
        }

        setIsVerifyingEvidence(true);
        setVerificationResult(null);
        setVerificationSummary('');

        try {
            const manifestText = await verificationManifestFile.text();
            const manifest = JSON.parse(manifestText) as EvidenceManifest;

            if (!manifest || !Array.isArray(manifest.files)) {
                throw new Error('manifest.json 형식이 올바르지 않습니다. files 배열이 필요합니다.');
            }

            const jsonContentByPath: Record<string, string> = {};
            for (const jsonFile of verificationJsonFiles) {
                const content = await jsonFile.text();
                jsonContentByPath[`json/${jsonFile.name}`] = content;
                jsonContentByPath[jsonFile.name] = content;
            }

            const result = await verifyEvidenceManifest(manifest, jsonContentByPath);
            setVerificationResult(result);
            setVerificationSummary(formatEvidenceVerificationSummary(result));
        } catch (error: unknown) {
            const message = extractMessage(error);
            alert(`증빙 검증 중 오류가 발생했습니다: ${message}`);
        } finally {
            setIsVerifyingEvidence(false);
        }
    };

    return (
        <div className="space-y-6 pb-10 h-full flex flex-col font-sans">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 no-print">
                <h2 className="text-2xl font-black text-slate-900">PSI 정밀 보고서 센터</h2>
                <div className="flex items-center space-x-3 bg-white rounded-lg p-1 shadow-sm border border-slate-200">
                    <span className="text-xs font-bold text-slate-500 pl-3 pr-1">STATUS:</span>
                    <span className="text-xs font-black px-3 uppercase text-indigo-600">
                        System Ready
                    </span>
                </div>
            </div>

            <div className="overflow-x-auto pb-2 -mb-2 shrink-0 no-print">
                <div className="flex space-x-6 border-b border-slate-200 min-w-max">
                    <button onClick={() => setActiveTab('team-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'team-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        팀별 통합 리포트
                        {activeTab === 'team-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                    <button onClick={() => setActiveTab('worker-report')} className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'worker-report' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-800'}`}>
                        전체 근로자 목록
                        {activeTab === 'worker-report' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600"></div>}
                    </button>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap gap-4 items-end no-print">
                {/* Filters */}
                {activeTab === 'team-report' && (
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">대상 공종 (팀)</label>
                        <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]">
                            {teams.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>
                )}
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">등급 필터</label>
                    <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[120px]">
                        <option value="전체">전체 등급</option>
                        <option value="초급">초급 (고위험)</option>
                        <option value="중급">중급 (주의)</option>
                        <option value="고급">고급 (우수)</option>
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">기간 필터</label>
                    <select value={datePreset} onChange={e => setDatePreset(e.target.value as DatePreset)} className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]">
                        <option value="all">전체 기간</option>
                        <option value="last30">최근 30일</option>
                        <option value="thisMonth">당월</option>
                        <option value="custom">사용자 지정</option>
                    </select>
                </div>
                {datePreset === 'custom' && (
                    <>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">시작일</label>
                            <input
                                type="date"
                                value={customStartDate}
                                onChange={e => setCustomStartDate(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-500 mb-1 block">종료일</label>
                            <input
                                type="date"
                                value={customEndDate}
                                onChange={e => setCustomEndDate(e.target.value)}
                                className="bg-slate-50 border border-slate-200 text-slate-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-bold min-w-[140px]"
                            />
                        </div>
                        {isIncompleteCustomDateRange && (
                            <div className="self-end pb-1">
                                <p className="text-xs font-bold text-amber-600">사용자 지정 기간은 시작일과 종료일을 모두 입력해야 합니다.</p>
                            </div>
                        )}
                        {isInvalidCustomDateRange && (
                            <div className="self-end pb-1">
                                <p className="text-xs font-bold text-red-600">시작일이 종료일보다 늦습니다. 기간을 다시 설정해주세요.</p>
                            </div>
                        )}
                    </>
                )}
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">일괄 출력 형태</label>
                    <select value={genMode} onChange={e => setGenMode(e.target.value as GenMode)} className="bg-indigo-50 border border-indigo-200 text-indigo-900 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2.5 font-black min-w-[200px]">
                        <option value="individual-pdf">📁 개별 PDF (ZIP 압축)</option>
                        <option value="individual-img">🖼️ 개별 이미지 (ZIP 압축)</option>
                        <option value="combined-pdf">📑 통합 PDF (단일 파일)</option>
                    </select>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-xl self-end">
                    <button 
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                        목록 보기
                    </button>
                    <button 
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${viewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        상세 미리보기
                    </button>
                </div>

                <div className="flex-1"></div>

                {/* Actions */}
                <div className="flex gap-3 items-center">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 h-[42px]">
                        <span>대상: {filteredRecords.length}명</span>
                    </div>
                    
                    {isPackagingEvidence ? (
                        <div className="flex items-center gap-2 animate-fade-in">
                            <div className="bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm min-w-[280px]">
                                <div className="text-xs font-black text-indigo-700 h-[20px] flex items-center justify-between">
                                    <span className="flex items-center">
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        증빙 패키지 생성 중
                                    </span>
                                    <span>{bulkProgressPercent}%</span>
                                </div>
                                <div className="mt-1.5 h-2 w-full rounded-full bg-indigo-100 overflow-hidden">
                                    <div
                                        className="h-full bg-indigo-600 transition-all duration-300"
                                        style={{ width: `${bulkProgressPercent}%` }}
                                    ></div>
                                </div>
                                <div className="mt-1 text-[11px] font-bold text-indigo-600">
                                    {bulkProgress.current}/{bulkProgress.total} 처리 완료
                                </div>
                            </div>
                            <button onClick={cancelGeneration} className="px-4 py-2.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-300 h-[42px]" disabled={isPackagingEvidence}>
                                중단
                            </button>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={handleExportEvidenceZip}
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError}
                                className={`px-4 py-2.5 font-black rounded-xl shadow-sm transition-all flex items-center gap-2 text-xs h-[42px] border
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 cursor-pointer'}`}
                            >
                                증빙 패키지 ZIP
                            </button>
                            <button
                                onClick={handleExportCsv}
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError}
                                className={`px-4 py-2.5 font-black rounded-xl shadow-sm transition-all flex items-center gap-2 text-xs h-[42px] border
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 cursor-pointer'}`}
                            >
                                CSV 내보내기
                            </button>
                            <button 
                                onClick={handleGenerate} 
                                disabled={filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating}
                                className={`px-6 py-2.5 text-white font-black rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm h-[42px]
                                    ${filteredRecords.length === 0 || hasCustomDateRangeError || isGenerating ? 'bg-slate-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 hover:-translate-y-0.5 cursor-pointer'}`}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg> 
                                일괄 생성 시작
                            </button>
                        </>
                    )}
                </div>
            </div>

            {reportGenerationUi.status !== 'idle' && (
                <div className="no-print flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                        <ReportGenerationProgress
                            status={reportGenerationUi.status === 'running' ? 'running' : reportGenerationUi.status === 'success' ? 'success' : 'error'}
                            progress={reportGenerationUi.progress}
                            phaseLabel={reportGenerationUi.phaseLabel}
                            actionLabel="일괄 보고서 생성"
                            errorMessage={reportGenerationUi.errorMessage}
                            onRetry={reportGenerationUi.status === 'error' ? retryReportGeneration : undefined}
                        />
                    </div>
                    {isGenerating && (
                        <button
                            onClick={cancelGeneration}
                            className="px-4 py-2.5 bg-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-300 h-[42px]"
                        >
                            중단
                        </button>
                    )}
                </div>
            )}

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 no-print space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <h3 className="text-sm font-black text-slate-800">증빙 패키지 무결성 검증</h3>
                    <button
                        onClick={handleVerifyEvidencePackage}
                        disabled={isVerifyingEvidence || !verificationManifestFile || verificationJsonFiles.length === 0}
                        className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-all ${isVerifyingEvidence || !verificationManifestFile || verificationJsonFiles.length === 0 ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 cursor-pointer'}`}
                    >
                        {isVerifyingEvidence ? '검증 실행 중...' : '증빙 검증 실행'}
                    </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Manifest 파일 (manifest.json)</label>
                        <input
                            type="file"
                            accept=".json,application/json"
                            onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setVerificationManifestFile(file);
                            }}
                            className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold hover:file:bg-slate-200"
                        />
                        <p className="text-xs text-slate-400 mt-1">선택: {verificationManifestFile?.name || '없음'}</p>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">JSON 폴더 파일들 (json/*.json)</label>
                        <input
                            type="file"
                            accept=".json,application/json"
                            multiple
                            onChange={(e) => {
                                const files = Array.from(e.target.files || []);
                                setVerificationJsonFiles(files);
                            }}
                            className="block w-full text-xs text-slate-700 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-slate-100 file:text-slate-700 file:font-bold hover:file:bg-slate-200"
                        />
                        <p className="text-xs text-slate-400 mt-1">선택: {verificationJsonFiles.length}개</p>
                    </div>
                </div>

                {verificationSummary && verificationResult && (
                    <div className={`rounded-xl border px-4 py-3 ${verificationResult.isValid ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                        <p className={`text-xs font-black mb-2 ${verificationResult.isValid ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {verificationResult.isValid ? '검증 성공' : '검증 실패'}
                        </p>
                        <pre className="text-xs whitespace-pre-wrap text-slate-700 font-semibold">{verificationSummary}</pre>

                        {!verificationResult.isValid && (
                            <div className="mt-3 space-y-3">
                                <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <p className="text-[11px] font-black text-slate-700 mb-1">패키지 요약 해시 비교</p>
                                    <p className="text-[11px] text-slate-600 break-all">기대값: {verificationResult.packageSummaryHashExpected || 'N/A'}</p>
                                    <p className="text-[11px] text-slate-600 break-all">실제값: {verificationResult.packageSummaryHashActual || 'N/A'}</p>
                                </div>

                                {verificationResult.missingJsonFiles.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">누락 JSON 파일</p>
                                        <div className="max-h-32 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일 경로</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.missingJsonFiles.slice(0, 30).map((filePath) => (
                                                        <tr key={filePath}>
                                                            <td className="py-1 pr-2 break-all">{filePath}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.missingJsonFiles.length > 30 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.missingJsonFiles.length - 30}건</p>
                                        )}
                                    </div>
                                )}

                                {verificationResult.hashMismatches.length > 0 && (
                                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                                        <p className="text-[11px] font-black text-slate-700 mb-2">JSON 해시 불일치</p>
                                        <div className="max-h-40 overflow-auto">
                                            <table className="w-full text-[11px] text-left">
                                                <thead className="text-slate-500">
                                                    <tr>
                                                        <th className="py-1 pr-2">파일</th>
                                                        <th className="py-1 pr-2">기대 해시</th>
                                                        <th className="py-1 pr-2">실제 해시</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="text-slate-700">
                                                    {verificationResult.hashMismatches.slice(0, 20).map((mismatch) => (
                                                        <tr key={mismatch.jsonFile}>
                                                            <td className="py-1 pr-2 break-all">{mismatch.jsonFile}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.expectedSha256}</td>
                                                            <td className="py-1 pr-2 break-all">{mismatch.actualSha256}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        {verificationResult.hashMismatches.length > 20 && (
                                            <p className="text-[11px] text-slate-500 mt-1">... 외 {verificationResult.hashMismatches.length - 20}건</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Hidden Rendering Area for Bulk Generation */}
            <div style={{ position: 'fixed', top: 0, left: 0, zIndex: -50, width: '210mm', minHeight: '297mm', pointerEvents: 'none', visibility: isGenerating ? 'visible' : 'hidden' }}>
                {isGenerating && generatingRecord && (
                    <ReportTemplate record={generatingRecord} history={generatingHistory} ref={bulkReportRef} />
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative">
                {filteredRecords.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                        <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                        <p className="font-bold">선택된 조건의 근로자가 없습니다.</p>
                    </div>
                ) : viewMode === 'list' ? (
                    /* VIEW MODE: LIST */
                    <>
                        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                                생성 대상 목록 ({filteredRecords.length}명)
                            </h3>
                        </div>
                        <div className="overflow-y-auto flex-1 p-0 custom-scrollbar">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-6 py-3">이름</th>
                                        <th className="px-6 py-3">직종 (Team)</th>
                                        <th className="px-6 py-3">안전점수</th>
                                        <th className="px-6 py-3">등급</th>
                                        <th className="px-6 py-3">주요 취약점</th>
                                        <th className="px-6 py-3 text-right">작업</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredRecords.map((r, idx) => (
                                        <tr key={r.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setViewMode('preview'); setPreviewIndex(idx); }}>
                                            <td className="px-6 py-3 font-bold text-slate-800">{r.name}</td>
                                            <td className="px-6 py-3 text-slate-600">{r.jobField}</td>
                                            <td className="px-6 py-3 font-black text-indigo-600">{r.safetyScore}</td>
                                            <td className="px-6 py-3">
                                                {(() => {
                                                    const safetyLevel = getSafetyLevelFromScore(Number(r.safetyScore));
                                                    return (
                                                <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                    safetyLevel === '고급' ? 'bg-green-100 text-green-700' :
                                                    safetyLevel === '중급' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                                                }`}>
                                                    {safetyLevel}
                                                </span>
                                                    );
                                                })()}
                                            </td>
                                            <td className="px-6 py-3 text-slate-500 truncate max-w-xs">{r.weakAreas.join(', ')}</td>
                                            <td className="px-6 py-3 text-right">
                                                <button onClick={(e) => { e.stopPropagation(); setViewMode('preview'); setPreviewIndex(idx); }} className="text-xs font-bold text-indigo-600 hover:underline">
                                                    미리보기
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    /* VIEW MODE: PREVIEW */
                    <div className="flex flex-col h-full bg-slate-100">
                        {/* Preview Toolbar */}
                        <div className="p-4 bg-white border-b border-slate-200 flex justify-between items-center shadow-sm z-20">
                            <div className="flex items-center gap-4">
                                <button 
                                    onClick={handlePrev} 
                                    disabled={previewIndex === 0}
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                </button>
                                <div className="text-center">
                                    <p className="text-sm font-black text-slate-800">{previewIndex + 1} / {filteredRecords.length}</p>
                                    <p className="text-xs text-slate-500 font-bold">{currentPreviewRecord?.name}</p>
                                </div>
                                <button 
                                    onClick={handleNext} 
                                    disabled={previewIndex === filteredRecords.length - 1}
                                    className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </div>
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={handleDownloadCurrent}
                                    disabled={hasCustomDateRangeError}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg transition-colors ${hasCustomDateRangeError ? 'bg-slate-300 text-slate-500 cursor-not-allowed' : 'bg-slate-800 text-white hover:bg-slate-900'}`}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    현재 보고서 내보내기
                                </button>
                            </div>
                        </div>

                        {/* Preview Content Area */}
                        <div className="flex-1 overflow-auto bg-slate-200 p-8 flex justify-center items-start custom-scrollbar">
                            {currentPreviewRecord && (
                                <div className="shadow-2xl scale-[0.6] origin-top md:scale-[0.8] xl:scale-[0.9] transition-transform duration-300 bg-white">
                                    <ReportTemplate 
                                        ref={previewRef}
                                        record={currentPreviewRecord} 
                                        history={currentPreviewHistory} 
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Reports;
