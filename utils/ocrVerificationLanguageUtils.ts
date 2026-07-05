import type { WorkerRecord } from '../types';
import { getReportLanguagePolicy, resolveReportLanguageCode } from './reportLanguagePolicy.js';

type OcrVerificationLikeRecord = Pick<WorkerRecord, 'nationality' | 'language' | 'jobField' | 'weakAreas' | 'aiInsights' | 'aiInsights_native' | 'fullText' | 'koreanTranslation' | 'handwrittenAnswers'>;

type OcrVerificationQualityRecord = Pick<WorkerRecord, 'nationality' | 'language' | 'jobField' | 'aiInsights' | 'aiInsights_native' | 'handwrittenAnswers' | 'safetyScore'>;

const normalizeNation = (nationality: string): string => String(nationality || '').trim().toLowerCase();
const normalizeLanguage = (language?: string): string => String(language || '').trim().toLowerCase();

type NativeLangCode = 'ko' | 'vi' | 'zh' | 'th' | 'uz' | 'id' | 'km' | 'mn' | 'kk' | 'ru' | 'ne' | 'my' | 'unknown';

const inferNativeLangCode = (nationality: string, language?: string): NativeLangCode => {
    const nation = normalizeNation(nationality);
    const lang = normalizeLanguage(language);

    if (nation.includes('대한민국') || nation.includes('한국') || nation.includes('korea') || lang.startsWith('ko') || lang.includes('korean')) return 'ko';
    if (nation.includes('베트남') || nation.includes('vietnam') || nation.includes('việt') || lang.startsWith('vi') || lang.includes('vietnamese')) return 'vi';
    if (nation.includes('중국') || nation.includes('china') || nation.includes('中国') || lang.startsWith('zh') || lang.includes('chinese')) return 'zh';
    if (nation.includes('태국') || nation.includes('thailand') || lang.startsWith('th') || lang.includes('thai')) return 'th';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек') || lang.startsWith('uz') || lang.includes('uzbek')) return 'uz';
    if (nation.includes('인도네시아') || nation.includes('indonesia') || lang.startsWith('id') || lang.includes('indonesian') || lang.includes('bahasa')) return 'id';
    if (nation.includes('캄보디아') || nation.includes('cambodia') || nation.includes('កម្ពុជា') || lang.startsWith('km') || lang.includes('khmer')) return 'km';
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол') || lang.startsWith('mn') || lang.includes('mongol')) return 'mn';
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казах') || lang.startsWith('kk') || lang.includes('kazakh')) return 'kk';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск') || lang.startsWith('ru') || lang.includes('russian')) return 'ru';
    if (nation.includes('네팔') || nation.includes('nepal') || lang.startsWith('ne') || lang.includes('nepali')) return 'ne';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma') || nation.includes('မြန်မာ') || lang.startsWith('my') || lang.includes('burmese') || lang.includes('myanmar')) return 'my';

    return 'unknown';
};

export const isKoreanNationality = (nationality: string, language?: string): boolean => {
    const nation = normalizeNation(nationality);
    const lang = normalizeLanguage(language);
    return (
        nation.includes('대한민국') ||
        nation.includes('한국') ||
        nation.includes('korea') ||
        lang.startsWith('ko') ||
        lang.includes('korean') ||
        resolveReportLanguageCode(nationality) === 'ko'
    );
};

export const getNativeLanguageLabel = (nationality: string, language?: string): string => {
    return getReportLanguagePolicy(nationality, language).languageNameKo;
};

const buildGenericKoreanSummary = (record: Pick<OcrVerificationLikeRecord, 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    const insight = String(record.aiInsights || '').trim();
    return insight || `${job} 작업에서 확인된 위험요인을 다시 점검하고, ${weak || '핵심 위험요인'}에 대한 보호조치를 작업 전·중·후 순서대로 확인해야 합니다.`;
};

