import type { WorkerRecord } from '../types';
import { buildWorkerInterpretationNote } from './workerInterpretationNote';

export const PSI_EVIDENCE_READINESS_VERSION = 'psi-evidence-readiness-v1';

export interface PsiEvidenceReadinessFinding {
    code: string;
    severity: 'critical' | 'review' | 'information';
    title: string;
    message: string;
}

export interface PsiEvidenceReadiness {
    findings: PsiEvidenceReadinessFinding[];
    criticalCount: number;
    reviewCount: number;
    originalSource: 'stored-image' | 'missing' | 'non-embedded-reference';
    sourceQuestionCount: number;
    translationCount: number;
    followupCaseCount: number;
    completedCaseCount: number;
    unsupportedCompletionCount: number;
    /** True only that contents can be rendered; NOT that evidence is admissible. */
    hasRecordContent: boolean;
    externallyTimestamped: false;
    certifiedForLegalUse: false;
}

const isEmbeddedImage = (value: unknown): boolean =>
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(String(value || '').trim());

/**
 * Show deficiencies BEFORE confidential evidence export.
 * This evaluates only the CURRENT mutable browser record. It does not assess
 * truthfulness, compliance, authorship, admission of evidence, or culpability.
 */
export const evaluatePsiEvidenceReadiness = (record: WorkerRecord): PsiEvidenceReadiness => {
    const findings: PsiEvidenceReadinessFinding[] = [];
    const add = (severity: PsiEvidenceReadinessFinding['severity'], code: string, title: string, message: string) =>
        findings.push({ severity, code, title, message });

    const answers = buildWorkerInterpretationNote(record);
    const originalSource: PsiEvidenceReadiness['originalSource'] = !record.originalImage
        ? 'missing'
        : isEmbeddedImage(record.originalImage)
            ? 'stored-image'
            : 'non-embedded-reference';

    if (originalSource !== 'stored-image') {
        add('critical', 'SOURCE_MISSING',
            '자필 원본 미동봉',
            originalSource === 'missing'
                ? '현재 기록에 원본 양식 이미지가 없습니다. 원본을 별도 확보하고 생성·등록 경위를 확인해야 합니다.'
                : '원본 이미지가 ZIP에 직접 담을 수 있는 형식이 아닙니다. 외부 참조/원본을 별도로 확보해야 합니다.');
    } else {
        add('information', 'SOURCE_CURRENT_ONLY', '원본 존재 시점은 별도 확인',
            '보관된 이미지가 있다고 해서 평가 작성일이나 사고 시각에 동일한 파일이 존재했다는 뜻은 아닙니다.');
    }

    if (answers.sourceCount < 5) add('critical', 'OCR_INCOMPLETE', '자필 문항 누락',
        '5개 문항 중 원문 ' + answers.sourceCount + '개만 입력됐습니다. 원본 대조와 누락 여부 확인이 필요합니다.');
    if (answers.translationCount < answers.sourceCount) add('review', 'TRANSLATION_GAPS', '원문 대비 번역 누락',
        '자필 원문 ' + answers.sourceCount + '개에 대해 번역은 ' + answers.translationCount + '개가 저장돼 있습니다.');
    if (answers.sourceCount && String(record.language || '').toLowerCase() !== 'ko') {
        add('review', 'NATIVE_REVIEW_UNCERTIFIED', '모국어 번역 검수 확인 필요',
            '관리자 기록 승인과 모국어 번역 적합성 검수는 별개입니다. 원문·번역을 직접 대조해야 합니다.');
    }

    const followups = (record.riskFollowupEvents || []).filter(Boolean);
    const uniqueCases = new Set(followups.map(event => event.caseId).filter(Boolean));
    const completed = followups.filter(event => event.status === 'completed');
    const unsupportedCompletion = completed.filter(event =>
        !String(event.evidenceReference || '').trim() && !String(event.evidencePhoto || '').trim()
    );
    if (unsupportedCompletion.length) add('review', 'SELF_REPORTED_COMPLETION',
        '조치완료의 독립 증빙 확인 필요',
        '완료 기록 ' + unsupportedCompletion.length + '건은 사진이나 외부 증빙 참조 없이 관리자 서술에 의존합니다. 실제 시정 여부를 별도 확인하세요.');
    if (followups.some(event => !event.timestamp || !Number.isFinite(Date.parse(event.timestamp)))) {
        add('review', 'FOLLOWUP_TIME_INVALID', '현장조치 시각 검토 필요',
            '일부 조치의 시간 필드가 없거나 해석 불가능합니다. 사고시점 기준 선별에 포함될 수 없습니다.');
    }
    if ((record.practiceVerificationEvents || []).some(event =>
        event.result === 'observed_safe' && !String(event.evidenceReference || '').trim()
    )) {
        add('review', 'PRACTICE_PROOF_MISSING', '안전행동 관찰 근거 확인 필요',
            '관찰 완료 서술 중 증빙 참조가 없는 항목이 있습니다. 교육 출석과 실제 관찰을 혼동하지 마세요.');
    }
    if (!record.approvedBy || !record.approvedAt) add('review', 'APPROVAL_METADATA_INCOMPLETE',
        '관리자 승인 이력 확인',
        '현재 기록에 승인자와 승인시각이 모두 확인되지 않습니다. 정식 검토·승인 여부를 별도 확인하세요.');
    if (!record.correctionHistory?.length) add('information', 'CORRECTION_HISTORY_NOT_FOUND',
        '과거 원문·번역의 변경 여부 미확인',
        '수정 이력이 없다는 사실만으로 한 번도 수정되지 않았다고 입증할 수는 없습니다.');

    add('critical', 'SERVER_RECEIPT_UNPROVEN', '서버 최초 수신시각·불변 원본 인증 미구현',
        '현재 근로자 기록의 시간·변경 이력은 독립 서버의 신뢰 시각·불변 저장으로 검증되지 않습니다.');
    add('information', 'EXPORT_HASH_SCOPE', 'ZIP 해시의 범위',
        'SHA-256은 내보낸 사본의 이후 변경 여부 확인용입니다. 별도 보관한 해시의 최초 기록 시점도 입증해야 합니다.');
    add('information', 'PERSONAL_DATA_EXPORT', '개인정보 반출 주의',
        '내부 ZIP에 근로자 식별정보와 현장 사진이 포함될 수 있습니다. 승인된 보관·공유 절차를 따르세요.');

    return {
        findings,
        criticalCount: findings.filter(item => item.severity === 'critical').length,
        reviewCount: findings.filter(item => item.severity === 'review').length,
        originalSource,
        sourceQuestionCount: answers.sourceCount,
        translationCount: answers.translationCount,
        followupCaseCount: uniqueCases.size,
        completedCaseCount: completed.length,
        unsupportedCompletionCount: unsupportedCompletion.length,
        hasRecordContent: Boolean(answers.sourceCount || followups.length || record.practiceVerificationEvents?.length || record.originalImage),
        externallyTimestamped: false,
        certifiedForLegalUse: false,
    };
};
