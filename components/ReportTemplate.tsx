
import React, { useMemo } from 'react';
import type { SixMetricBreakdown, WorkerRecord } from '../types';
import { IndividualRadarChart } from './charts/IndividualRadarChart';
import { deriveCompetencyProfile } from '../utils/evidenceUtils';
import { getSafetyLevelThresholds } from '../utils/safetyLevelUtils';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';
import { NextActionChecklist } from './shared/NextActionChecklist';
import { StatusBadge } from './shared/StatusBadge';
import { PSI_APP_VERSION } from '../lib/appInfo';
import { buildFallbackNativeCoachingText, buildFallbackNativeGuidanceText, buildFallbackNativeVerdictText, isKoreanNationality, sanitizeOperationalNote } from '../utils/ocrVerificationLanguageUtils';
import { getNativeJobFieldLabel, getNativeSafetyLevelLabel, getReportLanguagePolicy } from '../utils/reportLanguagePolicy';
import { getWorkerIdentityKey, stableWorkerHash } from '../utils/workerIdentity';

interface ReportTemplateProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onPhotoClick?: () => void;
    includeAdminAppendix?: boolean;
}

const SectionSearchIcon: React.FC = () => (
    <svg viewBox="0 0 16 16" className="block w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" stroke="currentColor" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" strokeWidth="1.8" />
        <path d="M10.5 10.5L14 14" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
);

const SectionCoachingIcon: React.FC = () => (
    <svg viewBox="0 0 16 16" className="block w-3.5 h-3.5 text-amber-700 shrink-0" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M8 1.5a4.5 4.5 0 0 0-2.64 8.14c.4.28.64.73.64 1.21V11.5h4v-.65c0-.48.23-.93.63-1.21A4.5 4.5 0 0 0 8 1.5Z" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M6.2 13h3.6M6.6 14.5h2.8" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
);

