import type { WorkerRecord } from '../types';

type OcrVerificationLikeRecord = Pick<WorkerRecord, 'nationality' | 'jobField' | 'weakAreas' | 'aiInsights' | 'aiInsights_native' | 'fullText' | 'koreanTranslation' | 'handwrittenAnswers'>;

const normalizeNation = (nationality: string): string => String(nationality || '').trim().toLowerCase();

export const isKoreanNationality = (nationality: string): boolean => {
    const nation = normalizeNation(nationality);
    return nation.includes('대한민국') || nation.includes('한국') || nation.includes('korea');
};

export const getNativeLanguageLabel = (nationality: string): string => {
    const nation = normalizeNation(nationality);

    if (nation.includes('대한민국') || nation.includes('한국') || nation.includes('korea')) return '한국어';
    if (nation.includes('베트남') || nation.includes('vietnam') || nation.includes('việt')) return '베트남어';
    if (nation.includes('중국') || nation.includes('china') || nation.includes('中国')) return '중국어';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국어';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) return '우즈베크어';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return '인도네시아어';
    if (nation.includes('캄보디아') || nation.includes('cambodia') || nation.includes('កម្ពុជា')) return '크메르어';
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) return '몽골어';
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казах')) return '카자흐어';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) return '러시아어';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔어';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma') || nation.includes('မြန်မာ')) return '미얀마어';

    return '모국어';
};

const buildGenericKoreanSummary = (record: Pick<OcrVerificationLikeRecord, 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    const insight = String(record.aiInsights || '').trim();
    return insight || `${job} 작업에서 확인된 위험요인을 다시 점검하고, ${weak || '핵심 위험요인'}에 대한 보호조치를 작업 전·중·후 순서대로 확인해야 합니다.`;
};

