import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { isSupabasePermissionError, supabase } from '../lib/supabaseClient';

interface WorkerTrainingProps {
    sessionId: string;
}

type SessionRow = {
    id: string;
    source_text_ko: string;
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

const WorkerTraining: React.FC<WorkerTrainingProps> = ({ sessionId }) => {
    const [loading, setLoading] = useState(true);
    const [sessionData, setSessionData] = useState<SessionRow | null>(null);

    const [workerName, setWorkerName] = useState('');
    const [nationality, setNationality] = useState('베트남');
    const [message, setMessage] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const sigRef = useRef<SignatureCanvas | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    const langKey = useMemo(() => resolveLanguageCodeByNationality(nationality), [nationality]);
    const uiLocale = useMemo(() => resolveUiLocaleByLangCode(langKey), [langKey]);
    const t = UI_TEXT[uiLocale];
    const selectedNationalityLangCode = useMemo(() => {
        return NATIONALITY_OPTIONS.find((item) => item.value === nationality)?.langCode;
    }, [nationality]);

    const effectiveLangKey = selectedNationalityLangCode || langKey;

    const normalizedAudioMap = useMemo(() => normalizeMapObject(sessionData?.audio_urls), [sessionData]);
    const normalizedTextMap = useMemo(() => normalizeMapObject(sessionData?.translated_texts), [sessionData]);

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

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
    }, [selectedAudioUrl]);

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
        if (!workerName.trim()) {
            alert(t.missingNameAlert);
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
                    selectedAudioUrl: selectedAudioUrl || null,
                    signatureDataUrl,
                }),
            });

            const data = await response.json();
            if (!response.ok || !data.ok) {
                throw new Error(data.message || t.submitFail);
            }

            setMessage(t.submitSuccess);
            setWorkerName('');
            sigRef.current?.clear();
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

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.nationalityLabel}</label>
                    <select
                        value={nationality}
                        onChange={(e) => setNationality(e.target.value)}
                        className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold"
                    >
                        {NATIONALITY_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.labels[uiLocale]}</option>
                        ))}
                    </select>
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        {t.autoLangLabel}: <span className="text-slate-700">{LANGUAGE_LABELS[effectiveLangKey] || 'English'} ({effectiveLangKey})</span>
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">{t.nationalityHint}</p>
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.audioGuideLabel}</label>
                    <div className="mt-2 flex flex-col items-center">
                        <button
                            type="button"
                            onClick={() => void handleToggleAudio()}
                            disabled={!selectedAudioUrl}
                            className={`relative w-36 h-36 rounded-full border-4 font-black text-5xl flex items-center justify-center transition-all ${isPlaying ? 'bg-indigo-600 border-indigo-700 text-white animate-pulse scale-105 shadow-2xl' : 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg'} ${!selectedAudioUrl ? 'opacity-60 cursor-not-allowed' : 'hover:scale-105'}`}
                        >
                            {isPlaying ? '⏸' : '🔊'}
                            {isPlaying && <span className="absolute inset-0 rounded-full border-4 border-indigo-300 animate-ping" />}
                        </button>
                        <p className="mt-3 text-sm font-black text-slate-700">
                            {selectedAudioUrl ? (isPlaying ? t.audioPlaying : t.audioReady) : t.audioMissing}
                        </p>
                        <button
                            type="button"
                            onClick={() => void handleToggleAudio()}
                            disabled={!selectedAudioUrl}
                            className="mt-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-200 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {isPlaying ? t.audioPause : t.audioPlay}
                        </button>
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
                        <p className="text-sm font-bold text-slate-700 whitespace-pre-wrap">{selectedTranslatedText}</p>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="block text-xs font-black text-slate-500 mb-2">{t.signatureLabel}</label>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                        <SignatureCanvas
                            ref={(ref) => {
                                sigRef.current = ref;
                            }}
                            penColor="black"
                            canvasProps={{
                                width: 700,
                                height: 220,
                                className: 'w-full h-[220px]'
                            }}
                        />
                    </div>
                    <button
                        onClick={handleClear}
                        className="mt-2 px-4 py-2 text-xs font-black rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                        {t.signatureClear}
                    </button>
                </div>

                <button
                    onClick={handleSubmit}
                    disabled={submitting}
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