export const buildFallbackNativeGuidanceText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'language' | 'jobField' | 'weakAreas'>): string => {
    const langCode = inferNativeLangCode(record.nationality, record.language);
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    if (langCode === 'ko' || isKoreanNationality(record.nationality)) {
        return `${job} 작업 전 위험요인, 보호구, 작업순서를 빠짐없이 확인하고 시작하세요. ${weak ? `이번 핵심 개선 항목은 '${weak}'입니다. ` : ''}작업 중 조건이 바뀌면 즉시 멈추어 위험평가를 다시 수행한 뒤 팀장과 확인한 보호조치에 따라 재개해야 합니다.`;
    }
    return getReportLanguagePolicy(record.nationality, record.language).genericGuidance;
};
export const buildFallbackNativeVerdictText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'language' | 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const langCode = inferNativeLangCode(record.nationality, record.language);
    const koreanSummary = buildGenericKoreanSummary(record);
    if (langCode === 'ko' || isKoreanNationality(record.nationality)) return koreanSummary;
    return getReportLanguagePolicy(record.nationality, record.language).genericVerdict;
};
export const buildFallbackNativeCoachingText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'language' | 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const langCode = inferNativeLangCode(record.nationality, record.language);
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    const improvement = weak ? `"${weak}"` : '확인된 위험요인';
    if (langCode === 'ko' || isKoreanNationality(record.nationality)) {
        return `${job} 작업의 안전 개선을 위해 ${improvement}에 집중적으로 대응하십시오. 매 작업 전 보호구를 빠짐없이 점검하고, 교육받은 안전 절차를 엄수하여 재발을 방지하십시오.`;
    }
    return getReportLanguagePolicy(record.nationality, record.language).genericCoaching;
};

export const evaluateOcrVerificationCompleteness = (record: OcrVerificationLikeRecord) => {
    const fullText = String(record.fullText || '').trim();
    const koreanTranslation = String(record.koreanTranslation || '').trim();
    const aiInsightsNative = String(record.aiInsights_native || '').trim();
    const handwrittenAnswers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];
    const answerCount = handwrittenAnswers.filter((item) => String(item?.answerText || '').trim().length > 0).length;
    const translatedAnswerCount = handwrittenAnswers.filter((item) => String(item?.koreanTranslation || '').trim().length > 0).length;
    const nativeTranslatedAnswerCount = handwrittenAnswers.filter((item) => String((item as { nativeTranslation?: string })?.nativeTranslation || '').trim().length > 0).length;
    const combinedText = `${fullText}\n${koreanTranslation}`;
    const hasQuestionnairePattern = /(?:^|\s)(?:1|2|3|4|5)[\.\)]|가장\s*큰\s*위험요소|위험등급|안전\s*조치|안전\s*행동|最危险|最大的危险因素|危险等级|安全措施|安全行为/u.test(combinedText);
    const nativeLanguageLabel = getNativeLanguageLabel(record.nationality, record.language);
    const issues: string[] = [];

    if (hasQuestionnairePattern && answerCount === 0) {
        issues.push('문항별 원문 답변 누락');
    }
    if (hasQuestionnairePattern && translatedAnswerCount === 0) {
        issues.push('문항별 한국어 해석 누락');
    }
    if (hasQuestionnairePattern && !isKoreanNationality(record.nationality, record.language) && nativeTranslatedAnswerCount === 0) {
        issues.push(`${nativeLanguageLabel} 문항 해석 누락`);
    }
    if (!aiInsightsNative) {
        issues.push(`${nativeLanguageLabel} 보호 안내 누락`);
    }

    return {
        nativeLanguageLabel,
        hasQuestionnairePattern,
        answerCount,
        translatedAnswerCount,
        nativeTranslatedAnswerCount,
        hasNativeGuidance: aiInsightsNative.length > 0,
        issues,
        isComplete: issues.length === 0,
    };
};

