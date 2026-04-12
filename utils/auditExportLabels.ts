const HARNESS_AUDIT_SECTION_LABELS: Record<string, string> = {
    record: '기록 기본정보',
    persistence: '저장 상태',
    summary: '요약 지표',
    version: '버전 정보',
    override: '룰 오버라이드',
    approval: '승인 이력',
    timeline: '타임라인',
    checklist: '증빙 체크리스트',
};

const HARNESS_AUDIT_ITEM_LABELS: Record<string, string> = {
    recordId: '레코드 ID',
    workerName: '근로자명',
    workflowRunId: '워크플로우 런 ID',
    workflowState: '워크플로우 상태',
    riskDecision: '위험 판단',
    approvalState: '승인 상태',
    secondPassStatus: '2차 상태',
    persisted: '영속 저장 여부',
    overrideCount: '오버라이드 수',
    approvalCount: '승인 이력 수',
    timelineCount: '타임라인 수',
    analyzerSummary: '분석기 요약',
    evaluatorFlags: '평가기 플래그',
    evaluatorEvidenceSufficiency: '증거 충분도',
    allowedTransitionActions: '허용 전이 액션',
    blockedTransitionActions: '차단 전이 액션',
    promptVersion: '프롬프트 버전',
    policyVersion: '정책 버전',
    promptChangeSummary: '프롬프트 변경 요약',
    policyChangeSummary: '정책 변경 요약',
    ruleChangeSummary: '룰 변경 요약',
};

const VERIFICATION_SECTION_LABELS: Record<string, string> = {
    summary: '검증 요약',
    manifest: '매니페스트 정보',
    missingJson: '누락 JSON',
    invalidJson: '파싱 불가 JSON',
    missingHarnessSnapshot: '하네스 스냅샷 누락',
    hashMismatch: '해시 불일치',
    metadataMismatch: '메타 불일치',
};

const VERIFICATION_ITEM_LABELS: Record<string, string> = {
    isValid: '검증 결과',
    primaryFailureReason: '주요 실패 원인',
    recommendedAction: '권장 조치',
    templateConformance: '템플릿 적합성',
    totalEntries: '총 엔트리',
    verifiedEntries: '검증된 엔트리',
    missingJsonFiles: '누락 JSON 수',
    invalidJsonFiles: '파싱 불가 JSON 수',
    hashMismatches: '해시 불일치 수',
    missingHarnessSnapshots: '스냅샷 누락 수',
    metadataMismatches: '메타 불일치 수',
    packageSummaryHashMatched: '요약 해시 일치',
    packageName: '패키지명',
    templateVersion: '템플릿 버전',
    jsonSchemaVersion: 'JSON 스키마 버전',
    readmeFileName: 'README 파일명',
    totalRecords: '총 레코드 수',
    linkedRunCount: '연결된 런 수',
    promptVersions: '프롬프트 버전 목록',
    policyVersions: '정책 버전 목록',
    ruleVersions: '룰 버전 목록',
    overrideCount: '오버라이드 수',
    approvalCount: '승인 수',
    criticalRuleCount: '치명 룰 개입 수',
    ruleImpactRuleCodes: '룰 개입 코드',
    ruleImpactNarrative: '룰 개입 내러티브',
};

const normalizeItemKey = (item: string) => String(item || '').split(':')[0];

export const getHarnessAuditSectionLabel = (section: string): string => {
    return HARNESS_AUDIT_SECTION_LABELS[String(section || '').trim()] || '기타';
};

export const getHarnessAuditItemLabel = (item: string): string => {
    const key = normalizeItemKey(item);
    return HARNESS_AUDIT_ITEM_LABELS[key] || '세부 항목';
};

export const getVerificationSectionLabel = (section: string): string => {
    return VERIFICATION_SECTION_LABELS[String(section || '').trim()] || '기타';
};

export const getVerificationItemLabel = (item: string): string => {
    const key = normalizeItemKey(item);
    return VERIFICATION_ITEM_LABELS[key] || '세부 항목';
};

export const VERIFICATION_HISTORY_HEADER_LABELS: Array<{ key: string; label: string }> = [
    { key: 'verifiedAt', label: '검증 시각' },
    { key: 'manifestFileName', label: '매니페스트 파일명' },
    { key: 'packageName', label: '패키지명' },
    { key: 'result', label: '결과' },
    { key: 'templateConformanceStatus', label: '템플릿 적합 상태' },
    { key: 'templateConformanceDescription', label: '템플릿 적합 설명' },
    { key: 'totalEntries', label: '총 엔트리' },
    { key: 'verifiedEntries', label: '검증 엔트리' },
    { key: 'missingJsonFiles', label: '누락 JSON 수' },
    { key: 'invalidJsonFiles', label: '파싱 불가 JSON 수' },
    { key: 'hashMismatches', label: '해시 불일치 수' },
    { key: 'missingHarnessSnapshots', label: '스냅샷 누락 수' },
    { key: 'metadataMismatches', label: '메타 불일치 수' },
    { key: 'packageSummaryHashMatched', label: '요약 해시 일치' },
    { key: 'primaryFailureReason', label: '주요 실패 원인' },
    { key: 'recommendedAction', label: '권장 조치' },
    { key: 'summaryText', label: '요약 문구' },
];
