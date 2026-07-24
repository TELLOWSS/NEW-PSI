import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalAiHandoffPanel } from '../components/tbm/ExternalAiHandoffPanel';
import { CountryFlag } from '../components/shared/CountryFlag';
import { useDevMode } from '../contexts/DevModeContext';
import { useOperationalMode } from '../contexts/OperationalModeContext';
import { useAssessmentCycle } from '../hooks/useAssessmentCycle';
import { TRAINING_LANGUAGE_LABELS } from '../utils/constructionTrainingTranslation';
import type { WorkerRecord } from '../types';
import { ensureHtml2Canvas, ensureJsPdfConstructor } from '../utils/externalScripts';
import { buildPsiExportFileName } from '../utils/exportFileNaming';
import { captureReportCanvas, saveCanvasAsA4Pdf } from '../utils/pdfCapture';
import {
    buildMonthlyEducationPackageText,
    buildFieldRecordSource,
    buildTbmEducationDraft,
    estimateEducationTokens,
    getFiveMinuteVideoDuration,
    getHighGradeRiskShareItems,
    getTbmEducationScopeKey,
    normalizeTbmEducationDraft,
    TBM_MONTHLY_PACKAGE_STORAGE_KEY,
    type TbmEducationDraft,
    type TbmEvidenceSource,
    type TbmMonthlyPackagePayload,
} from '../utils/tbmEducationStudio';
import { extractTbmSourceFromFile } from '../utils/tbmSourceExtraction';
import {
    groupRecordsByAssessmentPeriod,
    resolveAssessmentPeriod,
} from '../utils/assessmentCycle';

interface Props {
    workerRecords: WorkerRecord[];
    onOpenTraining?: () => void;
}

type StudioTab = 'sources' | 'ai' | 'package' | 'editor' | 'preview';

const getNextMonth = (): string => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const MESSAGE_TEMPLATES = [
    '작업 시작 전 오늘의 작업, 주요 위험, 안전조치를 전원이 함께 확인하고 조건 변경 시 즉시 멈춘다.',
    '위험요인은 발견 즉시 제거하거나 차단하고, 불가능하면 작업을 중지한 뒤 관리자에게 알린다.',
    '서두르지 않고 정해진 작업순서와 보호구 착용 기준을 지키며 동료의 위험도 함께 확인한다.',
];

const CHECKLIST_TEMPLATES = [
    '작업 장소와 이동 동선의 위험요인을 직접 확인했는가?',
    '장비, 안전시설, 보호구의 이상 유무를 확인했는가?',
    '작업자별 역할과 신호 방법을 모두 이해했는가?',
    '기상, 공정, 인원 변경 시 작업중지 기준을 알고 있는가?',
];

const STUDIO_STORAGE_KEY = 'psi_tbm_education_studio_v2';
const STUDIO_STORE_VERSION = 3;
const DEFAULT_WORK_TYPE = '전체 공종';
const EMPTY_WORKER_RECORDS: WorkerRecord[] = [];

interface StoredStudioState {
    educationMonth: string;
    workType: string;
    sources: TbmEvidenceSource[];
    draft: TbmEducationDraft;
    translatedTexts?: Record<string, string>;
    translationSourceText?: string;
    savedAt?: string;
}

