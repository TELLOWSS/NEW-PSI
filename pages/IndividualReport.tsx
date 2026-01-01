
import React, { useEffect, useRef, useState, useMemo } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../types';
import { IndividualRadarChart } from '../components/charts/IndividualRadarChart';
import { generateReportUrl } from '../utils/qrUtils';

interface IndividualReportProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onBack: () => void;
    onUpdateRecord?: (record: WorkerRecord) => void;
}

// 텍스트 하이라이트 컴포넌트
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const regex = /(".*?"|'.*?'|위험|추락|낙하|붕괴|협착|감전|화재|폭발|미착용|미준수|미흡|불량|사고|재해|경고|주의|금지|무시|심각|사망|즉시|필수|강력|생명|직결|우수|양호|철저|확실|완벽|준수|모범|칭찬|개선|권고)/g;
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, i) => {
                const isMatch = regex.test(part);
                if (isMatch) {
                    const isNegative = /위험|추락|낙하|붕괴|협착|감전|화재|폭발|미착용|미준수|미흡|불량|사고|재해|경고|주의|금지|무시|심각|사망/.test(part);
                    const styleClass = isNegative 
                        ? "font-black underline decoration-rose-500 decoration-2 underline-offset-2 text-rose-800" 
                        : "font-black underline decoration-indigo-500 decoration-2 underline-offset-2 text-indigo-800";
                    return <span key={i} className={styleClass}>{part}</span>;
                }
                return <span key={i}>{part}</span>;
            })}
        </span>
    );
};

// --- 안전 픽토그램 데이터베이스 및 컴포넌트 ---
interface SafetySignData {
    id: string;
    type: 'warning' | 'mandatory';
    keywords: string[];
    icon: React.ReactNode;
    labels: {
        ko: string;
        cn: string;
        vn: string;
        th: string;
        uz: string;
        kh: string; // Cambodia
        id: string; // Indonesia
        mn: string; // Mongolia
        en: string;
    };
}

