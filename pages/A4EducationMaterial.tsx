import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalAiHandoffPanel } from '../components/tbm/ExternalAiHandoffPanel';
import { CountryFlag } from '../components/shared/CountryFlag';
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
    getTbmEducationScopeKey,
    normalizeTbmEducationDraft,
    TBM_MONTHLY_PACKAGE_STORAGE_KEY,
    type TbmEducationDraft,
    type TbmEvidenceSource,
    type TbmMonthlyPackagePayload,
} from '../utils/tbmEducationStudio';
import { extractTbmSourceFromFile } from '../utils/tbmSourceExtraction';

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
): StoredStudioState => ({
    educationMonth,
    workType,
    sources: [],
    draft: buildTbmEducationDraft({
        workerRecords,
        sources: [],
        month: educationMonth,
        workType,
    }),
    translatedTexts: {},
    translationSourceText: '',
});

const updateAt = (items: string[], index: number, value: string): string[] =>
    items.map((item, itemIndex) => itemIndex === index ? value : item);

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
        risksTitle: '3. 다음 달 위험성평가 상등급 공유',
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
        headerTitle: 'PSI TBM Safety Guide',
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
        headerTitle: 'Hướng dẫn An toàn PSI TBM',
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
        headerTitle: 'PSI TBM 安全指南',
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
        headerTitle: 'คู่มือความปลอดภัย PSI TBM',
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
        headerTitle: 'PSI TBM សៀវភៅណែនាំសុវត្ថិភាព',
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
        headerTitle: 'PSI TBM Xavfsizlik Qo\'llanmasi',
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
        headerTitle: 'PSI TBM ဘေးကင်းရေးလမ်းညွှန်',
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
        headerTitle: 'PSI TBM Хөдөлмөр хамгааллын зааварчилгаа',
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
        headerTitle: 'Инструкция по технике безопасности PSI TBM',
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
        headerTitle: 'Panduan Keselamatan PSI TBM',
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
        headerTitle: 'PSI TBM सुरक्षा निर्देशिका',
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
        headerTitle: 'PSI TBM Gabay sa Kaligtasan',
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
        title: title || 'TBM Safety Guide',
        opening: opening || 'Please review the safety guidelines carefully before beginning work.',
        videoText: videoLines.join('\n'),
        accidentText: accidentLines.join('\n'),
        risksText: riskLines.join('\n'),
        focusText: focusLines.join('\n'),
        noticesText: noticeLines.join('\n'),
        pledgeText: pledgeLines.join('\n'),
    };
};

