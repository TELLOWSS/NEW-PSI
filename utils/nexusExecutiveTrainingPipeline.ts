import {
  TRAINING_LANGUAGE_FLAGS,
  TRAINING_LANGUAGE_LABELS,
  type TrainingLanguageCode,
} from './constructionTrainingTranslation';
import type { NexusOrbitLayer } from './nexusSphereProjection';
import type { NexusPipelineCase } from './nexusQuickPipeline';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  type NexusHazardEquipmentAxis,
  type NexusProcessAxis,
  type NexusStructuralIncidentSeed,
  type NexusZoneAxis,
} from './nexusStructuralTaxonomy';
import { TBM_MONTHLY_PACKAGE_STORAGE_KEY } from './tbmEducationStudio';

export const NEXUS_CEO_TRAINING_HANDOFF_KEY = 'psi_nexus_ceo_training_handoff_v1';
export const NEXUS_CEO_TRAINING_CAMPAIGNS_KEY = 'psi_nexus_ceo_training_campaigns_v1';
export const NEXUS_CEO_TRAINING_UPDATED_EVENT = 'psi-nexus-ceo-training-updated';

export const NEXUS_CORE_12_LANGUAGES: readonly TrainingLanguageCode[] = [
  'ko-KR',
  'vi-VN',
  'cmn-CN',
  'uz-UZ',
  'km-KH',
  'th-TH',
  'id-ID',
  'mn-MN',
  'ru-RU',
  'kk-KZ',
  'ne-NP',
  'my-MM',
];

export type NexusTrainingCampaignStatus =
  | 'draft_ready'
  | 'dispatched_12lang'
  | 'completed_verified';

export const NEXUS_TRAINING_STATUS_LABELS: Record<NexusTrainingCampaignStatus, string> = {
  draft_ready: '초안 준비됨',
  dispatched_12lang: '12개국어 전파 중',
  completed_verified: '서명·이수 환류 완료',
};

export interface NexusWorkerSignatureReceipt {
  signatureId: string;
  workerName: string;
  languageCode: TrainingLanguageCode;
  signedAt: string;
  signatureDataUrl: string;
  siteId?: string;
}

export interface NexusExecutiveTrainingCampaign {
  campaignId: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  structuralNodeIndex: string; // '01'..'10'
  zoneAxis: NexusZoneAxis;
  processAxis: NexusProcessAxis;
  hazardEquipmentAxis: NexusHazardEquipmentAxis;
  matchedCaseCode: string;
  matchedCaseTitle: string;
  sourcePipelineCaseId?: string;
  sourceTextKo: string;
  selectedLanguages: TrainingLanguageCode[];
  multilingualPreviews: Record<string, string>;
  targetWorkers: number;
  confirmedSignatures: number;
  completionRatePct: number | null;
  participatingNationalities: number;
  signedLanguages: TrainingLanguageCode[];
  workerSignatureReceipts?: readonly NexusWorkerSignatureReceipt[];
  linkedSessionId?: string;
  status: NexusTrainingCampaignStatus;
}

const NATIVE_SAFETY_TEMPLATES: Record<
  TrainingLanguageCode,
  (seed: NexusStructuralIncidentSeed) => string
