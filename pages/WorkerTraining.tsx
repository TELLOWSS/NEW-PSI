import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { isSupabasePermissionError, supabase } from '../lib/supabaseClient';

interface WorkerTrainingProps {
    sessionId: string;
    simplifiedMode?: boolean;
}

type SessionRow = {
    id: string;
    source_text_ko: string;
    audio_urls: unknown;
    translated_texts?: unknown;
};

type UiLocale = 'ko' | 'en' | 'vi' | 'zh';

const LANGUAGE_FLAG_EMOJI: Record<string, string> = {
    'ko-KR': '🇰🇷',
    'en-US': '🇺🇸',
    'vi-VN': '🇻🇳',
    'cmn-CN': '🇨🇳',
    'zh-CN': '🇨🇳',
    'th-TH': '🇹🇭',
    'id-ID': '🇮🇩',
    'uz-UZ': '🇺🇿',
    'mn-MN': '🇲🇳',
    'km-KH': '🇰🇭',
    'ru-RU': '🇷🇺',
    'ne-NP': '🇳🇵',
    'my-MM': '🇲🇲',
    'fil-PH': '🇵🇭',
    'hi-IN': '🇮🇳',
    'bn-BD': '🇧🇩',
    'ur-PK': '🇵🇰',
    'si-LK': '🇱🇰',
    'kk-KZ': '🇰🇿',
};

const UX_TEXT: Record<UiLocale, {
    stepLanguage: string;
    stepListen: string;
    stepSign: string;
    stepLanguageDesc: string;
    stepListenDesc: string;
    stepSignDesc: string;
    languageStatus: string;
    audioMatched: string;
    audioFallback: string;
    textMatched: string;
    textFallback: string;
    availableLanguages: string;
    signatureGuide: string;
    signatureGuideSub: string;
    submitBarTitle: string;
    submitBarReady: string;
    submitBarBlocked: string;
    listenNow: string;
    signNow: string;
    submitConfirm: string;
    signatureDone: string;
    signaturePending: string;
    submitReadyCta: string;
    submitBlockedCta: string;
    checklistStatus: string;
}> = {
    ko: {
        stepLanguage: '1. 언어 선택',
        stepListen: '2. 음성 듣기',
        stepSign: '3. 서명 후 제출',
        stepLanguageDesc: '내 언어가 맞는지 먼저 확인하세요.',
        stepListenDesc: '큰 재생 버튼을 눌러 안내를 들으세요.',
        stepSignDesc: '아래 서명칸 중앙에 서명하고 제출하세요.',
        languageStatus: '언어 접근 확인',
        audioMatched: '선택 언어 음성 연결됨',
        audioFallback: '선택 언어 음성이 없어 대체 언어로 연결됨',
        textMatched: '선택 언어 텍스트 확인됨',
        textFallback: '선택 언어 텍스트가 없어 기본 안내로 대체됨',
        availableLanguages: '현재 제공 언어',
        signatureGuide: '아래 넓은 칸의 가운데에 서명해 주세요.',
        signatureGuideSub: '손가락으로 천천히 크게 서명하면 더 잘 보입니다.',
        submitBarTitle: '마지막 단계',
        submitBarReady: '이제 제출할 수 있습니다.',
        submitBarBlocked: '안내 확인과 체크, 서명을 완료해야 제출할 수 있습니다.',
        listenNow: '음성 듣기',
        signNow: '서명하기',
        submitConfirm: '선택한 언어 안내를 확인했고 전자서명을 제출하시겠습니까?',
        signatureDone: '서명 입력 완료',
        signaturePending: '서명을 아직 하지 않았습니다',
        submitReadyCta: '제출 준비 완료',
        submitBlockedCta: '체크/서명 후 제출 가능',
        checklistStatus: '체크 완료',
    },
    en: {
        stepLanguage: '1. Select Language',
        stepListen: '2. Listen to Audio',
        stepSign: '3. Sign and Submit',
        stepLanguageDesc: 'Check that your language is selected first.',
        stepListenDesc: 'Press the large play button to hear guidance.',
        stepSignDesc: 'Sign in the center of the box below and submit.',
        languageStatus: 'Language access check',
        audioMatched: 'Audio is available in the selected language',
        audioFallback: 'Selected-language audio is missing, fallback language is used',
        textMatched: 'Guidance text is available in the selected language',
        textFallback: 'Selected-language text is missing, default guidance is used',
        availableLanguages: 'Available languages',
        signatureGuide: 'Please sign in the center of the wide box below.',
        signatureGuideSub: 'A slow and larger signature is easier to read.',
        submitBarTitle: 'Final step',
        submitBarReady: 'You can submit now.',
        submitBarBlocked: 'Review guidance, complete checks, and sign before submitting.',
        listenNow: 'Listen now',
        signNow: 'Sign now',
        submitConfirm: 'Have you reviewed the selected-language guidance and want to submit your signature?',
        signatureDone: 'Signature completed',
        signaturePending: 'Signature is not completed yet',
        submitReadyCta: 'Ready to submit',
        submitBlockedCta: 'Complete checks/signature first',
        checklistStatus: 'Checks done',
    },
    vi: {
        stepLanguage: '1. Chọn ngôn ngữ',
        stepListen: '2. Nghe âm thanh',
        stepSign: '3. Ký và gửi',
        stepLanguageDesc: 'Trước tiên hãy kiểm tra đúng ngôn ngữ của bạn.',
        stepListenDesc: 'Nhấn nút phát lớn để nghe hướng dẫn.',
        stepSignDesc: 'Ký vào giữa khung bên dưới rồi gửi.',
        languageStatus: 'Kiểm tra truy cập ngôn ngữ',
        audioMatched: 'Có âm thanh cho đúng ngôn ngữ đã chọn',
        audioFallback: 'Không có âm thanh đúng ngôn ngữ, đang dùng ngôn ngữ thay thế',
        textMatched: 'Có văn bản hướng dẫn cho đúng ngôn ngữ đã chọn',
        textFallback: 'Không có văn bản đúng ngôn ngữ, đang dùng hướng dẫn mặc định',
        availableLanguages: 'Ngôn ngữ hiện có',
        signatureGuide: 'Vui lòng ký vào giữa khung rộng bên dưới.',
        signatureGuideSub: 'Ký chậm và to sẽ dễ nhìn hơn.',
        submitBarTitle: 'Bước cuối',
        submitBarReady: 'Bây giờ bạn có thể gửi.',
        submitBarBlocked: 'Bạn phải đọc hướng dẫn, chọn các mục và ký trước khi gửi.',
        listenNow: 'Nghe ngay',
        signNow: 'Ký ngay',
        submitConfirm: 'Bạn đã kiểm tra hướng dẫn đúng ngôn ngữ và muốn gửi chữ ký điện tử chứ?',
        signatureDone: 'Đã ký xong',
        signaturePending: 'Bạn chưa ký',
        submitReadyCta: 'Sẵn sàng gửi',
        submitBlockedCta: 'Hãy chọn mục và ký trước',
        checklistStatus: 'Mục đã chọn',
    },
    zh: {
        stepLanguage: '1. 选择语言',
        stepListen: '2. 收听语音',
        stepSign: '3. 签名并提交',
        stepLanguageDesc: '请先确认已选择自己的语言。',
        stepListenDesc: '点击大播放按钮收听指引。',
        stepSignDesc: '请在下方签名框中央签名后提交。',
        languageStatus: '语言访问检查',
        audioMatched: '已连接所选语言语音',
        audioFallback: '所选语言语音缺失，已切换为替代语言',
        textMatched: '已确认所选语言文本',
        textFallback: '所选语言文本缺失，已切换为默认指引',
        availableLanguages: '当前提供语言',
        signatureGuide: '请在下方宽框中央进行签名。',
        signatureGuideSub: '放慢速度并签大一些会更清晰。',
        submitBarTitle: '最后一步',
        submitBarReady: '现在可以提交。',
        submitBarBlocked: '请先完成阅读、勾选确认并签名后再提交。',
        listenNow: '立即收听',
        signNow: '立即签名',
        submitConfirm: '您已确认所选语言指引并准备提交电子签名吗？',
        signatureDone: '已完成签名',
        signaturePending: '尚未完成签名',
        submitReadyCta: '可以提交',
        submitBlockedCta: '请先完成勾选和签名',
        checklistStatus: '已勾选项目',
    },
};

