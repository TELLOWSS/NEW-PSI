import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { handleSupabasePermissionError, supabase } from '../lib/supabaseClient';
import {
    TRAINING_AUDIO_LANGUAGES,
    TRAINING_AUDIO_LANGUAGE_NATIONALITY,
    resolveTrainingLanguageByNationality,
    type TrainingAudioLanguageCode,
} from '../utils/trainingLanguageUtils';

interface WorkerTrainingProps {
    sessionId: string;
}

type SessionRow = {
    id: string;
    source_text_ko: string;
    original_script?: string;
    audio_urls: unknown;
    translated_texts?: unknown;
};

type UiText = {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    loading: string;
    noSession: string;
    errorPrefix: string;
    missingNameAlert: string;
    missingSignatureAlert: string;
    submitSuccess: string;
    submitFail: string;
    submit: string;
    submitting: string;
    signatureLabel: string;
    signatureClear: string;
    languageSelectLabel: string;
    selectedNationalityLabel: string;
    selectedAudioLabel: string;
    mp3Connected: string;
    mp3Missing: string;
    audioRecorded: string;
    audioActivateHint: string;
    audioHiddenHint: string;
    translatedScriptLabel: string;
    scrollLabel: string;
    scriptReadSaved: string;
    scriptScrollHint: string;
    signatureDefenseTitle: string;
    signatureDefenseDescription: string;
    acknowledgedLabel: string;
    canvasActivationHint: string;
    engagementRequiredAlert: string;
    acknowledgeRequiredAlert: string;
    sessionIdMissing: string;
    sessionFetchErrorLabel: string;
    permissionDenied: string;
};

