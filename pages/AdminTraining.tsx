import React, { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import type { AppSettings } from '../types';
import { BRAND_STATUS_LABELS } from '../utils/brandLabels';
import { InterpretationCardGrid, type InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { fetchWithTimeout, postAdminJson } from '../utils/adminApiClient';
import { TBM_MONTHLY_PACKAGE_STORAGE_KEY, type TbmMonthlyPackagePayload } from '../utils/tbmEducationStudio';
import type { TranslationQualityReport } from '../utils/constructionTrainingTranslation';
import {
    completeSafetyCaseStage,
    readSafetyCases,
    SAFETY_CASE_TRAINING_HANDOFF_KEY,
    upsertSafetyCase,
} from '../utils/safetyCase';
import { saveSafetyCaseToServer } from '../services/safetyCaseService';

type UiLocale = 'ko' | 'en' | 'vi' | 'zh';
const LINK_HISTORY_STORAGE_KEY = 'psi_training_link_history';
const ACTIVE_QR_STATE_STORAGE_KEY = 'psi_training_active_qr_state';

type SafetyCaseTrainingHandoff = {
    caseId: string;
    workerId: string;
    workerName: string;
    jobField: string;
    riskLabel: string;
    actionTitle: string;
    createdAt: string;
};

type LoadedMonthlyPackage = {
    sourceText: string;
    translatedTexts: Record<string, string>;
    translationNeedsRefresh: boolean;
    month: string;
    workType: string;
    title: string;
    savedAt: string;
};

const loadMonthlyPackage = (): LoadedMonthlyPackage => {
    try {
        const parsed = JSON.parse(localStorage.getItem(TBM_MONTHLY_PACKAGE_STORAGE_KEY) || 'null') as Partial<TbmMonthlyPackagePayload> | null;
        const translatedTexts = parsed?.translatedTexts && typeof parsed.translatedTexts === 'object'
            ? Object.fromEntries(
                Object.entries(parsed.translatedTexts as Record<string, unknown>)
                    .filter(([, value]) => typeof value === 'string' && value.trim()),
            ) as Record<string, string>
            : {};
        return {
            sourceText: typeof parsed?.sourceText === 'string' ? parsed.sourceText : '',
            translatedTexts,
            translationNeedsRefresh: Boolean(parsed?.translationNeedsRefresh),
            month: typeof parsed?.month === 'string' ? parsed.month : '',
            workType: typeof parsed?.workType === 'string' ? parsed.workType : '',
            title: typeof parsed?.title === 'string' ? parsed.title : '',
            savedAt: typeof parsed?.savedAt === 'string' ? parsed.savedAt : '',
        };
    } catch {
        return { sourceText: '', translatedTexts: {}, translationNeedsRefresh: false, month: '', workType: '', title: '', savedAt: '' };
    }
};

const UI_TEXT: Record<UiLocale, {
    title: string;
    subtitle: string;
    sourcePlaceholder: string;
    selectLanguages: string;
    applyPreset: string;
    create: string;
    creating: string;
    sharedCopy: string;
    directLinkCopy: string;
    shortShareCopy: string;
    audioUploadTitle: string;
    audioUploadSubtitle: string;
    audioUploadSelect: string;
    audioUploadPending: string;
    audioUploadDone: string;
    audioUploadButton: string;
    audioUploading: string;
    audioUploadDoneMessage: string;
    audioUploadMissing: string;
    shareHeader: string;
    shareFailedPrefix: string;
    shareAllAudioLine: string;
    copyFailed: string;
    copyDone: string;
    directLinkCopyDone: string;
    shortShareCopyDone: string;
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
    qrExpand: string;
    qrExpandHint: string;
    qrClose: string;
    shareTitle: string;
    directAccessHint: string;
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
        title: 'QR·음성 안내 파일럿',
        subtitle: '확정된 원페이지 위험성평가 교육자료의 한국어 원문을 보조 전달 채널로 시험 운영합니다.',
        sourcePlaceholder: '예: 이달 핵심 위험은 추락, 협착, 전도입니다.',
        selectLanguages: '생성 언어 선택 (최소 1개)',
        applyPreset: '설정 기본값 적용',
        create: '생성',
        creating: '생성 중...',
        sharedCopy: '공유 텍스트 복사',
        directLinkCopy: '직접 링크 복사',
        shortShareCopy: '짧은 안내문 복사',
        audioUploadTitle: '국적별 팟캐스트 음성 업로드',
        audioUploadSubtitle: '외부에서 제작한 MP3/M4A 음성을 언어별로 올리면 근로자 접속 시 해당 국적 언어가 자동 재생 대상이 됩니다.',
        audioUploadSelect: '파일 선택',
        audioUploadPending: '업로드 필요',
        audioUploadDone: '업로드 완료',
        audioUploadButton: '선택 음성 업로드',
        audioUploading: '음성 업로드 중...',
        audioUploadDoneMessage: '국적별 음성 업로드를 저장했습니다.',
        audioUploadMissing: '업로드할 음성을 하나 이상 선택해 주세요.',
        shareHeader: '[PSI QR·음성 파일럿 링크]',
        shareFailedPrefix: '음성 미생성 언어(텍스트 대체)',
        shareAllAudioLine: '모든 선택 언어의 음성 안내가 생성되었습니다.',
        copyFailed: '클립보드 복사에 추가 확인이 필요합니다. 텍스트를 직접 복사해 주세요.',
        copyDone: '공유 텍스트를 복사했습니다. 메신저에 붙여넣어 전달해 주세요.',
        directLinkCopyDone: '직접 접속 링크를 복사했습니다.',
        shortShareCopyDone: '짧은 안내문을 복사했습니다. 문자/메신저로 바로 전달해 주세요.',
        emptySourceAlert: '한국어 안내 문구를 입력해 주세요.',
        minLangAlert: '최소 1개 언어를 선택해 주세요.',
        missingShareAlert: '복사할 공유 텍스트가 없습니다. 먼저 생성을 완료해 주세요.',
        success: '생성 완료! 아래 QR을 근로자에게 공유하세요.',
        partialSuccess: '생성 완료(부분 성공): 일부 언어는 음성 생성 확인이 더 필요해 텍스트 안내로 대체됩니다.',
        parseFail: '서버 JSON 응답을 확인하는 중 문제가 있어 다시 확인이 필요합니다.',
        emptyResponse: '서버가 비어있는 응답을 반환했습니다.',
        createFail: `세션 생성 ${BRAND_STATUS_LABELS.attention}`,
        errorPrefix: '안내',
        recentTitle: '최근 테스트 세션',
        recentEmpty: '표시할 세션이 없습니다.',
        recentLoad: '불러오기',
        recentLoaded: '선택한 세션을 불러왔습니다.',
        recentLoadedPartial: '최근 생성 세션을 불러왔습니다.',
        delete: '삭제',
        deleting: '삭제 중...',
        deleteCurrent: '테스트 세션 제거',
        deleteDone: '테스트 세션을 삭제했습니다.',
        deleteFailPrefix: '삭제 안내',
        deleteConfirm: '현재 표시된 테스트 세션을 삭제하시겠습니까?\n삭제 후 복구할 수 없습니다.',
        removeFromScreen: '화면에서 제거',
        removeDone: '표시 중인 세션 정보를 화면에서 제거했습니다.',
        noSessionToDelete: '삭제할 세션이 없습니다.',
        qrTitle: '근로자 접속 QR',
        qrExpand: 'QR 대형 화면으로 보기',
        qrExpandHint: '교육 시 전면 화면으로 띄워 먼 거리에서도 스캔할 수 있게 보여주세요.',
        qrClose: '닫기',
        shareTitle: '공유 텍스트',
        directAccessHint: 'QR 접속이 어려운 근로자에게는 아래 링크/공유 텍스트를 메신저로 직접 전송하거나 관리자 휴대폰 브라우저에 링크를 직접 입력해 접속시켜 주세요.',
        failedLangTitle: '음성 미생성 언어 (텍스트 대체)',
        failedBadge: `일부 음성 ${BRAND_STATUS_LABELS.attention}`,
        attemptLabel: '시도 코드',
        linkExpiryLabel: '링크 만료 시각',
        linkExpiredBadge: '만료됨',
        reissueLink: '링크 재발급',
        reissuing: '재발급 중...',
        reissueDone: '링크를 재발급했습니다.',
        reissueFail: `링크 재발급 ${BRAND_STATUS_LABELS.attention}`,
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
        directLinkCopy: 'Copy direct link',
        shortShareCopy: 'Copy short message',
        audioUploadTitle: 'Upload podcast audio by language',
        audioUploadSubtitle: 'Upload externally prepared MP3/M4A audio by language. Workers will hear the matching nationality language when they access.',
        audioUploadSelect: 'Select file',
        audioUploadPending: 'Upload needed',
        audioUploadDone: 'Uploaded',
        audioUploadButton: 'Upload selected audio',
        audioUploading: 'Uploading audio...',
        audioUploadDoneMessage: 'Saved language audio uploads.',
        audioUploadMissing: 'Please select at least one audio file to upload.',
        shareHeader: '[PSI Multilingual Safety Training Link]',
        shareFailedPrefix: 'Audio failed languages (text fallback)',
        shareAllAudioLine: 'Audio guidance has been generated for all selected languages.',
        copyFailed: 'Failed to copy to clipboard. Please copy manually.',
        copyDone: 'Share text copied. Paste it into your messenger.',
        directLinkCopyDone: 'Direct access link copied.',
        shortShareCopyDone: 'Short message copied. Send it by SMS or messenger.',
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
        qrExpand: 'Open large QR display',
        qrExpandHint: 'Show this on a large screen during training so workers can scan from a distance.',
        qrClose: 'Close',
        shareTitle: 'Share Text',
        directAccessHint: 'If a worker cannot scan the QR, send the link/share text below by messenger or open the link directly on the supervisor phone browser.',
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
        directLinkCopy: 'Sao chép liên kết trực tiếp',
        shortShareCopy: 'Sao chép tin nhắn ngắn',
        audioUploadTitle: 'Tải âm thanh podcast theo ngôn ngữ',
        audioUploadSubtitle: 'Tải lên file MP3/M4A đã chuẩn bị sẵn theo từng ngôn ngữ. Khi công nhân truy cập, hệ thống sẽ phát ngôn ngữ phù hợp.',
        audioUploadSelect: 'Chọn tệp',
        audioUploadPending: 'Cần tải lên',
        audioUploadDone: 'Đã tải lên',
        audioUploadButton: 'Tải lên âm thanh đã chọn',
        audioUploading: 'Đang tải âm thanh...',
        audioUploadDoneMessage: 'Đã lưu âm thanh theo ngôn ngữ.',
        audioUploadMissing: 'Vui lòng chọn ít nhất một file âm thanh để tải lên.',
        shareHeader: '[Liên kết đào tạo an toàn đa ngôn ngữ PSI]',
        shareFailedPrefix: 'Ngôn ngữ lỗi âm thanh (thay bằng văn bản)',
        shareAllAudioLine: 'Đã tạo âm thanh hướng dẫn cho tất cả ngôn ngữ đã chọn.',
        copyFailed: 'Sao chép clipboard thất bại. Vui lòng sao chép thủ công.',
        copyDone: 'Đã sao chép nội dung chia sẻ. Hãy dán vào ứng dụng nhắn tin.',
        directLinkCopyDone: 'Đã sao chép liên kết truy cập trực tiếp.',
        shortShareCopyDone: 'Đã sao chép tin nhắn ngắn. Hãy gửi qua SMS hoặc ứng dụng nhắn tin.',
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
        qrExpand: 'Mở QR cỡ lớn',
        qrExpandHint: 'Hãy hiển thị toàn màn hình khi đào tạo để công nhân có thể quét từ xa.',
        qrClose: 'Đóng',
        shareTitle: 'Nội dung chia sẻ',
        directAccessHint: 'Nếu công nhân không quét được QR, hãy gửi trực tiếp liên kết/nội dung chia sẻ bên dưới qua ứng dụng nhắn tin hoặc mở liên kết trên điện thoại của quản lý.',
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
        directLinkCopy: '复制直接链接',
        shortShareCopy: '复制简短说明',
        audioUploadTitle: '按语言上传播客音频',
        audioUploadSubtitle: '上传外部制作好的 MP3/M4A 音频。工人访问时会按国籍语言播放对应音频。',
        audioUploadSelect: '选择文件',
        audioUploadPending: '需要上传',
        audioUploadDone: '已上传',
        audioUploadButton: '上传所选音频',
        audioUploading: '音频上传中...',
        audioUploadDoneMessage: '已保存语言音频文件。',
        audioUploadMissing: '请至少选择一个音频文件上传。',
        shareHeader: '[PSI 多语言安全培训链接]',
        shareFailedPrefix: '语音失败语言（文本替代）',
        shareAllAudioLine: '已为所有所选语言生成语音指引。',
        copyFailed: '复制失败，请手动复制文本。',
        copyDone: '已复制分享文本，请粘贴到聊天工具发送。',
        directLinkCopyDone: '已复制直接访问链接。',
        shortShareCopyDone: '已复制简短说明，请通过短信或聊天工具发送。',
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
        qrExpand: '放大显示二维码',
        qrExpandHint: '培训时请全屏展示，方便工人远距离扫描。',
        qrClose: '关闭',
        shareTitle: '分享文本',
        directAccessHint: '如果工人无法扫描二维码，请通过聊天工具直接发送下方链接/分享文本，或由管理员在手机浏览器中直接打开该链接。',
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

const resolveAdminLocale = (): UiLocale => {
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
const isValidLanguageCode = (code: string): code is (typeof LANGUAGE_OPTIONS)[number]['code'] => VALID_LANGUAGE_CODES.has(code as (typeof LANGUAGE_OPTIONS)[number]['code']);

const normalizeLanguagePreset = (input?: string[]): string[] => {
    if (!Array.isArray(input)) return [...CURRENT_SITE_LANGUAGE_SET];
    const normalized = Array.from(new Set(input.filter((code): code is (typeof LANGUAGE_OPTIONS)[number]['code'] => isValidLanguageCode(code))));
    if (normalized.length === 0) return [...CURRENT_SITE_LANGUAGE_SET];
    return normalized;
};

type TrainingSessionRow = {
    id: string;
    case_id?: string | null;
    source_text_ko?: string;
    audio_urls?: Record<string, string | null>;
    created_at?: string;
    training_title?: string | null;
    training_category?: 'monthly_risk' | 'special_safety' | null;
    target_mode?: 'submitted_only' | 'attendance_only' | null;
    target_worker_names?: Array<string | { id?: string; name?: string }> | null;
};

export type TrainingTargetWorker = {
    id: string;
    name: string;
    jobField: string;
    teamName: string;
};

export const buildTrainingTargetSelectionPayload = (
    targetMode: 'submitted_only' | 'attendance_only',
    selectedTargetWorkerIds: string[],
    targetWorkers: TrainingTargetWorker[],
) => {
    if (targetMode !== 'attendance_only') {
        return { targetWorkerIds: [] as string[], targetWorkerNames: [] as string[] };
    }

    const workerMap = new Map(targetWorkers.map((worker) => [worker.id, worker]));
    const selectedTargets = Array.from(new Set(selectedTargetWorkerIds))
        .map((id) => workerMap.get(id))
        .filter((worker): worker is TrainingTargetWorker => Boolean(worker));

    return {
        targetWorkerIds: selectedTargets.map((worker) => worker.id),
        targetWorkerNames: selectedTargets.map((worker) => worker.name),
    };
};

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
    targetWorkers: number | null;
    targetScopeDefined: boolean;
    unconfirmedWorkers: number | null;
    confirmationRate: number | null;
    nationalityCount: number;
    ackDataSource: 'training_acknowledgements' | 'submission_gate';
    unconfirmedTargetWorkerIds: string[];
    unconfirmedTargetWorkerIdsTruncated: boolean;
};

type ActiveQrState = {
    sourceTextKo: string;
    mobileUrl: string;
    currentSessionId: string;
    linkExpiresAt: number | null;
    failedLanguages: string[];
    failedLanguageAttempts: Record<string, string[]>;
};

const AdminTraining: React.FC = () => {
    const [sourceTextKo, setSourceTextKo] = useState('');
    const [loading, setLoading] = useState(false);
    const [deletingSessionId, setDeletingSessionId] = useState('');
    const [mobileUrl, setMobileUrl] = useState('');
    const [currentSessionId, setCurrentSessionId] = useState('');
    const [linkExpiresAt, setLinkExpiresAt] = useState<number | null>(null);
    const [isQrExpanded, setIsQrExpanded] = useState(false);
    const [message, setMessage] = useState('');
    const [reissuingLink, setReissuingLink] = useState(false);
    const [uploadingAudio, setUploadingAudio] = useState(false);
    const [linkHistory, setLinkHistory] = useState<LinkHistoryItem[]>([]);
    const [awarenessStats, setAwarenessStats] = useState<AwarenessStats | null>(null);
    const [awarenessLoading, setAwarenessLoading] = useState(false);
    const [awarenessError, setAwarenessError] = useState('');
    const [awarenessLastFetchedAt, setAwarenessLastFetchedAt] = useState<number | null>(null);
    const awarenessInFlightRef = useRef(false);
    const [sessionAudioUrls, setSessionAudioUrls] = useState<Record<string, string | null>>({});
    const [audioUploadFiles, setAudioUploadFiles] = useState<Record<string, File | null>>({});
    const [failedLanguages, setFailedLanguages] = useState<string[]>([]);
    const [failedLanguageAttempts, setFailedLanguageAttempts] = useState<Record<string, string[]>>({});
    const [translatedTexts, setTranslatedTexts] = useState<Record<string, string>>({});
    const [pretranslatedTexts, setPretranslatedTexts] = useState<Record<string, string>>({});
    const [translationReports, setTranslationReports] = useState<Record<string, TranslationQualityReport>>({});
    const [trainingTitle, setTrainingTitle] = useState('');
    const [trainingCategory, setTrainingCategory] = useState<'monthly_risk' | 'special_safety'>('monthly_risk');
    const [targetMode, setTargetMode] = useState<'submitted_only' | 'attendance_only'>('submitted_only');
    const [targetWorkers, setTargetWorkers] = useState<TrainingTargetWorker[]>([]);
    const [selectedTargetWorkerIds, setSelectedTargetWorkerIds] = useState<string[]>([]);
    const [targetWorkerSearch, setTargetWorkerSearch] = useState('');
    const [targetWorkersLoading, setTargetWorkersLoading] = useState(false);
    const [targetWorkersError, setTargetWorkersError] = useState('');
    const [savedPreset, setSavedPreset] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);
    const [selectedLanguages, setSelectedLanguages] = useState<string[]>([...CURRENT_SITE_LANGUAGE_SET]);
    const [recentSessions, setRecentSessions] = useState<TrainingSessionRow[]>([]);
    const [linkedSafetyCase, setLinkedSafetyCase] = useState<SafetyCaseTrainingHandoff | null>(null);
    const uiLocale = resolveAdminLocale();
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

    const shortShareText = mobileUrl
        ? [
            t.shareHeader,
            mobileUrl,
        ].join('\n')
        : '';

    const filteredTargetWorkers = useMemo(() => {
        const keyword = targetWorkerSearch.trim().toLocaleLowerCase('ko-KR');
        if (!keyword) return targetWorkers;
        return targetWorkers.filter((worker) =>
            [worker.name, worker.jobField, worker.teamName, worker.id]
                .some((value) => value.toLocaleLowerCase('ko-KR').includes(keyword))
        );
    }, [targetWorkerSearch, targetWorkers]);

    const selectedTargetWorkerSet = useMemo(
        () => new Set(selectedTargetWorkerIds),
        [selectedTargetWorkerIds],
    );

    const recentSessionInterpretationCards = useMemo<InterpretationCardItem[]>(() => {
        const sessionsWithMissingAudio = recentSessions.filter((session) => Object.values(session.audio_urls || {}).some((url) => !url)).length;

        return [
            {
                eyebrow: '지금 상태',
                title: `최근 테스트 세션 ${recentSessions.length}건 중 화면에 즉시 불러올 수 있는 흐름이 준비돼 있습니다.`,
                description: recentSessions.length > 0
                    ? '최근 세션을 다시 불러오면 새로 QR을 만들지 않아도 현재 운영 상태를 빠르게 이어서 확인할 수 있습니다.'
                    : '아직 최근 세션이 없어, 먼저 테스트 세션을 생성해 운영 흐름을 시작해야 합니다.',
            },
            {
                eyebrow: '판단 근거',
                title: sessionsWithMissingAudio > 0
                    ? `${sessionsWithMissingAudio}건은 일부 언어 음성 확인이 더 필요합니다.`
                    : '최근 세션에서는 음성 누락 신호가 크지 않습니다.',
                description: sessionsWithMissingAudio > 0
                    ? '음성 누락 세션은 텍스트 대체로 운영은 가능하지만, 현장 전달 품질을 위해 재확인 우선순위를 두는 편이 안전합니다.'
                    : '최근 생성 세션은 QR·음성 파일럿 연결 상태가 비교적 안정적이어서 현장 재사용 부담이 낮습니다.',
            },
            {
                eyebrow: '다음 행동',
                title: recentSessions.length > 0
                    ? '가장 최근 세션을 불러와 QR·음성·확약 지표를 함께 점검하세요.'
                    : '한국어 원문과 대상 언어를 먼저 정한 뒤 첫 세션을 생성하세요.',
                description: '세션 재사용 여부를 빠르게 판단하면 같은 교육 공지를 반복 생성하는 시간을 줄이고, 현장 배포 일관성을 유지할 수 있습니다.',
            },
        ];
    }, [recentSessions]);

    const awarenessInterpretationCards = useMemo<InterpretationCardItem[]>(() => {
        if (!currentSessionId) {
            return [
                {
                    eyebrow: '지금 상태',
                    title: '현재 확약 상태를 읽을 세션이 아직 선택되지 않았습니다.',
                    description: '최근 세션을 먼저 불러오면 제출·확약 현황과 QR 배포 상태를 같은 흐름 안에서 확인할 수 있습니다.',
                },
            ];
        }

        if (awarenessStats) {
            if (!awarenessStats.targetScopeDefined) {
                return [
                    {
                        eyebrow: '현재 상태',
                        title: '교육 대상 범위가 아직 지정되지 않았습니다.',
                        description: `${awarenessStats.submittedWorkers}명이 제출했지만, 전체 대상자 수가 없어 이수율은 계산하지 않습니다.`,
                    },
                    {
                        eyebrow: '판단 근거',
                        title: '제출자 수를 전체 대상자 수로 간주하지 않습니다.',
                        description: '대상자를 지정한 새 세션부터 지정 인원 전체를 분모로 이수율을 계산합니다.',
                    },
                    {
                        eyebrow: '다음 행동',
                        title: '교육명·유형과 대상자를 선택해 세션을 다시 생성하세요.',
                        description: '대상 미지정 세션은 100%로 오해되지 않도록 계속 범위 미정으로 표시됩니다.',
                    },
                ];
            }

            return [
                {
                    eyebrow: '지금 상태',
                    title: `지정 대상 ${awarenessStats.targetWorkers}명 중 ${awarenessStats.confirmedWorkers}명이 이해·확약을 마쳤습니다.`,
                    description: Number(awarenessStats.unconfirmedWorkers) > 0
                        ? `${awarenessStats.unconfirmedWorkers}명은 아직 확인이 끝나지 않아 현장 후속 안내가 필요한 상태입니다.`
                        : '현재 세션에서는 미확약 인원이 없어 후속 추적 필요도가 낮습니다.',
                },
                {
                    eyebrow: '판단 근거',
                    title: `확약률은 ${awarenessStats.confirmationRate}%이고, ${awarenessStats.nationalityCount}개 국적이 참여했습니다.`,
                    description: awarenessStats.ackDataSource === 'training_acknowledgements'
                        ? '상세 확약 테이블 기준으로 계산되어 실제 응답 근거를 직접 추적할 수 있습니다.'
                        : '제출 게이트 기준으로 계산되어 현장 제출 여부 중심으로 빠르게 상태를 읽을 수 있습니다.',
                },
                {
                    eyebrow: '다음 행동',
                    title: Number(awarenessStats.unconfirmedWorkers) > 0
                        ? '미확약 인원을 다시 안내 대상에 포함해 QR 재접속 또는 직접 안내를 진행하세요.'
                        : '현재 세션은 유지하되, 링크 만료 전 재교육 필요 여부만 확인하면 됩니다.',
                    description: '확약률만 보는 대신 미확약 인원과 데이터 근거를 함께 보면, 추가 안내가 필요한 현장을 더 정확히 좁힐 수 있습니다.',
                },
            ];
        }

        return [];
    }, [awarenessStats, currentSessionId]);

    const qrInterpretationCards = useMemo<InterpretationCardItem[]>(() => {
        if (!mobileUrl) return [];

        const uploadedAudioCount = selectedLanguages.filter((code) => Boolean(sessionAudioUrls?.[code])).length;
        const pendingAudioCount = Math.max(0, selectedLanguages.length - uploadedAudioCount);
        const isExpired = Boolean(linkExpiresAt && Date.now() > linkExpiresAt);

        return [
            {
                eyebrow: '지금 상태',
                title: isExpired ? '현재 QR 링크는 만료되어 재발급 판단이 필요합니다.' : '현재 QR 링크는 현장 배포에 바로 사용할 수 있습니다.',
                description: isExpired
                    ? '만료된 링크는 스캔은 되더라도 접속이 끊길 수 있어, 재발급 후 다시 공유하는 편이 안전합니다.'
                    : '근로자 화면 진입 경로가 준비되어 있어, 교육 현장에서 즉시 스캔 안내를 시작할 수 있습니다.',
            },
            {
                eyebrow: '판단 근거',
                title: `선택 언어 ${selectedLanguages.length}개 중 ${uploadedAudioCount}개는 음성 연결이 확인됐습니다.`,
                description: pendingAudioCount > 0
                    ? `${pendingAudioCount}개 언어는 아직 업로드가 필요하거나 텍스트 대체 상태이므로, 대상 국적 비중이 높은 언어부터 먼저 보완하는 편이 좋습니다.`
                    : '현재 선택 언어는 모두 음성 연결이 확인되어 현장 전달력이 비교적 안정적입니다.',
            },
            {
                eyebrow: '다음 행동',
                title: isExpired ? '링크를 재발급하고 다시 공유한 뒤 음성 누락 언어를 함께 점검하세요.' : 'QR 대형 화면과 직접 링크 공유 중 현장 상황에 맞는 전달 방식을 선택하세요.',
                description: '스캔이 어려운 현장에서는 직접 링크 전송이 더 빠를 수 있고, 집체 교육에서는 대형 QR이 더 효과적입니다.',
            },
        ];
    }, [linkExpiresAt, mobileUrl, selectedLanguages, sessionAudioUrls]);

    useEffect(() => {
        if (!isQrExpanded) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsQrExpanded(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isQrExpanded]);

    const requestSignedMobileUrl = async (sessionId: string) => {
        const response = await fetchWithTimeout('/api/admin/training', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'reissue-link', sessionId }),
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
            throw new Error(data?.message || data?.error || `링크 재발급 ${BRAND_STATUS_LABELS.attention} (HTTP ${response.status})`);
        }

        return {
            mobileUrl: String(data.mobileUrl || ''),
            linkExpiresAt: Number(data.linkExpiresAt || 0),
        };
    };

    const appendLinkHistory = (item: LinkHistoryItem) => {
        setLinkHistory((prev) => {
            const next = [item, ...prev].slice(0, 30);
            localStorage.setItem(LINK_HISTORY_STORAGE_KEY, JSON.stringify(next));
            return next;
        });
    };

    const fetchAwarenessStats = async (sessionId: string) => {
        if (!sessionId) return;
        if (awarenessLoading || awarenessInFlightRef.current) return;

        awarenessInFlightRef.current = true;
        setAwarenessLoading(true);
        setAwarenessError('');
        try {
            const response = await fetchWithTimeout('/api/admin/training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'awareness-stats', sessionId }),
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
                throw new Error(data?.message || `통계 조회 ${BRAND_STATUS_LABELS.attention} (HTTP ${response.status})`);
            }

            setAwarenessStats({
                submittedWorkers: Number(data.submittedWorkers || 0),
                confirmedWorkers: Number(data.confirmedWorkers || 0),
                targetWorkers: typeof data.targetWorkers === 'number' ? data.targetWorkers : null,
                targetScopeDefined: Boolean(data.targetScopeDefined),
                unconfirmedWorkers: typeof data.unconfirmedWorkers === 'number' ? data.unconfirmedWorkers : null,
                confirmationRate: typeof data.confirmationRate === 'number' ? data.confirmationRate : null,
                nationalityCount: Number(data.nationalityCount || 0),
                ackDataSource: data.ackDataSource === 'training_acknowledgements'
                    ? 'training_acknowledgements'
                    : 'submission_gate',
                unconfirmedTargetWorkerIds: Array.isArray(data.unconfirmedTargetWorkerIds)
                    ? data.unconfirmedTargetWorkerIds.map((id: unknown) => String(id || '')).filter(Boolean)
                    : [],
                unconfirmedTargetWorkerIdsTruncated: Boolean(data.unconfirmedTargetWorkerIdsTruncated),
            });
            setAwarenessLastFetchedAt(Date.now());
        } catch (error: any) {
            setAwarenessStats(null);
            setAwarenessError(error?.message || t.createFail);
        } finally {
            setAwarenessLoading(false);
            awarenessInFlightRef.current = false;
        }
    };

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
        const response = await postAdminJson<{ ok: true; sessions: TrainingSessionRow[] }>(
            '/api/admin/training',
            { action: 'list-sessions' },
            { fallbackMessage: '최근 교육 세션을 불러오지 못했습니다.' },
        );
        const rows = response.sessions || [];
        setRecentSessions(rows);
        return rows;
    };

    const fetchTargetWorkers = async () => {
        setTargetWorkersLoading(true);
        setTargetWorkersError('');
        try {
            const response = await postAdminJson<{ ok: true; workers: TrainingTargetWorker[] }>(
                '/api/admin/training',
                { action: 'list-target-workers' },
                { fallbackMessage: '교육 대상자 목록을 불러오지 못했습니다.' },
            );
            setTargetWorkers(Array.isArray(response.workers) ? response.workers : []);
        } catch (error: any) {
            setTargetWorkers([]);
            setTargetWorkersError(error?.message || '교육 대상자 목록을 불러오지 못했습니다.');
        } finally {
            setTargetWorkersLoading(false);
        }
    };

    const hydrateSessionState = async (session: TrainingSessionRow, label: string) => {
        const signed = await requestSignedMobileUrl(String(session.id));
        setMobileUrl(signed.mobileUrl);
        setLinkExpiresAt(Number.isFinite(signed.linkExpiresAt) ? signed.linkExpiresAt : null);
        setCurrentSessionId(String(session.id));
        if (session.source_text_ko) setSourceTextKo(session.source_text_ko);
        setTrainingTitle(String(session.training_title || ''));
        setTrainingCategory(session.training_category === 'special_safety' ? 'special_safety' : 'monthly_risk');
        setTargetMode(session.target_mode === 'attendance_only' ? 'attendance_only' : 'submitted_only');
        setSelectedTargetWorkerIds(
            Array.isArray(session.target_worker_names)
                ? session.target_worker_names
                    .map((target) => target && typeof target === 'object' ? String(target.id || '').trim() : '')
                    .filter(Boolean)
                : [],
        );

        const restoredAudioUrls = session.audio_urls || {};
        setSessionAudioUrls(restoredAudioUrls);
        setAudioUploadFiles({});
        const restoredFailed = Object.entries(restoredAudioUrls)
            .filter(([, url]) => !url)
            .map(([lang]) => lang);
        setFailedLanguages(restoredFailed);
        setFailedLanguageAttempts({});

        if (restoredFailed.length > 0) {
            setMessage(`${label} 일부 언어는 음성 생성 확인이 더 필요해 텍스트 안내로 대체됩니다.`);
        } else {
            setMessage(label);
        }
    };

    useEffect(() => {
        void fetchTargetWorkers();
    }, []);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SAFETY_CASE_TRAINING_HANDOFF_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw) as SafetyCaseTrainingHandoff;
            if (!parsed?.caseId || !parsed.workerName) return;

            setLinkedSafetyCase(parsed);
            setTrainingTitle(`${parsed.workerName} · ${parsed.riskLabel} 보호교육`);
            setTrainingCategory('special_safety');
            setSourceTextKo([
                `[보호사건 ${parsed.caseId}]`,
                `대상: ${parsed.workerName} · ${parsed.jobField}`,
                `확인 위험: ${parsed.riskLabel}`,
                `완료 조치: ${parsed.actionTitle}`,
                '교육 후 작업 전 보호조치를 다시 설명하고, 본인확인과 전자서명을 완료합니다.',
            ].join('\n'));

            const matchedWorker = targetWorkers.find((worker) => (
                (parsed.workerId && worker.id === parsed.workerId)
                || worker.name.trim().toLocaleLowerCase('ko-KR') === parsed.workerName.trim().toLocaleLowerCase('ko-KR')
            ));
            if (matchedWorker) {
                setTargetMode('attendance_only');
                setSelectedTargetWorkerIds([matchedWorker.id]);
            }
        } catch {
            setLinkedSafetyCase(null);
        }
    }, [targetWorkers]);

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
            setAwarenessLastFetchedAt(null);
            awarenessInFlightRef.current = false;
            return;
        }

        void fetchAwarenessStats(currentSessionId);
    }, [currentSessionId]);

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

    const handleSelectAudioFile = (code: string, file: File | null) => {
        setAudioUploadFiles((prev) => ({
            ...prev,
            [code]: file,
        }));
    };

    const readFileAsBase64 = (file: File) => {
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error(`${file.name} 읽기 ${BRAND_STATUS_LABELS.attention}`));
            reader.readAsDataURL(file);
        });
    };

    const handleUploadTrainingAudio = async () => {
        if (!currentSessionId) {
            setMessage(t.noSessionToDelete);
            return;
        }

        const selectedEntries = Object.entries(audioUploadFiles).filter(([, file]) => file instanceof File) as Array<[string, File]>;
        if (selectedEntries.length === 0) {
            alert(t.audioUploadMissing);
            return;
        }

        setUploadingAudio(true);
        setMessage('');

        try {
            const filesPayload = Object.fromEntries(
                await Promise.all(
                    selectedEntries.map(async ([code, file]) => {
                        const base64 = await readFileAsBase64(file);
                        return [code, {
                            fileName: file.name,
                            contentType: file.type || 'audio/mpeg',
                            base64,
                        }];
                    })
                )
            );

            const response = await fetchWithTimeout('/api/admin/training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'upload-audio',
                    sessionId: currentSessionId,
                    originalScript: sourceTextKo,
                    files: filesPayload,
                }),
            }, 30_000);

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
                throw new Error(data?.message || `음성 업로드 ${BRAND_STATUS_LABELS.attention} (HTTP ${response.status})`);
            }

            const nextAudioUrls = data?.audioUrls && typeof data.audioUrls === 'object' ? data.audioUrls : {};
            setSessionAudioUrls(nextAudioUrls);
            setFailedLanguages(Array.isArray(data?.missingLanguages) ? data.missingLanguages : []);
            setAudioUploadFiles({});
            void fetchRecentSessions();
            setMessage(t.audioUploadDoneMessage);
        } catch (error: any) {
            setMessage(`${t.errorPrefix}: ${error?.message || t.createFail}`);
        } finally {
            setUploadingAudio(false);
        }
    };

    const handleCreate = async () => {
        if (!trainingTitle.trim()) {
            alert('교육명을 입력해 주세요.');
            return;
        }

        if (!sourceTextKo.trim()) {
            alert(t.emptySourceAlert);
            return;
        }

        if (selectedLanguages.length === 0) {
            alert(t.minLangAlert);
            return;
        }

        if (targetMode === 'attendance_only' && selectedTargetWorkerIds.length === 0) {
            alert('지정 대상자 기준을 선택했다면 대상자를 1명 이상 선택해 주세요.');
            return;
        }

        const targetSelectionPayload = buildTrainingTargetSelectionPayload(
            targetMode,
            selectedTargetWorkerIds,
            targetWorkers,
        );

        if (targetMode === 'attendance_only' && targetSelectionPayload.targetWorkerIds.length !== selectedTargetWorkerIds.length) {
            alert('대상자 목록이 변경되었습니다. 목록을 다시 불러온 뒤 대상자를 다시 선택해 주세요.');
            return;
        }

        setLoading(true);
        setMessage('');
        setMobileUrl('');
        setCurrentSessionId('');
        setLinkExpiresAt(null);
        setSessionAudioUrls({});
        setAudioUploadFiles({});
        setFailedLanguages([]);
        setFailedLanguageAttempts({});
        setTranslatedTexts({});
        setTranslationReports({});

        try {
            const response = await fetchWithTimeout('/api/admin/training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    caseId: linkedSafetyCase?.caseId || null,
                    sourceTextKo,
                    selectedLanguages,
                    pretranslatedTexts,
                    trainingTitle: trainingTitle.trim(),
                    trainingCategory,
                    targetMode,
                    ...targetSelectionPayload,
                }),
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
                const serverMessage = data?.message || data?.error || `요청 ${BRAND_STATUS_LABELS.attention} (HTTP ${response.status})`;
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
            setLinkExpiresAt(Number(data.linkExpiresAt || 0) || null);
            setSessionAudioUrls(data?.audioUrls && typeof data.audioUrls === 'object' ? data.audioUrls : {});
            setTranslatedTexts(data?.translatedTexts && typeof data.translatedTexts === 'object' ? data.translatedTexts : {});
            setTranslationReports(data?.translationReports && typeof data.translationReports === 'object' ? data.translationReports : {});
            setAudioUploadFiles({});
            if (data.sessionId && data.mobileUrl && data.linkExpiresAt) {
                appendLinkHistory({
                    sessionId: String(data.sessionId),
                    mobileUrl: String(data.mobileUrl),
                    linkExpiresAt: Number(data.linkExpiresAt),
                    action: 'create',
                    createdAt: new Date().toISOString(),
                });
            }
            if (linkedSafetyCase?.caseId && data.sessionId) {
                const caseRecord = readSafetyCases().find((record) => record.caseId === linkedSafetyCase.caseId);
                if (caseRecord?.status === 'awaiting-training') {
                    const nextCase = completeSafetyCaseStage(
                        caseRecord,
                        'training',
                        '교육 관리자',
                        'QR·음성 파일럿 세션을 생성하고 근로자에게 연결했습니다.',
                        { evidenceId: String(data.sessionId) },
                    );
                    upsertSafetyCase(nextCase);
                    void saveSafetyCaseToServer(nextCase).catch(() => {
                        // 원격 스키마 적용 전에는 로컬 사건 이력을 유지한다.
                    });
                    localStorage.removeItem(SAFETY_CASE_TRAINING_HANDOFF_KEY);
                    setLinkedSafetyCase(null);
                }
            }
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

    const handleCopyDirectLink = async () => {
        if (!mobileUrl) {
            alert(t.missingShareAlert);
            return;
        }

        try {
            await navigator.clipboard.writeText(mobileUrl);
            setMessage(t.directLinkCopyDone);
        } catch {
            setMessage(t.copyFailed);
        }
    };

    const handleCopyShortShareText = async () => {
        if (!shortShareText) {
            alert(t.missingShareAlert);
            return;
        }

        try {
            await navigator.clipboard.writeText(shortShareText);
            setMessage(t.shortShareCopyDone);
        } catch {
            setMessage(t.copyFailed);
        }
    };

    const clearRenderedSession = () => {
        setMobileUrl('');
        setCurrentSessionId('');
        setLinkExpiresAt(null);
        setIsQrExpanded(false);
        setSessionAudioUrls({});
        setAudioUploadFiles({});
        setFailedLanguages([]);
        setFailedLanguageAttempts({});
        setAwarenessStats(null);
        setAwarenessError('');
        setAwarenessLastFetchedAt(null);
        awarenessInFlightRef.current = false;
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

    const handleDeleteSession = async (targetSessionId?: unknown) => {
        const sessionIdToDelete = typeof targetSessionId === 'string' && targetSessionId.trim().length > 0
            ? targetSessionId
            : currentSessionId;
        if (!sessionIdToDelete) {
            setMessage(t.noSessionToDelete);
            return;
        }

        const ok = window.confirm(t.deleteConfirm);
        if (!ok) return;

        setDeletingSessionId(sessionIdToDelete);
        try {
            const response = await fetchWithTimeout('/api/admin/training', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete-session', sessionId: sessionIdToDelete }),
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
                throw new Error(data?.message || data?.error || `세션 삭제 ${BRAND_STATUS_LABELS.attention} (HTTP ${response.status})`);
            }

            if (sessionIdToDelete === currentSessionId) {
                setMobileUrl('');
                setCurrentSessionId('');
                setLinkExpiresAt(null);
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
            <div className="psi-industrial-panel p-5 sm:p-7">
                <h2 className="text-2xl font-black text-slate-900 dark:text-slate-100">{t.title}</h2>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-300 mt-2">{t.subtitle}</p>

                <div className="mt-5 grid gap-3 md:grid-cols-3">
                    {[
                        ['1', '한국어 원문 확인', '위험성평가 교육 스튜디오 원문을 불러오거나 직접 입력'],
                        ['2', '대상 언어 선택', '현장 국적에 필요한 언어만 선택'],
                        ['3', '파일럿 배포', '세션 생성 후 음성·텍스트·참여 현황 관리'],
                    ].map(([step, title, description]) => (
                        <article key={step} className="psi-step-card">
                            <span>{step}</span>
                            <div><b>{title}</b><p>{description}</p></div>
                        </article>
                    ))}
                </div>

                <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
                    <summary className="cursor-pointer text-xs font-black text-slate-700 dark:text-slate-200">음성 업로드·미지원 언어 운영 기준 보기</summary>
                    <div className="mt-3 grid gap-3 text-[11px] font-semibold leading-5 psi-copy-muted md:grid-cols-2">
                        <p><b className="text-slate-800 dark:text-slate-100">외부 음성:</b> MP3/M4A 파일을 언어별로 업로드하면 근로자 접속 시 해당 언어 음성을 우선 재생합니다.</p>
                        <p><b className="text-slate-800 dark:text-slate-100">미지원 언어:</b> 음성이 준비되지 않으면 텍스트로 대체하고 공용 언어 또는 현장 통역을 함께 운영합니다.</p>
                    </div>
                </details>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-500/30 dark:bg-blue-500/10">
                    <div>
                        <p className="text-xs font-black text-blue-900 dark:text-blue-100">위험성평가 5단계 원문</p>
                        <p className="mt-1 text-[11px] font-bold text-blue-700 dark:text-blue-300">위험성평가 교육자료 스튜디오에서 확정한 원페이지 교육자료 원문과 중점관리 내용을 한 번에 불러옵니다.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            const monthlyPackage = loadMonthlyPackage();
                            if (!monthlyPackage.sourceText) {
                                setMessage('위험성평가 교육자료 스튜디오에서 먼저 5단계 교육 원문을 보내 주세요.');
                                return;
                            }
                            setSourceTextKo(monthlyPackage.sourceText);
                            setPretranslatedTexts(monthlyPackage.translationNeedsRefresh ? {} : monthlyPackage.translatedTexts);
                            if (monthlyPackage.title) {
                                setTrainingTitle((current) => current.trim() ? current : monthlyPackage.title);
                            }
                            const availableCodes = Object.keys(monthlyPackage.translatedTexts).filter(isValidLanguageCode);
                            const packageLabel = [monthlyPackage.month, monthlyPackage.workType].filter(Boolean).join(' · ') || '월/공종 미표시';
                            if (availableCodes.length > 0) {
                                setSelectedLanguages((current) => Array.from(new Set([...current, ...availableCodes])));
                            }
                            setMessage(
                                monthlyPackage.translationNeedsRefresh
                                    ? `5단계 원문(${packageLabel})을 불러왔습니다. 검수 후 원문이 바뀌어 기존 번역은 재사용하지 않고, 선택 언어 ${availableCodes.length}개는 세션 생성 시 현재 원문 기준으로 다시 번역합니다.`
                                    : availableCodes.length > 0
                                    ? `5단계 원문(${packageLabel})과 AI 번역 ${availableCodes.length}개를 불러왔습니다. 기존 번역은 다시 생성하지 않아 사용량을 줄입니다.`
                                    : `5단계 월간 교육 원문(${packageLabel})을 불러왔습니다. 내용을 확인한 뒤 세션을 생성해 주세요.`,
                            );
                        }}
                        className="psi-button-primary"
                    >
                        스튜디오 원문 불러오기
                    </button>
                </div>

                {linkedSafetyCase && (
                    <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">보호사건 교육 연결</p>
                        <p className="mt-1 text-sm font-black text-slate-900">{linkedSafetyCase.caseId}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-600">
                            {linkedSafetyCase.workerName} · {linkedSafetyCase.jobField} · {linkedSafetyCase.riskLabel}
                        </p>
                        <p className="mt-1 text-[11px] font-bold text-violet-700">세션 생성이 완료되면 사건 타임라인의 교육 단계가 자동 완료됩니다.</p>
                    </div>
                )}

                <section className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
                    <div className="grid gap-4 md:grid-cols-2">
                        <label className="block">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">교육명</span>
                            <input
                                type="text"
                                value={trainingTitle}
                                onChange={(event) => setTrainingTitle(event.target.value)}
                                placeholder="예: 6월 추락·끼임 예방교육"
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                        </label>
                        <label className="block">
                            <span className="text-xs font-black text-slate-700 dark:text-slate-200">교육유형</span>
                            <select
                                value={trainingCategory}
                                onChange={(event) => setTrainingCategory(event.target.value === 'special_safety' ? 'special_safety' : 'monthly_risk')}
                                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            >
                                <option value="monthly_risk">월간 위험성평가 교육</option>
                                <option value="special_safety">특별 안전교육</option>
                            </select>
                        </label>
                    </div>

                    <div className="mt-4">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200">이수율 대상 범위</p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                            <label className={`rounded-xl border p-3 ${targetMode === 'attendance_only' ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                                <input
                                    type="radio"
                                    name="training-target-mode"
                                    checked={targetMode === 'attendance_only'}
                                    onChange={() => setTargetMode('attendance_only')}
                                />
                                <span className="ml-2 text-xs font-black text-slate-800 dark:text-slate-100">지정 대상자 전체 기준</span>
                                <p className="mt-1 pl-5 text-[11px] font-bold text-slate-500 dark:text-slate-400">선택한 대상자 전체를 이수율 분모로 사용합니다.</p>
                            </label>
                            <label className={`rounded-xl border p-3 ${targetMode === 'submitted_only' ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}>
                                <input
                                    type="radio"
                                    name="training-target-mode"
                                    checked={targetMode === 'submitted_only'}
                                    onChange={() => setTargetMode('submitted_only')}
                                />
                                <span className="ml-2 text-xs font-black text-slate-800 dark:text-slate-100">범위 미지정</span>
                                <p className="mt-1 pl-5 text-[11px] font-bold text-slate-500 dark:text-slate-400">제출 현황만 집계하며 이수율은 표시하지 않습니다.</p>
                            </label>
                        </div>
                    </div>

                    {targetMode === 'attendance_only' && (
                        <div className="mt-4 rounded-xl border border-indigo-200 bg-white p-3 dark:border-indigo-500/30 dark:bg-slate-800">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">교육 대상자 선택</p>
                                    <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                        선택 {selectedTargetWorkerIds.length}명 · 안정 ID와 이름만 세션에 저장합니다.
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTargetWorkerIds(Array.from(new Set([
                                            ...selectedTargetWorkerIds,
                                            ...filteredTargetWorkers.map((worker) => worker.id),
                                        ])))}
                                        className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-black text-indigo-700"
                                    >
                                        검색 결과 전체 선택
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedTargetWorkerIds([])}
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black text-slate-600"
                                    >
                                        선택 해제
                                    </button>
                                </div>
                            </div>
                            <input
                                type="search"
                                value={targetWorkerSearch}
                                onChange={(event) => setTargetWorkerSearch(event.target.value)}
                                placeholder="이름·공종·팀 검색"
                                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-bold text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            {targetWorkersLoading ? (
                                <p className="mt-3 text-xs font-bold text-slate-500">대상자 목록을 불러오는 중입니다.</p>
                            ) : targetWorkersError ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-bold text-rose-700">{targetWorkersError}</p>
                                    <button type="button" onClick={() => void fetchTargetWorkers()} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700">
                                        다시 불러오기
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                                        {filteredTargetWorkers.slice(0, 200).map((worker) => (
                                            <label key={worker.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedTargetWorkerSet.has(worker.id)}
                                                    onChange={() => setSelectedTargetWorkerIds((current) =>
                                                        current.includes(worker.id)
                                                            ? current.filter((id) => id !== worker.id)
                                                            : [...current, worker.id]
                                                    )}
                                                />
                                                <span className="min-w-0">
                                                    <span className="block text-xs font-black text-slate-800 dark:text-slate-100">{worker.name}</span>
                                                    <span className="block truncate text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                        {[worker.jobField, worker.teamName].filter(Boolean).join(' · ') || '공종·팀 미등록'}
                                                    </span>
                                                </span>
                                            </label>
                                        ))}
                                        {filteredTargetWorkers.length === 0 && (
                                            <p className="py-4 text-center text-xs font-bold text-slate-500">검색 결과가 없습니다.</p>
                                        )}
                                    </div>
                                    {filteredTargetWorkers.length > 200 && (
                                        <p className="mt-2 text-[10px] font-bold text-amber-700">화면에는 첫 200명만 표시됩니다. 검색 결과 전체 선택은 현재 검색된 {filteredTargetWorkers.length}명에 적용됩니다.</p>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </section>

                <textarea
                    value={sourceTextKo}
                    onChange={(e) => {
                        setSourceTextKo(e.target.value);
                        setPretranslatedTexts({});
                    }}
                    rows={8}
                    placeholder={t.sourcePlaceholder}
                    className="w-full mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-bold text-sm text-slate-900 dark:text-slate-100"
                />

                <div className="mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <p className="text-xs font-black text-slate-600 dark:text-slate-300">{t.selectLanguages}</p>
                        <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black border border-slate-200 dark:border-slate-600">
                            선택 {selectedLanguages.length}개
                        </span>
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
                            <label key={lang.code} className={`flex items-center justify-between gap-3 p-3 rounded-xl border ${selectedLanguages.includes(lang.code) ? 'border-indigo-300 bg-indigo-50 dark:bg-indigo-900/30' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                <input
                                    type="checkbox"
                                    checked={selectedLanguages.includes(lang.code)}
                                    onChange={() => toggleLanguage(lang.code)}
                                />
                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{lang.label[uiLocale]} ({lang.code})</span>
                                </div>
                                <span className={`shrink-0 px-2 py-1 rounded-md text-[10px] font-black border ${selectedLanguages.includes(lang.code) ? 'border-indigo-200 dark:border-indigo-500 bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                    업로드대상
                                </span>
                            </label>
                        ))}
                    </div>
                    <p className="mt-2 text-[11px] font-bold text-slate-500 dark:text-slate-300">
                        체크한 언어만 외부 팟캐스트 음성 업로드 대상입니다. 기본값은 설정 페이지의 "QR/음성 파일럿 기본 언어 세트"를 따릅니다.
                    </p>
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="psi-button-primary mt-4 px-6 text-sm disabled:opacity-50"
                >
                    {loading ? t.creating : t.create}
                </button>

                {message && <p className="mt-4 text-sm font-bold text-slate-700 dark:text-slate-200">{message}</p>}
                {Object.keys(translatedTexts).filter((code) => code !== '__quality__').length > 0 && (
                    <section className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-black text-emerald-950 dark:text-emerald-100">나라별 한 장 요약 번역 검수</h3>
                                <p className="mt-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">건설현장 용어, 1~5단계 순서, 작업중지 의미를 자동 검사했습니다. ‘검수 필요’ 언어는 QR 공유 전에 현장 통역자와 대조하세요.</p>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-emerald-800 shadow-sm dark:bg-slate-900 dark:text-emerald-200">
                                번역 {Object.keys(translatedTexts).filter((code) => code !== '__quality__').length}개
                            </span>
                        </div>
                        <div className="mt-4 grid gap-3 lg:grid-cols-2">
                            {Object.entries(translatedTexts)
                                .filter(([code, text]) => code !== '__quality__' && Boolean(text))
                                .map(([code, text]) => {
                                    const report = translationReports[code];
                                    const languageLabel = LANGUAGE_OPTIONS.find((item) => item.code === code)?.label.ko || code;
                                    const ready = code === 'ko-KR' || report?.status === 'ready';
                                    return (
                                        <details key={code} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                                            <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                                                <span className="text-sm font-black text-slate-900 dark:text-slate-100">{languageLabel}</span>
                                                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                                                    {ready ? '공유 가능' : '검수 필요'}
                                                </span>
                                            </summary>
                                            <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs font-semibold leading-6 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                                {text}
                                            </div>
                                            {report && (
                                                <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] font-bold leading-5 text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100">
                                                    <p>{report.verificationKo}</p>
                                                    {report.warnings.length > 0 && <p className="mt-1 text-amber-700 dark:text-amber-300">확인: {report.warnings.join(' · ')}</p>}
                                                </div>
                                            )}
                                        </details>
                                    );
                                })}
                        </div>
                    </section>
                )}
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
                                    <p key={`${code}-attempts`} className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                        {code} {t.attemptLabel}: {attempts.length > 0 ? attempts.join(', ') : '-'}
                                    </p>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[11px] font-black text-amber-700">해당 언어는 근로자 화면에서 텍스트 안내로 자동 대체됩니다.</p>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.recentTitle}</h3>
                <InterpretationCardGrid
                    items={recentSessionInterpretationCards}
                    className="mt-4 grid-cols-1 xl:grid-cols-3"
                    cardClassName="border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                    eyebrowClassName="text-slate-500 dark:text-slate-400"
                    titleClassName="text-slate-900 dark:text-slate-100"
                    descriptionClassName="text-slate-600 dark:text-slate-300"
                />
                {recentSessions.length === 0 ? (
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{t.recentEmpty}</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {recentSessions.map((session) => {
                            const hasMissingAudio = Object.values(session.audio_urls || {}).some((url) => !url);
                            const preview = (session.source_text_ko || '').trim();
                            return (
                                <div key={session.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                    <p className="text-[11px] font-black text-slate-600 dark:text-slate-300 break-all">{session.id}</p>
                                    <p className="mt-1 text-xs font-bold text-slate-700 dark:text-slate-200 line-clamp-2">{preview || '(문구 없음)'}</p>
                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        {hasMissingAudio && (
                                            <span className="px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-black">
                                                {t.failedBadge}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => void hydrateSessionState(session, t.recentLoaded)}
                                            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-black border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
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

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.awarenessTitle}</h3>
                <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">{t.awarenessSubtitle}</p>
                {currentSessionId && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void fetchAwarenessStats(currentSessionId)}
                            disabled={awarenessLoading || awarenessInFlightRef.current}
                            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {awarenessLoading ? '불러오는 중…' : '통계 새로고침'}
                        </button>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-300">필요 시 통계 새로고침을 눌러 최신 상태를 확인해 주세요.</p>
                        {awarenessLastFetchedAt && (
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-300">
                                마지막 조회: {new Date(awarenessLastFetchedAt).toLocaleTimeString('ko-KR', { hour12: false })}
                            </p>
                        )}
                    </div>
                )}
                {awarenessInterpretationCards.length > 0 && (
                    <InterpretationCardGrid
                        items={awarenessInterpretationCards}
                        className="mt-4 grid-cols-1 xl:grid-cols-3"
                        cardClassName="border-emerald-100 bg-emerald-50/50"
                        eyebrowClassName="text-emerald-700"
                        titleClassName="text-slate-900"
                        descriptionClassName="text-slate-600"
                    />
                )}

                {!currentSessionId ? (
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{t.recentEmpty}</p>
                ) : awarenessLoading ? (
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{t.statLoading}</p>
                ) : awarenessError ? (
                    <p className="mt-3 text-sm font-bold text-rose-700">{t.statErrorPrefix}: {awarenessError}</p>
                ) : awarenessStats ? (
                    <div className="mt-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">{t.statSubmitted}</p>
                                <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{awarenessStats.submittedWorkers}</p>
                            </div>
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">지정 대상자</p>
                                <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">
                                    {awarenessStats.targetScopeDefined ? awarenessStats.targetWorkers : '범위 미정'}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
                                <p className="text-[11px] font-black text-emerald-700">{t.statConfirmed}</p>
                                <p className="mt-1 text-xl font-black text-emerald-800">{awarenessStats.confirmedWorkers}</p>
                            </div>
                            <div className="p-3 rounded-xl border border-amber-200 bg-amber-50">
                                <p className="text-[11px] font-black text-amber-700">{t.statUnconfirmed}</p>
                                <p className="mt-1 text-xl font-black text-amber-800">
                                    {awarenessStats.targetScopeDefined ? awarenessStats.unconfirmedWorkers : '범위 미정'}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50">
                                <p className="text-[11px] font-black text-indigo-700">{t.statRate}</p>
                                <p className="mt-1 text-xl font-black text-indigo-800">
                                    {awarenessStats.targetScopeDefined ? `${awarenessStats.confirmationRate}%` : '범위 미정'}
                                </p>
                            </div>
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">{t.statNationalities}</p>
                                <p className="mt-1 text-xl font-black text-slate-900 dark:text-slate-100">{awarenessStats.nationalityCount}</p>
                            </div>
                            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <p className="text-[11px] font-black text-slate-500 dark:text-slate-400">{t.statDataSource}</p>
                                <p className="mt-1 text-[12px] font-black text-slate-900 dark:text-slate-100">
                                    {awarenessStats.ackDataSource === 'training_acknowledgements'
                                        ? t.statSourceAckTable
                                        : t.statSourceSubmissionGate}
                                </p>
                            </div>
                        </div>
                        {awarenessStats.unconfirmedTargetWorkerIds.length > 0 && (
                            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                                <p className="text-[11px] font-black text-amber-800">미확약 대상 안정 ID</p>
                                <p className="mt-1 text-[11px] font-bold text-amber-700">
                                    {awarenessStats.unconfirmedTargetWorkerIds.slice(0, 20).map((id) => id.slice(0, 8)).join(', ')}
                                    {(awarenessStats.unconfirmedTargetWorkerIds.length > 20 || awarenessStats.unconfirmedTargetWorkerIdsTruncated) ? ' 외' : ''}
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{t.recentEmpty}</p>
                )}
            </div>

            {mobileUrl && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-slate-100">{t.qrTitle}</h3>
                            <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-300">{t.qrExpandHint}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsQrExpanded(true)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
                        >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" /></svg>
                            {t.qrExpand}
                        </button>
                    </div>
                    <InterpretationCardGrid
                        items={qrInterpretationCards}
                        className="mt-4 grid-cols-1 xl:grid-cols-3"
                        cardClassName="border-indigo-100 bg-indigo-50/50"
                        eyebrowClassName="text-indigo-700"
                        titleClassName="text-slate-900"
                        descriptionClassName="text-slate-600"
                    />
                    {currentSessionId && <p className="text-[11px] font-bold text-slate-500 mt-1">세션 ID: {currentSessionId}</p>}
                    {linkExpiresAt && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-300">
                                {t.linkExpiryLabel}: {new Date(linkExpiresAt).toLocaleString()}
                            </p>
                            {Date.now() > linkExpiresAt && (
                                <span className="px-2 py-1 rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black">
                                    {t.linkExpiredBadge}
                                </span>
                            )}
                        </div>
                    )}
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-300 mt-2 break-all">{mobileUrl}</p>
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                        <p className="text-[11px] font-black text-amber-800">{t.directAccessHint}</p>
                    </div>
                    <div className="mt-4 flex justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                        <QRCodeCanvas value={mobileUrl} size={220} />
                    </div>
                    <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-4">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">{t.audioUploadTitle}</h4>
                        <p className="mt-1 text-[11px] font-bold text-slate-600 dark:text-slate-300">{t.audioUploadSubtitle}</p>

                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {selectedLanguages.map((code) => {
                                const languageLabel = LANGUAGE_OPTIONS.find((item) => item.code === code)?.label[uiLocale] || code;
                                const uploadedUrl = sessionAudioUrls?.[code];
                                const selectedFile = audioUploadFiles?.[code];

                                return (
                                    <div key={code} className={`rounded-2xl border px-3 py-3 ${uploadedUrl ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-white dark:bg-slate-800'}`}>
                                        <div className="flex items-center justify-between gap-2">
                                            <div>
                                                <p className="text-sm font-black text-slate-900 dark:text-slate-100">{languageLabel}</p>
                                                <p className="text-[10px] font-black text-slate-500 dark:text-slate-400">{code}</p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${uploadedUrl ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {uploadedUrl ? t.audioUploadDone : t.audioUploadPending}
                                            </span>
                                        </div>

                                        <label className="mt-3 block w-full cursor-pointer rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 text-center text-[11px] font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
                                            {selectedFile ? selectedFile.name : t.audioUploadSelect}
                                            <input
                                                type="file"
                                                accept=".mp3,.m4a,audio/mpeg,audio/mp4,audio/x-m4a"
                                                className="hidden"
                                                onChange={(event) => handleSelectAudioFile(code, event.target.files?.[0] || null)}
                                            />
                                        </label>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            type="button"
                            onClick={() => void handleUploadTrainingAudio()}
                            disabled={uploadingAudio || !currentSessionId}
                            className="mt-4 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {uploadingAudio ? t.audioUploading : t.audioUploadButton}
                        </button>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => void handleReissueCurrentLink()}
                            disabled={reissuingLink || !currentSessionId}
                            className="px-4 py-2 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-black border border-indigo-200 hover:bg-indigo-100 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {reissuingLink ? t.reissuing : t.reissueLink}
                        </button>
                        <button
                            type="button"
                                onClick={clearRenderedSession}
                                className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black border border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
                        >
                            {t.removeFromScreen}
                        </button>
                        <button
                            type="button"
                            onClick={() => void handleDeleteSession()}
                            disabled={!!deletingSessionId || !currentSessionId}
                            className="px-4 py-2 rounded-lg bg-rose-50 text-rose-700 text-xs font-black border border-rose-200 hover:bg-rose-100 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {deletingSessionId === currentSessionId ? t.deleting : t.deleteCurrent}
                        </button>
                    </div>
                </div>
            )}

            {mobileUrl && isQrExpanded && (
                <div className="fixed inset-0 z-[70] bg-slate-950/90 backdrop-blur-sm p-4 sm:p-8">
                    <div className="mx-auto flex h-full max-w-6xl flex-col rounded-[32px] border border-white/10 bg-slate-900 text-white shadow-2xl">
                        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-8 sm:py-6">
                            <div>
                                <h3 className="text-xl sm:text-3xl font-black">{t.qrTitle}</h3>
                                <p className="mt-2 text-sm font-bold text-slate-300">{t.qrExpandHint}</p>
                                {currentSessionId && <p className="mt-2 text-xs font-black text-slate-400">세션 ID: {currentSessionId}</p>}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsQrExpanded(false)}
                                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-black text-white hover:bg-white/15"
                            >
                                {t.qrClose}
                            </button>
                        </div>
                        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-6 sm:px-8 sm:py-10">
                            <div className="rounded-[32px] bg-white p-5 shadow-2xl sm:p-8">
                                <QRCodeCanvas value={mobileUrl} size={520} />
                            </div>
                            <p className="max-w-4xl break-all text-center text-sm font-bold text-slate-300">{mobileUrl}</p>
                            <p className="text-center text-xs font-black text-slate-400">ESC 키 또는 닫기 버튼으로 대형 QR 화면을 종료할 수 있습니다.</p>
                        </div>
                    </div>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">{t.historyTitle}</h3>
                {linkHistory.length === 0 ? (
                    <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{t.historyEmpty}</p>
                ) : (
                    <div className="mt-3 space-y-2">
                        {linkHistory.map((item, index) => (
                            <div key={`${item.sessionId}-${item.createdAt}-${index}`} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="px-2 py-1 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black">
                                        {item.action === 'create' ? t.historyCreate : t.historyReissue}
                                    </span>
                                    <span className="text-[11px] font-black text-slate-600 dark:text-slate-300 break-all">{item.sessionId}</span>
                                </div>
                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                    {new Date(item.createdAt).toLocaleString()} · {t.linkExpiryLabel}: {new Date(item.linkExpiresAt).toLocaleString()}
                                </p>
                                <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-400 break-all">{item.mobileUrl}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminTraining;
