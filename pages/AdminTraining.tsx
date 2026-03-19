import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../lib/supabaseClient';
import { postAdminJson } from '../utils/adminApiClient';
import {
    TRAINING_AUDIO_LANGUAGE_CODES,
    TRAINING_AUDIO_LANGUAGES,
    type TrainingAudioLanguageCode,
} from '../utils/trainingLanguageUtils';

type UiLocale = 'ko' | 'en' | 'vi' | 'zh';
const LINK_HISTORY_STORAGE_KEY = 'psi_training_link_history';
const ACTIVE_QR_STATE_STORAGE_KEY = 'psi_training_active_qr_state';
const SAFETY_LEVEL_MIGRATION_REPORT_KEY = 'psi_migrated_safety_level_report_v20260316';

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
    linkExpiryLabel: string;
    linkExpiredBadge: string;
    reissueLink: string;
    reissuing: string;
    reissueDone: string;
    reissueFail: string;
    historyTitle: string;
    historyEmpty: string;
    historyCreate: string;
    historyReissue: string;
    awarenessTitle: string;
    awarenessSubtitle: string;
    statSubmitted: string;
    statConfirmed: string;
    statUnconfirmed: string;
    statRate: string;
    statNationalities: string;
    statDataSource: string;
    statSourceAckTable: string;
    statSourceSubmissionGate: string;
    statLoading: string;
    statErrorPrefix: string;
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
        linkExpiryLabel: '링크 만료 시각',
        linkExpiredBadge: '만료됨',
        reissueLink: '링크 재발급',
        reissuing: '재발급 중...',
        reissueDone: '링크를 재발급했습니다.',
        reissueFail: '링크 재발급 실패',
        historyTitle: '링크 생성/재발급 이력',
        historyEmpty: '아직 기록이 없습니다.',
        historyCreate: '초기 생성',
        historyReissue: '재발급',
        awarenessTitle: '위험성평가 인지·확약 통계',
        awarenessSubtitle: '현재 세션에서 위험성평가를 명확히 인지하고 확약한 인원을 즉시 확인합니다.',
        statSubmitted: '제출 인원',
        statConfirmed: '이해·확약 인원',
        statUnconfirmed: '미확약 인원',
        statRate: '확약률',
        statNationalities: '참여 국적 수',
        statDataSource: '산출 기준',
        statSourceAckTable: '확약 상세 테이블',
        statSourceSubmissionGate: '제출 게이트 로직',
        statLoading: '통계 불러오는 중...',
        statErrorPrefix: '통계 오류',
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
        linkExpiryLabel: 'Link expires at',
        linkExpiredBadge: 'Expired',
        reissueLink: 'Reissue link',
        reissuing: 'Reissuing...',
        reissueDone: 'Link reissued.',
        reissueFail: 'Failed to reissue link',
        historyTitle: 'Link issue/reissue history',
        historyEmpty: 'No history yet.',
        historyCreate: 'Initial issue',
        historyReissue: 'Reissue',
        awarenessTitle: 'Risk Awareness & Pledge Metrics',
        awarenessSubtitle: 'See how many workers clearly understood and pledged for this session.',
        statSubmitted: 'Submitted workers',
        statConfirmed: 'Confirmed understanding',
        statUnconfirmed: 'Unconfirmed',
        statRate: 'Confirmation rate',
        statNationalities: 'Nationality count',
        statDataSource: 'Data source',
        statSourceAckTable: 'Acknowledgement detail table',
        statSourceSubmissionGate: 'Submission gate logic',
        statLoading: 'Loading metrics...',
        statErrorPrefix: 'Metrics error',
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
        linkExpiryLabel: 'Thời điểm hết hạn liên kết',
        linkExpiredBadge: 'Đã hết hạn',
        reissueLink: 'Cấp lại liên kết',
        reissuing: 'Đang cấp lại...',
        reissueDone: 'Đã cấp lại liên kết.',
        reissueFail: 'Cấp lại liên kết thất bại',
        historyTitle: 'Lịch sử tạo/cấp lại liên kết',
        historyEmpty: 'Chưa có lịch sử.',
        historyCreate: 'Tạo ban đầu',
        historyReissue: 'Cấp lại',
        awarenessTitle: 'Thống kê nhận thức & cam kết rủi ro',
        awarenessSubtitle: 'Xem ngay số công nhân đã hiểu rõ và cam kết trong phiên hiện tại.',
        statSubmitted: 'Số người đã gửi',
        statConfirmed: 'Số người đã hiểu/cam kết',
        statUnconfirmed: 'Chưa cam kết',
        statRate: 'Tỷ lệ cam kết',
        statNationalities: 'Số quốc tịch tham gia',
        statDataSource: 'Nguồn dữ liệu',
        statSourceAckTable: 'Bảng chi tiết cam kết',
        statSourceSubmissionGate: 'Logic chặn gửi',
        statLoading: 'Đang tải thống kê...',
        statErrorPrefix: 'Lỗi thống kê',
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
        linkExpiryLabel: '链接过期时间',
        linkExpiredBadge: '已过期',
        reissueLink: '重新签发链接',
        reissuing: '重新签发中...',
        reissueDone: '链接已重新签发。',
        reissueFail: '链接重新签发失败',
        historyTitle: '链接签发/重签历史',
        historyEmpty: '暂无历史记录。',
        historyCreate: '首次签发',
        historyReissue: '重新签发',
        awarenessTitle: '风险认知与承诺统计',
        awarenessSubtitle: '即时查看本会话中已明确理解并承诺的工人数。',
        statSubmitted: '已提交人数',
        statConfirmed: '已理解/承诺人数',
        statUnconfirmed: '未承诺人数',
        statRate: '承诺率',
        statNationalities: '参与国籍数',
        statDataSource: '统计依据',
        statSourceAckTable: '承诺明细表',
        statSourceSubmissionGate: '提交门槛逻辑',
        statLoading: '统计加载中...',
        statErrorPrefix: '统计错误',
    },
};