const SAFETY_SIGNS: SafetySignData[] = [
    {
        id: 'fall',
        type: 'warning',
        keywords: ['추락', '고소', '높은', '떨어', '비계', '지붕', '개구부'],
        icon: (
            <g>
                <path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/>
                <path d="M50 35 L50 60" stroke="black" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="50" cy="70" r="3" fill="black"/>
                {/* 추락 사람 형상 */}
                <path d="M40 45 L30 55 L35 65 M45 45 L55 50 L60 40" stroke="black" strokeWidth="2" fill="none"/>
                <circle cx="48" cy="40" r="3" fill="black"/>
            </g>
        ),
        labels: {
            ko: '추락 주의',
            cn: '当心坠落 (추락주의)',
            vn: 'Chú ý rơi ngã (추락주의)',
            th: 'ระวังตก (추락주의)',
            uz: 'Yiqilish xavfi (추락주의)',
            kh: 'គ្រោះថ្នាក់នៃការធ្លាក់ (추락주의)',
            id: 'Bahaya Jatuh (추락주의)',
            mn: 'Унах аюултай (추락주의)',
            en: 'Danger: Falling'
        }
    },
    {
        id: 'electric',
        type: 'warning',
        keywords: ['전기', '감전', '누전', '케이블', '전선', '접지'],
        icon: (
            <g>
                <path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/>
                <path d="M50 30 L40 50 L55 50 L45 75" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </g>
        ),
        labels: {
            ko: '감전 주의',
            cn: '当心触电 (감전주의)',
            vn: 'Cẩn thận điện giật',
            th: 'ระวังไฟฟ้าดูด',
            uz: 'Elektr toki xavfi',
            kh: 'គ្រោះថ្នាក់ឆក់ខ្សែភ្លើង (감전주의)',
            id: 'Awas Listrik (감전주의)',
            mn: 'Цахилгаанд цохиулах (감전주의)',
            en: 'Danger: Electric Shock'
        }
    },
    {
        id: 'safety_belt',
        type: 'mandatory',
        keywords: ['안전대', '벨트', '고리', '체결', '생명줄'],
        icon: (
            <g>
                <circle cx="50" cy="50" r="40" fill="#2563EB" />
                <circle cx="50" cy="50" r="36" fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 2"/>
                {/* 안전대 형상 */}
                <path d="M30 50 Q50 80 70 50" stroke="white" strokeWidth="4" fill="none"/>
                <rect x="45" y="45" width="10" height="10" fill="white"/>
                <path d="M30 50 L30 30 M70 50 L70 30" stroke="white" strokeWidth="4"/>
            </g>
        ),
        labels: {
            ko: '안전대 착용 철저',
            cn: '必须系安全带 (안전대착용)',
            vn: 'Đeo dây an toàn',
            th: 'สวมเข็มขัดนิรภัย',
            uz: 'Xavfsizlik kamarini taqing',
            kh: 'ពាក់ខ្សែក្រវ៉ាត់ (안전대착용)',
            id: 'Pakai Sabuk Pengaman (안전대착용)',
            mn: 'Бүсээ зүүгээрэй (안전대착용)',
            en: 'Wear Safety Belt'
        }
    },
    {
        id: 'helmet',
        type: 'mandatory',
        keywords: ['안전모', '머리', '낙하', '보호구', '턱끈'],
        icon: (
            <g>
                <circle cx="50" cy="50" r="40" fill="#2563EB" />
                <path d="M30 55 C30 40 40 35 50 35 C60 35 70 40 70 55 Z" fill="white"/>
                <rect x="25" y="55" width="50" height="5" fill="white" rx="2"/>
            </g>
        ),
        labels: {
            ko: '안전모 착용',
            cn: '必须戴安全帽 (안전모착용)',
            vn: 'Đội mũ bảo hiểm',
            th: 'สวมหมวกนิรภัย',
            uz: 'Bosh kiyimini kiying',
            kh: 'ពាក់មួកសុវត្ថិភាព (안전모착용)',
            id: 'Pakai Helm (안전모착용)',
            mn: 'Малгай өмс (안전모착용)',
            en: 'Wear Hard Hat'
        }
    },
    {
        id: 'fire',
        type: 'warning',
        keywords: ['화재', '불', '용접', '인화', '폭발'],
        icon: (
            <g>
                <path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/>
                <path d="M50 70 Q40 70 40 60 Q40 50 50 40 Q60 50 60 60 Q60 70 50 70" fill="red"/>
            </g>
        ),
        labels: {
            ko: '화재 주의',
            cn: '当心火灾 (화재주의)',
            vn: 'Cẩn thận hỏa hoạn',
            th: 'ระวังไฟไหม้',
            uz: "Yong'in xavfi",
            kh: 'គ្រោះថ្នាក់អគ្គីភ័យ (화재주의)',
            id: 'Awas Api (화재주의)',
            mn: 'Галын аюул (화재주의)',
            en: 'Danger: Fire'
        }
    },
    {
        id: 'default_safety',
        type: 'mandatory',
        keywords: ['default'], // 기본값
        icon: (
            <g>
                 <circle cx="50" cy="50" r="40" fill="#10B981" />
                 <path d="M35 50 L45 60 L65 40" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </g>
        ),
        labels: {
            ko: '안전 수칙 준수',
            cn: '遵守安全规定 (안전수칙준수)',
            vn: 'Tuân thủ quy tắc an toàn',
            th: 'ปฏิบัติตามกฎความปลอดภัย',
            uz: 'Xavfsizlik qoidalariga rioya',
            kh: 'គោរពច្បាប់សុវត្ថិភាព (안전수칙)',
            id: 'Patuhi Aturan (안전수칙)',
            mn: 'Дүрэм мөрдөх (안전수칙)',
            en: 'Safety First'
        }
    }
];

