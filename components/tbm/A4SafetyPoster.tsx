import React from 'react';
import {
    getHighGradeRiskShareItems,
    type TbmEducationDraft,
    type TbmRiskItem,
} from '../../utils/tbmEducationStudio';
import SafetyPosterIcon, {
    type SafetyPosterIconName,
} from './SafetyPosterIcon';

export type A4SafetyPosterFitMode = 'spacious' | 'balanced' | 'compact' | 'dense';

export interface A4SafetyPosterTranslatedRisk {
    id?: string;
    risk?: string;
    action?: string;
    owner?: string;
}

export interface A4SafetyPosterTranslatedVideoScene {
    title?: string;
    narration?: string;
    visualGuide?: string;
}

export interface A4SafetyPosterTranslationLabels {
    posterBadge: string;
    todayActions: string;
    highGradeRisks: string;
    evidenceStrength: string;
    evidenceSource: string;
    fieldFocus: string;
    noHighGradeRisks: string;
    workSequence: string;
    focusFlow: string;
    requiredPpe: string;
    ppeEvidenceOnly: string;
    emergencyFlow: string;
    stop: string;
    stopBody: string;
    report: string;
    reportBody: string;
    reassess: string;
    reassessBody: string;
    trainer: string;
    worker: string;
    manager: string;
    educationVideo: string;
    sourceCount: string;
    minuteUnit: string;
}

/**
 * Structured, block-level translation accepted by the poster.
 *
 * The first group mirrors the education studio translation contract. Optional
 * poster-only fields let a future translator provide exact work steps, action
 * cards, PPE labels and fixed heading copy without changing the print component.
 */
export interface A4SafetyPosterTranslation {
    languageCode?: string;
    workType?: string;
    title?: string;
    opening?: string;
    coreMessage?: string;
    video?: A4SafetyPosterTranslatedVideoScene[];
    accident?: Array<{
        title?: string;
        occurredAt?: string;
        source?: string;
        summary?: string;
        siteRelevance?: string;
        lesson?: string;
    }>;
    risks?: A4SafetyPosterTranslatedRisk[];
    focus?: string[];
    notices?: string[];
    questions?: string[];
    closingCommitment?: string;
    actions?: string[];
    workSteps?: string[];
    ppe?: Array<{ type: SafetyPosterPpeType; label?: string }>;
    emergency?: Partial<Record<'stop' | 'stopBody' | 'report' | 'reportBody' | 'reassess' | 'reassessBody', string>>;
    labels?: Partial<A4SafetyPosterTranslationLabels>;
}

export interface A4SafetyPosterProps {
    draft: TbmEducationDraft;
    languageCode: string;
    targetPeriodLabel: string;
    fitMode: A4SafetyPosterFitMode;
    videoDuration: number;
    translation?: A4SafetyPosterTranslation | null;
    className?: string;
}

export type SafetyPosterPpeType =
    | 'helmet'
    | 'harness'
    | 'gloves'
    | 'goggles'
    | 'mask'
    | 'boots'
    | 'hearing';

interface PosterPpeItem {
    type: SafetyPosterPpeType;
    label: string;
}

interface PosterPriorityCard {
    id: string;
    title: string;
    body: string;
    owner: string;
    evidenceSegments: number;
    evidenceCount: number;
    source: TbmRiskItem | null;
}

export interface A4SafetyPosterModel {
    title: string;
    workType: string;
    opening: string;
    coreMessage: string;
    actions: string[];
    priorityMode: 'high-grade-risks' | 'field-focus';
    priorityCards: PosterPriorityCard[];
    flowMode: 'work-sequence' | 'focus-flow';
    flowItems: string[];
    ppeItems: PosterPpeItem[];
    closingCommitment: string;
    labels: A4SafetyPosterTranslationLabels;
    contentVolume: 'short' | 'medium' | 'long';
}

const DEFAULT_LABELS_KO: A4SafetyPosterTranslationLabels = {
    posterBadge: '근로자용 안전 한 장',
    todayActions: '오늘 반드시 지킬 3가지',
    highGradeRisks: '회의자료 상등급 위험 TOP 3',
    evidenceStrength: '근거 강도',
    evidenceSource: '확인 자료',
    fieldFocus: '현장 중점관리',
    noHighGradeRisks: '회의자료 상등급 항목 없음',
    workSequence: '작업 순서',
    focusFlow: '중점관리 흐름',
    requiredPpe: '필수 보호구',
    ppeEvidenceOnly: '자료에 명시된 보호구만 표시',
    emergencyFlow: '위험하면 이렇게',
    stop: 'STOP',
    stopBody: '즉시 작업중지',
    report: '보고',
    reportBody: '관리자에게 알림',
    reassess: '재평가',
    reassessBody: '조치 확인 후 재개',
    trainer: '교육자',
    worker: '근로자',
    manager: '관리자',
    educationVideo: '교육영상',
    sourceCount: '근거자료',
    minuteUnit: '분',
};

const DEFAULT_LABELS_EN: A4SafetyPosterTranslationLabels = {
    posterBadge: 'WORKER SAFETY ONE-PAGER',
    todayActions: '3 ACTIONS FOR TODAY',
    highGradeRisks: 'CONFIRMED HIGH-GRADE RISKS · TOP 3',
    evidenceStrength: 'Evidence strength',
    evidenceSource: 'Verified sources',
    fieldFocus: 'FIELD CONTROL FOCUS',
    noHighGradeRisks: 'No high-grade item confirmed in meeting material',
    workSequence: 'WORK SEQUENCE',
    focusFlow: 'CONTROL FLOW',
    requiredPpe: 'REQUIRED PPE',
    ppeEvidenceOnly: 'Only PPE explicitly stated in the source',
    emergencyFlow: 'WHEN CONDITIONS ARE UNSAFE',
    stop: 'STOP',
    stopBody: 'Stop work now',
    report: 'REPORT',
    reportBody: 'Tell the supervisor',
    reassess: 'REASSESS',
    reassessBody: 'Resume after controls are checked',
    trainer: 'Trainer',
    worker: 'Worker',
    manager: 'Manager',
    educationVideo: 'Video',
    sourceCount: 'Sources',
    minuteUnit: 'min',
};