export const buildFallbackNativeGuidanceText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'jobField' | 'weakAreas'>): string => {
    const nation = normalizeNation(record.nationality);
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();

    if (nation.includes('베트남') || nation.includes('vietnam')) {
        return `Trong công việc ${job}, hãy kiểm tra đầy đủ khu vực nguy hiểm, thiết bị bảo hộ và trình tự công việc trước khi bắt đầu. ${weak ? `Nội dung cần cải thiện trọng tâm là "${weak}". ` : ''}Nếu điều kiện hiện trường thay đổi trong lúc làm việc, phải dừng lại để đánh giá rủi ro lại rồi mới tiếp tục theo biện pháp bảo vệ đã thống nhất với đội trưởng.`;
    }
    if (nation.includes('중국') || nation.includes('china')) {
        return `在${job}作业开始前，请完整确认危险点、个人防护装备和作业顺序。${weak ? `本次重点改进项为“${weak}”。` : ''}作业过程中如现场条件发生变化，请先暂停并重新评估风险，再按照与班组长确认的防护措施继续作业。`;
    }
    if (nation.includes('태국') || nation.includes('thailand')) {
        return `ก่อนเริ่มงาน${job} ให้ตรวจสอบจุดเสี่ยง อุปกรณ์ป้องกันส่วนบุคคล และลำดับงานให้ครบถ้วน ${weak ? `ประเด็นที่ต้องปรับปรุงหลักคือ "${weak}" ` : ''}หากสภาพหน้างานเปลี่ยนระหว่างทำงาน ให้หยุดก่อน ประเมินความเสี่ยงใหม่ แล้วค่อยทำงานต่อด้วยมาตรการป้องกันที่ยืนยันกับหัวหน้าทีมแล้ว`;
    }
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) {
        return `${job} ishini boshlashdan oldin xavfli nuqtalar, himoya vositalari va ish ketma-ketligini to'liq tekshiring. ${weak ? `Asosiy yaxshilash nuqtasi: "${weak}". ` : ''}Ish paytida maydon sharoiti o'zgarsa, avval to'xtab, xavfni qayta baholang va brigadir bilan kelishilgan himoya choralariga ko'ra davom eting.`;
    }
    if (nation.includes('인도네시아') || nation.includes('indonesia')) {
        return `Sebelum memulai pekerjaan ${job}, periksa secara menyeluruh area bahaya, APD, dan urutan kerja. ${weak ? `Fokus perbaikan utama adalah "${weak}". ` : ''}Jika kondisi lapangan berubah saat bekerja, hentikan dulu, lakukan penilaian risiko ulang, lalu lanjutkan hanya dengan tindakan perlindungan yang telah dikonfirmasi bersama ketua tim.`;
    }
    if (nation.includes('캄보디아') || nation.includes('cambodia')) {
        return `មុនចាប់ផ្តើមការងារ ${job} សូមពិនិត្យឱ្យពេញលេញនូវតំបន់ហានិភ័យ សម្ភារៈការពារ និងលំដាប់ការងារ។${weak ? ` ចំណុចត្រូវកែលម្អសំខាន់គឺ "${weak}"។` : ''} ប្រសិនបើលក្ខខណ្ឌទីតាំងការងារផ្លាស់ប្តូរ សូមឈប់សិន វាយតម្លៃហានិភ័យឡើងវិញ ហើយបន្តតែតាមវិធានការការពារដែលបានយល់ព្រមជាមួយមេក្រុម។`;
    }
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) {
        return `${job} ажлыг эхлэхийн өмнө аюултай хэсэг, хамгаалах хэрэгсэл, ажлын дарааллыг бүрэн шалгана уу. ${weak ? `Гол сайжруулах зүйл нь "${weak}" байна. ` : ''}Ажлын явцад талбайн нөхцөл өөрчлөгдвөл түр зогсож, эрсдэлийг дахин үнэлээд багийн ахлагчтай баталгаажуулсан хамгаалалтын арга хэмжээгээр үргэлжлүүлнэ үү.`;
    }
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казах')) {
        return `${job} жұмысын бастамас бұрын қауіпті аймақтарды, қорғаныс құралдарын және жұмыс ретін толық тексеріңіз. ${weak ? `Негізгі жақсарту тармағы: "${weak}". ` : ''}Жұмыс кезінде алаң жағдайы өзгерсе, алдымен тоқтап, тәуекелді қайта бағалап, бригадирмен келісілген қорғаныс шараларымен ғана жалғастырыңыз.`;
    }
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) {
        return `Перед началом работ ${job} полностью проверьте опасные зоны, средства индивидуальной защиты и последовательность операций. ${weak ? `Ключевой пункт улучшения: "${weak}". ` : ''}Если условия на площадке изменились, сначала остановитесь, заново оцените риски и продолжайте работу только с мерами защиты, согласованными с бригадиром.`;
    }
    if (nation.includes('네팔') || nation.includes('nepal')) {
        return `${job} काम सुरु गर्नु अघि जोखिम क्षेत्र, सुरक्षात्मक उपकरण र कामको क्रम सबै जाँच गर्नुहोस्। ${weak ? `मुख्य सुधार बुँदा "${weak}" हो। ` : ''}काम गर्दा साइटको अवस्था बदलियो भने पहिले रोक्नुहोस्, जोखिम पुनः मूल्यांकन गर्नुहोस्, र टोली प्रमुखसँग पुष्टि गरिएको सुरक्षा उपायअनुसार मात्र काम अघि बढाउनुहोस्।`;
    }
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) {
        return `${job} အလုပ်မစတင်မီ အန္တရာယ်ဖြစ်နိုင်သောနေရာများ၊ ကိုယ်ရေးကာကွယ်ပစ္စည်းများနှင့် အလုပ်လုပ်ငန်းစဉ်ကို အပြည့်အစုံ စစ်ဆေးပါ။${weak ? ` ယခုအကြိမ် အဓိက ပြုပြင်ရန် အချက်မှာ "${weak}" ဖြစ်ပါသည်။` : ''} အလုပ်လုပ်နေစဉ် လုပ်ငန်းခွင်အခြေအနေပြောင်းလဲပါက ချက်ချင်းရပ်ပြီး အန္တရာယ်ကို ပြန်လည်အကဲဖြတ်ကာ အဖွဲ့ခေါင်းဆောင်နှင့် အတည်ပြုထားသော ကာကွယ်ရေးအစီအမံအတိုင်းသာ ဆက်လုပ်ပါ။`;
    }
    if (isKoreanNationality(record.nationality)) {
        return `${job} 작업 전 위험요인, 보호구, 작업순서를 빠짐없이 확인하고 시작하세요. ${weak ? `이번 핵심 개선 항목은 '${weak}'입니다. ` : ''}작업 중 조건이 바뀌면 즉시 멈추어 위험평가를 다시 수행한 뒤 팀장과 확인한 보호조치에 따라 재개해야 합니다.`;
    }

    return `${job} 작업 시작 전에 위험요인, 보호구, 작업순서를 빠짐없이 확인하세요. ${weak ? `핵심 개선 항목은 "${weak}"입니다. ` : ''}작업 중 현장 조건이 바뀌면 먼저 멈추고 위험평가를 다시 수행한 뒤 팀장과 확인한 보호조치에 따라 재개하세요.`;
};