const LANGUAGE_OPTIONS = TRAINING_AUDIO_LANGUAGES.map((item) => ({
    code: item.code,
    label: `${item.flag} ${item.label} (${item.code})`,
}));

type TrainingSessionRow = {
    id: string;
    source_text_ko?: string;
    audio_urls?: Record<string, string | null>;
    original_script?: string;
    created_at?: string;
};

type TrainingAudioFileMap = Partial<Record<TrainingAudioLanguageCode, File | null>>;

const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        resolve(result.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, ''));
    };
    reader.onerror = () => reject(reader.error || new Error('파일 읽기 실패'));
    reader.readAsDataURL(file);
});

type LinkHistoryItem = {
    sessionId: string;
    mobileUrl: string;
    linkExpiresAt: number;
    action: 'create' | 'reissue';
    createdAt: string;
};

type AwarenessStats = {
    submittedWorkers: number;
    confirmedWorkers: number;
    unconfirmedWorkers: number;
    confirmationRate: number;
    nationalityCount: number;
    ackDataSource: 'training_acknowledgements' | 'submission_gate';
};

type ActiveQrState = {
    sourceTextKo: string;
    mobileUrl: string;
    currentSessionId: string;
    linkExpiresAt: number | null;
    failedLanguages: string[];
    failedLanguageAttempts: Record<string, string[]>;
};

type SafetyLevelMigrationReport = {
    runAt: string;
    totalRecords: number;
    changedCount: number;
    criteria: string;
};