const LABEL_PATCHES: Record<string, A4SafetyPosterTranslationLabels> = {
    vi: {
        posterBadge: 'AN TOÀN MỘT TRANG CHO NGƯỜI LAO ĐỘNG',
        todayActions: '3 ĐIỀU PHẢI LÀM HÔM NAY',
        highGradeRisks: 'TOP 3 RỦI RO CẤP CAO ĐÃ XÁC NHẬN',
        evidenceStrength: 'Mức độ bằng chứng',
        evidenceSource: 'Nguồn đã kiểm tra',
        fieldFocus: 'TRỌNG ĐIỂM KIỂM SOÁT TẠI HIỆN TRƯỜNG',
        noHighGradeRisks: 'Không có hạng mục cấp cao trong tài liệu họp',
        workSequence: 'TRÌNH TỰ CÔNG VIỆC',
        focusFlow: 'TRÌNH TỰ KIỂM SOÁT',
        requiredPpe: 'BẢO HỘ BẮT BUỘC',
        ppeEvidenceOnly: 'Chỉ hiển thị trang bị được nêu rõ trong nguồn',
        emergencyFlow: 'KHI KHÔNG AN TOÀN',
        stop: 'DỪNG',
        stopBody: 'Dừng việc ngay',
        report: 'BÁO CÁO',
        reportBody: 'Báo cho quản lý',
        reassess: 'ĐÁNH GIÁ LẠI',
        reassessBody: 'Chỉ làm lại sau khi kiểm tra',
        trainer: 'Người đào tạo',
        worker: 'Người lao động',
        manager: 'Quản lý',
        educationVideo: 'Video đào tạo',
        sourceCount: 'Nguồn',
        minuteUnit: 'phút',
    },
    zh: {
        posterBadge: '工人安全一页通',
        todayActions: '今天必须做到的3件事',
        highGradeRisks: '会议资料确认的高等级风险 TOP 3',
        evidenceStrength: '证据强度',
        evidenceSource: '确认资料',
        fieldFocus: '现场重点管控',
        noHighGradeRisks: '会议资料中无已确认的高等级项目',
        workSequence: '作业顺序',
        focusFlow: '重点管控流程',
        requiredPpe: '必备防护用品',
        ppeEvidenceOnly: '仅显示资料中明确说明的防护用品',
        emergencyFlow: '发现危险时',
        stop: '停止',
        stopBody: '立即停止作业',
        report: '报告',
        reportBody: '告知管理人员',
        reassess: '重新评估',
        reassessBody: '确认措施后再开工',
        trainer: '教育人员',
        worker: '作业人员',
        manager: '管理人员',
        educationVideo: '培训视频',
        sourceCount: '资料来源',
        minuteUnit: '分钟',
    },
    km: {
        posterBadge: 'សុវត្ថិភាពមួយទំព័រសម្រាប់កម្មករ',
        todayActions: '៣ ចំណុចត្រូវអនុវត្តថ្ងៃនេះ',
        highGradeRisks: 'ហានិភ័យកម្រិតខ្ពស់ដែលបានបញ្ជាក់ TOP 3',
        evidenceStrength: 'កម្លាំងភស្តុតាង',
        evidenceSource: 'ប្រភពបានផ្ទៀងផ្ទាត់',
        fieldFocus: 'ចំណុចត្រួតពិនិត្យនៅការដ្ឋាន',
        noHighGradeRisks: 'គ្មានហានិភ័យកម្រិតខ្ពស់ដែលបានបញ្ជាក់',
        workSequence: 'លំដាប់ការងារ',
        focusFlow: 'លំដាប់ត្រួតពិនិត្យ',
        requiredPpe: 'ឧបករណ៍ការពារចាំបាច់',
        ppeEvidenceOnly: 'បង្ហាញតែឧបករណ៍ដែលបានបញ្ជាក់ច្បាស់ក្នុងប្រភព',
        emergencyFlow: 'នៅពេលមានគ្រោះថ្នាក់',
        stop: 'ឈប់',
        stopBody: 'ឈប់ធ្វើការភ្លាម',
        report: 'រាយការណ៍',
        reportBody: 'ប្រាប់អ្នកគ្រប់គ្រង',
        reassess: 'វាយតម្លៃឡើងវិញ',
        reassessBody: 'ចាប់ផ្តើមក្រោយពិនិត្យវិធានការ',
        trainer: 'អ្នកបណ្តុះបណ្តាល',
        worker: 'កម្មករ',
        manager: 'អ្នកគ្រប់គ្រង',
        educationVideo: 'វីដេអូបណ្តុះបណ្តាល',
        sourceCount: 'ប្រភព',
        minuteUnit: 'នាទី',
    },
    mn: {
        posterBadge: 'АЖИЛТНЫ НЭГ ХУУДАС АЮУЛГҮЙ БАЙДАЛ',
        todayActions: 'ӨНӨӨДӨР ЗААВАЛ ХИЙХ 3 ҮЙЛДЭЛ',
        highGradeRisks: 'БАТАЛГААЖСАН ӨНДӨР ЭРСДЭЛ · TOP 3',
        evidenceStrength: 'Нотолгооны хүч',
        evidenceSource: 'Шалгасан эх сурвалж',
        fieldFocus: 'ТАЛБАЙН ХЯНАЛТЫН ЦЭГ',
        noHighGradeRisks: 'Хурлын материалд өндөр эрсдэл батлагдаагүй',
        workSequence: 'АЖЛЫН ДАРААЛАЛ',
        focusFlow: 'ХЯНАЛТЫН ДАРААЛАЛ',
        requiredPpe: 'ЗААВАЛ ӨМСӨХ ХАМГААЛАЛТ',
        ppeEvidenceOnly: 'Эх сурвалжид тодорхой заасан хэрэгслийг л харуулна',
        emergencyFlow: 'АЮУЛТАЙ БОЛ',
        stop: 'ЗОГС',
        stopBody: 'Ажлыг нэн даруй зогсоо',
        report: 'МЭДЭГД',
        reportBody: 'Удирдлагад мэдэгд',
        reassess: 'ДАХИН ҮНЭЛ',
        reassessBody: 'Хяналтыг шалгасны дараа эхэл',
        trainer: 'Сургагч',
        worker: 'Ажилтан',
        manager: 'Удирдагч',
        educationVideo: 'Сургалтын видео',
        sourceCount: 'Эх сурвалж',
        minuteUnit: 'мин',
    },
    id: {
        posterBadge: 'SATU HALAMAN KESELAMATAN PEKERJA',
        todayActions: '3 TINDAKAN WAJIB HARI INI',
        highGradeRisks: 'TOP 3 RISIKO TINGGI TERKONFIRMASI',
        evidenceStrength: 'Kekuatan bukti',
        evidenceSource: 'Sumber terverifikasi',
        fieldFocus: 'FOKUS PENGENDALIAN LAPANGAN',
        noHighGradeRisks: 'Tidak ada item tingkat tinggi yang terkonfirmasi',
        workSequence: 'URUTAN KERJA',
        focusFlow: 'ALUR PENGENDALIAN',
        requiredPpe: 'APD WAJIB',
        ppeEvidenceOnly: 'Hanya APD yang dinyatakan jelas dalam sumber',
        emergencyFlow: 'SAAT KONDISI TIDAK AMAN',
        stop: 'BERHENTI',
        stopBody: 'Hentikan pekerjaan',
        report: 'LAPOR',
        reportBody: 'Beri tahu pengawas',
        reassess: 'NILAI ULANG',
        reassessBody: 'Mulai setelah kendali diperiksa',
        trainer: 'Pelatih',
        worker: 'Pekerja',
        manager: 'Pengawas',
        educationVideo: 'Video pelatihan',
        sourceCount: 'Sumber',
        minuteUnit: 'menit',
    },
    th: {
        posterBadge: 'ความปลอดภัยหนึ่งหน้าสำหรับคนงาน',
        todayActions: '3 ข้อที่ต้องทำวันนี้',
        highGradeRisks: '3 อันดับความเสี่ยงสูงที่ยืนยันแล้ว',
        evidenceStrength: 'ความชัดเจนของหลักฐาน',
        evidenceSource: 'แหล่งข้อมูลที่ตรวจสอบแล้ว',
        fieldFocus: 'จุดควบคุมหน้างาน',
        noHighGradeRisks: 'ไม่พบรายการระดับสูงที่ยืนยันในเอกสารประชุม',
        workSequence: 'ลำดับการทำงาน',
        focusFlow: 'ลำดับการควบคุม',
        requiredPpe: 'อุปกรณ์ป้องกันที่ต้องใช้',
        ppeEvidenceOnly: 'แสดงเฉพาะอุปกรณ์ที่ระบุชัดเจนในแหล่งข้อมูล',
        emergencyFlow: 'เมื่อไม่ปลอดภัย',
        stop: 'หยุด',
        stopBody: 'หยุดงานทันที',
        report: 'รายงาน',
        reportBody: 'แจ้งผู้ควบคุมงาน',
        reassess: 'ประเมินใหม่',
        reassessBody: 'เริ่มใหม่หลังตรวจมาตรการ',
        trainer: 'ผู้สอน',
        worker: 'คนงาน',
        manager: 'ผู้ควบคุม',
        educationVideo: 'วิดีโอฝึกอบรม',
        sourceCount: 'แหล่งข้อมูล',
        minuteUnit: 'นาที',
    },
    ru: {
        posterBadge: 'БЕЗОПАСНОСТЬ РАБОТНИКА НА ОДНОЙ СТРАНИЦЕ',
        todayActions: '3 ОБЯЗАТЕЛЬНЫХ ДЕЙСТВИЯ СЕГОДНЯ',
        highGradeRisks: 'TOP 3 ПОДТВЕРЖДЁННЫХ ВЫСОКИХ РИСКА',
        evidenceStrength: 'Сила доказательств',
        evidenceSource: 'Проверенные источники',
        fieldFocus: 'КЛЮЧЕВОЙ КОНТРОЛЬ НА ОБЪЕКТЕ',
        noHighGradeRisks: 'В материалах совещания высокий риск не подтверждён',
        workSequence: 'ПОРЯДОК РАБОТЫ',
        focusFlow: 'ПОРЯДОК КОНТРОЛЯ',
        requiredPpe: 'ОБЯЗАТЕЛЬНЫЕ СИЗ',
        ppeEvidenceOnly: 'Показаны только СИЗ, прямо указанные в источнике',
        emergencyFlow: 'ЕСЛИ НЕБЕЗОПАСНО',
        stop: 'СТОП',
        stopBody: 'Немедленно остановить работу',
        report: 'СООБЩИТЬ',
        reportBody: 'Сообщить руководителю',
        reassess: 'ПЕРЕОЦЕНИТЬ',
        reassessBody: 'Возобновить после проверки мер',
        trainer: 'Инструктор',
        worker: 'Работник',
        manager: 'Руководитель',
        educationVideo: 'Учебное видео',
        sourceCount: 'Источники',
        minuteUnit: 'мин',
    },
    ja: {
        posterBadge: '作業者向け安全ワンシート',
        todayActions: '今日必ず守る3項目',
        highGradeRisks: '会議資料で確認した高レベルリスク TOP 3',
        evidenceStrength: '根拠の強さ',
        evidenceSource: '確認資料',
        fieldFocus: '現場重点管理',
        noHighGradeRisks: '会議資料に確認済みの高レベル項目なし',
        workSequence: '作業手順',
        focusFlow: '重点管理の流れ',
        requiredPpe: '必須保護具',
        ppeEvidenceOnly: '資料に明記された保護具のみ表示',
        emergencyFlow: '危険を感じたら',
        stop: '止める',
        stopBody: '直ちに作業中止',
        report: '報告',
        reportBody: '管理者へ連絡',
        reassess: '再評価',
        reassessBody: '対策確認後に再開',
        trainer: '教育者',
        worker: '作業者',
        manager: '管理者',
        educationVideo: '教育動画',
        sourceCount: '資料',
        minuteUnit: '分',
    },
    uz: {
        posterBadge: 'ISHCHILAR UCHUN BIR SAHIFALIK XAVFSIZLIK',
        todayActions: 'BUGUN BAJARILISHI SHART BO‘LGAN 3 HARAKAT',
        highGradeRisks: 'TASDIQLANGAN YUQORI DARAJALI XAVFLAR · TOP 3',
        evidenceStrength: 'Dalil kuchi',
        evidenceSource: 'Tekshirilgan manbalar',
        fieldFocus: 'ISH JOYIDAGI ASOSIY NAZORAT',
        noHighGradeRisks: 'Yig‘ilish materialida yuqori darajali xavf tasdiqlanmagan',
        workSequence: 'ISH TARTIBI',
        focusFlow: 'NAZORAT TARTIBI',
        requiredPpe: 'MAJBURIY SHAXSIY HIMOYA VOSITALARI',
        ppeEvidenceOnly: 'Faqat manbada aniq ko‘rsatilgan vositalar',
        emergencyFlow: 'SHAROIT XAVFSIZ BO‘LMASA',
        stop: 'TO‘XTANG',
        stopBody: 'Ishni darhol to‘xtating',
        report: 'XABAR BERING',
        reportBody: 'Bevosita rahbarga xabar bering',
        reassess: 'QAYTA BAHOLANG',
        reassessBody: 'Faqat nazorat choralari tekshirilgach ishni davom ettiring',
        trainer: 'Yo‘riqchi',
        worker: 'Ishchi',
        manager: 'Rahbar',
        educationVideo: 'O‘quv videosi',
        sourceCount: 'Manbalar',
        minuteUnit: 'daqiqa',
    },
    kk: {
        posterBadge: 'ЖҰМЫСШЫҒА АРНАЛҒАН БІР БЕТ ҚАУІПСІЗДІК',
        todayActions: 'БҮГІН ОРЫНДАЛАТЫН 3 МІНДЕТТІ ӘРЕКЕТ',
        highGradeRisks: 'РАСТАЛҒАН ЖОҒАРЫ ДЕҢГЕЙЛІ ТӘУЕКЕЛДЕР · ТОП 3',
        evidenceStrength: 'Дәлелдің күші',
        evidenceSource: 'Тексерілген дереккөздер',
        fieldFocus: 'АЛАҢДАҒЫ НЕГІЗГІ БАҚЫЛАУ',
        noHighGradeRisks: 'Жиналыс материалында жоғары деңгейлі тәуекел расталмады',
        workSequence: 'ЖҰМЫС РЕТІ',
        focusFlow: 'БАҚЫЛАУ РЕТІ',
        requiredPpe: 'МІНДЕТТІ ЖЕКЕ ҚОРҒАНЫС ҚҰРАЛДАРЫ',
        ppeEvidenceOnly: 'Дереккөзде нақты көрсетілген құралдар ғана',
        emergencyFlow: 'ЖАҒДАЙ ҚАУІПСІЗ БОЛМАСА',
        stop: 'ТОҚТАҢЫЗ',
        stopBody: 'Жұмысты дереу тоқтатыңыз',
        report: 'ХАБАРЛАҢЫЗ',
        reportBody: 'Тікелей басшыға хабарлаңыз',
        reassess: 'ҚАЙТА БАҒАЛАҢЫЗ',
        reassessBody: 'Қауіпсіздік шаралары тексерілгеннен кейін ғана жұмысты қайта бастаңыз',
        trainer: 'Нұсқаушы',
        worker: 'Жұмысшы',
        manager: 'Жетекші',
        educationVideo: 'Оқу бейнесі',
        sourceCount: 'Дереккөздер',
        minuteUnit: 'мин',
    },
    ne: {
        posterBadge: 'कामदारका लागि एक-पृष्ठ सुरक्षा',
        todayActions: 'आजका ३ अनिवार्य कार्य',
        highGradeRisks: 'पुष्टि भएका उच्च-स्तर जोखिम · शीर्ष ३',
        evidenceStrength: 'प्रमाणको बल',
        evidenceSource: 'पुष्टि गरिएका स्रोत',
        fieldFocus: 'कार्यक्षेत्रका मुख्य नियन्त्रण',
        noHighGradeRisks: 'बैठक सामग्रीमा उच्च श्रेणीको कुनै जोखिम पुष्टि भएको छैन',
        workSequence: 'कार्य क्रम',
        focusFlow: 'नियन्त्रण क्रम',
        requiredPpe: 'अनिवार्य व्यक्तिगत सुरक्षा उपकरण',
        ppeEvidenceOnly: 'स्रोतमा स्पष्ट उल्लेख भएका उपकरण मात्र',
        emergencyFlow: 'अवस्था असुरक्षित भएमा',
        stop: 'रोक्नुहोस्',
        stopBody: 'काम तुरुन्त रोक्नुहोस्',
        report: 'जानकारी दिनुहोस्',
        reportBody: 'सुपरभाइजरलाई जानकारी दिनुहोस्',
        reassess: 'पुनः मूल्याङ्कन गर्नुहोस्',
        reassessBody: 'नियन्त्रण उपाय जाँच भएपछि मात्र काम पुनः सुरु गर्नुहोस्',
        trainer: 'प्रशिक्षक',
        worker: 'कामदार',
        manager: 'सुपरभाइजर',
        educationVideo: 'प्रशिक्षण भिडियो',
        sourceCount: 'स्रोत',
        minuteUnit: 'मिनेट',
    },
    my: {
        posterBadge: 'အလုပ်သမားများအတွက် တစ်မျက်နှာ ဘေးကင်းရေး',
        todayActions: 'ယနေ့ မဖြစ်မနေ လုပ်ဆောင်ရမည့် အချက် ၃ ချက်',
        highGradeRisks: 'အတည်ပြုထားသော အန္တရာယ်မြင့် အချက် ၃ ချက်',
        evidenceStrength: 'အထောက်အထား ခိုင်မာမှု',
        evidenceSource: 'စစ်ဆေးပြီး ရင်းမြစ်များ',
        fieldFocus: 'လုပ်ငန်းခွင် အဓိကထိန်းချုပ်ချက်',
        noHighGradeRisks: 'အစည်းအဝေးစာရွက်စာတမ်းတွင် အတည်ပြုထားသော အန္တရာယ်မြင့်အချက် မရှိပါ',
        workSequence: 'လုပ်ငန်းအစီအစဉ်',
        focusFlow: 'ထိန်းချုပ်မှုအစီအစဉ်',
        requiredPpe: 'မဖြစ်မနေသုံးရမည့် ကိုယ်ရေးကာကွယ်ရေးပစ္စည်း',
        ppeEvidenceOnly: 'ရင်းမြစ်တွင် အတိအကျဖော်ပြထားသည့် ပစ္စည်းများသာ',
        emergencyFlow: 'အခြေအနေ မလုံခြုံပါက',
        stop: 'ရပ်ပါ',
        stopBody: 'အလုပ်ကို ချက်ချင်းရပ်ပါ',
        report: 'သတင်းပို့ပါ',
        reportBody: 'ကြီးကြပ်သူကို အသိပေးပါ',
        reassess: 'ပြန်လည်အကဲဖြတ်ပါ',
        reassessBody: 'ထိန်းချုပ်မှုများ စစ်ဆေးပြီးမှ အလုပ်ပြန်စပါ',
        trainer: 'သင်တန်းပို့ချသူ',
        worker: 'အလုပ်သမား',
        manager: 'တာဝန်ခံ',
        educationVideo: 'သင်တန်းဗီဒီယို',
        sourceCount: 'ရင်းမြစ်များ',
        minuteUnit: 'မိနစ်',
    },
    fil: {
        posterBadge: 'ISANG-PAHINANG KALIGTASAN PARA SA MANGGAGAWA',
        todayActions: '3 KAILANGANG GAWIN NGAYON',
        highGradeRisks: '3 PANGUNAHING NAKUMPIRMANG MATAAS NA PANGANIB',
        evidenceStrength: 'Lakas ng ebidensiya',
        evidenceSource: 'Napatunayang pinagmulan',
        fieldFocus: 'PANGUNAHING KONTROL SA LUGAR NG TRABAHO',
        noHighGradeRisks: 'Walang nakumpirmang mataas na panganib sa materyal ng pulong',
        workSequence: 'PAGKAKASUNOD-SUNOD NG TRABAHO',
        focusFlow: 'PAGKAKASUNOD-SUNOD NG KONTROL',
        requiredPpe: 'KINAKAILANGANG KAGAMITANG PANANGGALANG',
        ppeEvidenceOnly: 'Kagamitang tahasang nakasaad sa pinagmulan lamang',
        emergencyFlow: 'KAPAG HINDI LIGTAS ANG KONDISYON',
        stop: 'HUMINTO',
        stopBody: 'Itigil agad ang trabaho',
        report: 'IPAGBIGAY-ALAM',
        reportBody: 'Ipaalam sa superbisor',
        reassess: 'MULING SURIIN',
        reassessBody: 'Ipagpatuloy lamang ang trabaho kapag nasuri na ang mga hakbang sa pagkontrol',
        trainer: 'Tagapagsanay',
        worker: 'Manggagawa',
        manager: 'Superbisor',
        educationVideo: 'Video ng pagsasanay',
        sourceCount: 'Mga pinagmulan',
        minuteUnit: 'minuto',
    },
    hi: {
        posterBadge: 'कामगारों के लिए एक-पृष्ठ सुरक्षा',
        todayActions: 'आज के 3 अनिवार्य कदम',
        highGradeRisks: 'पुष्ट उच्च-श्रेणी जोखिम · शीर्ष 3',
        evidenceStrength: 'साक्ष्य की मजबूती',
        evidenceSource: 'सत्यापित स्रोत',
        fieldFocus: 'कार्यस्थल के मुख्य नियंत्रण',
        noHighGradeRisks: 'बैठक सामग्री में किसी उच्च-श्रेणी जोखिम की पुष्टि नहीं हुई',
        workSequence: 'कार्य क्रम',
        focusFlow: 'नियंत्रण क्रम',
        requiredPpe: 'अनिवार्य व्यक्तिगत सुरक्षा उपकरण',
        ppeEvidenceOnly: 'केवल स्रोत में स्पष्ट रूप से बताए गए उपकरण',
        emergencyFlow: 'स्थिति असुरक्षित हो तो',
        stop: 'रुकें',
        stopBody: 'काम तुरंत रोकें',
        report: 'सूचित करें',
        reportBody: 'पर्यवेक्षक को सूचित करें',
        reassess: 'पुनर्मूल्यांकन करें',
        reassessBody: 'नियंत्रण उपायों की जाँच के बाद ही काम फिर शुरू करें',
        trainer: 'प्रशिक्षक',
        worker: 'कामगार',
        manager: 'पर्यवेक्षक',
        educationVideo: 'प्रशिक्षण वीडियो',
        sourceCount: 'स्रोत',
        minuteUnit: 'मिनट',
    },
    bn: {
        posterBadge: 'শ্রমিকের জন্য এক পাতার নিরাপত্তা নির্দেশিকা',
        todayActions: 'আজকের ৩টি বাধ্যতামূলক কাজ',
        highGradeRisks: 'নিশ্চিত উচ্চ-স্তরের ঝুঁকি · শীর্ষ ৩',
        evidenceStrength: 'প্রমাণের শক্তি',
        evidenceSource: 'যাচাইকৃত উৎস',
        fieldFocus: 'কর্মক্ষেত্রের প্রধান নিয়ন্ত্রণ',
        noHighGradeRisks: 'সভা-উপকরণে কোনো উচ্চ-শ্রেণির ঝুঁকি নিশ্চিত হয়নি',
        workSequence: 'কাজের ধাপ',
        focusFlow: 'নিয়ন্ত্রণের ধাপ',
        requiredPpe: 'বাধ্যতামূলক ব্যক্তিগত সুরক্ষা সরঞ্জাম',
        ppeEvidenceOnly: 'উৎসে স্পষ্টভাবে উল্লেখিত সরঞ্জামই দেখানো হয়েছে',
        emergencyFlow: 'পরিস্থিতি অনিরাপদ হলে',
        stop: 'থামুন',
        stopBody: 'এখনই কাজ বন্ধ করুন',
        report: 'জানান',
        reportBody: 'তত্ত্বাবধায়ককে জানান',
        reassess: 'পুনর্মূল্যায়ন করুন',
        reassessBody: 'নিয়ন্ত্রণ ব্যবস্থা যাচাইয়ের পরই কাজ আবার শুরু করুন',
        trainer: 'প্রশিক্ষক',
        worker: 'শ্রমিক',
        manager: 'তত্ত্বাবধায়ক',
        educationVideo: 'প্রশিক্ষণ ভিডিও',
        sourceCount: 'উৎস',
        minuteUnit: 'মিনিট',
    },
    ur: {
        posterBadge: 'کارکن کے لیے ایک صفحے کی حفاظتی ہدایت',
        todayActions: 'آج کے ۳ لازمی اقدامات',
        highGradeRisks: 'تصدیق شدہ بلند درجے کے خطرات · سرفہرست ۳',
        evidenceStrength: 'ثبوت کی مضبوطی',
        evidenceSource: 'تصدیق شدہ ذرائع',
        fieldFocus: 'کام کی جگہ کے اہم کنٹرول',
        noHighGradeRisks: 'اجلاس کے مواد میں کسی اعلیٰ درجے کے خطرے کی تصدیق نہیں ہوئی',
        workSequence: 'کام کی ترتیب',
        focusFlow: 'کنٹرول کی ترتیب',
        requiredPpe: 'لازمی ذاتی حفاظتی سامان',
        ppeEvidenceOnly: 'صرف وہ سامان جو ماخذ میں واضح طور پر درج ہے',
        emergencyFlow: 'حالات غیر محفوظ ہوں تو',
        stop: 'رکیں',
        stopBody: 'کام فوراً روک دیں',
        report: 'اطلاع دیں',
        reportBody: 'نگران کو اطلاع دیں',
        reassess: 'دوبارہ جائزہ لیں',
        reassessBody: 'کنٹرول اقدامات کی جانچ کے بعد ہی کام دوبارہ شروع کریں',
        trainer: 'تربیت کار',
        worker: 'کارکن',
        manager: 'نگران',
        educationVideo: 'تربیتی ویڈیو',
        sourceCount: 'ذرائع',
        minuteUnit: 'منٹ',
    },
    si: {
        posterBadge: 'සේවකයන් සඳහා එක් පිටුවක ආරක්ෂක මාර්ගෝපදේශය',
        todayActions: 'අද අනිවාර්ය ක්‍රියා 3',
        highGradeRisks: 'තහවුරු කළ ඉහළ මට්ටමේ අවදානම් · ප්‍රමුඛ 3',
        evidenceStrength: 'සාක්ෂි ප්‍රබලතාව',
        evidenceSource: 'තහවුරු කළ මූලාශ්‍ර',
        fieldFocus: 'වැඩබිමේ ප්‍රධාන පාලන',
        noHighGradeRisks: 'රැස්වීම් ද්‍රව්‍යවල ඉහළ ශ්‍රේණියේ අවදානමක් තහවුරු වී නැත',
        workSequence: 'වැඩ අනුපිළිවෙළ',
        focusFlow: 'පාලන අනුපිළිවෙළ',
        requiredPpe: 'අනිවාර්ය පුද්ගල ආරක්ෂක උපකරණ',
        ppeEvidenceOnly: 'මූලාශ්‍රයේ පැහැදිලිව සඳහන් උපකරණ පමණි',
        emergencyFlow: 'තත්ත්වය අනාරක්ෂිත නම්',
        stop: 'නවත්වන්න',
        stopBody: 'වැඩ වහාම නවත්වන්න',
        report: 'දැනුම් දෙන්න',
        reportBody: 'අධීක්ෂකයාට දැනුම් දෙන්න',
        reassess: 'නැවත තක්සේරු කරන්න',
        reassessBody: 'පාලන ක්‍රියාමාර්ග පරීක්ෂා කළ පසු පමණක් වැඩ නැවත ආරම්භ කරන්න',
        trainer: 'පුහුණුකරු',
        worker: 'සේවකයා',
        manager: 'අධීක්ෂකයා',
        educationVideo: 'පුහුණු වීඩියෝව',
        sourceCount: 'මූලාශ්‍ර',
        minuteUnit: 'මිනිත්තු',
    },
};

