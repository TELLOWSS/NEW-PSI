import { describe, expect, it } from 'vitest';
import type { EvidencePackageVerification } from '../utils/psiEvidenceArchive';
import { buildPsiHandoffReviewDraft } from '../utils/psiHandoffReview';

const sha = 'a'.repeat(64);
const files: EvidencePackageVerification['fileInventory'] = [
    { path: 'record/snapshot.json', sha256: 'b'.repeat(64), bytes: 842, mimeType: 'text/plain; charset=utf-8' },
    { path: 'record/timeline.txt', sha256: 'c'.repeat(64), bytes: 250, mimeType: 'text/plain; charset=utf-8' },
    { path: 'assets/currently-stored-original-form.jpg', sha256: 'd'.repeat(64), bytes: 7000, mimeType: 'image/jpeg' },
];
const verification = (changes: Partial<EvidencePackageVerification> = {}): EvidencePackageVerification => ({
    verified: true, checkedFiles: files.length + 1, zipSha256: sha,
    externallyAnchored: true, errors: [], fileInventory: files,
    description: 'All internal and separately stored SHA-256 checks match',
    ...changes,
});
const input = () => ({
    workerRecordId: 'synthetic-worker-01',
    packageName: 'PSI_evidence_synthetic-worker-01.zip',
    purpose: '산업안전 관련 사실관계 확인을 위한 요청자료 검토',
    recipientOrganization: '가상 감독기관',
    requestReference: '모의공문-2026-001',
    reviewerName: '가상 관리자',
    proposedFiles: ['record/timeline.txt'],
    notes: '개인 신원 공개 필요성 별도 검토',
    separatelyStoredHashReference: '격리된 해시대장-01',
    generatedAt: '2026-11-01T00:00:00Z',
});

describe('PSI restricted evidence handoff review', () => {
    it('uses verified contents while keeping submission approval and transfer false', () => {
        const result = buildPsiHandoffReviewDraft(verification(),input());
        expect(result.schema).toBe('psi-handoff-review-draft-v1');
        expect(result.status).toBe('LOCAL_REVIEW_DRAFT_NOT_AUTHORIZED');
        expect(result.checkedPackage.sha256).toBe(sha);
        expect(result.checkedPackage.proposedFiles.map(file => file.path)).toEqual(['record/timeline.txt']);
        expect(result.checkedPackage.omittedFiles).toHaveLength(2);
        expect(result.checkedPackage.proposedFilesAreNotAnExport).toBe(true);
        expect(result.limitations).toEqual({
            approvedByAuthenticatedAuthority: false,
            sentToRecipient: false,
            storedInServerAuditLog: false,
            digitallySigned: false,
            originalZipModified: false,
            legalEvidenceCertified: false,
        });
        expect(JSON.stringify(result)).not.toContain('originalImage');
        expect(result.warnings.join(' ')).toContain('실제 원본 ZIP은 전체 자료');
    });
    it('fails closed without an external fingerprint or with any mismatch', () => {
        expect(() => buildPsiHandoffReviewDraft(verification({externallyAnchored:false}),input())).toThrow('별도로 보관한 ZIP');
        expect(() => buildPsiHandoffReviewDraft(verification({verified:false}),input())).toThrow('별도로 보관한 ZIP');
        expect(() => buildPsiHandoffReviewDraft(verification({errors:['altered file']}),input())).toThrow('별도로 보관한 ZIP');
    });
    it('rejects selections outside the checked ZIP, duplicates, and zero-file plans', () => {
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),proposedFiles:['not-in-zip.pdf']})).toThrow('원본 ZIP에 없는');
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),proposedFiles:[]})).toThrow('하나 이상');
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),proposedFiles:['record/timeline.txt','record/timeline.txt']})).toThrow('중복 없이');
    });
    it('requires purpose, destination, request, reviewer and separate hash custody reference', () => {
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),purpose:'짧음'})).toThrow();
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),recipientOrganization:''})).toThrow();
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),requestReference:''})).toThrow();
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),reviewerName:''})).toThrow();
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),separatelyStoredHashReference:''})).toThrow();
    });
    it('prevents an untrusted inventory or bad timestamp from presenting an authorized release', () => {
        expect(() => buildPsiHandoffReviewDraft(verification({fileInventory:[]}),input())).toThrow('파일 목록');
        expect(() => buildPsiHandoffReviewDraft(verification({fileInventory:[files[0],files[0]]}),input())).toThrow('중복');
        expect(() => buildPsiHandoffReviewDraft(verification(),{...input(),generatedAt:'invalid-date'})).toThrow('시각');
    });
});
