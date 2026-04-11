export interface EvidenceManifestFileEntry {
    recordId: string;
    name: string;
    date: string;
    pdfFile: string | null;
    jsonFile: string;
    jsonSha256: string;
    evidenceHash: string;
    workflowRunId?: string;
    promptVersion?: string | null;
    policyVersion?: string | null;
    ruleVersions?: string[];
    approvalCount?: number;
    overrideCount?: number;
    ruleImpactSummary?: {
        totalCount: number;
        criticalCount: number;
        narrative: string;
        ruleCodes: string[];
    };
    versionChangeSummary?: {
        prompt: string[];
        policy: string[];
        rule: string[];
    };
}

export interface EvidenceManifest {
    packageName: string;
    generatedAt: string;
    summary: {
        totalRecords: number;
        teamFilter: string;
        levelFilter: string;
        dateFilterPreset: string;
        dateRangeStart: string;
        dateRangeEnd: string;
        jsonHashAlgorithm?: string;
        packageJsonIndexSha256?: string;
        packageJsonIndexSourceFormat?: string;
        csvIncludesMetaHeader?: boolean;
        harnessAuditSnapshotIncluded?: boolean;
        templateVersion?: string;
        jsonSchemaVersion?: string;
        readmeFileName?: string;
    };
    files: EvidenceManifestFileEntry[];
}

export interface EvidenceManifestVerificationResult {
    isValid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    missingJsonFiles: string[];
    invalidJsonFiles: string[];
    missingHarnessSnapshots: string[];
    hashMismatches: Array<{
        jsonFile: string;
        expectedSha256: string;
        actualSha256: string;
    }>;
    metadataMismatches: Array<{
        jsonFile: string;
        field: string;
        expected: string;
        actual: string;
    }>;
    packageSummaryHashExpected: string;
    packageSummaryHashActual: string;
    packageSummaryHashMatched: boolean;
}

const sha256Hex = async (text: string): Promise<string> => {
    const subtle = window?.crypto?.subtle;
    if (!subtle) {
        throw new Error('이 브라우저는 crypto.subtle(SHA-256)을 지원하지 않습니다.');
    }
    const encoded = new TextEncoder().encode(text);
    const digest = await subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('');
};

const buildPackageSummarySource = (entries: Array<{ jsonFile: string; jsonSha256: string }>): string => {
    return entries
        .map((entry) => `${entry.jsonFile}:${entry.jsonSha256}`)
        .join('\n');
};

const normalizeOptionalString = (value: unknown): string => {
    return typeof value === 'string' ? value.trim() : '';
};