const STATUS_TEXT: Record<UiLocale, {
    reading: string;
    checklist: string;
    signature: string;
    required: string;
    done: string;
}> = {
    ko: { reading: '읽기', checklist: '체크', signature: '서명', required: '필수', done: '완료' },
    en: { reading: 'Read', checklist: 'Checks', signature: 'Sign', required: 'Required', done: 'Done' },
    vi: { reading: 'Đọc', checklist: 'Mục chọn', signature: 'Ký', required: 'Bắt buộc', done: 'Hoàn tất' },
    zh: { reading: '阅读', checklist: '勾选', signature: '签名', required: '必填', done: '完成' },
};

const SUMMARY_TEXT: Record<UiLocale, {
    title: string;
    worker: string;
    language: string;
    missing: string;
    ready: string;
    notEntered: string;
}> = {
    ko: {
        title: '최종 확인 요약',
        worker: '근로자',
        language: '선택 언어',
        missing: '남은 단계',
        ready: '모든 준비가 완료되었습니다. 아래 제출 버튼을 누르세요.',
        notEntered: '미입력',
    },
    en: {
        title: 'Final Check Summary',
        worker: 'Worker',
        language: 'Selected language',
        missing: 'Remaining steps',
        ready: 'Everything is ready. Press the submit button below.',
        notEntered: 'Not entered',
    },
    vi: {
        title: 'Tóm tắt kiểm tra cuối',
        worker: 'Người lao động',
        language: 'Ngôn ngữ đã chọn',
        missing: 'Bước còn thiếu',
        ready: 'Mọi thứ đã sẵn sàng. Hãy nhấn nút gửi bên dưới.',
        notEntered: 'Chưa nhập',
    },
    zh: {
        title: '最终确认摘要',
        worker: '员工',
        language: '所选语言',
        missing: '剩余步骤',
        ready: '已全部准备完成。请点击下方提交按钮。',
        notEntered: '未填写',
    },
};

const SUCCESS_TEXT: Record<UiLocale, {
    title: string;
    description: string;
    savedWorker: string;
    savedLanguage: string;
    submittedAt: string;
    showManager: string;
    safeClose: string;
    duplicateBlocked: string;
}> = {
    ko: {
        title: '제출이 완료되었습니다',
        description: '전자서명이 정상 저장되었습니다. 관리자는 이 제출 기록을 확인할 수 있습니다.',
        savedWorker: '제출자',
        savedLanguage: '제출 언어',
        submittedAt: '제출 시간',
        showManager: '이 화면을 관리자에게 보여주세요.',
        safeClose: '확인 후 화면을 닫아도 됩니다.',
        duplicateBlocked: '중복 제출은 자동으로 차단됩니다.',
    },
    en: {
        title: 'Submission completed',
        description: 'Your electronic signature has been saved successfully. Administrators can review this submission record.',
        savedWorker: 'Submitted by',
        savedLanguage: 'Submitted language',
        submittedAt: 'Submitted at',
        showManager: 'Please show this screen to the supervisor.',
        safeClose: 'You may close this screen after confirmation.',
        duplicateBlocked: 'Duplicate submissions are blocked automatically.',
    },
    vi: {
        title: 'Đã gửi thành công',
        description: 'Chữ ký điện tử đã được lưu thành công. Quản trị viên có thể kiểm tra bản ghi gửi này.',
        savedWorker: 'Người gửi',
        savedLanguage: 'Ngôn ngữ gửi',
        submittedAt: 'Thời gian gửi',
        showManager: 'Vui lòng cho quản lý xem màn hình này.',
        safeClose: 'Sau khi xác nhận, bạn có thể đóng màn hình này.',
        duplicateBlocked: 'Hệ thống tự động chặn gửi trùng lặp.',
    },
    zh: {
        title: '提交已完成',
        description: '电子签名已成功保存。管理员可查看本次提交记录。',
        savedWorker: '提交人',
        savedLanguage: '提交语言',
        submittedAt: '提交时间',
        showManager: '请向管理员出示此页面。',
        safeClose: '确认后可关闭此页面。',
        duplicateBlocked: '系统会自动阻止重复提交。',
    },
};