const AdminTraining: React.FC = () => {
    // 관리자 UI는 요구사항에 따라 항상 한국어 고정
    const t = UI_TEXT.ko;
    const [sourceTextKo, setSourceTextKo] = useState('');
    const [loading, setLoading] = useState(false);
    const [mobileUrl, setMobileUrl] = useState('');
    const [currentSessionId, setCurrentSessionId] = useState('');
    const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
    const [message, setMessage] = useState('');
    const [reissuingLink, setReissuingLink] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState('');
    const [linkHistory, setLinkHistory] = useState<LinkHistoryItem[]>([]);
    const [recentSessions, setRecentSessions] = useState<TrainingSessionRow[]>([]);
    const [migrationReport, setMigrationReport] = useState<SafetyLevelMigrationReport | null>(null);
    const [awarenessStats, setAwarenessStats] = useState<AwarenessStats | null>(null);
    const [awarenessLoading, setAwarenessLoading] = useState(false);
    const [awarenessError, setAwarenessError] = useState('');
    const [failedLanguages, setFailedLanguages] = useState<string[]>([]);
    const [failedLanguageAttempts, setFailedLanguageAttempts] = useState<Record<string, string[]>>({});
    const [audioFiles, setAudioFiles] = useState<TrainingAudioFileMap>({});
    const [uploadedAudioUrls, setUploadedAudioUrls] = useState<Record<string, string | null>>({});

    const appendLinkHistory = (item: LinkHistoryItem) => {
        setLinkHistory((prev) => {
            const next = [item, ...prev].slice(0, 30);
            localStorage.setItem(LINK_HISTORY_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const requestSignedMobileUrl = async (sessionId: string) => {
        const data = await postAdminJson<{ ok: boolean; mobileUrl?: string; linkExpiresAt?: number }>(
            '/api/admin/reissue-training-link',
            { sessionId },
            { fallbackMessage: t.reissueFail }
        );

        return {
            mobileUrl: String(data.mobileUrl || ''),
            linkExpiresAt: Number(data.linkExpiresAt || 0),
        };
    };

    const shareText = mobileUrl
        ? [
            t.shareHeader,
            mobileUrl,
            failedLanguages.length > 0
                ? `미첨부/미업로드 언어: ${failedLanguages.join(', ')}`
                : '11개국 MP3/M4A 업로드가 반영되었습니다.',
        ].join('\n')
        : '';

    const setAudioFile = (code: TrainingAudioLanguageCode, file: File | null) => {
        setAudioFiles((prev) => ({
            ...prev,
            [code]: file,
        }));
    };

    const loadMigrationReport = () => {
        const raw = localStorage.getItem(SAFETY_LEVEL_MIGRATION_REPORT_KEY);
        if (!raw) {
            setMigrationReport(null);
            return;
        }

        try {
            const parsed = JSON.parse(raw) as SafetyLevelMigrationReport;
            if (parsed && typeof parsed === 'object') {
                setMigrationReport(parsed);
                return;
            }
            setMigrationReport(null);
        } catch {
            setMigrationReport(null);
        }
    };

    const fetchAwarenessStats = async (sessionId: string) => {
        setAwarenessLoading(true);
        setAwarenessError('');
        try {
            const data = await postAdminJson<any>(
                '/api/admin/training-awareness-stats',
                { sessionId },
                { fallbackMessage: '통계 조회 실패' }
            );

            setAwarenessStats({
                submittedWorkers: Number(data.submittedWorkers || 0),
                confirmedWorkers: Number(data.confirmedWorkers || 0),
                unconfirmedWorkers: Number(data.unconfirmedWorkers || 0),
                confirmationRate: Number(data.confirmationRate || 0),
                nationalityCount: Number(data.nationalityCount || 0),
                ackDataSource: data.ackDataSource === 'training_acknowledgements'
                    ? 'training_acknowledgements'
                    : 'submission_gate',
            });
        } catch (error: any) {
            setAwarenessStats(null);
            setAwarenessError(error?.message || t.createFail);
        } finally {
            setAwarenessLoading(false);
        }
    };

    useEffect(() => {
        const raw = localStorage.getItem(LINK_HISTORY_STORAGE_KEY);
        if (!raw) return;
        try {
            const parsed = JSON.parse(raw) as LinkHistoryItem[];
            if (Array.isArray(parsed)) {
                setLinkHistory(parsed.slice(0, 30));
            }
        } catch {
            setLinkHistory([]);
        }
    }, []);

    useEffect(() => {
        const raw = localStorage.getItem(ACTIVE_QR_STATE_STORAGE_KEY);
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw) as ActiveQrState;
            if (!parsed?.currentSessionId || !parsed?.mobileUrl) return;
            setSourceTextKo(parsed.sourceTextKo || '');
            setMobileUrl(parsed.mobileUrl || '');
            setCurrentSessionId(parsed.currentSessionId || '');
            setLinkExpiresAt(typeof parsed.linkExpiresAt === 'number' ? parsed.linkExpiresAt : null);
            setFailedLanguages(Array.isArray(parsed.failedLanguages) ? parsed.failedLanguages : []);
            setFailedLanguageAttempts(parsed.failedLanguageAttempts && typeof parsed.failedLanguageAttempts === 'object'
                ? parsed.failedLanguageAttempts
                : {});
        } catch {
            localStorage.removeItem(ACTIVE_QR_STATE_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        loadMigrationReport();
    }, []);

    useEffect(() => {
        if (!currentSessionId || !mobileUrl) {
            localStorage.removeItem(ACTIVE_QR_STATE_STORAGE_KEY);
            return;
        }

        const payload: ActiveQrState = {
            sourceTextKo,
            mobileUrl,
            currentSessionId,
            linkExpiresAt,
            failedLanguages,
            failedLanguageAttempts,
        };

        localStorage.setItem(ACTIVE_QR_STATE_STORAGE_KEY, JSON.stringify(payload));
    }, [sourceTextKo, mobileUrl, currentSessionId, linkExpiresAt, failedLanguages, failedLanguageAttempts]);

    const fetchRecentSessions = async (): Promise<TrainingSessionRow[]> => {
        const loadWithColumn = async (column: string) => {
            return supabase
                .from('training_sessions')
                .select('id, source_text_ko, original_script, audio_urls, created_at')
                .order(column, { ascending: false })
                .limit(5);
        };

        const createdAtResult = await loadWithColumn('created_at');
        const fallbackResult = createdAtResult.error ? await loadWithColumn('id') : null;
        const rows = (fallbackResult?.data || createdAtResult.data || []) as TrainingSessionRow[];
        setRecentSessions(rows);
        return rows;
    };

    const hydrateSessionState = async (session: TrainingSessionRow, label: string) => {
        const signed = await requestSignedMobileUrl(String(session.id));
        setMobileUrl(signed.mobileUrl);
        setLinkExpiresAt(Number.isFinite(signed.linkExpiresAt) ? signed.linkExpiresAt : null);
        setCurrentSessionId(String(session.id));
        if (session.original_script || session.source_text_ko) {
            setSourceTextKo(session.original_script || session.source_text_ko || '');
        }

        const restoredAudioUrls = session.audio_urls || {};
        setUploadedAudioUrls(restoredAudioUrls);
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
            try {
                const persistedRaw = localStorage.getItem(ACTIVE_QR_STATE_STORAGE_KEY);
                if (persistedRaw) {
                    const persisted = JSON.parse(persistedRaw) as ActiveQrState;
                    if (persisted?.currentSessionId && persisted?.mobileUrl) {
                        return;
                    }
                }

                const sessions = await fetchRecentSessions();
                const latest = sessions[0];
                if (!latest?.id) return;
                await hydrateSessionState(latest, t.recentLoadedPartial);
            } catch (error: any) {
                setMessage(`${t.errorPrefix}: ${error?.message || t.reissueFail}`);
            }
        };

        void restoreLatestSession();
    }, []);

    useEffect(() => {
        if (!currentSessionId) {
            setAwarenessStats(null);
            setAwarenessError('');
            return;
        }

        void fetchAwarenessStats(currentSessionId);
        const timerId = window.setInterval(() => {
            void fetchAwarenessStats(currentSessionId);
        }, 20000);

        return () => window.clearInterval(timerId);
    }, [currentSessionId]);

    const handleCreate = async () => {
        setLoading(true);
        setMessage('');
        setMobileUrl('');

        try {
            const data = await postAdminJson<any>(
                '/api/admin/create-training',
                { sourceTextKo, selectedLanguages: TRAINING_AUDIO_LANGUAGE_CODES },
                { fallbackMessage: '세션 생성 실패' }
            );

            const nextSessionId = String(data.sessionId || '');
            const uploadPayload: Record<string, { fileName: string; contentType: string; base64: string }> = {};

            for (const language of TRAINING_AUDIO_LANGUAGES) {
                const file = audioFiles[language.code];
                if (!file) continue;

                const lowerName = file.name.toLowerCase();
                const isSupportedAudio =
                    file.type === 'audio/mpeg' ||
                    file.type === 'audio/mp4' ||
                    file.type === 'audio/x-m4a' ||
                    lowerName.endsWith('.mp3') ||
                    lowerName.endsWith('.m4a');
                if (!isSupportedAudio) {
                    throw new Error(`${language.label} 파일은 MP3 또는 M4A 형식만 업로드할 수 있습니다.`);
                }

                uploadPayload[language.code] = {
                    fileName: file.name,
                    contentType: file.type || 'audio/mpeg',
                    base64: await readFileAsBase64(file),
                };
            }

            const syncData = await postAdminJson<any>(
                '/api/admin/upload-training-audio',
                {
                    sessionId: nextSessionId,
                    originalScript: sourceTextKo,
                    files: uploadPayload,
                },
                { fallbackMessage: 'MP3/M4A 업로드 저장 실패' }
            );
            const nextAudioUrls = (syncData.audioUrls && typeof syncData.audioUrls === 'object')
                ? syncData.audioUrls as Record<string, string | null>
                : Object.fromEntries(TRAINING_AUDIO_LANGUAGE_CODES.map((code) => [code, null]));

            setMobileUrl(data.mobileUrl || '');
            setCurrentSessionId(nextSessionId);
            setLinkExpiresAt(Number.isFinite(Number(data.linkExpiresAt)) ? Number(data.linkExpiresAt) : null);
            setUploadedAudioUrls(nextAudioUrls);
            setFailedLanguages(TRAINING_AUDIO_LANGUAGES.filter((lang) => !nextAudioUrls[lang.code]).map((lang) => lang.label));
            setFailedLanguageAttempts({});

            if (nextSessionId && data.mobileUrl) {
                appendLinkHistory({
                    sessionId: nextSessionId,
                    mobileUrl: String(data.mobileUrl),
                    linkExpiresAt: Number(data.linkExpiresAt || 0),
                    action: 'create',
                    createdAt: new Date().toISOString(),
                });
            }

            await fetchRecentSessions();
            setMessage('세션 생성 및 11개국 MP3/M4A 업로드 반영이 완료되었습니다. 아래 QR을 근로자에게 공유하세요.');
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '알 수 없는 오류'}`);
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
        setLinkExpiresAt(null);
        setFailedLanguages([]);
        setFailedLanguageAttempts({});
        setUploadedAudioUrls({});
        setAwarenessStats(null);
        setAwarenessError('');
        localStorage.removeItem(ACTIVE_QR_STATE_STORAGE_KEY);
        setMessage(t.removeDone);
    };

    const handleReissueCurrentLink = async () => {
        if (!currentSessionId) return;
        setReissuingLink(true);
        try {
            const signed = await requestSignedMobileUrl(currentSessionId);
            setMobileUrl(signed.mobileUrl);
            setLinkExpiresAt(Number.isFinite(signed.linkExpiresAt) ? signed.linkExpiresAt : null);
            appendLinkHistory({
                sessionId: currentSessionId,
                mobileUrl: signed.mobileUrl,
                linkExpiresAt: signed.linkExpiresAt,
                action: 'reissue',
                createdAt: new Date().toISOString(),
            });
            setMessage(t.reissueDone);
        } catch (error: any) {
            setMessage(`${t.errorPrefix}: ${error?.message || t.reissueFail}`);
        } finally {
            setReissuingLink(false);
        }
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
            await postAdminJson<any>(
                '/api/admin/delete-training-session',
                { sessionId: sessionIdToDelete },
                { fallbackMessage: '세션 삭제 실패' }
            );

            if (sessionIdToDelete === currentSessionId) {
                setMobileUrl('');
                setCurrentSessionId('');
                setLinkExpiresAt(null);
                setFailedLanguages([]);
                setFailedLanguageAttempts({});
                setUploadedAudioUrls({});
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
                <h2 className="text-2xl font-black text-slate-900">관리자 다국어 음성 안내 생성</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">관리자 화면은 항상 한국어로 고정됩니다. 한국어 원본 대본을 입력하고 11개국 MP3/M4A 파일을 업로드한 뒤 QR 링크를 배포하세요.</p>
                <textarea
                    value={sourceTextKo}
                    onChange={(e) => setSourceTextKo(e.target.value)}
                    rows={8}
                    placeholder="예: 이달 핵심 위험은 추락, 협착, 전도입니다."
                    className="w-full mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 font-bold text-sm"
                />

                <div className="mt-4">
                    <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3">
                        <p className="text-xs font-black text-indigo-800">고정 업로드 대상 언어 코드</p>
                        <p className="mt-1 text-[11px] font-bold text-indigo-700 break-all">{JSON.stringify(TRAINING_AUDIO_LANGUAGE_CODES)}</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {TRAINING_AUDIO_LANGUAGES.map((lang) => {
                            const selectedFile = audioFiles[lang.code];
                            const uploadedUrl = uploadedAudioUrls[lang.code];
                            return (
                                <div key={lang.code} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="flex items-center justify-between gap-3 mb-2">
                                        <p className="text-sm font-black text-slate-800">{lang.flag} {lang.label} 음성 첨부</p>
                                        <span className="text-[10px] font-black text-slate-500">{lang.code}</span>
                                    </div>
                                    <input
                                        type="file"
                                        accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
                                        onChange={(e) => setAudioFile(lang.code, e.target.files?.[0] || null)}
                                        className="block w-full text-xs font-bold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white hover:file:bg-indigo-700"
                                    />
                                    <p className="mt-2 text-[11px] font-bold text-slate-500">선택 파일: {selectedFile?.name || '없음'}</p>
                                    <p className={`mt-1 text-[11px] font-bold ${uploadedUrl ? 'text-emerald-700' : 'text-amber-700'}`}>
                                        {uploadedUrl ? '업로드 URL 저장됨' : '미업로드 시 근로자 화면에서 오디오 플레이어가 숨겨집니다.'}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="mt-4 px-6 py-3 rounded-xl bg-indigo-600 text-white font-black text-sm hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {loading ? '생성 중...' : '생성'}
                </button>

                {message && <p className="mt-4 text-sm font-bold text-slate-700">{message}</p>}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">{t.awarenessTitle}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500">{t.awarenessSubtitle}</p>
                {migrationReport ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                            백필 완료
                        </span>
                        <p className="text-[11px] font-bold text-emerald-700">
                            전체 {migrationReport.totalRecords}건 / 변경 {migrationReport.changedCount}건 · 기준 {migrationReport.criteria} · 실행 {new Date(migrationReport.runAt).toLocaleString('ko-KR')}
                        </p>
                        <button
                            type="button"
                            onClick={loadMigrationReport}
                            className="inline-flex items-center rounded-lg border border-emerald-200 bg-white px-2 py-1 text-[10px] font-black text-emerald-700 hover:bg-emerald-50"
                        >
                            새로고침
                        </button>
                    </div>
                ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">
                            백필 대기
                        </span>
                        <p className="text-[11px] font-bold text-amber-700">
                            실행 기록이 없습니다. 앱 대시보드 최초 로드 시 1회 자동 실행됩니다.
                        </p>
                        <button
                            type="button"
                            onClick={loadMigrationReport}
                            className="inline-flex items-center rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-black text-amber-700 hover:bg-amber-50"
                        >
                            새로고침
                        </button>
                    </div>
                )}

                {!currentSessionId ? (
                    <p className="mt-3 text-sm font-bold text-slate-500">{t.recentEmpty}</p>
                ) : awarenessLoading ? (
                    <p className="mt-3 text-sm font-bold text-slate-500">{t.statLoading}</p>
                ) : awarenessError ? (
                    <p className="mt-3 text-sm font-bold text-rose-700">{t.statErrorPrefix}: {awarenessError}</p>
                ) : awarenessStats ? (
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">{t.statSubmitted}</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{awarenessStats.submittedWorkers}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                            <p className="text-[11px] font-black text-emerald-700">{t.statConfirmed}</p>
                            <p className="mt-1 text-xl font-black text-emerald-800">{awarenessStats.confirmedWorkers}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
                            <p className="text-[11px] font-black text-amber-700">{t.statUnconfirmed}</p>
                            <p className="mt-1 text-xl font-black text-amber-800">{awarenessStats.unconfirmedWorkers}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50">
                            <p className="text-[11px] font-black text-indigo-700">{t.statRate}</p>
                            <p className="mt-1 text-xl font-black text-indigo-800">{awarenessStats.confirmationRate}%</p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">{t.statNationalities}</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{awarenessStats.nationalityCount}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">{t.statDataSource}</p>
                            <p className="mt-1 text-[12px] font-black text-slate-900">
                                {awarenessStats.ackDataSource === 'training_acknowledgements'
                                    ? t.statSourceAckTable
                                    : t.statSourceSubmissionGate}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="mt-3 text-sm font-bold text-slate-500">{t.recentEmpty}</p>
                )}
            </div>

            {mobileUrl && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900">근로자 접속 QR</h3>
                    <p className="text-xs font-bold text-slate-500 mt-2 break-all">{mobileUrl}</p>
                    <div className="mt-4">
                        <QRCodeCanvas value={mobileUrl} size={220} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTraining;
