export interface EvidenceManifestFileEntry {
    recordId: string;
    name: string;
    date: string;
    pdfFile: string | null;
    jsonFile: string;
    jsonSha256: string;
    evidenceHash: string;
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
    };
    files: EvidenceManifestFileEntry[];
}

export interface EvidenceManifestVerificationResult {
    isValid: boolean;
    totalEntries: number;
    verifiedEntries: number;
    missingJsonFiles: string[];
    hashMismatches: Array<{
        jsonFile: string;
        expectedSha256: string;
        actualSha256: string;
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

export async function verifyEvidenceManifest(
    manifest: EvidenceManifest,
    jsonContentByPath: Record<string, string>
): Promise<EvidenceManifestVerificationResult> {
    const missingJsonFiles: string[] = [];
    const hashMismatches: Array<{
        jsonFile: string;
        expectedSha256: string;
        actualSha256: string;
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
        hashMismatches.length === 0 &&
        packageSummaryHashMatched;

    return {
        isValid,
        totalEntries: manifest.files.length,
        verifiedEntries: verifiedEntries.length,
        missingJsonFiles,
        hashMismatches,
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

    if (result.hashMismatches.length > 0) {
        lines.push(`JSON 해시 불일치: ${result.hashMismatches.length}건`);
    }

    return lines.join('\n');
}