export const evaluateOcrVerificationQuality = (record: OcrVerificationQualityRecord) => {
    const nativeLanguageLabel = getNativeLanguageLabel(record.nationality, record.language);
    const aiInsights = String(record.aiInsights || '').trim();
    const aiInsightsNative = String(record.aiInsights_native || '').trim();
    const jobField = String(record.jobField || '').trim();
    const handwrittenAnswers = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers : [];

    const latinRegex = /[A-Za-z]{2,}/;
    const hasEnglishInKorean = latinRegex.test(aiInsights);
    const hasEnglishInNative = latinRegex.test(aiInsightsNative);

    const answerRows = handwrittenAnswers.filter((item) => String(item?.answerText || '').trim().length > 0);
    const missingNativeAnswerTranslationCount = isKoreanNationality(record.nationality, record.language)
        ? 0
        : answerRows.filter((item) => String((item as { nativeTranslation?: string })?.nativeTranslation || '').trim().length === 0).length;

    const hasJobContextInInsights = jobField.length > 0 && (aiInsights.includes(jobField) || aiInsightsNative.includes(jobField));
    const hasConcreteActionSignal = /(작업\s*전|작업\s*중|작업\s*후|체결|점검|통제|확인|\d+\s*(?:m|미터|cm|개|회|분)|ก่อน|前|后|检查|确认|kiểm tra|trước|sau|провер|контрол)/u.test(`${aiInsights}\n${aiInsightsNative}`);
    const scoreOverestimateRisk = Number(record.safetyScore || 0) >= 80 && (!hasJobContextInInsights || !hasConcreteActionSignal);

    const issues: string[] = [];
    if (hasEnglishInKorean) issues.push('한국어 분석문에 영어 혼입');
    if (hasEnglishInNative) issues.push(`${nativeLanguageLabel} 분석문에 영어 혼입`);
    if (missingNativeAnswerTranslationCount > 0) issues.push(`${nativeLanguageLabel} 문항 번역 누락 ${missingNativeAnswerTranslationCount}건`);
    if (scoreOverestimateRisk) issues.push('점수 과대 의심(공종 맥락/행동근거 부족)');

    return {
        nativeLanguageLabel,
        hasEnglishInKorean,
        hasEnglishInNative,
        missingNativeAnswerTranslationCount,
        scoreOverestimateRisk,
        issues,
        isHealthy: issues.length === 0,
    };
};

export const getNativeWritingGuide = (nationality: string): string[] => {
    const nation = normalizeNation(nationality);
    const common = [
        '작업 전/중/후 순서로 작성합니다.',
        '수치·거리·횟수 같은 검증 가능한 기준을 포함합니다.',
        '영어 혼용 없이 해당 언어만 사용합니다.',
    ];

    if (isKoreanNationality(nationality)) {
        return [
            ...common,
            '예: 작업 전 안전대 체결 확인 → 작업 중 단부 2m 이내 통제 → 작업 후 해체 전 재점검.',
        ];
    }
    if (nation.includes('중국') || nation.includes('china')) {
        return [
            ...common,
            '중국어 간체로 작성하고, 先/中/后 구조(作业前/作业中/作业后)를 유지합니다.',
        ];
    }
    if (nation.includes('베트남') || nation.includes('vietnam') || nation.includes('việt')) {
        return [
            ...common,
            '베트남어로 작성하고, trước khi làm/trong khi làm/sau khi làm 순서를 명확히 적습니다.',
        ];
    }
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) {
        return [
            ...common,
            '몽골어로 작성하고, 행동 주체(본인/팀장)와 확인 시점을 같이 적습니다.',
        ];
    }
    if (nation.includes('캄보디아') || nation.includes('cambodia') || nation.includes('កម្ពុជា')) {
        return [
            ...common,
            '크메르어로 작성하고, 중단 조건(위험 변경 시 즉시 정지)을 반드시 포함합니다.',
        ];
    }
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) {
        return [
            ...common,
            '러시아어로 작성하고, 점검 항목과 통제 범위를 짧은 명령형으로 작성합니다.',
        ];
    }
    if (nation.includes('인도네시아') || nation.includes('indonesia')) {
        return [
            ...common,
            '인도네시아어로 작성하고, APD 점검·현장변경 시 재평가를 반드시 포함합니다.',
        ];
    }

    return [
        ...common,
        '국적별 모국어 표기 규칙을 우선 적용해 현장 전달 문장으로 작성합니다.',
    ];
};