const uiTranslations: Record<TrainingAudioLanguageCode, UiText> = {
    'ko-KR': {
        title: '외국인 근로자 안전교육 확인', subtitle: '음성 안내를 듣고 전자서명을 제출해 주세요.', nameLabel: '이름', namePlaceholder: '이름 입력',
        loading: '불러오는 중...', noSession: '세션이 없습니다. 관리자에게 문의해 주세요.', errorPrefix: '오류', missingNameAlert: '이름을 입력해 주세요.',
        missingSignatureAlert: '전자서명을 먼저 입력해 주세요.', submitSuccess: '제출 완료! 교육 이수 서명이 저장되었습니다.', submitFail: '제출 실패',
        submit: '제출하기', submitting: '제출 중...', signatureLabel: '전자서명', signatureClear: '초기화', languageSelectLabel: '11개국 언어 선택',
        selectedNationalityLabel: '선택 국적', selectedAudioLabel: '선택 언어 오디오', mp3Connected: 'MP3 연결됨', mp3Missing: 'MP3 미업로드',
        audioRecorded: '오디오 재생 기록이 확인되었습니다.', audioActivateHint: '재생 버튼을 누르면 체크박스/서명이 활성화됩니다.',
        audioHiddenHint: '관리자가 해당 언어 MP3를 올리지 않아 오디오 플레이어를 숨겼습니다. 아래 대본을 끝까지 읽으면 서명이 활성화됩니다.',
        translatedScriptLabel: '번역 대본', scrollLabel: '스크롤', scriptReadSaved: '대본 끝까지 읽기 기록이 저장되었습니다.',
        scriptScrollHint: '대본을 끝까지 스크롤하면 체크박스/서명이 활성화됩니다.', signatureDefenseTitle: '전자 서명 방어 로직',
        signatureDefenseDescription: '오디오 1회 재생 또는 번역 대본 끝까지 읽기 중 하나가 확인되어야 체크박스와 전자서명이 활성화됩니다.',
        acknowledgedLabel: '위험성평가 내용을 숙지했습니다', canvasActivationHint: '오디오 재생 또는 끝까지 읽기 완료 후 체크박스를 선택하면 전자서명 캔버스가 활성화됩니다.',
        engagementRequiredAlert: '오디오를 1회 재생하거나 대본을 끝까지 스크롤한 후에만 서명할 수 있습니다.',
        acknowledgeRequiredAlert: '위험성평가 내용을 숙지했습니다 체크를 먼저 진행해 주세요.', sessionIdMissing: 'sessionId가 없습니다. QR URL을 다시 확인해 주세요.',
        sessionFetchErrorLabel: '세션 조회 오류', permissionDenied: '권한이 없거나 관리자 승인이 필요합니다',
    },
    'cmn-CN': {
        title: '外籍工人安全培训确认', subtitle: '请收听语音指引并提交电子签名。', nameLabel: '姓名', namePlaceholder: '请输入姓名',
        loading: '加载中...', noSession: '未找到会话，请联系管理员。', errorPrefix: '错误', missingNameAlert: '请输入姓名。',
        missingSignatureAlert: '请先完成签名。', submitSuccess: '提交完成！培训签名已保存。', submitFail: '提交失败', submit: '提交', submitting: '提交中...',
        signatureLabel: '电子签名', signatureClear: '重置', languageSelectLabel: '选择语言（11种）', selectedNationalityLabel: '所选国籍', selectedAudioLabel: '所选语言音频',
        mp3Connected: 'MP3 已连接', mp3Missing: 'MP3 未上传', audioRecorded: '已记录音频播放。', audioActivateHint: '点击播放后将激活复选框和签名。',
        audioHiddenHint: '管理员未上传该语言MP3。请完整阅读下方文本后激活签名。', translatedScriptLabel: '翻译文本', scrollLabel: '滚动',
        scriptReadSaved: '已记录阅读到文本末尾。', scriptScrollHint: '滚动到文本末尾后将激活复选框和签名。', signatureDefenseTitle: '电子签名防护逻辑',
        signatureDefenseDescription: '必须满足“播放音频一次”或“将译文阅读到末尾”之一，才能激活复选框和电子签名。', acknowledgedLabel: '我已理解风险评估内容',
        canvasActivationHint: '完成播放或阅读到末尾并勾选后，电子签名画布才会启用。', engagementRequiredAlert: '请先播放音频一次或将文本滚动到末尾后再签名。',
        acknowledgeRequiredAlert: '请先勾选“我已理解风险评估内容”。', sessionIdMissing: '缺少 sessionId。请重新检查二维码链接。',
        sessionFetchErrorLabel: '会话加载错误', permissionDenied: '没有权限或需要管理员批准。',
    },
    'vi-VN': {
        title: 'Xác nhận đào tạo an toàn cho công nhân', subtitle: 'Vui lòng nghe hướng dẫn âm thanh và gửi chữ ký điện tử.', nameLabel: 'Họ tên', namePlaceholder: 'Nhập họ tên',
        loading: 'Đang tải...', noSession: 'Không tìm thấy phiên. Vui lòng liên hệ quản trị viên.', errorPrefix: 'Lỗi', missingNameAlert: 'Vui lòng nhập họ tên.',
        missingSignatureAlert: 'Vui lòng ký tên trước.', submitSuccess: 'Gửi thành công! Chữ ký đào tạo đã được lưu.', submitFail: 'Gửi thất bại', submit: 'Gửi', submitting: 'Đang gửi...',
        signatureLabel: 'Chữ ký điện tử', signatureClear: 'Xóa', languageSelectLabel: 'Chọn ngôn ngữ (11)', selectedNationalityLabel: 'Quốc tịch đã chọn', selectedAudioLabel: 'Âm thanh ngôn ngữ đã chọn',
        mp3Connected: 'Đã kết nối MP3', mp3Missing: 'Chưa có MP3', audioRecorded: 'Đã ghi nhận phát âm thanh.', audioActivateHint: 'Nhấn phát để kích hoạt checkbox/chữ ký.',
        audioHiddenHint: 'Quản trị viên chưa tải MP3 ngôn ngữ này. Hãy đọc hết văn bản bên dưới để kích hoạt chữ ký.', translatedScriptLabel: 'Kịch bản dịch', scrollLabel: 'Cuộn',
        scriptReadSaved: 'Đã ghi nhận đọc đến cuối kịch bản.', scriptScrollHint: 'Cuộn đến cuối kịch bản để kích hoạt checkbox/chữ ký.', signatureDefenseTitle: 'Cơ chế bảo vệ chữ ký điện tử',
        signatureDefenseDescription: 'Phải xác nhận ít nhất một điều kiện: phát âm thanh 1 lần hoặc đọc hết kịch bản dịch, thì checkbox và chữ ký mới được kích hoạt.',
        acknowledgedLabel: 'Tôi đã hiểu nội dung đánh giá rủi ro', canvasActivationHint: 'Hoàn tất phát âm thanh/đọc hết và chọn checkbox để bật khung chữ ký.',
        engagementRequiredAlert: 'Bạn chỉ có thể ký sau khi phát âm thanh 1 lần hoặc cuộn đến cuối kịch bản.', acknowledgeRequiredAlert: 'Vui lòng tích trước mục đã hiểu nội dung đánh giá rủi ro.',
        sessionIdMissing: 'Không có sessionId. Vui lòng kiểm tra lại URL QR.', sessionFetchErrorLabel: 'Lỗi tải phiên', permissionDenied: 'Bạn không có quyền hoặc cần quản trị viên phê duyệt.',
    },
    'km-KH': { title: 'ការបញ្ជាក់ការបណ្តុះបណ្តាលសុវត្ថិភាព', subtitle: 'សូមស្តាប់ការណែនាំសំឡេង ហើយដាក់ស្នាមហត្ថលេខាអេឡិចត្រូនិក។', nameLabel: 'ឈ្មោះ', namePlaceholder: 'បញ្ចូលឈ្មោះ', loading: 'កំពុងផ្ទុក...', noSession: 'រកមិនឃើញសម័យ។', errorPrefix: 'កំហុស', missingNameAlert: 'សូមបញ្ចូលឈ្មោះ។', missingSignatureAlert: 'សូមចុះហត្ថលេខាមុន។', submitSuccess: 'បានដាក់ស្នើដោយជោគជ័យ។', submitFail: 'ដាក់ស្នើបរាជ័យ', submit: 'ដាក់ស្នើ', submitting: 'កំពុងដាក់ស្នើ...', signatureLabel: 'ហត្ថលេខាអេឡិចត្រូនិក', signatureClear: 'សម្អាត', languageSelectLabel: 'ជ្រើសរើសភាសា (១១)', selectedNationalityLabel: 'សញ្ជាតិដែលបានជ្រើស', selectedAudioLabel: 'សំឡេងភាសាដែលបានជ្រើស', mp3Connected: 'បានភ្ជាប់ MP3', mp3Missing: 'មិនទាន់មាន MP3', audioRecorded: 'បានកត់ត្រាការចាក់សំឡេង។', audioActivateHint: 'ចុចចាក់សំឡេង ដើម្បីបើកប្រអប់ធីក/ហត្ថលេខា។', audioHiddenHint: 'អ្នកគ្រប់គ្រងមិនទាន់អាប់ឡូដ MP3 សម្រាប់ភាសានេះទេ។ សូមអានអត្ថបទឲ្យចប់ ដើម្បីបើកហត្ថលេខា។', translatedScriptLabel: 'អត្ថបទបកប្រែ', scrollLabel: 'រមូរ', scriptReadSaved: 'បានកត់ត្រាការអានដល់ចុងអត្ថបទ។', scriptScrollHint: 'សូមរមូរដល់ចុងអត្ថបទ ដើម្បីបើកប្រអប់ធីក/ហត្ថលេខា។', signatureDefenseTitle: 'លោជិកការពារហត្ថលេខាអេឡិចត្រូនិក', signatureDefenseDescription: 'ត្រូវបំពេញយ៉ាងហោចណាស់មួយលក្ខខណ្ឌ៖ ចាក់សំឡេង១ដង ឬ អានអត្ថបទដល់ចុង។', acknowledgedLabel: 'ខ្ញុំបានយល់ពីមាតិកាការវាយតម្លៃហានិភ័យ', canvasActivationHint: 'បន្ទាប់ពីបំពេញលក្ខខណ្ឌ និងធីកប្រអប់ នឹងបើកផ្ទាំងហត្ថលេខា។', engagementRequiredAlert: 'សូមចាក់សំឡេង១ដង ឬ រមូរអត្ថបទដល់ចុង មុនចុះហត្ថលេខា។', acknowledgeRequiredAlert: 'សូមធីកថាអ្នកបានយល់ពីមាតិកាការវាយតម្លៃហានិភ័យជាមុន។', sessionIdMissing: 'មិនមាន sessionId ទេ។ សូមពិនិត្យ URL QR ម្ដងទៀត។', sessionFetchErrorLabel: 'កំហុសក្នុងការទាញសម័យ', permissionDenied: 'គ្មានសិទ្ធិចូលប្រើ ឬ ត្រូវការការអនុម័តពីអ្នកគ្រប់គ្រង។' },
    'id-ID': { title: 'Konfirmasi Pelatihan Keselamatan', subtitle: 'Dengarkan panduan audio dan kirim tanda tangan elektronik.', nameLabel: 'Nama', namePlaceholder: 'Masukkan nama', loading: 'Memuat...', noSession: 'Sesi tidak ditemukan.', errorPrefix: 'Error', missingNameAlert: 'Silakan masukkan nama.', missingSignatureAlert: 'Silakan tanda tangan dulu.', submitSuccess: 'Berhasil dikirim.', submitFail: 'Gagal kirim', submit: 'Kirim', submitting: 'Mengirim...', signatureLabel: 'Tanda Tangan Elektronik', signatureClear: 'Reset', languageSelectLabel: 'Pilih Bahasa (11)', selectedNationalityLabel: 'Kewarganegaraan Terpilih', selectedAudioLabel: 'Audio Bahasa Terpilih', mp3Connected: 'MP3 Terhubung', mp3Missing: 'MP3 Belum Ada', audioRecorded: 'Pemutaran audio tercatat.', audioActivateHint: 'Putar audio untuk mengaktifkan centang/tanda tangan.', audioHiddenHint: 'Admin belum unggah MP3 bahasa ini. Baca naskah sampai akhir untuk mengaktifkan tanda tangan.', translatedScriptLabel: 'Naskah Terjemahan', scrollLabel: 'Gulir', scriptReadSaved: 'Membaca sampai akhir tercatat.', scriptScrollHint: 'Gulir sampai akhir untuk mengaktifkan centang/tanda tangan.', signatureDefenseTitle: 'Logika Perlindungan Tanda Tangan', signatureDefenseDescription: 'Putar audio sekali ATAU baca naskah sampai akhir agar centang/tanda tangan aktif.', acknowledgedLabel: 'Saya memahami isi penilaian risiko', canvasActivationHint: 'Setelah syarat terpenuhi + centang, kanvas tanda tangan aktif.', engagementRequiredAlert: 'Putar audio sekali atau gulir sampai akhir sebelum menandatangani.', acknowledgeRequiredAlert: 'Centang dulu bahwa Anda memahami isi penilaian risiko.', sessionIdMissing: 'sessionId tidak ada. Periksa URL QR.', sessionFetchErrorLabel: 'Kesalahan memuat sesi', permissionDenied: 'Akses ditolak atau perlu persetujuan admin.' },
    'mn-MN': { title: 'Аюулгүй ажиллагааны сургалтын баталгаажуулалт', subtitle: 'Аудио зааврыг сонсоод цахим гарын үсгээ илгээнэ үү.', nameLabel: 'Нэр', namePlaceholder: 'Нэрээ оруулна уу', loading: 'Ачаалж байна...', noSession: 'Сесс олдсонгүй.', errorPrefix: 'Алдаа', missingNameAlert: 'Нэрээ оруулна уу.', missingSignatureAlert: 'Эхлээд гарын үсгээ зурна уу.', submitSuccess: 'Амжилттай илгээлээ.', submitFail: 'Илгээхэд алдаа гарлаа', submit: 'Илгээх', submitting: 'Илгээж байна...', signatureLabel: 'Цахим гарын үсэг', signatureClear: 'Цэвэрлэх', languageSelectLabel: 'Хэл сонгох (11)', selectedNationalityLabel: 'Сонгосон иргэншил', selectedAudioLabel: 'Сонгосон хэлний аудио', mp3Connected: 'MP3 холбогдсон', mp3Missing: 'MP3 байхгүй', audioRecorded: 'Аудио тоглуулсан нь бүртгэгдлээ.', audioActivateHint: 'Аудио тоглуулж checkbox/гарын үсгийг идэвхжүүлнэ үү.', audioHiddenHint: 'Энэ хэлний MP3-ийг админ оруулаагүй байна. Доорх текстийг дуустал уншиж гарын үсгийг идэвхжүүлнэ үү.', translatedScriptLabel: 'Орчуулсан текст', scrollLabel: 'Гүйлгэх', scriptReadSaved: 'Текстийг дуустал уншсан нь бүртгэгдлээ.', scriptScrollHint: 'Текстийг дуустал гүйлгэж checkbox/гарын үсгийг идэвхжүүлнэ үү.', signatureDefenseTitle: 'Цахим гарын үсгийн хамгаалалтын логик', signatureDefenseDescription: 'Нэг нөхцөлийг заавал хангана: 1 удаа аудио тоглуулах ЭСВЭЛ текстийг дуустал унших.', acknowledgedLabel: 'Би эрсдэлийн үнэлгээний агуулгыг ойлгосон', canvasActivationHint: 'Нөхцөл биелж, checkbox сонгогдсоны дараа гарын үсгийн талбар идэвхжинэ.', engagementRequiredAlert: 'Гарын үсэг зурахаас өмнө 1 удаа аудио тоглуулах эсвэл текстийг дуустал гүйлгэнэ үү.', acknowledgeRequiredAlert: 'Эхлээд эрсдэлийн үнэлгээг ойлгосноо сонгоно уу.', sessionIdMissing: 'sessionId алга байна. QR URL-ээ шалгана уу.', sessionFetchErrorLabel: 'Сесс ачаалах алдаа', permissionDenied: 'Нэвтрэх эрхгүй эсвэл админы зөвшөөрөл шаардлагатай.' },
    'my-MM': { title: 'လုံခြုံရေးသင်တန်း အတည်ပြုခြင်း', subtitle: 'အသံညွှန်ကြားချက်ကိုနားထောင်ပြီး အီလက်ထရွန်နစ်လက်မှတ်တင်ပြပါ။', nameLabel: 'အမည်', namePlaceholder: 'အမည်ဖြည့်ပါ', loading: 'ဖတ်သိမ်းနေသည်...', noSession: 'Session မတွေ့ပါ။', errorPrefix: 'အမှား', missingNameAlert: 'အမည်ဖြည့်ပါ။', missingSignatureAlert: 'လက်မှတ်ကိုအရင်ရေးပါ။', submitSuccess: 'အောင်မြင်စွာတင်ပြပြီးပါပြီ။', submitFail: 'တင်ပြမှုမအောင်မြင်ပါ', submit: 'တင်ပြမည်', submitting: 'တင်ပြနေသည်...', signatureLabel: 'အီလက်ထရွန်နစ် လက်မှတ်', signatureClear: 'ဖျက်မည်', languageSelectLabel: 'ဘာသာစကားရွေးချယ်ရန် (11)', selectedNationalityLabel: 'ရွေးချယ်ထားသော နိုင်ငံသား', selectedAudioLabel: 'ရွေးချယ်ထားသော ဘာသာစကားအသံ', mp3Connected: 'MP3 ချိတ်ဆက်ပြီး', mp3Missing: 'MP3 မရှိသေးပါ', audioRecorded: 'အသံဖွင့်ထားမှုကိုမှတ်တမ်းတင်ပြီးပါပြီ။', audioActivateHint: 'checkbox/လက်မှတ်ကိုဖွင့်ရန် အသံဖွင့်ပါ။', audioHiddenHint: 'ဤဘာသာစကားအတွက် MP3 ကို admin မတင်ရသေးပါ။ အောက်ပါစာကိုအဆုံးအထိဖတ်ပြီး လက်မှတ်ကိုဖွင့်ပါ။', translatedScriptLabel: 'ဘာသာပြန်စာသား', scrollLabel: 'ရွှေ့', scriptReadSaved: 'စာသားအဆုံးအထိဖတ်ထားမှုကို မှတ်တမ်းတင်ပြီးပါပြီ။', scriptScrollHint: 'စာသားအဆုံးအထိရွှေ့ပြီး checkbox/လက်မှတ်ကိုဖွင့်ပါ။', signatureDefenseTitle: 'အီလက်ထရွန်နစ် လက်မှတ်ကာကွယ်ရေး လိုဂစ်', signatureDefenseDescription: 'အနည်းဆုံး တစ်ခုခုကို ပြီးမြောက်ရမည် - အသံကို ၁ ကြိမ်ဖွင့်ခြင်း သို့မဟုတ် စာသားအဆုံးအထိဖတ်ခြင်း။', acknowledgedLabel: 'အန္တရာယ်အကဲဖြတ်ချက် အကြောင်းအရာကို နားလည်ပြီးပါပြီ', canvasActivationHint: 'လိုအပ်ချက်ပြီးပြီး checkbox ရွေးပြီးမှ လက်မှတ် canvas ဖွင့်မည်။', engagementRequiredAlert: 'လက်မှတ်ရေးမီ အသံကို ၁ ကြိမ်ဖွင့်ပါ သို့မဟုတ် စာသားအဆုံးအထိရွှေ့ဖတ်ပါ။', acknowledgeRequiredAlert: 'အန္တရာယ်အကဲဖြတ်ချက်ကို နားလည်ကြောင်းကို အရင်ရွေးပါ။', sessionIdMissing: 'sessionId မရှိပါ။ QR URL ကို ပြန်စစ်ပါ။', sessionFetchErrorLabel: 'Session ဖတ်ယူမှု အမှား', permissionDenied: 'ဝင်ရောက်ခွင့်မရှိပါ သို့မဟုတ် admin အတည်ပြုချက်လိုအပ်သည်။' },
    'ru-RU': { title: 'Подтверждение обучения по безопасности', subtitle: 'Прослушайте аудиоинструкцию и отправьте электронную подпись.', nameLabel: 'Имя', namePlaceholder: 'Введите имя', loading: 'Загрузка...', noSession: 'Сессия не найдена.', errorPrefix: 'Ошибка', missingNameAlert: 'Введите имя.', missingSignatureAlert: 'Сначала поставьте подпись.', submitSuccess: 'Успешно отправлено.', submitFail: 'Ошибка отправки', submit: 'Отправить', submitting: 'Отправка...', signatureLabel: 'Электронная подпись', signatureClear: 'Сброс', languageSelectLabel: 'Выбор языка (11)', selectedNationalityLabel: 'Выбранная национальность', selectedAudioLabel: 'Аудио выбранного языка', mp3Connected: 'MP3 подключен', mp3Missing: 'MP3 не загружен', audioRecorded: 'Воспроизведение аудио зафиксировано.', audioActivateHint: 'Нажмите воспроизведение, чтобы активировать чекбокс/подпись.', audioHiddenHint: 'Для этого языка MP3 не загружен. Прочитайте текст до конца для активации подписи.', translatedScriptLabel: 'Переведенный текст', scrollLabel: 'Прокрутка', scriptReadSaved: 'Прочтение до конца зафиксировано.', scriptScrollHint: 'Прокрутите до конца, чтобы активировать чекбокс/подпись.', signatureDefenseTitle: 'Логика защиты электронной подписи', signatureDefenseDescription: 'Нужно выполнить одно из условий: 1 раз воспроизвести аудио ИЛИ прочитать текст до конца.', acknowledgedLabel: 'Я ознакомился с оценкой рисков', canvasActivationHint: 'После выполнения условия и отметки чекбокса поле подписи активируется.', engagementRequiredAlert: 'Перед подписью воспроизведите аудио 1 раз или прокрутите текст до конца.', acknowledgeRequiredAlert: 'Сначала отметьте, что вы ознакомились с оценкой рисков.', sessionIdMissing: 'Отсутствует sessionId. Проверьте QR-ссылку.', sessionFetchErrorLabel: 'Ошибка загрузки сессии', permissionDenied: 'Доступ запрещен или требуется одобрение администратора.' },
    'uz-UZ': { title: 'Xavfsizlik bo‘yicha o‘qitishni tasdiqlash', subtitle: 'Audio yo‘riqnomani tinglab, elektron imzoni yuboring.', nameLabel: 'Ism', namePlaceholder: 'Ismingizni kiriting', loading: 'Yuklanmoqda...', noSession: 'Sessiya topilmadi.', errorPrefix: 'Xato', missingNameAlert: 'Iltimos, ismingizni kiriting.', missingSignatureAlert: 'Avval imzo qo‘ying.', submitSuccess: 'Muvaffaqiyatli yuborildi.', submitFail: 'Yuborishda xatolik', submit: 'Yuborish', submitting: 'Yuborilmoqda...', signatureLabel: 'Elektron imzo', signatureClear: 'Tozalash', languageSelectLabel: 'Tilni tanlang (11)', selectedNationalityLabel: 'Tanlangan millat', selectedAudioLabel: 'Tanlangan til audiosi', mp3Connected: 'MP3 ulangan', mp3Missing: 'MP3 yuklanmagan', audioRecorded: 'Audio ijrosi qayd etildi.', audioActivateHint: 'Checkbox/imzoni faollashtirish uchun audioni bosing.', audioHiddenHint: 'Bu til uchun MP3 yuklanmagan. Imzoni faollashtirish uchun matnni oxirigacha o‘qing.', translatedScriptLabel: 'Tarjima matni', scrollLabel: 'Skroll', scriptReadSaved: 'Matnni oxirigacha o‘qish qayd etildi.', scriptScrollHint: 'Checkbox/imzoni faollashtirish uchun matnni oxirigacha aylantiring.', signatureDefenseTitle: 'Elektron imzo himoya mantiqi', signatureDefenseDescription: 'Quyidagidan kamida bittasi bajarilishi shart: audioni 1 marta eshitish yoki matnni oxirigacha o‘qish.', acknowledgedLabel: 'Men xavfni baholash mazmunini tushundim', canvasActivationHint: 'Shart bajarilib, checkbox belgilangandan keyin imzo oynasi faollashadi.', engagementRequiredAlert: 'Imzo qo‘yishdan oldin audioni 1 marta eshiting yoki matnni oxirigacha aylantiring.', acknowledgeRequiredAlert: 'Avval xavfni baholashni tushunganingizni belgilang.', sessionIdMissing: 'sessionId yo‘q. QR URL manzilini tekshiring.', sessionFetchErrorLabel: 'Sessiyani olishda xato', permissionDenied: 'Kirish taqiqlangan yoki administrator tasdig‘i kerak.' },
    'th-TH': { title: 'ยืนยันการอบรมความปลอดภัย', subtitle: 'โปรดฟังคำแนะนำเสียงและส่งลายเซ็นอิเล็กทรอนิกส์', nameLabel: 'ชื่อ', namePlaceholder: 'กรอกชื่อ', loading: 'กำลังโหลด...', noSession: 'ไม่พบเซสชัน', errorPrefix: 'ข้อผิดพลาด', missingNameAlert: 'โปรดกรอกชื่อ', missingSignatureAlert: 'โปรดลงลายเซ็นก่อน', submitSuccess: 'ส่งสำเร็จ', submitFail: 'ส่งไม่สำเร็จ', submit: 'ส่ง', submitting: 'กำลังส่ง...', signatureLabel: 'ลายเซ็นอิเล็กทรอนิกส์', signatureClear: 'รีเซ็ต', languageSelectLabel: 'เลือกภาษา (11 ภาษา)', selectedNationalityLabel: 'สัญชาติที่เลือก', selectedAudioLabel: 'เสียงตามภาษาที่เลือก', mp3Connected: 'เชื่อมต่อ MP3 แล้ว', mp3Missing: 'ยังไม่มี MP3', audioRecorded: 'บันทึกการเล่นเสียงแล้ว', audioActivateHint: 'กดเล่นเสียงเพื่อเปิดใช้งานเช็กบ็อกซ์/ลายเซ็น', audioHiddenHint: 'ผู้ดูแลยังไม่ได้อัปโหลด MP3 ภาษานี้ กรุณาอ่านสคริปต์จนจบเพื่อเปิดใช้งานลายเซ็น', translatedScriptLabel: 'สคริปต์แปล', scrollLabel: 'เลื่อน', scriptReadSaved: 'บันทึกการอ่านจนจบแล้ว', scriptScrollHint: 'เลื่อนจนสุดเพื่อเปิดใช้งานเช็กบ็อกซ์/ลายเซ็น', signatureDefenseTitle: 'ตรรกะป้องกันลายเซ็นอิเล็กทรอนิกส์', signatureDefenseDescription: 'ต้องเล่นเสียง 1 ครั้ง หรืออ่านสคริปต์จนสุด อย่างใดอย่างหนึ่งก่อน จึงจะเปิดใช้งานเช็กบ็อกซ์/ลายเซ็น', acknowledgedLabel: 'ฉันเข้าใจเนื้อหาการประเมินความเสี่ยงแล้ว', canvasActivationHint: 'เมื่อทำครบเงื่อนไขและติ๊กเช็กบ็อกซ์แล้ว พื้นที่ลายเซ็นจะใช้งานได้', engagementRequiredAlert: 'ต้องเล่นเสียง 1 ครั้งหรือเลื่อนอ่านจนจบก่อนลงลายเซ็น', acknowledgeRequiredAlert: 'โปรดติ๊กว่าเข้าใจเนื้อหาการประเมินความเสี่ยงก่อน', sessionIdMissing: 'ไม่พบ sessionId กรุณาตรวจสอบ URL QR', sessionFetchErrorLabel: 'ข้อผิดพลาดในการโหลดเซสชัน', permissionDenied: 'ไม่มีสิทธิ์เข้าถึงหรือรอผู้ดูแลอนุมัติ' },
    'kk-KZ': { title: 'Қауіпсіздік оқытуын растау', subtitle: 'Аудио нұсқаулықты тыңдап, электрондық қолтаңбаңызды жіберіңіз.', nameLabel: 'Аты-жөні', namePlaceholder: 'Аты-жөніңізді енгізіңіз', loading: 'Жүктелуде...', noSession: 'Сессия табылмады.', errorPrefix: 'Қате', missingNameAlert: 'Аты-жөніңізді енгізіңіз.', missingSignatureAlert: 'Алдымен қолтаңба қойыңыз.', submitSuccess: 'Сәтті жіберілді.', submitFail: 'Жіберу сәтсіз аяқталды', submit: 'Жіберу', submitting: 'Жіберілуде...', signatureLabel: 'Электрондық қолтаңба', signatureClear: 'Тазарту', languageSelectLabel: 'Тілді таңдаңыз (11)', selectedNationalityLabel: 'Таңдалған ұлт', selectedAudioLabel: 'Таңдалған тілдегі аудио', mp3Connected: 'MP3 қосылған', mp3Missing: 'MP3 жүктелмеген', audioRecorded: 'Аудио ойнату тіркелді.', audioActivateHint: 'Чекбокс/қолтаңбаны белсендіру үшін аудионы ойнатыңыз.', audioHiddenHint: 'Бұл тілге MP3 жүктелмеген. Қолтаңбаны белсендіру үшін мәтінді соңына дейін оқыңыз.', translatedScriptLabel: 'Аударма мәтіні', scrollLabel: 'Жылжыту', scriptReadSaved: 'Мәтінді соңына дейін оқу тіркелді.', scriptScrollHint: 'Чекбокс/қолтаңбаны белсендіру үшін мәтінді соңына дейін жылжытыңыз.', signatureDefenseTitle: 'Электрондық қолтаңбаны қорғау логикасы', signatureDefenseDescription: 'Кемінде бір шарт орындалуы керек: аудионы 1 рет тыңдау НЕМЕСЕ мәтінді соңына дейін оқу.', acknowledgedLabel: 'Мен тәуекелді бағалау мазмұнын түсіндім', canvasActivationHint: 'Шарт орындалып, чекбокс белгіленгеннен кейін қолтаңба алаңы белсенді болады.', engagementRequiredAlert: 'Қол қою алдында аудионы 1 рет тыңдаңыз немесе мәтінді соңына дейін жылжытыңыз.', acknowledgeRequiredAlert: 'Алдымен тәуекелді бағалауды түсінгеніңізді белгілеңіз.', sessionIdMissing: 'sessionId жоқ. QR URL мекенжайын тексеріңіз.', sessionFetchErrorLabel: 'Сессияны жүктеу қатесі', permissionDenied: 'Қолжетімсіз немесе әкімші мақұлдауы қажет.' },
};

