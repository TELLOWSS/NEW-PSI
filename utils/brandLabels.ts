export const BRAND_STATUS_LABELS = {
    attention: '확인 필요',
    attentionHold: '확인 필요/보류',
    attentionPending: '추가 확인/대기',
    supplementaryReview: '보완 검토',
    immediateAttention: '즉시 확인 필요',
    actionNeeded: '조치 필요',
    actionInProgress: '조치 진행중',
    actionCompleted: '조치완료',
    syncAttention: '우수사례 동기화 확인 필요',
    syncPending: '우수사례 동기화 준비',
} as const;

export const BRAND_ACTION_LABELS = {
    smartReanalyze: '스마트 재분석',
    directReanalyze: '직접 재분석',
    recheck: '다시 확인',
    retryQueue: '재발송 확인 큐',
    retryCandidate: '재발송 확인 후보',
} as const;

export const TRAFFIC_LIGHT_BRAND_LABELS = {
    green: '확정',
    yellow: BRAND_STATUS_LABELS.supplementaryReview,
    red: BRAND_STATUS_LABELS.immediateAttention,
} as const;

export const VIOLATION_BRAND_LABELS = {
    open: BRAND_STATUS_LABELS.actionNeeded,
    'in-progress': BRAND_STATUS_LABELS.actionInProgress,
    resolved: BRAND_STATUS_LABELS.actionCompleted,
} as const;