interface StoredStudioStore {
    version: typeof STUDIO_STORE_VERSION;
    lastScopeKey: string;
    snapshots: Record<string, StoredStudioState>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
    Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeStoredStudioState = (value: unknown): StoredStudioState | null => {
    if (!isRecord(value) || !value.draft || !Array.isArray(value.sources)) return null;
    const draft = normalizeTbmEducationDraft(value.draft as TbmEducationDraft);
    const educationMonth = typeof value.educationMonth === 'string' && value.educationMonth.trim()
        ? value.educationMonth
        : draft.month || getNextMonth();
    const workType = typeof value.workType === 'string' && value.workType.trim()
        ? value.workType
        : draft.workType || DEFAULT_WORK_TYPE;
    return {
        educationMonth,
        workType,
        sources: value.sources.filter(isRecord) as unknown as TbmEvidenceSource[],
        draft: {
            ...draft,
            month: educationMonth,
            workType,
        },
        translatedTexts: isRecord(value.translatedTexts) ? value.translatedTexts as Record<string, string> : {},
        translationSourceText: typeof value.translationSourceText === 'string' ? value.translationSourceText : '',
        savedAt: typeof value.savedAt === 'string' ? value.savedAt : undefined,
    };
};

const emptyStudioStore = (): StoredStudioStore => ({
    version: STUDIO_STORE_VERSION,
    lastScopeKey: '',
    snapshots: {},
});

const readStudioStore = (): StoredStudioStore => {
    if (typeof window === 'undefined') return emptyStudioStore();
    try {
        const parsed = JSON.parse(localStorage.getItem(STUDIO_STORAGE_KEY) || 'null') as unknown;
        if (!isRecord(parsed)) return emptyStudioStore();
        if (parsed.version === STUDIO_STORE_VERSION && isRecord(parsed.snapshots)) {
            const snapshots = Object.fromEntries(
                Object.entries(parsed.snapshots)
                    .map(([key, snapshot]) => [key, normalizeStoredStudioState(snapshot)] as const)
                    .filter((entry): entry is [string, StoredStudioState] => Boolean(entry[1])),
            );
            const lastScopeKey = typeof parsed.lastScopeKey === 'string' && snapshots[parsed.lastScopeKey]
                ? parsed.lastScopeKey
                : Object.keys(snapshots)[0] || '';
            return { version: STUDIO_STORE_VERSION, lastScopeKey, snapshots };
        }

        const legacyState = normalizeStoredStudioState(parsed);
        if (!legacyState) return emptyStudioStore();
        const scopeKey = getTbmEducationScopeKey(legacyState.educationMonth, legacyState.workType);
        return {
            version: STUDIO_STORE_VERSION,
            lastScopeKey: scopeKey,
            snapshots: { [scopeKey]: legacyState },
        };
    } catch {
        return emptyStudioStore();
    }
};

const loadStudioState = (scope?: { educationMonth: string; workType: string }): StoredStudioState | null => {
    if (typeof window === 'undefined') return null;
    const store = readStudioStore();
    if (scope) {
        return store.snapshots[getTbmEducationScopeKey(scope.educationMonth, scope.workType)] || null;
    }
    return (store.lastScopeKey && store.snapshots[store.lastScopeKey])
        || Object.values(store.snapshots)
            .sort((left, right) => String(right.savedAt || '').localeCompare(String(left.savedAt || '')))[0]
        || null;
};

const saveStudioState = (state: StoredStudioState): void => {
    if (typeof window === 'undefined') return;
    const normalized = normalizeStoredStudioState({
        ...state,
        savedAt: new Date().toISOString(),
    });
    if (!normalized) return;
    const scopeKey = getTbmEducationScopeKey(normalized.educationMonth, normalized.workType);
    const store = readStudioStore();
    localStorage.setItem(STUDIO_STORAGE_KEY, JSON.stringify({
        version: STUDIO_STORE_VERSION,
        lastScopeKey: scopeKey,
        snapshots: {
            ...store.snapshots,
            [scopeKey]: normalized,
        },
    } satisfies StoredStudioStore));
};

const createFreshStudioState = (
    workerRecords: WorkerRecord[],
    educationMonth: string,
    workType: string,
    targetCycleLabel = '다음 달',
    targetPeriodLabel = '',
): StoredStudioState => ({
    educationMonth,
    workType,
    sources: [],
    draft: buildTbmEducationDraft({
        workerRecords,
        sources: [],
        month: educationMonth,
        workType,
        targetCycleLabel,
        targetPeriodLabel,
    }),
    translatedTexts: {},
    translationSourceText: '',
});

const updateAt = (items: string[], index: number, value: string): string[] =>
    items.map((item, itemIndex) => itemIndex === index ? value : item);

const removeAt = <T,>(items: T[], index: number): T[] =>
    items.filter((_, itemIndex) => itemIndex !== index);

interface TbmLocalization {
    headerTitle: string;
    targetLabel: string;
    videoTitle: string;
    accidentTitle: string;
    risksTitle: string;
    focusTitle: string;
    noticeTitle: string;
    pledgeBoxTitle: string;
    qLabel: string;
    pledgeLabel: string;
    signInstructor: string;
    signConfirmer: string;
    dateLabel: string;
    footerNotice: string;
    noVideoScenes: string;
    noAccidents: string;
    noRisks: string;
    noFocus: string;
    noNotices: string;
    qPlaceholder: string;
    pledgePlaceholder: string;
}

const NATIVE_LANGUAGE_NAMES: Record<string, string> = {
    'ko-KR': '한국어',
    'en-US': 'English',
    'vi-VN': 'Tiếng Việt',
    'cmn-CN': '中文 (简体)',
    'th-TH': 'ไทย',
    'id-ID': 'Bahasa Indonesia',
    'uz-UZ': 'O\'zbekcha',
    'mn-MN': 'Монгол хэл',
    'km-KH': 'ភាសាខ្មែរ',
    'ru-RU': 'Русский',
    'kk-KZ': 'Қазақ тілі',
    'ne-NP': 'नेपाली',
    'my-MM': 'မြန်မာဘာသာ',
    'fil-PH': 'Wikang Filipino',
    'hi-IN': 'हिन्दी',
    'bn-BD': 'বাংলা',
    'ur-PK': 'اردو',
    'si-LK': 'සිංහල',
};

const TBM_LOCALIZATIONS: Record<string, TbmLocalization> = {
    'ko-KR': {
        headerTitle: 'PSI 위험성평가 전파교육',
        targetLabel: '교육 대상',
        videoTitle: '1. 교육 전 5분 핵심 동영상',
        accidentTitle: '2. 최근 재해사례와 현장 연관성',
        risksTitle: '3. 위험성평가 상등급 공유',
        focusTitle: '4. 현장 중점관리 포인트',
        noticeTitle: '5. 공지사항',
        pledgeBoxTitle: '이해 확인과 행동 약속',
        qLabel: '이해 확인',
        pledgeLabel: '행동 약속',
        signInstructor: '교육자 (인)',
        signConfirmer: '확인자 (인)',
        dateLabel: '생성일',
        footerNotice: '이 안전교육 자료는 근로자의 안전을 위해 생성되었습니다.',
        noVideoScenes: '동영상 장면 정보가 없습니다.',
        noAccidents: '재해사례 정보가 없습니다.',
        noRisks: '위험성평가 상등급 항목이 없습니다.',
        noFocus: '중점관리 사항이 없습니다.',
        noNotices: '공지사항이 없습니다.',
        qPlaceholder: '작업 시작 전 이해 확인 질문에 답해주시기 바랍니다.',
        pledgePlaceholder: '안전 수칙을 준수하고 작업하겠습니다.'
    },
    'en-US': {
        headerTitle: 'PSI Risk Assessment Safety Guide',
        targetLabel: 'TARGET',
        videoTitle: '1. Video Guidance',
        accidentTitle: '2. Recent Accident Case',
        risksTitle: '3. High-Priority Risks',
        focusTitle: '4. Key Focus Points',
        noticeTitle: '5. Notices & Scheduling',
        pledgeBoxTitle: 'Comprehension & Safety Pledge',
        qLabel: 'Comprehension Checks',
        pledgeLabel: 'Safety Pledge',
        signInstructor: 'Instructor (Sign)',
        signConfirmer: 'Confirmed (Sign)',
        dateLabel: 'Date',
        footerNotice: 'This safety guide has been automatically translated for foreign workers.',
        noVideoScenes: 'No scene details available.',
        noAccidents: 'No accident case available.',
        noRisks: 'No risk details configured.',
        noFocus: 'No focus points.',
        noNotices: 'No active notices.',
        qPlaceholder: 'Please answer understanding questions before starting work.',
        pledgePlaceholder: 'I pledge to follow the safety guidelines and work safely.'
    },
    'vi-VN': {
        headerTitle: 'Hướng dẫn An toàn Đánh giá Rủi ro PSI',
        targetLabel: 'ĐỐI TƯỢNG',
        videoTitle: '1. Hướng dẫn Video',
        accidentTitle: '2. Trường hợp Tai nạn Gần đây',
        risksTitle: '3. Rủi ro Ưu tiên Cao',
        focusTitle: '4. Điểm Tập trung Chính',
        noticeTitle: '5. Thông báo & Lịch trình',
        pledgeBoxTitle: 'Hiểu biết & Cam kết An toàn',
        qLabel: 'Kiểm tra Hiểu biết',
        pledgeLabel: 'Cam kết An toàn',
        signInstructor: 'Người hướng dẫn (Ký)',
        signConfirmer: 'Xác nhận (Ký)',
        dateLabel: 'Ngày',
        footerNotice: 'Tài liệu hướng dẫn an toàn này được dịch tự động cho công nhân nước ngoài.',
        noVideoScenes: 'Không có chi tiết cảnh quay.',
        noAccidents: 'Không có thông tin tai nạn.',
        noRisks: 'Không có cấu hình chi tiết rủi ro.',
        noFocus: 'Không có điểm tập trung.',
        noNotices: 'Không có thông báo.',
        qPlaceholder: 'Vui lòng trả lời câu hỏi hiểu biết trước khi bắt đầu công việc.',
        pledgePlaceholder: 'Tôi cam kết tuân thủ các hướng dẫn an toàn và làm việc an toàn.'
    },
    'cmn-CN': {
        headerTitle: 'PSI 风险评估安全指南',
        targetLabel: '培训对象',
        videoTitle: '1. 视频指导',
        accidentTitle: '2. 最近事故案例',
        risksTitle: '3. 高优先级风险项目',
        focusTitle: '4. 关键关注点',
        noticeTitle: '5. 通知与日程',
        pledgeBoxTitle: '理解确认与安全承诺',
        qLabel: '理解检查',
        pledgeLabel: '安全承诺',
        signInstructor: '培训员 (签字)',
        signConfirmer: '确认人 (签字)',
        dateLabel: '日期',
        footerNotice: '本安全指南已自动翻译，供非韩籍员工阅读。',
        noVideoScenes: '无视频场景详情。',
        noAccidents: '无事故案例。',
        noRisks: '无风险详情配置。',
        noFocus: '无重点管理事项。',
        noNotices: '无通知事项。',
        qPlaceholder: '请在开始工作前回答理解性问题。',
        pledgePlaceholder: '我承诺遵守安全守则，安全作业。'
    },
    'th-TH': {
        headerTitle: 'คู่มือความปลอดภัยการประเมินความเสี่ยง PSI',
        targetLabel: 'กลุ่มเป้าหมาย',
        videoTitle: '1. คำแนะนำผ่านวิดีโอ',
        accidentTitle: '2. กรณีอุบัติเหตุล่าสุด',
        risksTitle: '3. ความเสี่ยงที่มีลำดับความสำคัญสูง',
        focusTitle: '4. จุดเน้นย้ำสำคัญ',
        noticeTitle: '5. ประกาศและกำหนดการ',
        pledgeBoxTitle: 'การตรวจสอบความเข้าใจและคำปฏิญาณ',
        qLabel: 'การตรวจสอบความเข้าใจ',
        pledgeLabel: 'คำปฏิญาณความปลอดภัย',
        signInstructor: 'ผู้สอน (ลงชื่อ)',
        signConfirmer: 'ผู้ยืนยัน (ลงชื่อ)',
        dateLabel: 'วันที่',
        footerNotice: 'คู่มือความปลอดภัยนี้ได้รับการแปลโดยอัตมัติสำหรับแรงงานต่างชาติ',
        noVideoScenes: 'ไม่มีรายละเอียดฉากวิดีโอ',
        noAccidents: 'ไม่มีข้อมูลอุบัติเหตุ',
        noRisks: 'ไม่มีการกำหนดรายละเอียดความเสี่ยง',
        noFocus: 'ไม่มีจุดเน้นย้ำ',
        noNotices: 'ไม่มีประกาศ',
        qPlaceholder: 'โปรดตอบคำถามความเข้าใจก่อนเริ่มงาน',
        pledgePlaceholder: 'ข้าพเจ้าขอปฏิญาณว่าจะปฏิบัติตามหลักความปลอดภัยและทำงานอย่างปลอดภัย'
    },
    'km-KH': {
        headerTitle: 'សៀវភៅណែនាំសុវត្ថិភាពសម្រាប់ការវាយតម្លៃហានិភ័យ PSI',
        targetLabel: 'គោលដៅ',
        videoTitle: '1. ការណែនាំវីដេអូ',
        accidentTitle: '2. ករណីគ្រោះថ្នាក់ថ្មីៗ',
        risksTitle: '3. ហានិភ័យអាទិភាពខ្ពស់',
        focusTitle: '4. ចំណុចសំខាន់ៗដែលត្រូវផ្តោត',
        noticeTitle: '5. ការជូនដំណឹង និងកាលវិភាគ',
        pledgeBoxTitle: 'ការយល់ដឹង និងការប្តេជ្ញាចិត្តសុវត្ថិភាព',
        qLabel: 'ការពិនិត្យការយល់ដឹង',
        pledgeLabel: 'ការប្តេជ្ញាចិត្តសុវត្ថិភាព',
        signInstructor: 'អ្នកណែនាំ (ហត្ថលេខា)',
        signConfirmer: 'អ្នកបញ្ជាក់ (ហត្ថលេខា)',
        dateLabel: 'កាលបរិច្ឆេទ',
        footerNotice: 'សន្លឹកណែនាំសុវត្ថិភាពនេះត្រូវបានបកប្រែដោយស្វ័យប្រវត្តិសម្រាប់កម្មករបរទេស។',
        noVideoScenes: 'មិនមានព័ត៌មានលម្អិតអំពីឈុតឆាកទេ។',
        noAccidents: 'មិនមានករណីគ្រោះថ្នាក់ត្រូវបានកត់ត្រាទេ។',
        noRisks: 'មិនមានហានិភ័យត្រូវបានកំណត់រចនាសម្ព័ន្ធទេ។',
        noFocus: 'មិនមានចំណុចផ្តោតសំខាន់ទេ។',
        noNotices: 'មិនមានការជូនដំណឹងសកម្មទេ។',
        qPlaceholder: 'សូមឆ្លើយសំណួរស្វែងយល់មុនពេលចាប់ផ្តើមការងារ។',
        pledgePlaceholder: 'ខ្ញុំប្តេជ្ញាអនុវត្តតាមគោលការណ៍ណែនាំសុវត្ថិភាព និងធ្វើការដោយសុវត្ថិភាព។'
    },
    'uz-UZ': {
        headerTitle: 'PSI Xavfni Baholash Bo\'yicha Xavfsizlik Qo\'llanmasi',
        targetLabel: 'KIM UCHUN',
        videoTitle: '1. Video Yo\'riqnoma',
        accidentTitle: '2. Yaqindagi Baxtsiz Hodisa',
        risksTitle: '3. Yuqori Xavfli Omillar',
        focusTitle: '4. Asosiy E\'tibor Nuqtalari',
        noticeTitle: '5. E\'lonlar va Jadval',
        pledgeBoxTitle: 'Tushunishni Tekshirish va Va\'da',
        qLabel: 'Tushunishni Tekshirish',
        pledgeLabel: 'Xavfsizlik Va\'dasi',
        signInstructor: 'Yo\'riqchi (Imzo)',
        signConfirmer: 'Tasdiqlovchi (Imzo)',
        dateLabel: 'Sana',
        footerNotice: 'Ushbu xavfsizlik yo\'riqnomasi xorijiy ishchilar uchun avtomatik ravishda tarjima qilindi.',
        noVideoScenes: 'Video lavhalar mavjud emas.',
        noAccidents: 'Baxtsiz hodisalar haqida ma\'lumot yo\'q.',
        noRisks: 'Xavfli omillar aniqlanmagan.',
        noFocus: 'E\'tibor nuqtalari yo\'q.',
        noNotices: 'E\'lonlar yo\'q.',
        qPlaceholder: 'Ishni boshlashdan oldin tushunish savollariga javob bering.',
        pledgePlaceholder: 'Men xavfsizlik qoidalariga rioya qilishga va xavfsiz ishlashga va\'da beraman.'
    },
    'my-MM': {
        headerTitle: 'PSI အန္တရာယ်အကဲဖြတ် ဘေးကင်းရေးလမ်းညွှန်',
        targetLabel: 'ပစ်မှတ်',
        videoTitle: '၁။ ဗီဒီယိုလမ်းညွှန်',
        accidentTitle: '၂။ လတ်တလော မတော်တဆမှုများ',
        risksTitle: '၃။ ဦးစားပေးအန္တရာယ်များ',
        focusTitle: '၄။ အဓိကအာရုံစိုက်ရမည့်အချက်များ',
        noticeTitle: '၅။ အသိပေးချက်များနှင့် အချိန်ဇယား',
        pledgeBoxTitle: 'နားလည်မှုစစ်ဆေးခြင်းနှင့် ဘေးကင်းရေးကတိကဝတ်',
        qLabel: 'နားလည်မှုစစ်ဆေးခြင်း',
        pledgeLabel: 'ဘေးကင်းရေးကတိကဝတ်',
        signInstructor: 'လမ်းညွှန်ပြသသူ (လက်မှတ်)',
        signConfirmer: 'အတည်ပြုသူ (လက်မှတ်)',
        dateLabel: 'ရက်စွဲ',
        footerNotice: 'ဤဘေးကင်းရေးလမ်းညွှန်လွှာကို နိုင်ငံခြားသားအလုပ်သမားများအတွက် အလိုအလျောက်ဘာသာပြန်ထားပါသည်။',
        noVideoScenes: 'ဗီဒီယိုအသေးစိတ်အချက်အလက်များ မရှိပါ။',
        noAccidents: 'မတော်တဆမှုအချက်အလက်များ မရှိပါ။',
        noRisks: 'သတ်မှတ်ထားသောအန္တရာယ်များ မရှိပါ။',
        noFocus: 'အာရုံစိုက်ရမည့်အချက်များ မရှိပါ။',
        noNotices: 'အသိပေးချက်များ မရှိပါ။',
        qPlaceholder: 'အလုပ်မစတင်မီ နားလည်မှုမေးခွန်းများကို ဖြေဆိုပေးပါရန်။',
        pledgePlaceholder: 'ဘေးကင်းရေးလမ်းညွှန်ချက်များကို လိုက်နာပြီး ဘေးကင်းစွာ လုပ်ဆောင်ရန် ကတိပြုပါသည်။'
    },
    'mn-MN': {
        headerTitle: 'PSI Эрсдэлийн үнэлгээний аюулгүй ажиллагааны зааварчилгаа',
        targetLabel: 'ЗОРИЛТОТ',
        videoTitle: '1. Видео зааварчилгаа',
        accidentTitle: '2. Сүүлийн үеийн осол, гэмтэл',
        risksTitle: '3. Өндөр эрсдэлтэй хүчин зүйлс',
        focusTitle: '4. Гол анхаарах зүйлс',
        noticeTitle: '5. Зарлал ба хуваарь',
        pledgeBoxTitle: 'Ойлголтын шалгалт ба аюулгүй ажиллагааны амлалт',
        qLabel: 'Ойлголтыг шалгах',
        pledgeLabel: 'Аюулгүй ажиллагааны амлалт',
        signInstructor: 'Багш (Гарын үсэг)',
        signConfirmer: 'Баталгаажуулсан (Гарын үсэг)',
        dateLabel: 'Огноо',
        footerNotice: 'Энэхүү аюулгүй ажиллагааны зааварчилгааг гадаад ажилчдад зориулан автомат орчуулгаар бэлтгэв.',
        noVideoScenes: 'Видео мэдээлэл байхгүй.',
        noAccidents: 'Осол гэмтлийн мэдээлэл байхгүй.',
        noRisks: 'Эрсдэлийн мэдээлэл тохируулаагүй байна.',
        noFocus: 'Анхаарах зүйлс байхгүй.',
        noNotices: 'Идэвхтэй зарлал байхгүй.',
        qPlaceholder: 'Ажил эхлэхээс өмнө ойлголтын асуултуудад хариулна уу.',
        pledgePlaceholder: 'Аюулгүй ажиллагааны зааварчилгааг дагаж мөрдөн, аюулгүй ажиллахаа амлаж байна.'
    },
    'ru-RU': {
        headerTitle: 'Инструкция PSI по безопасности при оценке рисков',
        targetLabel: 'ЦЕЛЬ',
        videoTitle: '1. Видео-руководство',
        accidentTitle: '2. Последний несчастный случай',
        risksTitle: '3. Высокоприоритетные риски',
        focusTitle: '4. Ключевые моменты',
        noticeTitle: '5. Объявления и график',
        pledgeBoxTitle: 'Проверка понимания и обязательство по безопасности',
        qLabel: 'Вопросы на понимание',
        pledgeLabel: 'Обязательство по безопасности',
        signInstructor: 'Инструктор (Подпись)',
        signConfirmer: 'Утвердил (Подпись)',
        dateLabel: 'Дата',
        footerNotice: 'Эта инструкция по безопасности была автоматически переведена для иностранных рабочих.',
        noVideoScenes: 'Детали сцен отсутствуют.',
        noAccidents: 'Нет информации о происшествиях.',
        noRisks: 'Настройки рисков отсутствуют.',
        noFocus: 'Нет ключевых моментов.',
        noNotices: 'Нет активных объявлений.',
        qPlaceholder: 'Пожалуйста, ответьте на вопросы перед началом работы.',
        pledgePlaceholder: 'Я обещаю соблювать правила техники безопасности и работать безопасно.'
    },
    'id-ID': {
        headerTitle: 'Panduan Keselamatan Penilaian Risiko PSI',
        targetLabel: 'SASARAN',
        videoTitle: '1. Panduan Video',
        accidentTitle: '2. Kasus Kecelakaan Terbaru',
        risksTitle: '3. Risiko Prioritas Tinggi',
        focusTitle: '4. Poin Fokus Utama',
        noticeTitle: '5. Pengumuman & Jadwal',
        pledgeBoxTitle: 'Pemeriksaan Pemahaman & Janji Keselamatan',
        qLabel: 'Pemeriksaan Pemahaman',
        pledgeLabel: 'Janji Keselamatan',
        signInstructor: 'Instruktur (Tanda Tangan)',
        signConfirmer: 'Dikonfirmasi (Tanda Tangan)',
        dateLabel: 'Tanggal',
        footerNotice: 'Panduan keselamatan ini diterjemahkan secara otomatis untuk pekerja asing.',
        noVideoScenes: 'Detail adegan tidak tersedia.',
        noAccidents: 'Kasus kecelakaan tidak tersedia.',
        noRisks: 'Detail risiko tidak dikonfigurasi.',
        noFocus: 'Tidak ada poin fokus.',
        noNotices: 'Tidak ada pengumuman aktif.',
        qPlaceholder: 'Harap jawab pertanyaan pemahaman sebelum mulai bekerja.',
        pledgePlaceholder: 'Saya berjanji untuk mematuhi panduan keselamatan dan bekerja dengan aman.'
    },
    'ne-NP': {
        headerTitle: 'PSI जोखिम मूल्याङ्कन सुरक्षा निर्देशिका',
        targetLabel: 'लक्ष्य',
        videoTitle: '१. भिडियो निर्देशन',
        accidentTitle: '२. भर्खरको दुर्घटना मामला',
        risksTitle: '३. उच्च-प्राथमिकता जोखिमहरू',
        focusTitle: '४. मुख्य ध्यान दिनुपर्ने बुँदाहरू',
        noticeTitle: '५. सूचना र तालिका',
        pledgeBoxTitle: 'बुझाइ जाँच र सुरक्षा प्रतिज्ञा',
        qLabel: 'बुझाइ जाँच',
        pledgeLabel: 'सुरक्षा प्रतिज्ञा',
        signInstructor: 'प्रशिक्षक (हस्ताक्षर)',
        signConfirmer: 'प्रमाणित (हस्ताक्षर)',
        dateLabel: 'मिति',
        footerNotice: 'यो सुरक्षा निर्देशिका विदेशी कामदारहरूको लागि स्वचालित रूपमा अनुवाद गरिएको हो।',
        noVideoScenes: 'भिडियो दृश्य विवरण उपलब्ध छैन।',
        noAccidents: 'कुनै दुर्घटना विवरण उपलब्ध छैन।',
        noRisks: 'जोखिम विवरण उपलब्ध छैन।',
        noFocus: 'ध्यान दिनुपर्ने बुँदाहरू छैनन्।',
        noNotices: 'कुनै सक्रिय सूचनाहरू छैनन्।',
        qPlaceholder: 'कृपया काम सुरु गर्नु अघि बुझाइ प्रश्नहरूको उत्तर दिनुहोस्।',
        pledgePlaceholder: 'म सुरक्षा दिशानिर्देशहरू पालना गर्न र सुरक्षित रूपमा काम गर्न प्रतिज्ञा गर्दछु।'
    },
    'fil-PH': {
        headerTitle: 'Gabay sa Kaligtasan sa Pagtatasa ng Panganib ng PSI',
        targetLabel: 'TARGET',
        videoTitle: '1. Gabay sa Video',
        accidentTitle: '2. Kamakailang Kaso ng Aksidente',
        risksTitle: '3. Mga Panganib na may Mataas na Priyoridad',
        focusTitle: '4. Mga Pangunahing Puntos na Dapat Pagtuunan',
        noticeTitle: '5. Mga Anunsyo at Iskedyul',
        pledgeBoxTitle: 'Pagsusuri sa Pag-unawa at Pangako sa Kaligtasan',
        qLabel: 'Mga Pagsusuri sa Pag-unawa',
        pledgeLabel: 'Pangako sa Kaligtasan',
        signInstructor: 'Tagapagturo (Lagda)',
        signConfirmer: 'Kinumpirma (Lagda)',
        dateLabel: 'Petsa',
        footerNotice: 'Ang gabay sa kaligtasang ito ay awtomatikong isinalin para sa mga dayuhang manggagawa.',
        noVideoScenes: 'Walang detalye ng eksena.',
        noAccidents: 'Walang magagamit na kaso ng aksidente.',
        noRisks: 'Walang pagsasaayos ng panganib.',
        noFocus: 'Walang mga puntos na dapat pagtuunan.',
        noNotices: 'Walang aktibong anunsyo.',
        qPlaceholder: 'Mangyaring sagutin ang mga tanong sa pag-unawa bago magsimulang magtrabaho.',
        pledgePlaceholder: 'Nangangako akong susundin ang mga alituntunin sa kaligtasan at gagawa nang ligtas.'
    }
};

const normalizeLanguageCode = (code: string): string => {
    if (!code) return 'en-US';
    const c = code.toLowerCase();
    if (c.startsWith('zh') || c.startsWith('cmn')) return 'cmn-CN';
    return code;
};

const LANGUAGE_KOREAN_NAMES: Record<string, string> = {
    'ko-KR': '한국어',
    'en-US': '영어',
    'vi-VN': '베트남어',
    'cmn-CN': '중국어',
    'th-TH': '태국어',
    'km-KH': '캄보디아어',
    'uz-UZ': '우즈베크어',
    'zh-CN': '중국어',
    'zh': '중국어',
};

const getTbmLocalization = (langCode: string): TbmLocalization => {
    const code = normalizeLanguageCode(langCode);
    return TBM_LOCALIZATIONS[code] || TBM_LOCALIZATIONS['en-US'];
};

interface ParsedTbmTranslation {
    title: string;
    opening: string;
    videoText: string;
    accidentText: string;
    risksText: string;
    focusText: string;
    noticesText: string;
    pledgeText: string;
}

const parseTbmTranslation = (text: string): ParsedTbmTranslation => {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    let title = '';
    let opening = '';
    const videoLines = [];
    const accidentLines = [];
    const riskLines = [];
    const focusLines = [];
    const noticeLines = [];
    const pledgeLines = [];

    let currentSection = 0; // 0: title/opening, 1: video, 2: accident, 3: risks, 4: focus, 5: notices, 6: pledge

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lowerLine = line.toLowerCase();

        if (i === 0 && line.startsWith('[') && line.endsWith(']')) {
            title = line.slice(1, -1).trim();
            continue;
        }

        if (/^1[.)]\s|^1\s|^1\./.test(line) || lowerLine.startsWith('1.') || lowerLine.includes('1. ') || lowerLine.includes('video') || lowerLine.includes('동영상')) {
            currentSection = 1;
            continue;
        }
        if (/^2[.)]\s|^2\s|^2\./.test(line) || lowerLine.startsWith('2.') || lowerLine.includes('2. ') || lowerLine.includes('accident') || lowerLine.includes('사례') || lowerLine.includes('재해')) {
            currentSection = 2;
            continue;
        }
        if (/^3[.)]\s|^3\s|^3\./.test(line) || lowerLine.startsWith('3.') || lowerLine.includes('3. ') || lowerLine.includes('risk') || lowerLine.includes('위험') || lowerLine.includes('상등급')) {
            currentSection = 3;
            continue;
        }
        if (/^4[.)]\s|^4\s|^4\./.test(line) || lowerLine.startsWith('4.') || lowerLine.includes('4. ') || lowerLine.includes('focus') || lowerLine.includes('중점') || lowerLine.includes('포인트')) {
            currentSection = 4;
            continue;
        }
        if (/^5[.)]\s|^5\s|^5\./.test(line) || lowerLine.startsWith('5.') || lowerLine.includes('5. ') || lowerLine.includes('notice') || lowerLine.includes('공지')) {
            currentSection = 5;
            continue;
        }
        if (line.startsWith('[') || lowerLine.includes('이해 확인') || lowerLine.includes('행동 약속') || lowerLine.includes('pledge') || lowerLine.includes('확약') || lowerLine.includes('약속')) {
            currentSection = 6;
            continue;
        }

        if (currentSection === 0) {
            if (!title) {
                title = line;
            } else {
                opening += (opening ? '\n' : '') + line;
            }
        } else if (currentSection === 1) {
            videoLines.push(line);
        } else if (currentSection === 2) {
            accidentLines.push(line);
        } else if (currentSection === 3) {
            riskLines.push(line);
        } else if (currentSection === 4) {
            focusLines.push(line);
        } else if (currentSection === 5) {
            noticeLines.push(line);
        } else if (currentSection === 6) {
            pledgeLines.push(line);
        }
    }

    return {
        title: title || 'Risk Assessment Safety Guide',
        opening: opening || 'Please review the safety guidelines carefully before beginning work.',
        videoText: videoLines.join('\n'),
        accidentText: accidentLines.join('\n'),
        risksText: riskLines.join('\n'),
        focusText: focusLines.join('\n'),
        noticesText: noticeLines.join('\n'),
        pledgeText: pledgeLines.join('\n'),
    };
};

