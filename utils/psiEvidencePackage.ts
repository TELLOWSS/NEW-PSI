import type { WorkerRecord } from '../types';
import { buildWorkerInterpretationNote } from './workerInterpretationNote';

/**
 * A snapshot of what the CURRENT PSI record contains. It is not a trusted,
 * immutable historic snapshot and does not establish when source material
 * first existed. Filtering events by their stored times is indicative only.
 */
export const PSI_EVIDENCE_PACKAGE_VERSION = 'psi-evidence-package-v1';

type TimedEntry = { timestamp: string };
type TimeFilter<T> = { included: T[]; futureExcluded: number; invalidExcluded: number };
export type EvidenceAsset = { path: string; base64: string; mimeType: string };
export type EvidencePackageDraft = {
    cutoffIso: string | null;
    exportedAt: string;
    files: Array<{ path: string; text: string }>;
    assets: EvidenceAsset[];
    warnings: string[];
    counts: { originalAnswers: number; sourceImages: number; actionEvents: number; practiceEvents: number; totalAttachments: number };
};

const filterTimes = <T extends TimedEntry>(entries: readonly T[] = [], cutoffIso: string | null): TimeFilter<T> => {
    if (!cutoffIso) return { included: [...entries], futureExcluded: 0, invalidExcluded: 0 };
    const cutoff = Date.parse(cutoffIso);
    if (!Number.isFinite(cutoff)) throw new Error('기준시각 형식이 올바르지 않습니다.');
    const included: T[] = [];
    let futureExcluded = 0;
    let invalidExcluded = 0;
    for (const event of entries) {
        const time = Date.parse(String(event?.timestamp || ''));
        if (!Number.isFinite(time)) { invalidExcluded++; continue; }
        if (time > cutoff) { futureExcluded++; continue; }
        included.push(event);
    }
    return { included, futureExcluded, invalidExcluded };
};

const sourceAsset = (dataUrl: string, prefix: string): EvidenceAsset | null => {
    const matched = String(dataUrl || '').trim().match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!matched) return null;
    const ext = matched[1] === 'image/png' ? 'png' : matched[1] === 'image/webp' ? 'webp' : 'jpg';
    return { path: 'assets/' + prefix + '.' + ext, mimeType: matched[1], base64: matched[2].replace(/\s/g, '') };
};

const safeText = (value: unknown): string => String(value ?? '').trim();

const TIMESTAMP_WARNING =
    '기록 작성·사진 촬영·교육 실시·사고 발생 시각을 한 시각으로 간주하지 마세요. 각 이벤트 시간은 기존 기록값이며 독립적인 서버시각·공인시점 증명이 아닙니다.';