export const buildFallbackNativeVerdictText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const nation = normalizeNation(record.nationality);
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    const koreanSummary = buildGenericKoreanSummary(record);

    if (nation.includes('베트남') || nation.includes('vietnam')) return `Bản đánh giá này cho thấy trong công việc ${job}, cần kiểm tra lại biện pháp bảo vệ đối với ${weak || 'nguy cơ chính'}. ${koreanSummary}`;
    if (nation.includes('중국') || nation.includes('china')) return `本次判断说明在${job}作业中，需要再次确认针对${weak || '主要风险'}的防护措施。${koreanSummary}`;
    if (nation.includes('태국') || nation.includes('thailand')) return `ผลการประเมินนี้ชี้ว่าในงาน${job} ต้องตรวจสอบมาตรการป้องกันสำหรับ${weak || 'ความเสี่ยงหลัก'}อีกครั้ง ${koreanSummary}`;
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) return `Ushbu tahlil ${job} ishida ${weak || 'asosiy xavf'} bo'yicha himoya choralarini yana bir bor tekshirish kerakligini ko'rsatadi. ${koreanSummary}`;
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return `Penilaian ini menunjukkan bahwa dalam pekerjaan ${job}, tindakan perlindungan terhadap ${weak || 'risiko utama'} perlu diperiksa kembali. ${koreanSummary}`;
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return `ការវាយតម្លៃនេះបង្ហាញថា ក្នុងការងារ ${job} ត្រូវពិនិត្យឡើងវិញនូវវិធានការការពារសម្រាប់ ${weak || 'ហានិភ័យសំខាន់'}។ ${koreanSummary}`;
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) return `Энэ дүгнэлтээр ${job} ажилд ${weak || 'гол эрсдэл'}-ийн хамгаалалтын арга хэмжээг дахин шалгах шаардлагатай байна. ${koreanSummary}`;
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казах')) return `Бұл талдау ${job} жұмысында ${weak || 'негізгі тәуекел'} бойынша қорғаныс шараларын қайта тексеру қажет екенін көрсетеді. ${koreanSummary}`;
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) return `Данная оценка показывает, что в работе ${job} нужно повторно проверить меры защиты по ${weak || 'основному риску'}. ${koreanSummary}`;
    if (nation.includes('네팔') || nation.includes('nepal')) return `यो मूल्यांकनले ${job} काममा ${weak || 'मुख्य जोखिम'} सम्बन्धी सुरक्षा उपाय फेरि जाँच गर्न आवश्यक देखाउँछ। ${koreanSummary}`;
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return `ဤသုံးသပ်ချက်အရ ${job} အလုပ်တွင် ${weak || 'အဓိကအန္တရာယ်'} အတွက် ကာကွယ်ရေးအစီအမံကို ထပ်မံစစ်ဆေးရန် လိုအပ်ပါသည်။ ${koreanSummary}`;
    if (isKoreanNationality(record.nationality)) return koreanSummary;

    return koreanSummary;
};

