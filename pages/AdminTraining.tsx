import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { AppSettings } from '../types';
import { supabase } from '../lib/supabaseClient';

type UiLocale = 'ko' | 'en' | 'vi' | 'zh';

const UI_TEXT: Record<UiLocale, {
    title: string;
    subtitle: string;
    sourcePlaceholder: string;
    selectLanguages: string;
    applyPreset: string;
    create: string;
    creating: string;
    sharedCopy: string;
    shareHeader: string;
    shareFailedPrefix: string;
    shareAllAudioLine: string;
    copyFailed: string;
    copyDone: string;
    emptySourceAlert: string;
    minLangAlert: string;
    missingShareAlert: string;
    success: string;
    partialSuccess: string;
    parseFail: string;
    emptyResponse: string;
    createFail: string;
    errorPrefix: string;
    recentTitle: string;
    recentEmpty: string;
    recentLoad: string;
    recentLoaded: string;
    recentLoadedPartial: string;
    delete: string;
    deleting: string;
    deleteCurrent: string;
    deleteDone: string;
    deleteFailPrefix: string;
    deleteConfirm: string;
    removeFromScreen: string;
    removeDone: string;
    noSessionToDelete: string;
    qrTitle: string;
    shareTitle: string;
    failedLangTitle: string;
    failedBadge: string;
    attemptLabel: string;
}> = {
    ko: {
        title: '관리자 다국어 음성 안내 생성',
        subtitle: '한국어 핵심 위험성평가 문구를 입력하면 다국어 TTS와 근로자 QR 링크를 생성합니다.',
        sourcePlaceholder: '예: 이달 핵심 위험은 추락, 협착, 전도입니다.',
        selectLanguages: '생성 언어 선택 (최소 1개)',
        applyPreset: '설정 기본값 적용',
        create: '생성',
        creating: '생성 중...',
        sharedCopy: '공유 텍스트 복사',
        shareHeader: '[PSI 다국어 안전교육 링크]',
        shareFailedPrefix: '음성 미생성 언어(텍스트 대체)',
        shareAllAudioLine: '모든 선택 언어의 음성 안내가 생성되었습니다.',
        copyFailed: '클립보드 복사에 실패했습니다. 텍스트를 직접 복사해 주세요.',
        copyDone: '공유 텍스트를 복사했습니다. 메신저에 붙여넣어 전달해 주세요.',
        emptySourceAlert: '한국어 안내 문구를 입력해 주세요.',
        minLangAlert: '최소 1개 언어를 선택해 주세요.',
        missingShareAlert: '복사할 공유 텍스트가 없습니다. 먼저 생성을 완료해 주세요.',
        success: '생성 완료! 아래 QR을 근로자에게 공유하세요.',
        partialSuccess: '생성 완료(부분 성공): 일부 언어는 음성 생성에 실패하여 텍스트 안내로 대체됩니다.',
        parseFail: '서버 JSON 응답 파싱에 실패했습니다.',
        emptyResponse: '서버가 비어있는 응답을 반환했습니다.',
        createFail: '세션 생성 실패',
        errorPrefix: '오류',
        recentTitle: '최근 테스트 세션',
        recentEmpty: '표시할 세션이 없습니다.',
        recentLoad: '불러오기',
        recentLoaded: '선택한 세션을 불러왔습니다.',
        recentLoadedPartial: '최근 생성 세션을 불러왔습니다.',
        delete: '삭제',
        deleting: '삭제 중...',
        deleteCurrent: '테스트 세션 제거',
        deleteDone: '테스트 세션을 삭제했습니다.',
        deleteFailPrefix: '삭제 오류',
        deleteConfirm: '현재 표시된 테스트 세션을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.',
        removeFromScreen: '화면에서 제거',
        removeDone: '표시 중인 세션 정보를 화면에서 제거했습니다.',
        noSessionToDelete: '삭제할 세션이 없습니다.',
        qrTitle: '근로자 접속 QR',
        shareTitle: '공유 텍스트',
        failedLangTitle: '음성 미생성 언어 (텍스트 대체)',
        failedBadge: '일부 음성 실패',
        attemptLabel: '시도 코드',
    },
    en: {
        title: 'Admin Multilingual Audio Generator',
        subtitle: 'Enter Korean safety text to generate multilingual TTS and worker QR link.',
        sourcePlaceholder: 'e.g. Key risks this month are fall, caught-in, and slip.',
        selectLanguages: 'Select output languages (min 1)',
        applyPreset: 'Apply preset',
        create: 'Create',
        creating: 'Creating...',
        sharedCopy: 'Copy share text',
        shareHeader: '[PSI Multilingual Safety Training Link]',
        shareFailedPrefix: 'Audio failed languages (text fallback)',
        shareAllAudioLine: 'Audio guidance has been generated for all selected languages.',
        copyFailed: 'Failed to copy to clipboard. Please copy manually.',
        copyDone: 'Share text copied. Paste it into your messenger.',
        emptySourceAlert: 'Please enter Korean source text.',
        minLangAlert: 'Please select at least one language.',
        missingShareAlert: 'No share text to copy. Create first.',
        success: 'Created! Share the QR below with workers.',
        partialSuccess: 'Created (partial): some languages failed audio generation and will use text fallback.',
        parseFail: 'Failed to parse server JSON response.',
        emptyResponse: 'Server returned an empty response.',
        createFail: 'Session creation failed',
        errorPrefix: 'Error',
        recentTitle: 'Recent Test Sessions',
        recentEmpty: 'No sessions to display.',
        recentLoad: 'Load',
        recentLoaded: 'Selected session loaded.',
        recentLoadedPartial: 'Latest session loaded.',
        delete: 'Delete',
        deleting: 'Deleting...',
        deleteCurrent: 'Remove test session',
        deleteDone: 'Test session deleted.',
        deleteFailPrefix: 'Delete error',
        deleteConfirm: 'Delete the currently displayed test session?\nThis action cannot be undone.',
        removeFromScreen: 'Clear screen',
        removeDone: 'Cleared currently displayed session.',
        noSessionToDelete: 'No session to delete.',
        qrTitle: 'Worker Access QR',
        shareTitle: 'Share Text',
        failedLangTitle: 'Audio failed languages (text fallback)',
        failedBadge: 'Audio partial failure',
        attemptLabel: 'Attempt codes',
    },
    vi: {
        title: 'Tạo hướng dẫn giọng nói đa ngôn ngữ',
        subtitle: 'Nhập nội dung tiếng Hàn để tạo TTS đa ngôn ngữ và mã QR cho công nhân.',
        sourcePlaceholder: 'Ví dụ: Rủi ro chính tháng này là ngã cao, kẹt ép và trượt ngã.',
        selectLanguages: 'Chọn ngôn ngữ tạo (tối thiểu 1)',
        applyPreset: 'Áp dụng mặc định',
        create: 'Tạo',
        creating: 'Đang tạo...',
        sharedCopy: 'Sao chép nội dung chia sẻ',
        shareHeader: '[Liên kết đào tạo an toàn đa ngôn ngữ PSI]',
        shareFailedPrefix: 'Ngôn ngữ lỗi âm thanh (thay bằng văn bản)',
        shareAllAudioLine: 'Đã tạo âm thanh hướng dẫn cho tất cả ngôn ngữ đã chọn.',
        copyFailed: 'Sao chép clipboard thất bại. Vui lòng sao chép thủ công.',
        copyDone: 'Đã sao chép nội dung chia sẻ. Hãy dán vào ứng dụng nhắn tin.',
        emptySourceAlert: 'Vui lòng nhập nội dung tiếng Hàn.',
        minLangAlert: 'Vui lòng chọn ít nhất một ngôn ngữ.',
        missingShareAlert: 'Không có nội dung để sao chép. Vui lòng tạo trước.',
        success: 'Đã tạo xong! Hãy chia sẻ mã QR bên dưới cho công nhân.',
        partialSuccess: 'Tạo xong (một phần): một số ngôn ngữ lỗi âm thanh và sẽ dùng văn bản thay thế.',
        parseFail: 'Không thể phân tích JSON phản hồi từ máy chủ.',
        emptyResponse: 'Máy chủ trả về phản hồi rỗng.',
        createFail: 'Tạo phiên thất bại',
        errorPrefix: 'Lỗi',
        recentTitle: 'Phiên thử nghiệm gần đây',
        recentEmpty: 'Không có phiên để hiển thị.',
        recentLoad: 'Tải',
        recentLoaded: 'Đã tải phiên được chọn.',
        recentLoadedPartial: 'Đã tải phiên gần nhất.',
        delete: 'Xóa',
        deleting: 'Đang xóa...',
        deleteCurrent: 'Xóa phiên thử nghiệm',
        deleteDone: 'Đã xóa phiên thử nghiệm.',
        deleteFailPrefix: 'Lỗi xóa',
        deleteConfirm: 'Bạn có muốn xóa phiên thử nghiệm đang hiển thị không?\nKhông thể khôi phục sau khi xóa.',
        removeFromScreen: 'Xóa khỏi màn hình',
        removeDone: 'Đã xóa thông tin phiên khỏi màn hình.',
        noSessionToDelete: 'Không có phiên để xóa.',
        qrTitle: 'QR truy cập cho công nhân',
        shareTitle: 'Nội dung chia sẻ',
        failedLangTitle: 'Ngôn ngữ lỗi âm thanh (thay bằng văn bản)',
        failedBadge: 'Lỗi âm thanh một phần',
        attemptLabel: 'Mã đã thử',
    },
    zh: {
        title: '管理员多语言语音生成',
        subtitle: '输入韩文安全文本后，生成多语言 TTS 与工人二维码链接。',
        sourcePlaceholder: '例如：本月重点风险为高处坠落、夹伤、滑倒。',
        selectLanguages: '选择生成语言（至少1个）',
        applyPreset: '应用默认设置',
        create: '生成',
        creating: '生成中...',
        sharedCopy: '复制分享文本',
        shareHeader: '[PSI 多语言安全培训链接]',
        shareFailedPrefix: '语音失败语言（文本替代）',
        shareAllAudioLine: '已为所有所选语言生成语音指引。',
        copyFailed: '复制失败，请手动复制文本。',
        copyDone: '已复制分享文本，请粘贴到聊天工具发送。',
        emptySourceAlert: '请输入韩文说明文本。',
        minLangAlert: '请至少选择一种语言。',
        missingShareAlert: '没有可复制的分享文本，请先生成。',
        success: '生成完成！请将下方二维码分享给工人。',
        partialSuccess: '生成完成（部分成功）：部分语言语音生成失败，将使用文本替代。',
        parseFail: '服务器 JSON 解析失败。',
        emptyResponse: '服务器返回了空响应。',
        createFail: '会话创建失败',
        errorPrefix: '错误',
        recentTitle: '最近测试会话',
        recentEmpty: '暂无可显示会话。',
        recentLoad: '加载',
        recentLoaded: '已加载所选会话。',
        recentLoadedPartial: '已加载最近会话。',
        delete: '删除',
        deleting: '删除中...',
        deleteCurrent: '删除测试会话',
        deleteDone: '已删除测试会话。',
        deleteFailPrefix: '删除错误',
        deleteConfirm: '是否删除当前显示的测试会话？\n删除后无法恢复。',
        removeFromScreen: '从界面移除',
        removeDone: '已从界面移除当前会话信息。',
        noSessionToDelete: '没有可删除的会话。',
        qrTitle: '工人访问二维码',
        shareTitle: '分享文本',
        failedLangTitle: '语音失败语言（文本替代）',
        failedBadge: '部分语音失败',
        attemptLabel: '尝试代码',
    },
};