const hasTechnicalErrorSignal = (text: string): boolean => {
    const normalized = String(text || '').toLowerCase();
    return /(could not find|relation .* does not exist|syntax error|unknown\s*\(|public\.|table|uncategorized|database|sql|runtimeerror|exception)/i.test(normalized);
};

export const sanitizeOperationalNote = (note: string, nationality: string): string => {
    const raw = String(note || '').trim();
    if (!raw) return '';
    if (!hasTechnicalErrorSignal(raw)) return raw;

    const nation = normalizeNation(nationality);
    const koFallback = '재평가 과정에서 시스템 오류가 감지되어 자동 문구를 정제했습니다. 현장 관리자 코멘트로 작업자 보호조치를 다시 명확히 안내해 주세요.';

    if (nation.includes('베트남') || nation.includes('vietnam')) {
        return 'Trong quá trình tái đánh giá, hệ thống phát hiện lỗi kỹ thuật nên nội dung được chuẩn hóa lại. Vui lòng giải thích lại biện pháp bảo vệ bằng hướng dẫn của quản lý hiện trường.';
    }
    if (nation.includes('중국') || nation.includes('china')) {
        return '再评估过程中检测到系统技术错误，内容已自动规范化。请由现场管理人员重新明确说明作业保护措施。';
    }
    if (nation.includes('태국') || nation.includes('thailand')) {
        return 'ระหว่างการประเมินซ้ำ พบข้อผิดพลาดทางเทคนิคของระบบ จึงปรับข้อความให้อ่านเข้าใจได้ใหม่ กรุณาให้ผู้จัดการหน้างานอธิบายมาตรการป้องกันอีกครั้ง';
    }
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) {
        return 'ပြန်လည်အကဲဖြတ်လုပ်ငန်းစဉ်တွင် စနစ်ပိုင်းဆိုင်ရာ အမှားကို တွေ့ရှိသဖြင့် စာသားကို ဖတ်ရှုလွယ်အောင် ပြန်လည်တင်ပြထားပါသည်။ လုပ်ငန်းခွင်မန်နေဂျာမှ ကာကွယ်ရေးအစီအမံကို ထပ်မံရှင်းပြပါ။';
    }
    if (nation.includes('우즈벡') || nation.includes('uzbek')) {
        return 'Qayta baholash jarayonida tizim texnik xatosi aniqlandi va matn tushunarli shaklga keltirildi. Iltimos, maydon rahbari himoya choralarini yana bir bor aniq tushuntirsin.';
    }
    if (nation.includes('캄보디아') || nation.includes('cambodia')) {
        return 'ក្នុងដំណើរការវាយតម្លៃឡើងវិញ ប្រព័ន្ធបានរកឃើញកំហុសបច្ចេកទេស ហើយអត្ថបទត្រូវបានកែសម្រួលឱ្យអាចយល់បាន។ សូមឱ្យអ្នកគ្រប់គ្រងការដ្ឋានពន្យល់វិធានការការពារឡើងវិញ។';
    }
    if (nation.includes('인도네시아') || nation.includes('indonesia')) {
        return 'Dalam proses penilaian ulang, sistem mendeteksi kesalahan teknis sehingga teks dinormalisasi. Mohon manajer lapangan menjelaskan kembali langkah perlindungan kepada pekerja.';
    }
    if (nation.includes('몽골') || nation.includes('mongol')) {
        return 'Дахин үнэлгээний явцад системийн техникийн алдаа илэрч, тайлбарыг ойлгомжтой хэлбэрт орууллаа. Талбайн менежер хамгаалалтын арга хэмжээг дахин тодорхой тайлбарлана уу.';
    }
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) {
        return 'В ходе повторной оценки обнаружена техническая ошибка системы, поэтому текст приведён в понятный формат. Попросите руководителя участка повторно чётко объяснить защитные меры.';
    }
    if (nation.includes('카자흐') || nation.includes('kazakh')) {
        return 'Қайта бағалау кезінде жүйелік техникалық қате анықталды, сондықтан мәтін түсінікті форматқа келтірілді. Алаң менеджері қорғаныс шараларын қайта нақты түсіндірсін.';
    }

    const policy = getReportLanguagePolicy(nationality);
    return policy.code === 'ko' ? koFallback : policy.genericCoaching;
};
