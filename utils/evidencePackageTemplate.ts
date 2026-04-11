import type { EvidenceManifest, EvidenceManifestFileEntry } from './evidenceVerificationUtils';

export const EVIDENCE_PACKAGE_TEMPLATE_VERSION = '2026-04-11.1';
export const EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION = 'psi-evidence-package/v1';
export const EVIDENCE_PACKAGE_README_FILE_NAME = 'README.txt';

export type EvidencePackageVersionLineBuilder = (version: string) => string;

export const buildEvidencePackageJsonMeta = (input: {
    generatedAt: string;
    teamFilter: string;
    levelFilter: string;
    dateFilterPreset: string;
    dateRangeStart: string;
    dateRangeEnd: string;
}) => ({
    templateVersion: EVIDENCE_PACKAGE_TEMPLATE_VERSION,
    jsonSchemaVersion: EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION,
    generatedAt: input.generatedAt,
    teamFilter: input.teamFilter,
    levelFilter: input.levelFilter,
    dateFilterPreset: input.dateFilterPreset,
    dateRangeStart: input.dateRangeStart,
    dateRangeEnd: input.dateRangeEnd,
});

export const buildEvidencePackageReadme = (input: {
    generatedAtLabel: string;
    totalRecords: number;
    dateFilterPreset: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    packageJsonIndexSha256: string;
    promptVersions: string[];
    policyVersions: string[];
    ruleVersions: string[];
    versionChangeLines: string[];
    approvalDiffLines: string[];
    overrideSummaryLines: string[];
    describeVersion: EvidencePackageVersionLineBuilder;
}) => {
    const promptVersionLines = input.promptVersions.map(input.describeVersion);
    const policyVersionLines = input.policyVersions.map(input.describeVersion);
    const ruleVersionLines = input.ruleVersions.map(input.describeVersion);

    return [
        'PSI 증빙 패키지 ZIP',
        `템플릿 버전: ${EVIDENCE_PACKAGE_TEMPLATE_VERSION}`,
        `JSON 스키마 버전: ${EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION}`,
        `생성일시: ${input.generatedAtLabel}`,
        `대상 수: ${input.totalRecords}`,
        `기간 프리셋: ${input.dateFilterPreset}`,
        `적용 시작일: ${input.dateRangeStart}`,
        `적용 종료일: ${input.dateRangeEnd}`,
        '구성: pdf/, json/, evidence_index.csv, manifest.json, README.txt',
        'JSON 확장: record 외에 harnessAuditSnapshot(prompt/policy/analyzer/evaluator/override/approval/context/timeline)이 포함될 수 있습니다.',
        '무결성 검증: manifest.json의 files[].jsonSha256 값과 json 파일 SHA-256 해시를 비교하세요.',
        '패키지 요약 해시: manifest.summary.packageJsonIndexSha256 값으로 전체 JSON 집합의 일관성을 검증하세요.',
        'CSV 메타: evidence_index.csv 상단 #packageJsonIndexSha256 값으로 동일 검증 가능합니다.',
        '---',
        'Prompt Versions',
        ...(promptVersionLines.length > 0 ? promptVersionLines : ['- 포함된 프롬프트 버전 없음']),
        'Policy Versions',
        ...(policyVersionLines.length > 0 ? policyVersionLines : ['- 포함된 정책 버전 없음']),
        'Rule Versions',
        ...(ruleVersionLines.length > 0 ? ruleVersionLines : ['- 포함된 룰 버전 없음']),
        'Version Change Summary',
        ...(input.versionChangeLines.length > 0 ? input.versionChangeLines : ['- 포함된 버전 변경 요약 없음']),
        'Approval Diff Summary',
        ...(input.approvalDiffLines.length > 0 ? input.approvalDiffLines : ['- 포함된 승인 diff 요약 없음']),
        'Override Summary',
        ...(input.overrideSummaryLines.length > 0 ? input.overrideSummaryLines : ['- 포함된 오버라이드 요약 없음']),
        'PowerShell 예시: Get-FileHash -Algorithm SHA256 .\\json\\파일명.json',
        'OpenSSL 예시: openssl dgst -sha256 ./json/파일명.json',
    ].join('\n');
};

export const buildEvidenceManifest = (input: {
    packageName: string;
    generatedAt: string;
    totalRecords: number;
    teamFilter: string;
    levelFilter: string;
    dateFilterPreset: string;
    dateRangeStart: string;
    dateRangeEnd: string;
    packageJsonIndexSha256: string;
    files: EvidenceManifestFileEntry[];
}): EvidenceManifest => ({
    packageName: input.packageName,
    generatedAt: input.generatedAt,
    summary: {
        totalRecords: input.totalRecords,
        teamFilter: input.teamFilter,
        levelFilter: input.levelFilter,
        dateFilterPreset: input.dateFilterPreset,
        dateRangeStart: input.dateRangeStart,
        dateRangeEnd: input.dateRangeEnd,
        jsonHashAlgorithm: 'SHA-256',
        packageJsonIndexSha256: input.packageJsonIndexSha256,
        packageJsonIndexSourceFormat: 'jsonPath:jsonSha256 per line',
        csvIncludesMetaHeader: true,
        harnessAuditSnapshotIncluded: true,
        templateVersion: EVIDENCE_PACKAGE_TEMPLATE_VERSION,
        jsonSchemaVersion: EVIDENCE_PACKAGE_JSON_SCHEMA_VERSION,
        readmeFileName: EVIDENCE_PACKAGE_README_FILE_NAME,
    },
    files: input.files,
});