const resolveLanguageCandidates = (languageCode: string): string[] => {
    const normalized = String(languageCode || '').trim();
    if (!normalized) return ['en-US'];

    const base = normalized.split('-')[0];
    const candidates = [normalized, `${base.toLowerCase()}-${normalized.split('-')[1] || ''}`, base, 'en-US']
        .filter(Boolean);
    return Array.from(new Set(candidates));
};

type SignaturePadSectionProps = {
    selectedLanguageCode: TrainingAudioLanguageCode;
    uiText: UiText;
    hasEngagementProof: boolean;
    hasAcknowledged: boolean;
    setHasAcknowledged: (value: boolean) => void;
    canUseSignature: boolean;
    sigRef: React.MutableRefObject<SignatureCanvas | null>;
    handleClear: () => void;
};

const SignaturePadSection: React.FC<SignaturePadSectionProps> = ({
    selectedLanguageCode,
    uiText,
    hasEngagementProof,
    hasAcknowledged,
    setHasAcknowledged,
    canUseSignature,
    sigRef,
    handleClear,
}) => (
    <div
        data-language={selectedLanguageCode}
        className={`mt-4 rounded-2xl border p-4 ${hasEngagementProof ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}
    >
        <p className="text-sm font-black text-slate-900">{uiText.signatureDefenseTitle}</p>
        <p className="mt-1 text-[11px] font-bold text-slate-600">{uiText.signatureDefenseDescription}</p>

        <label className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-3 ${hasEngagementProof ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'}`}>
            <input
                type="checkbox"
                disabled={!hasEngagementProof}
                checked={hasAcknowledged}
                onChange={(e) => setHasAcknowledged(e.target.checked)}
                className="mt-1"
            />
            <span className="text-sm font-black text-slate-800">{uiText.acknowledgedLabel}</span>
        </label>

        <div className="mt-4">
            <label className="block text-xs font-black text-slate-500 mb-2">{uiText.signatureLabel}</label>
            <div className="relative border border-slate-200 rounded-xl overflow-hidden bg-white">
                <SignatureCanvas
                    ref={(ref) => {
                        sigRef.current = ref;
                    }}
                    penColor="black"
                    canvasProps={{
                        width: 700,
                        height: 220,
                        className: `w-full h-[220px] ${canUseSignature ? '' : 'pointer-events-none opacity-40'}`,
                    }}
                />
                {!canUseSignature && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/70 px-6 text-center text-sm font-black text-slate-600">
                        {uiText.canvasActivationHint}
                    </div>
                )}
            </div>
            <button
                onClick={handleClear}
                disabled={!canUseSignature}
                className="mt-2 px-4 py-2 text-xs font-black rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {uiText.signatureClear}
            </button>
        </div>
    </div>
);