const resolveAdminLocale = (langs: string[]): UiLocale => {
    if (langs.includes('vi-VN')) return 'vi';
    if (langs.includes('cmn-CN') || langs.includes('zh-CN')) return 'zh';
    if (langs.includes('en-US')) return 'en';
    return 'ko';
};

const LANGUAGE_OPTIONS = [
    { code: 'ko-KR', label: { ko: '한국어', en: 'Korean', vi: 'Tiếng Hàn', zh: '韩语' } },
    { code: 'en-US', label: { ko: '영어', en: 'English', vi: 'Tiếng Anh', zh: '英语' } },
    { code: 'vi-VN', label: { ko: '베트남어', en: 'Vietnamese', vi: 'Tiếng Việt', zh: '越南语' } },
    { code: 'cmn-CN', label: { ko: '중국어', en: 'Chinese', vi: 'Tiếng Trung', zh: '中文' } },
    { code: 'th-TH', label: { ko: '태국어', en: 'Thai', vi: 'Tiếng Thái', zh: '泰语' } },
    { code: 'id-ID', label: { ko: '인도네시아어', en: 'Indonesian', vi: 'Tiếng Indonesia', zh: '印尼语' } },
    { code: 'uz-UZ', label: { ko: '우즈베크어', en: 'Uzbek', vi: 'Tiếng Uzbek', zh: '乌兹别克语' } },
    { code: 'mn-MN', label: { ko: '몽골어', en: 'Mongolian', vi: 'Tiếng Mông Cổ', zh: '蒙古语' } },
    { code: 'km-KH', label: { ko: '크메르어', en: 'Khmer', vi: 'Tiếng Khmer', zh: '高棉语' } },
    { code: 'ru-RU', label: { ko: '러시아어', en: 'Russian', vi: 'Tiếng Nga', zh: '俄语' } },
    { code: 'kk-KZ', label: { ko: '카자흐어', en: 'Kazakh', vi: 'Tiếng Kazakh', zh: '哈萨克语' } },
    { code: 'ne-NP', label: { ko: '네팔어', en: 'Nepali', vi: 'Tiếng Nepal', zh: '尼泊尔语' } },
    { code: 'my-MM', label: { ko: '미얀마어', en: 'Burmese', vi: 'Tiếng Myanmar', zh: '缅甸语' } },
    { code: 'fil-PH', label: { ko: '필리핀어', en: 'Filipino', vi: 'Tiếng Philippines', zh: '菲律宾语' } },
    { code: 'hi-IN', label: { ko: '힌디어', en: 'Hindi', vi: 'Tiếng Hindi', zh: '印地语' } },
    { code: 'bn-BD', label: { ko: '벵골어', en: 'Bengali', vi: 'Tiếng Bengal', zh: '孟加拉语' } },
    { code: 'ur-PK', label: { ko: '우르두어', en: 'Urdu', vi: 'Tiếng Urdu', zh: '乌尔都语' } },
    { code: 'si-LK', label: { ko: '싱할라어', en: 'Sinhala', vi: 'Tiếng Sinhala', zh: '僧伽罗语' } },
] as const;

