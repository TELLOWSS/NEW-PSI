
import React, { useMemo } from 'react';
import type { SixMetricBreakdown, WorkerRecord } from '../types';
import { IndividualRadarChart } from './charts/IndividualRadarChart';
import { deriveCompetencyProfile } from '../utils/evidenceUtils';
import { getSafetyLevelThresholds } from '../utils/safetyLevelUtils';
import { BrandPhilosophyLogo } from './shared/BrandPhilosophyLogo';

interface ReportTemplateProps {
    record: WorkerRecord;
    history?: WorkerRecord[];
    onPhotoClick?: () => void;
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
        .filter((entry) => entry.stage !== 'ocr' || hasAuditSpecialSignal(normalizeNarrativeText(entry.note)))
        .slice(0, 2)
        .map((entry) => {
            const rawNote = normalizeNarrativeText(entry.note);
            const stageLabel = stageLabelMap[entry.stage] || entry.stage;
            const shortNote = rawNote.length > 64 ? `${rawNote.slice(0, 64)}…` : rawNote;
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
        <svg viewBox={`0 0 ${width} ${height}`} className="block h-full w-full" role="img" aria-label="6개월 안전 점수 추이">
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

export const ReportTemplate = React.forwardRef<HTMLDivElement, ReportTemplateProps>(({ record, history = [], onPhotoClick }, ref) => {
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
    const strengthEntries = useMemo(() => buildNarrativeEntries(record.strengths, record.strengths_native), [record.strengths, record.strengths_native]);
    const actionableCoachingText = useMemo(() => buildActionableCoachingText(record), [record]);
    const improvementEntries = useMemo(() => buildImprovementEntries(record), [record]);
    const improvementItems = useMemo(() => improvementEntries.map((entry) => entry.text), [improvementEntries]);
    const scoreReasonEntries = useMemo(() => buildScoreReasonEntries(record), [record]);
    const coachingKoParagraphs = useMemo(() => buildNarrativeParagraphs(actionableCoachingText), [actionableCoachingText]);
    const coachingNativeParagraphs = useMemo(() => buildNarrativeParagraphs(record.actionable_coaching_native), [record.actionable_coaching_native]);
    const verdictKoParagraphs = useMemo(() => buildNarrativeParagraphs(record.aiInsights), [record.aiInsights]);
    const verdictNativeParagraphs = useMemo(() => buildNarrativeParagraphs(record.aiInsights_native), [record.aiInsights_native]);
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
    const frontStrengthEntries = useMemo(
        () => strengthEntries.slice(0, 3).map((entry) => limitNarrativeEntry(entry, isWeaknessContentDense ? 46 : 58, isWeaknessContentDense ? 42 : 52)),
        [strengthEntries, isWeaknessContentDense],
    );
    const frontImprovementEntries = useMemo(
        () => improvementEntries.slice(0, 3).map((entry) => limitNarrativeEntry(entry, isWeaknessContentDense ? 48 : 60, isWeaknessContentDense ? 44 : 54)),
        [improvementEntries, isWeaknessContentDense],
    );
    const frontCoachingText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(actionableCoachingText, isWeaknessContentDense ? 120 : 155), isWeaknessContentDense ? 34 : 40),
        [actionableCoachingText, isWeaknessContentDense],
    );
    const frontCoachingNativeText = useMemo(
        () => coachingNativeParagraphs.length > 0 ? wrapNarrativeText(limitNarrativeText(coachingNativeParagraphs[0], isWeaknessContentDense ? 120 : 155), isWeaknessContentDense ? 34 : 40) : '',
        [coachingNativeParagraphs, isWeaknessContentDense],
    );
    const frontVerdictNativeText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(record.aiInsights_native, isWeaknessContentDense ? 118 : 150), narrativeWrapWidth.verdictNative),
        [record.aiInsights_native, isWeaknessContentDense, narrativeWrapWidth.verdictNative],
    );
    const frontVerdictKoText = useMemo(
        () => wrapNarrativeText(limitNarrativeText(record.aiInsights, isWeaknessContentDense ? 124 : 164), narrativeWrapWidth.verdictKo),
        [record.aiInsights, isWeaknessContentDense, narrativeWrapWidth.verdictKo],
    );

