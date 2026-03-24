import React, { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { QRCodeSVG } from 'qrcode.react';
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
const EXCLUDE_CURRENT_SESSION_FLUSH_TOGGLE_KEY = 'psi_exclude_current_session_flush_toggle_v1';
const FLUSH_SELECTED_SESSIONS_STORAGE_KEY = 'psi_flush_selected_sessions_v1';
const FLUSH_SUMMARY_HISTORY_STORAGE_KEY = 'psi_flush_summary_history_v1';
const SOFT_WARNING_AUDIO_UPLOAD_BYTES = 3 * 1024 * 1024;
const MAX_AUDIO_UPLOAD_BYTES = 10 * 1024 * 1024;
const SOFT_WARNING_UPLOAD_MESSAGE = "파일 용량이 큽니다. 트래픽 절약을 위해 카카오톡 '내게 쓰기'로 전송 후 다운로드하여 업로드하는 것을 권장합니다.";
const HARD_BLOCK_UPLOAD_MESSAGE = '10MB를 초과한 파일은 업로드할 수 없습니다. 10MB 이하 파일만 첨부해 주세요.';

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
    training_title?: string;
    training_category?: 'monthly_risk' | 'special_safety';
    target_mode?: 'submitted_only' | 'attendance_only';
    target_worker_names?: string[];
};

type TrainingAudioFileMap = Partial<Record<TrainingAudioLanguageCode, File | null>>;

type LinkHistoryItem = {
    sessionId: string;
    mobileUrl: string;
    linkExpiresAt: number;
    action: 'create' | 'reissue';
    createdAt: string;
};

type AwarenessStats = {
    targetMode: 'submitted_only' | 'attendance_only';
    submittedWorkers: number;
    targetedWorkers: number;
    confirmedWorkers: number;
    unconfirmedWorkers: number;
    excludedWorkers: number;
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

type FlushSummary = {
    mode: 'all' | 'sessions';
    targetSessionCount: number;
    excludedSessionCount: number;
    scannedFileCount: number;
    updatedSessionCount: number;
    removedFileCount: number;
    failedSessionCount: number;
    runAt: string;
};

type SignatureRosterRow = {
    id: string;
    submitted_at: string;
    nationality: string;
    worker_name: string;
    signature_url: string;
};

const formatSizeInMb = (bytes: number): string => `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
const formatSessionCreatedAt = (value?: string): string => {
    if (!value) return '-';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleString('ko-KR');
};

const isSessionAudioFlushed = (session?: TrainingSessionRow): boolean => {
    if (!session?.audio_urls || typeof session.audio_urls !== 'object') return true;
    const values = Object.values(session.audio_urls);
    if (values.length === 0) return true;
    return values.every((value) => !value);
};

const buildDefaultTrainingTitle = (): string => {
    const now = new Date();
    return `${now.getMonth() + 1}월 위험성평가 전파교육`;
};

const getTrainingCategoryLabel = (value?: 'monthly_risk' | 'special_safety'): string => {
    return value === 'special_safety' ? '특별안전보건교육' : '월별 위험성평가';
};

const getTargetModeLabel = (value?: 'submitted_only' | 'attendance_only'): string => {
    return value === 'attendance_only' ? '당일 출근자 기준' : '제출자 기준';
};

const escapeCsvCell = (value: unknown): string => {
    const text = String(value ?? '');
    return `"${text.replace(/"/g, '""')}"`;
};

const normalizeTargetWorkerNames = (items: string[]): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of items) {
        const normalized = String(item || '').trim();
        if (!normalized) continue;
        const key = normalized.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
        if (result.length >= 5000) break;
    }

    return result;
};