const CheckBulletIcon: React.FC<{ className?: string }> = ({ className = 'text-emerald-600' }) => (
    <svg viewBox="0 0 16 16" className={`block w-3.5 h-3.5 shrink-0 ${className}`} fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

const WarningBulletIcon: React.FC = () => (
    <svg viewBox="0 0 16 16" className="block w-3.5 h-3.5 text-rose-600 shrink-0" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M8 2.2 14 13H2L8 2.2Z" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M8 6v3.2" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
);

const PhotoPlaceholderIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-9Z" strokeWidth="1.6" />
        <circle cx="9" cy="10" r="1.5" strokeWidth="1.6" />
        <path d="m7 16 4-4 2.5 2.5L16 12l2 4" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

// 텍스트 하이라이트 컴포넌트
const HighlightedText: React.FC<{ text: string }> = ({ text }) => {
    if (!text) return null;
    const regex = /(".*?"|'.*?'|위험|추락|낙하|붕괴|협착|감전|화재|폭발|미착용|미준수|미흡|불량|사고|재해|경고|주의|금지|무시|심각|사망|즉시|필수|강력|생명|직결|우수|양호|철저|확실|완벽|준수|모범|칭찬|개선|권고)/g;
    const parts = text.split(regex);
    return (
        <span>
            {parts.map((part, i) => {
                const isMatch = /^(".*?"|'.*?'|위험|추락|낙하|붕괴|협착|감전|화재|폭발|미착용|미준수|미흡|불량|사고|재해|경고|주의|금지|무시|심각|사망|즉시|필수|강력|생명|직결|우수|양호|철저|확실|완벽|준수|모범|칭찬|개선|권고)$/.test(part);
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
        labels: { ko: '추락 주의', cn: '当心坠落', vn: 'Chú ý rơi ngã', th: 'ระวังตก', my: 'ပြုတ်ကျမှု သတိ', uz: 'Yiqilish xavfi', kh: 'គ្រោះថ្នាក់នៃការធ្លាក់', id: 'Bahaya Jatuh', ms: 'Bahaya Jatuh', mn: 'Унах аюултай', ru: 'Опасность падения', kk: 'Құлау қаупі', ne: 'खस्ने जोखिम', en: 'Danger: Falling' }
    },
    {
        id: 'electric', type: 'warning', keywords: ['전기', '감전', '누전', '케이블', '전선', '접지'],
        icon: (
            <g><path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/><path d="M50 30 L40 50 L55 50 L45 75" stroke="black" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>
        ),
        labels: { ko: '감전 주의', cn: '当心触电', vn: 'Cẩn thận điện giật', th: 'ระวังไฟฟ้าดูด', my: 'လျှပ်စစ်အန္တရာယ် သတိ', uz: 'Elektr toki xavfi', kh: 'គ្រោះថ្នាក់ឆក់ខ្សែភ្លើង', id: 'Awas Listrik', ms: 'Awas Renjatan Elektrik', mn: 'Цахилгаанд цохиулах', ru: 'Опасность поражения током', kk: 'Электр тогы қаупі', ne: 'विद्युतीय झट्काको जोखिम', en: 'Danger: Electric Shock' }
    },
    {
        id: 'safety_belt', type: 'mandatory', keywords: ['안전대', '벨트', '고리', '체결', '생명줄'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#2563EB" /><circle cx="50" cy="50" r="36" fill="none" stroke="white" strokeWidth="2" strokeDasharray="4 2"/><path d="M30 50 Q50 80 70 50" stroke="white" strokeWidth="4" fill="none"/><rect x="45" y="45" width="10" height="10" fill="white"/><path d="M30 50 L30 30 M70 50 L70 30" stroke="white" strokeWidth="4"/></g>
        ),
        labels: { ko: '안전대 착용 철저', cn: '必须系安全带', vn: 'Đeo dây an toàn', th: 'สวมเข็มขัดนิรภัย', my: 'လုံခြုံရေးခါးပတ် ဝတ်ဆင်ပါ', uz: 'Xavfsizlik kamarini taqing', kh: 'ពាក់ខ្សែក្រវ៉ាត់', id: 'Pakai Sabuk Pengaman', ms: 'Pakai Tali Pinggang Keselamatan', mn: 'Бүсээ зүүгээрэй', ru: 'Наденьте страховочный пояс', kk: 'Қауіпсіздік белдігін тағыңыз', ne: 'सुरक्षा बेल्ट लगाउनुहोस्', en: 'Wear Safety Belt' }
    },
    {
        id: 'helmet', type: 'mandatory', keywords: ['안전모', '머리', '낙하', '보호구', '턱끈'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#2563EB" /><path d="M30 55 C30 40 40 35 50 35 C60 35 70 40 70 55 Z" fill="white"/><rect x="25" y="55" width="50" height="5" fill="white" rx="2"/></g>
        ),
        labels: { ko: '안전모 착용', cn: '必须戴安全帽', vn: 'Đội mũ bảo hiểm', th: 'สวมหมวกนิรภัย', my: 'လုံခြုံရေးဦးထုပ် ဝတ်ဆင်ပါ', uz: 'Bosh kiyimini kiying', kh: 'ពាក់មួកសុវត្ថិភាព', id: 'Pakai Helm', ms: 'Pakai Topi Keselamatan', mn: 'Малгай өмс', ru: 'Наденьте каску', kk: 'Қорғаныс каскасын киіңіз', ne: 'सुरक्षा हेल्मेट लगाउनुहोस्', en: 'Wear Hard Hat' }
    },
    {
        id: 'fire', type: 'warning', keywords: ['화재', '불', '용접', '인화', '폭발'],
        icon: (
            <g><path d="M50 15 L15 85 H85 L50 15 Z" fill="#FACC15" stroke="black" strokeWidth="3" strokeLinejoin="round"/><path d="M50 70 Q40 70 40 60 Q40 50 50 40 Q60 50 60 60 Q60 70 50 70" fill="red"/></g>
        ),
        labels: { ko: '화재 주의', cn: '当心火灾', vn: 'Cẩn thận hỏa hoạn', th: 'ระวังไฟไหม้', my: 'မီးအန္တရာယ် သတိ', uz: "Yong'in xavfi", kh: 'គ្រោះថ្នាក់អគ្គីភ័យ', id: 'Awas Api', ms: 'Bahaya Kebakaran', mn: 'Галын аюул', ru: 'Пожарная опасность', kk: 'Өрт қаупі', ne: 'आगलागीको जोखिम', en: 'Danger: Fire' }
    },
    {
        id: 'default_safety', type: 'mandatory', keywords: ['default'],
        icon: (
            <g><circle cx="50" cy="50" r="40" fill="#10B981" /><path d="M35 50 L45 60 L65 40" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none"/></g>
        ),
        labels: { ko: '안전 수칙 준수', cn: '遵守安全规定', vn: 'Tuân thủ quy tắc an toàn', th: 'ปฏิบัติตามกฎความปลอดภัย', my: 'လုံခြုံရေးစည်းကမ်း လိုက်နာပါ', uz: 'Xavfsizlik qoidalariga rioya', kh: 'គោរពច្បាប់សុវត្ថិភាព', id: 'Patuhi Aturan', ms: 'Patuhi Peraturan Keselamatan', mn: 'Дүрэм мөрдөх', ru: 'Соблюдайте правила безопасности', kk: 'Қауіпсіздік ережесін сақтаңыз', ne: 'सुरक्षा नियम पालना गर्नुहोस्', en: 'Safety First' }
    }
];

const getMatchedRiskKeyword = (sign: SafetySignData, weakAreas: string[], jobField: string, nationality: string, language?: string): string => {
    const code = getReportLanguagePolicy(nationality, language).code;
    const isMyanmar = code === 'my';
    const isKorean = code === 'ko';
    
    const fallbackLabels = {
        fall: { ko: '고소 작업 / 추락 위험', my: 'အမြင့်လုပ်ငန်း / ပြုတ်ကျမှု', en: 'High Work / Fall Risk' },
        electric: { ko: '전선 접촉 / 감전 위험', my: 'လျှပ်စစ်ကြိုး / ဓာတ်လိုက်မှု', en: 'Electric / Shock Risk' },
        safety_belt: { ko: '안전대 체결 미흡', my: 'ခါးပတ်မပတ်ခြင်း', en: 'No Safety Belt' },
        helmet: { ko: '안전모 미착용 위험', my: 'ဦးထုပ်မဆောင်းခြင်း', en: 'No Hard Hat' },
        fire: { ko: '화기 사용 / 화재 위험', my: 'မီးအသုံးပြုမှု / မီးဘေး', en: 'Hot Work / Fire Risk' },
        default_safety: { ko: '기본 안전 수칙 준수', my: 'အခြေခံစည်းကမ်းများ', en: 'General Safety Rule' }
    };

    const targetLabel = fallbackLabels[sign.id] || fallbackLabels.default_safety;
    return isKorean ? targetLabel.ko : (isMyanmar ? targetLabel.my : targetLabel.en);
};

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

const getSignLabel = (sign: SafetySignData, nationality: string, language?: string) => {
    const code = getReportLanguagePolicy(nationality, language).code;
    const labelKey = code === 'zh' ? 'cn' : code === 'vi' ? 'vn' : code === 'km' ? 'kh' : code;
    return sign.labels[labelKey] || sign.labels.en;
};

const LABELS: Record<string, Record<string, string>> = {
    '베트남': { strengths: 'Điểm mạnh (강점)', weaknesses: 'Điểm yếu & Cải thiện (취약점)', trends: 'Xu hướng an toàn (안전 추이)', verdict: 'Đánh giá an toàn tổng hợp (종합진단)', pictogram: 'Biển báo an toàn thiết yếu (필수 안전 표지)', original: 'Bản gốc viết tay', cert: 'Chứng nhận năng lực an toàn' },
    '중국': { strengths: '优势 (강점)', weaknesses: '弱点与改进 (취약점)', trends: '安全趋势 (안전 추이)', verdict: '综合安全诊断 (종합진단)', pictogram: '基本安全标志 (필수 안전 표지)', original: '手写原件', cert: '安全能力认证' },
    '태국': { strengths: 'จุดแข็ง (강점)', weaknesses: 'จุดอ่อน (취약점)', trends: 'แนวโน้ม (안전 추이)', verdict: 'การวินิจฉัย (종합진단)', pictogram: 'ป้ายความปลอดภัยที่จำเป็น (필수 안전 표지)', original: 'ต้นฉบับ', cert: 'ใบรับรองความปลอดภัย' },
    '미얀마': { strengths: 'အားသာချက်များ (강점)', weaknesses: 'အားနည်းချက်နှင့် ပြုပြင်ရန် (취약점)', trends: 'ဘေးကင်းလုံခြုံရေး လမ်းကြောင်း (안전 추이)', verdict: 'အကျဉ်းချုပ် ဘေးကင်းလုံခြုံရေး သုံးသပ်ချက် (종합진단)', pictogram: 'မရှိမဖြစ် လုံခြုံရေး သင်္ကေတ (필수 안전 표지)', original: 'လက်ရေးမူရင်း', cert: 'ဘေးကင်းလုံခြုံရေး စွမ်းရည် လက်မှတ်' },
    '우즈베키스탄': { strengths: 'Kuchli tomonlari (강점)', weaknesses: 'Zaif tomonlari (취약점)', trends: 'Xavfsizlik (안전 추이)', verdict: 'Keng qamrovli diagnostika (종합진단)', pictogram: 'Muhim xavfsizlik belgilari (필수 안전 표지)', original: 'Asl nusxa', cert: 'Xavfsizlik Sertifikati' },
    '캄보디아': { strengths: 'ចំណុចខ្លាំង (강점)', weaknesses: 'ចំណុចខ្សោយ (취약점)', trends: 'និន្នាការ (안전 추이)', verdict: 'ការវិនិច្ឆ័យ (종합진단)', pictogram: 'ស្លាកសញ្ញា (필수 안전 표지)', original: 'ឯកសារដើម', cert: 'វិញ្ញាបនបត្រសុវត្ថិភាព' },
    '인도네시아': { strengths: 'Kekuatan (강점)', weaknesses: 'Kelemahan (취약점)', trends: 'Tren (안전 추이)', verdict: 'Diagnosis (종합진단)', pictogram: 'Rambu Wajib (필수 안전 표지)', original: 'Asli', cert: 'Sertifikat Keselamatan' },
    '몽골': { strengths: 'Давуу тал (강점)', weaknesses: 'Сул тал (취약점)', trends: 'Хандлага (안전 추이)', verdict: 'Дүгнэлт (종합진단)', pictogram: 'Анхааруулах тэмдэг (필수 안전 표지)', original: 'Эх хувь', cert: 'Аюулгүй байдлын гэрчилгээ' },
    '러시아': { strengths: 'Сильные стороны (강점)', weaknesses: 'Зоны улучшения (취약점)', trends: 'Тренд безопасности (안전 추이)', verdict: 'Комплексная диагностика (종합진단)', pictogram: 'Обязательные знаки безопасности (필수 안전 표지)', original: 'Оригинал записи', cert: 'Сертификат компетенции по безопасности' },
    '카자흐스탄': { strengths: 'Күшті жақтары (강점)', weaknesses: 'Әлсіз тұстары (취약점)', trends: 'Қауіпсіздік тренді (안전 추이)', verdict: 'Кешенді диагностика (종합진단)', pictogram: 'Қауіпсіздік белгілері (필수 안전 표지)', original: 'Түпнұсқа', cert: 'Қауіпсіздік құзыреті сертификаты' },
    '대한민국': { strengths: '역량 강점', weaknesses: '개선 권고', trends: '성과 추이', verdict: '종합 안전 진단', pictogram: '직무 맞춤형 필수 안전 표지', original: '수기 기록 원본', cert: '안전 역량 인증 및 분석서' },
    'default': { strengths: '강점', weaknesses: '개선 포인트', trends: '안전 추이', verdict: '종합 진단', pictogram: '필수 안전 표지', original: '수기 기록 원본', cert: '안전 역량 인증서' }
};

const FRONT_TUNING_LOCKED_THRESHOLDS = {
    strictMin: 3400,
    compactMin: 2700,
    balancedMin: 2000,
} as const;

const FRONT_TUNING_LOCKED_LIMITS = {
    strict: { entryLimit: 2, paragraphLimit: 2, koCharLimit: 60, nativeCharLimit: 52 },
    compact: { entryLimit: 3, paragraphLimit: 2, koCharLimit: 72, nativeCharLimit: 62 },
    balanced: { entryLimit: 3, paragraphLimit: 3, koCharLimit: 86, nativeCharLimit: 74 },
    rich: { entryLimit: 4, paragraphLimit: 3, koCharLimit: 100, nativeCharLimit: 86 },
} as const;

const getCertificateTitleNative = (nationality: string): string => {
    const nation = (nationality || '').trim();
    if (nation.includes('한국') || nation.includes('대한민국') || nation.toLowerCase().includes('korea')) return '안전 역량 인증서';
    if (nation.includes('베트남') || nation.toLowerCase().includes('vietnam')) return 'Chứng nhận Năng lực An toàn';
    if (nation.includes('중국') || nation.toLowerCase().includes('china')) return '安全能力认证书';
    if (nation.includes('태국') || nation.toLowerCase().includes('thailand')) return 'ใบรับรองสมรรถนะด้านความปลอดภัย';
    if (nation.includes('미얀마') || nation.toLowerCase().includes('myanmar') || nation.toLowerCase().includes('burma')) return 'လုံခြုံရေး စွမ်းရည် လက်မှတ်';
    if (nation.includes('우즈벡') || nation.toLowerCase().includes('uzbek')) return 'Xavfsizlik malakasi sertifikati';
    if (nation.includes('캄보디아') || nation.toLowerCase().includes('cambodia')) return 'វិញ្ញាបនបត្រសមត្ថភាពសុវត្ថិភាព';
    if (nation.includes('인도네시아') || nation.toLowerCase().includes('indonesia')) return 'Sertifikat Kompetensi Keselamatan';
    if (nation.includes('몽골') || nation.toLowerCase().includes('mongol')) return 'Аюулгүй ажиллагааны чадамжийн гэрчилгээ';
    if (nation.includes('러시아') || nation.toLowerCase().includes('russia') || nation.toLowerCase().includes('russian') || nation.toLowerCase().includes('росси')) return 'Сертификат компетенции по безопасности';
    if (nation.includes('카자흐') || nation.toLowerCase().includes('kazakh')) return 'Қауіпсіздік құзыреті сертификаты';
    return '안전 역량 인증서';
};

const getAppendixTitleNative = (nationality: string): string => {
    const nation = (nationality || '').trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea')) return '상세 해석 및 실행 노트';
    if (nation.includes('베트남') || nation.includes('vietnam')) return 'Ghi chú diễn giải chi tiết & hướng dẫn thực hành';
    if (nation.includes('중국') || nation.includes('china')) return '详细解读与执行说明';
    if (nation.includes('태국') || nation.includes('thailand')) return 'บันทึกคำอธิบายเชิงลึกและแนวทางปฏิบัติ';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return 'အသေးစိတ် အဓိပ္ပာယ်ဖွင့်ဆိုချက်နှင့် လုပ်ဆောင်ချက် မှတ်စုများ';
    if (nation.includes('우즈벡') || nation.includes('uzbek')) return 'Batafsil talqin va amaliy ijro eslatmalari';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return 'កំណត់ចំណាំបកស្រាយលម្អិត និងការអនុវត្ត';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return 'Catatan Interpretasi Rinci & Eksekusi Lapangan';
    if (nation.includes('몽골') || nation.includes('mongol')) return 'Дэлгэрэнгүй тайлбар ба хэрэгжилтийн тэмдэглэл';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси')) return 'Подробный разбор и практические инструкции';
    if (nation.includes('카자흐') || nation.includes('kazakh')) return 'Толық түсіндірме және орындау нұсқаулығы';
    return '상세 해석 및 실행 노트';
};

const getWorkerInfoNative = (nationality: string): string => {
    const nation = (nationality || '').trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea')) return '근로자 정보';
    if (nation.includes('베트남') || nation.includes('vietnam')) return 'Thông tin công nhân';
    if (nation.includes('중국') || nation.includes('china')) return '工人信息';
    if (nation.includes('태국') || nation.includes('thailand')) return 'ข้อมูลคนงาน';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return 'အလုပ်သမား အချက်အလက်';
    if (nation.includes('우즈벡') || nation.includes('uzbek')) return 'Ishchi maʼlumotlari';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return 'ព័ត៌មានកម្មករ';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return 'Informasi pekerja';
    if (nation.includes('몽골') || nation.includes('mongol')) return 'Ажилтны мэдээлэл';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси')) return 'Информация о работнике';
    if (nation.includes('카자흐') || nation.includes('kazakh')) return 'Жұмысшы туралы ақпарат';
    return '근로자 정보';
};

const getSixMetricBilingualLabels = (nationality: string): Array<{ ko: string; native: string; max: number; isPenalty?: boolean }> => {
    const nation = (nationality || '').toLowerCase();
    const koBase = [
        { ko: '① 응답 충실도', max: 100 },
        { ko: '② 업무 이해도', max: 100 },
        { ko: '③ 위험평가 이해', max: 100 },
        { ko: '④ 작업 숙련도', max: 100 },
        { ko: '⑤ 개선 이행력', max: 100 },
        { ko: '⑥ 반복위반 패널티', max: 20, isPenalty: true },
    ];

    if (nation.includes('한국') || nation.includes('korea')) {
        return koBase.map((item) => ({ ...item, native: item.ko.replace(/^\d+\s*/, '') }));
    }

    if (nation.includes('베트남') || nation.includes('vietnam')) {
        return [
            { ko: koBase[0].ko, native: 'Ổn định tâm lý', max: 100 },
            { ko: koBase[1].ko, native: 'Hiểu biết công việc', max: 100 },
            { ko: koBase[2].ko, native: 'Hiểu đánh giá rủi ro', max: 100 },
            { ko: koBase[3].ko, native: 'Mức độ thành thạo', max: 100 },
            { ko: koBase[4].ko, native: 'Năng lực thực hiện cải thiện', max: 100 },
            { ko: koBase[5].ko, native: 'Mức phạt vi phạm lặp lại', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('중국') || nation.includes('china')) {
        return [
            { ko: koBase[0].ko, native: '心理稳定性', max: 100 },
            { ko: koBase[1].ko, native: '作业理解度', max: 100 },
            { ko: koBase[2].ko, native: '风险评估理解', max: 100 },
            { ko: koBase[3].ko, native: '作业熟练度', max: 100 },
            { ko: koBase[4].ko, native: '改进执行力', max: 100 },
            { ko: koBase[5].ko, native: '重复违规惩罚', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) {
        return [
            { ko: koBase[0].ko, native: 'စိတ်ပိုင်းတည်ငြိမ်မှု', max: 100 },
            { ko: koBase[1].ko, native: 'အလုပ်နားလည်မှု', max: 100 },
            { ko: koBase[2].ko, native: 'အန္တရာယ် အကဲဖြတ် နားလည်မှု', max: 100 },
            { ko: koBase[3].ko, native: 'အလုပ်ကျွမ်းကျင်မှု', max: 100 },
            { ko: koBase[4].ko, native: 'တိုးတက်မှု အကောင်အထည်ဖော်နိုင်မှု', max: 100 },
            { ko: koBase[5].ko, native: 'ထပ်ခါတလဲလဲ ချိုးဖောက်မှု ပြစ်ဒဏ်', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('캄보디아') || nation.includes('cambodia')) {
        return [
            { ko: koBase[0].ko, native: 'ស្ថេរភាពផ្លូវចិត្ត', max: 100 },
            { ko: koBase[1].ko, native: 'ការយល់ដឹងអំពីការងារ', max: 100 },
            { ko: koBase[2].ko, native: 'ការយល់ដឹងអំពីការវាយតម្លៃហានិភ័យ', max: 100 },
            { ko: koBase[3].ko, native: 'ជំនាញការងារ', max: 100 },
            { ko: koBase[4].ko, native: 'សមត្ថភាពអនុវត្តការកែលម្អ', max: 100 },
            { ko: koBase[5].ko, native: 'ពិន័យការរំលោភបំពានដដែលៗ', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('인도네시아') || nation.includes('indonesia')) {
        return [
            { ko: koBase[0].ko, native: 'Stabilitas psikologis', max: 100 },
            { ko: koBase[1].ko, native: 'Pemahaman pekerjaan', max: 100 },
            { ko: koBase[2].ko, native: 'Pemahaman penilaian risiko', max: 100 },
            { ko: koBase[3].ko, native: 'Kemahiran kerja', max: 100 },
            { ko: koBase[4].ko, native: 'Kemampuan pelaksanaan perbaikan', max: 100 },
            { ko: koBase[5].ko, native: 'Penalti pelanggaran berulang', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('몽골') || nation.includes('mongol')) {
        return [
            { ko: koBase[0].ko, native: 'Сэтгэлзүйн тогтвортой байдал', max: 100 },
            { ko: koBase[1].ko, native: 'Ажлын ойлголт', max: 100 },
            { ko: koBase[2].ko, native: 'Эрсдэлийн үнэлгээний ойлголт', max: 100 },
            { ko: koBase[3].ko, native: 'Ажлын ур чадвар', max: 100 },
            { ko: koBase[4].ko, native: 'Сайжруулалт хэрэгжүүлэх чадвар', max: 100 },
            { ko: koBase[5].ko, native: 'Давтан зөрчлийн торгууль', max: 20, isPenalty: true },
        ];
    }

    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('russian') || nation.includes('росси')) {
        return [
            { ko: koBase[0].ko, native: 'Психологическая устойчивость', max: 100 },
            { ko: koBase[1].ko, native: 'Понимание работы', max: 100 },
            { ko: koBase[2].ko, native: 'Понимание оценки рисков', max: 100 },
            { ko: koBase[3].ko, native: 'Профессиональные навыки', max: 100 },
            { ko: koBase[4].ko, native: 'Способность внедрять улучшения', max: 100 },
            { ko: koBase[5].ko, native: 'Штраф за повторные нарушения', max: 20, isPenalty: true },
        ];
    }

    return [
        { ko: koBase[0].ko, native: '응답 충실도', max: 100 },
        { ko: koBase[1].ko, native: '업무 이해도', max: 100 },
        { ko: koBase[2].ko, native: '위험평가 이해', max: 100 },
        { ko: koBase[3].ko, native: '작업 숙련도', max: 100 },
        { ko: koBase[4].ko, native: '개선 이행력', max: 100 },
        { ko: koBase[5].ko, native: '반복위반 패널티', max: 20, isPenalty: true },
    ];
};

const getMonthlyEduNativeTitle = (nationality: string): string => {
    const nation = (nationality || '').trim();
    if (nation.includes('한국') || nation.includes('대한민국') || nation.toLowerCase().includes('korea'))
        return '월간 안전보건정기교육 역량 진단서';
    if (nation.includes('베트남') || nation.toLowerCase().includes('vietnam'))
        return 'Báo cáo Chẩn đoán Năng lực Giáo dục An toàn Hàng tháng';
    if (nation.includes('중국') || nation.toLowerCase().includes('china'))
        return '月度安全健康定期教育能力诊断报告';
    if (nation.includes('태국') || nation.toLowerCase().includes('thailand'))
        return 'รายงานวินิจฉัยศักยภาพการฝึกอบรมความปลอดภัยประจำเดือน';
    if (nation.includes('미얀마') || nation.toLowerCase().includes('myanmar') || nation.toLowerCase().includes('burma'))
        return 'လစဉ် လုံခြုံရေးနှင့် ကျန်းမာရေး ပညာပေး အရည်အချင်း စိစစ်အစီရင်ခံစာ';
    if (nation.includes('우즈베키스탄') || nation.includes('우즈벡') || nation.toLowerCase().includes('uzbek'))
        return "Oylik xavfsizlik ta'limi malakasi hisoboti";
    if (nation.includes('캄보디아') || nation.toLowerCase().includes('cambodia'))
        return 'របាយការណ៍វិនិច្ឆ័យជំនាញអប់រំសុវត្ថិភាពប្រចាំខែ';
    if (nation.includes('인도네시아') || nation.toLowerCase().includes('indonesia'))
        return 'Laporan Diagnostik Kompetensi Pendidikan Keselamatan Bulanan';
    if (nation.includes('몽골') || nation.toLowerCase().includes('mongol'))
        return 'Сарын аюулгүй ажиллагааны боловсролын чадамжийн тайлан';
    if (nation.includes('러시아') || nation.toLowerCase().includes('russia') || nation.toLowerCase().includes('russian') || nation.toLowerCase().includes('росси'))
        return 'Ежемесячный диагностический отчет по компетенциям в области охраны труда';
    if (nation.includes('카자흐') || nation.toLowerCase().includes('kazakh'))
        return 'Ай сайынғы еңбек қауіпсіздігі білімі есебі';
    return '월간 안전보건정기교육 역량 진단서';
};

const getLabels = (nationality: string) => {
    const nation = (nationality || '').trim();
    // LANGUAGE_POLICY 준수: 정확한 국적명으로 직접 조회
    if (LABELS[nation]) return LABELS[nation];
    // 부분 매칭으로 기관명/오기/애칭 대응 (Backward compatibility)
    if (nation.includes('베트남')) return LABELS['베트남'];
    if (nation.includes('중국')) return LABELS['중국'];
    if (nation.includes('태국')) return LABELS['태국'];
    if (nation.includes('미얀마') || nation.toLowerCase().includes('myanmar') || nation.toLowerCase().includes('burma')) return LABELS['미얀마'];
    if (nation.includes('우즈벡')) return LABELS['우즈베키스탄'];
    if (nation.includes('캄보디아')) return LABELS['캄보디아'];
    if (nation.includes('인도네시아')) return LABELS['인도네시아'];
    if (nation.includes('몽골')) return LABELS['몽골'];
    if (nation.includes('러시아') || nation.toLowerCase().includes('russia') || nation.toLowerCase().includes('russian') || nation.toLowerCase().includes('росси')) return LABELS['러시아'];
    if (nation.includes('카자흐')) return LABELS['카자흐스탄'];
    // 한국인 처리: 대한민국, 한국, Korea 등 모두 지원 (최종적으로 '대한민국'으로 정규화)
    if (nation.includes('한국') || nation.includes('korea') || nation === '대한민국') return LABELS['대한민국'];
    return LABELS['default'];
};

const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}`;
};

const normalizeNarrativeText = (value?: string): string => String(value || '').trim();

const isEmptyNarrative = (value?: string): boolean => {
    const normalized = normalizeNarrativeText(value).replace(/[.\s]/g, '');
    return !normalized || ['없음', '해당없음', '코칭내용없음', '없다', '해당사항없음', 'n/a', 'na', 'none'].includes(normalized.toLowerCase());
};

const stageLabelMap: Record<string, string> = {
    ocr: 'OCR',
    validation: '검증',
    correction: '보정',
    action: '조치',
    approval: '승인',
    reassessment: '재평가',
};

const isSystemLog = (text: string): boolean => {
    const lower = text.toLowerCase();
    const systemKeywords = [
        'schema', 'cache', 'public.', 'table', 'error', 'exception', 'supabase', 
        'database', 'sql', 'postgres', 'network', 'ocr 후처리', '날짜 형식', '표준화',
        'harness', 'api', 'http', 'status', 'token', 'calibration', '보정', '이동', '이력',
        'could not find', 'not found', 'null', 'undefined', 'uncaught', 'failed'
    ];
    return systemKeywords.some(k => lower.includes(k));
};

const hasAuditSpecialSignal = (note: string): boolean => {
    return /(특이|위반|미준수|반려|재작업|재교육|오류|불일치|경고|누락|불량|지연|사고|재해|감점|패널티|시정|조치 필요)/i.test(note);
};

const getAuditSpecialRecommendations = (record: WorkerRecord): string[] => {
    const trail = Array.isArray(record.auditTrail) ? record.auditTrail : [];
    if (trail.length === 0) return [];

    const recentWithNote = trail
        .filter((entry) => normalizeNarrativeText(entry.note).length > 0)
        .slice(-6)
        .reverse();

    const specials = recentWithNote
        .filter((entry) => {
            const note = normalizeNarrativeText(entry.note);
            if (isSystemLog(note)) return false;
            return entry.stage !== 'ocr' || hasAuditSpecialSignal(note);
        })
        .slice(0, 2)
        .map((entry) => {
            const rawNote = normalizeNarrativeText(entry.note);
            const stageLabel = stageLabelMap[entry.stage] || entry.stage;
            const isMyanmar = (record.nationality || '').includes('미얀마') || (record.nationality || '').toLowerCase().includes('myanmar') || (record.nationality || '').toLowerCase().includes('burma');
            const shortNote = !isMyanmar && rawNote.length > 64 ? `${rawNote.slice(0, 64)}…` : rawNote;
            return `감사이력(${stageLabel}) 특이사항 '${shortNote}' 관련 재발 방지를 위해 ${record.jobField} 작업 전 사전점검·역할확인·보호조치 이행 여부를 팀 단위로 즉시 확인하기`;
        });

    return specials;
};

const buildActionableCoachingText = (record: WorkerRecord): string => {
    if (!isEmptyNarrative(record.actionable_coaching)) {
        return normalizeNarrativeText(record.actionable_coaching);
    }

    const firstStrength = normalizeNarrativeText(record.strengths?.[0]);
    const firstWeakArea = normalizeNarrativeText(record.weakAreas?.[0]);
    const improvement = normalizeNarrativeText(record.improvement);
    const insight = normalizeNarrativeText(record.aiInsights);

    if (improvement) {
        return `💡 작성하신 내용을 바탕으로, ${record.jobField} 작업 전에는 ${improvement} 내용을 작업 시작 전에 한 번 더 구두로 확인하고, 실제 작업 중에는 팀장·동료와 함께 같은 순서로 이행해 주세요. 특히 위험구간에 들어가기 직전 본인이 적은 조치를 직접 점검 항목처럼 다시 확인하면 현장 실천력이 더 높아집니다.`;
    }

    if (firstWeakArea) {
        return `💡 이번 기록에서 드러난 '${firstWeakArea}' 부분은 현장에서 가장 먼저 행동으로 옮겨야 합니다. ${record.jobField} 작업 전 준비 단계에서 관련 장비·보호구·통제범위를 먼저 확인하고, 작업 중에도 같은 위험이 반복되지 않도록 본인이 적은 내용과 연결된 조치를 한 번 더 말로 확인해 주세요.`;
    }

    if (firstStrength) {
        return `💡 이번 작성에서 '${firstStrength}' 내용이 잘 드러났습니다. 다음 작업에서도 ${record.jobField} 시작 전에 해당 조치를 먼저 실행하고, 작업 도중 조건이 바뀌면 같은 기준으로 위험요인과 보호조치를 다시 맞춰 보면서 현장에서 꾸준히 실천해 주세요.`;
    }

    if (insight) {
        return `💡 이번 기록의 핵심 판단은 "${insight}"입니다. 현장에서는 이 판단을 문장으로만 두지 말고, ${record.jobField} 작업 전 점검·작업 중 확인·작업 후 정리 단계까지 실제 행동으로 연결해 반복 실천해 주세요.`;
    }

    return `💡 이번 작성 내용은 기본적인 안전 인식이 확인되었습니다. 현장에서는 ${record.jobField} 작업 시작 전 위험요인 확인, 보호구 점검, 작업순서 재확인을 습관화해 실제 행동으로 이어가 주세요.`;
};

interface NarrativeEntry {
    text: string;
    nativeText?: string;
}

const normalizeComparisonText = (value?: string): string => {
    return String(value || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[•·▪◦※※,.;:!?'"“”‘’`~()[\]{}<>《》【】]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const areEquivalentNarratives = (left?: string, right?: string): boolean => {
    const normalizedLeft = normalizeComparisonText(left);
    const normalizedRight = normalizeComparisonText(right);

    if (!normalizedLeft || !normalizedRight) return false;
    return normalizedLeft === normalizedRight || normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
};

const detectHangulRatio = (value?: string): number => {
    const text = String(value || '').trim();
    if (!text) return 0;
    const alphaNumericChars = text.match(/[\p{L}\p{N}]/gu) || [];
    if (alphaNumericChars.length === 0) return 0;
    const hangulChars = text.match(/[가-힣]/g) || [];
    return hangulChars.length / alphaNumericChars.length;
};

const shouldReplaceForeignNativeWithFallback = (nativeText: string, koreanText: string, isKorean: boolean): boolean => {
    if (isKorean) return false;
    const normalizedNative = normalizeNarrativeText(nativeText);
    if (!normalizedNative) return true;

    if (areEquivalentNarratives(normalizedNative, koreanText)) return true;

    // 근로자 전달면에는 한국어가 한 글자라도 섞이면 완전한 모국어 문장으로 교체한다.
    return detectHangulRatio(normalizedNative) > 0;
};

const dedupeNarrativeEntries = (entries: NarrativeEntry[]): NarrativeEntry[] => {
    return entries.reduce<NarrativeEntry[]>((acc, entry) => {
        const text = normalizeNarrativeText(entry.text);
        const nativeText = normalizeNarrativeText(entry.nativeText);
        if (!text) return acc;

        const existing = acc.find((item) => (
            areEquivalentNarratives(item.text, text) ||
            (nativeText && areEquivalentNarratives(item.nativeText, nativeText)) ||
            (nativeText && areEquivalentNarratives(item.text, nativeText)) ||
            (item.nativeText && areEquivalentNarratives(item.nativeText, text))
        ));

        if (!existing) {
            acc.push({
                text,
                nativeText: nativeText && !areEquivalentNarratives(text, nativeText) ? nativeText : undefined,
            });
            return acc;
        }

        if (!existing.nativeText && nativeText && !areEquivalentNarratives(existing.text, nativeText)) {
            existing.nativeText = nativeText;
        }

        return acc;
    }, []);
};

const buildNarrativeEntries = (texts?: string[], nativeTexts?: string[]): NarrativeEntry[] => {
    const safeTexts = Array.isArray(texts) ? texts : [];
    const safeNativeTexts = Array.isArray(nativeTexts) ? nativeTexts : [];

    return dedupeNarrativeEntries(
        safeTexts.map((text, index) => ({
            text,
            nativeText: safeNativeTexts[index],
        })),
    );
};

const buildImprovementEntries = (record: WorkerRecord): NarrativeEntry[] => {
    const auditSpecialRecommendations = getAuditSpecialRecommendations(record);
    const weakAreas = Array.isArray(record.weakAreas) ? record.weakAreas.filter(Boolean) : [];
    const weakAreasNative = Array.isArray(record.weakAreas_native) ? record.weakAreas_native : [];

    if (weakAreas.length > 0) {
        return dedupeNarrativeEntries([
            ...auditSpecialRecommendations.map((text) => ({ text })),
            ...weakAreas.map((text, index) => ({ text, nativeText: weakAreasNative[index] })),
        ]).slice(0, 5);
    }

    const improvement = normalizeNarrativeText(record.improvement);
    const improvementNative = normalizeNarrativeText(record.improvement_native);
    const firstStrength = normalizeNarrativeText(record.strengths?.[0]);

    if (improvement) {
        return dedupeNarrativeEntries([
            ...auditSpecialRecommendations.map((text) => ({ text })),
            {
                text: `작성한 개선방안인 '${improvement}'를 작업 시작 전 체크 항목으로 실제 적용하기`,
                nativeText: improvementNative,
            },
            { text: `${record.jobField} 작업 중 위험구간 진입 전 본인이 적은 조치를 다시 확인하기` },
        ]).slice(0, 5);
    }

    if (firstStrength) {
        return dedupeNarrativeEntries([
            ...auditSpecialRecommendations.map((text) => ({ text })),
            { text: `강점으로 확인된 '${firstStrength}'를 이번 달 작업 내내 동일하게 유지하기` },
            { text: `${record.jobField} 작업 전 위험요인과 보호조치를 팀 단위로 한 번 더 맞춰 보기` },
        ]).slice(0, 5);
    }

    return dedupeNarrativeEntries([
        ...auditSpecialRecommendations.map((text) => ({ text })),
        { text: `${record.jobField} 작업 전 위험요인·보호구·작업순서를 직접 말로 확인하기` },
        { text: `작업 중 조건 변경 시 즉시 위험요인을 다시 점검하고 보호조치를 보완하기` },
    ]).slice(0, 5);
};

const buildNarrativeParagraphs = (value?: string, fallbackList?: string[]): string[] => {
    const normalized = normalizeNarrativeText(value)
        .replace(/\r/g, '')
        .replace(/\n{2,}/g, '\n');

    if (normalized) {
        return normalized
            .split(/\n+|(?<=[.!?。！？])\s+/u)
            .map((item) => item.trim())
            .filter(Boolean);
    }

    return dedupeNarrativeEntries((fallbackList || []).map((text) => ({ text }))).map((entry) => entry.text);
};

const applyFallbackNativeToEntries = (entries: NarrativeEntry[], fallbackNativeText: string, isKorean: boolean): NarrativeEntry[] => {
    if (isKorean) return entries;
    const normalizedFallback = normalizeNarrativeText(fallbackNativeText);
    if (!normalizedFallback) return entries;

    return entries.map((entry) => {
        const normalizedNative = normalizeNarrativeText(entry.nativeText);
        const shouldReplace = shouldReplaceForeignNativeWithFallback(normalizedNative, entry.text, isKorean);
        if (normalizedNative && !shouldReplace) return entry;
        if (areEquivalentNarratives(entry.text, normalizedFallback)) return entry;
        return {
            ...entry,
            nativeText: normalizedFallback,
        };
    });
};

const buildScoreReasonEntries = (record: WorkerRecord): NarrativeEntry[] => {
    if (!isEmptyNarrative(record.score_reason)) {
        return dedupeNarrativeEntries([{ text: normalizeNarrativeText(record.score_reason), nativeText: normalizeNarrativeText(record.score_reason_native) }]);
    }

    return dedupeNarrativeEntries((Array.isArray(record.scoreReasoning) ? record.scoreReasoning : []).map((text) => ({ text })));
};

const hardWrapText = (value: string, maxChars: number): string => {
    let remaining = String(value || '').trim();
    if (!remaining) return '';

    const lines: string[] = [];
    while (remaining.length > maxChars) {
        let breakIndex = remaining.lastIndexOf(' ', maxChars);
        if (breakIndex < Math.floor(maxChars * 0.6)) {
            breakIndex = maxChars;
        }

        const chunk = remaining.slice(0, breakIndex).trim();
        if (chunk) lines.push(chunk);
        remaining = remaining.slice(breakIndex).trimStart();
    }

    if (remaining) lines.push(remaining);
    return lines.join('\n');
};

const wrapNarrativeText = (value?: string, maxChars: number = 44): string => {
    const normalized = normalizeNarrativeText(value)
        .replace(/\r/g, '')
        .replace(/\n{2,}/g, '\n');

    if (!normalized) return '';

    const sentences = normalized.split(/(?<=[.!?。！？])\s+/u).filter(Boolean);
    const targets = sentences.length > 0 ? sentences : [normalized];
    return targets.map((sentence) => hardWrapText(sentence, maxChars)).join('\n');
};

const limitNarrativeText = (value?: string, maxChars: number = 80): string => {
    const normalized = normalizeNarrativeText(value).replace(/\s+/g, ' ').trim();
    if (!normalized) return '';
    if (normalized.length <= maxChars) return normalized;

    const sentenceChunks = normalized.split(/(?<=[.!?。！？])\s+/u).filter(Boolean);
    if (sentenceChunks.length > 1) {
        let combined = '';
        for (const chunk of sentenceChunks) {
            const next = combined ? `${combined} ${chunk}` : chunk;
            if (next.length > maxChars) break;
            combined = next;
        }

        if (combined) {
            return combined.length < normalized.length ? `${combined}…` : combined;
        }
    }

    const short = normalized.slice(0, maxChars);
    const breakIndex = short.lastIndexOf(' ');
    const safeIndex = breakIndex >= Math.floor(maxChars * 0.6) ? breakIndex : maxChars;
    return `${normalized.slice(0, safeIndex).trim()}…`;
};

const limitNarrativeEntry = (entry: NarrativeEntry, textMax: number, nativeMax: number): NarrativeEntry => ({
    text: limitNarrativeText(entry.text, textMax),
    nativeText: entry.nativeText ? limitNarrativeText(entry.nativeText, nativeMax) : undefined,
});

type NarrativeWrapSection = 'weakNative' | 'weakKo' | 'verdictNative' | 'verdictKo';

const getNarrativeWrapWidth = (nationality: string, dense: boolean, section: NarrativeWrapSection): number => {
    const baseMap: Record<NarrativeWrapSection, number> = {
        weakNative: dense ? 38 : 44,
        weakKo: dense ? 38 : 44,
        verdictNative: dense ? 42 : 48,
        verdictKo: dense ? 40 : 46,
    };

    const nation = String(nationality || '').toLowerCase();

    if (nation.includes('중국') || nation.includes('china')) {
        return baseMap[section] + 5;
    }

    if (nation.includes('태국') || nation.includes('thailand') || nation.includes('캄보디아') || nation.includes('cambodia')) {
        return baseMap[section] - 3;
    }

    if (nation.includes('몽골') || nation.includes('mongol') || nation.includes('우즈벡') || nation.includes('uzbek')) {
        return baseMap[section] - 2;
    }

    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('russian') || nation.includes('росси')) {
        return baseMap[section] - 2;
    }

    if (nation.includes('베트남') || nation.includes('vietnam') || nation.includes('인도네시아') || nation.includes('indonesia')) {
        return baseMap[section] - 1;
    }

    return baseMap[section];
};

const clampMetric = (value: number, max: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(max, Math.round(value)));
};

const hasValidScoreBreakdown = (scoreBreakdown?: SixMetricBreakdown): scoreBreakdown is SixMetricBreakdown => {
    if (!scoreBreakdown) return false;

    return [
        scoreBreakdown.psychological,
        scoreBreakdown.jobUnderstanding,
        scoreBreakdown.riskAssessmentUnderstanding,
        scoreBreakdown.proficiency,
        scoreBreakdown.improvementExecution,
        scoreBreakdown.repeatViolationPenalty,
    ].some((value) => Number.isFinite(value));
};

const buildFallbackScoreBreakdown = (record: WorkerRecord): SixMetricBreakdown => {
    const profile = record.competencyProfile || deriveCompetencyProfile(record);

    return {
        psychological: clampMetric((profile.psychologicalScore / 100) * 10, 10),
        jobUnderstanding: clampMetric((profile.jobUnderstandingScore / 100) * 20, 20),
        riskAssessmentUnderstanding: clampMetric((profile.riskAssessmentUnderstandingScore / 100) * 20, 20),
        proficiency: clampMetric((profile.proficiencyScore / 100) * 30, 30),
        improvementExecution: clampMetric((profile.improvementExecutionScore / 100) * 20, 20),
        repeatViolationPenalty: clampMetric((profile.repeatViolationPenalty / 20) * 30, 30),
    };
};

const TrendMiniChart: React.FC<{ history: WorkerRecord[]; record: WorkerRecord }> = ({ history, record }) => {
    const displayData = useMemo(() => {
        const sortedHistory = [...history]
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(-6);
        const source = sortedHistory.length > 0 ? sortedHistory : [record];
        return source.map((item) => ({
            label: String(item.date || '').slice(5) || '-',
            score: clampMetric(Number(item.safetyScore || 0), 100),
        }));
    }, [history, record]);

    const width = 240;
    const height = 110;
    const padding = { top: 10, right: 10, bottom: 22, left: 22 };
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;
    const maxValue = 100;
    const xStep = displayData.length > 1 ? innerWidth / (displayData.length - 1) : 0;

    const points = displayData.map((item, index) => {
        const x = padding.left + (displayData.length > 1 ? xStep * index : innerWidth / 2);
        const y = padding.top + innerHeight - (item.score / maxValue) * innerHeight;
        return { ...item, x, y };
    });

    const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const areaPath = points.length > 0
        ? `${linePath} L ${points[points.length - 1].x} ${padding.top + innerHeight} L ${points[0].x} ${padding.top + innerHeight} Z`
        : '';
    const yTicks = [0, 20, 40, 60, 80, 100];

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label="6개월 응답품질 신호 추이">
            <defs>
                <linearGradient id="trend-fill-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(100,116,139,0.24)" />
                    <stop offset="100%" stopColor="rgba(100,116,139,0.04)" />
                </linearGradient>
            </defs>

            {yTicks.map((tick) => {
                const y = padding.top + innerHeight - (tick / maxValue) * innerHeight;
                return (
                    <g key={`tick-${tick}`}>
                        <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(148,163,184,0.28)" strokeWidth="1" strokeDasharray="3 3" />
                        <text x={padding.left - 6} y={y} textAnchor="end" dominantBaseline="middle" fontSize="8" fontWeight="700" fill="#94A3B8">{tick}</text>
                    </g>
                );
            })}

            {points.length > 1 && <path d={areaPath} fill="url(#trend-fill-gradient)" />}
            {points.length > 1 && <path d={linePath} fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}

            {points.map((point) => (
                <g key={`point-${point.label}-${point.score}`}>
                    <circle cx={point.x} cy={point.y} r="4" fill="#ffffff" />
                    <circle cx={point.x} cy={point.y} r="2.5" fill="#64748B" />
                    <text x={point.x} y={height - 6} textAnchor="middle" fontSize="8" fontWeight="700" fill="#64748B">{point.label}</text>
                </g>
            ))}
        </svg>
    );
};

const createLineClampStyle = (lines: number): React.CSSProperties => ({
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
});

export const ReportTemplate = React.forwardRef<HTMLDivElement, ReportTemplateProps>(({ record, history = [], onPhotoClick, includeAdminAppendix = true }, ref) => {
    const languagePolicy = useMemo(() => getReportLanguagePolicy(record.nationality, record.language), [record.language, record.nationality]);
    const labels = languagePolicy.labels;
    const certificateTitleNative = labels.certificateTitle;
    const appendixTitleNative = useMemo(() => getAppendixTitleNative(record.nationality), [record.nationality]);
    const workerInfoNative = useMemo(() => getWorkerInfoNative(record.nationality), [record.nationality]);
    const monthlyEduNativeTitle = labels.monthlyReportTitle;
    const sixMetricBilingualLabels = useMemo(() => {
        const ko = ['① 응답 충실도', '② 업무 이해도', '③ 위험평가 이해', '④ 작업 숙련도', '⑤ 개선 이행력', '⑥ 반복위반 패널티'];
        return languagePolicy.metrics.map((native, index) => ({
            ko: ko[index],
            native,
            max: index === 5 ? 20 : 100,
            isPenalty: index === 5,
        }));
    }, [languagePolicy.metrics]);
    const isKorean = languagePolicy.code === 'ko';
    const isMyanmar = languagePolicy.code === 'my';
    const timelineLocale = languagePolicy.locale;
    const timelineDateOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    };
    const safetySigns = useMemo(() => getRelevantSigns(record.weakAreas, record.jobField), [record.weakAreas, record.jobField]);
    const reassessmentTitle = labels.reassessment;
    const reassessmentFallback = languagePolicy.genericCoaching;
    const reassessmentTag = `[${labels.reassessment}]`;
    const reassessmentTrail = useMemo(
        () => (record.auditTrail || []).filter(entry => entry.stage === 'reassessment').slice(-2).reverse(),
        [record.auditTrail]
    );
    const fallbackNativeCoachingText = useMemo(() => buildFallbackNativeCoachingText(record), [record]);
    const fallbackNativeVerdictText = useMemo(() => buildFallbackNativeVerdictText(record), [record]);
    const fallbackNativeGuidanceText = useMemo(() => buildFallbackNativeGuidanceText(record), [record]);
    const strengthEntries = useMemo(
        () => applyFallbackNativeToEntries(buildNarrativeEntries(record.strengths, record.strengths_native), fallbackNativeGuidanceText, isKorean),
        [record.strengths, record.strengths_native, fallbackNativeGuidanceText, isKorean],
    );
    const actionableCoachingText = useMemo(() => buildActionableCoachingText(record), [record]);
    const improvementEntries = useMemo(
        () => applyFallbackNativeToEntries(buildImprovementEntries(record), fallbackNativeCoachingText, isKorean),
        [record, fallbackNativeCoachingText, isKorean],
    );
    const improvementItems = useMemo(() => improvementEntries.map((entry) => entry.text), [improvementEntries]);
    const scoreReasonEntries = useMemo(
        () => applyFallbackNativeToEntries(buildScoreReasonEntries(record), fallbackNativeVerdictText, isKorean),
        [record, fallbackNativeVerdictText, isKorean],
    );
    const coachingKoParagraphs = useMemo(() => buildNarrativeParagraphs(actionableCoachingText), [actionableCoachingText]);
    const coachingNativeSourceText = useMemo(
        () => {
            const nativeText = normalizeNarrativeText(record.actionable_coaching_native);
            const koText = normalizeNarrativeText(actionableCoachingText);
            if (shouldReplaceForeignNativeWithFallback(nativeText, koText, isKorean)) {
                return fallbackNativeCoachingText;
            }
            return nativeText || fallbackNativeCoachingText;
        },
        [record.actionable_coaching_native, actionableCoachingText, isKorean, fallbackNativeCoachingText],
    );
    const coachingNativeParagraphs = useMemo(() => buildNarrativeParagraphs(coachingNativeSourceText), [coachingNativeSourceText]);
    const verdictKoParagraphs = useMemo(() => buildNarrativeParagraphs(record.aiInsights), [record.aiInsights]);
    const verdictNativeSourceText = useMemo(
        () => {
            const nativeText = normalizeNarrativeText(record.aiInsights_native);
            const koText = normalizeNarrativeText(record.aiInsights);
            if (shouldReplaceForeignNativeWithFallback(nativeText, koText, isKorean)) {
                return fallbackNativeVerdictText;
            }
            return nativeText || fallbackNativeVerdictText;
        },
        [record.aiInsights_native, record.aiInsights, isKorean, fallbackNativeVerdictText],
    );
    const verdictNativeParagraphs = useMemo(() => buildNarrativeParagraphs(verdictNativeSourceText), [verdictNativeSourceText]);
    const competencyProfile = useMemo(() => record.competencyProfile || deriveCompetencyProfile(record), [record]);
    const safetyLevelThresholds = useMemo(() => getSafetyLevelThresholds(), []);
    const isWeaknessContentDense = useMemo(() => {
        if (isKorean) return false;

        const nativeWeak = Array.isArray(record.weakAreas_native) ? record.weakAreas_native.filter(Boolean) : [];
        const koWeak = improvementEntries.map((entry) => entry.text).filter(Boolean);
        const nativeLength = nativeWeak.join(' ').length;
        const koLength = koWeak.join(' ').length;
        const longestNative = nativeWeak.reduce((max, item) => Math.max(max, String(item).length), 0);
        const longestKo = koWeak.reduce((max, item) => Math.max(max, String(item).length), 0);

        return nativeLength + koLength > 260 || longestNative > 90 || longestKo > 90;
    }, [isKorean, record.weakAreas_native, improvementEntries]);
    const narrativeWrapWidth = useMemo(() => ({
        weakNative: getNarrativeWrapWidth(record.nationality, isWeaknessContentDense, 'weakNative'),
        weakKo: getNarrativeWrapWidth(record.nationality, isWeaknessContentDense, 'weakKo'),
        verdictNative: getNarrativeWrapWidth(record.nationality, isWeaknessContentDense, 'verdictNative'),
        verdictKo: getNarrativeWrapWidth(record.nationality, isWeaknessContentDense, 'verdictKo'),
    }), [record.nationality, isWeaknessContentDense]);
    const frontTuningProfile = useMemo(() => {
        const scoreLength = scoreReasonEntries.map((entry) => `${entry.text} ${entry.nativeText || ''}`).join(' ').length;
        const strengthLength = strengthEntries.map((entry) => `${entry.text} ${entry.nativeText || ''}`).join(' ').length;
        const improvementLength = improvementEntries.map((entry) => `${entry.text} ${entry.nativeText || ''}`).join(' ').length;
        const coachingLength = [actionableCoachingText, record.actionable_coaching_native].filter(Boolean).join(' ').length;
        const verdictLength = [record.aiInsights, verdictNativeSourceText].filter(Boolean).join(' ').length;
        const totalLength = scoreLength + strengthLength + improvementLength + coachingLength + verdictLength;

        const entryCount = scoreReasonEntries.length + strengthEntries.length + improvementEntries.length;
        const paragraphCount = coachingKoParagraphs.length + verdictKoParagraphs.length;
        const hasNativeLayer = !isKorean && (
            scoreReasonEntries.some((entry) => Boolean(entry.nativeText)) ||
            strengthEntries.some((entry) => Boolean(entry.nativeText)) ||
            improvementEntries.some((entry) => Boolean(entry.nativeText)) ||
            coachingNativeParagraphs.length > 0 ||
            verdictNativeParagraphs.length > 0
        );

        const pressureScore =
            totalLength +
            (entryCount * 70) +
            (paragraphCount * 60) +
            (hasNativeLayer ? 140 : 0);

        if (pressureScore >= FRONT_TUNING_LOCKED_THRESHOLDS.strictMin) {
            return {
                key: 'strict' as const,
                ...FRONT_TUNING_LOCKED_LIMITS.strict,
            };
        }

        if (pressureScore >= FRONT_TUNING_LOCKED_THRESHOLDS.compactMin) {
            return {
                key: 'compact' as const,
                ...FRONT_TUNING_LOCKED_LIMITS.compact,
            };
        }

        if (pressureScore >= FRONT_TUNING_LOCKED_THRESHOLDS.balancedMin) {
            return {
                key: 'balanced' as const,
                ...FRONT_TUNING_LOCKED_LIMITS.balanced,
            };
        }

        return {
            key: 'rich' as const,
            ...FRONT_TUNING_LOCKED_LIMITS.rich,
        };
    }, [
        scoreReasonEntries,
        strengthEntries,
        improvementEntries,
        actionableCoachingText,
        record.actionable_coaching_native,
        record.aiInsights,
        verdictNativeSourceText,
        coachingKoParagraphs.length,
        verdictKoParagraphs.length,
        isKorean,
    ]);
    const frontEntryLimit = frontTuningProfile.entryLimit;
    const frontParagraphLimit = frontTuningProfile.paragraphLimit;
    const frontKoCharLimit = isMyanmar ? 10000 : frontTuningProfile.koCharLimit;
    const frontNativeCharLimit = isMyanmar ? 10000 : frontTuningProfile.nativeCharLimit;
    const frontEntryLineClampStyle = createLineClampStyle(frontTuningProfile.key === 'strict' ? 2 : 3);
    const frontCoachingLineClampStyle = createLineClampStyle(frontTuningProfile.key === 'strict' ? 2 : 3);
    const frontVerdictLineClampStyle = createLineClampStyle(
        frontTuningProfile.key === 'strict' ? 6 : frontTuningProfile.key === 'compact' ? 7 : frontTuningProfile.key === 'balanced' ? 8 : 9,
    );
    const frontStrengthEntries = useMemo(
        () => strengthEntries.slice(0, frontEntryLimit).map((entry) => limitNarrativeEntry(entry, frontKoCharLimit, frontNativeCharLimit)),
        [strengthEntries, frontEntryLimit, frontKoCharLimit, frontNativeCharLimit],
    );
    const frontImprovementEntries = useMemo(
        () => improvementEntries.slice(0, frontEntryLimit).map((entry) => limitNarrativeEntry(entry, frontKoCharLimit, frontNativeCharLimit)),
        [improvementEntries, frontEntryLimit, frontKoCharLimit, frontNativeCharLimit],
    );
    const frontCoachingText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(actionableCoachingText, frontKoCharLimit + 30), frontKoCharLimit > 60 ? 34 : 30),
        [actionableCoachingText, frontKoCharLimit],
    );
    const frontCoachingNativeText = useMemo(
        () => coachingNativeParagraphs.length > 0 ? wrapNarrativeText(limitNarrativeText(coachingNativeParagraphs[0], frontNativeCharLimit + 30), frontNativeCharLimit > 52 ? 34 : 30) : '',
        [coachingNativeParagraphs, frontNativeCharLimit],
    );
    const frontCoachingSummaryParagraphs = useMemo(
        () => buildNarrativeParagraphs(frontCoachingNativeText || frontCoachingText).slice(0, frontParagraphLimit),
        [frontCoachingNativeText, frontCoachingText, frontParagraphLimit],
    );
    const frontVerdictNativeText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(verdictNativeSourceText, frontNativeCharLimit + 15), narrativeWrapWidth.verdictNative),
        [verdictNativeSourceText, frontNativeCharLimit, narrativeWrapWidth.verdictNative],
    );
    const frontVerdictKoText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(record.aiInsights, frontKoCharLimit + 20), narrativeWrapWidth.verdictKo),
        [record.aiInsights, frontKoCharLimit, narrativeWrapWidth.verdictKo],
    );
    const frontVerdictPrimaryText = useMemo(
        () => (isKorean ? frontVerdictKoText : (frontVerdictNativeText || frontVerdictKoText)),
        [isKorean, frontVerdictKoText, frontVerdictNativeText],
    );
    const frontScoreReasonEntries = useMemo(
        () => scoreReasonEntries.slice(0, frontEntryLimit).map((entry) => limitNarrativeEntry(entry, frontKoCharLimit, frontNativeCharLimit)),
        [scoreReasonEntries, frontEntryLimit, frontKoCharLimit, frontNativeCharLimit],
    );
    const normalizedScoreBreakdown = useMemo(
        () => (hasValidScoreBreakdown(record.scoreBreakdown) ? record.scoreBreakdown : buildFallbackScoreBreakdown(record)),
        [record],
    );
    const backSixMetricRows = useMemo(
        () => [
            {
                key: 'psychological',
                ...sixMetricBilingualLabels[0],
                value: clampMetric(normalizedScoreBreakdown.psychological, sixMetricBilingualLabels[0].max),
            },
            {
                key: 'jobUnderstanding',
                ...sixMetricBilingualLabels[1],
                value: clampMetric(normalizedScoreBreakdown.jobUnderstanding, sixMetricBilingualLabels[1].max),
            },
            {
                key: 'riskAssessmentUnderstanding',
                ...sixMetricBilingualLabels[2],
                value: clampMetric(normalizedScoreBreakdown.riskAssessmentUnderstanding, sixMetricBilingualLabels[2].max),
            },
            {
                key: 'proficiency',
                ...sixMetricBilingualLabels[3],
                value: clampMetric(normalizedScoreBreakdown.proficiency, sixMetricBilingualLabels[3].max),
            },
            {
                key: 'improvementExecution',
                ...sixMetricBilingualLabels[4],
                value: clampMetric(normalizedScoreBreakdown.improvementExecution, sixMetricBilingualLabels[4].max),
            },
            {
                key: 'repeatViolationPenalty',
                ...sixMetricBilingualLabels[5],
                value: clampMetric(normalizedScoreBreakdown.repeatViolationPenalty, sixMetricBilingualLabels[5].max),
            },
        ],
        [normalizedScoreBreakdown, sixMetricBilingualLabels],
    );
    const workerNameClassName = useMemo(() => {
        const nameLength = (record.name || '').trim().length;

        if (nameLength >= 18) return 'text-[18px] leading-[1.08]';
        if (nameLength >= 14) return 'text-[20px] leading-[1.06]';
        if (nameLength >= 10) return 'text-[22px] leading-[1.04]';
        return 'text-[24px] leading-[1.02]';
    }, [record.name]);
    const nativeJobField = useMemo(
        () => getNativeJobFieldLabel(record.jobField, languagePolicy),
        [languagePolicy, record.jobField],
    );
    const nativeSafetyLevel = useMemo(
        () => getNativeSafetyLevelLabel(record.safetyLevel, languagePolicy),
        [languagePolicy, record.safetyLevel],
    );
    const radarAxisLabels = useMemo(
        () => languagePolicy.metrics.map((_, index) => String(index + 1)),
        [languagePolicy.metrics],
    );
    const reportHistory = useMemo(() => {
        const source = history.length > 0 ? history : [record];
        return [...source].sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    }, [history, record]);
    const assessmentMonthCount = useMemo(
        () => new Set(reportHistory.map((item) => String(item.date || '').slice(0, 7)).filter(Boolean)).size,
        [reportHistory],
    );
    const assessmentPeriod = useMemo(() => {
        const first = reportHistory[0]?.date || record.date;
        const last = reportHistory[reportHistory.length - 1]?.date || record.date;
        return first === last ? formatDate(last) : `${formatDate(first)} - ${formatDate(last)}`;
    }, [record.date, reportHistory]);
    const documentId = useMemo(() => {
        const dateKey = String(record.date || '').replace(/\D/g, '').slice(0, 8) || '00000000';
        return `PSI-${dateKey}-${stableWorkerHash(getWorkerIdentityKey(record)).slice(0, 8)}`;
    }, [record]);

    const getProfileImage = () => {
        if (record.profileImage && record.profileImage.length > 50) {
            return record.profileImage.startsWith('data:') ? record.profileImage : `data:image/jpeg;base64,${record.profileImage}`;
        }
        return null;
    };
    
    const getOriginalImage = () => (record.originalImage && record.originalImage.length > 50) ? (record.originalImage.startsWith('data:') ? record.originalImage : `data:image/jpeg;base64,${record.originalImage}`) : null;

    return (
        <div ref={ref} data-report-template-root="true" className="w-[210mm] flex flex-col gap-0 text-slate-900 print:w-full" style={{ fontFamily: languagePolicy.fontFamily }}>
            <div data-report-page="true" lang={languagePolicy.locale} className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full break-after-page">
                <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
                    <div className="w-[150%] h-[150%] -rotate-12 flex flex-wrap content-center justify-center gap-24 select-none">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="text-4xl font-black text-slate-900 whitespace-nowrap">PSI · {labels.officialRecord}</div>
                        ))}
                    </div>
                </div>

                <div className="absolute inset-0 m-4 border-[2px] border-slate-800 z-10 pointer-events-none"></div>
                <div className="relative z-10 px-[11mm] py-[8.5mm] grid h-full grid-rows-[25mm_45mm_46mm_146mm_10mm] gap-2.5 overflow-hidden">
                    <div className="text-center shrink-0 h-[25mm] overflow-hidden">
                        <div className="flex justify-center mb-1">
                            <div className="w-9 h-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                <BrandPhilosophyLogo className="w-6 h-6" />
                            </div>
                        </div>
                        <p className="text-[7px] font-black uppercase tracking-[0.18em] text-indigo-600">{labels.officialRecord} · {labels.documentId} {documentId}</p>
                        <h1 className={`font-black text-slate-900 ${!isKorean ? 'text-[15px] leading-snug mt-1' : 'text-base leading-tight mt-0.5'}`}>{certificateTitleNative}</h1>
                        <p className="text-[8px] font-bold text-slate-500 tracking-[0.03em] break-keep mt-1.5">{monthlyEduNativeTitle}</p>
                    </div>

                    {isKorean ? (
                        <div className="grid h-[40mm] grid-cols-[20mm_minmax(0,1fr)_16mm_38mm] items-start gap-3 pb-2.5 border-b-2 border-slate-800 overflow-hidden">
                            <div className="w-[20mm] h-[28mm] bg-white border border-slate-200 p-0.5 shadow-sm shrink-0 overflow-hidden flex items-center justify-center cursor-pointer" onClick={onPhotoClick}>
                                {getProfileImage() ? (
                                    <img src={getProfileImage()!} className="w-full h-full object-cover" alt={labels.workerInfo} />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 text-xs text-center">
                                        <PhotoPlaceholderIcon />
                                        <span className="text-[9px]">{isKorean ? '사진' : 'ID'}</span>
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 pt-0.5">
                                <h2 className={`${workerNameClassName} font-black text-slate-900 mb-1.5 break-keep`}>{record.name}</h2>
                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded">{record.nationality}</span>
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-bold rounded">{record.jobField}</span>
                                    {record.role === 'leader' && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[9px] font-black rounded">팀장</span>}
                                </div>
                                <div className="space-y-0.5">
                                    <p className="text-[9px] text-slate-400 font-medium leading-tight">교육일: {formatDate(record.date)}</p>
                                    {record.teamLeader && <p className="text-[9px] text-slate-400 font-medium leading-tight">팀장: {record.teamLeader}</p>}
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-start gap-1 pt-0.5 overflow-hidden">
                                <div className={`relative w-[15mm] h-[15mm] flex items-center justify-center rounded-full border-[3px] shadow-md ${record.safetyLevel === '고급' ? 'bg-emerald-50 border-emerald-400' : record.safetyLevel === '중급' ? 'bg-amber-50 border-amber-400' : 'bg-rose-50 border-rose-400'}`}>
                                    <span className={`text-[22px] font-black tracking-tighter ${record.safetyLevel === '고급' ? 'text-emerald-700' : record.safetyLevel === '중급' ? 'text-amber-700' : 'text-rose-700'}`}>
                                        {record.safetyScore}
                                    </span>
                                </div>
                                <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${record.safetyLevel === '고급' ? 'bg-emerald-100 text-emerald-800' : record.safetyLevel === '중급' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                    {record.safetyLevel}
                                </span>
                            </div>

                            <div data-report-chart-box="true" className="flex h-[38mm] w-[38mm] shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-300 bg-white px-1 py-1 shadow-sm overflow-hidden">
                                <div className="w-[34mm] h-[30mm] overflow-hidden">
                                    <IndividualRadarChart record={record} />
                                </div>
                                <span className="mt-0.5 text-[7px] font-black text-slate-500 tracking-[0.12em] uppercase">6대 지표</span>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-[19mm_minmax(0,1fr)_63mm] items-start gap-3 pb-2.5 border-b-2 border-slate-800 min-h-[38mm] overflow-hidden">
                            <div className="w-[19mm] h-[27mm] bg-white border border-slate-200 p-0.5 shadow-sm shrink-0 overflow-hidden flex items-center justify-center cursor-pointer" onClick={onPhotoClick}>
                                {getProfileImage() ? (
                                    <img src={getProfileImage()!} className="w-full h-full object-cover" alt={labels.workerInfo} />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 text-xs text-center">
                                        <PhotoPlaceholderIcon />
                                        <span className="text-[9px]">{isKorean ? '사진' : 'ID'}</span>
                                    </div>
                                )}
                            </div>

                            <div className="min-w-0 pt-0.5">
                                <div className="min-w-0 max-w-[78mm]">
                                    <h2 className={`${workerNameClassName} font-black text-slate-900 mb-1.5 break-keep`}>{record.name}</h2>
                                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[9px] font-bold rounded">{languagePolicy.countryName}</span>
                                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[9px] font-bold rounded">{nativeJobField}</span>
                                    </div>
                                    <div className="space-y-0.5">
                                        <p className="text-[9px] text-slate-500 font-bold leading-tight">{labels.educationDate}: {formatDate(record.date)}</p>
                                        <p className="text-[8px] text-slate-400 font-medium leading-tight">{labels.assessmentPeriod}: {assessmentPeriod}</p>
                                        <p className="text-[8px] text-slate-400 font-medium leading-tight">{labels.recordCount}: {reportHistory.length} · {labels.monthCount}: {assessmentMonthCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start justify-between gap-1.5 shrink-0 self-start">
                                <div className="flex flex-col items-center justify-start gap-1 min-w-[68px] pt-0.5">
                                    <div className={`relative w-[17mm] h-[17mm] flex items-center justify-center rounded-full border-[3px] shadow-md ${record.safetyLevel === '고급' ? 'bg-emerald-50 border-emerald-400' : record.safetyLevel === '중급' ? 'bg-amber-50 border-amber-400' : 'bg-rose-50 border-rose-400'}`}>
                                        <span className={`text-[27px] font-black tracking-tighter ${record.safetyLevel === '고급' ? 'text-emerald-700' : record.safetyLevel === '중급' ? 'text-amber-700' : 'text-rose-700'}`}>
                                            {record.safetyScore}
                                        </span>
                                    </div>
                                    <span className="text-[8px] font-black text-slate-400 tracking-[0.08em]">{labels.totalScore}</span>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${record.safetyLevel === '고급' ? 'bg-emerald-100 text-emerald-800' : record.safetyLevel === '중급' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                        {nativeSafetyLevel}
                                    </span>
                                    <span className="text-[7px] font-bold text-slate-400 text-center leading-tight">
                                        {labels.scoreStandard}: {labels.advanced}≥{safetyLevelThresholds.advancedMin} / {labels.intermediate}≥{safetyLevelThresholds.intermediateMin}
                                    </span>
                                </div>
                                <div data-report-chart-box="true" className="flex h-[42mm] w-[40mm] shrink-0 flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-1 py-1 shadow-sm overflow-hidden">
                                    <div className="w-[36mm] h-[34mm] overflow-hidden">
                                        <IndividualRadarChart record={record} labels={radarAxisLabels} />
                                    </div>
                                    <span className="mt-0.5 text-[8px] font-black text-slate-500 tracking-[0.08em]">{labels.qualityBasis}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {isKorean ? (
                        <div className="grid h-[46mm] grid-cols-[1fr_1fr] gap-2.5 overflow-hidden">
                            <div className="flex h-[46mm] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                                <p className="text-[10px] font-black leading-none text-slate-700 mb-1.5 flex items-center gap-1">
                                    <SectionSearchIcon /> 핵심 응답품질 요약
                                </p>
                                {frontScoreReasonEntries.length > 0 ? (
                                    <ul className="space-y-1 overflow-hidden text-[9px] leading-[1.35] text-slate-700">
                                        {frontScoreReasonEntries.map((entry, i) => (
                                            <li key={`score-reason-ko-${i}`} className="flex items-start gap-1">
                                                <span className="mt-[2px] text-slate-400">•</span>
                                                <span className="break-words"><HighlightedText text={entry.text} /></span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-[9px] text-slate-400 italic">품질 판단 근거 없음</p>
                                )}
                                <p className="mt-auto pt-1.5 text-[7px] text-slate-400 leading-tight border-t border-slate-200">
                                    상세 지표 막대 해설은 후면 부록에서 확인합니다.
                                </p>
                            </div>

                            <div className="flex h-[46mm] flex-col overflow-hidden rounded-xl border border-amber-300 bg-amber-50 p-3 shadow-sm">
                                <p className="text-[10px] font-black text-amber-800 leading-none mb-1.5 flex items-center gap-1">
                                    <SectionCoachingIcon /> 다음번엔 이렇게 작성해 보세요!
                                </p>
                                <ul className="space-y-1 overflow-hidden text-[8.5px] leading-[1.35] text-amber-900">
                                    {frontCoachingSummaryParagraphs.map((paragraph, index) => (
                                        <li key={`coaching-summary-ko-${index}`} className="flex items-start gap-1">
                                            <span className="mt-[2px] text-amber-500">•</span>
                                            <span><HighlightedText text={paragraph} /></span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    ) : (
                        <div className="grid h-[46mm] grid-cols-2 gap-2.5 overflow-hidden">
                            <div className="flex h-[46mm] flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                                <p className="text-[10px] font-black leading-none text-slate-700 mb-1.5 flex items-center gap-1">
                                    <SectionSearchIcon /> {labels.qualityBasis}
                                </p>
                                {frontScoreReasonEntries.length > 0 ? (
                                    <ul className="space-y-1 overflow-hidden">
                                        {frontScoreReasonEntries.map((entry, i) => (
                                            <li key={`score-reason-${i}`} className="flex items-start gap-1 text-[8.5px] leading-[1.35] text-slate-700">
                                                <span className="mt-[2px] text-slate-400">•</span>
                                                <div className="min-w-0 flex-1">
                                                    <p className={`break-words ${!isKorean ? 'leading-[1.5] text-[8px]' : 'leading-[1.3] text-[8.5px]'}`}>
                                                        <HighlightedText text={entry.nativeText || entry.text} />
                                                    </p>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p className="text-[10px] text-slate-400 italic">{labels.noQualityBasis}</p>
                                )}
                                <p className="mt-1 text-[7px] text-slate-400 leading-tight border-t border-slate-200 pt-1.5">
                                    {labels.metricDetailHint}
                                </p>
                            </div>

                            <div className="flex h-[46mm] flex-col overflow-hidden rounded-xl border-2 border-amber-300 bg-amber-50 p-3 shadow-sm">
                                <div className="mb-1.5">
                                    <p className="text-[10px] font-black text-amber-800 leading-none flex items-center gap-1">
                                        <SectionCoachingIcon /> {labels.coaching}
                                    </p>
                                </div>
                                <ul className="space-y-1 overflow-hidden text-[8.5px] leading-[1.35] text-amber-900">
                                    {frontCoachingSummaryParagraphs.map((paragraph, index) => (
                                        <li key={`coaching-summary-${index}`} className="flex items-start gap-1">
                                            <span className="mt-[2px] text-amber-500">•</span>
                                            <div className="min-w-0 flex-1">
                                                <p className={!isKorean ? 'leading-[1.5]' : ''}><HighlightedText text={paragraph} /></p>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                    )}

                    {isKorean ? (
                        <div className="grid h-[146mm] grid-rows-[minmax(0,1fr)_20mm] gap-2.5 overflow-hidden">
                            <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[58mm_minmax(0,1fr)] gap-2.5 overflow-hidden">
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-2.5 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
                                    <h3 className="font-bold text-[10px] mb-1.5 text-slate-700 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                        {labels.strengths}
                                    </h3>
                                    <ul className="space-y-1 overflow-hidden">
                                        {frontStrengthEntries.map((entry, i) => (
                                            <li key={`strength-ko-${i}`} className="text-[9px] leading-[1.35] text-slate-800 flex items-start gap-1 min-w-0">
                                                <CheckBulletIcon />
                                                <span className="min-w-0 break-words leading-[1.35]" ><HighlightedText text={entry.text} /></span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="rounded-xl border border-rose-100 bg-rose-50 p-2.5 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
                                    <h3 className="font-bold text-[10px] mb-1.5 text-rose-800 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                        {labels.weaknesses}
                                    </h3>
                                    <ul className="space-y-1 overflow-hidden">
                                        {frontImprovementEntries.map((entry, i) => (
                                            <li key={`improvement-ko-${i}`} className="text-[9px] leading-[1.35] text-rose-900 flex items-start gap-1 min-w-0">
                                                <WarningBulletIcon />
                                                <span className="min-w-0 break-words leading-[1.35]" ><HighlightedText text={entry.text} /></span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
                                    <h3 className="font-bold text-[10px] mb-1.5 text-slate-700 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-800 shrink-0"></span>
                                        {labels.verdict}
                                    </h3>
                                    <p className="text-[8.5px] leading-relaxed text-slate-800 overflow-hidden whitespace-pre-line">
                                        <HighlightedText text={frontVerdictPrimaryText} />
                                    </p>
                                    <NextActionChecklist
                                        title="현장 실천 체크"
                                        items={frontImprovementEntries.slice(0, 2).map((entry, i) => ({
                                            key: `action-ko-${i}`,
                                            content: <span ><HighlightedText text={entry.text} /></span>,
                                        }))}
                                    />
                                    {reassessmentTrail.length > 0 && (
                                        <div className="mt-1 pt-1 border-t border-slate-100 overflow-hidden">
                                            {reassessmentTrail.slice(0, 1).map((entry, i) => (
                                                <p key={`${entry.timestamp}-${i}`} className="text-[8px] text-violet-700 leading-tight">
                                                    • {reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)} {sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="grid min-h-0 h-full gap-2.5 grid-rows-[25mm_minmax(0,1fr)]">
                                    <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm overflow-hidden flex flex-col h-full min-h-0">
                                        <h4 className="text-[8px] font-bold text-slate-400 uppercase mb-1">{labels.trend} · {labels.sixMonths}</h4>
                                        <div className="flex-1 w-full relative min-h-0">
                                            <TrendMiniChart history={history} record={record} />
                                        </div>
                                    </div>

                                    <div className="rounded-xl border-2 border-slate-100 bg-white p-2 shadow-sm overflow-hidden flex flex-col min-h-0 h-full">
                                        <h3 className="font-bold text-[8px] mb-1.5 text-slate-800 uppercase tracking-wide flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"></span>
                                            {labels.pictogram}
                                        </h3>
                                        <div className="grid h-full min-h-0 grid-cols-2 gap-1.5">
                                            {safetySigns.map((sign, i) => (
                                                <div key={i} className="border border-slate-200 rounded bg-slate-50 flex flex-col items-center justify-center p-1 text-center relative overflow-hidden min-h-0">
                                                    <div className="flex h-10 w-10 items-center justify-center mb-0.5 shrink-0">
                                                        <svg viewBox="0 0 100 100" className="block w-full h-full drop-shadow-sm">
                                                            {sign.icon}
                                                        </svg>
                                                    </div>
                                                    <p className="text-[7px] font-black text-slate-900 leading-tight break-keep">{sign.labels.ko}</p>
                                                    <p className="text-[5.5px] text-rose-500 font-bold mt-0.5 truncate leading-none">
                                                        [연계위험] {getMatchedRiskKeyword(sign, record.weakAreas || [], record.jobField || '', record.nationality, record.language)}
                                                    </p>
                                                    <div className={`absolute top-0 right-0 w-2 h-2 ${sign.type === 'warning' ? 'bg-yellow-400' : 'bg-blue-600'} rounded-bl`}></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="border border-slate-200 rounded-xl bg-slate-50 px-2 py-1.5 relative overflow-hidden flex items-center justify-center h-[20mm] min-h-[20mm] shrink-0">
                                <p className="absolute top-1.5 left-2 text-[8px] font-bold text-slate-400 uppercase z-10">{labels.original}</p>
                                <div className="w-full h-full pt-3 flex items-center justify-center overflow-hidden">
                                    {getOriginalImage() ? (
                                        <img src={getOriginalImage()!} className="block max-w-full max-h-full object-contain mix-blend-multiply" alt={isMyanmar ? 'လက်ရေး မူရင်း မှတ်တမ်း' : '수기 원본 기록'} />
                                    ) : (
                                        <div className="text-[10px] text-slate-300">이미지 없음</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="min-h-0 h-full">
                            <div className="grid h-[146mm] min-h-0 grid-cols-2 grid-rows-[58mm_minmax(0,1fr)] items-stretch gap-2.5 overflow-hidden">
                                <div className="h-full min-h-0 bg-slate-50 rounded-xl border border-slate-100 p-2.5 shadow-sm overflow-hidden flex flex-col">
                                    <h3 className="font-bold text-[10px] mb-2 text-slate-700 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                        {labels.strengths}
                                    </h3>
                                    <ul className="space-y-1 overflow-hidden">
                                        {frontStrengthEntries.map((entry, i) => (
                                            <li key={`strength-${i}`}>
                                                <div className="text-[8.5px] leading-[1.35] text-slate-800 flex items-start gap-1 min-w-0">
                                                    <CheckBulletIcon className="text-emerald-600" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="break-words font-bold leading-[1.35]" >
                                                            <HighlightedText text={entry.nativeText || entry.text} />
                                                        </p>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="h-full min-h-0 bg-rose-50 rounded-xl border border-rose-100 shadow-sm flex flex-col overflow-hidden p-2.5">
                                    <h3 className={`font-bold text-[10px] text-rose-800 flex items-center gap-1.5 ${isWeaknessContentDense ? 'mb-1.5' : 'mb-2'}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                        {labels.weaknesses}
                                    </h3>
                                    <ul className="space-y-1 overflow-hidden">
                                        {frontImprovementEntries.map((entry, i) => (
                                            <li key={`improvement-${i}`}>
                                                <div className="text-[8.5px] leading-[1.35] text-rose-900 flex items-start gap-1 min-w-0">
                                                    <WarningBulletIcon />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="break-words font-bold leading-[1.35]" >
                                                            <HighlightedText text={entry.nativeText || entry.text} />
                                                        </p>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>

                                <div className="min-h-0 h-full bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col p-2.5">
                                    <h3 className={`font-bold text-[10px] text-slate-700 flex items-center gap-1.5 ${isWeaknessContentDense ? 'mb-1.5' : 'mb-2'}`}>
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-800 shrink-0"></span>
                                        {labels.verdict}
                                    </h3>
                                    <p className="text-[8.5px] leading-relaxed text-slate-800 overflow-hidden whitespace-pre-line">
                                        <HighlightedText text={frontVerdictPrimaryText} />
                                    </p>
                                    <NextActionChecklist
                                        title={labels.actionChecklist}
                                        items={frontImprovementEntries.slice(0, 2).map((entry, i) => ({
                                            key: `action-${i}`,
                                            content: <span ><HighlightedText text={entry.nativeText || entry.text} /></span>,
                                        }))}
                                    />
                                    {reassessmentTrail.length > 0 && (
                                        <div className="mt-1 pt-1 border-t border-slate-100 overflow-hidden">
                                            {reassessmentTrail.slice(0, 1).map((entry, i) => (
                                                <p key={`${entry.timestamp}-${i}`} className="text-[8px] text-violet-700 leading-tight">
                                                    • {reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)} {sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)}
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="min-h-0 h-full grid gap-2.5 grid-rows-[25mm_minmax(0,1fr)]">
                                    <div className="border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col overflow-hidden p-2 h-full min-h-0">
                                        <h4 className="text-[8px] font-bold text-slate-400 mb-1">{labels.trend} · {labels.sixMonths}</h4>
                                        <div className="flex-1 w-full relative min-h-0">
                                            <TrendMiniChart history={history} record={record} />
                                        </div>
                                    </div>
                                    <div className="min-h-0 h-full border-2 border-slate-100 rounded-xl bg-white shadow-sm flex flex-col overflow-hidden p-2">
                                        <h3 className="font-bold text-[8px] mb-1.5 text-slate-800 uppercase tracking-wide flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"></span>
                                            {labels.pictogram}
                                        </h3>
                                        <div className="grid flex-1 min-h-0 grid-cols-2 items-stretch gap-1.5">
                                            {safetySigns.map((sign, i) => (
                                                <div key={i} className="border border-slate-200 rounded bg-slate-50 h-full min-h-0 flex flex-col items-center justify-center p-1 text-center relative overflow-hidden">
                                                    <div className="flex h-10 w-10 items-center justify-center mb-0.5 shrink-0">
                                                        <svg viewBox="0 0 100 100" className="block w-full h-full drop-shadow-sm">
                                                            {sign.icon}
                                                        </svg>
                                                    </div>
                                                    <p className="text-[6.8px] font-black text-slate-900 leading-tight break-keep">{getSignLabel(sign, record.nationality, record.language)}</p>
                                                    <p className="text-[5.5px] text-rose-500 font-bold mt-0.5 truncate leading-none">
                                                        {getReportLanguagePolicy(record.nationality, record.language).code === 'my' ? '[ဆက်စပ်အန္တရာယ်] ' : '[Risk] '}
                                                        {getMatchedRiskKeyword(sign, record.weakAreas || [], record.jobField || '', record.nationality, record.language)}
                                                    </p>
                                                    <div className={`absolute top-0 right-0 w-2 h-2 ${sign.type === 'warning' ? 'bg-yellow-400' : 'bg-blue-600'} rounded-bl`}></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="pt-1.5 border-t-2 border-slate-900 shrink-0 flex justify-between items-end">
                        <div className="max-w-[105mm]">
                            <div className="text-[7.5px] font-black text-slate-600">{labels.officialFooter} · {PSI_APP_VERSION}</div>
                            <div className="mt-0.5 text-[5.8px] font-semibold leading-tight text-slate-400">{labels.scopeText}</div>
                        </div>
                        <div className="flex gap-8 text-center">
                            <div className="text-[8px] font-bold">{labels.safetyManager}<br/><span className="text-[7px] text-slate-500">{isKorean ? '박 성 훈' : 'PARK SEONG HUN'}</span></div>
                            <div className="text-[8px] font-bold">{labels.siteManager}<br/><span className="text-[7px] text-slate-500">{isKorean ? '정 용 현' : 'JEONG YONG HYEON'}</span></div>
                        </div>
                    </div>
                </div>
            </div>

            {includeAdminAppendix && <div data-report-page="true" lang="ko-KR" className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full" style={{ fontFamily: "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
                <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_rgba(79,70,229,0.08),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.03),transparent_45%)]"></div>
                <div className="absolute inset-0 m-4 border border-slate-200 z-10 pointer-events-none"></div>
                <div className="relative z-10 px-[11mm] py-[9mm] flex h-full flex-col gap-2">

                    {/* ── 헤더 ─────────────────────────────────── */}
                    <div className="flex items-start justify-between gap-4 pb-2 border-b border-slate-200 shrink-0">
                        <div>
                            <StatusBadge variant="violetSoft" className="gap-2 px-3 py-1 text-[8px] uppercase tracking-[0.24em]">
                                {isKorean ? '공식 부록' : <span>공식 부록 · <span className="tracking-normal" style={{ letterSpacing: 'normal' }}>{appendixTitleNative}</span></span>}
                            </StatusBadge>
                            <h2 className="mt-1.5 text-[18px] font-black text-slate-900">상세 해석 및 실행 노트</h2>
                            {!isKorean && <p className="mt-0.5 text-[9px] font-black text-indigo-700 leading-relaxed" style={{ lineHeight: '1.45' }}>{appendixTitleNative}</p>}
                            <p className="mt-0.5 text-[9px] font-bold text-slate-500">줄임 표현된 핵심 문구의 상세 해설과 실행 지침을 정식 문서 형식으로 정리한 부록입니다.</p>
                        </div>
                        <div className="shrink-0 rounded-2xl border border-slate-200 bg-white/90 px-3.5 py-2.5 text-right shadow-sm backdrop-blur-sm">
                            <p className="text-[7.5px] font-black uppercase tracking-[0.22em] text-slate-400">{isKorean ? '근로자 정보' : <span>근로자 정보 · <span className="tracking-normal" style={{ letterSpacing: 'normal' }}>{workerInfoNative}</span></span>}</p>
                            <p className="mt-1 text-[16px] font-black text-slate-900">{record.name}</p>
                            <p className="text-[8.5px] font-bold text-slate-500">{record.nationality} · {record.jobField}</p>
                            <p className="text-[7.5px] text-slate-400">{isMyanmar ? 'ထုတ်ပေးသည့်နေ့' : '발행일'} {formatDate(record.date)}</p>
                        </div>
                    </div>

                    {/* ── 메인 레이아웃: 종적 3개 세션 (Row-based Flow) ── */}
                    <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                        
                        {/* [세션 1] AI 종합 안전 진단 (가로 전체) */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm shrink-0">
                            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2">
                                <h3 className="text-[9.5px] font-black tracking-[0.12em] text-slate-800 flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0"></span>
                                    {labels.verdict}
                                </h3>
                                <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[7px] font-black text-indigo-700">양면 연쇄 상세 해설</span>
                            </div>
                            <div className="space-y-1.5">
                                {!isKorean && verdictNativeParagraphs.length > 0 ? (
                                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                        <p className="text-[7.8px] font-bold leading-[1.6] text-slate-800 whitespace-pre-line">
                                            <HighlightedText text={verdictNativeParagraphs[0]} />
                                        </p>
                                    </div>
                                ) : null}
                                {verdictKoParagraphs.length > 0 ? (
                                    <div className={`rounded-xl border px-3 py-2 ${!isKorean && verdictNativeParagraphs.length > 0 ? 'border-slate-100 bg-slate-100/50' : 'border-slate-100 bg-slate-50'}`}>
                                        {verdictKoParagraphs.slice(0, 2).map((para, i) => (
                                            <p key={`verdict-detail-${i}`} className={`leading-[1.45] whitespace-pre-line break-words ${!isKorean && verdictNativeParagraphs.length > 0 ? 'text-[7.2px] text-slate-500 mt-1 first:mt-0' : 'text-[7.8px] text-slate-700'}`}>
                                                {!isKorean && verdictNativeParagraphs.length > 0 ? <span className="font-black text-slate-400">[KO] </span> : null}
                                                <HighlightedText text={para} />
                                            </p>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>

                        {/* [세션 2] 상세 품질 및 6대 지표 (좌우 분할) */}
                        <div className="grid grid-cols-[1.1fr_1fr] gap-2.5 min-h-0 h-[62mm] shrink-0">
                            {/* 좌측: 6대 지표 상세 */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col justify-between overflow-hidden">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2 shrink-0">
                                    <h4 className="text-[9.5px] font-black tracking-[0.1em] text-slate-800">6대 지표 상세</h4>
                                    <span className="text-[7px] font-bold text-slate-400">전면 레이더맵 대응 세부 점수</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-2 flex-1 items-center">
                                    {backSixMetricRows.map((metric) => {
                                        const ratio = metric.max > 0 ? metric.value / metric.max : 0;
                                        const barColor = metric.isPenalty ? 'bg-rose-400' : 'bg-indigo-500';
                                        const scoreText = metric.isPenalty ? `-${metric.value}` : `${metric.value}`;
                                        return (
                                            <div key={metric.key} className="min-w-0">
                                                <p className={`font-black text-slate-700 truncate block ${!isKorean ? 'text-[7.2px] leading-normal' : 'text-[7.5px] leading-tight'}`}>{isKorean ? metric.ko : metric.native}</p>
                                                <p className="text-[6.3px] text-slate-400 leading-tight truncate block">{isKorean ? '' : `[KO] ${metric.ko}`}</p>
                                                <div className="mt-1 flex items-center gap-1.5">
                                                    <div className="h-2 flex-1 rounded-full bg-slate-200 overflow-hidden">
                                                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                                                    </div>
                                                    <span className={`text-[7px] font-black ${metric.isPenalty ? 'text-rose-600' : 'text-indigo-700'}`}>{scoreText}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 우측: 상세 품질 판단 근거 */}
                            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-2 shrink-0">
                                    <h3 className="text-[9.5px] font-black tracking-[0.12em] text-slate-800 flex items-center gap-1.5">
                                        <SectionSearchIcon />
                                        상세 품질 판단 근거
                                    </h3>
                                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[7px] font-black text-slate-500">검증용 상세 기술</span>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
                                    {scoreReasonEntries.slice(0, 3).map((entry, i) => (
                                        <div key={`score-reason-back-${i}`} className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                                            {!isKorean && entry.nativeText ? (
                                                <p className="text-[7.5px] font-bold leading-[1.55] text-slate-700 break-words">{entry.nativeText}</p>
                                            ) : null}
                                            <p className={`leading-[1.4] break-words ${!isKorean && entry.nativeText ? 'text-[6.8px] text-slate-500 mt-1' : 'text-[7.5px] text-slate-700'}`}>
                                                {!isKorean && entry.nativeText ? <span className="font-black text-slate-300">[KO] </span> : null}
                                                <HighlightedText text={entry.text} />
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* [세션 3] 현장 지침 및 동적 역량 강점/개선 상세 (좌우 분할) */}
                        <div className="grid grid-cols-[1.1fr_1fr] gap-2.5 min-h-0 flex-1 overflow-hidden">
                            {/* 좌측: 실행 코칭 및 특별 권고사항 */}
                            <div className="rounded-2xl border border-amber-300 bg-amber-50/45 p-3 shadow-sm flex flex-col justify-between overflow-hidden">
                                <div className="flex items-center justify-between border-b border-amber-200 pb-1.5 mb-2 shrink-0">
                                    <h3 className="text-[9.5px] font-black tracking-[0.12em] text-amber-800 flex items-center gap-1.5">
                                        <SectionCoachingIcon />
                                        실행 코칭
                                    </h3>
                                    <span className="rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[7px] font-black text-amber-700">현장 실행 우선</span>
                                </div>
                                <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                                    {(coachingNativeParagraphs.length > 0 ? coachingNativeParagraphs : coachingKoParagraphs).slice(0, 2).map((para, i) => (
                                        <div key={`coaching-block-${i}`} className="rounded-xl border border-amber-200 bg-white/95 px-2.5 py-1.5">
                                            <p className="text-[7.5px] font-bold leading-[1.55] text-amber-900 whitespace-pre-line">
                                                <HighlightedText text={para} />
                                            </p>
                                            {!isKorean && coachingNativeParagraphs.length > 0 && coachingKoParagraphs[i] ? (
                                                <p className="mt-1 border-t border-amber-100 pt-1 text-[7px] text-amber-700 leading-[1.4]">
                                                    [KO] <HighlightedText text={coachingKoParagraphs[i]} />
                                                </p>
                                            ) : null}
                                        </div>
                                    ))}

                                    {reassessmentTrail.length > 0 && (
                                        <div className="rounded-xl border border-violet-200 bg-violet-50/90 px-2.5 py-1.5 space-y-1">
                                            <p className="text-[8.5px] font-black tracking-[0.1em] text-violet-700">{reassessmentTitle}</p>
                                            {reassessmentTrail.slice(0, 1).map((entry, i) => (
                                                <div key={`reassessment-inline-${i}`}>
                                                    <p className="text-[7.2px] font-black text-violet-600">{reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)}</p>
                                                    <p className="text-[7.2px] leading-[1.4] text-violet-800">{sanitizeOperationalNote(entry.note || reassessmentFallback, record.nationality)}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-white shrink-0">
                                    <p className="text-[8px] font-black tracking-[0.1em] text-slate-100">진위 확인 메모</p>
                                    <p className="mt-0.5 text-[7px] leading-[1.4] text-slate-200">본 부록은 첫 페이지 요약 문구의 맥락 해석을 보완하기 위한 정식 해설본입니다. 현장 관리자 설명·면담 기록과 함께 보관할 수 있습니다.</p>
                                </div>
                            </div>

                            {/* 우측: 역량 분석 및 현장 조치 상세 (강점/개선 결합 동적 카드) */}
                            <div className="rounded-2xl border border-slate-200 bg-slate-50/45 p-3 shadow-sm flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 mb-2 shrink-0">
                                    <h3 className="text-[9.5px] font-black tracking-[0.12em] text-slate-800 flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-800 shrink-0"></span>
                                        역량 분석 및 현장 조치 상세
                                    </h3>
                                    <span className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[7px] font-black text-slate-500">실시간 피드백</span>
                                </div>

                                <div className="flex-1 flex flex-col gap-2 overflow-y-auto custom-scrollbar pr-1">
                                    {/* 강점 상세 파트 */}
                                    {strengthEntries.length > 0 && (
                                        <div className="flex-1 min-h-0 border border-emerald-200 rounded-xl bg-emerald-50/30 p-2 flex flex-col">
                                            <h4 className="text-[8.5px] font-black text-emerald-800 fill-emerald-800 flex items-center gap-1 mb-1.5 shrink-0">
                                                <CheckBulletIcon className="text-emerald-700 w-3 h-3" />
                                                역량 강점
                                            </h4>
                                            <ul className="space-y-1.5 overflow-y-auto pr-0.5 flex-1 min-h-0 custom-scrollbar">
                                                {strengthEntries.slice(0, 3).map((entry, i) => (
                                                    <li key={`strength-detail-${i}`} className="rounded-lg border border-emerald-100 bg-white/90 px-2 py-1.5 shadow-sm">
                                                        {!isKorean && entry.nativeText ? (
                                                            <p className="text-[7.5px] font-bold leading-[1.5] text-emerald-950 break-words">{entry.nativeText}</p>
                                                        ) : null}
                                                        <p className={`leading-[1.4] break-words ${!isKorean && entry.nativeText ? 'text-[7px] text-emerald-700 mt-1' : 'text-[7.5px] text-emerald-900'}`}>
                                                            {!isKorean && entry.nativeText ? <span className="font-black text-emerald-300">[KO] </span> : null}
                                                            <HighlightedText text={entry.text} />
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}

                                    {/* 개선 포인트 상세 파트 */}
                                    {improvementEntries.length > 0 && (
                                        <div className="flex-1 min-h-0 border border-rose-200 rounded-xl bg-rose-50/30 p-2 flex flex-col">
                                            <h4 className="text-[8.5px] font-black text-rose-800 flex items-center gap-1 mb-1.5 shrink-0">
                                                <WarningBulletIcon />
                                                개선 권고 사항
                                            </h4>
                                            <ul className="space-y-1.5 overflow-y-auto pr-0.5 flex-1 min-h-0 custom-scrollbar">
                                                {improvementEntries.slice(0, 3).map((entry, i) => (
                                                    <li key={`improvement-detail-${i}`} className="rounded-lg border border-rose-100 bg-white/90 px-2 py-1.5 shadow-sm">
                                                        {!isKorean && entry.nativeText ? (
                                                            <p className="text-[7.5px] font-bold leading-[1.5] text-rose-950 break-words">{entry.nativeText}</p>
                                                        ) : null}
                                                        <p className={`leading-[1.4] break-words ${!isKorean && entry.nativeText ? 'text-[7px] text-rose-700 mt-1' : 'text-[7.5px] text-rose-900'}`}>
                                                            {!isKorean && entry.nativeText ? <span className="font-black text-rose-300">[KO] </span> : null}
                                                            <HighlightedText text={entry.text} />
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* ── 푸터 ───────────────────────────────────── */}
                    <div className="pt-1.5 border-t border-slate-200 shrink-0 flex justify-between items-end">
                        <div>
                            <p className="text-[7.5px] font-black tracking-[0.08em] text-slate-400">부록 안내</p>
                            <p className="text-[8px] font-bold text-slate-500">본 부록은 앞장 요약 문구의 상세 해설과 현장 실행 지침을 담은 정식 보조 문서입니다.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[7.5px] font-black tracking-[0.08em] text-slate-400">PSI 공식 발행</p>
                            <p className="text-[8.5px] font-bold text-slate-700">안전 인텔리전스 시스템 {PSI_APP_VERSION} · 상세 해설 부록</p>
                        </div>
                    </div>
                </div>
            </div>}
        </div>
    );
});