type A4FitMode = 'balanced' | 'compact' | 'dense';

interface A4FitLimits {
    title: number;
    opening: number;
    coreMessage: number;
    videoSummary: number;
    accidentTitle: number;
    accidentBody: number;
    riskName: number;
    riskAction: number;
    focus: number;
    notice: number;
    question: number;
    commitment: number;
    translationLine: number;
    videoLines: number;
    accidentLines: number;
    riskLines: number;
    focusLines: number;
    noticeLines: number;
    pledgeLines: number;
}

interface A4PrintRisk {
    id: string;
    risk: string;
    action: string;
    owner: string;
    managerConfirmed: boolean;
    priorityPct: number;
}

interface A4KoreanPrintContent {
    title: string;
    opening: string;
    coreMessage: string;
    videoSummary: string;
    accidentTitle: string;
    accidentBody: string;
    accidentMeta: string;
    risks: A4PrintRisk[];
    focusPoints: string[];
    notices: string[];
    questions: string[];
    closingCommitment: string;
    hiddenCount: number;
}

interface A4TranslationPrintContent {
    title: string;
    opening: string;
    videoLines: string[];
    accidentLines: string[];
    riskLines: string[];
    focusLines: string[];
    noticeLines: string[];
    pledgeLines: string[];
    hiddenCount: number;
}

const A4_FIT_LIMITS: Record<A4FitMode, A4FitLimits> = {
    balanced: {
        title: 72,
        opening: 176,
        coreMessage: 148,
        videoSummary: 164,
        accidentTitle: 64,
        accidentBody: 184,
        riskName: 34,
        riskAction: 138,
        focus: 118,
        notice: 112,
        question: 96,
        commitment: 154,
        translationLine: 128,
        videoLines: 3,
        accidentLines: 2,
        riskLines: 3,
        focusLines: 2,
        noticeLines: 1,
        pledgeLines: 2,
    },
    compact: {
        title: 62,
        opening: 136,
        coreMessage: 112,
        videoSummary: 124,
        accidentTitle: 50,
        accidentBody: 136,
        riskName: 28,
        riskAction: 104,
        focus: 90,
        notice: 84,
        question: 78,
        commitment: 116,
        translationLine: 94,
        videoLines: 2,
        accidentLines: 2,
        riskLines: 3,
        focusLines: 2,
        noticeLines: 1,
        pledgeLines: 1,
    },
    dense: {
        title: 50,
        opening: 96,
        coreMessage: 82,
        videoSummary: 88,
        accidentTitle: 38,
        accidentBody: 96,
        riskName: 22,
        riskAction: 74,
        focus: 64,
        notice: 62,
        question: 60,
        commitment: 86,
        translationLine: 72,
        videoLines: 2,
        accidentLines: 1,
        riskLines: 3,
        focusLines: 2,
        noticeLines: 1,
        pledgeLines: 1,
    },
};

const A4_FIT_LABELS: Record<A4FitMode, { label: string; detail: string }> = {
    balanced: {
        label: '원문 보존 1장',
        detail: '먼저 현장 문장을 최대한 살리고, 실제로 넘칠 때만 자동 압축합니다.',
    },
    compact: {
        label: 'A4 균형 압축',
        detail: '핵심 문장은 유지하고 반복 설명만 줄여 한 장에 맞춥니다.',
    },
    dense: {
        label: '최종 1장 압축',
        detail: '넘치는 내용은 보관자료로 돌리고 근로자 전달 핵심만 남깁니다.',
    },
};

const normalizePrintText = (value: unknown): string =>
    String(value ?? '')
        .replace(/\s+/g, ' ')
        .replace(/^[•\-–—·*]\s*/, '')
        .trim();

const trimToReadableBoundary = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) return text;
    const slice = text.slice(0, Math.max(1, maxLength)).trim();
    const boundaryCandidates = ['. ', '? ', '! ', '。', '？', '！', ', ', ' · ', ' / ', ' 및 ', ' 또는 ', ' 그리고 ', '하며 ', '하고 '];
    let cutIndex = -1;
    for (const boundary of boundaryCandidates) {
        const found = slice.lastIndexOf(boundary);
        if (found > Math.floor(maxLength * 0.45)) {
            cutIndex = Math.max(cutIndex, found + boundary.trimEnd().length);
        }
    }
    if (cutIndex < 0) {
        const lastSpace = slice.lastIndexOf(' ');
        if (lastSpace > Math.floor(maxLength * 0.45)) cutIndex = lastSpace;
    }
    return (cutIndex > 0 ? slice.slice(0, cutIndex) : slice).replace(/[,.，、;；:：·/\-–—]+$/, '').trim();
};

const finishCompactSentence = (text: string, maxLength: number): string => {
    const cleaned = text.replace(/[,.，、;；:：·/\-–—]+$/, '').trim();
    if (!cleaned) return '';
    if (/[.!?。！？]$/.test(cleaned)) return cleaned.length <= maxLength ? cleaned : trimToReadableBoundary(cleaned, maxLength);
    const suffix = '.';
    if (cleaned.length + suffix.length <= maxLength) return `${cleaned}${suffix}`;
    const trimmed = trimToReadableBoundary(cleaned, Math.max(1, maxLength - suffix.length));
    return trimmed ? `${trimmed.replace(/[,.，、;；:：·/\-–—]+$/, '').trim()}${suffix}` : cleaned.slice(0, maxLength);
};

const compactText = (value: unknown, maxLength: number): string => {
    const text = normalizePrintText(value);
    if (text.length <= maxLength) return text;
    const sentences = text
        .split(/(?<=[.!?。！？])\s+|(?<=다\.)\s+|(?<=요\.)\s+/)
        .map((item) => item.trim())
        .filter(Boolean);
    let output = '';
    for (const sentence of sentences) {
        const next = output ? `${output} ${sentence}` : sentence;
        if (next.length > maxLength) break;
        output = next;
    }
    if (!output) output = trimToReadableBoundary(text, Math.max(1, maxLength - 1));
    return output.length < text.length ? finishCompactSentence(output, maxLength) : output;
};

const compactLines = (items: unknown[], maxItems: number, maxLength: number): string[] =>
    items
        .map((item) => compactText(item, maxLength))
        .filter(Boolean)
        .slice(0, maxItems);

const completeA4Items = (
    items: unknown[],
    fallbacks: string[],
    maxItems: number,
    maxLength: number,
): string[] => {
    const seen = new Set<string>();
    const completed: string[] = [];
    for (const item of [...items, ...fallbacks]) {
        const line = compactText(item, maxLength);
        if (!line || seen.has(line)) continue;
        seen.add(line);
        completed.push(line);
        if (completed.length >= maxItems) break;
    }
    return completed;
};

const getTranslationLines = (text: string, maxItems: number, maxLength: number): string[] =>
    compactLines(
        String(text || '')
            .split('\n')
            .map((line) => line.replace(/^[-•]\s*/, '').trim())
            .filter(Boolean),
        maxItems,
        maxLength,
    );

const estimateA4Load = (
    draft: TbmEducationDraft,
    previewLanguage: string,
    viewMode: 'split' | 'single',
    translatedText: string,
): number => {
    const accident = draft.accidentCases[0];
    const draftLoad = [
        draft.title,
        draft.opening,
        draft.coreMessage,
        draft.videoScenes.map((scene) => scene.title).join(' '),
        accident?.title,
        accident?.summary,
        accident?.siteRelevance,
        accident?.lesson,
        ...draft.risks.flatMap((risk) => [risk.risk, risk.action, risk.owner]),
        ...draft.focusPoints,
        ...draft.notices,
        ...draft.confirmationQuestions,
        draft.closingCommitment,
    ].reduce((sum, value) => sum + normalizePrintText(value).length, 0);
    const countPenalty = Math.max(0, draft.risks.length - 3) * 80
        + Math.max(0, draft.focusPoints.length - 3) * 45
        + Math.max(0, draft.notices.length - 2) * 45;
    if (previewLanguage === 'ko-KR') return draftLoad + countPenalty;

    const translationLength = normalizePrintText(translatedText).length;
    if (viewMode === 'single') {
        return translationLength * 0.82 + Math.max(0, translationLength - 2400) * 0.2;
    }

    return (draftLoad + countPenalty) * 0.55 + translationLength * 0.42;
};

const getA4FitMode = (
    draft: TbmEducationDraft,
    previewLanguage: string,
    viewMode: 'split' | 'single',
    translatedText: string,
): A4FitMode => {
    const load = estimateA4Load(draft, previewLanguage, viewMode, translatedText);
    if (load > 2700) return 'dense';
    if (load > 1900) return 'compact';
    return 'balanced';
};

