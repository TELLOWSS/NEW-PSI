/**
 * PSI OCR 정책 엔진 설정 파일 (P1: 정책 엔진 설정화)
 *
 * 이 파일은 PSI 시스템 전반의 OCR/운영 판단 임계값과 정책을 중앙집중 관리한다.
 * 하드코딩된 분산 상수 대신 이 파일의 값을 참조하여 정책 변경 시 단일 지점만 수정하면 된다.
 *
 * 정책 버전이 바뀔 때 `version` 필드를 올려 감사 추적(audit trail)에 기록한다.
 */

/** 정책 버전 식별자 */
export const OCR_POLICY_VERSION = '1.0.0';

// ─────────────────────────────────────────────
// 1) 점수 임계값 (Score Thresholds)
// ─────────────────────────────────────────────
export const SCORE_THRESHOLDS = {
    /** 고급 등급 최소 점수 */
    advancedMin: 80,
    /** 중급 등급 최소 점수 */
    intermediateMin: 60,
    /** 0점 + 텍스트 없음 시 실패 판정 기준 */
    zeroScoreFailThreshold: 0,
    /** 서버 응답에서 safetyScore 누락 시 텍스트 있으면 부여할 기본값 */
    defaultScoreWithText: 60,
} as const;

// ─────────────────────────────────────────────
// 2) OCR 재시도/폴백 정책 (Retry & Fallback Policy)
// ─────────────────────────────────────────────
export const RETRY_POLICY = {
    /** 배치 재분석 최대 재시도 횟수 */
    maxRetries: 3,
    /** Rate Limit 감지 시 기본 쿨다운 시간 (분) */
    rateLimitCooldownMin: 15,
    /** 재시도 간 기본 지연 시간 (초) */
    baseDelaySeconds: 4,
    /** 최대 동적 지연 시간 (초) */
    maxDynamicDelaySeconds: 10,
    /** 폴백 발생 시 지연 증분 (초) */
    dynamicDelayIncrement: 2,
    /** 이미지 데이터 최소 길이 (바이트) */
    minImageDataLength: 100,
    /** 서버 요청 타임아웃 (ms) */
    serverTimeoutMs: 25_000,
    /** 서버 최대 이미지 크기 (bytes) */
    maxImageBytes: 8 * 1024 * 1024,
} as const;

// ─────────────────────────────────────────────
// 3) 실패 판정 정책 (Failure Detection Policy)
// ─────────────────────────────────────────────
export const FAILURE_DETECTION = {
    /** 즉시 실패 처리하는 실패코드 목록 */
    hardFailureCodes: ['QUOTA', 'KEY', 'NETWORK', 'PAYLOAD', 'FORMAT', 'PARSE'] as const,
    /** 하드 실패 키워드 (운영 장애 신호) */
    hardFailureKeywords: [
        'resource_exhausted',
        '429',
        'api 요청량',
        '오류 상세',
        '재시도 필요',
        'failed to fetch',
        'timeout',
        'gateway',
        '설정 화면',
        'api 키',
        '분석 실패',
        'parsing failed',
        'json 파싱',
    ] as const,
    /** 서버 폴백 조건 키워드 (서버 장애 → 클라이언트 폴백) */
    serverFallbackKeywords: [
        'failed to fetch',
        'network',
        'timeout',
        'gateway',
        'bad gateway',
        'service unavailable',
        'internal server error',
        '서버 gemini api 키가 설정되지 않았습니다',
        'gemini_api_key',
    ] as const,
    /** 서버 폴백 조건 HTTP 상태코드 */
    serverFallbackStatusCodes: ['404', '500', '502', '503', '504', 'Method Not Allowed'] as const,
} as const;

// ─────────────────────────────────────────────
// 4) UNKNOWN 2차 분류 키워드 (P0: Sub-classification)
// ─────────────────────────────────────────────
export const UNKNOWN_SUBCLASSIFY = {
    /** 네트워크 의심 키워드 */
    networkLike: [
        'failed to fetch',
        'network',
        'timeout',
        'gateway',
        'fetch',
        'econnreset',
        'econnrefused',
        'dns',
        '연결',
        '네트워크',
        '타임아웃',
    ],
    /** 파싱 의심 키워드 */
    parseLike: [
        'parse',
        'json',
        'parsing',
        'unexpected token',
        '파싱',
        '응답 형식',
        'syntax error',
        'empty result',
        'invalid json',
    ],
    /** 정책/권한 의심 키워드 */
    policyLike: [
        'quota',
        '429',
        'resource_exhausted',
        'unauthorized',
        'forbidden',
        'api 키',
        'api key',
        'permission',
        '권한',
        '설정',
        '할당량',
    ],
} as const;

// ─────────────────────────────────────────────
// 5) 승인 사유 품질 게이트 (P1: Approval Reason Gate)
// ─────────────────────────────────────────────
export const APPROVAL_REASON_GATE = {
    /** 최소 사유 텍스트 길이 */
    minLength: 10,
    /** 구조화 인정 패턴: 원인 지시어 */
    causeMarkers: ['원인', '이유', '때문', '인해', '발생', '확인', '누락', '오류'],
    /** 구조화 인정 패턴: 조치 지시어 */
    actionMarkers: ['조치', '수정', '보완', '재분석', '처리', '정상', '완료', '변경', '적용'],
    /** 구조화 인정 패턴: 검증 지시어 */
    verifyMarkers: ['검증', '확인', '이상없음', '정상확인', '재확인', '검토 완료', '적합', '인정'],
    /** 구조 없이 통과 시키는 점수 기준 (이 길이 이상이면 구조 미달도 경고만 표시) */
    bypassLengthThreshold: 30,
} as const;

// ─────────────────────────────────────────────
// 6) 하이브리드 OCR 오케스트레이션 정책 (P1: Hybrid OCR)
// ─────────────────────────────────────────────
export const HYBRID_OCR = {
    /**
     * provider 우선순위 체인
     * 0 = 최우선, 값이 클수록 나중 폴백
     */
    providerChain: [
        { id: 'server_gemini',   priority: 0, label: '서버 Gemini' },
        { id: 'client_gemini',   priority: 1, label: '브라우저 Gemini' },
        { id: 'client_fallback', priority: 2, label: '브라우저 폴백' },
    ],
    /**
     * provider별 자동 비활성화 임계값
     * 연속 실패 횟수가 이 값을 초과하면 해당 provider를 일시 스킵
     */
    autoDisableThreshold: 5,
    /**
     * provider 성능 평가 창 (최근 N건 기준)
     */
    performanceWindowSize: 20,
} as const;

// ─────────────────────────────────────────────
// 7) 리스크 인텔리전스 자동화 설정 (P2: Risk Intelligence)
// ─────────────────────────────────────────────
export const RISK_INTELLIGENCE = {
    /** 월간 리포트 생성 기준 최소 레코드 수 */
    minRecordsForMonthlyReport: 10,
    /** 반복 실패 패턴 감지 임계값 (동일 코드 N건 초과 시 경보) */
    surgeDetectionThreshold: 3,
    /** 최근 N일 기준으로 추세 비교 */
    trendWindowDays: 7,
    /** 이전 기간 비교 창 (일) */
    previousWindowDays: 7,
} as const;