const LANGUAGE_NAMES: Record<string, string> = {
    ko: '한국어',
    en: 'English',
    vi: 'Tiếng Việt',
    zh: '中文',
    km: 'ភាសាខ្មែរ',
    mn: 'Монгол',
    id: 'Bahasa Indonesia',
    th: 'ไทย',
    ru: 'Русский',
    ja: '日本語',
    uz: 'O‘zbekcha',
    kk: 'Қазақ тілі',
    ne: 'नेपाली',
    my: 'မြန်မာဘာသာ',
    fil: 'Wikang Filipino',
    hi: 'हिन्दी',
    bn: 'বাংলা',
    ur: 'اردو',
    si: 'සිංහල',
};

const FONT_STACKS: Record<string, string> = {
    ko: "'Pretendard', 'Noto Sans KR', 'Malgun Gothic', sans-serif",
    en: "'Inter', 'Arial', sans-serif",
    vi: "'Noto Sans', 'Arial', sans-serif",
    zh: "'Noto Sans SC', 'Microsoft YaHei', sans-serif",
    km: "'Noto Sans Khmer', 'Khmer UI', sans-serif",
    mn: "'Noto Sans', 'Arial', sans-serif",
    id: "'Noto Sans', 'Arial', sans-serif",
    th: "'Noto Sans Thai', 'Leelawadee UI', sans-serif",
    ru: "'Noto Sans', 'Arial', sans-serif",
    ja: "'Noto Sans JP', 'Yu Gothic UI', sans-serif",
    uz: "'Noto Sans', 'Arial', sans-serif",
    kk: "'Noto Sans', 'Segoe UI', 'Arial', sans-serif",
    ne: "'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', sans-serif",
    my: "'Noto Sans Myanmar', 'Myanmar Text', 'Nirmala UI', sans-serif",
    fil: "'Noto Sans', 'Inter', 'Arial', sans-serif",
    hi: "'Noto Sans Devanagari', 'Nirmala UI', 'Mangal', sans-serif",
    bn: "'Noto Sans Bengali', 'Nirmala UI', 'Vrinda', sans-serif",
    ur: "'Noto Sans Arabic', 'Noto Nastaliq Urdu', 'Nirmala UI', sans-serif",
    si: "'Noto Sans Sinhala', 'Nirmala UI', 'Iskoola Pota', sans-serif",
};