> = {
  'ko-KR': seed =>
    `1. 중점 공정: [${seed.caseCode}] ${seed.title}\n2. 핵심 원인: ${seed.directCause}\n3. 필수 안전조치: ${seed.preventiveMeasure}\n4. 대표이사 당부 및 작업중지: ${seed.ceoTrainingPoint} 위험 발견 시 즉시 작업을 중지하고 관리자에게 알립니다.\n5. 본인 확인: 위 안전조치를 이해했으며 작업 전 반드시 실천하고 서명합니다.`,
  'vi-VN': seed =>
    `1. Công đoạn trọng tâm: [${seed.caseCode}] ${seed.title}\n2. Nguyên nhân rủi ro: Kiểm tra chặt chẽ kết cấu cốp pha, giàn giáo và lối đi an toàn.\n3. Biện pháp bắt buộc: Luôn đeo dây an toàn, kiểm tra lan can, nắp đậy lỗ mở và chốt khóa trước khi làm việc.\n4. Quyền dừng việc của Giám đốc: Nếu phát hiện nguy cơ sập đổ hoặc rơi ngã, PHẢI DỪNG VIỆC NGAY LẬP TỨC và báo cho quản lý.\n5. Cam kết: Tôi đã hiểu rõ hướng dẫn bằng tiếng mẹ đẻ và ký xác nhận thực hiện.`,
  'cmn-CN': seed =>
    `1. 重点工序: [${seed.caseCode}] ${seed.title}\n2. 风险原因: 作业前必须确认模板支撑、锚固螺栓及开口部防护状态。\n3. 必须安全措施: 严禁随意拆除安全护栏、水平连接杆或斜撑，高处作业必须系好安全带。\n4. 代表理事停工指令: 发现坍塌、坠落或夹伤危险时，必须立即停止作业并报告管理员。\n5. 本人确认: 我已阅读并理解母语安全说明，承诺严格执行并签名确认。`,
  'uz-UZ': seed =>
    `1. Asosiy jarayon: [${seed.caseCode}] ${seed.title}\n2. Xavf sababi: Ish boshlashdan oldin qolip, tirgak va ochiq joylar to'sig'ini tekshiring.\n3. Majburiy chora: Xavfsizlik kamarini mahkamlang, panjara va tayanchlarni o'zboshimchalik bilan yechmang.\n4. Ishni to'xtatish qoidasi: Xavf aniqlansa, ISHNI DARHOL TO'XTATING va rahbarga xabar bering.\n5. Tasdiqlash: Ona tilimdagi xavfsizlik yo'riqnomasini tushundim va imzo bilan tasdiqlayman.`,
  'km-KH': seed =>
    `1. ការងារសំខាន់: [${seed.caseCode}] ${seed.title}\n2. មូលហេតុគ្រោះថ្នាក់: ត្រូវពិនិត្យពុម្ព ទម្រទ្រ និងរបាំងការពារមុនពេលធ្វើការ។\n3. វិធានការចាំបាច់: ពាក់ខ្សែក្រវាត់សុវត្ថិភាពជានិច្ច ហាមដោះបង្កាន់ដៃឬទម្រដោយចិត្តឯង។\n4. សិទ្ធិបញ្ឈប់ការងារ: ប្រសិនបើមានគ្រោះថ្នាក់ ត្រូវបញ្ឈប់ការងារភ្លាមៗ ហើយរាយការណ៍ទៅអ្នកគ្រប់គ្រង។\n5. ការបញ្ជាក់: ខ្ញុំបានយល់ច្បាស់នូវការណែនាំជាភាសាកំណើត និងចុះហត្ថលេខាអនុវត្ត។`,
  'th-TH': seed =>
    `1. งานหลัก: [${seed.caseCode}] ${seed.title}\n2. สาเหตุความเสี่ยง: ตรวจสอบแบบหล่อ นั่งร้าน และฝาปิดช่องเปิดก่อนเริ่มงานเสมอ\n3. มาตรการบังคับ: เกี่ยวสายนิรภัยทุกครั้ง ห้ามถอดราวกันตกหรือค้ำยันโดยพลการ\n4. คำสั่งหยุดงานทันที: หากพบสภาพไม่ปลอดภัย ต้องหยุดงานทันทีและแจ้งผู้ควบคุมงาน\n5. การยืนยัน: ข้าพเจ้าเข้าใจคำแนะนำความปลอดภัยและลงชื่อรับทราบ`,
  'id-ID': seed =>
    `1. Pekerjaan Utama: [${seed.caseCode}] ${seed.title}\n2. Penyebab Risiko: Periksa bekisting, penyangga, dan pelindung bukaan sebelum bekerja.\n3. Tindakan Wajib: Gunakan sabuk pengaman dan dilarang melepas pagar pengaman atau pengaku tanpa izin.\n4. Instruksi Hentikan Pekerjaan: Jika kondisi berbahaya, HENTIKAN PEKERJAAN SEGERA dan lapor ke pengawas.\n5. Konfirmasi: Saya memahami panduan bahasa ibu ini dan menandatangani komitmen keselamatan.`,
  'mn-MN': seed =>
    `1. Чухал ажилбар: [${seed.caseCode}] ${seed.title}\n2. Эрсдэлийн шалтгаан: Ажил эхлэхийн өмнө хэв хашмал, тулгуур, нээлхийн хаалтыг шалгана.\n3. Заавал мөрдөх арга хэмжээ: Хамгаалалтын бүсийг бэхэлж, хашлага тулгуурыг дур мэдэн салгаж болохгүй.\n4. Ажил зогсоох эрх: Аюул илэрвэл АЖЛАА НЭН ДАРУЙ ЗОГСООЖ удирдлагад мэдэгдэнэ.\n5. Баталгаажуулалт: Эх хэл дээрх зааварчилгааг ойлгож, гарын үсгээр баталгаажуулж байна.`,
  'ru-RU': seed =>
    `1. Ключевой процесс: [${seed.caseCode}] ${seed.title}\n2. Причина риска: Перед работой проверьте опалубку, стойки и ограждения проемов.\n3. Обязательные меры: Пристегивайте страховочный пояс, запрещено самовольно снимать ограждения и связи.\n4. Остановка работ: При обнаружении угрозы НЕМЕДЛЕННО ОСТАНОВИТЕ РАБОТУ и сообщите руководителю.\n5. Подтверждение: Инструктаж на родном языке понятен, обязуюсь выполнять и подтверждаю подписью.`,
  'kk-KZ': seed =>
    `1. Негізгі жұмыс: [${seed.caseCode}] ${seed.title}\n2. Қауіп себебі: Жұмыс алдында қалыпты, тіректерді және ойық قоршауларын тексеріңіз.\n3. Міндетті шаралар: Сақтандыру белдігін тағыңыз, қоршаулар мен тіректерді өз бетінше шешпеңіз.\n4. Жұмысты тоқтату: Қауіп байқалса, ЖҰМЫСТЫ ДЕРЕУ ТОҚТАТЫП, басшыға хабарлаңыз.\n5. Растау: Ана тілімдегі нұсқаулықты түсіндім және қолыммен растаймын.`,
  'ne-NP': seed =>
    `1. मुख्य कार्य: [${seed.caseCode}] ${seed.title}\n2. जोखिमको कारण: काम सुरु गर्नुअघि फर्मवर्क, टेको र खुला ठाउँको बार जाँच गर्नुहोस्।\n3. अनिवार्य सुरक्षा उपाय: सुरक्षा पेटी अनिवार्य लगाउनुहोस् र अनुमति बिना रेलिङ वा टेको नहटाउनुहोस्।\n4. काम रोक्ने निर्देशन: खतरा देखिएमा तुरुन्तै काम रोक्नुहोस् र सुपरभाइजरलाई खबर गर्नुहोस्।\n5. प्रमाणीकरण: मैले मातृभाषाको सुरक्षा निर्देशन बुझें र पालना गर्ने प्रतिबद्धताका साथ हस्ताक्षर गर्दछु।`,
  'my-MM': seed =>
    `1. အဓိကလုပ်ငန်းစဉ်: [${seed.caseCode}] ${seed.title}\n2. အန္တရာယ်အကြောင်းရင်း: အလုပ်မစမီ ဖောင်ဝပ်၊ ဒေါက်တိုင်နှင့် အပေါက်အကာအရံများကို စစ်ဆေးပါ။\n3. မဖြစ်မနေလိုက်နာရန်: လုံခြုံရေးခါးပတ် ချိတ်ဆက်ပါ၊ လက်ရန်းနှင့် ဒေါက်တိုင်များကို ခွင့်ပြုချက်မရှိဘဲ မဖြုတ်ရ။\n4. အလုပ်ရပ်ဆိုင်းရန်ညွှန်ကြားချက်: အန္တရာယ်တွေ့ရှိပါက အလုပ်ကို ချက်ချင်းရပ်ပြီး တာဝန်ခံထံ အကြောင်းကြားပါ။\n5. အတည်ပြုချက်: မိခင်ဘာသာစကားဖြင့် လမ်းညွှန်ချက်ကို နားလည်သဘောပေါက်ပြီး လက်မှတ်ရေးထိုးပါသည်။`,
  'en-US': seed =>
    `1. Focus Process: [${seed.caseCode}] ${seed.title}\n2. Root Hazard: Verify formwork, shoring, and opening guards before work.\n3. Mandatory Controls: Fasten safety harness and never remove guardrails or braces without authorization.\n4. Stop-Work Directive: If any collapse or fall hazard is observed, STOP WORK IMMEDIATELY and report to supervisor.\n5. Pledge: I understand this guidance and confirm by signature.`,
  'fil-PH': seed =>
    `1. Pangunahing Gawain: [${seed.caseCode}] ${seed.title}\n2. Sanhi ng Panganib: Suriin ang formwork, shoring, at harang bago magtrabaho.\n3. Wajib na Hakbang: Ikabit ang safety harness at huwag alisin ang guardrail.\n4. Utos sa Paghinto: Kung may panganib, IHINTO AGAD ANG TRABAHO at mag-ulat.\n5. Kumpirmasyon: Naunawaan ko at nilalagdaan ko ang gabay na ito.`,
  'hi-IN': seed =>
    `1. मुख्य कार्य: [${seed.caseCode}] ${seed.title}\n2. जोखिम कारण: कार्य से पहले फॉर्मवर्क और रेलिंग की जाँच करें।\n3. अनिवार्य उपाय: सेफ्टी हार्नेस पहनें और बिना अनुमति सपोर्ट न हटाएं।\n4. कार्य रोकने का निर्देश: खतरा दिखने पर तुरंत काम रोकें और सूचित करें।\n5. पुष्टि: मैंने निर्देश समझ लिया है और हस्ताक्षर करता हूँ।`,
  'bn-BD': seed =>
    `1. প্রধান কাজ: [${seed.caseCode}] ${seed.title}\n2. ঝুঁকির কারণ: কাজের আগে ফর্মওয়ার্ক ও रेलিং যাচাই করুন।\n3. বাধ্যতামূলক ব্যবস্থা: সেফটি বেল্ট ব্যবহার করুন এবং সাপোর্ট খুলবেন না।\n4. কাজ বন্ধের নির্দেশ: ঝুঁকি দেখলে অবিলম্বে কাজ বন্ধ করে জানান।\n5. নিশ্চিতকরণ: আমি নির্দেশনা বুঝেছি এবং স্বাক্ষর করছি।`,
  'ur-PK': seed =>
    `1. اہم کام: [${seed.caseCode}] ${seed.title}\n2. خطرے کی وجہ: کام سے پہلے فارم ورک اور حفاظتی ریلنگ چیک کریں۔\n3. لازمی اقدام: سیفٹی بیلٹ باندھیں اور سپورٹ نہ ہٹائیں۔\n4. کام روکنے کا حکم: خطرہ نظر آنے پر فوراً کام روکیں اور اطلاع دیں۔\n5. تصدیق: میں نے ہدایات سمجھ لی ہیں اور دستخط کرتا ہوں۔`,
  'si-LK': seed =>
    `1. ප්‍රධාන ක්‍රියාවලිය: [${seed.caseCode}] ${seed.title}\n2. අවදානම් හේතුව: වැඩට පෙර ආධාරක සහ ආරක්ෂක වැටවල් පරීක්ෂා කරන්න.\n3. අනිවාර්ය පියවර: ආරක්ෂක පටිය පළඳින්න, ආධාරක ඉවත් නොකරන්න.\n4. වැඩ නැවැත්වීමේ නියෝගය: අනතුරක් දුටුවහොත් වහාම වැඩ නවත්වා දැනුම් දෙන්න.\n5. තහවුරු කිරීම: මම උපදෙස් තේරුම් ගත් අතර අත්සන් කරමි.`,
};