export const buildFallbackNativeCoachingText = (record: Pick<OcrVerificationLikeRecord, 'nationality' | 'jobField' | 'weakAreas' | 'aiInsights'>): string => {
    const nation = normalizeNation(record.nationality);
    const job = String(record.jobField || '작업').trim();
    const weak = String(record.weakAreas?.[0] || '').trim();
    const improvement = weak ? `"${weak}"` : '확인된 위험요인';

    if (nation.includes('베트남') || nation.includes('vietnam')) {
        return `Để cải thiện độ an toàn trong công việc ${job}, hãy tập trung vào ${improvement}. Hãy thực hiện kiểm tra thiết bị bảo hộ đầy đủ trước mỗi ca làm việc và tuân thủ nghiêm ngặt quy trình an toàn đã được hướng dẫn.`;
    }
    if (nation.includes('중국') || nation.includes('china')) {
        return `为改善${job}作业安全，重点关注${improvement}。每班作业前务必检查个人防护装备，并严格遵守已经培训的安全操作规程。`;
    }
    if (nation.includes('태국') || nation.includes('thailand')) {
        return `เพื่อปรับปรุงความปลอดภัยในงาน${job} ให้เน้นที่${improvement} ตรวจสอบอุปกรณ์ป้องกันส่วนบุคคลให้ครบถ้วนก่อนทุกกะงาน และปฏิบัติตามขั้นตอนความปลอดภัยที่ได้รับการอบรมอย่างเคร่งครัด`;
    }
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) {
        return `${job} ishida xavfsizlikni yaxshilash uchun ${improvement} ga e'tibor qarating. Har smenadan oldin himoya vositalarini to'liq tekshiring va o'rgatilgan xavfsizlik qoidalariga qat'iy rioya qiling.`;
    }
    if (nation.includes('인도네시아') || nation.includes('indonesia')) {
        return `Untuk meningkatkan keselamatan dalam pekerjaan ${job}, fokuslah pada ${improvement}. Periksa APD secara lengkap sebelum setiap shift dan patuhi prosedur keselamatan yang telah dilatihkan dengan ketat.`;
    }
    if (nation.includes('캄보디아') || nation.includes('cambodia')) {
        return `ដើម្បីកែលម្អសុវត្ថិភាពក្នុងការងារ ${job} សូមផ្តោតលើ ${improvement}។ ត្រូវពិនិត្យឧបករណ៍ការពារឱ្យបានគ្រប់គ្រាន់មុនគ្រប់វេន ហើយអនុវត្តតាមនីតិវិធីសុវត្ថិភាពដែលបានបង្ហាត់ប្រាប់យ៉ាងតឹងរ៉ឹង។`;
    }
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) {
        return `${job} ажлын аюулгүй байдлыг сайжруулахын тулд ${improvement}-д анхааран хандаарай. Ажлын ээлж бүрийн өмнө хамгаалах хэрэгслийг бүрэн шалгаад, зааварчилгаанд заасан аюулгүй байдлын журмыг чанд мөрдөөрэй.`;
    }
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казах')) {
        return `${job} жұмысындағы қауіпсіздікті жақсарту үшін ${improvement}-ге назар аударыңыз. Әр ауысымнан бұрын қорғаныс құралдарын толық тексеріп, үйретілген қауіпсіздік ережелерін қатаң сақтаңыз.`;
    }
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('росси') || nation.includes('русск')) {
        return `Для повышения безопасности при ${job} сосредоточьтесь на ${improvement}. Перед каждой сменой полностью проверяйте средства индивидуальной защиты и строго соблюдайте инструктированные правила безопасности.`;
    }
    if (nation.includes('네팔') || nation.includes('nepal')) {
        return `${job} कामको सुरक्षा सुधार गर्न ${improvement} मा ध्यान दिनुहोस्। प्रत्येक सिफ्ट अघि सुरक्षात्मक उपकरण पूर्ण रूपमा जाँच गर्नुहोस् र सिकाइएको सुरक्षा प्रक्रिया कडाइका साथ पालना गर्नुहोस्।`;
    }
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) {
        return `${job} အလုပ်တွင် ဘေးကင်းလုံခြုံမှုကို တိုးတက်စေရန် ${improvement} ကို အာရုံစိုက်ပါ။ လုပ်ငန်းဆိုင်းတိုင်း မစတင်မီ ကိုယ်ကာကွယ်ပစ္စည်းကို အပြည့်စစ်ဆေးပြီး သင်ကြားပေးထားသော ဘေးကင်းရေးလုပ်ထုံးလုပ်နည်းကို တင်းတင်းကျပ်ကျပ် လိုက်နာပါ။`;
    }
    // 한국어 및 기본 폴백
    return `${job} 작업의 안전 개선을 위해 ${improvement}에 집중적으로 대응하십시오. 매 작업 전 보호구를 빠짐없이 점검하고, 교육받은 안전 절차를 엄수하여 재발을 방지하십시오.`;
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
    const nativeLanguageLabel = getNativeLanguageLabel(record.nationality);
    const issues: string[] = [];

    if (hasQuestionnairePattern && answerCount === 0) {
        issues.push('문항별 원문 답변 누락');
    }
    if (hasQuestionnairePattern && translatedAnswerCount === 0) {
        issues.push('문항별 한국어 해석 누락');
    }
    if (hasQuestionnairePattern && !isKoreanNationality(record.nationality) && nativeTranslatedAnswerCount === 0) {
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