const PPE_LABELS: Record<SafetyPosterPpeType, Record<string, string>> = {
    helmet: {
        ko: '안전모', en: 'Helmet', vi: 'Mũ bảo hộ', zh: '安全帽', km: 'មួកសុវត្ថិភាព',
        mn: 'Хамгаалалтын малгай', id: 'Helm', th: 'หมวกนิรภัย', ru: 'Каска',
        ja: '保護帽', uz: 'Himoya kaskasi', kk: 'Қорғаныс каскасы', ne: 'सुरक्षा हेल्मेट',
        my: 'အကာအကွယ်ဦးထုပ်', fil: 'Helmet na pangkaligtasan', hi: 'सुरक्षा हेलमेट',
        bn: 'নিরাপত্তা হেলমেট', ur: 'حفاظتی ہیلمٹ', si: 'ආරක්ෂක හිස්වැසුම',
    },
    harness: {
        ko: '안전대', en: 'Harness', vi: 'Dây an toàn', zh: '安全带', km: 'ខ្សែក្រវាត់សុវត្ថិភាព',
        mn: 'Хамгаалах бүс', id: 'Sabuk keselamatan', th: 'สายรัดนิรภัย',
        ru: 'Страховочная привязь', ja: '安全帯', uz: 'Xavfsizlik kamari',
        kk: 'Толық денелік сақтандыру белдігі', ne: 'पूर्ण-शरीर सुरक्षा हार्नेस',
        my: 'တစ်ကိုယ်လုံး လုံခြုံရေးသိုင်းကြိုး', fil: 'Buong-katawang sinturong pangkaligtasan',
        hi: 'पूर्ण-शरीर सुरक्षा हार्नेस', bn: 'পূর্ণ-দেহ সুরক্ষা বেল্ট',
        ur: 'مکمل جسمانی حفاظتی بیلٹ', si: 'සම්පූර්ණ ශරීර ආරක්ෂක පටි',
    },
    gloves: {
        ko: '보호장갑', en: 'Gloves', vi: 'Găng tay', zh: '防护手套', km: 'ស្រោមដៃការពារ',
        mn: 'Хамгаалалтын бээлий', id: 'Sarung tangan', th: 'ถุงมือนิรภัย',
        ru: 'Перчатки', ja: '保護手袋', uz: 'Himoya qo‘lqopi', kk: 'Қорғаныс қолғаптары',
        ne: 'सुरक्षा पञ्जा', my: 'အကာအကွယ်လက်အိတ်', fil: 'Guwantes na pananggalang',
        hi: 'सुरक्षा दस्ताने', bn: 'সুরক্ষা দস্তানা', ur: 'حفاظتی دستانے',
        si: 'ආරක්ෂක අත්වැසුම්',
    },
    goggles: {
        ko: '보안경', en: 'Eye protection', vi: 'Kính bảo hộ', zh: '护目镜', km: 'វ៉ែនតាការពារ',
        mn: 'Хамгаалалтын нүдний шил', id: 'Kacamata pelindung', th: 'แว่นตานิรภัย',
        ru: 'Защитные очки', ja: '保護メガネ', uz: 'Himoya ko‘zoynagi',
        kk: 'Қорғаныс көзілдірігі', ne: 'सुरक्षा चस्मा', my: 'အကာအကွယ်မျက်မှန်',
        fil: 'Salaming pangkaligtasan', hi: 'सुरक्षा चश्मा', bn: 'সুরক্ষা চশমা',
        ur: 'حفاظتی چشمہ', si: 'ආරක්ෂක කණ්ණාඩි',
    },
    mask: {
        ko: '호흡 보호구', en: 'Respirator', vi: 'Mặt nạ bảo hộ', zh: '呼吸防护',
        km: 'ឧបករណ៍ការពារដង្ហើម', mn: 'Амьсгал хамгаалах хэрэгсэл',
        id: 'Pelindung pernapasan', th: 'อุปกรณ์ป้องกันระบบหายใจ', ru: 'Респиратор',
        ja: '呼吸用保護具', uz: 'Nafas olish himoyasi', kk: 'Тыныс алу мүшесін қорғау құралы',
        ne: 'श्वास सुरक्षा उपकरण', my: 'အသက်ရှူလမ်းကြောင်း ကာကွယ်ရေးပစ္စည်း',
        fil: 'Proteksiyon sa paghinga', hi: 'श्वसन सुरक्षा उपकरण',
        bn: 'শ্বাসযন্ত্র সুরক্ষা সরঞ্জাম', ur: 'سانس کا حفاظتی سامان',
        si: 'ශ්වසන ආරක්ෂක උපකරණ',
    },
    boots: {
        ko: '안전화', en: 'Safety boots', vi: 'Giày bảo hộ', zh: '安全鞋',
        km: 'ស្បែកជើងសុវត្ថិភាព', mn: 'Хамгаалалтын гутал', id: 'Sepatu keselamatan',
        th: 'รองเท้านิรภัย', ru: 'Защитная обувь', ja: '安全靴', uz: 'Himoya poyabzali',
        kk: 'Қауіпсіздік аяқ киімі', ne: 'सुरक्षा बुट', my: 'အကာအကွယ်ဘွတ်ဖိနပ်',
        fil: 'Sapatos na pangkaligtasan', hi: 'सुरक्षा जूते', bn: 'নিরাপত্তা জুতা',
        ur: 'حفاظتی جوتے', si: 'ආරක්ෂක පාවහන්',
    },
    hearing: {
        ko: '청력 보호구', en: 'Hearing protection', vi: 'Bảo vệ thính giác', zh: '听力防护',
        km: 'ឧបករណ៍ការពារត្រចៀក', mn: 'Сонсгол хамгаалах хэрэгсэл',
        id: 'Pelindung pendengaran', th: 'อุปกรณ์ป้องกันเสียง', ru: 'Защита слуха',
        ja: '聴覚保護具', uz: 'Eshitish himoyasi', kk: 'Есту мүшесін қорғау құралы',
        ne: 'कानको सुरक्षा', my: 'နားအကာအကွယ်',
        fil: 'Proteksiyon sa pandinig', hi: 'श्रवण सुरक्षा उपकरण',
        bn: 'শ্রবণ সুরক্ষা সরঞ্জাম', ur: 'سماعت کا حفاظتی سامان',
        si: 'ශ්‍රවණ ආරක්ෂක උපකරණ',
    },
};