export const preparePsiEvidencePackage = (
    record: WorkerRecord,
    options: { exportedAt: string; cutoffIso?: string | null },
): EvidencePackageDraft => {
    const exportedAt = options.exportedAt;
    if (!Number.isFinite(Date.parse(exportedAt))) throw new Error('내보내기 생성 시각이 올바르지 않습니다.');
    const cutoffIso = options.cutoffIso || null;
    if (cutoffIso && !Number.isFinite(Date.parse(cutoffIso))) throw new Error('기준시각을 다시 확인하세요.');

    const answers = buildWorkerInterpretationNote(record);
    const risk = filterTimes(record.riskFollowupEvents || [], cutoffIso);
    const practice = filterTimes(record.practiceVerificationEvents || [], cutoffIso);
    const audit = filterTimes(record.auditTrail || [], cutoffIso);
    const corrections = filterTimes(record.correctionHistory || [], cutoffIso);
    const approvals = filterTimes(record.approvalHistory || [], cutoffIso);
    const actions = filterTimes(record.actionHistory || [], cutoffIso);
    const scoreAdjustments = filterTimes(record.scoreAdjustmentHistory || [], cutoffIso);
    const groups = [
        { kind: '위험성평가 조치', entries: risk.included, summary: (e: (typeof risk.included)[number]) => 'Q' + e.questionNumber + ' / ' + e.status + ' / ' + safeText(e.actionDetail) },
        { kind: '교육·실천 확인', entries: practice.included, summary: (e: (typeof practice.included)[number]) => 'Q' + e.questionNumber + ' / ' + e.stage + ' / ' + e.result + ' / ' + safeText(e.evidenceNote) },
        { kind: '관리 이력', entries: audit.included, summary: (e: (typeof audit.included)[number]) => e.stage + ' / ' + safeText(e.note) },
        { kind: '일반 지도조치', entries: actions.included, summary: (e: (typeof actions.included)[number]) => safeText(e.actionType) + ' / ' + safeText(e.detail) },
    ];
    const timeline: Array<{ timestamp: string; kind: string; description: string }> = [];
    for (const group of groups) {
        for (const entry of group.entries) timeline.push({
            timestamp: String(entry.timestamp || ''),
            kind: group.kind,
            description: group.summary(entry as never),
        });
    }
    timeline.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.kind.localeCompare(b.kind));

    const warnings = [
        TIMESTAMP_WARNING,
        '이 패키지는 내보낸 당시 보관된 기록의 사본입니다. 이전 특정일에 원문·사진·번역이 존재했음을 소급 증명하지 못합니다.',
        'OCR 판독 원문·한국어 번역은 현재 보관값이며, 과거 시점별 버전은 수정이력의 실제 증빙 범위만 확인해야 합니다.',
        '사진 자체의 촬영 시각·EXIF·최초 업로드 시각은 별도로 확인해야 합니다. 원본 파일 유무와 촬영 원본성은 이 내보내기로 보증하지 않습니다.',
        '해시값은 패키지 파일의 이후 변조 여부를 대조하기 위한 값입니다. 독립적인 타임스탬프·원본 증명·서버 불변 저장을 대신하지 않습니다.',
        '근로자와 관리자의 개인정보가 포함될 수 있으므로 접근 권한을 제한해 보관하고 외부 공유 전 적법성·필요성을 검토해야 합니다.',
        '교육·보호구 실천 의향, 실제 현장 안전조치, 조치완료, 사고 책임 판단을 서로 혼동해서는 안 됩니다.',
    ];
    const exclusions = {
        followup: { afterCutoff: risk.futureExcluded, invalidTimestamp: risk.invalidExcluded },
        practice: { afterCutoff: practice.futureExcluded, invalidTimestamp: practice.invalidExcluded },
        audit: { afterCutoff: audit.futureExcluded, invalidTimestamp: audit.invalidExcluded },
        corrections: { afterCutoff: corrections.futureExcluded, invalidTimestamp: corrections.invalidExcluded },
        approvals: { afterCutoff: approvals.futureExcluded, invalidTimestamp: approvals.invalidExcluded },
        actions: { afterCutoff: actions.futureExcluded, invalidTimestamp: actions.invalidExcluded },
        scoreAdjustments: { afterCutoff: scoreAdjustments.futureExcluded, invalidTimestamp: scoreAdjustments.invalidExcluded },
    };
    if (cutoffIso && Object.values(exclusions).some(item => item.afterCutoff || item.invalidTimestamp)) {
        warnings.push('기준시각 이후 또는 시각이 불명확한 이벤트는 기준시점 이력에서 제외했습니다. 제외 건수는 exclusions에 명시합니다.');
    }

    const assets: EvidenceAsset[] = [];
    const originalImage = sourceAsset(record.originalImage || '', 'currently-stored-original-form');
    if (originalImage) assets.push(originalImage);
    else if (record.originalImage) warnings.push('현재 저장된 원본 이미지가 데이터 URL 형식이 아니므로 파일로 동봉하지 못했습니다. 원본 참조값을 확인해야 합니다.');
    else warnings.push('현재 기록에 원본 자필 양식 이미지가 저장되어 있지 않습니다. 별도로 원본 확보가 필요합니다.');

    const followupForExport = risk.included.map((entry, index) => {
        const { evidencePhoto, ...rest } = entry;
        if (evidencePhoto) {
            const asset = sourceAsset(evidencePhoto, 'field-action-' + String(index + 1).padStart(3, '0'));
            if (asset) { assets.push(asset); return { ...rest, evidencePhotoFile: asset.path }; }
            warnings.push('조치 증빙 사진 ' + (index + 1) + '번은 파일로 동봉되지 않았습니다. 사진 형식을 확인하세요.');
        }
        return { ...rest, evidencePhotoFile: null };
    });

    const payload = {
        schema: PSI_EVIDENCE_PACKAGE_VERSION,
        explanation: 'CURRENT stored record with event-time filtering only. This is not a historical database reconstruction.',
        record: {
            id: record.id, workerUuid: record.worker_uuid || record.workerUuid || null,
            workerName: record.name, jobField: record.jobField, language: record.language,
            nationality: record.nationality, formDateAsWritten: record.date,
            originalFileName: record.filename || null, ocrAnalyzedAt: record.ocrAnalyzedAt || null,
            reviewStatus: record.reviewStatus || null, approvalStatus: record.approvalStatus || null,
            approvedAt: record.approvedAt || null, approvedBy: record.approvedBy || null,
            existingEvidenceHash: record.evidenceHash || null,
            sourceImageFile: originalImage?.path || null,
        },
        savedAnswerValuesAsOfExport: answers.rows.map(row => ({
            questionNumber: row.number, question: row.question,
            originalText: row.original, koreanTranslationForReview: row.korean,
            originalRecorded: row.sourceState, translationReviewState: row.translationState,
        })),
        recordReviewApprovalIsNotTranslationCertification: true,
        cutoffIso,
        exportedAt,
        siteActionEvents: followupForExport,
        educationAndPracticeEvents: practice.included,
        auditTrailEvents: audit.included,
        correctionEvents: corrections.included,
        approvalEvents: approvals.included,
        generalActionEvents: actions.included,
        scoreAdjustmentEvents: scoreAdjustments.included,
        eventTimeExclusions: exclusions,
        warnings,
    };
    const heading = [
        'PSI 증빙 추적성 · 내보내기 시점 보관본',
        '기록 ID: ' + (record.id || '미확인'),
        '내보낸 시각(UTC): ' + exportedAt,
        '이벤트 조회 종료(UTC): ' + (cutoffIso || '제한 없음'),
        '원본 이미지: ' + (originalImage ? originalImage.path : '미동봉'),
        '',
        '원본·번역은 내보내기 당시 현재 값입니다. 조회 종료일 당시 존재했다는 증명이 아닙니다.',
        TIMESTAMP_WARNING,
        '',
        '[저장된 이벤트 시간순 목록] (서버 공인시각 아님)',
        ...timeline.map(entry => entry.timestamp + ' | ' + entry.kind + ' | ' + entry.description),
        '',
        '[추가 확인 필요]', ...warnings.map((line, index) => (index + 1) + '. ' + line),
        '',
    ].join('\n');

    return {
        cutoffIso, exportedAt,
        files: [
            { path: 'record/snapshot.json', text: JSON.stringify(payload, null, 2) + '\n' },
            { path: 'record/timeline.txt', text: heading },
        ],
        assets,
        warnings,
        counts: {
            originalAnswers: answers.sourceCount,
            sourceImages: originalImage ? 1 : 0,
            actionEvents: risk.included.length,
            practiceEvents: practice.included.length,
            totalAttachments: assets.length,
        },
    };
};