const CURRENT_SITE_LANGUAGE_SET = [
    'ko-KR',
    'vi-VN',
    'cmn-CN',
    'mn-MN',
    'id-ID',
    'ru-RU',
    'kk-KZ',
    'uz-UZ',
    'th-TH',
    'km-KH',
    'my-MM',
] as const;

const VALID_LANGUAGE_CODES = new Set(LANGUAGE_OPTIONS.map((item) => item.code));

const normalizeLanguagePreset = (input?: string[]): string[] => {
    if (!Array.isArray(input)) return [...CURRENT_SITE_LANGUAGE_SET];
    const normalized = Array.from(new Set(input.filter((code) => VALID_LANGUAGE_CODES.has(code))));
    if (normalized.length === 0) return [...CURRENT_SITE_LANGUAGE_SET];
    return normalized;
};

type TrainingSessionRow = {
    id: string;
    source_text_ko?: string;
    audio_urls?: Record<string, string | null>;
    created_at?: string;
};

const AdminTraining: React.FC = () => {
    const [sourceTextKo, setSourceTextKo] = useState('');
    const [loading, setLoading] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState('');
    const [mobileUrl, setMobileUrl] = useState('');
    const [currentSessionId, setCurrentSessionId] = useState('');
    const [message, setMessage] = useState('');
    const [failedLanguages, setFailedLanguages] = useState<string[]>([]);
    const [failedLanguageAttempts, setFailedLanguageAttempts] = useState<Record<string, string[]>>({});
    const [savedPreset, setSavedPreset] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);
    const [recentSessions, setRecentSessions] = useState<TrainingSessionRow[]>([]);
    const uiLocale = resolveAdminLocale(selectedLanguages);
    const t = UI_TEXT[uiLocale];

    const shareText = mobileUrl
        ? [
            t.shareHeader,
            mobileUrl,
            failedLanguages.length > 0
                ? `${t.shareFailedPrefix}: ${failedLanguages.join(', ')}`
                : t.shareAllAudioLine,
        ].join('\n')
        : '';

    useEffect(() => {
        const raw = localStorage.getItem('psi_app_settings');
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as AppSettings;
            const preset = normalizeLanguagePreset(parsed.trainingLanguagePreset);
            setSavedPreset(preset);
            setSelectedLanguages(preset);
        } catch {
            setSavedPreset([...CURRENT_SITE_LANGUAGE_SET]);
        }
    }, []);

    const fetchRecentSessions = async (): Promise<TrainingSessionRow[]> => {
        const loadWithColumn = async (column: string) => {
            return supabase
                .from('training_sessions')
                .select('id, source_text_ko, audio_urls, created_at')
                .order(column, { ascending: false })
                .limit(5);
        };

        const createdAtResult = await loadWithColumn('created_at');
        const fallbackResult = createdAtResult.error ? await loadWithColumn('id') : null;
        const rows = (fallbackResult?.data || createdAtResult.data || []) as TrainingSessionRow[];
        setRecentSessions(rows);
        return rows;
    };

    const hydrateSessionState = (session: TrainingSessionRow, label: string) => {
        const baseUrl = window.location.origin || 'http://localhost:5173';
        const restoredMobileUrl = `${baseUrl}/?mode=worker-training&sessionId=${encodeURIComponent(String(session.id))}`;
        setMobileUrl(restoredMobileUrl);
        setCurrentSessionId(String(session.id));
        if (session.source_text_ko) setSourceTextKo(session.source_text_ko);

        const restoredAudioUrls = session.audio_urls || {};
        const restoredFailed = Object.entries(restoredAudioUrls)
            .filter(([, url]) => !url)
            .map(([lang]) => lang);
        setFailedLanguages(restoredFailed);
        setFailedLanguageAttempts({});

        if (restoredFailed.length > 0) {
            setMessage(`${label} 일부 언어는 음성 생성에 실패하여 텍스트 안내로 대체됩니다.`);
        } else {
            setMessage(label);
        }
    };

    useEffect(() => {
        const restoreLatestSession = async () => {
            const sessions = await fetchRecentSessions();
            const latest = sessions[0];
            if (!latest?.id) return;
            hydrateSessionState(latest, t.recentLoadedPartial);
        };

        void restoreLatestSession();
    }, []);

    const toggleLanguage = (code: string) => {
        setSelectedLanguages((prev) => {
            if (prev.includes(code)) {
                const next = prev.filter((item) => item !== code);
                if (next.length === 0) return prev;
                return next;
            }
            return [...prev, code];
        });
    };

    const handleCreate = async () => {
        if (!sourceTextKo.trim()) {
            alert(t.emptySourceAlert);
            return;
        }

        if (selectedLanguages.length === 0) {
            alert(t.minLangAlert);
            return;
        }

        setLoading(true);
        setMessage('');
        setMobileUrl('');
        setCurrentSessionId('');
        setFailedLanguages([]);
        setFailedLanguageAttempts({});

        try {
            const response = await fetch('/api/admin/create-training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sourceTextKo, selectedLanguages }),
            });

            const contentType = response.headers.get('content-type') || '';
            const raw = await response.text();
            let data: any = null;

            if (raw && contentType.includes('application/json')) {
                try {
                    data = JSON.parse(raw);
                } catch {
                    throw new Error(t.parseFail);
                }
            }

            if (!response.ok) {
                const serverMessage = data?.message || data?.error || `요청 실패 (HTTP ${response.status})`;
                throw new Error(serverMessage);
            }

            if (!data) {
                throw new Error(t.emptyResponse);
            }

            if (!data.ok) {
                throw new Error(data.message || data.error || t.createFail);
            }

            setMobileUrl(data.mobileUrl || '');
            setCurrentSessionId(String(data.sessionId || ''));
            const failed = Array.isArray(data.failedLanguages) ? data.failedLanguages : [];
            setFailedLanguages(failed);
            setFailedLanguageAttempts(data?.failedLanguageAttempts && typeof data.failedLanguageAttempts === 'object' ? data.failedLanguageAttempts : {});
            void fetchRecentSessions();
            if (failed.length > 0) {
                setMessage(t.partialSuccess);
            } else {
                setMessage(t.success);
            }
        } catch (error: any) {
            setMessage(`${t.errorPrefix}: ${error?.message || t.createFail}`);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyShareText = async () => {
        if (!shareText) {
            alert(t.missingShareAlert);
            return;
        }

        try {
            await navigator.clipboard.writeText(shareText);
            setMessage(t.copyDone);
        } catch {
            setMessage(t.copyFailed);
        }
    };

    const clearRenderedSession = () => {
        setMobileUrl('');
        setCurrentSessionId('');
        setFailedLanguages([]);
        setFailedLanguageAttempts({});
        setMessage(t.removeDone);
    };

    const handleDeleteSession = async (targetSessionId?: string) => {
        const sessionIdToDelete = targetSessionId || currentSessionId;
        if (!sessionIdToDelete) {
            setMessage(t.noSessionToDelete);
            return;
        }

        const ok = window.confirm(t.deleteConfirm);
        if (!ok) return;

        setDeletingSessionId(sessionIdToDelete);
        try {
            const response = await fetch('/api/admin/delete-training-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: sessionIdToDelete }),
            });

            const contentType = response.headers.get('content-type') || '';
            const raw = await response.text();
            let data: any = null;

            if (raw && contentType.includes('application/json')) {
                try {
                    data = JSON.parse(raw);
                } catch {
                    throw new Error(t.parseFail);
                }
            }

            if (!response.ok || !data?.ok) {
                throw new Error(data?.message || data?.error || `세션 삭제 실패 (HTTP ${response.status})`);
            }

            if (sessionIdToDelete === currentSessionId) {
                setMobileUrl('');
                setCurrentSessionId('');
                setFailedLanguages([]);
                setFailedLanguageAttempts({});
            }
            await fetchRecentSessions();
            setMessage(t.deleteDone);
        } catch (error: any) {
            setMessage(`${t.deleteFailPrefix}: ${error?.message || t.createFail}`);
        } finally {
            setDeletingSessionId('');
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">{t.title}</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">{t.subtitle}</p>

                <textarea
                    value={sourceTextKo}
                    onChange={(e) => setSourceTextKo(e.target.value)}
                    rows={8}
                    placeholder={t.sourcePlaceholder}
                    className="w-full mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm"
                />

                <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-black text-slate-600">{t.selectLanguages}</p>
                        <button
                            type="button"
                            onClick={() => setSelectedLanguages([...savedPreset])}
                            className="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-[11px] font-black border border-indigo-200 hover:bg-indigo-100"
                        >
                            {t.applyPreset}
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {LANGUAGE_OPTIONS.map((lang) => (
                            <label key={lang.code} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                                <input
                                    type="checkbox"
                                    checked={selectedLanguages.includes(lang.code)}
                                    onChange={() => toggleLanguage(lang.code)}
                                />
                                <span className="text-xs font-bold text-slate-700">{lang.label[uiLocale]} ({lang.code})</span>
                            </label>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        기본값은 설정 페이지의 "다국어 교육 기본 언어 세트"를 따르며, 미설정 시 현장 다국적 기본 세트가 적용됩니다.
                    </p>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="mt-4 px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? t.creating : t.create}
                </button>

                {message && <p className="mt-4 text-sm font-bold text-slate-700">{message}</p>}
                {failedLanguages.length > 0 && (
                    <div className="mt-3">
                        <p className="text-xs font-black text-amber-700 mb-2">{t.failedLangTitle}</p>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {failedLanguages.map((code) => (
                                <span
                                    key={code}
                                    className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[11px] font-black"
                                >
                                    {code}
                                </span>
                            ))}
                        </div>
                        <div className="space-y-1">
                            {failedLanguages.map((code) => {
                                const attempts = failedLanguageAttempts[code] || [];
                                return (
                                    <p key={`${code}-attempts`} className="text-[11px] font-bold text-slate-600">
                                        {code} {t.attemptLabel}: {attempts.length > 0 ? attempts.join(', ') : '-'}
                                    </p>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">{t.recentTitle}</h3>
                {recentSessions.length === 0 ? (
                    <p className="mt-3 text-sm font-bold text-slate-500">{t.recentEmpty}</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {recentSessions.map((session) => {
                            const hasMissingAudio = Object.values(session.audio_urls || {}).some((url) => !url);
                            const preview = (session.source_text_ko || '').trim();
                            return (
                                <div key={session.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                                    <p className="text-[11px] font-black text-slate-600 break-all">{session.id}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-700 line-clamp-2">{preview || '(문구 없음)'}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {hasMissingAudio && (
                                            <span className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-black">
                                                {t.failedBadge}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => hydrateSessionState(session, t.recentLoaded)}
                                            className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-black border border-slate-200 hover:bg-slate-200"
                                        >
                                            {t.recentLoad}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleDeleteSession(session.id)}
                                            disabled={deletingSessionId === session.id}
                                            className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-[11px] font-black border border-rose-200 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {deletingSessionId === session.id ? t.deleting : t.delete}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {mobileUrl && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900">{t.qrTitle}</h3>
                    {currentSessionId && <p className="text-[11px] font-bold text-slate-500 mt-1">세션 ID: {currentSessionId}</p>}
                    <p className="text-xs font-bold text-slate-500 mt-2 break-all">{mobileUrl}</p>
                    <div className="mt-4">
                        <QRCodeCanvas value={mobileUrl} size={220} />
                    </div>
                    <div className="mt-4">
                        <p className="text-xs font-black text-slate-600 mb-2">{t.shareTitle}</p>
                        <textarea
                            value={shareText}
                            readOnly
                            rows={4}
                            className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200 font-bold text-xs"
                        />
                        <button
                            type="button"
                            onClick={handleCopyShareText}
                            className="mt-2 px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-200"
                        >
                            {t.sharedCopy}
                        </button>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={clearRenderedSession}
                                className="px-4 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-black border border-slate-200 hover:bg-slate-200"
                            >
                                {t.removeFromScreen}
                            </button>
                            <button
                                type="button"
                                onClick={handleDeleteSession}
                                disabled={!!deletingSessionId || !currentSessionId}
                                className="px-4 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-black border border-rose-200 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                {deletingSessionId === currentSessionId ? t.deleting : t.deleteCurrent}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTraining;