const PPE_PATTERNS: Record<SafetyPosterPpeType, RegExp> = {
    helmet: /(안전모|hard\s*hat|safety\s*helmet|mũ\s*bảo\s*hộ|安全帽|មួកសុវត្ថិភាព|хамгаалалтын\s*малгай|helm\s*(?:keselamatan|proyek)|หมวกนิรภัย|каск[аиу]|保護帽|ヘルメット|himoya\s*kaskasi)/i,
    harness: /(안전대|추락방지대|safety\s*harness|fall[-\s]*arrest\s*harness|dây\s*an\s*toàn|安全带|ខ្សែក្រវាត់សុវត្ថិភាព|хамгаалах\s*бүс|sabuk\s*(?:pengaman|keselamatan)|สายรัดนิรภัย|страховочн\w*\s*(?:привяз|пояс)|安全帯|フルハーネス|xavfsizlik\s*kamari)/i,
    gloves: /(안전장갑|보호장갑|protective\s*gloves|safety\s*gloves|găng\s*tay|防护手套|安全手套|ស្រោមដៃការពារ|хамгаалалтын\s*бээлий|sarung\s*tangan|ถุงมือนิรภัย|защитн\w*\s*перчат|保護手袋|himoya\s*qo['‘’`]?lqopi)/i,
    goggles: /(보안경|안전안경|safety\s*(?:glasses|goggles)|eye\s*protection|kính\s*bảo\s*hộ|护目镜|防护眼镜|វ៉ែនតាការពារ|хамгаалалтын\s*нүдний\s*шил|kacamata\s*pelindung|แว่นตานิรภัย|защитн\w*\s*очк|保護メガネ|himoya\s*ko['‘’`]?zoynagi)/i,
    mask: /(방진마스크|방독면|호흡\s*보호구|respirator|dust\s*mask|mặt\s*nạ\s*bảo\s*hộ|khẩu\s*trang|呼吸防护|防尘口罩|防毒面具|ឧបករណ៍ការពារដង្ហើម|амьсгал\s*хамгаалах|pelindung\s*pernapasan|หน้ากากป้องกัน|респиратор|противогаз|呼吸用保護具|防じんマスク|respirator)/i,
    boots: /(안전화|safety\s*(?:boots|shoes)|giày\s*bảo\s*hộ|安全鞋|ស្បែកជើងសុវត្ថិភាព|хамгаалалтын\s*гутал|sepatu\s*keselamatan|รองเท้านิรภัย|защитн\w*\s*(?:обув|ботин)|安全靴|himoya\s*poyabzali)/i,
    hearing: /(귀마개|귀덮개|청력\s*보호구|hearing\s*protection|ear\s*(?:plugs|muffs)|bảo\s*vệ\s*thính\s*giác|听力防护|耳塞|ឧបករណ៍ការពារត្រចៀក|сонсгол\s*хамгаалах|pelindung\s*pendengaran|อุปกรณ์ป้องกันเสียง|защит\w*\s*слух|耳栓|聴覚保護具|eshitish\s*himoyasi)/i,
};

const FIT_STYLE: Record<A4SafetyPosterFitMode, {
    padding: string;
    gap: string;
    radius: string;
    baseFont: string;
    titleFont: string;
    heroFont: string;
    sectionFont: string;
    bodyFont: string;
    smallFont: string;
    icon: string;
    cardPadding: string;
}> = {
    spacious: { padding: '8mm', gap: '2.7mm', radius: '4mm', baseFont: '10.5pt', titleFont: '21pt', heroFont: '17pt', sectionFont: '12pt', bodyFont: '10.5pt', smallFont: '8.5pt', icon: '12mm', cardPadding: '4mm' },
    balanced: { padding: '7mm', gap: '2.2mm', radius: '3.5mm', baseFont: '9.8pt', titleFont: '19pt', heroFont: '15.5pt', sectionFont: '11pt', bodyFont: '9.6pt', smallFont: '7.8pt', icon: '10.5mm', cardPadding: '3.3mm' },
    compact: { padding: '6mm', gap: '1.7mm', radius: '3mm', baseFont: '9pt', titleFont: '17pt', heroFont: '14pt', sectionFont: '10pt', bodyFont: '8.7pt', smallFont: '7.2pt', icon: '9mm', cardPadding: '2.7mm' },
    dense: { padding: '5mm', gap: '1.3mm', radius: '2.5mm', baseFont: '8.2pt', titleFont: '15pt', heroFont: '12.5pt', sectionFont: '9.2pt', bodyFont: '8pt', smallFont: '6.7pt', icon: '8mm', cardPadding: '2.2mm' },
};

const clampStyle = (lines: number): React.CSSProperties => ({
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
});

const languageFamily = (languageCode: string): string => {
    const family = String(languageCode || 'ko').trim().toLowerCase().replace('_', '-').split('-')[0] || 'ko';
    return family === 'cmn' ? 'zh' : family;
};

const normalizedText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Normalizes whitespace without shortening safety content.
 *
 * Text must remain intact in the DOM so `data-overflow-check` can detect a real
 * layout overflow and prevent export. Silently truncating an action sentence
 * can remove the exact condition or control that a worker needs to understand.
 */
const preserveText = (value: unknown): string => normalizedText(value);

const uniqueItems = (items: unknown[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of items) {
        const normalized = normalizedText(item);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        result.push(normalized);
    }
    return result;
};

const completeThreeActions = (
    translatedActions: unknown[],
    draft: TbmEducationDraft,
    labels: A4SafetyPosterTranslationLabels,
    translation?: A4SafetyPosterTranslation | null,
): string[] => {
    const translatedRiskActions = translation?.risks?.map((risk) => risk.action) || [];
    const sourceItems = translation
        ? [
            ...translatedActions,
            ...translatedRiskActions,
            ...(translation.focus || []),
            ...(translation.notices || []),
            translation.closingCommitment,
            translation.coreMessage,
        ]
        : [
            ...translatedActions,
            ...draft.risks.map((risk) => risk.action),
            ...draft.focusPoints,
            ...draft.checklist,
            ...draft.notices,
            draft.closingCommitment,
            draft.coreMessage,
        ];

    return uniqueItems([
        ...sourceItems,
        `${labels.stop}: ${labels.stopBody}`,
        `${labels.report}: ${labels.reportBody}`,
        `${labels.reassess}: ${labels.reassessBody}`,
    ]).slice(0, 3);
};

const buildEvidenceSegments = (score: number, maxScore: number): number => {
    if (maxScore <= 0) return 1;
    return Math.max(1, Math.min(4, Math.ceil((Math.max(0, score) / maxScore) * 4)));
};

const buildPpeItems = (
    draft: TbmEducationDraft,
    languageCode: string,
    translation?: A4SafetyPosterTranslation | null,
): PosterPpeItem[] => {
    const language = languageFamily(languageCode);
    const translatedText = translation
        ? [
            translation.title,
            translation.opening,
            translation.coreMessage,
            ...(translation.risks || []).flatMap((item) => [item.risk, item.action]),
            ...(translation.focus || []),
            ...(translation.notices || []),
            ...(translation.workSteps || []),
            ...(translation.actions || []),
            translation.closingCommitment,
        ]
        : [];
    const sourceText = [
        draft.title,
        draft.opening,
        draft.coreMessage,
        ...draft.risks.flatMap((item) => [item.risk, item.action]),
        ...draft.focusPoints,
        ...draft.notices,
        ...draft.checklist,
        draft.closingCommitment,
        ...translatedText,
    ].map(normalizedText).filter(Boolean).join(' ');

    return (Object.keys(PPE_PATTERNS) as SafetyPosterPpeType[])
        .filter((type) => PPE_PATTERNS[type].test(sourceText))
        .map((type) => {
            const explicitTranslation = translation?.ppe?.find((item) => item.type === type)?.label;
            return {
                type,
                label: normalizedText(explicitTranslation)
                    || PPE_LABELS[type][language]
                    || PPE_LABELS[type].en,
            };
        });
};

const getLabels = (
    languageCode: string,
    translation?: A4SafetyPosterTranslation | null,
): A4SafetyPosterTranslationLabels => {
    const language = languageFamily(languageCode);
    const base = language === 'ko'
        ? DEFAULT_LABELS_KO
        : { ...DEFAULT_LABELS_EN, ...(LABEL_PATCHES[language] || {}) };
    return { ...base, ...(translation?.labels || {}) };
};

export const buildA4SafetyPosterModel = (
    draft: TbmEducationDraft,
    languageCode: string,
    _fitMode: A4SafetyPosterFitMode,
    translation?: A4SafetyPosterTranslation | null,
): A4SafetyPosterModel => {
    const labels = getLabels(languageCode, translation);
    const highGradeRisks = getHighGradeRiskShareItems(draft.risks).slice(0, 3);
    const maxScore = highGradeRisks.reduce((max, risk) => Math.max(max, Number(risk.score) || 0), 0);
    const translatedRisks = translation?.risks || [];
    const localizedFocus = translation ? (translation.focus || []) : draft.focusPoints;
    const localizedChecklist = translation ? (translation.workSteps || []) : draft.checklist;
    const localizedOpening = translation
        ? normalizedText(translation.opening || translation.coreMessage || translation.focus?.[0])
        : draft.opening;
    const localizedCoreMessage = translation
        ? normalizedText(
            translation.coreMessage
            || translation.risks?.[0]?.action
            || translation.focus?.[0]
            || translation.notices?.[0]
            || translation.opening,
        )
        : draft.coreMessage;

    const priorityCards: PosterPriorityCard[] = highGradeRisks.length
        ? highGradeRisks.map((risk, index) => {
            const translatedRisk = translatedRisks[index];
            return {
                id: risk.id || `risk-${index + 1}`,
                title: preserveText(translatedRisk?.risk || risk.risk),
                body: preserveText(
                    translation
                        ? translatedRisk?.action || localizedCoreMessage
                        : risk.action,
                ),
                owner: preserveText(translation ? translatedRisk?.owner : risk.owner),
                evidenceSegments: buildEvidenceSegments(Number(risk.score) || 0, maxScore),
                evidenceCount: Array.isArray(risk.evidenceLabels) ? risk.evidenceLabels.length : 0,
                source: risk,
            };
        })
        : uniqueItems([
            ...localizedFocus,
            ...(translation ? (translation.notices || []) : draft.notices),
            ...localizedChecklist,
            localizedCoreMessage,
        ]).slice(0, 3).map((item, index) => ({
            id: `focus-${index + 1}`,
            title: `${labels.fieldFocus} ${index + 1}`,
            body: preserveText(item),
            owner: '',
            evidenceSegments: 0,
            evidenceCount: 0,
            source: null,
        }));

    const actions = completeThreeActions(translation?.actions || [], draft, labels, translation)
        .map(preserveText);
    const explicitWorkSteps = translation?.workSteps || [];
    const flowMode: A4SafetyPosterModel['flowMode'] = explicitWorkSteps.length
        ? 'work-sequence'
        : 'focus-flow';
    const flowSource = explicitWorkSteps.length
        ? explicitWorkSteps
        : uniqueItems([
            ...localizedFocus,
            ...localizedChecklist,
            ...(translation ? (translation.notices || []) : draft.notices),
        ]);
    const flowItems = flowSource.slice(0, 4).map(preserveText);

    const model: A4SafetyPosterModel = {
        title: preserveText(translation?.title || draft.title),
        workType: preserveText(
            translation
                ? translation.workType || ''
                : draft.workType,
        ),
        opening: preserveText(localizedOpening),
        coreMessage: preserveText(localizedCoreMessage),
        actions,
        priorityMode: highGradeRisks.length ? 'high-grade-risks' : 'field-focus',
        priorityCards,
        flowMode,
        flowItems,
        ppeItems: buildPpeItems(draft, languageCode, translation),
        closingCommitment: preserveText(
            translation
                ? translation.closingCommitment
                    || translation.notices?.[translation.notices.length - 1]
                    || localizedCoreMessage
                : draft.closingCommitment,
        ),
        labels,
        contentVolume: 'medium',
    };

    const characterLoad = [
        model.title,
        model.opening,
        model.coreMessage,
        ...model.actions,
        ...model.priorityCards.flatMap((card) => [card.title, card.body]),
        ...model.flowItems,
        model.closingCommitment,
    ].reduce((sum, value) => sum + Array.from(value).length, 0);
    model.contentVolume = characterLoad < 390 ? 'short' : characterLoad > 760 ? 'long' : 'medium';
    return model;
};

interface SectionHeadingProps {
    icon: SafetyPosterIconName;
    title: string;
    badge?: string;
    color: string;
    sectionFont: string;
    smallFont: string;
}

const SectionHeading: React.FC<SectionHeadingProps> = ({
    icon,
    title,
    badge,
    color,
    sectionFont,
    smallFont,
}) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '3mm' }}>
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, gap: '2mm' }}>
            <span style={{ display: 'inline-flex', width: '6.5mm', height: '6.5mm', alignItems: 'center', justifyContent: 'center', borderRadius: '2mm', color, background: `${color}18`, flex: '0 0 auto' }}>
                <SafetyPosterIcon name={icon} className="h-[4.5mm] w-[4.5mm]" />
            </span>
            <h2 style={{ margin: 0, color: '#0f172a', fontSize: sectionFont, lineHeight: 1.12, fontWeight: 900, letterSpacing: '-0.02em' }}>
                {title}
            </h2>
        </div>
        {badge ? (
            <span data-overflow-check="true" style={{ flex: '0 1 auto', maxWidth: '58%', borderRadius: '3mm', padding: '1mm 2.2mm', color, background: `${color}12`, border: `0.3mm solid ${color}35`, fontSize: smallFont, fontWeight: 800, lineHeight: 1.15, textAlign: 'end' }}>
                {badge}
            </span>
        ) : null}
    </div>
);