const normalizeStringArray = (values: unknown): string[] => {
    if (!Array.isArray(values)) {
        return [];
    }

    return Array.from(new Set(values
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
};

const toComparableListText = (values: string[]): string => {
    return values.length > 0 ? values.join(' | ') : '-';
};

export async function verifyEvidenceManifest(
    manifest: EvidenceManifest,
    jsonContentByPath: Record<string, string>
): Promise<EvidenceManifestVerificationResult> {
    const missingJsonFiles: string[] = [];
    const invalidJsonFiles: string[] = [];
    const missingHarnessSnapshots: string[] = [];
    const hashMismatches: Array<{
        jsonFile: string;
        expectedSha256: string;
        actualSha256: string;
    }> = [];
    const metadataMismatches: Array<{
        jsonFile: string;
        field: string;
        expected: string;
        actual: string;
    }> = [];

    const verifiedEntries: Array<{ jsonFile: string; jsonSha256: string }> = [];

    for (const entry of manifest.files) {
        const jsonContent = jsonContentByPath[entry.jsonFile];
        if (typeof jsonContent !== 'string') {
            missingJsonFiles.push(entry.jsonFile);
            continue;
        }

        const actualSha256 = await sha256Hex(jsonContent);
        if (actualSha256 !== entry.jsonSha256) {
            hashMismatches.push({
                jsonFile: entry.jsonFile,
                expectedSha256: entry.jsonSha256,
                actualSha256,
            });
            continue;
        }

        let parsedJson: any = null;
        try {
            parsedJson = JSON.parse(jsonContent);
        } catch {
            invalidJsonFiles.push(entry.jsonFile);
            continue;
        }

        const harnessAuditSnapshot = parsedJson?.harnessAuditSnapshot;
        const expectedRuleVersions = normalizeStringArray(entry.ruleVersions || []);
        const actualRuleVersions = normalizeStringArray((harnessAuditSnapshot?.overrides || []).map((override: any) => override?.ruleVersion));
        const expectedVersionChangeSummary = {
            prompt: normalizeStringArray(entry.versionChangeSummary?.prompt || []),
            policy: normalizeStringArray(entry.versionChangeSummary?.policy || []),
            rule: normalizeStringArray(entry.versionChangeSummary?.rule || []),
        };
        const actualVersionChangeSummary = {
            prompt: normalizeStringArray(harnessAuditSnapshot?.versionChangeSummary?.prompt || []),
            policy: normalizeStringArray(harnessAuditSnapshot?.versionChangeSummary?.policy || []),
            rule: normalizeStringArray(harnessAuditSnapshot?.versionChangeSummary?.rule || []),
        };
        const expectedRuleImpactSummary = {
            totalCount: Number(entry.ruleImpactSummary?.totalCount || 0),
            criticalCount: Number(entry.ruleImpactSummary?.criticalCount || 0),
            narrative: normalizeOptionalString(entry.ruleImpactSummary?.narrative),
            ruleCodes: normalizeStringArray(entry.ruleImpactSummary?.ruleCodes || []),
        };
        const actualRuleImpactSummary = {
            totalCount: Number(harnessAuditSnapshot?.ruleImpactSummary?.totalCount || 0),
            criticalCount: Number(harnessAuditSnapshot?.ruleImpactSummary?.criticalCount || 0),
            narrative: normalizeOptionalString(harnessAuditSnapshot?.ruleImpactSummary?.narrative),
            ruleCodes: normalizeStringArray((harnessAuditSnapshot?.ruleImpactSummary?.items || []).map((item: any) => item?.ruleCode)),
        };

        const expectsHarnessSnapshot = Boolean(
            normalizeOptionalString(entry.workflowRunId) ||
            normalizeOptionalString(entry.promptVersion) ||
            normalizeOptionalString(entry.policyVersion) ||
            expectedRuleVersions.length > 0 ||
            Number(entry.approvalCount || 0) > 0 ||
            Number(entry.overrideCount || 0) > 0 ||
            expectedRuleImpactSummary.totalCount > 0 ||
            expectedRuleImpactSummary.criticalCount > 0 ||
            expectedRuleImpactSummary.ruleCodes.length > 0 ||
            expectedVersionChangeSummary.prompt.length > 0 ||
            expectedVersionChangeSummary.policy.length > 0 ||
            expectedVersionChangeSummary.rule.length > 0
        );

        if (expectsHarnessSnapshot && !harnessAuditSnapshot) {
            missingHarnessSnapshots.push(entry.jsonFile);
            continue;
        }

        if (harnessAuditSnapshot) {
            const comparisons: Array<{ field: string; expected: string; actual: string; enabled: boolean }> = [
                {
                    field: 'workflowRunId',
                    expected: normalizeOptionalString(entry.workflowRunId),
                    actual: normalizeOptionalString(harnessAuditSnapshot.workflowRunId),
                    enabled: normalizeOptionalString(entry.workflowRunId).length > 0,
                },
                {
                    field: 'promptVersion',
                    expected: normalizeOptionalString(entry.promptVersion),
                    actual: normalizeOptionalString(harnessAuditSnapshot?.promptVersion?.version),
                    enabled: normalizeOptionalString(entry.promptVersion).length > 0,
                },
                {
                    field: 'policyVersion',
                    expected: normalizeOptionalString(entry.policyVersion),
                    actual: normalizeOptionalString(harnessAuditSnapshot?.policyVersion?.version),
                    enabled: normalizeOptionalString(entry.policyVersion).length > 0,
                },
                {
                    field: 'ruleVersions',
                    expected: toComparableListText(expectedRuleVersions),
                    actual: toComparableListText(actualRuleVersions),
                    enabled: expectedRuleVersions.length > 0,
                },
                {
                    field: 'approvalCount',
                    expected: String(Number(entry.approvalCount || 0)),
                    actual: String(Array.isArray(harnessAuditSnapshot?.approvals) ? harnessAuditSnapshot.approvals.length : 0),
                    enabled: typeof entry.approvalCount !== 'undefined',
                },
                {
                    field: 'overrideCount',
                    expected: String(Number(entry.overrideCount || 0)),
                    actual: String(Array.isArray(harnessAuditSnapshot?.overrides) ? harnessAuditSnapshot.overrides.length : 0),
                    enabled: typeof entry.overrideCount !== 'undefined',
                },
                {
                    field: 'ruleImpactSummary.totalCount',
                    expected: String(expectedRuleImpactSummary.totalCount),
                    actual: String(actualRuleImpactSummary.totalCount),
                    enabled: typeof entry.ruleImpactSummary !== 'undefined',
                },
                {
                    field: 'ruleImpactSummary.criticalCount',
                    expected: String(expectedRuleImpactSummary.criticalCount),
                    actual: String(actualRuleImpactSummary.criticalCount),
                    enabled: typeof entry.ruleImpactSummary !== 'undefined',
                },
                {
                    field: 'ruleImpactSummary.ruleCodes',
                    expected: toComparableListText(expectedRuleImpactSummary.ruleCodes),
                    actual: toComparableListText(actualRuleImpactSummary.ruleCodes),
                    enabled: expectedRuleImpactSummary.ruleCodes.length > 0,
                },
                {
                    field: 'ruleImpactSummary.narrative',
                    expected: expectedRuleImpactSummary.narrative,
                    actual: actualRuleImpactSummary.narrative,
                    enabled: expectedRuleImpactSummary.narrative.length > 0,
                },
                {
                    field: 'versionChangeSummary.prompt',
                    expected: toComparableListText(expectedVersionChangeSummary.prompt),
                    actual: toComparableListText(actualVersionChangeSummary.prompt),
                    enabled: expectedVersionChangeSummary.prompt.length > 0,
                },
                {
                    field: 'versionChangeSummary.policy',
                    expected: toComparableListText(expectedVersionChangeSummary.policy),
                    actual: toComparableListText(actualVersionChangeSummary.policy),
                    enabled: expectedVersionChangeSummary.policy.length > 0,
                },
                {
                    field: 'versionChangeSummary.rule',
                    expected: toComparableListText(expectedVersionChangeSummary.rule),
                    actual: toComparableListText(actualVersionChangeSummary.rule),
                    enabled: expectedVersionChangeSummary.rule.length > 0,
                },
            ];

            for (const comparison of comparisons) {
                if (!comparison.enabled) {
                    continue;
                }

                if (comparison.expected !== comparison.actual) {
                    metadataMismatches.push({
                        jsonFile: entry.jsonFile,
                        field: comparison.field,
                        expected: comparison.expected,
                        actual: comparison.actual,
                    });
                }
            }
        }

        verifiedEntries.push({
            jsonFile: entry.jsonFile,
            jsonSha256: actualSha256,
        });
    }

    const packageSummarySource = buildPackageSummarySource(
        manifest.files.map((entry) => ({
            jsonFile: entry.jsonFile,
            jsonSha256: entry.jsonSha256,
        }))
    );
    const packageSummaryHashActual = await sha256Hex(packageSummarySource);
    const packageSummaryHashExpected = manifest.summary.packageJsonIndexSha256 || '';
    const packageSummaryHashMatched =
        packageSummaryHashExpected.length > 0 && packageSummaryHashExpected === packageSummaryHashActual;

    const isValid =
        missingJsonFiles.length === 0 &&
        invalidJsonFiles.length === 0 &&
        missingHarnessSnapshots.length === 0 &&
        hashMismatches.length === 0 &&
        metadataMismatches.length === 0 &&
        packageSummaryHashMatched;

    return {
        isValid,
        totalEntries: manifest.files.length,
        verifiedEntries: verifiedEntries.length,
        missingJsonFiles,
        invalidJsonFiles,
        missingHarnessSnapshots,
        hashMismatches,
        metadataMismatches,
        packageSummaryHashExpected,
        packageSummaryHashActual,
        packageSummaryHashMatched,
    };
}

export function formatEvidenceVerificationSummary(result: EvidenceManifestVerificationResult): string {
    const lines: string[] = [];
    lines.push(`검증결과: ${result.isValid ? '성공' : '실패'}`);
    lines.push(`검증대상: ${result.totalEntries}건 / 성공: ${result.verifiedEntries}건`);

    if (!result.packageSummaryHashMatched) {
        lines.push('패키지 요약 해시 불일치');
    }

    if (result.missingJsonFiles.length > 0) {
        lines.push(`누락 JSON: ${result.missingJsonFiles.length}건`);
    }

    if (result.invalidJsonFiles.length > 0) {
        lines.push(`파싱 불가 JSON: ${result.invalidJsonFiles.length}건`);
    }

    if (result.hashMismatches.length > 0) {
        lines.push(`JSON 해시 불일치: ${result.hashMismatches.length}건`);
    }

    if (result.missingHarnessSnapshots.length > 0) {
        lines.push(`하네스 스냅샷 누락: ${result.missingHarnessSnapshots.length}건`);
    }

    if (result.metadataMismatches.length > 0) {
        lines.push(`Manifest/JSON 메타 불일치: ${result.metadataMismatches.length}건`);
    }

    return lines.join('\n');
}