const UI_TEXT: Record<UiLocale, {
    title: string;
    subtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    nationalityLabel: string;
    nationalityHint: string;
    autoLangLabel: string;
    audioGuideLabel: string;
    audioPlay: string;
    audioPause: string;
    audioPlaying: string;
    audioReady: string;
    audioMissing: string;
    guidanceLabel: string;
    comprehensionTitle: string;
    comprehensionDescription: string;
    progressLabel: string;
    progressPending: string;
    progressReady: string;
    checkRiskReview: string;
    checkPpeConfirm: string;
    checkEmergencyConfirm: string;
    submitBlockedAlert: string;
    understandingPledgeHint: string;
    signatureLabel: string;
    signatureClear: string;
    submit: string;
    submitting: string;
    missingNameAlert: string;
    missingSignatureAlert: string;
    submitSuccess: string;
    submitFail: string;
    mobileOnlyTitle: string;
    mobileOnlyDescription: string;
    loading: string;
    noSession: string;
    errorPrefix: string;
    permissionDenied: string;
    sessionFetchErrorLabel: string;
    linkInvalid: string;
    linkExpired: string;
    stayOnPageHint: string;
    alreadySubmitted: string;
}> = {
    ko: {
        title: '외국인 근로자 안전교육 확인',
        subtitle: '음성 안내를 듣고 전자서명을 제출해 주세요.',
        nameLabel: '이름',
        namePlaceholder: '이름 입력',
        nationalityLabel: '국적',
        nationalityHint: '국적을 선택하면 화면 언어가 자동으로 변경됩니다.',
        autoLangLabel: '자동 언어 선택',
        audioGuideLabel: '음성 안내',
        audioPlay: '재생',
        audioPause: '일시정지',
        audioPlaying: '재생 중',
        audioReady: '버튼을 눌러 음성을 재생하세요',
        audioMissing: '선택한 언어 음성 파일이 없어 텍스트 안내로 대체됩니다.',
        guidanceLabel: '안내 문구',
        comprehensionTitle: '위험성평가 이해 확인',
        comprehensionDescription: '안내 문구를 끝까지 읽고 아래 항목에 체크해야 제출할 수 있습니다.',
        progressLabel: '안내 문구 확인 진행도',
        progressPending: '아직 끝까지 확인하지 않았습니다.',
        progressReady: '안내 문구를 끝까지 확인했습니다.',
        checkRiskReview: '내 작업 공정의 주요 위험요인과 통제조치를 확인했습니다.',
        checkPpeConfirm: '작업 시작 전 보호구(PPE) 착용 기준을 이해했습니다.',
        checkEmergencyConfirm: '비상상황 발생 시 보고/대피 절차를 이해했습니다.',
        submitBlockedAlert: '위험성평가 이해 확인(끝까지 읽기 + 체크 항목)을 완료해 주세요.',
        understandingPledgeHint: '서명은 “위험성평가를 이해하고 준수하겠다”는 확약입니다.',
        signatureLabel: '전자서명',
        signatureClear: '서명 지우기',
        submit: '제출하기',
        submitting: '제출 중...',
        missingNameAlert: '이름을 입력해 주세요.',
        missingSignatureAlert: '전자서명을 먼저 입력해 주세요.',
        submitSuccess: '제출 완료! 교육 이수 서명이 저장되었습니다.',
        submitFail: '제출 실패',
        mobileOnlyTitle: '근로자 전용 모바일 페이지 안내',
        mobileOnlyDescription: '이 화면은 근로자 전용 모바일 서명 페이지입니다. 현장에 부착된 QR코드를 스마트폰으로 스캔하여 접속해 주세요.',
        loading: '불러오는 중...',
        noSession: '세션이 없습니다. 관리자에게 문의해 주세요.',
        errorPrefix: '오류',
        permissionDenied: '권한이 없거나 관리자 승인이 필요합니다',
        sessionFetchErrorLabel: '세션 조회 오류',
        linkInvalid: '유효하지 않은 접속 링크입니다. 관리자에게 올바른 링크를 요청해 주세요.',
        linkExpired: '링크 유효기간이 만료되었습니다. 관리자에게 재발급을 요청해 주세요.',
        stayOnPageHint: '제출 완료 전에는 뒤로가기/새로고침을 하지 마세요.',
        alreadySubmitted: '이미 제출이 완료되었습니다. 중복 제출은 차단됩니다.',
    },
    en: {
        title: 'Safety Training Confirmation',
        subtitle: 'Listen to the audio guidance and submit your signature.',
        nameLabel: 'Name',
        namePlaceholder: 'Enter your name',
        nationalityLabel: 'Nationality',
        nationalityHint: 'Choose nationality to switch UI language automatically.',
        autoLangLabel: 'Auto language',
        audioGuideLabel: 'Audio Guidance',
        audioPlay: 'Play',
        audioPause: 'Pause',
        audioPlaying: 'Playing',
        audioReady: 'Tap the button to play audio',
        audioMissing: 'No audio file for this language. Showing text guidance instead.',
        guidanceLabel: 'Guidance Text',
        comprehensionTitle: 'Comprehension Check',
        comprehensionDescription: 'You can submit only after reading the guidance to the end and checking all items.',
        progressLabel: 'Guidance review progress',
        progressPending: 'Please scroll to the end of the guidance text.',
        progressReady: 'Guidance text reviewed to the end.',
        checkRiskReview: 'I reviewed major hazards and control measures for my assigned process.',
        checkPpeConfirm: 'I understand required PPE before starting work.',
        checkEmergencyConfirm: 'I understand emergency reporting and evacuation procedures.',
        submitBlockedAlert: 'Please complete the comprehension checks (read to end + all check items).',
        understandingPledgeHint: 'This signature is a pledge that you understand and will follow the risk assessment.',
        signatureLabel: 'Signature',
        signatureClear: 'Clear Signature',
        submit: 'Submit',
        submitting: 'Submitting...',
        missingNameAlert: 'Please enter your name.',
        missingSignatureAlert: 'Please provide your signature first.',
        submitSuccess: 'Submitted! Your training signature is saved.',
        submitFail: 'Submit failed',
        mobileOnlyTitle: 'Worker Mobile-Only Page',
        mobileOnlyDescription: 'This page is for workers only. Please scan the on-site QR code with your smartphone to access it.',
        loading: 'Loading...',
        noSession: 'Session not found. Please contact your administrator.',
        errorPrefix: 'Error',
        permissionDenied: 'Access denied or administrator approval is required.',
        sessionFetchErrorLabel: 'Session fetch error',
        linkInvalid: 'Invalid access link. Please request the correct link from your administrator.',
        linkExpired: 'This link has expired. Please ask your administrator for a new link.',
        stayOnPageHint: 'Do not go back or refresh before submission is complete.',
        alreadySubmitted: 'Submission is already completed. Duplicate submission is blocked.',
    },
    vi: {
        title: 'Xác nhận đào tạo an toàn',
        subtitle: 'Vui lòng nghe hướng dẫn âm thanh và ký tên điện tử.',
        nameLabel: 'Họ tên',
        namePlaceholder: 'Nhập họ tên',
        nationalityLabel: 'Quốc tịch',
        nationalityHint: 'Chọn quốc tịch để tự động đổi ngôn ngữ giao diện.',
        autoLangLabel: 'Ngôn ngữ tự động',
        audioGuideLabel: 'Hướng dẫn âm thanh',
        audioPlay: 'Phát',
        audioPause: 'Tạm dừng',
        audioPlaying: 'Đang phát',
        audioReady: 'Nhấn nút để phát âm thanh',
        audioMissing: 'Không có tệp âm thanh cho ngôn ngữ này. Sẽ hiển thị hướng dẫn dạng văn bản.',
        guidanceLabel: 'Nội dung hướng dẫn',
        comprehensionTitle: 'Xác nhận đã hiểu',
        comprehensionDescription: 'Chỉ có thể gửi sau khi đọc hết nội dung hướng dẫn và chọn tất cả mục bên dưới.',
        progressLabel: 'Tiến độ đọc hướng dẫn',
        progressPending: 'Vui lòng cuộn xuống cuối nội dung hướng dẫn.',
        progressReady: 'Đã đọc đến cuối nội dung hướng dẫn.',
        checkRiskReview: 'Tôi đã xem các rủi ro chính và biện pháp kiểm soát cho công đoạn làm việc của mình.',
        checkPpeConfirm: 'Tôi hiểu yêu cầu trang bị bảo hộ (PPE) trước khi làm việc.',
        checkEmergencyConfirm: 'Tôi hiểu quy trình báo cáo và sơ tán khi khẩn cấp.',
        submitBlockedAlert: 'Vui lòng hoàn tất bước xác nhận hiểu nội dung (đọc đến cuối + đánh dấu các mục).',
        understandingPledgeHint: 'Chữ ký này là cam kết rằng bạn đã hiểu và sẽ tuân thủ đánh giá rủi ro.',
        signatureLabel: 'Chữ ký điện tử',
        signatureClear: 'Xóa chữ ký',
        submit: 'Gửi',
        submitting: 'Đang gửi...',
        missingNameAlert: 'Vui lòng nhập họ tên.',
        missingSignatureAlert: 'Vui lòng ký tên trước.',
        submitSuccess: 'Đã gửi! Chữ ký đào tạo đã được lưu.',
        submitFail: 'Gửi thất bại',
        mobileOnlyTitle: 'Trang di động dành cho công nhân',
        mobileOnlyDescription: 'Trang này chỉ dành cho công nhân. Vui lòng quét mã QR tại hiện trường bằng điện thoại để truy cập.',
        loading: 'Đang tải...',
        noSession: 'Không tìm thấy phiên. Vui lòng liên hệ quản trị viên.',
        errorPrefix: 'Lỗi',
        permissionDenied: 'Bạn không có quyền hoặc cần quản trị viên phê duyệt.',
        sessionFetchErrorLabel: 'Lỗi tải phiên',
        linkInvalid: 'Liên kết truy cập không hợp lệ. Vui lòng yêu cầu quản trị viên gửi đúng liên kết.',
        linkExpired: 'Liên kết đã hết hạn. Vui lòng yêu cầu quản trị viên cấp lại liên kết.',
        stayOnPageHint: 'Trước khi gửi xong, vui lòng không quay lại hoặc làm mới trang.',
        alreadySubmitted: 'Bạn đã gửi thành công trước đó. Hệ thống chặn gửi trùng lặp.',
    },
    zh: {
        title: '安全培训确认',
        subtitle: '请先收听语音指引后提交电子签名。',
        nameLabel: '姓名',
        namePlaceholder: '请输入姓名',
        nationalityLabel: '国籍',
        nationalityHint: '选择国籍后，界面语言会自动切换。',
        autoLangLabel: '自动语言',
        audioGuideLabel: '语音指引',
        audioPlay: '播放',
        audioPause: '暂停',
        audioPlaying: '播放中',
        audioReady: '点击按钮播放语音',
        audioMissing: '该语言没有音频文件，将显示文本指引。',
        guidanceLabel: '指引文本',
        comprehensionTitle: '理解确认',
        comprehensionDescription: '必须先将指引阅读到末尾并勾选全部项目后，才能提交。',
        progressLabel: '指引阅读进度',
        progressPending: '请滚动到指引文本底部。',
        progressReady: '已阅读到指引文本末尾。',
        checkRiskReview: '我已确认本工序的主要风险因素与控制措施。',
        checkPpeConfirm: '我已理解开工前个人防护装备(PPE)佩戴要求。',
        checkEmergencyConfirm: '我已理解紧急情况报告与疏散流程。',
        submitBlockedAlert: '请先完成理解确认（阅读至末尾 + 勾选项目）。',
        understandingPledgeHint: '该签名表示“我已理解并承诺遵守风险评估要求”。',
        signatureLabel: '电子签名',
        signatureClear: '清除签名',
        submit: '提交',
        submitting: '提交中...',
        missingNameAlert: '请输入姓名。',
        missingSignatureAlert: '请先完成签名。',
        submitSuccess: '提交完成！培训签名已保存。',
        submitFail: '提交失败',
        mobileOnlyTitle: '工人专用手机页面',
        mobileOnlyDescription: '此页面仅供工人使用。请使用手机扫描现场张贴的二维码进入。',
        loading: '加载中...',
        noSession: '未找到会话，请联系管理员。',
        errorPrefix: '错误',
        permissionDenied: '没有访问权限或需要管理员批准。',
        sessionFetchErrorLabel: '会话加载错误',
        linkInvalid: '访问链接无效，请向管理员索取正确链接。',
        linkExpired: '链接已过期，请联系管理员重新签发。',
        stayOnPageHint: '提交完成前请勿返回或刷新页面。',
        alreadySubmitted: '已提交完成，系统已阻止重复提交。',
    },
};