const buildA4KoreanPrintContent = (draft: TbmEducationDraft, fitMode: A4FitMode): A4KoreanPrintContent => {
    const limits = A4_FIT_LIMITS[fitMode];
    const accident = draft.accidentCases[0];
    const highGradeRisks = getHighGradeRiskShareItems(draft.risks);
    const maxScore = Math.max(1, ...highGradeRisks.map((risk) => Number(risk.score) || 0));
    const printRisks = highGradeRisks.slice(0, 3).map((risk) => ({
        id: risk.id,
        risk: compactText(risk.risk, limits.riskName),
        action: compactText(risk.action, limits.riskAction),
        owner: compactText(risk.owner || '담당자 지정 필요', 16),
        managerConfirmed: risk.managerConfirmed,
        priorityPct: Math.max(26, Math.min(100, Math.round(((Number(risk.score) || 1) / maxScore) * 100))),
    }));
    const hiddenCount = Math.max(0, highGradeRisks.length - printRisks.length)
        + Math.max(0, draft.focusPoints.length - 3)
        + Math.max(0, draft.notices.length - 2);
    const accidentBodySource = [
        accident?.siteRelevance,
        accident?.lesson && `교훈: ${accident.lesson}`,
    ].filter(Boolean).join(' ');
    const accidentMeta = [accident?.source, accident?.occurredAt || '발생일 확인 필요'].filter(Boolean).join(' · ');
    const focusFallbacks = [
        '작업구역, 일정, 인원, 장비 조건이 바뀌면 작업 전 다시 확인합니다.',
        '위험요인이 보이면 제거, 차단, 보호구 순서로 조치하고 불가능하면 멈춥니다.',
        '동료가 놓친 위험도 함께 확인하고 관리자에게 즉시 공유합니다.',
    ];
    const noticeFallbacks = [
        '별도 공지 없음. 현장 변경사항은 교육 전 최종 확인합니다.',
        '교육 후 실제 작업조건이 다르면 관리자 확인 전까지 임의 작업을 금지합니다.',
    ];
    const questionFallbacks = [
        '오늘 작업에서 즉시 멈춰야 할 위험 신호는 무엇입니까?',
        '위험을 발견하면 누구에게 바로 알리고 확인받아야 합니까?',
    ];

    return {
        title: compactText(draft.title, limits.title),
        opening: compactText(draft.opening, limits.opening),
        coreMessage: compactText(draft.coreMessage, limits.coreMessage),
        videoSummary: compactText(draft.videoScenes.map((scene) => scene.title).join(' → ') || '원페이지 자료 중심으로 핵심 위험과 작업중지 기준을 공유합니다.', limits.videoSummary),
        accidentTitle: compactText(accident?.title || '현장 기록 기반 위험공유', limits.accidentTitle),
        accidentBody: compactText(accidentBodySource || accident?.summary || '부적합한 사례는 제외하고, 이번 기록에서 확인된 위험 신호와 실천 조치만 전달합니다.', limits.accidentBody),
        accidentMeta: accident ? accidentMeta : '관리자 검수 반영',
        risks: printRisks,
        focusPoints: completeA4Items(draft.focusPoints, focusFallbacks, 3, limits.focus),
        notices: completeA4Items(draft.notices, noticeFallbacks, 2, limits.notice),
        questions: completeA4Items(draft.confirmationQuestions, questionFallbacks, 2, limits.question),
        closingCommitment: compactText(draft.closingCommitment || '교육 내용을 지키고 위험을 발견하면 즉시 멈추겠습니다.', limits.commitment),
        hiddenCount,
    };
};

const buildA4TranslationPrintContent = (
    parsed: ParsedTbmTranslation,
    fitMode: A4FitMode,
): A4TranslationPrintContent => {
    const limits = A4_FIT_LIMITS[fitMode];
    const allVideo = String(parsed.videoText || '').split('\n').filter(Boolean);
    const allAccidents = String(parsed.accidentText || '').split('\n').filter(Boolean);
    const allRisks = String(parsed.risksText || '').split('\n').filter(Boolean);
    const allFocus = String(parsed.focusText || '').split('\n').filter(Boolean);
    const allNotices = String(parsed.noticesText || '').split('\n').filter(Boolean);
    const allPledges = String(parsed.pledgeText || '').split('\n').filter(Boolean);
    const hiddenCount = Math.max(0, allVideo.length - limits.videoLines)
        + Math.max(0, allAccidents.length - limits.accidentLines)
        + Math.max(0, allRisks.length - limits.riskLines)
        + Math.max(0, allFocus.length - limits.focusLines)
        + Math.max(0, allNotices.length - limits.noticeLines)
        + Math.max(0, allPledges.length - limits.pledgeLines);

    return {
        title: compactText(parsed.title, limits.title),
        opening: compactText(parsed.opening, limits.opening),
        videoLines: getTranslationLines(parsed.videoText, limits.videoLines, limits.translationLine),
        accidentLines: getTranslationLines(parsed.accidentText, limits.accidentLines, limits.translationLine),
        riskLines: getTranslationLines(parsed.risksText, limits.riskLines, limits.translationLine),
        focusLines: getTranslationLines(parsed.focusText, limits.focusLines, limits.translationLine),
        noticeLines: getTranslationLines(parsed.noticesText, limits.noticeLines, limits.translationLine),
        pledgeLines: getTranslationLines(parsed.pledgeText, limits.pledgeLines + 2, limits.translationLine),
        hiddenCount,
    };
};

