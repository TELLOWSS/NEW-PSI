
import React, { useEffect, useRef, useMemo } from 'react';
import type { Chart } from 'chart.js/auto';
import type { WorkerRecord } from '../types';
import { IndividualRadarChart } from './charts/IndividualRadarChart';
import { getWindowProp } from '../utils/windowUtils';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';

interface ReportTemplateProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onPhotoClick?: () => void;
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

// --- 안전 픽토그램 데이터베이스 ---
interface SafetySignData {
    id: string;
    type: 'warning' | 'mandatory';
    keywords: string[];
    icon: React.ReactNode;
    labels: { [key: string]: string };
}

const SAFETY_SIGNS: SafetySignData[] = [
    {
        id: 'fall', type: 'warning', keywords: ['추락', '고소', '높은', '떨어', '비계', '지붕', '개구부'],
        icon: (
            <g><path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/><path d="M50 35 L50 60" stroke="black" strokeWidth="4" strokeLinecap="round"/><circle cx="50" cy="70" r="3" fill="black"/><path d="M40 45 L30 55 L35 65 M45 45 L55 50 L60 40" stroke="black" strokeWidth="2" fill="none"/><circle cx="48" cy="40" r="3" fill="black"/></g>
        ),
        labels: { ko: '추락 주의', cn: '当心坠落', vn: 'Chú ý rơi ngã', th: 'ระวังตก', uz: 'Yiqilish xavfi', kh: 'គ្រោះថ្នាក់នៃការធ្លាក់', id: 'Bahaya Jatuh', mn: 'Унах аюултай', en: 'Danger: Falling' }
    },
    {
        id: 'electric', type: 'warning', keywords: ['전기', '감전', '누전', '케이블', '전선', '접지'],
        icon: (
            <g><path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/><path d="M50 30 L40 50 L55 50 L45 75" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>
        ),
        labels: { ko: '감전 주의', cn: '当心触电', vn: 'Cẩn thận điện giật', th: 'ระวังไฟฟ้าดูด', uz: 'Elektr toki xavfi', kh: 'គ្រោះថ្នាក់ឆក់ខ្សែភ្លើង', id: 'Awas Listrik', mn: 'Цахилгаанд цохиулах', en: 'Danger: Electric Shock' }
    },
    {
        id: 'safety_belt', type: 'mandatory', keywords: ['안전대', '벨트', '고리', '체결', '생명줄'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#2563EB" /><circle cx="50" cy="50" r="36" fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 2"/><path d="M30 50 Q50 80 70 50" stroke="white" strokeWidth="4" fill="none"/><rect x="45" y="45" width="10" height="10" fill="white"/><path d="M30 50 L30 30 M70 50 L70 30" stroke="white" strokeWidth="4"/></g>
        ),
        labels: { ko: '안전대 착용 철저', cn: '必须系安全带', vn: 'Đeo dây an toàn', th: 'สวมเข็มขัดนิรภัย', uz: 'Xavfsizlik kamarini taqing', kh: 'ពាក់ខ្សែក្រវ៉ាត់', id: 'Pakai Sabuk Pengaman', mn: 'Бүсээ зүүгээрэй', en: 'Wear Safety Belt' }
    },
    {
        id: 'helmet', type: 'mandatory', keywords: ['안전모', '머리', '낙하', '보호구', '턱끈'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#2563EB" /><path d="M30 55 C30 40 40 35 50 35 C60 35 70 40 70 55 Z" fill="white"/><rect x="25" y="55" width="50" height="5" fill="white" rx="2"/></g>
        ),
        labels: { ko: '안전모 착용', cn: '必须戴安全帽', vn: 'Đội mũ bảo hiểm', th: 'สวมหมวกนิรภัย', uz: 'Bosh kiyimini kiying', kh: 'ពាក់មួកសុវត្ថិភាព', id: 'Pakai Helm', mn: 'Малгай өмс', en: 'Wear Hard Hat' }
    },
    {
        id: 'fire', type: 'warning', keywords: ['화재', '불', '용접', '인화', '폭발'],
        icon: (
            <g><path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/><path d="M50 70 Q40 70 40 60 Q40 50 50 40 Q60 50 60 60 Q60 70 50 70" fill="red"/></g>
        ),
        labels: { ko: '화재 주의', cn: '当心火灾', vn: 'Cẩn thận hỏa hoạn', th: 'ระวังไฟไหม้', uz: "Yong'in xavfi", kh: 'គ្រោះថ្នាក់អគ្គីភ័យ', id: 'Awas Api', mn: 'Галын аюул', en: 'Danger: Fire' }
    },
    {
        id: 'default_safety', type: 'mandatory', keywords: ['default'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#10B981" /><path d="M35 50 L45 60 L65 40" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>
        ),
        labels: { ko: '안전 수칙 준수', cn: '遵守安全规定', vn: 'Tuân thủ quy tắc an toàn', th: 'ปฏิบัติตามกฎความปลอดภัย', uz: 'Xavfsizlik qoidalariga rioya', kh: 'គោរពច្បាប់សុវត្ថិភាព', id: 'Patuhi Aturan', mn: 'Дүрэм мөрдөх', en: 'Safety First' }
    }
];