export const buildMultilingualPreviewsForSeed = (
  seed: NexusStructuralIncidentSeed,
  languages: readonly TrainingLanguageCode[] = NEXUS_CORE_12_LANGUAGES,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const lang of languages) {
    const builder = NATIVE_SAFETY_TEMPLATES[lang] || NATIVE_SAFETY_TEMPLATES['ko-KR'];
    result[lang] = builder(seed);
  }
  return result;
};

export const buildExecutiveTrainingDraftFromSeed = (
  seed: NexusStructuralIncidentSeed,
  options?: {
    pipelineCase?: NexusPipelineCase;
    targetWorkers?: number;
    languages?: readonly TrainingLanguageCode[];
    nowIso?: string;
  },
): NexusExecutiveTrainingCampaign => {
  const nowIso = options?.nowIso || new Date().toISOString();
  const languages = options?.languages?.length
    ? [...options.languages]
    : [...NEXUS_CORE_12_LANGUAGES];
  const pipelineCase = options?.pipelineCase;
  const locationContext = pipelineCase
    ? `${pipelineCase.locationLabel} (${pipelineCase.observationNote})`
    : seed.title;

  const sourceTextKo = [
    `1. 중점 관리 공정 및 구간: [${seed.caseCode}] ${locationContext}`,
    `2. 유사 사고 직접·근본원인: ${seed.directCause} / ${seed.rootCause}`,
    `3. 필수 안전조치 및 점검기준: ${pipelineCase?.actionTitle || seed.preventiveMeasure}`,
    `4. 대표이사 특별 당부 및 작업중지 지시: ${seed.ceoTrainingPoint} 안전조치가 미비하거나 위험 발견 시 즉시 작업을 중지하고 관리자에게 보고합니다.`,
    `5. 본인 이해 확인 및 실천 서명: 모국어 안내문과 음성을 끝까지 확인하고, 작업 전 보호조치 이행을 전자서명으로 확약합니다.`,
  ].join('\n');

  const multilingualPreviews = buildMultilingualPreviewsForSeed(seed, languages);
  multilingualPreviews['ko-KR'] = sourceTextKo;

  const targetWorkers = Math.max(1, options?.targetWorkers ?? 12);

  return {
    campaignId: `NEXUS-CEO-EDU-${seed.caseCode}-${Date.now().toString(36).toUpperCase()}`,
    createdAt: nowIso,
    updatedAt: nowIso,
    title: `[대표이사 안전교육] ${seed.caseCode} · ${seed.title.slice(0, 38)}`,
    structuralNodeIndex: seed.structuralNodeIndex,
    zoneAxis: seed.zoneAxis,
    processAxis: seed.processAxis,
    hazardEquipmentAxis: seed.hazardEquipmentAxis,
    matchedCaseCode: seed.caseCode,
    matchedCaseTitle: seed.title,
    sourcePipelineCaseId: pipelineCase?.caseId,
    sourceTextKo,
    selectedLanguages: languages,
    multilingualPreviews,
    targetWorkers,
    confirmedSignatures: 0,
    completionRatePct: 0,
    participatingNationalities: 0,
    signedLanguages: [],
    status: 'draft_ready',
  };
};