const A4EducationMaterial: React.FC<Props> = ({ workerRecords, onOpenTraining }) => {
    const { isDevMode } = useDevMode();
    const { mode: operationalMode } = useOperationalMode();
    const { cycle, copy: cycleCopy } = useAssessmentCycle();
    const isDeveloperExperience = isDevMode && operationalMode === 'developer';
    const assessmentPeriodGroups = useMemo(
        () => Array.from(groupRecordsByAssessmentPeriod<WorkerRecord>(workerRecords, cycle).values())
            .sort((left, right) => right.period.endDate.localeCompare(left.period.endDate)),
        [cycle, workerRecords],
    );
    const sourceRecords = assessmentPeriodGroups[0]?.records || EMPTY_WORKER_RECORDS;
    const sourcePeriod = assessmentPeriodGroups[0]?.period || resolveAssessmentPeriod(new Date(), cycle);
    const currentPeriod = resolveAssessmentPeriod(new Date(), cycle);
    const targetPeriod = useMemo(() => {
        const baselineEndDate = sourcePeriod.endDate > currentPeriod.endDate
            ? sourcePeriod.endDate
            : currentPeriod.endDate;
        const nextDate = new Date(`${baselineEndDate}T00:00:00.000Z`);
        nextDate.setUTCDate(nextDate.getUTCDate() + 1);
        return resolveAssessmentPeriod(nextDate, cycle);
    }, [currentPeriod.endDate, cycle, sourcePeriod.endDate]);
    const [initialState] = useState<StoredStudioState | null>(() => loadStudioState());
    const initialEducationMonth = initialState?.educationMonth || getNextMonth();
    const initialWorkType = initialState?.workType || DEFAULT_WORK_TYPE;
    const [activeTab, setActiveTab] = useState<StudioTab>('sources');
    const [educationMonth, setEducationMonth] = useState(initialEducationMonth);
    const [workType, setWorkType] = useState(initialWorkType);
    const [manualText, setManualText] = useState('');
    const [sources, setSources] = useState<TbmEvidenceSource[]>(initialState?.sources || []);
    const [isExtracting, setIsExtracting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [notice, setNotice] = useState('');
    const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>(
        initialState?.translatedTexts || {},
    );
    const [translationSourceText, setTranslationSourceText] = useState(
        initialState?.translationSourceText || '',
    );
    const [draft, setDraft] = useState<TbmEducationDraft>(() =>
        initialState?.draft || createFreshStudioState(
            sourceRecords,
            initialEducationMonth,
            initialWorkType,
            cycleCopy.nextCycleLabel,
            targetPeriod.label,
        ).draft,
    );
    const [previewLanguage, setPreviewLanguage] = useState<string>('ko-KR');
    const [viewMode, setViewMode] = useState<'split' | 'single'>('single');
    const [isOverflowing, setIsOverflowing] = useState(false);
    const [forcedTightFit, setForcedTightFit] = useState(false);
    const sheetRef = useRef<HTMLElement>(null);

    const workTypes = useMemo(
        () => [DEFAULT_WORK_TYPE, ...Array.from(new Set(sourceRecords.map((item) => item.jobField).filter(Boolean))).sort()],
        [sourceRecords],
    );
    const fieldSource = useMemo(
        () => buildFieldRecordSource(sourceRecords, workType, cycleCopy.nextCycleLabel),
        [cycleCopy.nextCycleLabel, sourceRecords, workType],
    );
    const allSources = useMemo(
        () => fieldSource ? [fieldSource, ...sources] : sources,
        [fieldSource, sources],
    );
    const estimatedTokens = estimateEducationTokens(allSources);
    const videoDuration = getFiveMinuteVideoDuration(draft);
    const normalizedPreviewLanguage = normalizeLanguageCode(previewLanguage);
    const previewTranslationText = previewLanguage === 'ko-KR'
        ? ''
        : translatedTexts[previewLanguage] || translatedTexts[normalizedPreviewLanguage] || '';
    const estimatedA4FitMode = useMemo(
        () => getA4FitMode(draft, previewLanguage, viewMode, previewTranslationText),
        [draft, previewLanguage, previewTranslationText, viewMode],
    );
    const a4FitMode: A4FitMode = forcedTightFit ? 'dense' : estimatedA4FitMode;
    const a4FitInfo = A4_FIT_LABELS[a4FitMode];
    const a4KoreanPrint = useMemo(
        () => buildA4KoreanPrintContent(draft, a4FitMode),
        [draft, a4FitMode],
    );
    const highGradeDraftRisks = useMemo(
        () => getHighGradeRiskShareItems(draft.risks),
        [draft.risks],
    );
    const hiddenNonHighGradeRiskCount = Math.max(0, draft.risks.length - highGradeDraftRisks.length);
    const currentTranslationSourceText = useMemo(
        () => buildMonthlyEducationPackageText(draft),
        [draft],
    );
    const translationLanguageCodes = useMemo(
        () => Object.entries(translatedTexts)
            .filter(([code, text]) => code !== '__quality__' && Boolean(text))
            .map(([code]) => code),
        [translatedTexts],
    );
    const translationNeedsRefresh = translationLanguageCodes.length > 0
        && translationSourceText !== currentTranslationSourceText;
    const currentPreviewIsStaleTranslation = translationNeedsRefresh && previewLanguage !== 'ko-KR';

    const applyStudioState = (nextState: StoredStudioState) => {
        setEducationMonth(nextState.educationMonth);
        setWorkType(nextState.workType);
        setSources(nextState.sources);
        setTranslatedTexts(nextState.translatedTexts || {});
        setTranslationSourceText(nextState.translationSourceText || '');
        setDraft(nextState.draft);
        setManualText('');
    };

    const switchStudioScope = (nextMonth: string, nextWorkType: string) => {
        if (!/^\d{4}-\d{2}$/.test(nextMonth)) return;
        const scopedState = loadStudioState({ educationMonth: nextMonth, workType: nextWorkType });
        if (scopedState) {
            applyStudioState(scopedState);
            setNotice(`${nextMonth} · ${nextWorkType} 저장본을 불러왔습니다. 다른 운영 구간의 영상·공지·번역은 섞지 않습니다.`);
            return;
        }

        applyStudioState(createFreshStudioState(
            sourceRecords,
            nextMonth,
            nextWorkType,
            cycleCopy.nextCycleLabel,
            targetPeriod.label,
        ));
        setNotice(`${nextMonth} · ${nextWorkType} 새 교육자료를 시작했습니다. 직전 운영 구간의 영상·사고사례·공지사항은 자동 복사하지 않습니다.`);
    };

    useEffect(() => {
        setForcedTightFit(false);
    }, [draft, previewLanguage, translatedTexts, viewMode]);

    // 실시간 오버플로우 감지 후 출력용 레이아웃을 자동 고밀도 모드로 전환
    useEffect(() => {
        if (activeTab !== 'preview') {
            setIsOverflowing(false);
            return;
        }
        const checkOverflow = () => {
            const pageEl = sheetRef.current?.querySelector('[data-report-page="true"]');
            if (pageEl) {
                const hasOverflow = pageEl.scrollHeight > pageEl.clientHeight + 2;
                setIsOverflowing(hasOverflow);
                if (hasOverflow && !forcedTightFit) {
                    setForcedTightFit(true);
                }
            }
        };

        const timer = setTimeout(checkOverflow, 400);
        return () => clearTimeout(timer);
    }, [activeTab, a4FitMode, draft, forcedTightFit, previewLanguage, translatedTexts, viewMode]);

    useEffect(() => {
        saveStudioState({
            educationMonth,
            workType,
            sources,
            draft,
            translatedTexts,
            translationSourceText,
        });
    }, [draft, educationMonth, sources, translatedTexts, translationSourceText, workType]);

    const generateDraft = () => {
        const nextDraft = buildTbmEducationDraft({
            workerRecords: sourceRecords,
            sources,
            month: educationMonth,
            workType,
            coreMessage: draft.coreMessage,
            targetCycleLabel: cycleCopy.nextCycleLabel,
            targetPeriodLabel: targetPeriod.label,
        });
        setDraft(nextDraft);
        setTranslatedTexts({});
        setTranslationSourceText('');
        setActiveTab('package');
        setNotice(`근거 자료를 기준으로 ${cycleCopy.cadenceLabel} 5단계 교육 패키지를 다시 구성했습니다.`);
    };

    const resetStudio = () => {
        const month = getNextMonth();
        applyStudioState(createFreshStudioState(
            sourceRecords,
            month,
            DEFAULT_WORK_TYPE,
            cycleCopy.nextCycleLabel,
            targetPeriod.label,
        ));
        setNotice('교육자료 작업 내용을 초기화했습니다.');
    };

    const addManualSource = () => {
        const text = manualText.trim();
        if (!text) {
            setNotice(`붙여넣을 교육 내용이나 ${cycleCopy.nextCycleLabel} 작업계획을 입력해 주세요.`);
            return;
        }
        setSources((current) => [{
            id: `manual-${Date.now()}`,
            kind: 'manual',
            title: `직접 입력 ${current.filter((source) => source.kind === 'manual').length + 1}`,
            text,
            createdAt: new Date().toISOString(),
        }, ...current]);
        setManualText('');
        setNotice('직접 입력 내용을 자료함에 추가했습니다.');
    };

    const handleFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setIsExtracting(true);
        setNotice('');
        try {
            const extracted: TbmEvidenceSource[] = [];
            for (const file of Array.from(files).slice(0, 6)) {
                extracted.push(await extractTbmSourceFromFile(file));
            }
            setSources((current) => [...extracted, ...current]);
            setNotice(`${extracted.length}개 자료에서 글자를 추출해 자료함에 추가했습니다.`);
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '자료를 읽지 못했습니다.');
        } finally {
            setIsExtracting(false);
        }
    };

    const sendToTraining = () => {
        const sourceText = currentTranslationSourceText;
        const translationsMatchCurrentDraft = !translationNeedsRefresh;
        const payload: TbmMonthlyPackagePayload = {
            draft,
            sourceText,
            translatedTexts: translationsMatchCurrentDraft ? translatedTexts : {},
            translationNeedsRefresh,
            savedAt: new Date().toISOString(),
            month: draft.month,
            workType: draft.workType,
            title: draft.title,
            scopeKey: getTbmEducationScopeKey(draft.month, draft.workType),
        };
        localStorage.setItem(TBM_MONTHLY_PACKAGE_STORAGE_KEY, JSON.stringify(payload));
        setNotice(
            translationsMatchCurrentDraft || translationLanguageCodes.length === 0
                ? '5단계 교육 원문을 QR/음성 파일럿 화면에 전달했습니다.'
                : '한국어 초안이 수정되어 기존 AI 번역은 배포용에서 제외했습니다. QR/음성 생성 단계에서 현재 원문 기준으로 다시 번역합니다.',
        );
        onOpenTraining?.();
    };

    const importExternalAiDraft = (
        nextDraft: TbmEducationDraft,
        nextTranslations: Record<string, string>,
        mode: 'generation' | 'translation' = 'generation',
    ) => {
        const draftToStore = mode === 'translation' ? draft : nextDraft;
        setDraft(draftToStore);
        setTranslatedTexts(nextTranslations);
        setTranslationSourceText(buildMonthlyEducationPackageText(draftToStore));
        const translationCount = Object.keys(nextTranslations).length;
        setActiveTab(mode === 'translation' && translationCount > 0 ? 'preview' : 'package');
        setNotice(
            mode === 'translation' && translationCount > 0
                ? `수정본 기준 다국어 번역 ${translationCount}개를 갱신했습니다. 출력 확인에서 언어를 선택해 저장하세요.`
                : translationCount > 0
                ? `AI 초안과 다국어 결과 ${translationCount}개를 반영했습니다. 5단계 내용을 검수해 주세요.`
                : 'AI 초안을 반영했습니다. 5단계 내용을 검수해 주세요.',
        );
    };

    const markPackageDraftChanged = (
        nextDraft: TbmEducationDraft | ((currentDraft: TbmEducationDraft) => TbmEducationDraft),
        message: string,
    ) => {
        setDraft((currentDraft) => (
            typeof nextDraft === 'function' ? nextDraft(currentDraft) : nextDraft
        ));
        setTranslationSourceText('');
        setNotice(`${message} 기존 다국어 탭은 대조용으로 유지했습니다. 외국인 근로자 배포 전 현재 1장 기준으로 번역을 다시 생성해 주세요.`);
    };

    const buildCurrentFallbackDraft = () => buildTbmEducationDraft({
        workerRecords: sourceRecords,
        sources,
        month: educationMonth,
        workType,
        coreMessage: draft.coreMessage,
        targetCycleLabel: cycleCopy.nextCycleLabel,
        targetPeriodLabel: targetPeriod.label,
    });

    const openAiDraftStepWithCurrentSources = () => {
        const nextDraft = buildCurrentFallbackDraft();
        setDraft(nextDraft);
        setTranslationSourceText('');
        setActiveTab('ai');
        setNotice('업로드 자료와 직접 입력 내용을 기준으로 상등급 검증 목록을 먼저 갱신했습니다. AI 정밀 초안은 이 목록을 기준으로 반영됩니다.');
    };

    const restoreVideoScenes = () => {
        const fallback = buildCurrentFallbackDraft();
        markPackageDraftChanged((currentDraft) => ({ ...currentDraft, videoScenes: fallback.videoScenes }), '기본 5분 동영상 장면표를 다시 채웠습니다.');
    };

    const restoreAccidentCase = () => {
        const fallback = buildCurrentFallbackDraft();
        markPackageDraftChanged((currentDraft) => ({ ...currentDraft, accidentCases: fallback.accidentCases }), '최근 재해사례 입력칸을 다시 열었습니다.');
    };

    const addFocusPoint = () => {
        markPackageDraftChanged((currentDraft) => ({
            ...currentDraft,
            focusPoints: [...currentDraft.focusPoints, '작업 전 현장 조건과 안전조치 확인사항을 입력하세요.'],
        }), '현장 중점관리 포인트를 추가했습니다.');
    };

    const addNotice = () => {
        markPackageDraftChanged((currentDraft) => ({
            ...currentDraft,
            notices: [...currentDraft.notices, '교육 전 근로자에게 공유할 현장 공지사항을 입력하세요.'],
        }), '공지사항을 추가했습니다.');
    };

    const captureSheet = async () => {
        if (!sheetRef.current) throw new Error('내보낼 한 장 자료를 찾지 못했습니다.');
        const html2canvas = await ensureHtml2Canvas();
        return captureReportCanvas(sheetRef.current, html2canvas, { scale: 3 });
    };

    const blockStaleTranslationExport = (): boolean => {
        if (translationNeedsRefresh && previewLanguage !== 'ko-KR') {
            setNotice('현재 외국어 탭은 이전 번역 대조용입니다. “수정본 그대로 다국어만 갱신”을 완료한 뒤 저장하세요.');
            return true;
        }
        if (translationNeedsRefresh && previewLanguage === 'ko-KR') {
            setNotice('한국어 원문은 저장할 수 있습니다. 외국어 출력물은 다국어 갱신을 먼저 완료해야 합니다.');
        }
        return false;
    };

    const exportImage = async () => {
        if (blockStaleTranslationExport()) return;
        setIsExporting(true);
        try {
            const canvas = await captureSheet();
            const link = document.createElement('a');
            const langLabel = previewLanguage !== 'ko-KR' ? LANGUAGE_KOREAN_NAMES[normalizeLanguageCode(previewLanguage)] || '다국어' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langLabel) exportTokens.push(langLabel);
            
            link.download = buildPsiExportFileName({
                tokens: exportTokens,
                extension: 'png',
            });
            link.href = canvas.toDataURL('image/png', 1);
            link.click();
            setNotice('화면 품질을 유지한 PNG 이미지를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PNG 이미지를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportPdf = async () => {
        if (blockStaleTranslationExport()) return;
        setIsExporting(true);
        try {
            const [canvas, JsPDF] = await Promise.all([captureSheet(), ensureJsPdfConstructor()]);
            if (!JsPDF) throw new Error('PDF 생성 도구를 불러오지 못했습니다.');
            const langLabel = previewLanguage !== 'ko-KR' ? LANGUAGE_KOREAN_NAMES[normalizeLanguageCode(previewLanguage)] || '다국어' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langLabel) exportTokens.push(langLabel);

            saveCanvasAsA4Pdf(canvas, JsPDF, buildPsiExportFileName({
                tokens: exportTokens,
                extension: 'pdf',
            }));
            setNotice('A4 비율과 화면 품질을 유지한 PDF를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PDF를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportPptx = async () => {
        if (blockStaleTranslationExport()) return;
        setIsExporting(true);
        try {
            const canvas = await captureSheet();
            const { default: PptxGenJS } = await import('pptxgenjs');
            const pptx = new PptxGenJS();
            pptx.defineLayout({ name: 'PSI_A4', width: 8.27, height: 11.69 });
            pptx.layout = 'PSI_A4';
            pptx.author = 'PSI';
            pptx.subject = '위험성평가 전파교육';
            pptx.title = draft.title;
            const slide = pptx.addSlide();
            slide.background = { color: 'FFFFFF' };
            slide.addImage({ data: canvas.toDataURL('image/png', 1), x: 0, y: 0, w: 8.27, h: 11.69 });
            
            const langLabel = previewLanguage !== 'ko-KR' ? LANGUAGE_KOREAN_NAMES[normalizeLanguageCode(previewLanguage)] || '다국어' : '';
            const exportTokens = ['TBM교육자료', educationMonth, workType];
            if (langLabel) exportTokens.push(langLabel);

            await pptx.writeFile({
                fileName: buildPsiExportFileName({
                    tokens: exportTokens,
                    extension: 'pptx',
                }),
            });
            setNotice('동일한 한 장 디자인으로 PPTX를 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'PPTX를 저장하지 못했습니다.');
        } finally {
            setIsExporting(false);
        }
    };

    const exportAllImages = async () => {
        if (translationNeedsRefresh) {
            setNotice('수정된 한국어 원문 기준으로 다국어를 먼저 갱신해야 일괄 저장할 수 있습니다.');
            return;
        }
        setIsExporting(true);
        const originalLang = previewLanguage;
        const originalViewMode = viewMode;
        const targetLanguages = ['ko-KR', ...Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code])];
        
        try {
            for (const lang of targetLanguages) {
                setPreviewLanguage(lang);
                setViewMode('single');
                await new Promise((resolve) => setTimeout(resolve, 400));
                
                const canvas = await captureSheet();
                const link = document.createElement('a');
                const langLabel = lang !== 'ko-KR' ? LANGUAGE_KOREAN_NAMES[normalizeLanguageCode(lang)] || '다국어' : '한국어';
                const exportTokens = ['TBM교육자료', educationMonth, workType, langLabel];
                
                link.download = buildPsiExportFileName({
                    tokens: exportTokens,
                    extension: 'png',
                });
                link.href = canvas.toDataURL('image/png', 1);
                link.click();
            }
            setNotice('선택된 모든 언어의 PNG 이미지를 일괄 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '일괄 PNG 이미지 저장 중 오류가 발생했습니다.');
        } finally {
            setPreviewLanguage(originalLang);
            setViewMode(originalViewMode);
            setIsExporting(false);
        }
    };

    const exportAllPdfs = async () => {
        if (translationNeedsRefresh) {
            setNotice('수정된 한국어 원문 기준으로 다국어를 먼저 갱신해야 일괄 저장할 수 있습니다.');
            return;
        }
        setIsExporting(true);
        const originalLang = previewLanguage;
        const originalViewMode = viewMode;
        const targetLanguages = ['ko-KR', ...Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code])];
        
        try {
            const JsPDF = await ensureJsPdfConstructor();
            if (!JsPDF) throw new Error('PDF 생성 도구를 불러오지 못했습니다.');
            
            for (const lang of targetLanguages) {
                setPreviewLanguage(lang);
                setViewMode('single');
                await new Promise((resolve) => setTimeout(resolve, 400));
                
                const canvas = await captureSheet();
                const langLabel = lang !== 'ko-KR' ? LANGUAGE_KOREAN_NAMES[normalizeLanguageCode(lang)] || '다국어' : '한국어';
                const exportTokens = ['TBM교육자료', educationMonth, workType, langLabel];

                saveCanvasAsA4Pdf(canvas, JsPDF, buildPsiExportFileName({
                    tokens: exportTokens,
                    extension: 'pdf',
                }));
            }
            setNotice('선택된 모든 언어의 PDF를 일괄 저장했습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '일괄 PDF 저장 중 오류가 발생했습니다.');
        } finally {
            setPreviewLanguage(originalLang);
            setViewMode(originalViewMode);
            setIsExporting(false);
        }
    };

    return (
        <div className="psi-page space-y-5 pb-16">
            <section className="psi-enterprise-hero no-print">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">Evidence-based Risk Assessment Studio</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">위험성평가 교육자료 스튜디오</h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-blue-50">
                    현장 기록과 첨부자료를 근거로 5단계 전파교육 초안을 만들고, 선택한 AI의 정밀 분석 결과를 한 장짜리 위험성평가 교육자료와 필요 언어별 번역본으로 정리합니다.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-white/15 px-3 py-2">ChatGPT · Claude · Gemini</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">로컬 무료 초안</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">출처 표시</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">PNG · PDF · PPTX</span>
                </div>
            </section>

            {/* 공통 설정 영역 (교육자료 보관 월 및 공종 선택) */}
            <section className="psi-enterprise-panel grid gap-4 p-5 lg:grid-cols-3 no-print">
                <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                    {cycle.cadence === 'monthly' ? '교육 대상월' : '교육자료 보관 월'}
                    <input type="month" value={educationMonth} onInput={(event) => switchStudioScope(event.currentTarget.value, workType)} className="mt-2 w-full rounded-xl border px-3 py-3 bg-white dark:bg-slate-900" />
                    {cycle.cadence !== 'monthly' && (
                        <span className="mt-2 block text-[11px] font-semibold leading-5 text-slate-500 dark:text-slate-400">
                            실제 교육 적용 구간: {targetPeriod.label} · {cycleCopy.frequencyLabel}
                        </span>
                    )}
                </label>
                <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                    대상 공종
                    <select value={workType} onChange={(event) => switchStudioScope(educationMonth, event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 bg-white dark:bg-slate-900">
                        {workTypes.map((item) => <option key={item}>{item}</option>)}
                    </select>
                </label>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10 flex flex-col justify-center">
                    <p className="text-xs font-black text-emerald-800 dark:text-emerald-200">무료 사용량 보호</p>
                    <p className="mt-1 text-xl font-black text-emerald-900 dark:text-emerald-100">약 {estimatedTokens.toLocaleString()} 토큰</p>
                    <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">현재 근거자료를 AI에 보낼 경우의 예상량입니다.</p>
                </div>
            </section>

            <nav className="psi-segmented-nav grid grid-cols-2 gap-2 sm:grid-cols-5 no-print" aria-label="교육자료 제작 단계">
                {([
                    ['sources', '1. 자료 모으기'],
                    ['ai', '2. AI 정밀 초안'],
                    ['package', '3. 5단계 검수'],
                    ['editor', '4. 한 장 편집'],
                    ['preview', '5. 출력 확인'],
                ] as Array<[StudioTab, string]>).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => setActiveTab(id)}
                        className={`min-h-11 rounded-xl px-3 py-2 text-xs font-black transition-colors sm:text-sm ${
                            activeTab === id
                                ? 'bg-blue-700 text-white shadow-md'
                                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {notice && (
                <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 no-print">
                    {notice}
                </p>
            )}

            {activeTab === 'sources' && (
                <div className="space-y-4 no-print">
                    <section className="grid gap-4 lg:grid-cols-2">
                        <label className="flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-center transition hover:border-blue-500 dark:border-blue-500/50 dark:bg-blue-500/10">
                            <span className="text-base font-black text-blue-800 dark:text-blue-200">{isExtracting ? '자료에서 글자를 읽는 중...' : 'PDF · PPTX · TXT 자료 추가'}</span>
                            <span className="mt-2 text-xs font-semibold leading-5 text-blue-600 dark:text-blue-300">최대 6개 파일을 한 번에 추가합니다. 스캔 PDF는 아래 직접 입력을 이용해 주세요.</span>
                            <input type="file" multiple accept=".pdf,.pptx,.txt,.md" className="sr-only" disabled={isExtracting} onChange={(event) => void handleFiles(event.target.files)} />
                        </label>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                                {cycleCopy.nextCycleLabel} 작업계획 · 교육 원문 직접 입력
                                <textarea
                                    value={manualText}
                                    onChange={(event) => setManualText(event.target.value)}
                                    rows={5}
                                    placeholder="예: 7월 철골 설치 작업, 고소작업대 사용, 개구부 주변 작업이 예정되어 추락 방지조치를 중점 교육한다."
                                    className="mt-2 w-full rounded-xl border p-3 text-sm font-semibold"
                                />
                            </label>
                            <button type="button" onClick={addManualSource} className="mt-3 min-h-11 w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white dark:bg-slate-100 dark:text-slate-900">
                                자료함에 추가
                            </button>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black">근거 자료함</h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">각 위험 항목에는 선택에 사용된 출처가 함께 표시됩니다.</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={resetStudio} className="min-h-11 rounded-xl border border-slate-300 px-4 py-3 text-xs font-black text-slate-600 dark:border-slate-600 dark:text-slate-300">
                                    작업 초기화
                                </button>
                                <button type="button" onClick={generateDraft} className="psi-button-secondary">
                                    AI 없이 기본 초안
                                </button>
                                <button type="button" onClick={openAiDraftStepWithCurrentSources} className="psi-button-primary">
                                    AI 정밀 초안 만들기
                                </button>
                            </div>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {allSources.map((source) => (
                                <article key={source.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/70">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-wide text-blue-700 dark:text-blue-300">
                                                {source.kind === 'field-record' ? '현장 기록' : source.kind === 'manual' ? '직접 입력' : '업로드 자료'}
                                            </span>
                                            <h4 className="mt-1 text-sm font-black">{source.title}</h4>
                                        </div>
                                        {source.kind !== 'field-record' && (
                                            <button type="button" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} className="text-xs font-bold text-rose-600 dark:text-rose-300">
                                                삭제
                                            </button>
                                        )}
                                    </div>
                                    <p className="mt-3 line-clamp-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{source.text}</p>
                                </article>
                            ))}
                            {!allSources.length && (
                                <p className="rounded-xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300 md:col-span-2">
                                    아직 자료가 없습니다. 자료를 추가하지 않아도 기본 안전교육 보기글로 초안을 만들 수 있습니다.
                                </p>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'ai' && (
                <ExternalAiHandoffPanel
                    sources={allSources}
                    month={educationMonth}
                    workType={workType}
                    draft={draft}
                    targetCycleLabel={cycleCopy.nextCycleLabel}
                    targetPeriodLabel={targetPeriod.label}
                    translationNeedsRefresh={translationNeedsRefresh}
                    onImport={importExternalAiDraft}
                    onUseLocalDraft={generateDraft}
                    onNotice={setNotice}
                />
            )}

            {activeTab === 'package' && (
                <div className="space-y-4 no-print">
                    <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 dark:border-blue-500/30 dark:bg-blue-500/10">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black text-blue-950 dark:text-blue-100">위험성평가 5단계 교육 흐름</h3>
                                <p className="mt-1 text-xs font-semibold leading-5 text-blue-700 dark:text-blue-300">공통 이해에서 현장 행동으로 이어지도록 영상 → 사례 → 상등급 → 중점관리 → 공지 순서로 진행하고, 마지막에 이해 확인과 작업중지 약속을 남깁니다.</p>
                            </div>
                            <span className={`rounded-full px-3 py-2 text-xs font-black ${videoDuration === 300 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                                영상 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 {videoDuration === 300 ? '완료' : '조정 필요'}
                            </span>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-black">1. 교육 전 5분 핵심 동영상 구성</h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">맞지 않는 AI 장면은 제외하세요. 출력지는 남은 핵심 장면 또는 원페이지 교육 중심으로 자동 재배치됩니다.</p>
                            </div>
                            {draft.videoScenes.length === 0 && (
                                <button type="button" onClick={restoreVideoScenes} className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200">
                                    기본 장면 다시 채우기
                                </button>
                            )}
                        </div>
                        <div className="mt-4 space-y-3">
                            {draft.videoScenes.map((scene, index) => (
                                <article key={scene.id} className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800 md:grid-cols-[90px_1fr_1fr]">
                                    <div className="flex items-center justify-between gap-3 md:col-span-3">
                                        <span className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-black text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">장면 {index + 1}</span>
                                        <button
                                            type="button"
                                            onClick={() => markPackageDraftChanged((currentDraft) => ({
                                                ...currentDraft,
                                                videoScenes: currentDraft.videoScenes.filter((item) => item.id !== scene.id),
                                            }), '선택한 동영상 장면을 교육자료에서 제외했습니다.')}
                                            className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300"
                                        >
                                            이 장면 제외
                                        </button>
                                    </div>
                                    <label className="text-xs font-black">장면 {index + 1} 시간
                                        <input type="number" min={5} value={scene.seconds} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, seconds: Number(event.target.value) } : item) })} className="mt-2 w-full rounded-lg border px-2 py-2" />
                                    </label>
                                    <label className="text-xs font-black">제목 · 내레이션
                                        <input value={scene.title} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, title: event.target.value } : item) })} className="mt-2 w-full rounded-lg border px-3 py-2" />
                                        <textarea value={scene.narration} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, narration: event.target.value } : item) })} rows={3} className="mt-2 w-full rounded-lg border p-3 text-xs font-semibold" />
                                    </label>
                                    <label className="text-xs font-black">화면 구성 지시
                                        <textarea value={scene.visualGuide} onChange={(event) => setDraft({ ...draft, videoScenes: draft.videoScenes.map((item) => item.id === scene.id ? { ...item, visualGuide: event.target.value } : item) })} rows={5} className="mt-2 w-full rounded-lg border p-3 text-xs font-semibold" />
                                    </label>
                                </article>
                            ))}
                            {draft.videoScenes.length === 0 && (
                                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm font-bold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    동영상 장면표가 제외되었습니다. A4 자료에는 원페이지 교육 중심 문구로 자동 대체됩니다.
                                </div>
                            )}
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-lg font-black">2. 최근 재해사례와 현장 연관성</h3>
                                    <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">출처가 불명확하거나 현장과 맞지 않는 사례는 제외하고 현장 기록 기반 교육으로 대체합니다.</p>
                                </div>
                                {draft.accidentCases.length === 0 ? (
                                    <button type="button" onClick={restoreAccidentCase} className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                                        사례 다시 추가
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => markPackageDraftChanged((currentDraft) => ({ ...currentDraft, accidentCases: [] }), '최근 재해사례를 교육자료에서 제외했습니다.')}
                                        className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300"
                                    >
                                        이 사례 제외
                                    </button>
                                )}
                            </div>
                            {draft.accidentCases.slice(0, 1).map((item) => (
                                <div key={item.id} className="mt-4 grid gap-3">
                                    <input value={item.title} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, title: event.target.value }] })} aria-label="최근 재해사례 제목" placeholder="사례 제목" className="rounded-xl border px-3 py-3 font-bold" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <input type="date" value={item.occurredAt} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, occurredAt: event.target.value }] })} aria-label="사고 발생일" className="rounded-xl border px-3 py-3 text-sm" />
                                        <input value={item.source} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, source: event.target.value }] })} aria-label="최근 재해사례 출처" placeholder="출처" className="rounded-xl border px-3 py-3 text-sm" />
                                    </div>
                                    <textarea value={item.summary} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, summary: event.target.value }] })} rows={3} aria-label="최근 재해사례 요약" placeholder="사례 요약" className="rounded-xl border p-3 text-sm" />
                                    <textarea value={item.siteRelevance} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, siteRelevance: event.target.value }] })} rows={2} aria-label="최근 재해사례 현장 연관성" placeholder="우리 현장과 밀접한 이유" className="rounded-xl border p-3 text-sm" />
                                    <textarea value={item.lesson} onChange={(event) => setDraft({ ...draft, accidentCases: [{ ...item, lesson: event.target.value }] })} rows={2} aria-label="최근 재해사례 핵심 교훈" placeholder="반드시 실천할 교훈" className="rounded-xl border p-3 text-sm" />
                                    {(!item.occurredAt || !item.source || item.source === '관리자 확인 필요') && <p className="text-xs font-black text-amber-700 dark:text-amber-300">발생일과 공식 출처를 확인하기 전에는 실제 사례로 확정 표시하지 않습니다.</p>}
                                </div>
                            ))}
                            {draft.accidentCases.length === 0 && (
                                <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-5 text-sm font-bold leading-6 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                                    재해사례가 제외되었습니다. A4 자료에는 부정확한 사례 대신 “현장 기록 기반 위험공유” 카드가 표시됩니다.
                                </div>
                            )}
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">3. {cycleCopy.nextCycleLabel} 상등급 위험 공유</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">{cycleCopy.nextCycleLabel} 위험성평가 회의자료(PPT/PDF/문서)에서 상등급으로 지정된 항목만 표시합니다. 나머지 위험은 현장 중점관리 포인트에서 다룹니다.</p>
                            <div className="mt-4 space-y-3">
                                {highGradeDraftRisks.map((item) => (
                                    <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
                                        <div className="flex items-center justify-between gap-2">
                                            <input
                                                value={item.risk}
                                                onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, risk: event.target.value } : risk) })}
                                                placeholder="위험 요인"
                                                className="text-sm font-bold border-b border-transparent hover:border-slate-300 focus:border-blue-500 bg-transparent px-1 py-0.5 focus:bg-white dark:focus:bg-slate-900 rounded w-[60%]"
                                            />
                                            <div className="flex items-center gap-3">
                                                <label className="flex items-center gap-1.5 text-xs font-black text-rose-700 dark:text-rose-300 cursor-pointer">
                                                    <input type="checkbox" checked={item.managerConfirmed} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, managerConfirmed: event.target.checked } : risk) })} />
                                                    상등급 확인
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => markPackageDraftChanged((currentDraft) => ({
                                                        ...currentDraft,
                                                        risks: currentDraft.risks.filter((risk) => risk.id !== item.id),
                                                    }), `${item.risk || '위험요인'} 항목을 교육자료에서 제외했습니다.`)}
                                                    className="text-xs font-bold text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-300"
                                                >
                                                    제외
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            value={item.owner}
                                            onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, owner: event.target.value } : risk) })}
                                            aria-label={`${item.risk} 위험 담당자`}
                                            placeholder="담당자 지정"
                                            className="mt-2 w-full rounded-lg border px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
                                        />
                                        <textarea
                                            value={item.action}
                                            onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, action: event.target.value } : risk) })}
                                            placeholder="핵심 안전조치 내용"
                                            rows={2}
                                            className="mt-2 w-full rounded-lg border p-2 text-xs font-semibold bg-white dark:bg-slate-900 resize-none"
                                        />
                                    </article>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => {
                                        const newRisk = {
                                            id: `custom-risk-${Date.now()}`,
                                            risk: '상등급 위험 요인',
                                            action: '상등급으로 확인된 위험의 작업 전 핵심 안전조치를 작성하십시오.',
                                            evidenceLabels: ['관리자 상등급 수동 확인'],
                                            score: 0,
                                            owner: '담당자 지정 필요',
                                            managerConfirmed: true,
                                        };
                                        markPackageDraftChanged((currentDraft) => ({
                                            ...currentDraft,
                                            risks: [...currentDraft.risks, newRisk],
                                        }), '새 위험요인을 추가했습니다.');
                                    }}
                                    className="min-h-10 w-full rounded-xl border border-dashed border-slate-300 hover:border-slate-400 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    + 상등급 위험 수동 추가
                                </button>
                                {highGradeDraftRisks.length === 0 && (
                                    <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50 p-4 text-center text-xs font-bold leading-5 text-rose-700">
                                        현재 회의자료에서 상등급으로 지정된 위험공유 항목이 없습니다. 임의 추천은 자동으로 넣지 않습니다.
                                    </div>
                                )}
                                {hiddenNonHighGradeRiskCount > 0 && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-600">
                                        상등급 근거가 없는 기존 추천 위험 {hiddenNonHighGradeRiskCount}건은 출력과 다국어 원문에서 자동 제외했습니다.
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-lg font-black">4. 현장 중점관리 포인트</h3>
                                <button type="button" onClick={addFocusPoint} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
                                    포인트 추가
                                </button>
                            </div>
                            <div className="mt-3 space-y-2">
                                {draft.focusPoints.map((item, index) => (
                                    <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800 sm:grid-cols-[1fr_auto]">
                                        <textarea value={item} onChange={(event) => setDraft({ ...draft, focusPoints: updateAt(draft.focusPoints, index, event.target.value) })} rows={2} aria-label={`현장 중점관리 포인트 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />
                                        <button
                                            type="button"
                                            onClick={() => markPackageDraftChanged((currentDraft) => ({
                                                ...currentDraft,
                                                focusPoints: removeAt(currentDraft.focusPoints, index),
                                            }), `현장 중점관리 포인트 ${index + 1}번을 제외했습니다.`)}
                                            className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300"
                                        >
                                            제외
                                        </button>
                                    </div>
                                ))}
                                {draft.focusPoints.length === 0 && (
                                    <p className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50 p-4 text-sm font-bold leading-6 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100">
                                        중점관리 포인트가 제외되었습니다. A4 자료에는 작업 전 변경사항 확인 등 공통 안전 포인트가 자동 배치됩니다.
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <div className="flex items-center justify-between gap-3">
                                <h3 className="text-lg font-black">5. 공지사항</h3>
                                <button type="button" onClick={addNotice} className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 hover:bg-violet-100 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200">
                                    공지 추가
                                </button>
                            </div>
                            <div className="mt-3 space-y-2">
                                {draft.notices.map((item, index) => (
                                    <div key={index} className="grid gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800 sm:grid-cols-[1fr_auto]">
                                        <textarea value={item} onChange={(event) => setDraft({ ...draft, notices: updateAt(draft.notices, index, event.target.value) })} rows={2} aria-label={`공지사항 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />
                                        <button
                                            type="button"
                                            onClick={() => markPackageDraftChanged((currentDraft) => ({
                                                ...currentDraft,
                                                notices: removeAt(currentDraft.notices, index),
                                            }), `공지사항 ${index + 1}번을 제외했습니다.`)}
                                            className="min-h-10 rounded-xl border border-rose-200 bg-white px-3 text-xs font-black text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:bg-slate-900 dark:text-rose-300"
                                        >
                                            제외
                                        </button>
                                    </div>
                                ))}
                                {draft.notices.length === 0 && (
                                    <p className="rounded-xl border border-dashed border-violet-300 bg-violet-50 p-4 text-sm font-bold leading-6 text-violet-900 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-100">
                                        공지사항이 제외되었습니다. A4 자료에는 “별도 공지 없음, 현장 변경사항 최종 확인” 문구가 간결하게 표시됩니다.
                                    </p>
                                )}
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/10">
                        <h3 className="text-lg font-black text-orange-950 dark:text-orange-100">교육 마무리: 이해 확인과 행동 약속</h3>
                        <textarea value={draft.closingCommitment} onChange={(event) => setDraft({ ...draft, closingCommitment: event.target.value })} rows={2} aria-label="교육 마무리 행동 약속" className="mt-3 w-full rounded-xl border p-3 text-sm font-bold" />
                        <div className={`mt-4 grid gap-2 ${isDeveloperExperience ? 'sm:grid-cols-2' : ''}`}>
                            <button type="button" onClick={() => setActiveTab('editor')} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white">한 장 자료 편집</button>
                            {isDeveloperExperience && (
                                <button type="button" onClick={sendToTraining} className="min-h-12 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">QR/음성 파일럿으로 보내기</button>
                            )}
                        </div>
                    </section>
                </div>
            )}

            {activeTab === 'editor' && (
                <div className="space-y-4 no-print">
                    <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
                        <label className="text-sm font-black">교육자료 제목<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                        <label className="text-sm font-black">교육 시작 안내<input value={draft.opening} onChange={(event) => setDraft({ ...draft, opening: event.target.value })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                        <label className="text-sm font-black lg:col-span-2">
                            핵심 전달 문구
                            <textarea value={draft.coreMessage} onChange={(event) => setDraft({ ...draft, coreMessage: event.target.value })} rows={3} className="mt-2 w-full rounded-xl border p-3" />
                        </label>
                        <div className="lg:col-span-2">
                            <p className="text-xs font-black text-slate-500 dark:text-slate-400">보기글 선택</p>
                            <div className="mt-2 grid gap-2 md:grid-cols-3">
                                {MESSAGE_TEMPLATES.map((template) => (
                                    <button key={template} type="button" onClick={() => setDraft({ ...draft, coreMessage: template })} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-xs font-bold leading-5 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800">
                                        {template}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <section className="space-y-3">
                        {draft.risks.map((item, index) => (
                            <article key={item.id} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[0.7fr_1.3fr]">
                                <label className="text-sm font-black">주요 위험 {index + 1}<input value={item.risk} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, risk: event.target.value } : risk) })} className="mt-2 w-full rounded-xl border px-3 py-3" /></label>
                                <label className="text-sm font-black">핵심 안전조치<textarea value={item.action} onChange={(event) => setDraft({ ...draft, risks: draft.risks.map((risk) => risk.id === item.id ? { ...risk, action: event.target.value } : risk) })} rows={2} className="mt-2 w-full rounded-xl border p-3" /></label>
                                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 md:col-span-2">선정 근거: {item.evidenceLabels.join(' · ')}</p>
                            </article>
                        ))}
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <div className="flex items-center justify-between gap-3">
                            <h3 className="text-lg font-black">현장 실천 확인</h3>
                            <button type="button" onClick={() => setDraft({ ...draft, checklist: CHECKLIST_TEMPLATES })} className="text-xs font-black text-blue-700 dark:text-blue-300">보기글 적용</button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                            {draft.checklist.map((item, index) => (
                                <input key={index} value={item} onChange={(event) => setDraft({ ...draft, checklist: updateAt(draft.checklist, index, event.target.value) })} className="rounded-xl border px-3 py-3 text-sm font-semibold" />
                            ))}
                        </div>
                    </section>
                    <button type="button" onClick={() => setActiveTab('preview')} className="min-h-12 w-full rounded-xl bg-blue-700 px-5 py-4 text-sm font-black text-white">
                        완성된 한 장 확인
                    </button>
                </div>
            )}

            {(activeTab === 'preview' || activeTab === 'editor') && (
                <section className={activeTab === 'editor' ? 'hidden' : ''}>
                    <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-bold no-print ${
                        a4FitMode === 'dense'
                            ? 'border-orange-300 bg-orange-50 text-orange-950 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-100'
                            : a4FitMode === 'compact'
                                ? 'border-blue-300 bg-blue-50 text-blue-950 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100'
                                : 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100'
                    }`}>
                        <span>{a4FitInfo.label}</span>
                        <span className="text-xs font-semibold opacity-80">{a4FitInfo.detail}</span>
                        <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-black dark:bg-slate-950/40">
                            {isOverflowing ? '고밀도 재배치 확인 중' : '출력 1장 고정'}
                        </span>
                    </div>

                    {/* 언어 선택 탭 */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl mb-4 no-print">
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => setPreviewLanguage('ko-KR')}
                                className={`px-4 py-2 text-xs font-black rounded-xl border transition-all flex items-center gap-1.5 ${
                                    previewLanguage === 'ko-KR'
                                        ? 'bg-blue-700 border-blue-700 text-white shadow-sm'
                                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
                                }`}
                            >
                                <CountryFlag code="ko-KR" />
                                한국어 원문
                            </button>
                            {Object.entries(translatedTexts).map(([code, text]) => {
                                if (code === '__quality__' || !text) return null;
                                return (
                                    <button
                                        key={code}
                                        type="button"
                                        onClick={() => setPreviewLanguage(code)}
                                        className={`px-4 py-2 text-xs font-black rounded-xl border transition-all flex items-center gap-1.5 ${
                                            previewLanguage === code
                                                ? 'bg-blue-700 border-blue-700 text-white shadow-sm'
                                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-200'
                                        }`}
                                    >
                                        <CountryFlag code={code} />
                                        {TRAINING_LANGUAGE_LABELS[code as keyof typeof TRAINING_LANGUAGE_LABELS] || code}
                                        {translationNeedsRefresh && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] text-amber-800">이전 번역</span>}
                                    </button>
                                );
                            })}
                        </div>
                        
                        {/* 분할 대조 뷰 / 단독 뷰 토글 (다국어가 선택된 경우만 노출) */}
                        {previewLanguage !== 'ko-KR' && (
                            <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setViewMode('split')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        viewMode === 'split'
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    검수용 좌우대조
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setViewMode('single')}
                                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition-all ${
                                        viewMode === 'single'
                                            ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                                            : 'text-slate-500 hover:text-slate-800'
                                    }`}
                                >
                                    언어별 출력본
                                </button>
                            </div>
                        )}
                    </div>

                    {translationNeedsRefresh && (
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-950 no-print dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                            <div className="max-w-4xl">
                                <p>5단계 검수 또는 한 장 편집으로 한국어 원문이 바뀌었습니다.</p>
                                <p className="mt-1 text-xs leading-5 opacity-90">
                                    다음 순서로 진행하세요: 수정본 그대로 다국어만 갱신 선택 → 요청문 복사 → 외부 AI 답변 붙여넣기 → 교육자료 초안에 반영 → 출력 확인에서 언어별 저장.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setActiveTab('ai')}
                                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black text-white hover:bg-amber-700"
                            >
                                다국어 재생성 단계로 이동
                            </button>
                        </div>
                    )}

                    <article ref={sheetRef} data-report-template-root="true" className="mx-auto w-[210mm] max-w-full bg-white text-slate-900 shadow-2xl">
                        <div
                            data-report-page="true"
                            data-a4-fit-mode={a4FitMode}
                            className={`flex h-[297mm] w-[210mm] max-w-full flex-col overflow-hidden bg-white ${
                                a4FitMode === 'dense' ? 'p-[8mm]' : a4FitMode === 'compact' ? 'p-[10mm]' : 'p-[11mm]'
                            }`}
                        >
                            {previewLanguage === 'ko-KR' ? (
                                <>
                                    <header className="shrink-0 border-b-[5px] border-orange-500 pb-3">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-[12px] font-black text-blue-700">PSI 위험성평가 전파교육</p>
                                                <h1
                                                    className="mt-1.5 font-black leading-tight break-keep"
                                                    style={{
                                                        fontSize: a4FitMode === 'dense'
                                                            ? '18px'
                                                            : a4FitMode === 'compact'
                                                                ? '21px'
                                                                : '25px',
                                                    }}
                                                >
                                                    {a4KoreanPrint.title}
                                                </h1>
                                            </div>
                                            <div className="shrink-0 rounded-xl bg-blue-950 px-4 py-3 text-center text-white">
                                                <p className="text-[10px] font-bold text-blue-200">교육 대상</p>
                                                <p className="mt-1 text-sm font-black">{draft.workType}</p>
                                            </div>
                                        </div>
                                        <p className="mt-2 text-[12px] font-semibold leading-5 text-slate-600">{a4KoreanPrint.opening}</p>
                                    </header>

                                    <section className={`mt-3 shrink-0 rounded-2xl bg-blue-950 text-white ${a4FitMode === 'dense' ? 'p-3' : 'p-4'}`}>
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-[11px] font-black text-blue-200">오늘 반드시 전달할 한 문장</p>
                                            <span className="rounded-full bg-white/15 px-2.5 py-1 text-[9px] font-black">{a4FitInfo.label}</span>
                                        </div>
                                        <p
                                            className="mt-1.5 font-black"
                                            style={{
                                                fontSize: a4FitMode === 'dense' ? '16px' : a4FitMode === 'compact' ? '18px' : '20px',
                                                lineHeight: a4FitMode === 'dense' ? '23px' : '28px',
                                            }}
                                        >
                                            {a4KoreanPrint.coreMessage}
                                        </p>
                                    </section>

                                    <section className={`mt-3 grid shrink-0 grid-cols-2 gap-3 ${a4FitMode === 'dense' ? 'text-[10px]' : ''}`}>
                                        <article className={`rounded-2xl border border-blue-200 bg-blue-50 ${a4FitMode === 'dense' ? 'p-3' : 'p-4'}`}>
                                            <p className="text-[10px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                            <h2 className="mt-1 text-base font-black">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 · {draft.videoScenes.length}장면</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{a4KoreanPrint.videoSummary}</p>
                                        </article>
                                        <article className={`rounded-2xl border border-amber-200 bg-amber-50 ${a4FitMode === 'dense' ? 'p-3' : 'p-4'}`}>
                                            <p className="text-[10px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                            <h2 className="mt-1 text-base font-black">{a4KoreanPrint.accidentTitle}</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{a4KoreanPrint.accidentBody}</p>
                                            <p className="mt-1 text-[10px] font-bold text-amber-800">출처: {a4KoreanPrint.accidentMeta}</p>
                                        </article>
                                    </section>

                                    <section className="mt-3 shrink-0">
                                        <div className="flex items-center justify-between">
                                            <h2 className="text-sm font-black text-rose-700">3. 위험성평가 상등급 공유</h2>
                                            <span className="text-[9px] font-black text-slate-400">우선순위 막대는 입력 근거 강도를 시각화합니다.</span>
                                        </div>
                                        {a4KoreanPrint.risks.length > 0 ? (
                                            <div className="mt-2 grid grid-cols-3 gap-3">
                                                {a4KoreanPrint.risks.map((item, index) => (
                                                    <article key={item.id} className={`rounded-xl border border-rose-200 bg-white ${a4FitMode === 'dense' ? 'p-2.5' : 'p-3'}`}>
                                                        <div className="flex items-center justify-between gap-2">
                                                            <h3 className="text-sm font-black leading-tight"><span className="mr-1 text-rose-600">TOP{index + 1}</span>{item.risk}</h3>
                                                            <span className={`rounded px-2 py-1 text-[9px] font-black ${item.managerConfirmed ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.managerConfirmed ? '상등급 확인' : '확인 필요'}</span>
                                                        </div>
                                                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rose-100">
                                                            <div className="h-full rounded-full bg-rose-500" style={{ width: `${item.priorityPct}%` }} />
                                                        </div>
                                                        <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">{item.action}</p>
                                                        <p className="mt-2 text-[9px] font-bold text-slate-500">담당: {item.owner}</p>
                                                    </article>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-2 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-3 text-center text-[10px] font-bold leading-4 text-rose-700">
                                                회의자료에서 상등급으로 지정된 공유 항목이 없습니다. 일반 추천 위험은 이 영역에 표시하지 않습니다.
                                            </div>
                                        )}
                                    </section>

                                    <section className="mt-3 grid shrink-0 grid-cols-2 gap-4">
                                        <div className="min-h-0">
                                            <h2 className="text-sm font-black text-emerald-700">4. 현장 중점관리 포인트</h2>
                                            <ol className="mt-2 space-y-1.5">
                                                {a4KoreanPrint.focusPoints.map((item, index) => (
                                                    <li key={index} className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4">
                                                        <b className="text-emerald-700">{index + 1}</b><span>{item}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                        <div className="min-h-0">
                                            <h2 className="text-sm font-black text-violet-700">5. 공지사항</h2>
                                            <ul className="mt-2 space-y-1.5">
                                                {a4KoreanPrint.notices.map((notice, index) => (
                                                    <li key={index} className="rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold leading-4">{notice}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </section>

                                    <section className={`mt-3 shrink-0 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 ${a4FitMode === 'dense' ? 'p-2.5' : 'p-3'}`}>
                                        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">이해 확인</h2>
                                                {a4KoreanPrint.questions.map((question, index) => <p key={index} className="mt-1 text-[10px] font-bold leading-4 text-orange-900">Q{index + 1}. {question}</p>)}
                                            </div>
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">행동 약속</h2>
                                                <p className="mt-1 text-[10px] font-bold leading-4 text-orange-900">{a4KoreanPrint.closingCommitment}</p>
                                            </div>
                                        </div>
                                    </section>

                                    <footer className="mt-auto flex shrink-0 items-end justify-between border-t border-slate-200 pt-3 text-[10px] font-semibold text-slate-500">
                                        <div>
                                            <p>근거 자료 {draft.sourceCount}개 · 생성 {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</p>
                                            <p className="mt-1">
                                                관리자가 최종 확인한 후 교육에 사용합니다.
                                                {a4KoreanPrint.hiddenCount > 0 && <span className="ml-2 font-black text-blue-700">추가 세부내용 {a4KoreanPrint.hiddenCount}건은 관리자 보관자료</span>}
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-center">
                                            <span className="w-20 border-b border-slate-400 pb-1">교육자</span>
                                            <span className="w-20 border-b border-slate-400 pb-1">확인자</span>
                                        </div>
                                    </footer>
                                </>
                            ) : viewMode === 'split' ? (
                                <div className="grid grid-cols-2 gap-6 h-full overflow-hidden text-slate-900">
                                    {/* 좌측: 한국어 요약 */}
                                    <div className="flex flex-col h-full border-r border-slate-200 pr-5">
                                        <header className="border-b-[3px] border-orange-500 pb-3">
                                            <p className="text-[10px] font-black text-blue-700">위험성평가 전파교육 (요약)</p>
                                            <h2 className="mt-1 text-base font-black leading-tight break-keep">{a4KoreanPrint.title}</h2>
                                            <p className="text-[10px] font-bold text-slate-500 mt-1">대상: {draft.workType} · 적용: {targetPeriod.label}</p>
                                        </header>
                                        
                                        <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                            <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                                <p className="text-[10px] font-bold mt-1">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초</p>
                                                <p className="mt-1 text-[9px] leading-normal text-slate-600">{a4KoreanPrint.videoSummary}</p>
                                            </article>

                                            <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                                <p className="mt-1 text-[10px] font-bold">{a4KoreanPrint.accidentTitle}</p>
                                                <p className="mt-1 text-[9px] leading-normal text-slate-600">{a4KoreanPrint.accidentBody}</p>
                                            </article>

                                            <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-rose-700">3. 위험성평가 상등급 공유</p>
                                                <div className="space-y-1.5 mt-1.5">
                                                    {a4KoreanPrint.risks.length > 0 ? a4KoreanPrint.risks.map((item) => (
                                                        <div key={item.id} className="text-[9px] leading-normal">
                                                            <b className="text-slate-800">• {item.risk}</b>: <span>{item.action}</span> <span className="text-slate-400">({item.owner})</span>
                                                        </div>
                                                    )) : (
                                                        <p className="text-[9px] font-bold leading-normal text-rose-700">상등급으로 확인된 공유 항목이 없습니다.</p>
                                                    )}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-emerald-700">4. 현장 중점관리 및 공지사항</p>
                                                <div className="space-y-1 mt-1 text-[9px] leading-normal text-slate-700">
                                                    {a4KoreanPrint.focusPoints.slice(0, 2).map((item, idx) => (
                                                        <div key={idx}>- {item}</div>
                                                    ))}
                                                    {a4KoreanPrint.notices.slice(0, 1).map((item, idx) => (
                                                        <div key={idx}>- {item}</div>
                                                    ))}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-orange-800">5. 이해 확인과 행동 약속</p>
                                                <p className="mt-1 text-[9px] font-bold leading-relaxed text-slate-800">{a4KoreanPrint.closingCommitment}</p>
                                            </article>
                                        </div>
                                        
                                        <footer className="border-t border-slate-200 pt-3 text-[9px] font-bold text-slate-500 mt-auto">
                                            <div className="flex justify-between items-center">
                                                <span>교육자: (인) / 확인자: (인)</span>
                                                <span>생성: {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</span>
                                            </div>
                                        </footer>
                                    </div>

                                    {/* 우측: 다국어 번역 전문 (구조화 매칭) */}
                                    <div className="flex flex-col h-full pl-3 overflow-hidden">
                                        {(() => {
                                            const parsed = parseTbmTranslation(previewTranslationText);
                                            const compact = buildA4TranslationPrintContent(parsed, a4FitMode);

                                            const loc = getTbmLocalization(previewLanguage);
                                            const nativeName = NATIVE_LANGUAGE_NAMES[normalizeLanguageCode(previewLanguage)] || previewLanguage;

                                            return (
                                                <>
                                                    <header className="border-b-[3px] border-blue-900 pb-3 flex items-center justify-between">
                                                        <div>
                                                            <p className="text-[10px] font-black text-indigo-700 flex items-center gap-1.5">
                                                                <CountryFlag code={previewLanguage} />
                                                                {loc.headerTitle} ({nativeName})
                                                            </p>
                                                            <h2 className="mt-1 text-xs font-black leading-tight text-slate-500 break-keep">{compact.title}</h2>
                                                        </div>
                                                    </header>
                                                    
                                                    <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                                        <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-blue-700">{loc.videoTitle}</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {compact.videoLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-amber-700">{loc.accidentTitle}</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {compact.accidentLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-rose-700">{loc.risksTitle}</p>
                                                            <div className="space-y-1 mt-1">
                                                                {compact.riskLines.map((line, idx) => (
                                                                    <div key={idx} className="text-[9.5px] leading-normal text-slate-700">
                                                                        • {line}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-emerald-700">{loc.focusTitle} & {loc.noticeTitle}</p>
                                                            <div className="space-y-1 mt-1 text-[9.5px] leading-normal text-slate-700">
                                                                {compact.focusLines.map((item, idx) => (
                                                                    <div key={idx}>- {item}</div>
                                                                ))}
                                                                {compact.noticeLines.map((item, idx) => (
                                                                    <div key={idx}>- {item}</div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-orange-800">{loc.pledgeBoxTitle}</p>
                                                            <div className="space-y-0.5 mt-1 text-[9.5px] leading-relaxed text-slate-800 font-semibold">
                                                                {compact.pledgeLines.slice(-2).map((line, idx) => (
                                                                    <p key={idx}>{line}</p>
                                                                ))}
                                                            </div>
                                                        </article>
                                                    </div>
                                                    
                                                    <footer className="border-t border-slate-200 pt-3 text-[9px] font-bold text-slate-500 mt-auto">
                                                        <div className="flex justify-between items-center">
                                                            <span>{loc.signInstructor}</span>
                                                            <span>{compact.hiddenCount > 0 ? `+${compact.hiddenCount} 보관` : `${loc.dateLabel}: ${new Date(draft.generatedAt).toLocaleDateString('ko-KR')}`}</span>
                                                        </div>
                                                    </footer>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col h-full text-slate-900">
                                    {(() => {
                                        const parsed = parseTbmTranslation(previewTranslationText);
                                        const compact = buildA4TranslationPrintContent(parsed, a4FitMode);

                                        const qLines = compact.pledgeLines.filter(line => line.startsWith('Q') || /^[qQ][0-9]/.test(line) || line.toLowerCase().includes('question') || line.includes('?'));
                                        const commitmentLines = compact.pledgeLines.filter(line => !qLines.includes(line));

                                        const loc = getTbmLocalization(previewLanguage);
                                        const nativeName = NATIVE_LANGUAGE_NAMES[normalizeLanguageCode(previewLanguage)] || previewLanguage;

                                        return (
                                            <>
                                                <header className="shrink-0 border-b-[5px] border-orange-500 pb-3">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <p className="text-xs font-black text-blue-700 flex items-center gap-1.5">
                                                                <CountryFlag code={previewLanguage} width={20} />
                                                                {loc.headerTitle} ({nativeName})
                                                            </p>
                                                            <h1
                                                                className="mt-1.5 font-black leading-tight text-slate-900 break-keep"
                                                                style={{
                                                                    fontSize: a4FitMode === 'dense'
                                                                        ? '17px'
                                                                        : compact.title.length > 22
                                                                            ? '18px'
                                                                            : '21px',
                                                                }}
                                                            >
                                                                {compact.title}
                                                            </h1>
                                                        </div>
                                                        <div className="rounded-xl bg-blue-950 px-3 py-2 text-center text-white shrink-0">
                                                            <p className="text-[9px] font-bold text-blue-200">{loc.targetLabel}</p>
                                                            <p className="mt-0.5 text-xs font-black">{draft.workType}</p>
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">{compact.opening}</p>
                                                </header>

                                                <section className="mt-3 grid shrink-0 grid-cols-2 gap-3">
                                                    <article className={`rounded-2xl border border-blue-200 bg-blue-50/50 ${a4FitMode === 'dense' ? 'p-2.5' : 'p-3.5'}`}>
                                                        <p className="text-[9px] font-black text-blue-700">{loc.videoTitle}</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">{loc.videoTitle}</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {compact.videoLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {compact.videoLines.length === 0 && <p className="text-[10.5px] text-slate-400">{loc.noVideoScenes}</p>}
                                                        </div>
                                                    </article>
                                                    <article className={`rounded-2xl border border-amber-200 bg-amber-50/50 ${a4FitMode === 'dense' ? 'p-2.5' : 'p-3.5'}`}>
                                                        <p className="text-[9px] font-black text-amber-700">{loc.accidentTitle}</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">{loc.accidentTitle}</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {compact.accidentLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {compact.accidentLines.length === 0 && <p className="text-[10.5px] text-slate-400">{loc.noAccidents}</p>}
                                                        </div>
                                                    </article>
                                                </section>

                                                <section className="mt-3 shrink-0">
                                                    <h2 className="text-xs font-black text-rose-700">{loc.risksTitle}</h2>
                                                    <div className="mt-1.5 grid grid-cols-3 gap-3">
                                                        {compact.riskLines.map((line, idx) => (
                                                            <article key={idx} className="rounded-xl border border-rose-200 p-2.5 bg-rose-50/30 flex flex-col justify-between">
                                                                <p className="text-[10px] font-semibold leading-relaxed text-slate-700">{line}</p>
                                                            </article>
                                                        ))}
                                                        {compact.riskLines.length === 0 && (
                                                            <p className="text-[10.5px] text-slate-400 col-span-3 text-center py-2">{loc.noRisks}</p>
                                                        )}
                                                    </div>
                                                </section>

                                                <section className="mt-3 grid shrink-0 grid-cols-2 gap-3">
                                                    <div>
                                                        <h2 className="text-xs font-black text-emerald-700">{loc.focusTitle}</h2>
                                                        <ol className="mt-1.5 space-y-1">
                                                            {compact.focusLines.map((item, index) => (
                                                                <li key={index} className="flex gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed">
                                                                    <b className="text-emerald-700">{index + 1}</b>
                                                                    <span className="text-slate-700">{item}</span>
                                                                </li>
                                                            ))}
                                                            {compact.focusLines.length === 0 && <li className="text-[10.5px] text-slate-400">{loc.noFocus}</li>}
                                                        </ol>
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xs font-black text-violet-700">{loc.noticeTitle}</h2>
                                                        <ul className="mt-1.5 space-y-1">
                                                            {compact.noticeLines.map((notice, index) => (
                                                                <li key={index} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed text-slate-700">{notice}</li>
                                                            ))}
                                                            {compact.noticeLines.length === 0 && <li className="text-[10.5px] text-slate-400">{loc.noNotices}</li>}
                                                        </ul>
                                                    </div>
                                                </section>

                                                <section className="mt-3 shrink-0 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-2.5">
                                                    <div className="grid grid-cols-[1fr_1.2fr] gap-3">
                                                        <div>
                                                            <h2 className="text-[10.5px] font-black text-orange-900">{loc.qLabel}</h2>
                                                            {qLines.map((question, index) => (
                                                                <p key={index} className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{question}</p>
                                                            ))}
                                                            {qLines.length === 0 && (
                                                                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{loc.qPlaceholder}</p>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h2 className="text-[10.5px] font-black text-orange-900">{loc.pledgeLabel}</h2>
                                                            {commitmentLines.map((line, index) => (
                                                                <p key={index} className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{line}</p>
                                                            ))}
                                                            {commitmentLines.length === 0 && (
                                                                <p className="mt-0.5 text-[10px] font-bold leading-relaxed text-orange-900">{loc.pledgePlaceholder}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </section>

                                                <footer className="mt-auto flex items-end justify-between border-t border-slate-200 pt-3 text-[9px] font-semibold text-slate-400">
                                                    <div>
                                                        <p>{loc.headerTitle} ({nativeName})</p>
                                                        <p className="mt-0.5">
                                                            {loc.footerNotice}
                                                            {compact.hiddenCount > 0 && <span className="ml-2 font-black text-blue-700">+{compact.hiddenCount} stored</span>}
                                                        </p>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-2 text-center text-slate-500 shrink-0">
                                                        <span className="w-16 border-b border-slate-300 pb-0.5">{loc.signInstructor}</span>
                                                        <span className="w-16 border-b border-slate-300 pb-0.5">{loc.signConfirmer}</span>
                                                    </div>
                                                </footer>
                                            </>
                                        );
                                    })()}
                                </div>
                            )}
                        </div>
                    </article>

                    <div className="mt-4 grid gap-2 sm:grid-cols-4 no-print">
                        <button type="button" disabled={isExporting || currentPreviewIsStaleTranslation} onClick={() => void exportImage()} className="min-h-12 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-800 disabled:opacity-50 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-200">PNG 이미지</button>
                        <button type="button" disabled={isExporting || currentPreviewIsStaleTranslation} onClick={() => void exportPdf()} className="min-h-12 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PDF 저장</button>
                        <button type="button" disabled={isExporting || currentPreviewIsStaleTranslation} onClick={() => void exportPptx()} className="min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PPTX 저장</button>
                        <button type="button" disabled={currentPreviewIsStaleTranslation} onClick={() => { if (!blockStaleTranslationExport()) window.print(); }} className="min-h-12 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900">A4 요약 인쇄</button>
                    </div>
                    {currentPreviewIsStaleTranslation && (
                        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-900 no-print dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                            이 외국어 화면은 이전 번역 대조용입니다. 현재 수정본으로 다국어를 갱신한 뒤 저장할 수 있습니다.
                        </p>
                    )}
                    {Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code]).length > 0 && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 no-print border-t border-slate-200 dark:border-slate-800 pt-3">
                            <button type="button" disabled={isExporting || translationNeedsRefresh} onClick={() => void exportAllImages()} className="min-h-12 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-sm font-black text-blue-900 hover:bg-blue-50 disabled:opacity-50">전체 다국어 PNG 이미지 일괄 저장</button>
                            <button type="button" disabled={isExporting || translationNeedsRefresh} onClick={() => void exportAllPdfs()} className="min-h-12 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-sm font-black text-indigo-900 hover:bg-indigo-50 disabled:opacity-50">전체 다국어 PDF 일괄 저장</button>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default A4EducationMaterial;