const LANGUAGE_LABELS: Record<string, string> = {
    'ko-KR': '한국어',
    'en-US': '영어',
    'vi-VN': '베트남어',
    'cmn-CN': '중국어',
    'th-TH': '태국어',
    'id-ID': '인도네시아어',
    'uz-UZ': '우즈베크어',
    'mn-MN': '몽골어',
    'km-KH': '크메르어',
    'ru-RU': '러시아어',
    'ne-NP': '네팔어',
    'my-MM': '미얀마어',
    'fil-PH': '필리핀어',
    'hi-IN': '힌디어',
    'bn-BD': '벵골어',
    'ur-PK': '우르두어',
    'si-LK': '싱할라어',
    'kk-KZ': '카자흐어',
};

const LANGUAGE_CODE_ALIASES: Record<string, string> = {
    'zh-CN': 'cmn-CN',
    'cmn-CN': 'zh-CN',
};

type NationalityOption = {
    value: string;
    langCode: string;
    labels: Record<UiLocale, string>;
};

const NATIONALITY_OPTIONS = [
    {
        value: '베트남',
        langCode: 'vi-VN',
        labels: { ko: '베트남', en: 'Vietnam', vi: 'Việt Nam', zh: '越南' },
    },
    {
        value: '중국',
        langCode: 'cmn-CN',
        labels: { ko: '중국', en: 'China', vi: 'Trung Quốc', zh: '中国' },
    },
    {
        value: '인도네시아',
        langCode: 'id-ID',
        labels: { ko: '인도네시아', en: 'Indonesia', vi: 'Indonesia', zh: '印度尼西亚' },
    },
    {
        value: '캄보디아',
        langCode: 'km-KH',
        labels: { ko: '캄보디아', en: 'Cambodia', vi: 'Campuchia', zh: '柬埔寨' },
    },
    {
        value: '몽골',
        langCode: 'mn-MN',
        labels: { ko: '몽골', en: 'Mongolia', vi: 'Mông Cổ', zh: '蒙古' },
    },
    {
        value: '러시아',
        langCode: 'ru-RU',
        labels: { ko: '러시아', en: 'Russia', vi: 'Nga', zh: '俄罗斯' },
    },
    {
        value: '우즈베키스탄',
        langCode: 'uz-UZ',
        labels: { ko: '우즈베키스탄', en: 'Uzbekistan', vi: 'Uzbekistan', zh: '乌兹别克斯坦' },
    },
    {
        value: '네팔',
        langCode: 'ne-NP',
        labels: { ko: '네팔', en: 'Nepal', vi: 'Nepal', zh: '尼泊尔' },
    },
    {
        value: '미얀마',
        langCode: 'my-MM',
        labels: { ko: '미얀마', en: 'Myanmar', vi: 'Myanmar', zh: '缅甸' },
    },
    {
        value: '필리핀',
        langCode: 'fil-PH',
        labels: { ko: '필리핀', en: 'Philippines', vi: 'Philippines', zh: '菲律宾' },
    },
    {
        value: '인도',
        langCode: 'hi-IN',
        labels: { ko: '인도', en: 'India', vi: 'Ấn Độ', zh: '印度' },
    },
    {
        value: '카자흐스탄',
        langCode: 'kk-KZ',
        labels: { ko: '카자흐스탄', en: 'Kazakhstan', vi: 'Kazakhstan', zh: '哈萨克斯坦' },
    },
    {
        value: '대한민국',
        langCode: 'ko-KR',
        labels: { ko: '대한민국', en: 'Korea', vi: 'Hàn Quốc', zh: '韩国' },
    },
] satisfies NationalityOption[];

const normalizeMapObject = (input: unknown): Record<string, string | null> => {
    if (!input) return {};
    if (typeof input === 'object' && !Array.isArray(input)) {
        const raw = input as Record<string, unknown>;
        return Object.entries(raw).reduce<Record<string, string | null>>((acc, [key, value]) => {
            if (typeof value === 'string') {
                const trimmed = value.trim();
                acc[key] = trimmed || null;
                return acc;
            }
            acc[key] = null;
            return acc;
        }, {});
    }

    if (typeof input === 'string') {
        try {
            const parsed = JSON.parse(input);
            return normalizeMapObject(parsed);
        } catch {
            return {};
        }
    }

    return {};
};

const resolveUiLocaleByLangCode = (code: string): UiLocale => {
    if (code === 'vi-VN') return 'vi';
    if (code === 'cmn-CN' || code === 'zh-CN') return 'zh';
    if (code === 'en-US') return 'en';
    return 'ko';
};

const resolveLanguageCandidates = (code: string): string[] => {
    const alias = LANGUAGE_CODE_ALIASES[code];
    return Array.from(new Set([
        code,
        alias,
        'vi-VN',
        'en-US',
        'ko-KR',
    ].filter((item): item is string => Boolean(item))));
};

const resolveLanguageCodeByNationality = (nationalityRaw: string): string => {
    const nationality = (nationalityRaw || '').toLowerCase().trim();

    if (!nationality) return 'en-US';
    if (nationality.includes('한국') || nationality.includes('대한민국') || nationality.includes('korea')) return 'ko-KR';
    if (nationality.includes('베트남') || nationality.includes('vietnam')) return 'vi-VN';
    if (nationality.includes('중국') || nationality.includes('china')) return 'cmn-CN';
    if (nationality.includes('태국') || nationality.includes('thailand')) return 'th-TH';
    if (nationality.includes('인도네시아') || nationality.includes('indonesia')) return 'id-ID';
    if (nationality.includes('우즈베키스탄') || nationality.includes('uzbek')) return 'uz-UZ';
    if (nationality.includes('몽골') || nationality.includes('mongolia')) return 'mn-MN';
    if (nationality.includes('캄보디아') || nationality.includes('cambodia') || nationality.includes('khmer')) return 'km-KH';
    if (nationality.includes('러시아') || nationality.includes('russia')) return 'ru-RU';
    if (nationality.includes('네팔') || nationality.includes('nepal')) return 'ne-NP';
    if (nationality.includes('미얀마') || nationality.includes('myanmar')) return 'my-MM';
    if (nationality.includes('필리핀') || nationality.includes('philippines') || nationality.includes('filipino')) return 'fil-PH';
    if (nationality.includes('인도') || nationality.includes('india') || nationality.includes('hindi')) return 'hi-IN';
    if (nationality.includes('방글라데시') || nationality.includes('bangladesh') || nationality.includes('bengali')) return 'bn-BD';
    if (nationality.includes('파키스탄') || nationality.includes('pakistan') || nationality.includes('urdu')) return 'ur-PK';
    if (nationality.includes('스리랑카') || nationality.includes('sri lanka') || nationality.includes('sinhala')) return 'si-LK';
    if (nationality.includes('카자흐스탄') || nationality.includes('kazakhstan') || nationality.includes('kazakh')) return 'kk-KZ';

    return 'en-US';
};