const getRelevantSigns = (weakAreas: string[], jobField: string): SafetySignData[] => {
    // [FIX] Handle potential undefined values
    const safeWeak = Array.isArray(weakAreas) ? weakAreas.join(' ') : '';
    const safeJob = jobField || '';
    const text = (safeWeak + ' ' + safeJob).toLowerCase();
    
    const relevant: SafetySignData[] = [];

    // 키워드 매칭
    SAFETY_SIGNS.forEach(sign => {
        if (sign.id === 'default_safety') return;
        if (sign.keywords.some(k => text.includes(k))) {
            relevant.push(sign);
        }
    });

    // 중복 제거 및 최대 2개 선정 (없으면 기본값)
    const unique = Array.from(new Set(relevant));
    if (unique.length === 0) return [SAFETY_SIGNS.find(s => s.id === 'default_safety')!, SAFETY_SIGNS.find(s => s.id === 'helmet')!];
    if (unique.length === 1) return [unique[0], SAFETY_SIGNS.find(s => s.id === 'default_safety')!];
    return unique.slice(0, 2);
};

const getSignLabel = (sign: SafetySignData, nationality: string) => {
    const n = (nationality || '').trim();
    if (n.includes('중국')) return sign.labels.cn;
    if (n.includes('베트남')) return sign.labels.vn;
    if (n.includes('태국')) return sign.labels.th;
    if (n.includes('우즈벡')) return sign.labels.uz;
    if (n.includes('캄보디아')) return sign.labels.kh;
    if (n.includes('인도네시아')) return sign.labels.id;
    if (n.includes('몽골')) return sign.labels.mn;
    if (n.includes('한국')) return sign.labels.en; // 한국인은 영어 병기 or 그냥 한국어만
    return sign.labels.en;
};


const LABELS: Record<string, Record<string, string>> = {
    '베트남': { strengths: 'Điểm mạnh (강점)', weaknesses: 'Điểm yếu & Cải thiện (취약점)', trends: 'Xu hướng an toàn (안전 추이)', verdict: 'Đánh giá an toàn tổng hợp (종합진단)', pictogram: 'Biển báo an toàn thiết yếu (필수 안전 표지)', original: 'Bản gốc viết tay', cert: 'Chứng nhận năng lực an toàn' },
    '중국': { strengths: '优势 (강점)', weaknesses: '弱点与改进 (취약점)', trends: '安全趋势 (안전 추이)', verdict: '综合安全诊断 (종합진단)', pictogram: '基本安全标志 (필수 안전 표지)', original: '手写原件', cert: '安全能力认证' },
    '태국': { strengths: 'จุดแข็ง (강점)', weaknesses: 'จุดอ่อน (취약점)', trends: 'แนวโน้ม (안전 추이)', verdict: 'การวินิจฉัย (종합진단)', pictogram: 'ป้ายความปลอดภัยที่จำเป็น (필수 안전 표지)', original: 'ต้นฉบับ', cert: 'ใบรับรองความปลอดภัย' },
    '우즈베키스탄': { strengths: 'Kuchli tomonlari (강점)', weaknesses: 'Zaif tomonlari (취약점)', trends: 'Xavfsizlik (안전 추이)', verdict: 'Keng qamrovli diagnostika (종합진단)', pictogram: 'Muhim xavfsizlik belgilari (필수 안전 표지)', original: 'Asl nusxa', cert: 'Xavfsizlik Sertifikati' },
    '캄보디아': { strengths: 'ចំណុចខ្លាំង (강점)', weaknesses: 'ចំណុចខ្សោយ (취약점)', trends: 'និន្នាការ (안전 추이)', verdict: 'ការវិនិច្ឆ័យ (종합진단)', pictogram: 'ស្លាកសញ្ញា (필수 안전 표지)', original: 'ឯកសារដើម', cert: 'វិញ្ញាបនបត្រសុវត្ថិភាព' },
    '인도네시아': { strengths: 'Kekuatan (강점)', weaknesses: 'Kelemahan (취약점)', trends: 'Tren (안전 추이)', verdict: 'Diagnosis (종합진단)', pictogram: 'Rambu Wajib (필수 안전 표지)', original: 'Asli', cert: 'Sertifikat Keselamatan' },
    '몽골': { strengths: 'Давуу тал (강점)', weaknesses: 'Сул тал (취약점)', trends: 'Хандлага (안전 추이)', verdict: 'Дүгнэлт (종합진단)', pictogram: 'Анхааруулах тэмдэг (필수 안전 표지)', original: 'Эх хувь', cert: 'Аюулгүй байдлын гэрчилгээ' },
    '한국': { strengths: '역량 강점 (Strengths)', weaknesses: '개선 권고 (Focus Areas)', trends: '성과 추이 (Trends)', verdict: '종합 안전 진단 (Comprehensive Diagnosis)', pictogram: '직무 맞춤형 필수 안전 표지 (Safety Signs)', original: '수기 기록 원본 (Original Record)', cert: '안전 역량 인증 및 분석서' },
    'default': { strengths: 'Strengths', weaknesses: 'Focus Areas', trends: 'Trends', verdict: 'Comprehensive Diagnosis', pictogram: 'Essential Safety Signs', original: 'Original Record', cert: 'Certificate of Safety Competence' }
};