let memoryCampaignStore: NexusExecutiveTrainingCampaign[] = [];

export const readExecutiveTrainingCampaigns = (): NexusExecutiveTrainingCampaign[] => {
  if (typeof window === 'undefined' || !window.localStorage) return [...memoryCampaignStore];
  try {
    const raw = window.localStorage.getItem(NEXUS_CEO_TRAINING_CAMPAIGNS_KEY);
    if (!raw) return [...memoryCampaignStore];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      memoryCampaignStore = parsed;
      return [...parsed];
    }
    return [...memoryCampaignStore];
  } catch {
    return [...memoryCampaignStore];
  }
};

export const writeExecutiveTrainingCampaigns = (
  campaigns: readonly NexusExecutiveTrainingCampaign[],
): void => {
  memoryCampaignStore = [...campaigns];
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(NEXUS_CEO_TRAINING_CAMPAIGNS_KEY, JSON.stringify(campaigns));
    window.dispatchEvent(new Event(NEXUS_CEO_TRAINING_UPDATED_EVENT));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
};

/**
 * Stages a 1-click executive training draft into both the Nexus campaign store
 * and the AdminTraining handoff storage keys so that opening `admin-training`
 * immediately pre-populates the 5-stage Korean directive and 12-language texts.
 */
export const stageExecutiveTrainingHandoff = (
  seedCodeOrSeed: string | NexusStructuralIncidentSeed,
  options?: {
    pipelineCase?: NexusPipelineCase;
    targetWorkers?: number;
    dispatchImmediately?: boolean;
    nowIso?: string;
  },
): NexusExecutiveTrainingCampaign => {
  const seed =
    typeof seedCodeOrSeed === 'string'
      ? NEXUS_STRUCTURAL_INCIDENT_SEEDS.find(s => s.caseCode === seedCodeOrSeed) ??
        NEXUS_STRUCTURAL_INCIDENT_SEEDS[0]
      : seedCodeOrSeed;

  const campaign = buildExecutiveTrainingDraftFromSeed(seed, options);
  if (options?.dispatchImmediately) {
    campaign.status = 'dispatched_12lang';
  }

  const existing = readExecutiveTrainingCampaigns();
  writeExecutiveTrainingCampaigns([campaign, ...existing].slice(0, 50));

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(NEXUS_CEO_TRAINING_HANDOFF_KEY, JSON.stringify(campaign));
      const month = campaign.createdAt.slice(0, 7);
      window.localStorage.setItem(
        TBM_MONTHLY_PACKAGE_STORAGE_KEY,
        JSON.stringify({
          sourceText: campaign.sourceTextKo,
          translatedTexts: campaign.multilingualPreviews,
          translationNeedsRefresh: false,
          savedAt: campaign.createdAt,
          month,
          workType: `골조·형틀 (${seed.caseCode})`,
          title: campaign.title,
          scopeKey: `${month}::${seed.caseCode}`,
        }),
      );
    } catch {
      // Ignore localStorage quota issues
    }
  }

  return campaign;
};