const parseAttendanceRosterText = (raw: string): string[] => {
    const lines = String(raw || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const parsed: string[] = [];
    for (const line of lines) {
        const cells = line.split(/,|\t|;/).map((cell) => cell.trim()).filter(Boolean);
        if (cells.length === 0) continue;
        const firstCell = cells[0];
        if (/^(name|이름|성명)$/i.test(firstCell)) continue;
        parsed.push(firstCell);
    }

    return normalizeTargetWorkerNames(parsed);
};

const AdminTraining: React.FC = () => {
    // 관리자 UI는 요구사항에 따라 항상 한국어 고정
    const t = UI_TEXT.ko;
    const [sourceTextKo, setSourceTextKo] = useState('');
    const [trainingTitle, setTrainingTitle] = useState(buildDefaultTrainingTitle());
    const [trainingCategory, setTrainingCategory] = useState<'monthly_risk' | 'special_safety'>('monthly_risk');
    const [targetMode, setTargetMode] = useState<'submitted_only' | 'attendance_only'>('submitted_only');
    const [targetWorkerNamesText, setTargetWorkerNamesText] = useState('');
    const [savingTargets, setSavingTargets] = useState(false);
    const [importingTargetRoster, setImportingTargetRoster] = useState(false);
    const [recentSessionSearch, setRecentSessionSearch] = useState('');
    const [recentSessionCategoryFilter, setRecentSessionCategoryFilter] = useState<'all' | 'monthly_risk' | 'special_safety'>('all');
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
    const [isAudioUploadProcessing, setIsAudioUploadProcessing] = useState(false);
    const [isFlushingAudioStorage, setIsFlushingAudioStorage] = useState(false);
    const [selectedFlushSessionIds, setSelectedFlushSessionIds] = useState<Set<string>>(new Set());
    const [excludeCurrentSessionFromFlush, setExcludeCurrentSessionFromFlush] = useState(false);
    const [flushSummary, setFlushSummary] = useState<FlushSummary | null>(null);
    const [flushSummaryHistory, setFlushSummaryHistory] = useState<FlushSummary[]>([]);
    const [uploadWarningMessage, setUploadWarningMessage] = useState('');
    const [signatureRoster, setSignatureRoster] = useState<SignatureRosterRow[]>([]);
    const [rosterLoading, setRosterLoading] = useState(false);
    const [rosterError, setRosterError] = useState('');
    const [signatureModalUrl, setSignatureModalUrl] = useState('');
    const [isQrFullscreenOpen, setIsQrFullscreenOpen] = useState(false);
    const [deletingRosterRowId, setDeletingRosterRowId] = useState('');
    const [deletingAllRoster, setDeletingAllRoster] = useState(false);
    const rosterPollingRef = useRef<number | null>(null);
    const currentLoadedSession = recentSessions.find((session) => session.id === currentSessionId);
    const filteredRecentSessions = recentSessions.filter((session) => {
        const matchesCategory = recentSessionCategoryFilter === 'all'
            || session.training_category === recentSessionCategoryFilter;
        const keyword = recentSessionSearch.trim().toLowerCase();
        const haystack = [
            session.id,
            session.training_title,
            session.source_text_ko,
            session.original_script,
            getTrainingCategoryLabel(session.training_category),
            getTargetModeLabel(session.target_mode),
        ].join(' ').toLowerCase();

        return matchesCategory && (!keyword || haystack.includes(keyword));
    });

    const appendLinkHistory = (item: LinkHistoryItem) => {
        setLinkHistory((prev) => {
            const next = [item, ...prev].slice(0, 30);
            localStorage.setItem(LINK_HISTORY_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const pushFlushSummary = (item: FlushSummary) => {
        setFlushSummary(item);
        setFlushSummaryHistory((prev) => {
            const next = [item, ...prev].slice(0, 3);
            localStorage.setItem(FLUSH_SUMMARY_HISTORY_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    useEffect(() => {
        if (!isQrFullscreenOpen) return;

        const onKeydown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsQrFullscreenOpen(false);
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKeydown);

        return () => {
            window.removeEventListener('keydown', onKeydown);
            document.body.style.overflow = originalOverflow;
        };
    }, [isQrFullscreenOpen]);

    const clearFlushSummaryHistory = () => {
        const ok = window.confirm('최근 비우기 이력을 초기화하시겠습니까?');
        if (!ok) return;
        setFlushSummary(null);
        setFlushSummaryHistory([]);
        localStorage.removeItem(FLUSH_SUMMARY_HISTORY_STORAGE_KEY);
        setMessage('최근 비우기 이력을 초기화했습니다.');
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

    const fetchSignatureRoster = useCallback(async (sessionId: string) => {
        if (!sessionId) return;
        setRosterLoading(true);
        setRosterError('');
        try {
            const { data, error } = await supabase
                .from('training_logs')
                .select('id, submitted_at, nationality, worker_name, signature_url, worker_id')
                .eq('session_id', sessionId)
                .order('submitted_at', { ascending: false })
                .limit(200);
            if (error) throw new Error(error.message);
            const rows = Array.isArray(data) ? data : [];
            const seen = new Set<string>();
            const deduped = rows.filter((row: any) => {
                const key = String(row?.worker_id || '').trim() || String(row?.worker_name || '').trim();
                if (!key) return true;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            setSignatureRoster(
                deduped.map((row: any) => ({
                    id: String(row.id ?? ''),
                    submitted_at: String(row.submitted_at ?? ''),
                    nationality: String(row.nationality ?? ''),
                    worker_name: String(row.worker_name ?? ''),
                    signature_url: String(row.signature_url ?? ''),
                }))
            );
        } catch (e: any) {
            setRosterError(e?.message || '명부 조회 실패');
        } finally {
            setRosterLoading(false);
        }
    }, []);

    const deleteRosterRow = useCallback(async (id: string) => {
        if (!window.confirm('이 기록을 삭제하시겠습니까?\n(테스트 기록 정리 용도)')) return;
        setDeletingRosterRowId(id);
        setRosterError('');
        try {
            const { error } = await supabase
                .from('training_logs')
                .delete()
                .eq('id', id);
            if (error) throw new Error(error.message);
            setSignatureRoster((prev) => prev.filter((r) => r.id !== id));
        } catch (e: any) {
            setRosterError(e?.message || '삭제 실패');
        } finally {
            setDeletingRosterRowId('');
        }
    }, []);

    const deleteAllRosterRows = useCallback(async (sessionId: string, count: number) => {
        if (!sessionId) return;
        const ok = window.confirm(`현재 세션의 서명 기록 ${count}건을 모두 삭제하시겠습니까?\n테스트 기록 정리 시에만 사용하세요.`);
        if (!ok) return;
        setDeletingAllRoster(true);
        setRosterError('');
        try {
            const { error } = await supabase
                .from('training_logs')
                .delete()
                .eq('session_id', sessionId);
            if (error) throw new Error(error.message);
            setSignatureRoster([]);
        } catch (e: any) {
            setRosterError(e?.message || '전체 삭제 실패');
        } finally {
            setDeletingAllRoster(false);
        }
    }, []);

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
                targetMode: data.targetMode === 'attendance_only' ? 'attendance_only' : 'submitted_only',
                submittedWorkers: Number(data.submittedWorkers || 0),
                targetedWorkers: Number(data.targetedWorkers || data.submittedWorkers || 0),
                confirmedWorkers: Number(data.confirmedWorkers || 0),
                unconfirmedWorkers: Number(data.unconfirmedWorkers || 0),
                excludedWorkers: Number(data.excludedWorkers || 0),
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
        const raw = localStorage.getItem(EXCLUDE_CURRENT_SESSION_FLUSH_TOGGLE_KEY);
        if (raw === null) return;
        setExcludeCurrentSessionFromFlush(raw === 'true');
    }, []);

    useEffect(() => {
        localStorage.setItem(EXCLUDE_CURRENT_SESSION_FLUSH_TOGGLE_KEY, excludeCurrentSessionFromFlush ? 'true' : 'false');
    }, [excludeCurrentSessionFromFlush]);

    useEffect(() => {
        const raw = localStorage.getItem(FLUSH_SELECTED_SESSIONS_STORAGE_KEY);
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                const normalized = parsed
                    .map((item: unknown) => String(item || '').trim())
                    .filter((item: string) => Boolean(item));
                if (normalized.length > 0) {
                    setSelectedFlushSessionIds(new Set(normalized));
                }
            }
        } catch {
            localStorage.removeItem(FLUSH_SELECTED_SESSIONS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        localStorage.setItem(
            FLUSH_SELECTED_SESSIONS_STORAGE_KEY,
            JSON.stringify(Array.from(selectedFlushSessionIds))
        );
    }, [selectedFlushSessionIds]);

    useEffect(() => {
        const raw = localStorage.getItem(FLUSH_SUMMARY_HISTORY_STORAGE_KEY);
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;

            const normalized = parsed
                .map((entry: any) => ({
                    mode: entry?.mode === 'sessions' ? 'sessions' : 'all',
                    targetSessionCount: Number(entry?.targetSessionCount || 0),
                    excludedSessionCount: Number(entry?.excludedSessionCount || 0),
                    scannedFileCount: Number(entry?.scannedFileCount || 0),
                    updatedSessionCount: Number(entry?.updatedSessionCount || 0),
                    removedFileCount: Number(entry?.removedFileCount || 0),
                    failedSessionCount: Number(entry?.failedSessionCount || 0),
                    runAt: String(entry?.runAt || ''),
                }))
                .filter((entry: FlushSummary) => entry.runAt)
                .slice(0, 3);

            setFlushSummaryHistory(normalized);
            if (normalized.length > 0) {
                setFlushSummary(normalized[0]);
            }
        } catch {
            localStorage.removeItem(FLUSH_SUMMARY_HISTORY_STORAGE_KEY);
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
                .select('id, source_text_ko, original_script, audio_urls, created_at, training_title, training_category, target_mode, target_worker_names')
                .order(column, { ascending: false })
                .limit(20);
        };

        const createdAtResult = await loadWithColumn('created_at');
        const fallbackResult = createdAtResult.error ? await loadWithColumn('id') : null;
        const rows = (fallbackResult?.data || createdAtResult.data || []) as TrainingSessionRow[];
        setRecentSessions(rows);
        return rows;
    };

    const syncCurrentSessionAudioState = (rows: TrainingSessionRow[]) => {
        if (!currentSessionId) return;
        const current = rows.find((session) => session.id === currentSessionId);
        if (!current) return;

        const nextAudioUrls = (current.audio_urls && typeof current.audio_urls === 'object')
            ? current.audio_urls
            : {};

        setUploadedAudioUrls(nextAudioUrls);
        setFailedLanguages(
            TRAINING_AUDIO_LANGUAGES
                .filter((lang) => !nextAudioUrls[lang.code])
                .map((lang) => lang.label)
        );
    };

    const hydrateSessionState = async (session: TrainingSessionRow, label: string) => {
        const signed = await requestSignedMobileUrl(String(session.id));
        setMobileUrl(signed.mobileUrl);
        setLinkExpiresAt(Number.isFinite(signed.linkExpiresAt) ? signed.linkExpiresAt : null);
        setCurrentSessionId(String(session.id));
        if (session.original_script || session.source_text_ko) {
            setSourceTextKo(session.original_script || session.source_text_ko || '');
        }
        setTrainingTitle(String(session.training_title || buildDefaultTrainingTitle()));
        setTrainingCategory(session.training_category === 'special_safety' ? 'special_safety' : 'monthly_risk');
        setTargetMode(session.target_mode === 'attendance_only' ? 'attendance_only' : 'submitted_only');
        setTargetWorkerNamesText(Array.isArray(session.target_worker_names) ? session.target_worker_names.join('\n') : '');

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
        void fetchSignatureRoster(currentSessionId);

        const awarenessTimerId = window.setInterval(() => {
            void fetchAwarenessStats(currentSessionId);
        }, 20000);

        rosterPollingRef.current = window.setInterval(() => {
            void fetchSignatureRoster(currentSessionId);
        }, 10000);

        return () => {
            window.clearInterval(awarenessTimerId);
            if (rosterPollingRef.current !== null) {
                window.clearInterval(rosterPollingRef.current);
                rosterPollingRef.current = null;
            }
        };
    }, [currentSessionId, fetchSignatureRoster]);

    useEffect(() => {
        setSelectedFlushSessionIds((prev) => {
            if (prev.size === 0) return prev;
            const validSessionIds = new Set(
                recentSessions
                    .filter((session) => !isSessionAudioFlushed(session))
                    .map((session) => session.id)
            );
            const next = new Set(Array.from(prev).filter((id) => validSessionIds.has(id)));
            return next.size === prev.size ? prev : next;
        });
    }, [recentSessions]);

    const handleCreate = async () => {
        setLoading(true);
        setIsAudioUploadProcessing(false);
        setMessage('');
        setUploadWarningMessage('');
        setMobileUrl('');
        setFlushSummary(null);

        try {
            const normalizedTargetWorkerNames = normalizeTargetWorkerNames(
                targetWorkerNamesText
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0)
            );

            const data = await postAdminJson<any>(
                '/api/admin/create-training',
                {
                    sourceTextKo,
                    selectedLanguages: TRAINING_AUDIO_LANGUAGE_CODES,
                    trainingTitle,
                    trainingCategory,
                    targetMode,
                    targetWorkerNames: normalizedTargetWorkerNames,
                },
                { fallbackMessage: '세션 생성 실패' }
            );

            const nextSessionId = String(data.sessionId || '');
            const nextAudioUrls: Record<string, string | null> = Object.fromEntries(
                TRAINING_AUDIO_LANGUAGE_CODES.map((code) => [code, null])
            ) as Record<string, string | null>;

            setIsAudioUploadProcessing(true);
            setMessage('오디오 업로드 중...');

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

                if (file.size > MAX_AUDIO_UPLOAD_BYTES) {
                    setIsAudioUploadProcessing(false);
                    setLoading(false);
                    alert(HARD_BLOCK_UPLOAD_MESSAGE);
                    throw new Error(HARD_BLOCK_UPLOAD_MESSAGE);
                }

                if (file.size > SOFT_WARNING_AUDIO_UPLOAD_BYTES && !uploadWarningMessage) {
                    setUploadWarningMessage(SOFT_WARNING_UPLOAD_MESSAGE);
                }

                const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const filePath = `${nextSessionId}/${language.code}-${safeFileName}`;

                const uploadRes = await supabase.storage
                    .from('training_audio')
                    .upload(filePath, file, {
                        contentType: file.type || 'audio/mpeg',
                        upsert: true,
                    });

                if (uploadRes.error) {
                    throw new Error(`${language.label} 업로드 실패: ${uploadRes.error.message}`);
                }

                const publicUrl = supabase.storage
                    .from('training_audio')
                    .getPublicUrl(filePath)
                    .data
                    .publicUrl;

                nextAudioUrls[language.code] = `${publicUrl}?v=${Date.now()}`;
            }

            const syncData = await postAdminJson<{ audioUrls?: Record<string, string | null> }>(
                '/api/admin/update-training-audio',
                {
                    sessionId: nextSessionId,
                    audioUrls: nextAudioUrls,
                    originalScript: sourceTextKo,
                },
                { fallbackMessage: 'MP3/M4A 업로드 저장 실패' }
            );
            const resolvedAudioUrls = (syncData.audioUrls && typeof syncData.audioUrls === 'object')
                ? syncData.audioUrls as Record<string, string | null>
                : nextAudioUrls;

            setMobileUrl(data.mobileUrl || '');
            setCurrentSessionId(nextSessionId);
            setLinkExpiresAt(Number.isFinite(Number(data.linkExpiresAt)) ? Number(data.linkExpiresAt) : null);
            setUploadedAudioUrls(resolvedAudioUrls);
            setFailedLanguages(TRAINING_AUDIO_LANGUAGES.filter((lang) => !resolvedAudioUrls[lang.code]).map((lang) => lang.label));
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
            setIsAudioUploadProcessing(false);
            setLoading(false);
            setMessage(`오류: ${error?.message || '알 수 없는 오류'}`);
        } finally {
            setIsAudioUploadProcessing(false);
            setLoading(false);
        }
    };

    const handleSaveSessionTargets = async () => {
        if (!currentSessionId) {
            setMessage('현재 세션이 없습니다. 먼저 세션을 생성하거나 불러와 주세요.');
            return;
        }

        setSavingTargets(true);
        try {
            const normalizedTargetWorkerNames = normalizeTargetWorkerNames(
                targetWorkerNamesText
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter((item) => item.length > 0)
            );

            await postAdminJson<any>(
                '/api/admin/update-training-targets',
                {
                    sessionId: currentSessionId,
                    trainingTitle,
                    trainingCategory,
                    targetMode,
                    targetWorkerNames: normalizedTargetWorkerNames,
                },
                { fallbackMessage: '세션 대상자 설정 저장 실패' }
            );

            await fetchRecentSessions();
            await fetchAwarenessStats(currentSessionId);
            setMessage('세션 대상자/교육명을 저장했습니다. 통계를 갱신했습니다.');
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '세션 대상자 설정 저장 실패'}`);
        } finally {
            setSavingTargets(false);
        }
    };

    const handleImportTargetRosterFile = async (file: File | null) => {
        if (!file) return;

        setImportingTargetRoster(true);
        try {
            const raw = await file.text();
            const names = parseAttendanceRosterText(raw);
            if (names.length === 0) {
                throw new Error('파일에서 이름을 찾지 못했습니다. 첫 번째 열에 이름이 있는 CSV/TXT 파일을 사용해 주세요.');
            }

            setTargetWorkerNamesText(names.join('\n'));
            setTargetMode('attendance_only');
            setMessage(`출근자 명단 ${names.length}명을 불러왔습니다. 저장 버튼을 눌러 현재 세션에 반영하세요.`);
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '출근자 명단 파일 불러오기 실패'}`);
        } finally {
            setImportingTargetRoster(false);
        }
    };

    const handleDownloadSignatureRosterCsv = () => {
        if (!currentSessionId || signatureRoster.length === 0) {
            setMessage('다운로드할 서명 명부가 없습니다.');
            return;
        }

        const trainingTitleForFile = (currentLoadedSession?.training_title || buildDefaultTrainingTitle())
            .replace(/[\\/:*?"<>|]/g, '_');
        const rows = [
            [
                '교육명',
                '교육유형',
                '모수기준',
                '세션ID',
                '제출시간',
                '국적',
                '이름',
                '서명URL',
            ],
            ...signatureRoster.map((row) => ([
                currentLoadedSession?.training_title || buildDefaultTrainingTitle(),
                getTrainingCategoryLabel(currentLoadedSession?.training_category),
                getTargetModeLabel(currentLoadedSession?.target_mode),
                currentSessionId,
                row.submitted_at ? new Date(row.submitted_at).toLocaleString('ko-KR') : '',
                row.nationality || '',
                row.worker_name || '',
                row.signature_url || '',
            ])),
        ];

        const csv = rows
            .map((line) => line.map((cell) => escapeCsvCell(cell)).join(','))
            .join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${trainingTitleForFile}_서명완료명부.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setMessage('서명 완료 명부 CSV를 다운로드했습니다.');
    };

    const handlePrintSignatureRoster = () => {
        if (!currentSessionId || signatureRoster.length === 0) {
            setMessage('출력할 서명 명부가 없습니다.');
            return;
        }

        const trainingTitleValue = currentLoadedSession?.training_title || buildDefaultTrainingTitle();
        const trainingCategoryLabel = getTrainingCategoryLabel(currentLoadedSession?.training_category);
        const targetModeLabel = getTargetModeLabel(currentLoadedSession?.target_mode);
        const createdAtLabel = formatSessionCreatedAt(currentLoadedSession?.created_at);

        const tableRows = signatureRoster.map((row, index) => `
            <tr>
                <td>${signatureRoster.length - index}</td>
                <td>${row.submitted_at ? new Date(row.submitted_at).toLocaleString('ko-KR') : '-'}</td>
                <td>${String(row.nationality || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                <td>${String(row.worker_name || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</td>
                <td>${row.signature_url ? `<img src="${row.signature_url}" alt="signature" style="height:48px;max-width:140px;object-fit:contain;" />` : '-'}</td>
            </tr>
        `).join('');

        const printWindow = window.open('', '_blank', 'width=1100,height=900');
        if (!printWindow) {
            setMessage('인쇄 창을 열 수 없습니다. 브라우저 팝업 차단을 해제해 주세요.');
            return;
        }

        printWindow.document.write(`
            <!doctype html>
            <html lang="ko">
            <head>
                <meta charset="utf-8" />
                <title>${trainingTitleValue} - 서명 완료 명부</title>
                <style>
                    body { font-family: Arial, 'Malgun Gothic', sans-serif; margin: 24px; color: #111827; }
                    h1 { margin: 0 0 8px; font-size: 24px; }
                    .meta { margin-bottom: 16px; font-size: 12px; line-height: 1.8; }
                    .badge { display: inline-block; margin-right: 6px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 999px; background: #f8fafc; font-weight: 700; }
                    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
                    th, td { border: 1px solid #cbd5e1; padding: 8px; font-size: 12px; vertical-align: middle; }
                    th { background: #f8fafc; text-align: left; }
                    .footer { margin-top: 12px; font-size: 11px; color: #475569; }
                    @media print {
                        body { margin: 12mm; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <h1>위험성평가 서명 완료 명부</h1>
                <div class="meta">
                    <div><span class="badge">${trainingCategoryLabel}</span><span class="badge">${targetModeLabel}</span></div>
                    <div><strong>교육명:</strong> ${String(trainingTitleValue).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    <div><strong>세션 ID:</strong> ${currentSessionId}</div>
                    <div><strong>세션 생성:</strong> ${createdAtLabel}</div>
                    <div><strong>출력 시각:</strong> ${new Date().toLocaleString('ko-KR')}</div>
                    <div><strong>총 인원:</strong> ${signatureRoster.length}명</div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th>순번</th>
                            <th>제출시간</th>
                            <th>국적</th>
                            <th>이름</th>
                            <th>서명</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
                <div class="footer">본 출력물은 PSI 관리자 화면에서 생성된 QR 전자서명 제출 증적입니다.</div>
                <script>
                    window.onload = function () {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
        setMessage('인쇄용 명부 창을 열었습니다. PDF 저장 또는 인쇄를 진행해 주세요.');
    };

    const handleDownloadUnsubmittedRosterCsv = () => {
        if (!currentSessionId) {
            setMessage('현재 세션이 없습니다.');
            return;
        }

        if (currentLoadedSession?.target_mode !== 'attendance_only') {
            setMessage('미이수자 명단은 당일 출근자 기준 세션에서만 계산할 수 있습니다.');
            return;
        }

        const targetNames = Array.isArray(currentLoadedSession?.target_worker_names)
            ? normalizeTargetWorkerNames(currentLoadedSession.target_worker_names)
            : [];

        if (targetNames.length === 0) {
            setMessage('저장된 당일 출근자 명단이 없습니다.');
            return;
        }

        const submittedNameSet = new Set(
            signatureRoster
                .map((row) => String(row.worker_name || '').trim().toLowerCase())
                .filter(Boolean)
        );

        const unsubmittedNames = targetNames.filter((name) => !submittedNameSet.has(name.toLowerCase()));
        if (unsubmittedNames.length === 0) {
            setMessage('미이수자가 없습니다.');
            return;
        }

        const trainingTitleForFile = (currentLoadedSession?.training_title || buildDefaultTrainingTitle())
            .replace(/[\\/:*?"<>|]/g, '_');

        const rows = [
            ['교육명', '교육유형', '모수기준', '세션ID', '미이수자명'],
            ...unsubmittedNames.map((name) => ([
                currentLoadedSession?.training_title || buildDefaultTrainingTitle(),
                getTrainingCategoryLabel(currentLoadedSession?.training_category),
                getTargetModeLabel(currentLoadedSession?.target_mode),
                currentSessionId,
                name,
            ])),
        ];

        const csv = rows
            .map((line) => line.map((cell) => escapeCsvCell(cell)).join(','))
            .join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${trainingTitleForFile}_미이수자명부.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
        setMessage(`미이수자 명단 CSV를 다운로드했습니다. (${unsubmittedNames.length}명)`);
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

    const toggleFlushSession = (sessionId: string) => {
        setSelectedFlushSessionIds((prev) => {
            const next = new Set(prev);
            if (next.has(sessionId)) {
                next.delete(sessionId);
            } else {
                next.add(sessionId);
            }
            return next;
        });
    };

    const handleFlushAudioStorage = async () => {
        const ok = window.confirm(
            (currentSessionId && excludeCurrentSessionFromFlush)
                ? '과거 교육 세션의 음성 파일이 삭제되어 용량이 확보됩니다. (현재 로드 세션은 제외, 텍스트 대본은 유지) 진행하시겠습니까?'
                : '과거 교육 세션의 모든 음성 파일이 삭제되어 용량이 확보됩니다. (텍스트 대본은 유지됨) 진행하시겠습니까?'
        );
        if (!ok) return;

        setIsFlushingAudioStorage(true);
        setMessage('과거 음성 데이터 일괄 비우기 실행 중...');

        try {
            const response = await postAdminJson<{ data?: {
                targetSessionCount?: number;
                excludedSessionCount?: number;
                scannedFileCount?: number;
                updatedSessionCount?: number;
                removedFileCount?: number;
                failedSessionCount?: number;
            } }>(
                '/api/admin/safety-management',
                {
                    action: 'flush-audio-storage',
                    payload: {
                        mode: 'all',
                        excludeSessionIds: (currentSessionId && excludeCurrentSessionFromFlush) ? [currentSessionId] : [],
                    },
                },
                { fallbackMessage: '과거 음성 데이터 비우기 실패' }
            );

            const result = response?.data || {};
            setAudioFiles({});
            setFailedLanguageAttempts({});
            setSelectedFlushSessionIds(new Set());
            pushFlushSummary({
                mode: 'all',
                targetSessionCount: Number(result.targetSessionCount || 0),
                excludedSessionCount: Number(result.excludedSessionCount || 0),
                scannedFileCount: Number(result.scannedFileCount || 0),
                updatedSessionCount: Number(result.updatedSessionCount || 0),
                removedFileCount: Number(result.removedFileCount || 0),
                failedSessionCount: Number(result.failedSessionCount || 0),
                runAt: new Date().toISOString(),
            });

            const refreshedRows = await fetchRecentSessions();
            syncCurrentSessionAudioState(refreshedRows);

            setMessage(
                `과거 음성 데이터 일괄 비우기 완료: 세션 ${Number(result.targetSessionCount || 0)}건 대상, ` +
                `제외 ${Number(result.excludedSessionCount || 0)}건, ` +
                `스캔 ${Number(result.scannedFileCount || 0)}개, ` +
                `오디오 파일 ${Number(result.removedFileCount || 0)}개 삭제, ` +
                `audio_urls ${Number(result.updatedSessionCount || 0)}건 초기화` +
                (Number(result.failedSessionCount || 0) > 0 ? `, 일부 세션 실패 ${Number(result.failedSessionCount || 0)}건` : '')
            );
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '과거 음성 데이터 비우기 실패'}`);
        } finally {
            setIsFlushingAudioStorage(false);
        }
    };

    const handleFlushSelectedSessions = async () => {
        const sessionIds = Array.from(selectedFlushSessionIds).filter(
            (id) => !(excludeCurrentSessionFromFlush && id === currentSessionId)
        );
        if (sessionIds.length === 0) {
            alert((currentSessionId && excludeCurrentSessionFromFlush)
                ? '현재 로드된 세션을 제외하고 비우기 대상 세션을 1개 이상 선택해 주세요.'
                : '비우기 대상 세션을 1개 이상 선택해 주세요.');
            return;
        }

        const ok = window.confirm(`선택한 ${sessionIds.length}개 세션의 음성 파일만 삭제합니다. (텍스트 대본은 유지됨) 진행하시겠습니까?`);
        if (!ok) return;

        setIsFlushingAudioStorage(true);
        setMessage('선택 세션 음성 데이터 비우기 실행 중...');

        try {
            const response = await postAdminJson<{ data?: {
                targetSessionCount?: number;
                excludedSessionCount?: number;
                scannedFileCount?: number;
                updatedSessionCount?: number;
                removedFileCount?: number;
                failedSessionCount?: number;
            } }>(
                '/api/admin/safety-management',
                {
                    action: 'flush-audio-storage',
                    payload: {
                        mode: 'sessions',
                        sessionIds,
                    },
                },
                { fallbackMessage: '선택 세션 음성 데이터 비우기 실패' }
            );

            const result = response?.data || {};
            if (currentSessionId && sessionIds.includes(currentSessionId)) {
                setAudioFiles({});
                setFailedLanguageAttempts({});
            }

            const refreshedRows = await fetchRecentSessions();
            syncCurrentSessionAudioState(refreshedRows);
            setSelectedFlushSessionIds(new Set());
            pushFlushSummary({
                mode: 'sessions',
                targetSessionCount: Number(result.targetSessionCount || 0),
                excludedSessionCount: Number(result.excludedSessionCount || 0),
                scannedFileCount: Number(result.scannedFileCount || 0),
                updatedSessionCount: Number(result.updatedSessionCount || 0),
                removedFileCount: Number(result.removedFileCount || 0),
                failedSessionCount: Number(result.failedSessionCount || 0),
                runAt: new Date().toISOString(),
            });

            setMessage(
                `선택 세션 음성 비우기 완료: 세션 ${Number(result.targetSessionCount || 0)}건 대상, ` +
                `제외 ${Number(result.excludedSessionCount || 0)}건, ` +
                `스캔 ${Number(result.scannedFileCount || 0)}개, ` +
                `오디오 파일 ${Number(result.removedFileCount || 0)}개 삭제, ` +
                `audio_urls ${Number(result.updatedSessionCount || 0)}건 초기화` +
                (Number(result.failedSessionCount || 0) > 0 ? `, 일부 세션 실패 ${Number(result.failedSessionCount || 0)}건` : '')
            );
        } catch (error: any) {
            setMessage(`오류: ${error?.message || '선택 세션 음성 데이터 비우기 실패'}`);
        } finally {
            setIsFlushingAudioStorage(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h2 className="text-2xl font-black text-slate-900">관리자 다국어 음성 안내 생성</h2>
                <p className="text-sm font-bold text-slate-500 mt-2">관리자 화면은 항상 한국어로 고정됩니다. 한국어 원본 대본을 입력하고 11개국 MP3/M4A 파일을 업로드한 뒤 QR 링크를 배포하세요.</p>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-600">교육명(월별/특별)</p>
                        <input
                            value={trainingTitle}
                            onChange={(e) => setTrainingTitle(e.target.value)}
                            placeholder="예: 4월 위험성평가 전파교육"
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                        />
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-xs font-black text-slate-600">교육 유형</p>
                        <select
                            value={trainingCategory}
                            onChange={(e) => setTrainingCategory(e.target.value === 'special_safety' ? 'special_safety' : 'monthly_risk')}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                        >
                            <option value="monthly_risk">월별 위험성평가 전파교육</option>
                            <option value="special_safety">특별안전보건교육</option>
                        </select>
                    </div>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-600">이수 모수 산정 방식</p>
                    <select
                        value={targetMode}
                        onChange={(e) => setTargetMode(e.target.value === 'attendance_only' ? 'attendance_only' : 'submitted_only')}
                        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
                    >
                        <option value="submitted_only">제출자 기준(기본) - 미출근자는 자동 제외</option>
                        <option value="attendance_only">당일 출근자 명단 기준 - 명단 내 인원만 모수</option>
                    </select>
                    <p className="mt-2 text-[11px] font-bold text-slate-500">
                        건설업 특성상 당일 미출근자를 미이수로 잡지 않으려면 기본값(제출자 기준)을 사용하세요.
                    </p>
                </div>

                {targetMode === 'attendance_only' && (
                    <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <p className="text-xs font-black text-indigo-800">당일 출근자 명단 (줄바꿈으로 입력)</p>
                        <p className="mt-1 text-[11px] font-bold text-indigo-700">예: 홍길동↵김민수↵Sokha Chan</p>
                        <div className="mt-2 rounded-lg border border-indigo-200 bg-white px-3 py-3">
                            <p className="text-[11px] font-black text-indigo-800">CSV/TXT 업로드</p>
                            <p className="mt-1 text-[10px] font-bold text-indigo-600">첫 번째 열을 이름으로 읽습니다. 헤더가 있으면 자동 제외합니다.</p>
                            <input
                                type="file"
                                accept=".csv,.txt,text/csv,text/plain"
                                disabled={importingTargetRoster}
                                onChange={(e) => {
                                    void handleImportTargetRosterFile(e.target.files?.[0] || null);
                                    e.currentTarget.value = '';
                                }}
                                className="mt-2 block w-full text-xs font-bold text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-xs file:font-black file:text-white hover:file:bg-indigo-700 disabled:opacity-60"
                            />
                            {importingTargetRoster && (
                                <p className="mt-2 text-[11px] font-black text-indigo-700">명단 파일 불러오는 중...</p>
                            )}
                        </div>
                        <textarea
                            value={targetWorkerNamesText}
                            onChange={(e) => setTargetWorkerNamesText(e.target.value)}
                            rows={4}
                            placeholder="당일 실제 출근자만 입력"
                            className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-3 text-sm font-bold text-slate-800"
                        />
                        <p className="mt-2 text-[11px] font-bold text-indigo-700">
                            현재 인원: {normalizeTargetWorkerNames(targetWorkerNamesText.split(/\r?\n/)).length}명
                        </p>
                    </div>
                )}
                {uploadWarningMessage && (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                        <p className="text-xs font-black text-amber-800">{uploadWarningMessage}</p>
                    </div>
                )}
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
                    {loading
                        ? (isAudioUploadProcessing ? '오디오 업로드 중...' : '생성 중...')
                        : '생성'}
                </button>

                <button
                    type="button"
                    onClick={handleSaveSessionTargets}
                    disabled={!currentSessionId || savingTargets || loading}
                    className="mt-3 ml-2 px-6 py-3 rounded-xl bg-slate-700 text-white font-black text-sm hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {savingTargets ? '대상자 저장 중...' : '현재 세션 대상자/교육명 저장'}
                </button>

                <button
                    type="button"
                    onClick={handleFlushAudioStorage}
                    disabled={loading || isFlushingAudioStorage}
                    className="mt-3 px-6 py-3 rounded-xl bg-rose-600 text-white font-black text-sm hover:bg-rose-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {isFlushingAudioStorage
                        ? '과거 음성 데이터 일괄 비우기 실행 중...'
                        : '과거 음성 데이터 일괄 비우기 (용량 확보)'}
                </button>

                <label className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                    <input
                        type="checkbox"
                        checked={excludeCurrentSessionFromFlush}
                        onChange={(e) => setExcludeCurrentSessionFromFlush(e.target.checked)}
                        className="h-3.5 w-3.5 accent-indigo-600"
                    />
                    현재 로드 세션 제외 유지 (기본 OFF)
                </label>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-black text-slate-700">선택 세션만 비우기</p>
                    {recentSessions.length === 0 ? (
                        <p className="mt-2 text-[11px] font-bold text-slate-500">선택 가능한 최근 세션이 없습니다.</p>
                    ) : (
                        <div className="mt-2 space-y-2">
                            {recentSessions.map((session) => {
                                const checked = selectedFlushSessionIds.has(session.id);
                                const isCurrentSession = session.id === currentSessionId;
                                const isFlushedSession = isSessionAudioFlushed(session);
                                const shouldDisableCurrentSession = isCurrentSession && excludeCurrentSessionFromFlush;
                                const shouldDisableSelection = shouldDisableCurrentSession || isFlushedSession;
                                return (
                                    <label
                                        key={session.id}
                                        className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] font-bold ${shouldDisableSelection ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${checked ? 'border-rose-300 bg-rose-50 text-rose-700' : isFlushedSession ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-slate-200 bg-white text-slate-600'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked && !shouldDisableSelection}
                                            disabled={shouldDisableSelection}
                                            onChange={() => toggleFlushSession(session.id)}
                                            className="h-3.5 w-3.5 accent-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <span className="min-w-0">
                                            <span className="block truncate">
                                                {session.id}
                                                {isFlushedSession && (
                                                    <span className="ml-2 inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-1.5 py-0.5 text-[10px] font-black text-slate-600">
                                                        음성 비워짐
                                                    </span>
                                                )}
                                                {isCurrentSession && (
                                                    <span className="ml-2 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">
                                                        현재 로드됨
                                                    </span>
                                                )}
                                            </span>
                                            <span className="mt-1 flex flex-wrap items-center gap-1">
                                                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-black text-indigo-700">
                                                    {getTrainingCategoryLabel(session.training_category)}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-700">
                                                    {getTargetModeLabel(session.target_mode)}
                                                </span>
                                                {session.training_title && (
                                                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-700 max-w-full truncate">
                                                        {session.training_title}
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block text-[10px] font-semibold text-slate-500">
                                                생성: {formatSessionCreatedAt(session.created_at)}
                                                {isFlushedSession ? ' · 용량 0MB 상태' : ''}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleFlushSelectedSessions}
                        disabled={loading || isFlushingAudioStorage || selectedFlushSessionIds.size === 0}
                        className="mt-3 px-4 py-2 rounded-lg bg-rose-500 text-white font-black text-xs hover:bg-rose-600 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isFlushingAudioStorage
                            ? '선택 세션 비우기 실행 중...'
                            : `선택 세션만 비우기 (${selectedFlushSessionIds.size})`}
                    </button>
                </div>

                {loading && isAudioUploadProcessing && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
                        <span className="text-xs font-black text-indigo-700">오디오 업로드 중...</span>
                    </div>
                )}

                {isFlushingAudioStorage && (
                    <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-300 border-t-rose-600" />
                        <span className="text-xs font-black text-rose-700">과거 음성 데이터 일괄 비우기 실행 중...</span>
                    </div>
                )}

                {flushSummary && (
                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                        <p className="text-xs font-black text-emerald-800">
                            비우기 완료 요약 ({flushSummary.mode === 'all' ? '전체' : '선택 세션'})
                        </p>
                        <p className="mt-1 text-[10px] font-bold text-emerald-700">
                            실행 시각: {formatSessionCreatedAt(flushSummary.runAt)}
                        </p>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-emerald-700">대상 세션</p>
                                <p className="text-sm font-black text-emerald-900">{flushSummary.targetSessionCount}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-emerald-700">초기화 세션</p>
                                <p className="text-sm font-black text-emerald-900">{flushSummary.updatedSessionCount}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-emerald-700">삭제 파일</p>
                                <p className="text-sm font-black text-emerald-900">{flushSummary.removedFileCount}</p>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white px-2 py-2">
                                <p className="text-[10px] font-black text-emerald-700">실패 세션</p>
                                <p className="text-sm font-black text-emerald-900">{flushSummary.failedSessionCount}</p>
                            </div>
                        </div>

                        <p className="mt-2 text-[10px] font-bold text-emerald-700">
                            제외 세션: {flushSummary.excludedSessionCount}건 · 스캔 파일: {flushSummary.scannedFileCount}개
                        </p>

                        {flushSummaryHistory.length > 0 && (
                            <div className="mt-3 rounded-lg border border-emerald-200 bg-white p-2">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-[10px] font-black text-emerald-700">최근 비우기 이력 (최대 3회)</p>
                                    <button
                                        type="button"
                                        onClick={clearFlushSummaryHistory}
                                        className="inline-flex items-center rounded-md border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-black text-emerald-700 hover:bg-emerald-50"
                                    >
                                        이력 초기화
                                    </button>
                                </div>
                                <div className="mt-1 space-y-1">
                                    {flushSummaryHistory.map((entry, index) => (
                                        <p key={`${entry.runAt}-${index}`} className="text-[10px] font-bold text-slate-700">
                                            {index + 1}. {formatSessionCreatedAt(entry.runAt)} · {entry.mode === 'all' ? '전체' : '선택'} · 파일 {entry.removedFileCount}개 · 세션 {entry.updatedSessionCount}건
                                        </p>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {message && <p className="mt-4 text-sm font-bold text-slate-700">{message}</p>}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">{t.awarenessTitle}</h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">{t.awarenessSubtitle}</p>
                    </div>
                    {currentLoadedSession?.target_mode === 'attendance_only' && (
                        <button
                            type="button"
                            onClick={handleDownloadUnsubmittedRosterCsv}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700 hover:bg-amber-100"
                        >
                            미이수자 CSV
                        </button>
                    )}
                </div>
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
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">{t.statSubmitted}</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{awarenessStats.submittedWorkers}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50">
                            <p className="text-[11px] font-black text-indigo-700">모수(평가 대상)</p>
                            <p className="mt-1 text-xl font-black text-indigo-800">{awarenessStats.targetedWorkers}</p>
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
                            <p className="text-[11px] font-black text-slate-500">모수 제외 인원</p>
                            <p className="mt-1 text-xl font-black text-slate-900">{awarenessStats.excludedWorkers}</p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">{t.statDataSource}</p>
                            <p className="mt-1 text-[12px] font-black text-slate-900">
                                {awarenessStats.ackDataSource === 'training_acknowledgements'
                                    ? t.statSourceAckTable
                                    : t.statSourceSubmissionGate}
                            </p>
                        </div>
                        <div className="p-3 rounded-xl border border-slate-200 bg-slate-50">
                            <p className="text-[11px] font-black text-slate-500">모수 기준</p>
                            <p className="mt-1 text-[12px] font-black text-slate-900">
                                {awarenessStats.targetMode === 'attendance_only'
                                    ? '당일 출근자 명단 기준'
                                    : '제출자 기준(미출근 자동 제외)'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="mt-3 text-sm font-bold text-slate-500">{t.recentEmpty}</p>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">최근 세션 관리</h3>
                        <p className="mt-1 text-xs font-bold text-slate-500">교육명, 교육유형, 세션ID로 검색하고 바로 불러오기/삭제할 수 있습니다.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void fetchRecentSessions()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50"
                    >
                        목록 새로고침
                    </button>
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_220px] gap-3">
                    <input
                        value={recentSessionSearch}
                        onChange={(e) => setRecentSessionSearch(e.target.value)}
                        placeholder="교육명, 세션ID, 유형으로 검색"
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
                    />
                    <select
                        value={recentSessionCategoryFilter}
                        onChange={(e) => setRecentSessionCategoryFilter((e.target.value as 'all' | 'monthly_risk' | 'special_safety') || 'all')}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
                    >
                        <option value="all">전체 유형</option>
                        <option value="monthly_risk">월별 위험성평가</option>
                        <option value="special_safety">특별안전보건교육</option>
                    </select>
                </div>

                {filteredRecentSessions.length === 0 ? (
                    <p className="mt-4 text-sm font-bold text-slate-500">검색 조건에 맞는 최근 세션이 없습니다.</p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {filteredRecentSessions.map((session) => {
                            const isCurrent = session.id === currentSessionId;
                            return (
                                <div key={session.id} className={`rounded-xl border p-4 ${isCurrent ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-slate-50/60'}`}>
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-black text-slate-900 break-all">{session.training_title || buildDefaultTrainingTitle()}</p>
                                                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-black text-indigo-700">
                                                    {getTrainingCategoryLabel(session.training_category)}
                                                </span>
                                                <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                                                    {getTargetModeLabel(session.target_mode)}
                                                </span>
                                                {isCurrent && (
                                                    <span className="inline-flex items-center rounded-full border border-fuchsia-200 bg-fuchsia-50 px-2 py-0.5 text-[10px] font-black text-fuchsia-700">
                                                        현재 로드됨
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 text-[11px] font-bold text-slate-500 break-all">세션ID: {session.id}</p>
                                            <p className="mt-1 text-[11px] font-bold text-slate-500">생성: {formatSessionCreatedAt(session.created_at)}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void hydrateSessionState(session, t.recentLoaded)}
                                                className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"
                                            >
                                                {t.recentLoad}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDeleteSession(session.id)}
                                                disabled={deletingSessionId === session.id}
                                                className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                            >
                                                {deletingSessionId === session.id ? t.deleting : t.delete}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 위험성평가 서명 완료 명부 */}
            {currentSessionId && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">위험성평가 서명 완료 명부</h3>
                            <p className="mt-1 text-xs font-bold text-slate-500">현재 세션에 제출된 서명 목록 · 10초마다 자동 갱신</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {signatureRoster.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handlePrintSignatureRoster}
                                    disabled={rosterLoading || deletingAllRoster}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
                                >
                                    인쇄/PDF
                                </button>
                            )}
                            {signatureRoster.length > 0 && (
                                <button
                                    type="button"
                                    onClick={handleDownloadSignatureRosterCsv}
                                    disabled={rosterLoading || deletingAllRoster}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                    CSV 다운로드
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => void fetchSignatureRoster(currentSessionId)}
                                disabled={rosterLoading || deletingAllRoster}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                                {rosterLoading ? '불러오는 중...' : '새로고침'}
                            </button>
                            {signatureRoster.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => void deleteAllRosterRows(currentSessionId, signatureRoster.length)}
                                    disabled={deletingAllRoster || rosterLoading}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                                >
                                    {deletingAllRoster ? '삭제 중...' : `전체 삭제 (${signatureRoster.length}건)`}
                                </button>
                            )}
                        </div>
                    </div>

                    {rosterError && (
                        <p className="mt-3 text-sm font-bold text-rose-700">오류: {rosterError}</p>
                    )}

                    {!rosterError && signatureRoster.length === 0 && !rosterLoading && (
                        <p className="mt-3 text-sm font-bold text-slate-400">아직 제출된 서명이 없습니다.</p>
                    )}

                    {signatureRoster.length > 0 && (
                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50">
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">순번</th>
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">제출 시간</th>
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">국적</th>
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">이름</th>
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">서명 확인</th>
                                        <th className="px-3 py-2 text-left text-[11px] font-black text-slate-500 whitespace-nowrap">삭제</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {signatureRoster.map((row, index) => (
                                        <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                                            <td className="px-3 py-2 text-xs font-bold text-slate-500 whitespace-nowrap">
                                                {signatureRoster.length - index}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-bold text-slate-700 whitespace-nowrap">
                                                {row.submitted_at
                                                    ? new Date(row.submitted_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                                                    : '-'}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-bold text-slate-700 whitespace-nowrap">
                                                {row.nationality || '-'}
                                            </td>
                                            <td className="px-3 py-2 text-xs font-black text-slate-900 whitespace-nowrap">
                                                {row.worker_name || '-'}
                                            </td>
                                            <td className="px-3 py-2">
                                                {row.signature_url ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setSignatureModalUrl(row.signature_url)}
                                                        className="block rounded border border-slate-200 bg-white hover:border-indigo-300 overflow-hidden"
                                                        title="클릭하면 원본 서명을 크게 볼 수 있습니다"
                                                    >
                                                        <img
                                                            src={row.signature_url}
                                                            alt={`${row.worker_name} 서명`}
                                                            style={{ height: 40, maxWidth: 120, objectFit: 'contain', display: 'block' }}
                                                        />
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] font-bold text-slate-400">–</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => void deleteRosterRow(row.id)}
                                                    disabled={deletingRosterRowId === row.id || deletingAllRoster}
                                                    className="rounded px-2 py-1 text-[11px] font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                                                    title="이 기록 삭제"
                                                >
                                                    {deletingRosterRowId === row.id ? '…' : '삭제'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <p className="mt-2 text-[11px] font-bold text-slate-400 text-right">총 {signatureRoster.length}명</p>
                </div>
            )}

            {/* 서명 원본 팝업 Modal */}
            {signatureModalUrl && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    onClick={() => setSignatureModalUrl('')}
                >
                    <div
                        className="relative bg-white rounded-2xl shadow-2xl p-5 max-w-lg w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-black text-slate-900">서명 원본</p>
                            <button
                                type="button"
                                onClick={() => setSignatureModalUrl('')}
                                className="text-slate-400 hover:text-slate-700 text-lg font-black leading-none"
                            >
                                ✕
                            </button>
                        </div>
                        <img
                            src={signatureModalUrl}
                            alt="서명 원본"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50"
                            style={{ maxHeight: '70vh', objectFit: 'contain' }}
                        />
                        <p className="mt-3 text-[11px] font-bold text-slate-400 break-all">{signatureModalUrl}</p>
                    </div>
                </div>
            )}

            {isQrFullscreenOpen && mobileUrl && (
                <div
                    className="fixed inset-0 z-[60] bg-black"
                    onClick={() => setIsQrFullscreenOpen(false)}
                >
                    <div
                        className="h-full w-full flex flex-col items-center justify-center px-6 py-8"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="w-full max-w-6xl flex items-start justify-between gap-4 mb-6">
                            <div className="min-w-0">
                                <p className="text-white text-2xl sm:text-3xl font-black leading-tight">
                                    근로자 접속 QR
                                </p>
                                {currentLoadedSession && (
                                    <p className="text-slate-200 text-sm sm:text-base font-bold mt-2 truncate">
                                        {currentLoadedSession.training_title || buildDefaultTrainingTitle()}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsQrFullscreenOpen(false)}
                                className="rounded-lg border border-white/40 px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                                title="풀스크린 닫기 (ESC)"
                            >
                                닫기 (ESC)
                            </button>
                        </div>

                        <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-2xl">
                            <QRCodeSVG
                                value={mobileUrl}
                                size={1024}
                                includeMargin
                                style={{ width: 'min(72vmin, 900px)', height: 'min(72vmin, 900px)', display: 'block' }}
                            />
                        </div>

                        <p className="mt-6 text-slate-300 text-xs sm:text-sm font-bold break-all text-center max-w-6xl">
                            {mobileUrl}
                        </p>
                    </div>
                </div>
            )}

            {mobileUrl && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900">근로자 접속 QR</h3>
                    {currentLoadedSession && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-700">
                                {getTrainingCategoryLabel(currentLoadedSession.training_category)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700">
                                {getTargetModeLabel(currentLoadedSession.target_mode)}
                            </span>
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-700">
                                {currentLoadedSession.training_title || buildDefaultTrainingTitle()}
                            </span>
                        </div>
                    )}
                    <p className="text-xs font-bold text-slate-500 mt-2 break-all">{mobileUrl}</p>
                    <div className="mt-4">
                        <QRCodeCanvas value={mobileUrl} size={220} />
                    </div>
                    <div className="mt-4">
                        <button
                            type="button"
                            onClick={() => setIsQrFullscreenOpen(true)}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-50"
                        >
                            풀스크린 표시 (PPT/대형 화면)
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminTraining;