const getLabels = (nationality: string) => {
    const nation = (nationality || '').trim();
    if (LABELS[nation]) return LABELS[nation];
    if (nation.includes('베트남')) return LABELS['베트남'];
    if (nation.includes('중국')) return LABELS['중국'];
    if (nation.includes('태국')) return LABELS['태국'];
    if (nation.includes('우즈벡')) return LABELS['우즈베키스탄'];
    if (nation.includes('캄보디아')) return LABELS['캄보디아'];
    if (nation.includes('인도네시아')) return LABELS['인도네시아'];
    if (nation.includes('몽골')) return LABELS['몽골'];
    if (nation.includes('한국')) return LABELS['한국'];
    return LABELS['default'];
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}`;
};

const IndividualReport: React.FC<IndividualReportProps> = ({ record, history = [], onBack, onUpdateRecord }) => {
    const trendChartRef = useRef<HTMLCanvasElement>(null);
    const trendChartInstance = useRef<Chart | null>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [isGeneratingImage, setIsGeneratingImage] = useState(false);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const labels = useMemo(() => getLabels(record.nationality), [record.nationality]);
    const isKorean = record.nationality === '한국';
    
    // [분석] 취약점 기반 픽토그램 선정
    const safetySigns = useMemo(() => getRelevantSigns(record.weakAreas, record.jobField), [record.weakAreas, record.jobField]);

    // 성과 추이 차트 (Line Chart)
    useEffect(() => {
        if (!trendChartRef.current) return;
        if (trendChartInstance.current) trendChartInstance.current.destroy();
        const ctx = trendChartRef.current.getContext('2d');
        if (!ctx) return;

        const ChartLib = (window as any).Chart;
        if (!ChartLib) return;

        const sortedHistory = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-6);
        const displayData = sortedHistory.length > 0 ? sortedHistory : [record];
        
        try {
            trendChartInstance.current = new ChartLib(ctx, {
                type: 'line',
                data: { 
                    labels: displayData.map(h => h.date.substring(5)), 
                    datasets: [{ 
                        label: 'Safety Score',
                        data: displayData.map(h => h.safetyScore), 
                        borderColor: '#64748b', 
                        backgroundColor: 'rgba(100, 116, 139, 0.1)',
                        borderWidth: 2,
                        tension: 0.3, 
                        fill: true,
                        pointRadius: 4, // 포인트 크기 증가
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#64748b'
                    }] 
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false, // PDF용 애니메이션 끔
                    devicePixelRatio: window.devicePixelRatio || 2, // HiDPI
                    layout: {
                        // [FIX] 차트 잘림 방지를 위한 패딩 추가
                        padding: { top: 10, right: 10, bottom: 5, left: 5 }
                    },
                    plugins: { legend: { display: false } }, 
                    scales: { 
                        y: { 
                            min: 0, 
                            max: 100, // 최대값을 100으로 고정하되, padding으로 공간 확보
                            grid: { borderDash: [4, 4] },
                            ticks: { 
                                stepSize: 20,
                                font: { size: 9, family: "'Pretendard', sans-serif" } 
                            }
                        }, 
                        x: { 
                            grid: { display: false },
                            ticks: { 
                                font: { size: 9, family: "'Pretendard', sans-serif" } 
                            }
                        } 
                    } 
                } 
            });
        } catch(e) {
            console.error("Trend chart error:", e);
        }

        // [FIX] Uncaught Error 방지를 위한 Cleanup 함수 추가
        return () => {
            if (trendChartInstance.current) {
                trendChartInstance.current.destroy();
                trendChartInstance.current = null;
            }
        };
    }, [history, record]);

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
            // Profile Image 저장 (개인 리포트에서는 증명사진 개념으로 사용)
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
                alert(`📋 링크가 복사되었습니다.\n카카오톡이나 문자에 붙여넣기 하세요.\n\n${url}`);
            }
        } catch (err) {
            // 사용자가 취소하거나 오류 발생 시
            console.error('Share failed:', err);
        }
    };

    const handleDownloadPDF = async () => {
        if (!reportRef.current) return;
        
        const html2canvas = (window as any).html2canvas;
        const jspdf = (window as any).jspdf;
        if (!html2canvas || !jspdf) return alert('PDF 라이브러리가 로드되지 않았습니다.');

        setIsGeneratingPdf(true);
        try {
            // [FIX] scale을 4로 상향하여 고화질 캡처
            const canvas = await html2canvas(reportRef.current, { 
                scale: 4, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                logging: false
            });
            const imgData = canvas.toDataURL('image/png', 1.0); // Quality 1.0
            const jsPDF = jspdf.jsPDF ? jspdf.jsPDF : jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);
            pdf.save(`PSI_Report_${record.name}.pdf`);
        } catch (e) { 
            console.error(e);
            alert('PDF 생성 실패'); 
        } finally { 
            setIsGeneratingPdf(false); 
        }
    };

    const handleDownloadImage = async () => {
        if (!reportRef.current) return;
        const html2canvas = (window as any).html2canvas;
        if (!html2canvas) return alert('이미지 라이브러리가 로드되지 않았습니다.');

        setIsGeneratingImage(true);
        try {
            // scale 4 for high quality readability on mobile zoom
            const canvas = await html2canvas(reportRef.current, { 
                scale: 4, 
                useCORS: true, 
                backgroundColor: '#ffffff',
                logging: false
            });
            
            const link = document.createElement('a');
            link.download = `PSI_Report_${record.name}.png`;
            link.href = canvas.toDataURL('image/png', 1.0);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) { 
            console.error(e);
            alert('이미지 저장 실패'); 
        } finally { 
            setIsGeneratingImage(false); 
        }
    };

    const getProfileImage = () => {
        if (record.profileImage && record.profileImage.length > 50) {
            return record.profileImage.startsWith('data:') ? record.profileImage : `data:image/jpeg;base64,${record.profileImage}`;
        }
        return null;
    };
    
    const getOriginalImage = () => (record.originalImage && record.originalImage.length > 50) ? (record.originalImage.startsWith('data:') ? record.originalImage : `data:image/jpeg;base64,${record.originalImage}`) : null;

    return (
        <div className="bg-slate-100 min-h-screen p-6 flex flex-col items-center gap-6 pb-20 no-print font-sans">
            <div className="bg-white px-6 py-3 rounded-full shadow-lg flex justify-between items-center w-full max-w-[210mm] border border-slate-200 sticky top-4 z-50">
                <button onClick={onBack} className="text-sm font-bold flex items-center gap-2 text-slate-500 hover:text-slate-900">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M10 19l-7-7 7-7m-7 7h18" strokeWidth={2}/></svg> 대시보드
                </button>
                <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span><p className="text-xs font-bold text-slate-800">PSI A4 Professional Report (High-Res)</p></div>
                <div className="flex gap-2">
                    <button onClick={handleShare} className="bg-yellow-400 text-slate-900 px-5 py-2 rounded-full text-xs font-black hover:bg-yellow-500 flex items-center gap-2 shadow-sm">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 6.63 5.4 12 12 12 6.63 0 12-5.37 12-12 0-5.52-4.48-10-10-10zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" /></svg>
                        리포트 전송
                    </button>
                    <button onClick={handleDownloadImage} disabled={isGeneratingImage} className="bg-emerald-600 px-5 py-2 rounded-full text-xs font-bold text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1 transition-all">
                        {isGeneratingImage ? '변환 중...' : (
                            <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                이미지 저장
                            </>
                        )}
                    </button>
                    <button onClick={handleDownloadPDF} disabled={isGeneratingPdf} className="bg-slate-900 px-5 py-2 rounded-full text-xs font-bold text-white hover:bg-black transition-all">
                        {isGeneratingPdf ? '생성 중...' : 'PDF 발급'}
                    </button>
                </div>
            </div>

            {/* A4 REPORT CONTAINER */}
            <div ref={reportRef} className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0">
                
                {/* [워터마크] 권위와 신뢰성을 위한 배경 패턴 워터마크 추가 */}
                <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
                    <div className="w-[150%] h-[150%] -rotate-12 flex flex-wrap content-center justify-center gap-24 select-none">
                         {Array.from({ length: 20 }).map((_, i) => (
                             <div key={i} className="text-4xl font-black text-slate-900 whitespace-nowrap">PSI OFFICIAL SAFETY RECORD</div>
                         ))}
                    </div>
                </div>

                <div className="absolute inset-0 m-4 border-[2px] border-slate-800 z-10 pointer-events-none"></div>
                <div className="relative z-10 px-[14mm] py-[12mm] flex flex-col h-full">
                    
                    {/* Header Section */}
                    <div className="text-center mb-5 shrink-0">
                         <h1 className="text-xl font-serif font-black text-slate-900 uppercase">Certificate of Safety Competence</h1>
                         <p className="text-xs font-bold text-slate-600 font-sans tracking-widest">{labels.cert}</p>
                    </div>

                    {/* Profile & Main Stats Section */}
                    <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-200 shrink-0">
                        <div className="flex gap-5">
                             {/* Photo Area (Click to take photo) */}
                             <div className="w-24 h-32 bg-white border border-slate-200 p-1 shadow-sm shrink-0 cursor-pointer group relative overflow-hidden flex items-center justify-center" onClick={startCamera}>
                                {getProfileImage() ? (
                                    <img src={getProfileImage()!} className="w-full h-full object-cover" alt="Profile" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 text-xs text-center p-1">
                                        <span className="text-xl mb-1">📷</span>
                                        <span>Click</span>
                                    </div>
                                )}
                             </div>
                             {/* Info */}
                             <div className="flex flex-col justify-center">
                                 <h2 className="text-3xl font-serif font-bold text-slate-900 leading-none mb-2">{record.name}</h2>
                                 <div className="space-y-1">
                                     <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded mr-2">{record.nationality}</span>
                                     <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{record.jobField}</span>
                                 </div>
                                 <p className="text-[10px] text-slate-400 mt-2 font-medium">Date: {formatDate(record.date)}</p>
                             </div>
                        </div>
                        
                        {/* Right: Infographic Panel (개선된 인포그래픽 영역) */}
                        <div className="flex items-center gap-2">
                             {/* Score Badge */}
                            <div className="flex flex-col items-center">
                                <div className="relative w-20 h-20 flex items-center justify-center bg-indigo-50 rounded-full border-4 border-indigo-100 shadow-sm">
                                    <span className="text-3xl font-black text-indigo-700 tracking-tighter">{record.safetyScore}</span>
                                </div>
                                <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Total Score</span>
                            </div>
                            {/* Infographic Radar Chart (크기 확장) */}
                            <div className="w-44 h-44 relative -my-4">
                                <IndividualRadarChart record={record} />
                            </div>
                        </div>
                    </div>

                    {/* Content Columns */}
                    <div className="flex-1 min-h-0 flex gap-6">
                        {/* LEFT COLUMN */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 shadow-sm">
                                <h3 className="font-bold text-xs mb-3 text-slate-700 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    {labels.strengths}
                                </h3>
                                <ul className="space-y-3">
                                    {record.strengths.slice(0, 3).map((s, i) => (
                                        <li key={i}>
                                            <div className="text-[11px] leading-tight text-slate-800">✓ <HighlightedText text={s} /></div>
                                            {!isKorean && record.strengths_native && record.strengths_native[i] && (
                                                <div className="text-[10px] text-slate-500 mt-0.5 ml-3 font-medium tracking-tight leading-none">
                                                    {record.strengths_native[i]}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            
                            {/* Trend Chart Area */}
                            <div className="h-32 border border-slate-200 rounded-lg p-3 bg-white shadow-sm flex flex-col">
                                <h4 className="text-[9px] font-bold text-slate-400 uppercase mb-2">{labels.trends} (6 Month)</h4>
                                <div className="flex-1 w-full relative min-h-0">
                                    <canvas ref={trendChartRef}></canvas>
                                </div>
                            </div>
                            
                            <div className="flex-1 border border-slate-200 rounded-lg bg-slate-50 p-2 relative overflow-hidden flex items-center justify-center">
                                {getOriginalImage() ? (
                                    <img src={getOriginalImage()!} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                ) : (
                                    <div className="text-[10px] text-slate-300">No Image</div>
                                )}
                            </div>
                        </div>
                        
                        {/* RIGHT COLUMN */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div className="bg-rose-50 p-4 rounded-lg border border-rose-100 shadow-sm">
                                <h3 className="font-bold text-xs mb-3 text-rose-800 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                                    {labels.weaknesses}
                                </h3>
                                <ul className="space-y-3">
                                    {record.weakAreas.slice(0, 3).map((w, i) => (
                                        <li key={i}>
                                            <div className="text-[11px] leading-tight text-rose-900">⚠ <HighlightedText text={w} /></div>
                                            {!isKorean && record.weakAreas_native && record.weakAreas_native[i] && (
                                                <div className="text-[10px] text-rose-700/70 mt-0.5 ml-4 font-medium tracking-tight leading-none">
                                                    {record.weakAreas_native[i]}
                                                </div>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            
                            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                                <h3 className="font-bold text-xs mb-3 text-slate-700 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-slate-800"></span>
                                    {labels.verdict}
                                </h3>
                                <div className="space-y-4">
                                    <p className="text-[11px] leading-relaxed text-slate-800 text-justify">
                                        <HighlightedText text={record.aiInsights} />
                                    </p>
                                    {!isKorean && record.aiInsights_native && (
                                        <>
                                            <div className="w-full h-px bg-slate-100"></div>
                                            <p className="text-[10px] leading-relaxed text-slate-500 text-justify font-medium">
                                                {record.aiInsights_native}
                                            </p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* [개선] 안전 픽토그램 (Safety Pictograms) 섹션 */}
                            <div className="flex-1 bg-white border-2 border-slate-100 rounded-lg p-3 shadow-sm flex flex-col">
                                <h3 className="font-bold text-xs mb-2 text-slate-800 flex items-center gap-2 uppercase tracking-wide">
                                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                    {labels.pictogram}
                                </h3>
                                <div className="flex-1 grid grid-cols-2 gap-3">
                                    {safetySigns.map((sign, i) => (
                                        <div key={i} className="border border-slate-200 rounded bg-slate-50 flex flex-col items-center justify-center p-2 text-center relative overflow-hidden">
                                            <div className="w-16 h-16 mb-2">
                                                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-sm">
                                                    {sign.icon}
                                                </svg>
                                            </div>
                                            <div className="w-full">
                                                <p className="text-[10px] font-black text-slate-900 leading-tight">{sign.labels.ko}</p>
                                                {!isKorean && (
                                                    <p className="text-[9px] font-bold text-slate-500 mt-0.5 leading-none">
                                                        {getSignLabel(sign, record.nationality)}
                                                    </p>
                                                )}
                                            </div>
                                            {/* 장식용 코너 라벨 */}
                                            <div className={`absolute top-0 right-0 w-3 h-3 ${sign.type === 'warning' ? 'bg-yellow-400' : 'bg-blue-600'} rounded-bl-lg`}></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t-2 border-slate-900 shrink-0 flex justify-between items-end">
                        <div className="text-[9px] font-bold text-slate-400">PSI Safety Intelligence System v1.4.0</div>
                        <div className="flex gap-8 text-center"><div className="text-[10px] font-bold">Safety Manager 박 성 훈</div><div className="text-[10px] font-bold">Site Manager 정 용 현</div></div>
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
        </div>
    );
};
export default IndividualReport;