export const readPendingExecutiveTrainingHandoff = (): NexusExecutiveTrainingCampaign | null => {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(NEXUS_CEO_TRAINING_HANDOFF_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as NexusExecutiveTrainingCampaign;
    return parsed?.campaignId && parsed?.sourceTextKo ? parsed : null;
  } catch {
    return null;
  }
};

export const clearPendingExecutiveTrainingHandoff = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(NEXUS_CEO_TRAINING_HANDOFF_KEY);
  } catch {
    // Ignore
  }
};

/**
 * Records worker signature/acknowledgement progress (or syncs real AdminTraining awarenessStats)
 * and computes the verified completion rate using designated targetWorkers as the denominator.
 */
export const recordExecutiveTrainingSignatureProgress = (
  campaignId: string,
  update: {
    addSignatures?: number;
    exactConfirmedWorkers?: number;
    exactTargetWorkers?: number | null;
    languageCode?: TrainingLanguageCode;
    nationalityCount?: number;
    linkedSessionId?: string;
  },
  nowIso = new Date().toISOString(),
): NexusExecutiveTrainingCampaign[] => {
  const existing = readExecutiveTrainingCampaigns();
  const next = existing.map(campaign => {
    if (campaign.campaignId !== campaignId) return campaign;

    const targetWorkers =
      update.exactTargetWorkers !== undefined && update.exactTargetWorkers !== null
        ? Math.max(0, update.exactTargetWorkers)
        : campaign.targetWorkers;

    const rawConfirmed =
      update.exactConfirmedWorkers !== undefined
        ? Math.max(0, update.exactConfirmedWorkers)
        : campaign.confirmedSignatures + Math.max(0, update.addSignatures ?? 1);

    const confirmedSignatures = targetWorkers > 0 ? Math.min(targetWorkers, rawConfirmed) : rawConfirmed;
    const completionRatePct =
      targetWorkers > 0 ? Math.min(100, Math.round((confirmedSignatures / targetWorkers) * 100)) : null;

    const signedLanguages = update.languageCode
      ? (Array.from(new Set([...campaign.signedLanguages, update.languageCode])) as TrainingLanguageCode[])
      : campaign.signedLanguages;

    const participatingNationalities =
      update.nationalityCount !== undefined
        ? Math.max(campaign.participatingNationalities, update.nationalityCount)
        : Math.max(campaign.participatingNationalities, signedLanguages.length);

    const status: NexusTrainingCampaignStatus =
      completionRatePct !== null && completionRatePct >= 100
        ? 'completed_verified'
        : 'dispatched_12lang';

    return {
      ...campaign,
      targetWorkers,
      confirmedSignatures,
      completionRatePct,
      signedLanguages,
      participatingNationalities,
      linkedSessionId: update.linkedSessionId || campaign.linkedSessionId,
      status,
      updatedAt: nowIso,
    };
  });

  writeExecutiveTrainingCampaigns(next);
  return next;
};

