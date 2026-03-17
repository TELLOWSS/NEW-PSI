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

type UiLocale = 'ko' | 'en' | 'vi' | 'zh';

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

const resolveUiLocaleFromLanguageCode = (code: string): UiLocale => {
    if (code.startsWith('ko')) return 'ko';
    if (code.startsWith('vi')) return 'vi';
    if (code.startsWith('cmn') || code.startsWith('zh')) return 'zh';
    return 'en';
};

const resolveLanguageCandidates = (languageCode: string): string[] => {
    const normalized = String(languageCode || '').trim();
    if (!normalized) return ['en-US'];

    const base = normalized.split('-')[0];
    const candidates = [normalized, `${base.toLowerCase()}-${normalized.split('-')[1] || ''}`, base, 'en-US']
        .filter(Boolean);
    return Array.from(new Set(candidates));
};

const resolveNationalityByLanguageCode = (code: string): string => {
    if (code.startsWith('ko')) return '대한민국';
    if (code.startsWith('vi')) return '베트남';
    if (code.startsWith('cmn') || code.startsWith('zh')) return '중국';
    if (code.startsWith('th')) return '태국';
    if (code.startsWith('id')) return '인도네시아';
    if (code.startsWith('uz')) return '우즈베키스탄';
    if (code.startsWith('mn')) return '몽골';
    if (code.startsWith('km')) return '캄보디아';
    if (code.startsWith('ru')) return '러시아';
    if (code.startsWith('kk')) return '카자흐스탄';
    if (code.startsWith('ne')) return '네팔';
    if (code.startsWith('my')) return '미얀마';
    if (code.startsWith('fil')) return '필리핀';
    if (code.startsWith('hi')) return '인도';
    if (code.startsWith('bn')) return '방글라데시';
    if (code.startsWith('ur')) return '파키스탄';
    if (code.startsWith('si')) return '스리랑카';
    return '기타';
};

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
    const t = UI_TEXT[resolveUiLocaleFromLanguageCode(effectiveLangKey)];
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

    const selectedAudioUrl = useMemo(() => normalizedAudioMap[effectiveLangKey] || '', [normalizedAudioMap, effectiveLangKey]);

    const selectedTranslatedText = useMemo(() => {
        if (!sessionData) return '';
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
                setMessage('sessionId가 없습니다. QR URL을 다시 확인해 주세요.');
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
                    setMessage(`세션 조회 오류: ${error.message}`);
                } else {
                    setMessage('권한이 없거나 관리자 승인이 필요합니다');
                }
                setSessionData(null);
            } else {
                setSessionData(data as SessionRow);
            }
            setLoading(false);
        };

        void run();
    }, [sessionId]);

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
            alert(t.missingNameAlert);
            return;
        }

        if (!hasEngagementProof) {
            alert('오디오를 1회 재생하거나 대본을 끝까지 스크롤한 후에만 서명할 수 있습니다.');
            return;
        }

        if (!hasAcknowledged) {
            alert('위험성평가 내용을 숙지했습니다 체크를 먼저 진행해 주세요.');
            return;
        }

        if (!sigRef.current || sigRef.current.isEmpty()) {
            alert(t.missingSignatureAlert);
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

            setMessage(t.submitSuccess);
            setSubmitted(true);
            setWorkerName('');
            sigRef.current?.clear();
        } catch (error: any) {
            setMessage(`${t.errorPrefix}: ${error?.message || '알 수 없는 오류'}`);
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

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">{t.title}</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">{t.subtitle}</p>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.nameLabel}</label>
                    <input
                        value={workerName}
                        onChange={(e) => setWorkerName(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                        placeholder={t.namePlaceholder}
                    />
                </div>

                <div className="mt-5">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <label className="block text-xs font-black text-slate-500">11개국 언어 선택</label>
                        <span className="text-[11px] font-bold text-slate-500">선택 국적: {nationality}</span>
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
                            <p className="text-xs font-black text-slate-500">선택 언어 오디오</p>
                            <p className="text-sm font-black text-slate-900">{TRAINING_AUDIO_LANGUAGES.find((item) => item.code === effectiveLangKey)?.flag} {effectiveLangKey}</p>
                        </div>
                        <span className={`text-[11px] font-black ${selectedAudioUrl ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {selectedAudioUrl ? 'MP3 연결됨' : 'MP3 미업로드'}
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
                            ? (isPlaying ? '오디오 재생 기록이 확인되었습니다.' : '재생 버튼을 누르면 체크박스/서명이 활성화됩니다.')
                            : '관리자가 해당 언어 MP3를 올리지 않아 오디오 플레이어를 숨겼습니다. 아래 대본을 끝까지 읽으면 서명이 활성화됩니다.'}
                    </p>
                </div>

                <div className="mt-4 p-4 rounded-2xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between gap-3 mb-2">
                        <p className="text-xs font-black text-slate-500">번역 대본</p>
                        <span className={`text-[11px] font-black ${hasScrolledToEnd ? 'text-emerald-700' : 'text-amber-700'}`}>스크롤 {guidanceProgress}%</span>
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
                        {hasScrolledToEnd ? '대본 끝까지 읽기 기록이 저장되었습니다.' : '대본을 끝까지 스크롤하면 체크박스/서명이 활성화됩니다.'}
                    </p>
                </div>

                <div className={`mt-4 rounded-2xl border p-4 ${hasEngagementProof ? 'border-emerald-200 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
                    <p className="text-sm font-black text-slate-900">전자 서명 방어 로직</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-600">
                        오디오 1회 재생 또는 번역 대본 끝까지 읽기 중 하나가 확인되어야 체크박스와 전자서명이 활성화됩니다.
                    </p>

                    <label className={`mt-4 flex items-start gap-3 rounded-xl border px-3 py-3 ${hasEngagementProof ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-100 opacity-60'}`}>
                        <input
                            type="checkbox"
                            disabled={!hasEngagementProof}
                            checked={hasAcknowledged}
                            onChange={(e) => setHasAcknowledged(e.target.checked)}
                            className="mt-1"
                        />
                        <span className="text-sm font-black text-slate-800">위험성평가 내용을 숙지했습니다</span>
                    </label>

                    <div className="mt-4">
                        <label className="block text-xs font-black text-slate-500 mb-2">{t.signatureLabel}</label>
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
                                    오디오 재생 또는 끝까지 읽기 완료 후 체크박스를 선택하면 전자서명 캔버스가 활성화됩니다.
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleClear}
                            disabled={!canUseSignature}
                            className="mt-2 px-4 py-2 text-xs font-black rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {t.signatureClear}
                        </button>
                    </div>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={submitting || submitted || !canUseSignature}
                    className="mt-6 w-full py-3 rounded-xl bg-indigo-600 text-white font-black hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {submitting ? t.submitting : t.submit}
                </button>

                {message && <p className="mt-3 text-sm font-bold text-slate-700">{message}</p>}
            </div>
        </div>
    );
};

export default WorkerTraining;
