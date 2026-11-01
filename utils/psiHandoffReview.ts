import type { EvidencePackageVerification, EvidenceManifest } from './psiEvidenceArchive';

export const PSI_HANDOFF_REVIEW_SCHEMA = 'psi-handoff-review-draft-v1';

export type HandoffFile = EvidenceManifest['fileHashes'][number];

export interface PsiHandoffReviewInput {
    workerRecordId: string;
    packageName: string;
    purpose: string;
    recipientOrganization: string;
    requestReference: string;
    reviewerName: string;
    proposedFiles: string[];
    notes: string;
    separatelyStoredHashReference: string;
    generatedAt: string;
}

export interface PsiHandoffReviewDraft {
    schema: typeof PSI_HANDOFF_REVIEW_SCHEMA;
    status: 'LOCAL_REVIEW_DRAFT_NOT_AUTHORIZED';
    createdAt: string;
    originatingRecordId: string;
    proposedDestination: string;
    disclosurePurpose: string;
    requestReference: string;
    reviewerClaimedName: string;
    reviewNotes: string;
    checkedPackage: {
        filename: string;
        sha256: string;
        userSuppliedSha256Matched: true;
        separatelyStoredHashReference: string;
        sourceFiles: HandoffFile[];
        proposedFiles: HandoffFile[];
        omittedFiles: HandoffFile[];
        /** This list is only a recommendation. The original ZIP is NOT redacted or reduced. */
        proposedFilesAreNotAnExport: true;
    };
    limitations: {
        approvedByAuthenticatedAuthority: false;
        sentToRecipient: false;
        storedInServerAuditLog: false;
        digitallySigned: false;
        externalHashCustodyAuthenticated: false;
        originalZipModified: false;
        legalEvidenceCertified: false;
    };
    warnings: string[];
}

const restrictedText = (value: unknown, max: number, min = 1): string => {
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
        throw new Error('제출 검토 목적·요청 근거·담당자 항목을 확인하세요.');
    }
    return value.trim();
};
const id = (value: string): string => restrictedText(value, 160);

export const buildPsiHandoffReviewDraft = (
    verification: EvidencePackageVerification,
    input: PsiHandoffReviewInput,
): PsiHandoffReviewDraft => {
    if (!verification.verified || verification.errors.length || !verification.externallyAnchored) {
        throw new Error('먼저 별도로 보관한 ZIP 전체 SHA-256을 입력하고 실제 ZIP의 무결성 대조에 성공해야 합니다.');
    }
    if (!/^[a-f0-9]{64}$/.test(verification.zipSha256)) {
        throw new Error('검증된 ZIP 해시값이 올바르지 않습니다.');
    }
    if (!Number.isFinite(Date.parse(input.generatedAt))) throw new Error('검토서 작성시각이 올바르지 않습니다.');
    const workerRecordId = id(input.workerRecordId);
    if (verification.recordId !== workerRecordId) {
        throw new Error('선택한 ZIP의 원본 기록 ID가 현재 검토 중인 근로자 기록과 일치하지 않습니다.');
    }
    const filename = restrictedText(input.packageName, 240);
    const purpose = restrictedText(input.purpose, 300, 10);
    const recipient = restrictedText(input.recipientOrganization, 160, 2);
    const reference = restrictedText(input.requestReference, 200, 2);
    const reviewer = restrictedText(input.reviewerName, 100, 2);
    const storageReference = restrictedText(input.separatelyStoredHashReference, 250, 2);
    const notes = input.notes.trim().slice(0, 1200);
    const inventory = verification.fileInventory;
    if (!inventory?.length || inventory.some(file => !file.path || !/^[a-f0-9]{64}$/.test(file.sha256))) {
        throw new Error('원본 ZIP의 파일 목록이 확인되지 않았습니다. 패키지를 다시 검증하세요.');
    }
    const names = new Set(inventory.map(file => file.path));
    if (names.size !== inventory.length) throw new Error('중복 파일명이 발견됐습니다.');
    const proposed = new Set(input.proposedFiles);
    if (!proposed.size || proposed.size !== input.proposedFiles.length) {
        throw new Error('제출 후보 자료를 하나 이상 중복 없이 선택하세요.');
    }
    if ([...proposed].some(path => !names.has(path))) {
        throw new Error('원본 ZIP에 없는 자료를 제출 후보로 선택할 수 없습니다.');
    }
    const selected = inventory.filter(file => proposed.has(file.path));
    const omitted = inventory.filter(file => !proposed.has(file.path));
    return {
        schema: PSI_HANDOFF_REVIEW_SCHEMA,
        status: 'LOCAL_REVIEW_DRAFT_NOT_AUTHORIZED',
        createdAt: input.generatedAt,
        originatingRecordId: workerRecordId,
        proposedDestination: recipient,
        disclosurePurpose: purpose,
        requestReference: reference,
        reviewerClaimedName: reviewer,
        reviewNotes: notes,
        checkedPackage: {
            filename,
            sha256: verification.zipSha256,
            userSuppliedSha256Matched: true,
            separatelyStoredHashReference: storageReference,
            sourceFiles: inventory.map(file => ({...file})),
            proposedFiles: selected.map(file => ({...file})),
            omittedFiles: omitted.map(file => ({...file})),
            proposedFilesAreNotAnExport: true,
        },
        limitations: {
            approvedByAuthenticatedAuthority: false,
            sentToRecipient: false,
            storedInServerAuditLog: false,
            digitallySigned: false,
            externalHashCustodyAuthenticated: false,
            originalZipModified: false,
            legalEvidenceCertified: false,
        },
        warnings: [
            '이 문서는 브라우저에서 작성된 제출 검토 초안입니다. 인증된 승인·서버 감사로그·실제 전송 기록이 아닙니다.',
            'SHA-256은 사용자가 입력한 값과 ZIP이 일치하는지만 확인합니다. 별도 해시 보관대장의 최초 작성 시점·출처·독립성은 인증하지 않습니다.',
            '선택한 파일 목록은 검토 후보입니다. 실제 원본 ZIP은 전체 자료를 포함하고 있으며 선택 결과대로 삭제하거나 가려지지 않습니다.',
            '개인 식별 및 현장 사진이 포함될 수 있습니다. 외부 제출 전에 별도 승인, 필요 자료 최소화, 비식별 조치, 법적 요청 범위를 확인하세요.',
            '서버 수신시각/원본 최초 생성시각/법적 진정성은 현행 ZIP 해시 검증만으로 증명하지 못합니다.',
        ],
    };
};