    const getProfileImage = () => {
        if (record.profileImage && record.profileImage.length > 50) {
            return record.profileImage.startsWith('data:') ? record.profileImage : `data:image/jpeg;base64,${record.profileImage}`;
        }
        return null;
    };
    
    const getOriginalImage = () => (record.originalImage && record.originalImage.length > 50) ? (record.originalImage.startsWith('data:') ? record.originalImage : `data:image/jpeg;base64,${record.originalImage}`) : null;

    return (
        <div ref={ref} data-report-template-root="true" className="w-[210mm] flex flex-col gap-0 text-slate-900 print:w-full">
            <div data-report-page="true" className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full break-after-page">
                <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-[0.03] overflow-hidden">
                    <div className="w-[150%] h-[150%] -rotate-12 flex flex-wrap content-center justify-center gap-24 select-none">
                        {Array.from({ length: 20 }).map((_, i) => (
                            <div key={i} className="text-4xl font-black text-slate-900 whitespace-nowrap">PSI OFFICIAL SAFETY RECORD</div>
                        ))}
                    </div>
                </div>

                <div className="absolute inset-0 m-4 border-[2px] border-slate-800 z-10 pointer-events-none"></div>
                <div className="relative z-10 px-[11mm] py-[8.5mm] flex h-full flex-col justify-between gap-2.5">
                    <div className="text-center shrink-0">
                        <div className="flex justify-center mb-1.5">
                            <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center">
                                <BrandPhilosophyLogo className="w-7 h-7" />
                            </div>
                        </div>
                        <h1 className="text-lg font-serif font-black text-slate-900 uppercase">Certificate of Safety Competence</h1>
                        <p className="text-[10px] font-bold text-slate-500 tracking-widest">{labels.cert}</p>
                    </div>

                    <div className="grid grid-cols-[minmax(0,1fr)_152px] items-center gap-2.5 pb-2.5 border-b-2 border-slate-800 shrink-0">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="w-[19mm] h-[27mm] bg-white border border-slate-200 p-0.5 shadow-sm shrink-0 overflow-hidden flex items-center justify-center cursor-pointer" onClick={onPhotoClick}>
                                {getProfileImage() ? (
                                    <img src={getProfileImage()!} className="w-full h-full object-cover" alt="Profile" />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-300 text-xs text-center">
                                        <PhotoPlaceholderIcon />
                                        <span className="text-[9px]">Photo</span>
                                    </div>
                                )}
                            </div>
                            <div className="min-w-0 max-w-[84mm]">
                                <h2 className="text-[25px] font-serif font-bold text-slate-900 leading-[1.03] mb-1.5 break-keep">{record.name}</h2>
                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-bold rounded">{record.nationality}</span>
                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded">{record.jobField}</span>
                                    {record.role === 'leader' && <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-[10px] font-black rounded">팀장</span>}
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">Date: {formatDate(record.date)}</p>
                                {record.teamLeader && <p className="text-[10px] text-slate-400 font-medium">팀장: {record.teamLeader}</p>}
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 shrink-0 self-stretch pl-1">
                            <div className="flex flex-col items-center justify-center gap-1 min-w-[74px]">
                                <div className={`relative w-[18mm] h-[18mm] flex items-center justify-center rounded-full border-[3px] shadow-md ${record.safetyLevel === '고급' ? 'bg-emerald-50 border-emerald-400' : record.safetyLevel === '중급' ? 'bg-amber-50 border-amber-400' : 'bg-rose-50 border-rose-400'}`}>
                                    <span className={`text-[29px] font-black tracking-tighter ${record.safetyLevel === '고급' ? 'text-emerald-700' : record.safetyLevel === '중급' ? 'text-amber-700' : 'text-rose-700'}`}>
                                        {record.safetyScore}
                                    </span>
                                </div>
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-[0.18em]">TOTAL SCORE</span>
                                <span className={`px-3 py-0.5 rounded-full text-[10px] font-black ${record.safetyLevel === '고급' ? 'bg-emerald-100 text-emerald-800' : record.safetyLevel === '중급' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}`}>
                                    {record.safetyLevel}
                                </span>
                                <span className="text-[7px] font-bold text-slate-400 text-center leading-tight">
                                    기준: 고급≥{safetyLevelThresholds.advancedMin} / 중급≥{safetyLevelThresholds.intermediateMin} / 초급&lt;{safetyLevelThresholds.intermediateMin}
                                </span>
                            </div>
                            <div data-report-chart-box="true" className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50/90 px-1 py-1.5 shadow-sm min-w-[44mm]">
                                <div className="w-[44mm] h-[44mm]">
                                    <IndividualRadarChart record={record} />
                                </div>
                                <span className="mt-1 text-[8px] font-black text-slate-500 tracking-[0.16em] uppercase">6 Metrics</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 shrink-0 min-h-[41mm]">
                        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl p-3 shadow-sm min-h-[41mm]">
                            <p className="text-[10px] font-black leading-none text-slate-700 mb-1.5 flex items-center gap-1">
                                <SectionSearchIcon /> 상세 채점 근거 (Score Reasoning)
                            </p>
                            {!isKorean && (
                                scoreReasonEntries[0]?.nativeText ? (
                                    <p className="text-[10px] leading-relaxed text-slate-800 font-bold mb-1">
                                        {scoreReasonEntries[0].nativeText}
                                    </p>
                                ) : (
                                    <p className="text-[9px] text-amber-600 italic mb-1">ℹ 모국어 번역 준비중 — 재분석 시 자동 생성됩니다.</p>
                                )
                            )}
                            {scoreReasonEntries.length > 0 && !isKorean && (
                                <div className="text-[8px] font-black text-slate-400 border-t border-slate-200 pt-1 mt-1 mb-0.5">[KO 관리자 확인용]</div>
                            )}
                            {scoreReasonEntries.length > 0 ? (
                                <ul className="space-y-0.5">
                                    {scoreReasonEntries.slice(0, 3).map((entry, i) => (
                                        <li key={`score-reason-${i}`} className={`leading-tight ${!isKorean ? 'text-[9px] text-slate-500' : 'text-[10px] text-slate-700'}`}>
                                            {!isKorean && <span className="text-[7px] font-black text-slate-300 mr-0.5">[KO]</span>}• <HighlightedText text={entry.text} />
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-[10px] text-slate-400 italic">채점 근거 없음</p>
                            )}
                            <div className="mt-2 pt-2 border-t border-slate-200 grid grid-cols-2 gap-x-3 gap-y-0.5">
                                {([
                                    ['①심리', competencyProfile.psychologicalScore, 100],
                                    ['②업무이해', competencyProfile.jobUnderstandingScore, 100],
                                    ['③위험평가', competencyProfile.riskAssessmentUnderstandingScore, 100],
                                    ['④숙련도', competencyProfile.proficiencyScore, 100],
                                    ['⑤개선이행', competencyProfile.improvementExecutionScore, 100],
                                    ['⑥패널티', competencyProfile.repeatViolationPenalty, 20, true],
                                ] as [string, number, number, boolean?][]).map(([label, rawVal, max, isPenalty]) => {
                                    const val = clampMetric(rawVal, max);
                                    return (
                                        <div key={label} className="flex items-center gap-1.5">
                                            <span className="text-[8px] font-bold text-slate-500 w-14 shrink-0">{label}</span>
                                            <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full ${isPenalty ? 'bg-rose-400' : 'bg-indigo-500'}`}
                                                    style={{ width: `${Math.min(100, (val / max) * 100)}%` }}
                                                />
                                            </div>
                                            <span className={`text-[8px] font-black w-10 text-right ${isPenalty ? 'text-rose-600' : 'text-indigo-700'}`}>{isPenalty ? `-${val}` : `${val}점`}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <p className="mt-1.5 text-[8px] text-slate-400 leading-tight">
                                기준 요약: ④숙련도는 검증 가능한 실무 행동 구체성, ⑤개선이행도는 실행 계획 명확성 중심 평가
                            </p>
                        </div>

                        <div className="flex-1 bg-amber-50 border-2 border-amber-300 rounded-xl p-3 shadow-sm flex flex-col min-h-[41mm]">
                            {!isKorean ? (
                                <div className="mb-1.5">
                                    <p className="text-[10px] font-black text-amber-800 leading-none flex items-center gap-1">
                                        <SectionCoachingIcon /> {coachingNativeParagraphs.length > 0 ? '⬇ 모국어 코칭 (아래 참조)' : '코칭 — 모국어 생성 대기'}
                                    </p>
                                    <p className="text-[8px] text-amber-600 font-bold">[KO] 다음번엔 이렇게 작성해 보세요!</p>
                                </div>
                            ) : (
                                <p className="text-[10px] font-black text-amber-800 leading-none mb-1.5 flex items-center gap-1">
                                    <SectionCoachingIcon /> 다음번엔 이렇게 작성해 보세요!
                                </p>
                            )}
                            {!isKorean && coachingNativeParagraphs.length > 0 ? (
                                <>
                                    <p className="text-[10px] leading-relaxed text-amber-900 font-bold flex-1">
                                        {frontCoachingNativeText}
                                    </p>
                                    <div className="mt-1.5 pt-1.5 border-t border-amber-300">
                                        <span className="text-[8px] font-black text-amber-600">[KO 관리자 확인용]</span>
                                        <p className="text-[9px] leading-relaxed text-amber-800 mt-0.5">
                                            <HighlightedText text={frontCoachingText} />
                                        </p>
                                    </div>
                                </>
                            ) : !isKorean ? (
                                <>
                                    <p className="text-[9px] text-amber-600 italic mb-1">ℹ 모국어 번역 준비중 — 재분석 시 자동 생성됩니다.</p>
                                    <p className="text-[9px] leading-relaxed text-amber-800 flex-1">
                                        <span className="text-[8px] font-black text-amber-500 mr-1">[KO]</span>
                                        <HighlightedText text={frontCoachingText} />
                                    </p>
                                </>
                            ) : (
                                <p className="text-[10px] leading-relaxed text-amber-900 flex-1">
                                    <HighlightedText text={frontCoachingText} />
                                </p>
                            )}
                        </div>
                    </div>

                    <div className={`flex-1 min-h-0 ${isKorean ? 'grid grid-rows-[minmax(0,1fr)_68px] gap-2.5' : ''}`}>
                        <div className="grid h-full min-h-0 grid-cols-4 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] items-stretch gap-2.5">
                        <div className="col-span-2 row-span-1 h-full min-h-0 bg-slate-50 rounded-xl border border-slate-100 p-3 shadow-sm overflow-hidden flex flex-col">
                            <h3 className="font-bold text-[10px] mb-2 text-slate-700 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                {labels.strengths}
                            </h3>
                            <ul className="space-y-1">
                                {frontStrengthEntries.map((entry, i) => (
                                    <li key={`strength-${i}`}>
                                        {!isKorean && entry.nativeText ? (
                                            <div className="text-[9px] leading-[1.35] text-slate-800 flex items-start gap-1 min-w-0">
                                                <CheckBulletIcon className="text-emerald-600" />
                                                <span className="min-w-0 break-words font-bold leading-[1.35]">{entry.nativeText}</span>
                                                <span className="text-[7px] font-black text-slate-300">| KO</span>
                                                <span className="min-w-0 break-words text-slate-500 leading-[1.35]">{entry.text}</span>
                                            </div>
                                        ) : (
                                            <div className="text-[9px] leading-[1.35] text-slate-800 flex items-start gap-1 min-w-0">
                                                <CheckBulletIcon />
                                                <span className="min-w-0 break-words leading-[1.35]"><HighlightedText text={entry.text} /></span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={`col-span-2 row-span-1 h-full min-h-0 bg-rose-50 rounded-xl border border-rose-100 shadow-sm flex flex-col ${isWeaknessContentDense ? 'p-2.5' : 'p-3'}`}>
                            <h3 className={`font-bold text-[10px] text-rose-800 flex items-center gap-1.5 ${isWeaknessContentDense ? 'mb-1.5' : 'mb-2'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
                                {labels.weaknesses}
                            </h3>
                            <ul className="space-y-1">
                                {frontImprovementEntries.map((entry, i) => (
                                    <li key={`improvement-${i}`}>
                                        {!isKorean && entry.nativeText ? (
                                            <div className={`text-rose-900 flex items-start gap-1 min-w-0 ${isWeaknessContentDense ? 'text-[8px] leading-[1.35]' : 'text-[9px] leading-[1.35]'}`}>
                                                <WarningBulletIcon />
                                                <span className="min-w-0 break-words font-bold leading-[1.35]">{entry.nativeText}</span>
                                                <span className="text-[7px] font-black text-rose-400">| KO</span>
                                                <span className="min-w-0 break-words text-rose-700/70 leading-[1.35]">{entry.text}</span>
                                            </div>
                                        ) : (
                                            <div className={`text-rose-900 flex items-start gap-1 min-w-0 ${isWeaknessContentDense ? 'text-[8px] leading-[1.35]' : 'text-[9px] leading-[1.35]'}`}>
                                                <WarningBulletIcon />
                                                <span className="min-w-0 break-words leading-[1.35]"><HighlightedText text={entry.text} /></span>
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div className={`col-span-2 row-span-1 min-h-0 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col ${isWeaknessContentDense ? 'p-2.5' : 'p-3'}`}>
                            <h3 className={`font-bold text-[10px] text-slate-700 flex items-center gap-1.5 ${isWeaknessContentDense ? 'mb-1.5' : 'mb-2'}`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-800 shrink-0"></span>
                                {labels.verdict}
                            </h3>
                            {!isKorean && record.aiInsights_native && (
                                <p className="text-[10px] leading-relaxed text-slate-800 font-bold flex-1 overflow-hidden whitespace-pre-line">
                                    {frontVerdictNativeText}
                                </p>
                            )}
                            <p className={`leading-relaxed overflow-hidden whitespace-pre-line ${!isKorean && record.aiInsights_native ? 'text-[9px] text-slate-400 mt-1 pt-1 border-t border-slate-100' : 'text-[10px] text-slate-800 flex-1'}`}>
                                {!isKorean && record.aiInsights_native && <span className="text-[8px] font-black text-slate-300 mr-1">[KO]</span>}
                                <HighlightedText text={frontVerdictKoText} />
                            </p>
                            {reassessmentTrail.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-slate-100">
                                    {reassessmentTrail.map((entry, i) => (
                                        <p key={`${entry.timestamp}-${i}`} className="text-[9px] text-violet-700 leading-tight">
                                            • {reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)} {entry.note || reassessmentFallback}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={`col-span-2 row-span-1 h-full min-h-0 flex flex-col ${isWeaknessContentDense ? 'gap-1.5' : 'gap-2'}`}>
                            <div className={`flex-1 border border-slate-200 rounded-xl bg-white shadow-sm flex flex-col min-h-0 ${isWeaknessContentDense ? 'p-1.5' : 'p-2'}`}>
                                <h4 className="text-[8px] font-bold text-slate-400 uppercase mb-1">{labels.trends} (6M)</h4>
                                <div className="flex-1 w-full relative min-h-0">
                                    <TrendMiniChart history={history} record={record} />
                                </div>
                            </div>
                            <div className={`flex-1 min-h-0 border-2 border-slate-100 rounded-xl bg-white shadow-sm flex flex-col ${isWeaknessContentDense ? 'p-1.5' : 'p-2'}`}>
                                <h3 className="font-bold text-[8px] mb-1.5 text-slate-800 uppercase tracking-wide flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 shrink-0"></span>
                                    {labels.pictogram}
                                </h3>
                                <div className="grid flex-1 min-h-0 grid-cols-2 gap-1.5">
                                    {safetySigns.map((sign, i) => (
                                        <div key={i} className="border border-slate-200 rounded bg-slate-50 flex min-h-[68px] flex-col items-center justify-center p-1.5 text-center relative overflow-hidden">
                                            <div className="flex h-10 w-10 items-center justify-center mb-1 shrink-0">
                                                <svg viewBox="0 0 100 100" className="block w-full h-full drop-shadow-sm">
                                                    {sign.icon}
                                                </svg>
                                            </div>
                                            <p className="text-[8px] font-black text-slate-900 leading-tight">{sign.labels.ko}</p>
                                            {!isKorean && <p className="text-[7px] font-bold text-slate-500 mt-0.5 leading-none">{getSignLabel(sign, record.nationality)}</p>}
                                            <div className={`absolute top-0 right-0 w-2 h-2 ${sign.type === 'warning' ? 'bg-yellow-400' : 'bg-blue-600'} rounded-bl`}></div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        </div>

                        {isKorean && (
                            <div className="border border-slate-200 rounded-xl bg-slate-50 px-2 py-1.5 relative overflow-hidden flex items-center justify-center h-[68px] min-h-[68px] shrink-0">
                                <p className="absolute top-1.5 left-2 text-[8px] font-bold text-slate-400 uppercase z-10">{labels.original}</p>
                                <div className="w-full h-full pt-3 flex items-center justify-center overflow-hidden">
                                    {getOriginalImage() ? (
                                        <img src={getOriginalImage()!} className="block max-w-full max-h-full object-contain mix-blend-multiply" alt="Original handwritten record" />
                                    ) : (
                                        <div className="text-[10px] text-slate-300">No Image</div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="pt-1.5 border-t-2 border-slate-900 shrink-0 flex justify-between items-end">
                        <div className="text-[8px] font-bold text-slate-400">PSI Safety Intelligence System v2.0.0 · 월간 안전보건정기교육</div>
                        <div className="flex gap-8 text-center">
                            <div className="text-[9px] font-bold">Safety Manager 박 성 훈</div>
                            <div className="text-[9px] font-bold">Site Manager 정 용 현</div>
                        </div>
                    </div>
                </div>
            </div>

            <div data-report-page="true" className="bg-white w-[210mm] h-[297mm] relative shadow-2xl overflow-hidden text-slate-900 flex flex-col print:shadow-none print:m-0 print:w-full">
                <div className="absolute inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_rgba(79,70,229,0.08),_transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.03),transparent_45%)]"></div>
                <div className="absolute inset-0 m-4 border border-slate-200 z-10 pointer-events-none"></div>
                <div className="relative z-10 px-[11mm] py-[9mm] flex h-full flex-col justify-between gap-2.5">
                    <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-200">
                        <div>
                            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[8px] font-black uppercase tracking-[0.24em] text-indigo-700">
                                Official Appendix
                            </div>
                            <h2 className="mt-2 text-[20px] font-serif font-black text-slate-900">Detailed Interpretation & Action Notes</h2>
                            <p className="mt-1 text-[10px] font-bold text-slate-500">줄임 표현된 핵심 문구의 상세 해설과 실행 지침을 정식 문서 형식으로 정리한 부록입니다.</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-right shadow-sm backdrop-blur-sm">
                            <p className="text-[8px] font-black uppercase tracking-[0.22em] text-slate-400">Worker Identity</p>
                            <p className="mt-1 text-lg font-serif font-bold text-slate-900">{record.name}</p>
                            <p className="text-[9px] font-bold text-slate-500">{record.nationality} · {record.jobField}</p>
                            <p className="text-[8px] text-slate-400">Issued {formatDate(record.date)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-12 auto-rows-fr gap-2.5 flex-1 min-h-0">
                        <section className="col-span-7 rounded-[18px] border border-slate-200 bg-white/95 p-3.5 shadow-sm min-h-0">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-700">Formal score reasoning</h3>
                                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[8px] font-black text-slate-500">검증용 상세 기술</span>
                            </div>
                            <div className="mt-3 space-y-1.5">
                                {scoreReasonEntries.length > 0 ? scoreReasonEntries.slice(0, 3).map((entry, index) => (
                                    <div key={`score-detail-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                                        {!isKorean && entry.nativeText && <p className="text-[8.5px] font-bold leading-[1.5] text-slate-800">{entry.nativeText}</p>}
                                        <p className={`leading-[1.5] ${!isKorean && entry.nativeText ? 'mt-1 border-t border-slate-200 pt-1 text-[8px] text-slate-500' : 'text-[8.5px] text-slate-700'}`}>
                                            {!isKorean && entry.nativeText && <span className="mr-1 text-[7px] font-black text-slate-300">[KO]</span>}
                                            <HighlightedText text={entry.text} />
                                        </p>
                                    </div>
                                )) : (
                                    <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-[9px] font-bold text-slate-400">상세 채점 근거 데이터가 아직 등록되지 않았습니다.</p>
                                )}
                            </div>

                            <div className="mt-2.5 rounded-[18px] border border-slate-200 bg-slate-50 px-3 py-3">
                                <div className="flex items-center justify-between gap-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700">Comprehensive diagnosis</h4>
                                    <span className="text-[8px] font-black text-slate-400">양면 인쇄 상세 해설</span>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                    {!isKorean && verdictNativeParagraphs.length > 0 && (
                                        <div className="rounded-xl bg-white px-3 py-2 text-[8.5px] font-bold leading-[1.5] text-slate-800 shadow-sm space-y-1">
                                            {verdictNativeParagraphs.slice(0, 3).map((paragraph, index) => <p key={`verdict-native-${index}`}>{paragraph}</p>)}
                                        </div>
                                    )}
                                    <div className={`rounded-xl px-3 py-2 leading-[1.5] space-y-1 ${!isKorean && verdictNativeParagraphs.length > 0 ? 'border border-slate-200 bg-slate-100/80 text-[8px] text-slate-600' : 'bg-white text-[8.5px] text-slate-700 shadow-sm'}`}>
                                        {!isKorean && verdictNativeParagraphs.length > 0 && <span className="mr-1 text-[7px] font-black text-slate-400">[KO]</span>}
                                        {verdictKoParagraphs.slice(0, 3).map((paragraph, index) => <p key={`verdict-ko-${index}`}><HighlightedText text={paragraph} /></p>)}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="col-span-5 rounded-[18px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,247,237,0.96))] p-3.5 shadow-sm min-h-0">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-900">Action coaching</h3>
                                <span className="rounded-full bg-white/80 px-2.5 py-1 text-[8px] font-black text-amber-700">현장 실행 우선</span>
                            </div>
                            <div className="mt-3 space-y-1.5">
                                {!isKorean && coachingNativeParagraphs.length > 0 && (
                                    <div className="rounded-2xl border border-amber-200 bg-white/90 px-3 py-2.5 text-[8.5px] font-bold leading-[1.5] text-amber-950 shadow-sm space-y-1">
                                        {coachingNativeParagraphs.slice(0, 3).map((paragraph, index) => <p key={`coaching-native-${index}`}>{paragraph}</p>)}
                                    </div>
                                )}
                                <div className={`rounded-2xl px-3 py-2.5 leading-[1.5] space-y-1 ${!isKorean && coachingNativeParagraphs.length > 0 ? 'border border-amber-200 bg-amber-100/70 text-[8px] text-amber-900' : 'bg-white/90 text-[8.5px] text-amber-950 shadow-sm'}`}>
                                    {!isKorean && coachingNativeParagraphs.length > 0 && <span className="mr-1 text-[7px] font-black text-amber-700">[KO]</span>}
                                    {coachingKoParagraphs.slice(0, 3).map((paragraph, index) => <p key={`coaching-ko-${index}`}><HighlightedText text={paragraph} /></p>)}
                                </div>
                            </div>

                            <div className="mt-2.5 rounded-[18px] border border-violet-200 bg-violet-50/90 px-3 py-3">
                                <h4 className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-800">Reassessment timeline</h4>
                                <div className="mt-2 space-y-1.5">
                                    {reassessmentTrail.length > 0 ? reassessmentTrail.slice(0, 3).map((entry, index) => (
                                        <div key={`appendix-trail-${entry.timestamp}-${index}`} className="rounded-xl border border-violet-100 bg-white/90 px-3 py-2">
                                            <p className="text-[8px] font-black text-violet-700">{reassessmentTag} {new Date(entry.timestamp).toLocaleDateString(timelineLocale, timelineDateOptions)}</p>
                                            <p className="mt-0.5 text-[8.5px] leading-relaxed text-violet-900">{entry.note || reassessmentFallback}</p>
                                        </div>
                                    )) : (
                                        <p className="text-[8.5px] font-bold text-violet-500">재평가 이력 없음</p>
                                    )}
                                </div>
                            </div>

                            <div className="mt-2.5 rounded-[18px] border border-slate-200 bg-slate-900 px-3 py-3 text-white shadow-sm">
                                <p className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-300">Authenticity note</p>
                                <p className="mt-1 text-[8.5px] leading-relaxed text-slate-100">본 부록은 첫 페이지 요약 문구의 축약 해석을 보완하기 위한 정식 해설본이며, 현장 관리자 설명·면담·재교육 기록과 함께 보관할 수 있습니다.</p>
                            </div>
                        </section>

                        <section className="col-span-6 rounded-[18px] border border-emerald-200 bg-emerald-50/80 p-3.5 shadow-sm min-h-0">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-900">Strength details</h3>
                                <span className="text-[8px] font-black text-emerald-700">강점 상세 표현</span>
                            </div>
                            <div className="mt-3 space-y-1.5">
                                {strengthEntries.length > 0 ? strengthEntries.slice(0, 3).map((entry, index) => (
                                    <div key={`strength-detail-${index}`} className="rounded-2xl border border-emerald-100 bg-white/90 px-3 py-2.5 shadow-sm">
                                        {!isKorean && entry.nativeText && <p className="text-[8.5px] font-bold leading-[1.5] text-emerald-950">{entry.nativeText}</p>}
                                        <p className={`leading-[1.5] ${!isKorean && entry.nativeText ? 'mt-1 border-t border-emerald-100 pt-1 text-[8px] text-emerald-900/80' : 'text-[8.5px] text-emerald-950'}`}>
                                            {!isKorean && entry.nativeText && <span className="mr-1 text-[7px] font-black text-emerald-600">[KO]</span>}
                                            <HighlightedText text={entry.text} />
                                        </p>
                                    </div>
                                )) : (
                                    <p className="rounded-2xl border border-dashed border-emerald-200 bg-white/80 px-3 py-3 text-[9px] font-bold text-emerald-500">강점 상세 데이터가 없습니다.</p>
                                )}
                            </div>
                        </section>

                        <section className="col-span-6 rounded-[18px] border border-rose-200 bg-rose-50/85 p-3.5 shadow-sm min-h-0">
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-rose-900">Focus area details</h3>
                                <span className="text-[8px] font-black text-rose-700">중복 검증 후 정리</span>
                            </div>
                            <div className="mt-3 space-y-1.5">
                                {improvementEntries.length > 0 ? improvementEntries.slice(0, 3).map((entry, index) => (
                                    <div key={`improvement-detail-${index}`} className="rounded-2xl border border-rose-100 bg-white/90 px-3 py-2.5 shadow-sm">
                                        {!isKorean && entry.nativeText && <p className="text-[8.5px] font-bold leading-[1.5] text-rose-950">{entry.nativeText}</p>}
                                        <p className={`leading-[1.5] ${!isKorean && entry.nativeText ? 'mt-1 border-t border-rose-100 pt-1 text-[8px] text-rose-900/80' : 'text-[8.5px] text-rose-950'}`}>
                                            {!isKorean && entry.nativeText && <span className="mr-1 text-[7px] font-black text-rose-600">[KO]</span>}
                                            <HighlightedText text={entry.text} />
                                        </p>
                                    </div>
                                )) : (
                                    <p className="rounded-2xl border border-dashed border-rose-200 bg-white/80 px-3 py-3 text-[9px] font-bold text-rose-500">개선 상세 데이터가 없습니다.</p>
                                )}
                            </div>
                        </section>
                    </div>

                    <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between gap-4">
                        <div>
                            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">Appendix control</p>
                            <p className="text-[8.5px] font-bold text-slate-500">Front page summary ↔ Back page detail synchronized for duplex printing.</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">PSI official issue</p>
                            <p className="text-[9px] font-bold text-slate-700">Safety Intelligence System · Detailed Narrative Appendix</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});