export const recordIndividualWorkerHandwrittenSignature = (
  campaignId: string,
  input: {
    workerName: string;
    languageCode: TrainingLanguageCode;
    signatureDataUrl: string;
    siteId?: string;
  },
  nowIso = new Date().toISOString(),
): { campaigns: NexusExecutiveTrainingCampaign[]; receipt: NexusWorkerSignatureReceipt } => {
  const workerName = String(input.workerName || '').trim().slice(0, 60);
  if (!workerName) {
    throw new Error('서명하는 근로자 성명을 입력해 주세요.');
  }
  const signatureDataUrl = String(input.signatureDataUrl || '').trim();
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
    throw new Error('모국어 안내 확인 후 화면에 자필 서명을 입력해 주세요.');
  }

  const receipt: NexusWorkerSignatureReceipt = {
    signatureId: `NX-SIG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    workerName,
    languageCode: input.languageCode,
    signedAt: nowIso,
    signatureDataUrl,
    siteId: input.siteId,
  };

  const existing = readExecutiveTrainingCampaigns();
  const next = existing.map(campaign => {
    if (campaign.campaignId !== campaignId) return campaign;
    const prevReceipts = Array.isArray(campaign.workerSignatureReceipts)
      ? campaign.workerSignatureReceipts
      : [];
    const targetWorkers = Math.max(1, campaign.targetWorkers || 1);
    const confirmedSignatures = Math.min(targetWorkers, (campaign.confirmedSignatures || 0) + 1);
    const completionRatePct = Math.min(100, Math.round((confirmedSignatures / targetWorkers) * 100));
    const signedLanguages = Array.from(
      new Set([...(campaign.signedLanguages ?? []), input.languageCode]),
    ) as TrainingLanguageCode[];
    const participatingNationalities = Math.max(
      campaign.participatingNationalities || 0,
      signedLanguages.length,
    );
    const status: NexusTrainingCampaignStatus =
      completionRatePct >= 100 ? 'completed_verified' : 'dispatched_12lang';

    return {
      ...campaign,
      confirmedSignatures,
      completionRatePct,
      signedLanguages,
      participatingNationalities,
      workerSignatureReceipts: [receipt, ...prevReceipts].slice(0, 100),
      status,
      updatedAt: nowIso,
    };
  });

  writeExecutiveTrainingCampaigns(next);
  return { campaigns: next, receipt };
};

export interface NexusTrainingNodeSummary {
  nodeIndex: string;
  campaignCount: number;
  activeCampaigns: number;
  completedCampaigns: number;
  totalTargetWorkers: number;
  totalConfirmedSignatures: number;
  averageCompletionRatePct: number | null;
  maxNationalityCount: number;
}

export const summarizeExecutiveTrainingForOrbitLayer = (
  layer: NexusOrbitLayer,
  campaigns: readonly NexusExecutiveTrainingCampaign[],
): readonly NexusTrainingNodeSummary[] => {
  const count = layer === 'cycle' ? 5 : layer === 'modules' ? 6 : 10;
  return Array.from({ length: count }, (_, idx) => {
    const nodeIndex = String(idx + 1).padStart(2, '0');
    const matched = campaigns.filter(c => {
      if (layer === 'structural') return c.structuralNodeIndex === nodeIndex;
      if (layer === 'modules') {
        // 04 대표이사 안전교육, 02 사고사례 DB, 06 조치·재점검·인계
        return nodeIndex === '04' || nodeIndex === '02' || (nodeIndex === '06' && c.status === 'completed_verified');
      }
      // In cycle layer: 02 위험요소 (교육이해), 05 실천약속 (교육 환류)
      return nodeIndex === '05' || nodeIndex === '02';
    });

    let activeCampaigns = 0;
    let completedCampaigns = 0;
    let totalTargetWorkers = 0;
    let totalConfirmedSignatures = 0;
    let maxNationalityCount = 0;

    for (const item of matched) {
      if (item.status === 'completed_verified') completedCampaigns++;
      else activeCampaigns++;
      totalTargetWorkers += item.targetWorkers;
      totalConfirmedSignatures += item.confirmedSignatures;
      if (item.participatingNationalities > maxNationalityCount) {
        maxNationalityCount = item.participatingNationalities;
      }
    }

    const averageCompletionRatePct =
      totalTargetWorkers > 0
        ? Math.min(100, Math.round((totalConfirmedSignatures / totalTargetWorkers) * 100))
        : null;

    return {
      nodeIndex,
      campaignCount: matched.length,
      activeCampaigns,
      completedCampaigns,
      totalTargetWorkers,
      totalConfirmedSignatures,
      averageCompletionRatePct,
      maxNationalityCount,
    };
  });
};

export const formatLanguageBadge = (code: TrainingLanguageCode): string =>
  `${TRAINING_LANGUAGE_FLAGS[code] || '🌐'} ${TRAINING_LANGUAGE_LABELS[code] || code}`;