const A4EducationMaterial: React.FC<Props> = ({ workerRecords, onOpenTraining }) => {
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
        initialState?.draft || createFreshStudioState(workerRecords, initialEducationMonth, initialWorkType).draft,
    );
    const [previewLanguage, setPreviewLanguage] = useState<string>('ko-KR');
    const [viewMode, setViewMode] = useState<'split' | 'single'>('split');
    const [isOverflowing, setIsOverflowing] = useState(false);
    const sheetRef = useRef<HTMLElement>(null);

    const workTypes = useMemo(
        () => [DEFAULT_WORK_TYPE, ...Array.from(new Set(workerRecords.map((item) => item.jobField).filter(Boolean))).sort()],
        [workerRecords],
    );
    const fieldSource = useMemo(
        () => buildFieldRecordSource(workerRecords, workType),
        [workerRecords, workType],
    );
    const allSources = useMemo(
        () => fieldSource ? [fieldSource, ...sources] : sources,
        [fieldSource, sources],
    );
    const estimatedTokens = estimateEducationTokens(allSources);
    const videoDuration = getFiveMinuteVideoDuration(draft);

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
            setNotice(`${nextMonth} · ${nextWorkType} 저장본을 불러왔습니다. 다른 월의 영상/공지/번역은 섞지 않습니다.`);
            return;
        }

        applyStudioState(createFreshStudioState(workerRecords, nextMonth, nextWorkType));
        setNotice(`${nextMonth} · ${nextWorkType} 새 교육자료를 시작했습니다. 지난달 영상·사고사례·공지사항은 자동 복사하지 않습니다.`);
    };

    // 실시간 오버플로우(A4 1장 범위 초과) 감지
    useEffect(() => {
        if (activeTab !== 'preview') {
            setIsOverflowing(false);
            return;
        }
        const checkOverflow = () => {
            const pageEl = sheetRef.current?.querySelector('[data-report-page="true"]');
            if (pageEl) {
                const hasOverflow = pageEl.scrollHeight > pageEl.clientHeight;
                setIsOverflowing(hasOverflow);
            }
        };

        const timer = setTimeout(checkOverflow, 400);
        return () => clearTimeout(timer);
    }, [activeTab, draft, previewLanguage, viewMode, translatedTexts]);

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
            workerRecords,
            sources,
            month: educationMonth,
            workType,
            coreMessage: draft.coreMessage,
        });
        setDraft(nextDraft);
        setTranslatedTexts({});
        setTranslationSourceText('');
        setActiveTab('package');
        setNotice('근거 자료를 기준으로 5단계 월간 교육 패키지를 다시 구성했습니다.');
    };

    const resetStudio = () => {
        const month = getNextMonth();
        applyStudioState(createFreshStudioState(workerRecords, month, DEFAULT_WORK_TYPE));
        setNotice('교육자료 작업 내용을 초기화했습니다.');
    };

    const addManualSource = () => {
        const text = manualText.trim();
        if (!text) {
            setNotice('붙여넣을 교육 내용이나 다음 달 작업계획을 입력해 주세요.');
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
        const sourceText = buildMonthlyEducationPackageText(draft);
        const translationsMatchCurrentDraft = translationSourceText === sourceText;
        const payload: TbmMonthlyPackagePayload = {
            draft,
            sourceText,
            translatedTexts: translationsMatchCurrentDraft ? translatedTexts : {},
            savedAt: new Date().toISOString(),
            month: draft.month,
            workType: draft.workType,
            title: draft.title,
            scopeKey: getTbmEducationScopeKey(draft.month, draft.workType),
        };
        localStorage.setItem(TBM_MONTHLY_PACKAGE_STORAGE_KEY, JSON.stringify(payload));
        setNotice(
            translationsMatchCurrentDraft || Object.keys(translatedTexts).length === 0
                ? '5단계 교육 원문을 다국어 교육에 전달했습니다.'
                : '한국어 초안이 수정되어 기존 AI 번역은 제외했습니다. 배포 단계에서 현재 원문 기준으로 번역합니다.',
        );
        onOpenTraining?.();
    };

    const importExternalAiDraft = (
        nextDraft: TbmEducationDraft,
        nextTranslations: Record<string, string>,
    ) => {
        setDraft(nextDraft);
        setTranslatedTexts(nextTranslations);
        setTranslationSourceText(buildMonthlyEducationPackageText(nextDraft));
        setActiveTab('package');
        const translationCount = Object.keys(nextTranslations).length;
        setNotice(
            translationCount > 0
                ? `AI 초안과 다국어 결과 ${translationCount}개를 반영했습니다. 5단계 내용을 검수해 주세요.`
                : 'AI 초안을 반영했습니다. 5단계 내용을 검수해 주세요.',
        );
    };

    const captureSheet = async () => {
        if (!sheetRef.current) throw new Error('내보낼 한 장 자료를 찾지 못했습니다.');
        const html2canvas = await ensureHtml2Canvas();
        return captureReportCanvas(sheetRef.current, html2canvas, { scale: 3 });
    };

    const exportImage = async () => {
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
        setIsExporting(true);
        try {
            const canvas = await captureSheet();
            const { default: PptxGenJS } = await import('pptxgenjs');
            const pptx = new PptxGenJS();
            pptx.defineLayout({ name: 'PSI_A4', width: 8.27, height: 11.69 });
            pptx.layout = 'PSI_A4';
            pptx.author = 'PSI';
            pptx.subject = '다음 달 위험성평가 전파교육';
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
        setIsExporting(true);
        const originalLang = previewLanguage;
        const targetLanguages = ['ko-KR', ...Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code])];
        
        try {
            for (const lang of targetLanguages) {
                setPreviewLanguage(lang);
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
            setIsExporting(false);
        }
    };

    const exportAllPdfs = async () => {
        setIsExporting(true);
        const originalLang = previewLanguage;
        const targetLanguages = ['ko-KR', ...Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code])];
        
        try {
            const JsPDF = await ensureJsPdfConstructor();
            if (!JsPDF) throw new Error('PDF 생성 도구를 불러오지 못했습니다.');
            
            for (const lang of targetLanguages) {
                setPreviewLanguage(lang);
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
            setIsExporting(false);
        }
    };

    return (
        <div className="psi-page space-y-5 pb-16">
            <section className="psi-enterprise-hero no-print">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-100">Evidence-based TBM Studio</p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">다음 달 TBM 교육자료 스튜디오</h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-blue-50">
                    현장 기록과 첨부자료를 근거로 5단계 전파교육 초안을 만들고, 선택한 AI의 정밀 분석 결과를 한 장 자료·다국어 교육으로 이어갑니다.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-white/15 px-3 py-2">ChatGPT · Claude · Gemini</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">로컬 무료 초안</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">출처 표시</span>
                    <span className="rounded-full bg-white/15 px-3 py-2">PNG · PDF · PPTX</span>
                </div>
            </section>

            {/* 공통 설정 영역 (교육 대상월 및 공종 선택) */}
            <section className="psi-enterprise-panel grid gap-4 p-5 lg:grid-cols-3 no-print">
                <label className="text-sm font-black text-slate-800 dark:text-slate-100">
                    교육 대상월
                    <input type="month" value={educationMonth} onInput={(event) => switchStudioScope(event.currentTarget.value, workType)} className="mt-2 w-full rounded-xl border px-3 py-3 bg-white dark:bg-slate-900" />
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
                                다음 달 작업계획 · 교육 원문 직접 입력
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
                                <button type="button" onClick={() => setActiveTab('ai')} className="psi-button-primary">
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
                                <h3 className="text-lg font-black text-blue-950 dark:text-blue-100">다음 달 위험성평가 5단계 교육 흐름</h3>
                                <p className="mt-1 text-xs font-semibold leading-5 text-blue-700 dark:text-blue-300">공통 이해에서 현장 행동으로 이어지도록 영상 → 사례 → 상등급 → 중점관리 → 공지 순서로 진행하고, 마지막에 이해 확인과 작업중지 약속을 남깁니다.</p>
                            </div>
                            <span className={`rounded-full px-3 py-2 text-xs font-black ${videoDuration === 300 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
                                영상 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 {videoDuration === 300 ? '완료' : '조정 필요'}
                            </span>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                        <h3 className="text-lg font-black">1. 교육 전 5분 핵심 동영상 구성</h3>
                        <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">무료 운영을 위해 MP4 자동 생성 대신 촬영·편집에 바로 쓰는 장면표와 내레이션을 만듭니다.</p>
                        <div className="mt-4 space-y-3">
                            {draft.videoScenes.map((scene, index) => (
                                <article key={scene.id} className="grid gap-3 rounded-xl bg-slate-50 p-4 dark:bg-slate-800 md:grid-cols-[90px_1fr_1fr]">
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
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">2. 최근 재해사례와 현장 연관성</h3>
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
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">3. 다음 달 상등급 위험 공유</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">자동 추천 후 관리자가 등급과 담당자를 최종 확인하고 편집할 수 있습니다.</p>
                            <div className="mt-4 space-y-3">
                                {draft.risks.map((item) => (
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
                                                    onClick={() => setDraft({ ...draft, risks: draft.risks.filter((risk) => risk.id !== item.id) })}
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
                                            risk: '새로운 위험 요인',
                                            action: '작업 전 핵심 안전조치 사항을 여기에 작성하십시오.',
                                            evidenceLabels: ['수동 추가'],
                                            score: 0,
                                            owner: '담당자 지정 필요',
                                            managerConfirmed: true,
                                        };
                                        setDraft({ ...draft, risks: [...draft.risks, newRisk] });
                                    }}
                                    className="min-h-10 w-full rounded-xl border border-dashed border-slate-300 hover:border-slate-400 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                    + 새로운 위험요인 수동 추가
                                </button>
                            </div>
                        </div>
                    </section>

                    <section className="grid gap-4 lg:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">4. 현장 중점관리 포인트</h3>
                            <div className="mt-3 space-y-2">{draft.focusPoints.map((item, index) => <textarea key={index} value={item} onChange={(event) => setDraft({ ...draft, focusPoints: updateAt(draft.focusPoints, index, event.target.value) })} rows={2} aria-label={`현장 중점관리 포인트 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />)}</div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                            <h3 className="text-lg font-black">5. 공지사항</h3>
                            <div className="mt-3 space-y-2">{draft.notices.map((item, index) => <textarea key={index} value={item} onChange={(event) => setDraft({ ...draft, notices: updateAt(draft.notices, index, event.target.value) })} rows={2} aria-label={`공지사항 ${index + 1}`} className="w-full rounded-xl border p-3 text-sm" />)}</div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-5 dark:border-orange-500/30 dark:bg-orange-500/10">
                        <h3 className="text-lg font-black text-orange-950 dark:text-orange-100">교육 마무리: 이해 확인과 행동 약속</h3>
                        <textarea value={draft.closingCommitment} onChange={(event) => setDraft({ ...draft, closingCommitment: event.target.value })} rows={2} aria-label="교육 마무리 행동 약속" className="mt-3 w-full rounded-xl border p-3 text-sm font-bold" />
                        <div className="mt-4 grid gap-2 sm:grid-cols-2">
                            <button type="button" onClick={() => setActiveTab('editor')} className="min-h-12 rounded-xl bg-blue-700 px-5 py-3 text-sm font-black text-white">한 장 자료 편집</button>
                            <button type="button" onClick={sendToTraining} className="min-h-12 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white">다국어 교육 원문으로 보내기</button>
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
                    {/* 오버플로우 경고 배너 */}
                    {isOverflowing && (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 mb-4 flex items-center gap-2 no-print">
                            <span>⚠️</span>
                            <span>입력한 안전 교육 내용이 너무 많아 A4 한 장 범위를 초과했습니다. 실제 인쇄/출력 시 하단 내용이 잘릴 수 있으니 편집 단계에서 문구를 요약해 주세요.</span>
                        </div>
                    )}

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
                                    좌우 대조
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
                                    번역본 단독
                                </button>
                            </div>
                        )}
                    </div>

                    <article ref={sheetRef} data-report-template-root="true" className="mx-auto w-[210mm] max-w-full bg-white text-slate-900 shadow-2xl">
                        <div data-report-page="true" className="flex h-[297mm] w-[210mm] max-w-full flex-col overflow-y-auto print:overflow-hidden bg-white p-[12mm]">
                            {previewLanguage === 'ko-KR' ? (
                                <>
                                    <header className="border-b-[5px] border-orange-500 pb-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <p className="text-sm font-black text-blue-700">PSI 다음 달 위험성평가 전파교육</p>
                                                <h1
                                                    className="mt-2 font-black leading-tight break-keep"
                                                    style={{
                                                        fontSize: draft.title.length > 22
                                                            ? '18px'
                                                            : draft.title.length > 15
                                                                ? '22px'
                                                                : '28px'
                                                    }}
                                                >
                                                    {draft.title}
                                                </h1>
                                            </div>
                                            <div className="rounded-xl bg-blue-950 px-4 py-3 text-center text-white">
                                                <p className="text-[10px] font-bold text-blue-200">교육 대상</p>
                                                <p className="mt-1 text-sm font-black">{draft.workType}</p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm font-semibold text-slate-600">{draft.opening}</p>
                                    </header>

                                    <section className="mt-5 rounded-2xl bg-blue-950 p-5 text-white">
                                        <p className="text-xs font-black text-blue-200">오늘 반드시 전달할 한 문장</p>
                                        <p className="mt-2 text-[20px] font-black leading-8">{draft.coreMessage}</p>
                                    </section>

                                    <section className="mt-4 grid grid-cols-2 gap-3">
                                        <article className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                                            <p className="text-[10px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                            <h2 className="mt-1 text-base font-black">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초 · {draft.videoScenes.length}장면</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{draft.videoScenes.map((scene) => scene.title).join(' → ')}</p>
                                        </article>
                                        <article className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                                            <p className="text-[10px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                            <h2 className="mt-1 text-base font-black">{draft.accidentCases[0]?.title}</h2>
                                            <p className="mt-2 text-xs font-semibold leading-5 text-slate-700">{draft.accidentCases[0]?.siteRelevance}</p>
                                            <p className="mt-1 text-[10px] font-bold text-amber-800">출처: {draft.accidentCases[0]?.source} · {draft.accidentCases[0]?.occurredAt || '발생일 확인 필요'}</p>
                                        </article>
                                    </section>

                                    <section className="mt-4">
                                        <h2 className="text-sm font-black text-rose-700">3. 다음 달 위험성평가 상등급 공유</h2>
                                        <div className="mt-2 grid grid-cols-3 gap-3">
                                            {draft.risks.map((item) => (
                                                <article key={item.id} className="rounded-xl border border-rose-200 p-3">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <h3 className="text-sm font-black">{item.risk}</h3>
                                                        <span className={`rounded px-2 py-1 text-[9px] font-black ${item.managerConfirmed ? 'bg-rose-600 text-white' : 'bg-slate-200 text-slate-600'}`}>{item.managerConfirmed ? '상등급 확인' : '확인 필요'}</span>
                                                    </div>
                                                    <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-600">{item.action}</p>
                                                    <p className="mt-2 text-[9px] font-bold text-slate-500">담당: {item.owner}</p>
                                                </article>
                                            ))}
                                        </div>
                                    </section>

                                    <section className="mt-4 grid grid-cols-2 gap-4">
                                        <div>
                                            <h2 className="text-sm font-black text-emerald-700">4. 현장 중점관리 포인트</h2>
                                            <ol className="mt-2 space-y-1.5">
                                                {draft.focusPoints.slice(0, 3).map((item, index) => (
                                                    <li key={index} className="flex gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[10px] font-bold leading-4">
                                                        <b className="text-emerald-700">{index + 1}</b><span>{item}</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        </div>
                                        <div>
                                            <h2 className="text-sm font-black text-violet-700">5. 공지사항</h2>
                                            <ul className="mt-2 space-y-1.5">
                                                {draft.notices.map((notice, index) => (
                                                    <li key={index} className="rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-bold leading-4">{notice}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </section>

                                    <section className="mt-4 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-3">
                                        <div className="grid grid-cols-[1fr_1.2fr] gap-3">
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">이해 확인</h2>
                                                {draft.confirmationQuestions.slice(0, 2).map((question, index) => <p key={index} className="mt-1 text-[10px] font-bold leading-4 text-orange-900">Q{index + 1}. {question}</p>)}
                                            </div>
                                            <div>
                                                <h2 className="text-xs font-black text-orange-900">행동 약속</h2>
                                                <p className="mt-1 text-[10px] font-bold leading-4 text-orange-900">{draft.closingCommitment}</p>
                                            </div>
                                        </div>
                                    </section>

                                    <footer className="mt-auto flex items-end justify-between border-t border-slate-200 pt-4 text-[10px] font-semibold text-slate-500">
                                        <div>
                                            <p>근거 자료 {draft.sourceCount}개 · 생성 {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</p>
                                            <p className="mt-1">관리자가 현장 조건과 실제 작업계획을 최종 확인한 후 교육에 사용합니다.</p>
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
                                            <p className="text-[10px] font-black text-blue-700">TBM 위험성평가 전파교육 (요약)</p>
                                            <h2 className="text-base font-black leading-tight mt-1 break-keep">{draft.title}</h2>
                                            <p className="text-[10px] font-bold text-slate-500 mt-1">대상: {draft.workType} · 월: {educationMonth}</p>
                                        </header>
                                        
                                        <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                            <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-blue-700">1. 교육 전 5분 핵심 동영상</p>
                                                <p className="text-[10px] font-bold mt-1">총 {Math.floor(videoDuration / 60)}분 {videoDuration % 60}초</p>
                                                <p className="text-[9px] text-slate-600 mt-1 leading-normal truncate">{draft.videoScenes.map((scene) => scene.title).join(' → ')}</p>
                                            </article>

                                            <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-amber-700">2. 최근 재해사례와 현장 연관성</p>
                                                <p className="text-[10px] font-bold mt-1 truncate">{draft.accidentCases[0]?.title}</p>
                                                <p className="text-[9px] text-slate-600 mt-1 leading-normal line-clamp-3">{draft.accidentCases[0]?.siteRelevance}</p>
                                            </article>

                                            <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-rose-700">3. 다음 달 위험성평가 상등급 공유</p>
                                                <div className="space-y-1.5 mt-1.5">
                                                    {draft.risks.map((item) => (
                                                        <div key={item.id} className="text-[9px] leading-normal">
                                                            <b className="text-slate-800">• {item.risk}</b>: {item.action} <span className="text-slate-400">({item.owner})</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-emerald-700">4. 현장 중점관리 및 공지사항</p>
                                                <div className="space-y-1 mt-1 text-[9px] leading-normal text-slate-700">
                                                    {draft.focusPoints.slice(0, 2).map((item, idx) => (
                                                        <div key={idx} className="truncate">- {item}</div>
                                                    ))}
                                                    {draft.notices.slice(0, 1).map((item, idx) => (
                                                        <div key={idx} className="truncate">- {item}</div>
                                                    ))}
                                                </div>
                                            </article>

                                            <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                <p className="text-[9px] font-black text-orange-800">5. 이해 확인과 행동 약속</p>
                                                <p className="text-[9px] font-bold text-slate-800 mt-1 leading-relaxed line-clamp-2">{draft.closingCommitment}</p>
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
                                            const parsed = parseTbmTranslation(translatedTexts[previewLanguage] || '');
                                            const videoLines = parsed.videoText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const accidentLines = parsed.accidentText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const riskLines = parsed.risksText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const focusLines = parsed.focusText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const noticeLines = parsed.noticesText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                            const pledgeLines = parsed.pledgeText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);

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
                                                            <h2 className="text-xs font-black leading-tight mt-1 text-slate-500 break-keep">{parsed.title}</h2>
                                                        </div>
                                                    </header>
                                                    
                                                    <div className="space-y-2.5 mt-3 flex-1 overflow-hidden">
                                                        <article className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-blue-700">{loc.videoTitle}</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {videoLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700 truncate">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-amber-700">{loc.accidentTitle}</p>
                                                            <div className="space-y-0.5 mt-1">
                                                                {accidentLines.map((line, idx) => (
                                                                    <p key={idx} className="text-[9.5px] leading-relaxed text-slate-700 line-clamp-3">• {line}</p>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-rose-700">{loc.risksTitle}</p>
                                                            <div className="space-y-1 mt-1">
                                                                {riskLines.map((line, idx) => (
                                                                    <div key={idx} className="text-[9.5px] leading-normal text-slate-700 line-clamp-2">
                                                                        • {line}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-emerald-700">{loc.focusTitle} & {loc.noticeTitle}</p>
                                                            <div className="space-y-1 mt-1 text-[9.5px] leading-normal text-slate-700">
                                                                {focusLines.slice(0, 2).map((item, idx) => (
                                                                    <div key={idx} className="truncate">- {item}</div>
                                                                ))}
                                                                {noticeLines.slice(0, 1).map((item, idx) => (
                                                                    <div key={idx} className="truncate">- {item}</div>
                                                                ))}
                                                            </div>
                                                        </article>

                                                        <article className="rounded-xl border border-orange-200 bg-orange-50/50 p-2.5">
                                                            <p className="text-[9px] font-black text-orange-800">{loc.pledgeBoxTitle}</p>
                                                            <div className="space-y-0.5 mt-1 text-[9.5px] leading-relaxed text-slate-800 font-semibold">
                                                                {pledgeLines.slice(-2).map((line, idx) => (
                                                                    <p key={idx} className="line-clamp-2">{line}</p>
                                                                ))}
                                                            </div>
                                                        </article>
                                                    </div>
                                                    
                                                    <footer className="border-t border-slate-200 pt-3 text-[9px] font-bold text-slate-500 mt-auto">
                                                        <div className="flex justify-between items-center">
                                                            <span>{loc.signInstructor}</span>
                                                            <span>{loc.dateLabel}: {new Date(draft.generatedAt).toLocaleDateString('ko-KR')}</span>
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
                                        const parsed = parseTbmTranslation(translatedTexts[previewLanguage] || '');
                                        const videoLines = parsed.videoText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const accidentLines = parsed.accidentText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const riskLines = parsed.risksText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const focusLines = parsed.focusText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const noticeLines = parsed.noticesText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);
                                        const pledgeLines = parsed.pledgeText.split('\n').map(l => l.trim().replace(/^-\s*/, '')).filter(Boolean);

                                        const qLines = pledgeLines.filter(line => line.startsWith('Q') || /^[qQ][0-9]/.test(line) || line.toLowerCase().includes('question') || line.includes('?'));
                                        const commitmentLines = pledgeLines.filter(line => !qLines.includes(line));

                                        const loc = getTbmLocalization(previewLanguage);
                                        const nativeName = NATIVE_LANGUAGE_NAMES[normalizeLanguageCode(previewLanguage)] || previewLanguage;

                                        return (
                                            <>
                                                <header className="border-b-[5px] border-orange-500 pb-4">
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div>
                                                            <p className="text-xs font-black text-blue-700 flex items-center gap-1.5">
                                                                <CountryFlag code={previewLanguage} width={20} />
                                                                {loc.headerTitle} ({nativeName})
                                                            </p>
                                                            <h1
                                                                className="mt-1.5 font-black leading-tight text-slate-900 break-keep"
                                                                style={{
                                                                    fontSize: parsed.title.length > 22
                                                                        ? '16px'
                                                                        : parsed.title.length > 15
                                                                            ? '19px'
                                                                            : '22px'
                                                                }}
                                                            >
                                                                {parsed.title}
                                                            </h1>
                                                        </div>
                                                        <div className="rounded-xl bg-blue-950 px-3 py-2 text-center text-white shrink-0">
                                                            <p className="text-[9px] font-bold text-blue-200">{loc.targetLabel}</p>
                                                            <p className="mt-0.5 text-xs font-black">{draft.workType}</p>
                                                        </div>
                                                    </div>
                                                    <p className="mt-2 text-xs font-semibold text-slate-600 leading-relaxed">{parsed.opening}</p>
                                                </header>

                                                <section className="mt-3.5 grid grid-cols-2 gap-3">
                                                    <article className="rounded-2xl border border-blue-200 bg-blue-50/50 p-3.5">
                                                        <p className="text-[9px] font-black text-blue-700">{loc.videoTitle}</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">{loc.videoTitle}</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {videoLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {videoLines.length === 0 && <p className="text-[10.5px] text-slate-400">{loc.noVideoScenes}</p>}
                                                        </div>
                                                    </article>
                                                    <article className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                                                        <p className="text-[9px] font-black text-amber-700">{loc.accidentTitle}</p>
                                                        <h2 className="mt-0.5 text-sm font-black text-slate-800">{loc.accidentTitle}</h2>
                                                        <div className="mt-2 space-y-1">
                                                            {accidentLines.map((line, idx) => (
                                                                <p key={idx} className="text-[10.5px] font-semibold leading-relaxed text-slate-700">• {line}</p>
                                                            ))}
                                                            {accidentLines.length === 0 && <p className="text-[10.5px] text-slate-400">{loc.noAccidents}</p>}
                                                        </div>
                                                    </article>
                                                </section>

                                                <section className="mt-3.5">
                                                    <h2 className="text-xs font-black text-rose-700">{loc.risksTitle}</h2>
                                                    <div className="mt-1.5 grid grid-cols-3 gap-3">
                                                        {riskLines.map((line, idx) => (
                                                            <article key={idx} className="rounded-xl border border-rose-200 p-2.5 bg-rose-50/30 flex flex-col justify-between">
                                                                <p className="text-[10px] font-semibold leading-relaxed text-slate-700">{line}</p>
                                                            </article>
                                                        ))}
                                                        {riskLines.length === 0 && (
                                                            <p className="text-[10.5px] text-slate-400 col-span-3 text-center py-2">{loc.noRisks}</p>
                                                        )}
                                                    </div>
                                                </section>

                                                <section className="mt-3.5 grid grid-cols-2 gap-3">
                                                    <div>
                                                        <h2 className="text-xs font-black text-emerald-700">{loc.focusTitle}</h2>
                                                        <ol className="mt-1.5 space-y-1">
                                                            {focusLines.map((item, index) => (
                                                                <li key={index} className="flex gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed">
                                                                    <b className="text-emerald-700">{index + 1}</b>
                                                                    <span className="text-slate-700">{item}</span>
                                                                </li>
                                                            ))}
                                                            {focusLines.length === 0 && <li className="text-[10.5px] text-slate-400">{loc.noFocus}</li>}
                                                        </ol>
                                                    </div>
                                                    <div>
                                                        <h2 className="text-xs font-black text-violet-700">{loc.noticeTitle}</h2>
                                                        <ul className="mt-1.5 space-y-1">
                                                            {noticeLines.map((notice, index) => (
                                                                <li key={index} className="rounded-lg bg-violet-50 px-2.5 py-1.5 text-[10px] font-bold leading-relaxed text-slate-700">{notice}</li>
                                                            ))}
                                                            {noticeLines.length === 0 && <li className="text-[10.5px] text-slate-400">{loc.noNotices}</li>}
                                                        </ul>
                                                    </div>
                                                </section>

                                                <section className="mt-3.5 rounded-xl border-2 border-dashed border-orange-300 bg-orange-50 p-2.5">
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
                                                        <p className="mt-0.5">{loc.footerNotice}</p>
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
                        <button type="button" disabled={isExporting} onClick={() => void exportImage()} className="min-h-12 rounded-xl border border-blue-200 bg-white px-4 py-3 text-sm font-black text-blue-800 disabled:opacity-50 dark:border-blue-500/40 dark:bg-slate-900 dark:text-blue-200">PNG 이미지</button>
                        <button type="button" disabled={isExporting} onClick={() => void exportPdf()} className="min-h-12 rounded-xl bg-blue-700 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PDF 저장</button>
                        <button type="button" disabled={isExporting} onClick={() => void exportPptx()} className="min-h-12 rounded-xl bg-orange-500 px-4 py-3 text-sm font-black text-white disabled:opacity-50">PPTX 저장</button>
                        <button type="button" onClick={() => window.print()} className="min-h-12 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white dark:bg-slate-100 dark:text-slate-900">A4 요약 인쇄</button>
                    </div>
                    {Object.keys(translatedTexts).filter(code => code !== '__quality__' && translatedTexts[code]).length > 0 && (
                        <div className="mt-2 grid gap-2 sm:grid-cols-2 no-print border-t border-slate-200 dark:border-slate-800 pt-3">
                            <button type="button" disabled={isExporting} onClick={() => void exportAllImages()} className="min-h-12 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 px-4 py-3 text-sm font-black text-blue-900 hover:bg-blue-50 disabled:opacity-50">전체 다국어 PNG 이미지 일괄 저장</button>
                            <button type="button" disabled={isExporting} onClick={() => void exportAllPdfs()} className="min-h-12 rounded-xl border-2 border-dashed border-indigo-300 bg-indigo-50/50 px-4 py-3 text-sm font-black text-indigo-900 hover:bg-indigo-50 disabled:opacity-50">전체 다국어 PDF 일괄 저장</button>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
};

export default A4EducationMaterial;