const resolveNationalityByLanguageCode = (langCode: string): string => {
    if (langCode === 'ko-KR') return '대한민국';
    if (langCode === 'vi-VN') return '베트남';
    if (langCode === 'cmn-CN' || langCode === 'zh-CN') return '중국';
    if (langCode === 'th-TH') return '태국';
    if (langCode === 'id-ID') return '인도네시아';
    if (langCode === 'uz-UZ') return '우즈베키스탄';
    if (langCode === 'mn-MN') return '몽골';
    if (langCode === 'km-KH') return '캄보디아';
    if (langCode === 'ru-RU') return '러시아';
    if (langCode === 'ne-NP') return '네팔';
    if (langCode === 'my-MM') return '미얀마';
    if (langCode === 'fil-PH') return '필리핀';
    if (langCode === 'hi-IN') return '인도';
    if (langCode === 'kk-KZ') return '카자흐스탄';
    return '기타';
};

const WorkerTraining: React.FC<WorkerTrainingProps> = ({ sessionId, simplifiedMode = false }) => {
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState<SessionRow | null>(null);

    const [workerName, setWorkerName] = useState('');
    const [nationality, setNationality] = useState('베트남');
    const [selectedLanguageCode, setSelectedLanguageCode] = useState('vi-VN');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submittedSnapshot, setSubmittedSnapshot] = useState<{ workerName: string; languageCode: string; submittedAt: number } | null>(null);
    const [hasSignature, setHasSignature] = useState(false);
    const [signatureWarning, setSignatureWarning] = useState(false);
    const [nameWarning, setNameWarning] = useState(false);
    const [comprehensionWarning, setComprehensionWarning] = useState(false);
    const [hasReviewedGuidance, setHasReviewedGuidance] = useState(false);
    const [guidanceProgress, setGuidanceProgress] = useState(0);
    const [checklist, setChecklist] = useState({
        riskReview: false,
        ppeConfirm: false,
        emergencyConfirm: false,
    });

    const sigRef = useRef<SignatureCanvas | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const guidanceRef = useRef<HTMLDivElement | null>(null);
    const nameInputRef = useRef<HTMLInputElement | null>(null);
    const languageSectionRef = useRef<HTMLDivElement | null>(null);
    const audioSectionRef = useRef<HTMLDivElement | null>(null);
    const comprehensionRef = useRef<HTMLDivElement | null>(null);
    const signatureWrapRef = useRef<HTMLDivElement | null>(null);
    const [signatureWidth, setSignatureWidth] = useState(700);

    const langKey = useMemo(() => resolveLanguageCodeByNationality(nationality), [nationality]);
    const uiLocale = useMemo(() => resolveUiLocaleByLangCode(langKey), [langKey]);
    const t = UI_TEXT[uiLocale];
    const ux = UX_TEXT[uiLocale];
    const statusText = STATUS_TEXT[uiLocale];
    const summaryText = SUMMARY_TEXT[uiLocale];
    const successText = SUCCESS_TEXT[uiLocale];
    const selectedNationalityLangCode = useMemo(() => {
        return NATIONALITY_OPTIONS.find((item) => item.value === nationality)?.langCode;
    }, [nationality]);

    const effectiveLangKey = selectedLanguageCode || selectedNationalityLangCode || langKey;
    const searchParams = useMemo(() => new URLSearchParams(window.location.search), []);
    const linkExpiresAtRaw = searchParams.get('exp');
    const linkToken = searchParams.get('sig') || '';
    const linkExpiresAt = Number(linkExpiresAtRaw || 0);
    const isLinkExpired = Number.isFinite(linkExpiresAt) ? Date.now() > linkExpiresAt : false;
    const isLinkMetaMissing = !linkToken || !Number.isFinite(linkExpiresAt) || linkExpiresAt <= 0;

    const normalizedAudioMap = useMemo(() => normalizeMapObject(sessionData?.audio_urls), [sessionData]);
    const normalizedTextMap = useMemo(() => normalizeMapObject(sessionData?.translated_texts), [sessionData]);

    const availableLanguageCodes = useMemo(() => {
        const fromAudio = Object.keys(normalizedAudioMap).filter((code) => {
            const value = normalizedAudioMap[code];
            return typeof value === 'string' && value.trim() && Boolean(LANGUAGE_LABELS[code]);
        });

        const fromText = Object.keys(normalizedTextMap).filter((code) => {
            const value = normalizedTextMap[code];
            return typeof value === 'string' && value.trim() && Boolean(LANGUAGE_LABELS[code]);
        });

        const merged = Array.from(new Set([...fromAudio, ...fromText]));
        if (merged.length > 0) return merged;
        return ['ko-KR', 'vi-VN', 'en-US', 'cmn-CN'];
    }, [normalizedAudioMap, normalizedTextMap]);

    const selectedAudioUrl = useMemo(() => {
        const candidates = resolveLanguageCandidates(effectiveLangKey);
        for (const code of candidates) {
            const value = normalizedAudioMap[code];
            if (typeof value === 'string' && value.trim()) return value;
        }

        const firstAvailable = Object.values(normalizedAudioMap).find((value) => typeof value === 'string' && value.trim());
        return (firstAvailable as string) || '';
    }, [normalizedAudioMap, effectiveLangKey]);

    const selectedTranslatedText = useMemo(() => {
        if (!sessionData) return '';
        const candidates = resolveLanguageCandidates(effectiveLangKey);
        for (const code of candidates) {
            const value = normalizedTextMap[code];
            if (typeof value === 'string' && value.trim()) return value;
        }
        return sessionData.source_text_ko || '';
    }, [sessionData, normalizedTextMap, effectiveLangKey]);

    const isChecklistComplete = checklist.riskReview && checklist.ppeConfirm && checklist.emergencyConfirm;
    const isComprehensionReady = hasReviewedGuidance && isChecklistComplete;
    const completedChecklistCount = Number(checklist.riskReview) + Number(checklist.ppeConfirm) + Number(checklist.emergencyConfirm);
    const submitReady = isComprehensionReady && hasSignature;
    const remainingSteps = [
        !workerName.trim() ? t.nameLabel : null,
        !hasReviewedGuidance ? statusText.reading : null,
        !isChecklistComplete ? `${statusText.checklist} ${completedChecklistCount}/3` : null,
        !hasSignature ? statusText.signature : null,
    ].filter((item): item is string => Boolean(item));
    const submittedAtLabel = useMemo(() => {
        if (!submittedSnapshot?.submittedAt) return '';
        return new Intl.DateTimeFormat(uiLocale, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        }).format(new Date(submittedSnapshot.submittedAt));
    }, [submittedSnapshot, uiLocale]);
    const audioMatchesSelectedLanguage = useMemo(() => {
        const current = normalizedAudioMap[effectiveLangKey];
        return typeof current === 'string' && current.trim().length > 0;
    }, [normalizedAudioMap, effectiveLangKey]);
    const textMatchesSelectedLanguage = useMemo(() => {
        const current = normalizedTextMap[effectiveLangKey];
        return typeof current === 'string' && current.trim().length > 0;
    }, [normalizedTextMap, effectiveLangKey]);

    useEffect(() => {
        const syncSignatureWidth = () => {
            const width = signatureWrapRef.current?.clientWidth || 700;
            setSignatureWidth(Math.max(280, Math.floor(width - 2)));
        };

        syncSignatureWidth();
        window.addEventListener('resize', syncSignatureWidth);
        return () => window.removeEventListener('resize', syncSignatureWidth);
    }, []);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
    }, [selectedAudioUrl]);

    useEffect(() => {
        setHasReviewedGuidance(false);
        setGuidanceProgress(0);
        setNameWarning(false);
        setComprehensionWarning(false);
        setSignatureWarning(false);
        setChecklist({
            riskReview: false,
            ppeConfirm: false,
            emergencyConfirm: false,
        });
    }, [effectiveLangKey, sessionId]);

    useEffect(() => {
        const node = guidanceRef.current;
        if (!node) return;

        const syncProgress = () => {
            const maxScrollable = node.scrollHeight - node.clientHeight;
            if (maxScrollable <= 0) {
                setGuidanceProgress(100);
                setHasReviewedGuidance(true);
                return;
            }

            const progress = Math.min(100, Math.round((node.scrollTop / maxScrollable) * 100));
            setGuidanceProgress(progress);
            setHasReviewedGuidance(node.scrollTop + node.clientHeight >= node.scrollHeight - 4);
        };

        const rafId = window.requestAnimationFrame(syncProgress);
        return () => window.cancelAnimationFrame(rafId);
    }, [selectedTranslatedText]);

    useEffect(() => {
        if (workerName.trim()) {
            setNameWarning(false);
        }
    }, [workerName]);

    useEffect(() => {
        if (isComprehensionReady) {
            setComprehensionWarning(false);
        }
    }, [isComprehensionReady]);

    useEffect(() => {
        if (!simplifiedMode) return;
        if (submitted) return;

        const handleBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [simplifiedMode, submitted]);

    useEffect(() => {
        if (!sessionData) return;

        const browserLang = (navigator.language || 'en-US').toLowerCase();
        const matched = availableLanguageCodes.find((code) => browserLang.startsWith(code.split('-')[0].toLowerCase()));
        const preferred = matched || availableLanguageCodes[0] || 'en-US';

        setSelectedLanguageCode(preferred);
        setNationality(resolveNationalityByLanguageCode(preferred));
    }, [sessionData, availableLanguageCodes]);

    useEffect(() => {
        const run = async () => {
            if (!sessionId) {
                setLoading(false);
                setSessionData(null);
                return;
            }

            setLoading(true);
            const { data, error } = await supabase
                .from('training_sessions')
                .select('id, source_text_ko, audio_urls, translated_texts')
                .eq('id', sessionId)
                .single();

            if (error) {
                if (isSupabasePermissionError(error)) {
                    setMessage(t.permissionDenied);
                } else {
                    setMessage(`${t.sessionFetchErrorLabel}: ${error.message}`);
                }
                setSessionData(null);
            } else {
                setSessionData(data as SessionRow);
            }
            setLoading(false);
        };

        void run();
    }, [sessionId]);

    if (!sessionId) {
        return (
            <div className="bg-white p-6 sm:p-8 rounded-2xl border border-slate-200 shadow-sm max-w-2xl">
                <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mb-4">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h-1M5 12H4m12.364 5.364l-.707-.707M8.343 8.343l-.707-.707m0 8.728l.707-.707m8.021-8.021l.707-.707" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-slate-900">{t.mobileOnlyTitle}</h2>
                <p className="mt-2 text-sm font-bold text-slate-600">
                    {t.mobileOnlyDescription}
                </p>
            </div>
        );
    }

    const handleClear = () => {
        sigRef.current?.clear();
        setHasSignature(false);
        setSignatureWarning(false);
    };

    const handleToggleAudio = async () => {
        const audio = audioRef.current;
        if (!audio || !selectedAudioUrl) {
            setMessage(t.audioMissing);
            return;
        }

        try {
            if (audio.paused) {
                await audio.play();
                setIsPlaying(true);
            } else {
                audio.pause();
                setIsPlaying(false);
            }
        } catch {
            setMessage(t.audioMissing);
            setIsPlaying(false);
        }
    };

    const handleSubmit = async () => {
        if (submitted) {
            setMessage(t.alreadySubmitted);
            return;
        }

        if (isLinkMetaMissing) {
            setMessage(t.linkInvalid);
            return;
        }

        if (isLinkExpired) {
            setMessage(t.linkExpired);
            return;
        }

        if (!workerName.trim()) {
            setNameWarning(true);
            nameInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert(t.missingNameAlert);
            return;
        }

        setNameWarning(false);

        if (!isComprehensionReady) {
            setComprehensionWarning(true);
            comprehensionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert(t.submitBlockedAlert);
            return;
        }

        setComprehensionWarning(false);

        if (!sigRef.current || sigRef.current.isEmpty()) {
            setSignatureWarning(true);
            signatureWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            alert(t.missingSignatureAlert);
            return;
        }

        if (!confirm(ux.submitConfirm)) {
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
                    reviewedGuidance: hasReviewedGuidance,
                    checklist,
                    selectedAudioUrl: selectedAudioUrl || null,
                    signatureDataUrl,
                    linkExpiresAt,
                    linkToken,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.message || t.submitFail);
            }

            audioRef.current?.pause();
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
            }
            setIsPlaying(false);
            setSubmittedSnapshot({
                workerName: workerName.trim(),
                languageCode: effectiveLangKey,
                submittedAt: Date.now(),
            });
            setMessage(t.submitSuccess);
            setWorkerName('');
            sigRef.current?.clear();
            setHasSignature(false);
            setSignatureWarning(false);
            setSubmitted(true);
        } catch (error: any) {
            setMessage(`${t.errorPrefix}: ${error?.message || t.submitFail}`);
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return <div className="bg-white p-6 rounded-2xl border border-slate-200 font-bold">{t.loading}</div>;
    }

    if (!sessionData) {
        return <div className="bg-white p-6 rounded-2xl border border-rose-200 text-rose-700 font-bold">{t.noSession}</div>;
    }

    if (isLinkMetaMissing) {
        return <div className="bg-white p-6 rounded-2xl border border-rose-200 text-rose-700 font-bold">{t.linkInvalid}</div>;
    }

    if (isLinkExpired) {
        return <div className="bg-white p-6 rounded-2xl border border-rose-200 text-rose-700 font-bold">{t.linkExpired}</div>;
    }

    const nextActionLabel = !hasReviewedGuidance
        ? ux.stepListenDesc
        : !isChecklistComplete
            ? t.comprehensionDescription
            : !hasSignature
                ? ux.signatureGuide
                : ux.submitBarReady;

    const nextActionButtonLabel = !hasReviewedGuidance
        ? ux.listenNow
        : !isChecklistComplete
            ? t.comprehensionTitle
            : !hasSignature
                ? ux.signNow
                : t.submit;

    const scrollToSection = (section: 'language' | 'audio' | 'signature') => {
        if (section === 'language') {
            languageSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (section === 'audio') {
            audioSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        signatureWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    const handleNextAction = () => {
        if (!hasReviewedGuidance) {
            void handleToggleAudio();
            scrollToSection('audio');
            return;
        }

        if (!isChecklistComplete) {
            setComprehensionWarning(true);
            comprehensionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }

        if (!hasSignature) {
            signatureWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setSignatureWarning(true);
            return;
        }

        void handleSubmit();
    };

    if (submitted) {
        return (
            <div className="space-y-6 max-w-2xl pb-10">
                <div className="bg-white p-6 rounded-2xl border border-emerald-200 shadow-sm">
                    <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-sm">
                        <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>

                    <div className="mt-4 text-center">
                        <h2 className="text-2xl font-black text-slate-900">{successText.title}</h2>
                        <p className="mt-2 text-sm font-bold text-slate-600">{successText.description}</p>
                    </div>

                    <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-black text-slate-500">{successText.savedWorker}</p>
                            <p className="mt-1 text-base font-black text-slate-900">{submittedSnapshot?.workerName || summaryText.notEntered}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <p className="text-[11px] font-black text-slate-500">{successText.savedLanguage}</p>
                            <p className="mt-1 text-base font-black text-slate-900">{LANGUAGE_FLAG_EMOJI[submittedSnapshot?.languageCode || effectiveLangKey] || '🌐'} {LANGUAGE_LABELS[submittedSnapshot?.languageCode || effectiveLangKey] || submittedSnapshot?.languageCode || effectiveLangKey}</p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <p className="text-[11px] font-black text-slate-500">{successText.submittedAt}</p>
                        <p className="mt-1 text-base font-black text-slate-900">{submittedAtLabel || '-'}</p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                        <p className="text-sm font-black text-emerald-700">{t.submitSuccess}</p>
                        <p className="mt-1 text-[12px] font-black text-emerald-600">{successText.duplicateBlocked}</p>
                    </div>

                    <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-4 text-center">
                        <p className="text-sm font-black text-indigo-700">{successText.showManager}</p>
                        <p className="mt-1 text-[12px] font-black text-indigo-600">{successText.safeClose}</p>
                    </div>

                    {message && <p className="mt-4 text-center text-sm font-bold text-slate-700">{message}</p>}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl pb-32">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">{t.title}</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">{t.subtitle}</p>
                {simplifiedMode && !submitted && (
                    <p className="mt-2 text-[11px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 inline-block">
                        {t.stayOnPageHint}
                    </p>
                )}

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                        type="button"
                        onClick={() => scrollToSection('language')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${effectiveLangKey ? 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-black text-indigo-700">{ux.stepLanguage}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-600">{ux.stepLanguageDesc}</p>
                            </div>
                            <span className="text-[10px] font-black text-indigo-600">{effectiveLangKey ? statusText.done : statusText.required}</span>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollToSection('audio')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${selectedAudioUrl ? 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100' : 'border-amber-200 bg-amber-50 hover:bg-amber-100'}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-black text-emerald-700">{ux.stepListen}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-600">{ux.stepListenDesc}</p>
                            </div>
                            <span className={`text-[10px] font-black ${hasReviewedGuidance ? 'text-emerald-600' : 'text-amber-600'}`}>{hasReviewedGuidance ? statusText.done : statusText.required}</span>
                        </div>
                    </button>
                    <button
                        type="button"
                        onClick={() => scrollToSection('signature')}
                        className={`rounded-2xl border px-4 py-3 text-left transition-all ${submitReady ? 'border-violet-200 bg-violet-50 hover:bg-violet-100' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div>
                                <p className="text-xs font-black text-violet-700">{ux.stepSign}</p>
                                <p className="mt-1 text-[11px] font-bold text-slate-600">{ux.stepSignDesc}</p>
                            </div>
                            <span className={`text-[10px] font-black ${submitReady ? 'text-violet-600' : 'text-slate-500'}`}>{submitReady ? statusText.done : statusText.required}</span>
                        </div>
                    </button>
                </div>

                <div className={`mt-4 rounded-2xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${submitReady ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div>
                        <p className={`text-[11px] font-black uppercase tracking-wider ${submitReady ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {submitReady ? ux.submitReadyCta : ux.submitBlockedCta}
                        </p>
                        <p className="mt-1 text-sm font-black text-slate-800">{nextActionLabel}</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleNextAction}
                        className={`w-full sm:w-auto shrink-0 rounded-xl px-4 py-3.5 text-sm font-black shadow-sm transition-colors ${submitReady ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-amber-500 text-white hover:bg-amber-600'}`}
                    >
                        {nextActionButtonLabel}
                    </button>
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.nameLabel}</label>
                    <input
                        ref={nameInputRef}
                        value={workerName}
                        onChange={(e) => {
                            setWorkerName(e.target.value);
                            if (e.target.value.trim()) {
                                setNameWarning(false);
                            }
                        }}
                        className={`w-full p-4 rounded-2xl bg-slate-50 font-bold text-base transition-all ${nameWarning ? 'border-rose-300 ring-4 ring-rose-100' : 'border-slate-200'} border`}
                        placeholder={t.namePlaceholder}
                    />
                    {nameWarning && (
                        <p className="mt-2 text-[11px] font-black text-rose-600">{t.missingNameAlert}</p>
                    )}
                </div>

                <div ref={languageSectionRef} className="mt-4 scroll-mt-28">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.nationalityLabel}</label>
                    {simplifiedMode ? (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {availableLanguageCodes.map((code) => (
                                <button
                                    key={code}
                                    type="button"
                                    onClick={() => {
                                        setSelectedLanguageCode(code);
                                        setNationality(resolveNationalityByLanguageCode(code));
                                    }}
                                    className={`relative min-h-[92px] px-3 py-3 rounded-2xl text-left border transition-all shadow-sm ${effectiveLangKey === code ? 'bg-indigo-600 text-white border-indigo-600 scale-[1.02] ring-4 ring-indigo-100' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'}`}
                                >
                                    {effectiveLangKey === code && (
                                        <span className="absolute right-2 top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-black text-white">
                                            ✓
                                        </span>
                                    )}
                                    <span className="block text-lg leading-none">{LANGUAGE_FLAG_EMOJI[code] || '🌐'}</span>
                                    <span className="block text-sm font-black">{LANGUAGE_LABELS[code] || code}</span>
                                    <span className={`mt-1 block text-[10px] font-black ${effectiveLangKey === code ? 'text-indigo-100' : 'text-slate-400'}`}>{code}</span>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <select
                            value={nationality}
                            onChange={(e) => {
                                const nextNationality = e.target.value;
                                setNationality(nextNationality);
                                setSelectedLanguageCode(resolveLanguageCodeByNationality(nextNationality));
                            }}
                            className="w-full p-4 rounded-2xl border border-slate-200 bg-slate-50 font-bold text-base"
                        >
                            {NATIONALITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.labels[uiLocale]}</option>
                            ))}
                        </select>
                    )}
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        {t.autoLangLabel}: <span className="text-slate-700">{LANGUAGE_LABELS[effectiveLangKey] || 'English'} ({effectiveLangKey})</span>
                    </p>
                    {!simplifiedMode && <p className="mt-1 text-[11px] font-bold text-slate-500">{t.nationalityHint}</p>}

                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">{ux.languageStatus}</p>
                            <span className="text-[10px] font-black text-slate-500">{LANGUAGE_LABELS[effectiveLangKey] || effectiveLangKey}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-bold">
                            <div className={`rounded-xl px-3 py-2 ${audioMatchesSelectedLanguage ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {audioMatchesSelectedLanguage ? ux.audioMatched : ux.audioFallback}
                            </div>
                            <div className={`rounded-xl px-3 py-2 ${textMatchesSelectedLanguage ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                                {textMatchesSelectedLanguage ? ux.textMatched : ux.textFallback}
                            </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <span className="text-[11px] font-bold text-slate-500">{ux.availableLanguages}:</span>
                            {availableLanguageCodes.map((code) => (
                                <span key={code} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-600">
                                    <span>{LANGUAGE_FLAG_EMOJI[code] || '🌐'}</span>
                                    <span>{LANGUAGE_LABELS[code] || code}</span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div ref={audioSectionRef} className="mt-4 scroll-mt-28">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.audioGuideLabel}</label>
                    <div className="mt-2 flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => void handleToggleAudio()}
                            disabled={!selectedAudioUrl}
                            className={`relative w-40 h-40 sm:w-36 sm:h-36 rounded-full border-4 font-black text-5xl flex items-center justify-center transition-all ${isPlaying ? 'bg-indigo-600 border-indigo-700 text-white animate-pulse scale-105 shadow-2xl' : 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg'} ${!selectedAudioUrl ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'}`}
                        >
                            {isPlaying ? '⏸' : '🔊'}
                            {isPlaying && <span className="absolute inset-0 rounded-full border-4 border-indigo-300 animate-ping" />}
                        </button>
                        <p className="mt-3 text-sm font-black text-slate-700">
                            {selectedAudioUrl ? (isPlaying ? t.audioPlaying : t.audioReady) : t.audioMissing}
                        </p>
                        <div className="mt-3 flex w-full flex-col sm:flex-row justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => void handleToggleAudio()}
                                disabled={!selectedAudioUrl}
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-indigo-600 text-white text-sm font-black hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {ux.listenNow}
                            </button>
                            <button
                                type="button"
                                onClick={() => signatureWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-700 text-sm font-black hover:bg-slate-50"
                            >
                                {ux.signNow}
                            </button>
                        </div>
                        {!simplifiedMode && (
                            <button
                                type="button"
                                onClick={() => void handleToggleAudio()}
                                disabled={!selectedAudioUrl}
                                className="mt-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {isPlaying ? t.audioPause : t.audioPlay}
                            </button>
                        )}
                    </div>
                    <audio
                        ref={audioRef}
                        src={selectedAudioUrl || undefined}
                        preload="none"
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        onEnded={() => setIsPlaying(false)}
                    />
                    <div className="mt-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                        <p className="text-[11px] font-black text-slate-500 mb-1">{t.guidanceLabel}</p>
                        <div
                            ref={guidanceRef}
                            onScroll={() => {
                                const node = guidanceRef.current;
                                if (!node) return;
                                const maxScrollable = node.scrollHeight - node.clientHeight;
                                if (maxScrollable <= 0) {
                                    setGuidanceProgress(100);
                                    setHasReviewedGuidance(true);
                                    return;
                                }

                                const progress = Math.min(100, Math.round((node.scrollTop / maxScrollable) * 100));
                                setGuidanceProgress(progress);
                                setHasReviewedGuidance(node.scrollTop + node.clientHeight >= node.scrollHeight - 4);
                            }}
                            className="max-h-52 overflow-y-auto pr-1 scroll-smooth"
                        >
                            <p className="text-[15px] leading-7 font-bold text-slate-700 whitespace-pre-wrap">{selectedTranslatedText}</p>
                        </div>
                    </div>
                </div>

                <div ref={comprehensionRef} className={`mt-4 p-4 rounded-xl border scroll-mt-28 transition-all ${comprehensionWarning ? 'border-rose-300 bg-rose-50 ring-4 ring-rose-100' : 'border-indigo-200 bg-indigo-50/50'}`}>
                    <p className="text-sm font-black text-indigo-900">{t.comprehensionTitle}</p>
                    <p className="text-[11px] font-bold text-indigo-700 mt-1">{t.comprehensionDescription}</p>
                    <p className="mt-3 text-[11px] font-black text-slate-600">
                        {t.progressLabel}: <span className="text-slate-800">{guidanceProgress}%</span>
                    </p>
                    <div className="mt-2 h-2 rounded-full bg-white/80 overflow-hidden border border-white/60">
                        <div className={`h-full rounded-full transition-all ${hasReviewedGuidance ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${guidanceProgress}%` }} />
                    </div>
                    <p className={`mt-1 text-[11px] font-black ${hasReviewedGuidance ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {hasReviewedGuidance ? t.progressReady : t.progressPending}
                    </p>
                    {comprehensionWarning && (
                        <p className="mt-2 text-[11px] font-black text-rose-600">{t.submitBlockedAlert}</p>
                    )}

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-black">
                        <div className={`rounded-xl px-2 py-2 border ${hasReviewedGuidance ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            {statusText.reading} {hasReviewedGuidance ? statusText.done : statusText.required}
                        </div>
                        <div className={`rounded-xl px-2 py-2 border ${isChecklistComplete ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            {statusText.checklist} {completedChecklistCount}/3
                        </div>
                        <div className={`rounded-xl px-2 py-2 border ${hasSignature ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                            {statusText.signature} {hasSignature ? statusText.done : statusText.required}
                        </div>
                    </div>

                    <div className="mt-3 space-y-2">
                        <label className="flex items-start gap-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-sm font-bold text-slate-700 shadow-sm">
                            <input
                                type="checkbox"
                                checked={checklist.riskReview}
                                onChange={(event) => {
                                    setChecklist((prev) => ({ ...prev, riskReview: event.target.checked }));
                                    setComprehensionWarning(false);
                                }}
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>{t.checkRiskReview}</span>
                        </label>
                        <label className="flex items-start gap-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-sm font-bold text-slate-700 shadow-sm">
                            <input
                                type="checkbox"
                                checked={checklist.ppeConfirm}
                                onChange={(event) => {
                                    setChecklist((prev) => ({ ...prev, ppeConfirm: event.target.checked }));
                                    setComprehensionWarning(false);
                                }}
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>{t.checkPpeConfirm}</span>
                        </label>
                        <label className="flex items-start gap-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-3 text-sm font-bold text-slate-700 shadow-sm">
                            <input
                                type="checkbox"
                                checked={checklist.emergencyConfirm}
                                onChange={(event) => {
                                    setChecklist((prev) => ({ ...prev, emergencyConfirm: event.target.checked }));
                                    setComprehensionWarning(false);
                                }}
                                className="mt-0.5 h-5 w-5 shrink-0"
                            />
                            <span>{t.checkEmergencyConfirm}</span>
                        </label>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.signatureLabel}</label>
                    <p className="mb-2 text-[11px] font-bold text-slate-600">{t.understandingPledgeHint}</p>
                    <div className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-black ${hasSignature ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${hasSignature ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                        {hasSignature ? ux.signatureDone : ux.signaturePending}
                    </div>
                    <div className="mb-2 rounded-xl bg-violet-50 border border-violet-200 px-3 py-2">
                        <p className="text-[12px] font-black text-violet-700">{ux.signatureGuide}</p>
                        <p className="mt-1 text-[11px] font-bold text-violet-600">{ux.signatureGuideSub}</p>
                    </div>
                    <div ref={signatureWrapRef} className={`border rounded-2xl overflow-hidden bg-gradient-to-b from-white to-slate-50 p-3 transition-all scroll-mt-28 ${signatureWarning ? 'border-rose-300 ring-4 ring-rose-100 animate-pulse' : 'border-slate-200'}`}>
                        <div className="relative rounded-xl border-2 border-dashed border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                            <div className="pointer-events-none absolute inset-x-6 top-1/2 border-t-2 border-dashed border-slate-200" />
                            <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-white/90 text-[10px] font-black text-slate-400 border border-slate-100">
                                SIGN HERE
                            </div>
                            <SignatureCanvas
                                ref={(ref) => {
                                    sigRef.current = ref;
                                }}
                                penColor="black"
                                onEnd={() => {
                                    setHasSignature(true);
                                    setSignatureWarning(false);
                                }}
                                canvasProps={{
                                    width: signatureWidth,
                                    height: 220,
                                    className: 'block w-full h-[220px] mx-auto'
                                }}
                            />
                        </div>
                    </div>
                    {signatureWarning && (
                        <p className="mt-2 text-[11px] font-black text-rose-600">
                            {t.missingSignatureAlert}
                        </p>
                    )}
                    <button
                        onClick={handleClear}
                        className="mt-2 w-full sm:w-auto px-4 py-3 text-sm font-black rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                        {t.signatureClear}
                    </button>
                </div>

                <div className={`mt-4 rounded-2xl border px-4 py-4 ${submitReady ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-slate-900">{summaryText.title}</p>
                        <span className={`rounded-full px-3 py-1 text-[11px] font-black ${submitReady ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                            {submitReady ? ux.submitReadyCta : ux.submitBlockedCta}
                        </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm font-bold text-slate-700">
                        <div className="rounded-xl bg-white px-3 py-3 border border-slate-200">
                            <p className="text-[11px] font-black text-slate-500">{summaryText.worker}</p>
                            <p className="mt-1 text-slate-900">{workerName.trim() || summaryText.notEntered}</p>
                        </div>
                        <div className="rounded-xl bg-white px-3 py-3 border border-slate-200">
                            <p className="text-[11px] font-black text-slate-500">{summaryText.language}</p>
                            <p className="mt-1 text-slate-900">{LANGUAGE_FLAG_EMOJI[effectiveLangKey] || '🌐'} {LANGUAGE_LABELS[effectiveLangKey] || effectiveLangKey}</p>
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl bg-white px-3 py-3 border border-slate-200">
                        <p className="text-[11px] font-black text-slate-500">{summaryText.missing}</p>
                        {remainingSteps.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {remainingSteps.map((item) => (
                                    <span key={item} className="rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-700">
                                        {item}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <p className="mt-2 text-[12px] font-black text-emerald-700">{summaryText.ready}</p>
                        )}
                    </div>
                </div>

                {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur-md shadow-[0_-8px_30px_rgba(15,23,42,0.12)]">
                <div className="max-w-2xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <div>
                            <p className="text-[11px] font-black text-slate-500 uppercase tracking-wider">{ux.submitBarTitle}</p>
                            <p className={`mt-1 text-[12px] font-black ${submitReady ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {submitReady ? ux.submitBarReady : ux.submitBarBlocked}
                            </p>
                        </div>
                        <div className="text-right text-[11px] font-black text-slate-500 shrink-0">
                            <p>{guidanceProgress}%</p>
                            <p>{ux.checklistStatus} {completedChecklistCount}/3</p>
                        </div>
                    </div>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || submitted}
                        className={`w-full py-4 rounded-2xl text-white font-black text-lg shadow-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all ${submitReady ? 'bg-indigo-600 hover:bg-indigo-700 animate-pulse' : 'bg-amber-500 hover:bg-amber-600'}`}
                    >
                        {submitted ? t.alreadySubmitted : (submitting ? t.submitting : `${t.submit} · ${submitReady ? ux.submitReadyCta : ux.submitBlockedCta}`)}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default WorkerTraining;