const WorkerTraining: React.FC<WorkerTrainingProps> = ({ sessionId }) => {
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState<SessionRow | null>(null);
    const [workerName, setWorkerName] = useState('');
    const [selectedLanguageCode, setSelectedLanguageCode] = useState<TrainingAudioLanguageCode>('ko-KR');
    const [nationality, setNationality] = useState('대한민국');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [hasAudioStarted, setHasAudioStarted] = useState(false);
    const [hasScrolledToEnd, setHasScrolledToEnd] = useState(false);
    const [guidanceProgress, setGuidanceProgress] = useState(0);
    const [hasAcknowledged, setHasAcknowledged] = useState(false);

    const sigRef = useRef<SignatureCanvas | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const guidanceRef = useRef<HTMLDivElement | null>(null);

    const effectiveLangKey = selectedLanguageCode || resolveTrainingLanguageByNationality(nationality);
    const uiText = uiTranslations[effectiveLangKey] || uiTranslations['ko-KR'];
    const simplifiedMode = useMemo(() => {
        const queryMode = new URLSearchParams(window.location.search).get('mode');
        const isMobileUa = /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || '');
        return queryMode === 'worker-training' || isMobileUa;
    }, []);

    const normalizedAudioMap = useMemo(() => {
        if (!sessionData?.audio_urls || typeof sessionData.audio_urls !== 'object') return {} as Record<string, string>;
        const source = sessionData.audio_urls as Record<string, unknown>;
        const map: Record<string, string> = {};
        Object.entries(source).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim()) {
                map[key] = value.trim();
            }
        });
        return map;
    }, [sessionData]);

    const normalizedTextMap = useMemo(() => {
        const source = (sessionData?.translated_texts && typeof sessionData.translated_texts === 'object')
            ? sessionData.translated_texts as Record<string, unknown>
            : {};
        const map: Record<string, string> = {};
        Object.entries(source).forEach(([key, value]) => {
            if (typeof value === 'string' && value.trim()) {
                map[key] = value.trim();
            }
        });
        return map;
    }, [sessionData]);

    const selectedAudioUrl = useMemo(() => {
        const candidates = resolveLanguageCandidates(effectiveLangKey);
        for (const key of candidates) {
            if (normalizedAudioMap[key]) return normalizedAudioMap[key];
        }
        return '';
    }, [normalizedAudioMap, effectiveLangKey]);

    const selectedTranslatedText = useMemo(() => {
        if (!sessionData) return '';
        const candidates = resolveLanguageCandidates(effectiveLangKey);
        for (const key of candidates) {
            if (normalizedTextMap[key]) return normalizedTextMap[key];
        }
        return normalizedTextMap[effectiveLangKey]
            || sessionData.original_script
            || sessionData.source_text_ko
            || '';
    }, [sessionData, normalizedTextMap, effectiveLangKey]);

    const hasEngagementProof = hasAudioStarted || hasScrolledToEnd;
    const canUseSignature = hasEngagementProof && hasAcknowledged;

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
    }, [selectedAudioUrl]);

    useEffect(() => {
        setHasAudioStarted(false);
        setHasScrolledToEnd(false);
        setGuidanceProgress(0);
        setHasAcknowledged(false);
        sigRef.current?.clear();
    }, [effectiveLangKey, sessionId]);

    useEffect(() => {
        const node = guidanceRef.current;
        if (!node) return;

        const syncProgress = () => {
            const maxScrollable = node.scrollHeight - node.clientHeight;
            if (maxScrollable <= 0) {
                setGuidanceProgress(100);
                setHasScrolledToEnd(true);
                return;
            }

            const progress = Math.min(100, Math.round((node.scrollTop / maxScrollable) * 100));
            const reachedEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
            setGuidanceProgress(progress);
            setHasScrolledToEnd(reachedEnd);
        };

        const rafId = window.requestAnimationFrame(syncProgress);
        return () => window.cancelAnimationFrame(rafId);
    }, [selectedTranslatedText]);

    useEffect(() => {
        if (!simplifiedMode || submitted) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [simplifiedMode, submitted]);

    useEffect(() => {
        const run = async () => {
            if (!sessionId) {
                setMessage(uiText.sessionIdMissing);
                setLoading(false);
                return;
            }

            setLoading(true);
            const { data, error } = await supabase
                .from('training_sessions')
                .select('id, source_text_ko, original_script, audio_urls, translated_texts')
                .eq('id', sessionId)
                .single();

            if (error) {
                if (!handleSupabasePermissionError(error)) {
                    setMessage(`${uiText.sessionFetchErrorLabel}: ${error.message}`);
                } else {
                    setMessage(uiText.permissionDenied);
                }
                setSessionData(null);
            } else {
                setSessionData(data as SessionRow);
            }
            setLoading(false);
        };

        void run();
    }, [sessionId, uiText.permissionDenied, uiText.sessionFetchErrorLabel, uiText.sessionIdMissing]);

    useEffect(() => {
        const browserLang = (navigator.language || 'ko-KR').toLowerCase();
        const matched = TRAINING_AUDIO_LANGUAGES.find((item) => browserLang.startsWith(item.code.split('-')[0].toLowerCase()));
        const nextCode = matched?.code || 'ko-KR';
        setSelectedLanguageCode(nextCode);
        setNationality(TRAINING_AUDIO_LANGUAGE_NATIONALITY[nextCode]);
    }, []);

    const handleLanguageSelect = (code: TrainingAudioLanguageCode) => {
        setSelectedLanguageCode(code);
        setNationality(TRAINING_AUDIO_LANGUAGE_NATIONALITY[code]);
    };

    const handleClear = () => {
        sigRef.current?.clear();
    };

    const handleSubmit = async () => {
        if (!workerName.trim()) {
            alert(uiText.missingNameAlert);
            return;
        }

        if (!hasEngagementProof) {
            alert(uiText.engagementRequiredAlert);
            return;
        }

        if (!hasAcknowledged) {
            alert(uiText.acknowledgeRequiredAlert);
            return;
        }

        if (!sigRef.current || sigRef.current.isEmpty()) {
            alert(uiText.missingSignatureAlert);
            return;
        }

        const signatureDataUrl = sigRef.current.toDataURL('image/png');

        setSubmitting(true);
        setMessage('');

        try {
            const response = await fetch('/api/training/submit-signature', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    workerName,
                    nationality,
                    selectedLanguageCode: effectiveLangKey,
                    reviewedGuidance: hasEngagementProof,
                    audioPlayed: hasAudioStarted,
                    scrolledToEnd: hasScrolledToEnd,
                    acknowledgedRiskAssessment: hasAcknowledged,
                    checklist: {
                        riskReview: hasAcknowledged,
                        ppeConfirm: hasAcknowledged,
                        emergencyConfirm: hasAcknowledged,
                    },
                    selectedAudioUrl: selectedAudioUrl || null,
                    signatureDataUrl,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.message || '제출 실패');
            }

            setMessage(uiText.submitSuccess);
            setSubmitted(true);
            setWorkerName('');
            sigRef.current?.clear();
        } catch (error: any) {
            setMessage(`${uiText.errorPrefix}: ${error?.message || uiText.submitFail}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="bg-white p-6 rounded-2xl border border-slate-200 font-bold">{uiText.loading}</div>;
    }

    if (!sessionData) {
        return <div className="bg-white p-6 rounded-2xl border border-rose-200 text-rose-700 font-bold">{uiText.noSession}</div>;
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">{uiText.title}</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">{uiText.subtitle}</p>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{uiText.nameLabel}</label>
                    <input
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                        placeholder={uiText.namePlaceholder}
                    />
                </div>

                <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="block text-xs font-black text-slate-500">{uiText.languageSelectLabel}</label>
                        <span className="text-[11px] font-bold text-slate-500">{uiText.selectedNationalityLabel}: {nationality}</span>
                    </div>
                    <div className="overflow-x-auto pb-2">
                        <div className="flex gap-2 min-w-max">
                            {TRAINING_AUDIO_LANGUAGES.map((lang) => {
                                const active = lang.code === effectiveLangKey;
                                return (
                                    <button
                                        key={lang.code}
                                        type="button"
                                        onClick={() => handleLanguageSelect(lang.code)}
                                        className={`min-w-[84px] rounded-2xl border px-3 py-3 text-center transition-all ${active ? 'border-indigo-500 bg-indigo-50 shadow-sm' : 'border-slate-200 bg-white'}`}
                                    >
                                        <div className="text-2xl">{lang.flag}</div>
                                        <div className={`mt-1 text-[11px] font-black ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{lang.shortLabel}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                            <p className="text-xs font-black text-slate-500">{uiText.selectedAudioLabel}</p>
                            <p className="text-sm font-black text-slate-900">{TRAINING_AUDIO_LANGUAGES.find((item) => item.code === effectiveLangKey)?.flag} {effectiveLangKey}</p>
                        </div>
                        <span className={`text-[11px] font-black ${selectedAudioUrl ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {selectedAudioUrl ? uiText.mp3Connected : uiText.mp3Missing}
                        </span>
                    </div>

                    {selectedAudioUrl ? (
                        <audio
                            ref={audioRef}
                            src={selectedAudioUrl}
                            controls
                            preload="metadata"
                            className="w-full"
                            onPlay={() => {
                                setIsPlaying(true);
                                setHasAudioStarted(true);
                            }}
                            onPause={() => setIsPlaying(false)}
                            onEnded={() => setIsPlaying(false)}
                        />
                    ) : null}

                    <p className={`mt-3 text-xs font-bold ${selectedAudioUrl ? 'text-slate-600' : 'text-amber-700'}`}>
                        {selectedAudioUrl
                            ? (isPlaying ? uiText.audioRecorded : uiText.audioActivateHint)
                            : uiText.audioHiddenHint}
                    </p>
                </div>

                <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs font-black text-slate-500">{uiText.translatedScriptLabel}</p>
                        <span className={`text-[11px] font-black ${hasScrolledToEnd ? 'text-emerald-700' : 'text-amber-700'}`}>{uiText.scrollLabel} {guidanceProgress}%</span>
                    </div>
                    <div
                        ref={guidanceRef}
                        onScroll={() => {
                            const node = guidanceRef.current;
                            if (!node) return;
                            const maxScrollable = node.scrollHeight - node.clientHeight;
                            if (maxScrollable <= 0) {
                                setGuidanceProgress(100);
                                setHasScrolledToEnd(true);
                                return;
                            }
                            const progress = Math.min(100, Math.round((node.scrollTop / maxScrollable) * 100));
                            const reachedEnd = node.scrollTop + node.clientHeight >= node.scrollHeight - 4;
                            setGuidanceProgress(progress);
                            setHasScrolledToEnd(reachedEnd);
                        }}
                        className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                        <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap leading-7">{selectedTranslatedText}</p>
                    </div>
                    <p className={`mt-2 text-[11px] font-black ${hasScrolledToEnd ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {hasScrolledToEnd ? uiText.scriptReadSaved : uiText.scriptScrollHint}
                    </p>
                </div>

                <SignaturePadSection
                    selectedLanguageCode={selectedLanguageCode}
                    uiText={uiText}
                    hasEngagementProof={hasEngagementProof}
                    hasAcknowledged={hasAcknowledged}
                    setHasAcknowledged={setHasAcknowledged}
                    canUseSignature={canUseSignature}
                    sigRef={sigRef}
                    handleClear={handleClear}
                />

                <button
                    onClick={handleSubmit}
                    disabled={submitting || submitted || !canUseSignature}
                    className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {submitting ? uiText.submitting : uiText.submit}
                </button>

                {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
            </div>
        </div>
    );
};

export default WorkerTraining;