const EvidenceBar: React.FC<{
    segments: number;
    label: string;
    sourceLabel: string;
    sourceCount: number;
    smallFont: string;
}> = ({ segments, label, sourceLabel, sourceCount, smallFont }) => (
    <div style={{ display: 'grid', gap: '1.1mm' }} aria-label={`${label}: ${segments}/4`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2mm', color: '#475569', fontSize: smallFont, lineHeight: 1 }}>
            <span style={{ fontWeight: 800 }}>{label}</span>
            <span>{sourceLabel} {sourceCount}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '1mm' }}>
            {[1, 2, 3, 4].map((segment) => (
                <span
                    key={segment}
                    aria-hidden="true"
                    style={{
                        height: '2.1mm',
                        borderRadius: '999px',
                        background: segment <= segments ? '#f59e0b' : '#e2e8f0',
                    }}
                />
            ))}
        </div>
    </div>
);

const A4SafetyPoster: React.FC<A4SafetyPosterProps> = ({
    draft,
    languageCode,
    targetPeriodLabel,
    fitMode,
    videoDuration,
    translation,
    className = '',
}) => {
    const language = languageFamily(languageCode);
    const style = FIT_STYLE[fitMode];
    const model = buildA4SafetyPosterModel(draft, languageCode, fitMode, translation);
    const roomy = model.contentVolume === 'short' && fitMode !== 'dense';
    const actionIconSize = roomy ? `calc(${style.icon} + 2mm)` : style.icon;
    const priorityCount = Math.max(1, model.priorityCards.length);
    const actionFallback = model.coreMessage || model.opening;
    const actions = model.actions.length
        ? model.actions
        : [actionFallback].filter(Boolean);
    const flowItems = model.flowItems.length
        ? model.flowItems
        : [model.coreMessage].filter(Boolean);
    const languageName = LANGUAGE_NAMES[language] || languageCode;
    const sourceCount = Math.max(0, Number(draft.sourceCount) || 0);
    const videoMinutes = Math.max(0, Math.round((Number(videoDuration) || 0) / 60));
    const flowArrow = language === 'ur' ? '←' : '→';
    const rootStyle: React.CSSProperties & { printColorAdjust?: string } = {
        width: '210mm',
        height: '297mm',
        boxSizing: 'border-box',
        overflow: 'hidden',
        position: 'relative',
        isolation: 'isolate',
        display: 'grid',
        gridTemplateRows: 'auto auto auto minmax(0, 1fr) auto auto auto',
        gap: style.gap,
        padding: style.padding,
        color: '#0f172a',
        background: '#ffffff',
        fontFamily: FONT_STACKS[language] || FONT_STACKS.en,
        fontSize: style.baseFont,
        lineHeight: 1.35,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
    };

    return (
        <section
            className={`a4-safety-poster ${className}`.trim()}
            data-a4-safety-poster="true"
            data-fit-mode={fitMode}
            data-content-volume={model.contentVolume}
            data-priority-mode={model.priorityMode}
            data-overflow-check="true"
            lang={languageCode}
            dir={language === 'ur' ? 'rtl' : 'ltr'}
            aria-label={`${model.title} ${model.labels.posterBadge}`}
            style={rootStyle}
        >
            <div aria-hidden="true" style={{ position: 'absolute', zIndex: -1, inset: 0, background: 'radial-gradient(circle at 94% 4%, #dbeafe 0, transparent 25%), radial-gradient(circle at 4% 98%, #ccfbf1 0, transparent 22%)' }} />

            <header data-overflow-check="true" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: '5mm', minHeight: roomy ? '20mm' : '17mm', paddingBottom: '2mm', borderBottom: '0.7mm solid #0f172a', overflow: 'hidden' }}>
                <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2.2mm', marginBottom: '1.2mm', color: '#1d4ed8', fontSize: style.smallFont, fontWeight: 900, letterSpacing: '0.08em' }}>
                        <SafetyPosterIcon name="shield" className="h-[4mm] w-[4mm]" />
                        <span>{model.labels.posterBadge}</span>
                    </div>
                    <h1 data-overflow-check="true" style={{ ...clampStyle(2), margin: 0, maxWidth: '142mm', color: '#0f172a', fontSize: style.titleFont, lineHeight: 1.06, fontWeight: 950, letterSpacing: '-0.045em' }}>
                        {model.title}
                    </h1>
                </div>
                <div style={{ display: 'grid', minWidth: '43mm', gap: '1.4mm', padding: '2.6mm 3mm', borderRadius: '3mm', color: '#e2e8f0', background: '#0f172a', fontSize: style.smallFont }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', fontWeight: 800 }}>
                        <SafetyPosterIcon name="calendar" className="h-[3.6mm] w-[3.6mm]" />
                        {targetPeriodLabel || draft.month}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2mm', color: '#cbd5e1' }}>
                        <strong style={{ color: '#ffffff' }}>{model.workType}</strong>
                        <span>{languageName}</span>
                    </span>
                </div>
            </header>

            <section data-overflow-check="true" style={{ display: 'grid', gridTemplateColumns: '9mm minmax(0, 1fr) auto', alignItems: 'center', gap: '3mm', minHeight: roomy ? '31mm' : '25mm', padding: roomy ? '4.5mm 5mm' : '3.4mm 4.3mm', borderRadius: style.radius, color: '#ffffff', background: 'linear-gradient(120deg, #1d4ed8 0%, #0f766e 100%)', boxShadow: '0 2mm 6mm rgba(15, 23, 42, 0.12)', overflow: 'hidden' }}>
                <SafetyPosterIcon name="action" className="h-[9mm] w-[9mm]" />
                <div style={{ minWidth: 0 }}>
                    <p data-overflow-check="true" style={{ ...clampStyle(1), margin: 0, color: '#bfdbfe', fontSize: style.smallFont, fontWeight: 800 }}>
                        {model.opening}
                    </p>
                    <p data-overflow-check="true" style={{ ...clampStyle(roomy ? 3 : 2), margin: '1mm 0 0', fontSize: style.heroFont, lineHeight: 1.15, fontWeight: 950, letterSpacing: '-0.025em' }}>
                        {model.coreMessage}
                    </p>
                </div>
                <div style={{ display: 'grid', justifyItems: 'center', gap: '1mm', minWidth: '19mm', paddingLeft: '3mm', borderLeft: '0.35mm solid rgba(255,255,255,.35)', color: '#dbeafe' }}>
                    <SafetyPosterIcon name="clock" className="h-[6mm] w-[6mm]" />
                    <strong style={{ color: '#ffffff', fontSize: style.bodyFont }}>{videoMinutes} {model.labels.minuteUnit}</strong>
                    <span style={{ fontSize: style.smallFont }}>{model.labels.educationVideo}</span>
                </div>
            </section>

            <section data-overflow-check="true" style={{ display: 'grid', gap: '2mm', minHeight: roomy ? '42mm' : '34mm', padding: style.cardPadding, borderRadius: style.radius, background: '#f1f5f9', border: '0.3mm solid #e2e8f0', overflow: 'hidden' }}>
                <SectionHeading
                    icon="check"
                    title={model.labels.todayActions}
                    color="#1d4ed8"
                    sectionFont={style.sectionFont}
                    smallFont={style.smallFont}
                />
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, actions.length)}, minmax(0, 1fr))`, gap: roomy ? '3mm' : '2mm', minHeight: 0 }}>
                    {actions.map((action, index) => (
                        <article key={`${index}-${action}`} style={{ display: 'grid', gridTemplateColumns: `${actionIconSize} minmax(0, 1fr)`, alignItems: 'center', gap: roomy ? '3mm' : '2.2mm', minWidth: 0, padding: roomy ? '3.5mm' : '2.5mm', borderRadius: '3mm', background: '#ffffff', boxShadow: '0 0.7mm 2mm rgba(15, 23, 42, 0.07)', overflow: 'hidden' }}>
                            <span style={{ display: 'inline-flex', width: actionIconSize, height: actionIconSize, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#ffffff', background: index === 0 ? '#2563eb' : index === 1 ? '#0f766e' : '#d97706', fontSize: style.sectionFont, fontWeight: 950 }}>
                                {index + 1}
                            </span>
                            <p data-overflow-check="true" style={{ ...clampStyle(roomy ? 4 : 3), margin: 0, fontSize: style.bodyFont, lineHeight: 1.28, fontWeight: 800, letterSpacing: '-0.01em' }}>
                                {action}
                            </p>
                        </article>
                    ))}
                </div>
            </section>

            <section data-overflow-check="true" style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '2.2mm', minHeight: 0, padding: style.cardPadding, borderRadius: style.radius, background: model.priorityMode === 'high-grade-risks' ? '#fff7ed' : '#ecfeff', border: `0.4mm solid ${model.priorityMode === 'high-grade-risks' ? '#fed7aa' : '#a5f3fc'}`, overflow: 'hidden' }}>
                <SectionHeading
                    icon={model.priorityMode === 'high-grade-risks' ? 'warning' : 'focus'}
                    title={model.priorityMode === 'high-grade-risks' ? model.labels.highGradeRisks : model.labels.fieldFocus}
                    badge={model.priorityMode === 'field-focus' ? model.labels.noHighGradeRisks : undefined}
                    color={model.priorityMode === 'high-grade-risks' ? '#c2410c' : '#0e7490'}
                    sectionFont={style.sectionFont}
                    smallFont={style.smallFont}
                />
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${priorityCount}, minmax(0, 1fr))`, gap: roomy ? '3.2mm' : '2.2mm', minHeight: 0 }}>
                    {model.priorityCards.length ? model.priorityCards.map((card, index) => (
                        <article key={card.id} style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr) auto', gap: roomy ? '2.4mm' : '1.7mm', minWidth: 0, minHeight: 0, padding: roomy ? '4mm' : '3mm', borderRadius: '3mm', background: '#ffffff', borderTop: `1.5mm solid ${model.priorityMode === 'high-grade-risks' ? ['#ef4444', '#f97316', '#f59e0b'][index] || '#f59e0b' : '#0891b2'}`, boxShadow: '0 1mm 3mm rgba(15, 23, 42, 0.08)', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', minWidth: 0 }}>
                                <span style={{ display: 'inline-flex', width: roomy ? '10mm' : '8mm', height: roomy ? '10mm' : '8mm', flex: '0 0 auto', alignItems: 'center', justifyContent: 'center', borderRadius: '2.5mm', color: '#ffffff', background: model.priorityMode === 'high-grade-risks' ? '#c2410c' : '#0e7490', fontSize: style.sectionFont, fontWeight: 950 }}>
                                    {index + 1}
                                </span>
                                <h3 data-overflow-check="true" style={{ ...clampStyle(2), margin: 0, color: '#0f172a', fontSize: roomy ? style.sectionFont : style.bodyFont, lineHeight: 1.15, fontWeight: 950, letterSpacing: '-0.02em' }}>
                                    {card.title}
                                </h3>
                            </div>
                            <p data-overflow-check="true" style={{ ...clampStyle(roomy ? 5 : 4), alignSelf: 'center', margin: 0, color: '#334155', fontSize: style.bodyFont, lineHeight: 1.38, fontWeight: 700 }}>
                                {card.body}
                            </p>
                            {model.priorityMode === 'high-grade-risks' ? (
                                <div style={{ display: 'grid', gap: '1.7mm' }}>
                                    {card.owner ? (
                                        <span data-overflow-check="true" style={{ ...clampStyle(1), color: '#64748b', fontSize: style.smallFont }}>
                                            {card.owner}
                                        </span>
                                    ) : null}
                                    <EvidenceBar
                                        segments={card.evidenceSegments}
                                        label={model.labels.evidenceStrength}
                                        sourceLabel={model.labels.evidenceSource}
                                        sourceCount={card.evidenceCount}
                                        smallFont={style.smallFont}
                                    />
                                </div>
                            ) : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', color: '#0e7490', fontSize: style.smallFont, fontWeight: 900 }}>
                                    <SafetyPosterIcon name="check" className="h-[4mm] w-[4mm]" />
                                    {model.labels.fieldFocus}
                                </span>
                            )}
                        </article>
                    )) : (
                        <div style={{ display: 'grid', placeItems: 'center', borderRadius: '3mm', color: '#0e7490', background: '#ffffff', fontWeight: 850 }}>
                            {model.coreMessage}
                        </div>
                    )}
                </div>
            </section>

            <section data-overflow-check="true" style={{ display: 'grid', gap: '2mm', minHeight: roomy ? '37mm' : '30mm', padding: style.cardPadding, borderRadius: style.radius, background: '#ffffff', border: '0.35mm solid #cbd5e1', overflow: 'hidden' }}>
                <SectionHeading
                    icon={model.flowMode === 'work-sequence' ? 'action' : 'focus'}
                    title={model.flowMode === 'work-sequence' ? model.labels.workSequence : model.labels.focusFlow}
                    color="#0f766e"
                    sectionFont={style.sectionFont}
                    smallFont={style.smallFont}
                />
                <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
                    {flowItems.map((item, index) => (
                        <React.Fragment key={`${index}-${item}`}>
                            <article style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '1.3mm', flex: '1 1 0', minWidth: 0, padding: roomy ? '2.8mm' : '2.1mm', borderRadius: '2.5mm', color: '#134e4a', background: index % 2 ? '#ecfdf5' : '#f0fdfa', border: '0.3mm solid #99f6e4', overflow: 'hidden' }}>
                                <span style={{ display: 'inline-flex', width: roomy ? '8mm' : '6.5mm', height: roomy ? '8mm' : '6.5mm', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', color: '#ffffff', background: '#0f766e', fontSize: style.smallFont, fontWeight: 950 }}>
                                    {String(index + 1).padStart(2, '0')}
                                </span>
                                <p data-overflow-check="true" style={{ ...clampStyle(roomy ? 4 : 3), alignSelf: 'center', margin: 0, fontSize: style.bodyFont, lineHeight: 1.28, fontWeight: 800 }}>
                                    {item}
                                </p>
                            </article>
                            {index < flowItems.length - 1 ? (
                                <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: roomy ? '6mm' : '4.5mm', flex: '0 0 auto', color: '#0f766e', fontSize: roomy ? '17pt' : '13pt', fontWeight: 950 }}>
                                    {flowArrow}
                                </span>
                            ) : null}
                        </React.Fragment>
                    ))}
                </div>
            </section>

            <section data-overflow-check="true" style={{ display: 'grid', gridTemplateColumns: model.ppeItems.length ? '0.9fr 1.5fr' : '1fr', gap: style.gap, minHeight: roomy ? '43mm' : '35mm', overflow: 'hidden' }}>
                {model.ppeItems.length ? (
                    <article data-overflow-check="true" style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '2mm', minWidth: 0, padding: style.cardPadding, borderRadius: style.radius, color: '#1e3a8a', background: '#eff6ff', border: '0.35mm solid #bfdbfe', overflow: 'hidden' }}>
                        <SectionHeading
                            icon="shield"
                            title={model.labels.requiredPpe}
                            badge={model.labels.ppeEvidenceOnly}
                            color="#1d4ed8"
                            sectionFont={style.sectionFont}
                            smallFont={style.smallFont}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, model.ppeItems.length)}, minmax(0, 1fr))`, alignItems: 'stretch', gap: '1.7mm', minHeight: 0 }}>
                            {model.ppeItems.map((item) => (
                                <div key={item.type} style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: roomy ? '2mm' : '1.2mm', minWidth: 0, padding: '1.5mm', borderRadius: '2.5mm', background: '#ffffff', textAlign: 'center', overflow: 'hidden' }}>
                                    <span style={{ display: 'inline-flex', width: roomy ? '10mm' : '8mm', height: roomy ? '10mm' : '8mm', color: '#1d4ed8' }}>
                                        <SafetyPosterIcon name={item.type} className="h-full w-full" />
                                    </span>
                                    <strong data-overflow-check="true" style={{ ...clampStyle(2), fontSize: style.smallFont, lineHeight: 1.15 }}>
                                        {item.label}
                                    </strong>
                                </div>
                            ))}
                        </div>
                    </article>
                ) : null}

                <article data-overflow-check="true" style={{ display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', gap: '2mm', minWidth: 0, padding: style.cardPadding, borderRadius: style.radius, color: '#7f1d1d', background: '#fef2f2', border: '0.4mm solid #fecaca', overflow: 'hidden' }}>
                    <SectionHeading
                        icon="stop"
                        title={model.labels.emergencyFlow}
                        color="#dc2626"
                        sectionFont={style.sectionFont}
                        smallFont={style.smallFont}
                    />
                    <div style={{ display: 'flex', alignItems: 'stretch', minHeight: 0 }}>
                        {([
                            { key: 'stop', icon: 'stop' as const, title: translation?.emergency?.stop || model.labels.stop, body: translation?.emergency?.stopBody || model.labels.stopBody, color: '#dc2626' },
                            { key: 'report', icon: 'report' as const, title: translation?.emergency?.report || model.labels.report, body: translation?.emergency?.reportBody || model.labels.reportBody, color: '#ea580c' },
                            { key: 'reassess', icon: 'reassess' as const, title: translation?.emergency?.reassess || model.labels.reassess, body: translation?.emergency?.reassessBody || model.labels.reassessBody, color: '#0f766e' },
                        ]).map((step, index, array) => (
                            <React.Fragment key={step.key}>
                                <div style={{ display: 'grid', justifyItems: 'center', alignContent: 'center', gap: '1mm', flex: '1 1 0', minWidth: 0, padding: '1.5mm', borderRadius: '2.5mm', background: '#ffffff', textAlign: 'center', overflow: 'hidden' }}>
                                    <span style={{ display: 'inline-flex', width: roomy ? '9mm' : '7mm', height: roomy ? '9mm' : '7mm', color: step.color }}>
                                        <SafetyPosterIcon name={step.icon} className="h-full w-full" />
                                    </span>
                                    <strong style={{ color: step.color, fontSize: style.bodyFont, lineHeight: 1 }}>{step.title}</strong>
                                    <span data-overflow-check="true" style={{ ...clampStyle(2), color: '#475569', fontSize: style.smallFont, lineHeight: 1.15 }}>{step.body}</span>
                                </div>
                                {index < array.length - 1 ? (
                                    <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: roomy ? '5mm' : '4mm', flex: '0 0 auto', color: '#dc2626', fontWeight: 950 }}>
                                        {flowArrow}
                                    </span>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </div>
                </article>
            </section>

            <footer data-overflow-check="true" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) repeat(3, minmax(0, .62fr))', alignItems: 'stretch', gap: '2mm', minHeight: roomy ? '19mm' : '15mm', paddingTop: '2mm', borderTop: '0.45mm solid #94a3b8', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '6mm minmax(0, 1fr)', alignItems: 'center', gap: '2mm', minWidth: 0, padding: '2mm 2.6mm', borderRadius: '2.5mm', color: '#ffffff', background: '#0f172a' }}>
                    <SafetyPosterIcon name="shield" className="h-[6mm] w-[6mm]" />
                    <div style={{ minWidth: 0 }}>
                        <p data-overflow-check="true" style={{ ...clampStyle(2), margin: 0, fontSize: style.smallFont, lineHeight: 1.22, fontWeight: 800 }}>
                            {model.closingCommitment}
                        </p>
                        <span style={{ display: 'block', marginTop: '0.8mm', color: '#94a3b8', fontSize: style.smallFont }}>
                            {model.labels.sourceCount} {sourceCount}
                        </span>
                    </div>
                </div>
                {[model.labels.trainer, model.labels.worker, model.labels.manager].map((label) => (
                    <div key={label} style={{ display: 'grid', alignContent: 'space-between', gap: '2mm', padding: '2mm', borderRadius: '2.5mm', border: '0.3mm solid #cbd5e1', background: '#ffffff' }}>
                        <span style={{ color: '#475569', fontSize: style.smallFont, fontWeight: 850 }}>{label}</span>
                        <span aria-hidden="true" style={{ display: 'block', borderBottom: '0.3mm solid #64748b' }} />
                    </div>
                ))}
            </footer>
        </section>
    );
};

export default A4SafetyPoster;