const getRelevantSigns = (weakAreas: string[], jobField: string): SafetySignData[] => {
    const safeWeak = Array.isArray(weakAreas) ? weakAreas.join(' ') : '';
    const safeJob = jobField || '';
    const text = (safeWeak + ' ' + safeJob).toLowerCase();
    const relevant: SafetySignData[] = [];
    SAFETY_SIGNS.forEach(sign => {
        if (sign.id === 'default_safety') return;
        if (sign.keywords.some(k => text.includes(k))) relevant.push(sign);
    });
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
    '대한민국': { strengths: '역량 강점 (Strengths)', weaknesses: '개선 권고 (Focus Areas)', trends: '성과 추이 (Trends)', verdict: '종합 안전 진단 (Comprehensive Diagnosis)', pictogram: '직무 맞춤형 필수 안전 표지 (Safety Signs)', original: '수기 기록 원본 (Original Record)', cert: '안전 역량 인증 및 분석서' },
    'default': { strengths: 'Strengths', weaknesses: 'Focus Areas', trends: 'Trends', verdict: 'Comprehensive Diagnosis', pictogram: 'Essential Safety Signs', original: 'Original Record', cert: 'Certificate of Safety Competence' }
};

const getLabels = (nationality: string) => {
    const nation = (nationality || '').trim();
    // LANGUAGE_POLICY 준수: 정확한 국적명으로 직접 조회
    if (LABELS[nation]) return LABELS[nation];
    // 부분 매칭으로 기관명/오기/애칭 대응 (Backward compatibility)
    if (nation.includes('베트남')) return LABELS['베트남'];
    if (nation.includes('중국')) return LABELS['중국'];
    if (nation.includes('태국')) return LABELS['태국'];
    if (nation.includes('우즈벡')) return LABELS['우즈베키스탄'];
    if (nation.includes('캄보디아')) return LABELS['캄보디아'];
    if (nation.includes('인도네시아')) return LABELS['인도네시아'];
    if (nation.includes('몽골')) return LABELS['몽골'];
    // 한국인 처리: 대한민국, 한국, Korea 등 모두 지원 (최종적으로 '대한민국'으로 정규화)
    if (nation.includes('한국') || nation.includes('korea') || nation === '대한민국') return LABELS['대한민국'];
    return LABELS['default'];
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}`;
};

export const ReportTemplate = React.forwardRef<HTMLDivElement, ReportTemplateProps>(({ record, history = [], onPhotoClick }, ref) => {
    const trendChartRef = useRef<HTMLCanvasElement>(null);
    const trendChartInstance = useRef<Chart | null>(null);

    const labels = useMemo(() => getLabels(record.nationality), [record.nationality]);
    const isKorean = record.nationality === '대한민국' || record.nationality === '한국' || (record.nationality || '').toLowerCase().includes('korea');
    const timelineLocale = isKorean ? 'ko-KR' : 'en-US';
    const timelineDateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    const safetySigns = useMemo(() => getRelevantSigns(record.weakAreas, record.jobField), [record.weakAreas, record.jobField]);
    const reassessmentTitle = isKorean ? '재평가 타임라인' : 'Reassessment Timeline';
    const reassessmentFallback = isKorean ? '2차 재가공' : 'Secondary reassessment';
    const reassessmentTag = isKorean ? '[재평가]' : '[reassessment]';
    const reassessmentTrail = useMemo(
        () => (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-2).reverse(),
        [record.auditTrail]
    );

    // Trend Chart Rendering
    useEffect(() => {
        if (!trendChartRef.current) return;
        if (trendChartInstance.current) trendChartInstance.current.destroy();
        const ctx = trendChartRef.current.getContext('2d');
        if (!ctx) return;

        const ChartLib = getWindowProp<any>('Chart');
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
                        pointRadius: 4, 
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#64748b'
                    }] 
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    animation: false,
                    devicePixelRatio: getWindowProp<number>('devicePixelRatio') || 2,
                    layout: { padding: { top: 10, right: 10, bottom: 5, left: 5 } },
                    plugins: { legend: { display: false } }, 
                    scales: { 
                        y: { 
                            min: 0, 
                            max: 100, 
                            grid: { borderDash: [4, 4] },
                            ticks: { stepSize: 20, font: { size: 9, family: "'Pretendard', sans-serif" } }
                        }, 
                        x: { 
                            grid: { display: false },
                            ticks: { font: { size: 9, family: "'Pretendard', sans-serif" } } 
                        } 
                    } 
                } 
            });
        } catch(e) { console.error(e); }

        return () => { if (trendChartInstance.current) trendChartInstance.current.destroy(); };
    }, [history, record]);

    const getProfileImage = () => {
        if (record.profileImage && record.profileImage.length > 50) {
            return record.profileImage.startsWith('data:') ? record.profileImage : `data:image/jpeg;base64,${record.profileImage}`;
        }
        return null;
    };
    
    const getOriginalImage = () => (record.originalImage && record.originalImage.length > 50) ? (record.originalImage.startsWith('data:') ? record.originalImage : `data:image/jpeg;base64,${record.originalImage}`) : null;

    return (
        <div ref={ref} className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full break-after-page">
            {/* Watermark */}
            <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
                <div className="w-[150%] h-[150%] -rotate-12 flex flex-wrap content-center justify-center gap-24 select-none">
                     {Array.from({ length: 20 }).map((_, i) => (
                         <div key={i} className="text-4xl font-black text-slate-900 whitespace-nowrap">PSI OFFICIAL SAFETY RECORD</div>
                     ))}
                </div>
            </div>

            <div className="absolute inset-0 m-4 border-[2px] border-slate-800 z-10 pointer-events-none"></div>
            <div className="relative z-10 px-[14mm] py-[12mm] flex flex-col h-full">
                
                {/* Header */}
                <div className="text-center mb-5 shrink-0">
                    <div className="flex justify-center mb-2">
                        <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                            <BrandPhilosophyLogo className="w-8 h-8" />
                        </div>
                    </div>
                     <h1 className="text-xl font-serif font-black text-slate-900 uppercase">Certificate of Safety Competence</h1>
                     <p className="text-xs font-bold text-slate-600 font-sans tracking-widest">{labels.cert}</p>
                </div>

                {/* Profile Section */}
                <div className="flex items-start justify-between mb-6 pb-4 border-b border-slate-200 shrink-0">
                    <div className="flex gap-5">
                         <div className="w-24 h-32 bg-white border border-slate-200 p-1 shadow-sm shrink-0 group relative overflow-hidden flex items-center justify-center cursor-pointer" onClick={onPhotoClick}>
                            {getProfileImage() ? (
                                <img src={getProfileImage()!} className="w-full h-full object-cover" alt="Profile" />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 text-xs text-center p-1">
                                    <span className="text-xl mb-1">📷</span>
                                    <span>Photo</span>
                                </div>
                            )}
                         </div>
                         <div className="flex flex-col justify-center">
                             <h2 className="text-3xl font-serif font-bold text-slate-900 leading-none mb-2">{record.name}</h2>
                             <div className="space-y-1">
                                 <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded mr-2">{record.nationality}</span>
                                 <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{record.jobField}</span>
                             </div>
                             <p className="text-[10px] text-slate-400 mt-2 font-medium">Date: {formatDate(record.date)}</p>
                         </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <div className="flex flex-col items-center">
                            <div className="relative w-20 h-20 flex items-center justify-center bg-indigo-50 rounded-full border-4 border-indigo-100 shadow-sm">
                                <span className="text-3xl font-black text-indigo-700 tracking-tighter">{record.safetyScore}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">Total Score</span>
                            {Array.isArray(record.scoreReasoning) && record.scoreReasoning.length > 0 && (
                                <div className="mt-2 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
                                    <p className="text-[10px] font-black text-slate-700">AI 상세 채점 근거</p>
                                    <ul className="mt-1 space-y-1">
                                        {record.scoreReasoning.slice(0, 3).map((reason, index) => (
                                            <li key={index} className="text-[10px] leading-tight text-slate-600">• {reason}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                        <div className="w-44 h-44 relative -my-4">
                            <IndividualRadarChart record={record} />
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 flex gap-6">
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
                                {reassessmentTrail.length > 0 && (
                                    <>
                                        <div className="w-full h-px bg-slate-100"></div>
                                        <div>
                                            <p className="text-[10px] font-black text-violet-700 mb-1">{reassessmentTitle}</p>
                                            <ul className="space-y-1">
                                                {reassessmentTrail.map((entry, i) => (
                                                    <li key={`${entry.timestamp}-${i}`} className="text-[10px] text-violet-700 leading-tight">
                                                        • {reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)} {entry.note || reassessmentFallback}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

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
    );
});
