import type { WorkerPracticeVerificationEvent, WorkerRiskFollowupEvent } from '../types';
import { collectWorkerRiskFollowupCases, FOLLOWUP_STATUS_LABELS, type WorkerRiskFollowupCase } from './workerRiskFollowup';

export interface PracticeFollowupLink {
    state: 'unlinked' | 'missing' | 'question_mismatch' | 'conflict' | 'linked';
    label: string;
    caseId: string;
    linkedCase?: WorkerRiskFollowupCase;
}

/** Resolve only within this assessment record; never infer a relationship from Q alone. */
export const resolvePracticeFollowupLink = (
    event: Pick<WorkerPracticeVerificationEvent, 'relatedFollowupCaseId' | 'questionNumber'>,
    followups: readonly WorkerRiskFollowupEvent[] = [],
): PracticeFollowupLink => {
    const caseId = String(event.relatedFollowupCaseId || '').trim();
    if (!caseId) return { state: 'unlinked', caseId, label: '조치 연결 미지정' };
    const candidates = followups.filter(item => item.caseId === caseId);
    if (!candidates.length) return { state: 'missing', caseId, label: '연결 조치 원본 없음 · 확인 필요' };
    if (candidates.some(item => item.questionNumber !== event.questionNumber)) {
        return { state: 'question_mismatch', caseId, label: '연결 조치 문항 불일치 · 확인 필요' };
    }
    const seen = new Map<string, WorkerRiskFollowupEvent>();
    for (const item of candidates) {
        const prior = seen.get(item.id);
        if (prior) {
            const keys = new Set([...Object.keys(prior), ...Object.keys(item)]);
            if ([...keys].some(key => prior[key as keyof WorkerRiskFollowupEvent] !== item[key as keyof WorkerRiskFollowupEvent])) {
                return { state: 'conflict', caseId, label: '연결 조치 이력 충돌 · 원본 확인 필요' };
            }
        }
        seen.set(item.id, item);
    }
    const linkedCase = collectWorkerRiskFollowupCases([...seen.values()])[0];
    if (!linkedCase) return { state: 'missing', caseId, label: '연결 조치 원본 없음 · 확인 필요' };
    return { state: 'linked', caseId, linkedCase,
        label: `Q${event.questionNumber} · 현재 조치 기록: ${FOLLOWUP_STATUS_LABELS[linkedCase.latest.status] || '상태 확인 필요'} · 담당 ${linkedCase.latest.owner || '미지정'}` };
};
