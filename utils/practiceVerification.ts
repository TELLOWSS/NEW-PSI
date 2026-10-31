import type {
    WorkerPracticeVerificationEvent, WorkerPracticeStage, WorkerPracticeResult,
    WorkerRecord, WorkerRiskFollowupEvent,
} from '../types';
import { getKoreanCalendarDay } from './monthlyFieldFollowup';
import { collectWorkerRiskFollowupCases } from './workerRiskFollowup';

export const PRACTICE_VERIFICATION_VERSION = 'psi-practice-verification-v1';
export const MAX_PRACTICE_EVENTS_PER_RECORD = 150;

export const PRACTICE_STAGE_LABELS: Record<WorkerPracticeStage, string> = {
    education: '교육 전달',
    understanding: '이해 확인',
    field_check: '현장 실천 관찰',
    recheck: '현장 재점검',
};
export const PRACTICE_RESULT_LABELS: Record<WorkerPracticeResult, string> = {
    delivered: '전달 기록',
    understood: '이해 확인',
    needs_explanation: '설명 보완 필요',
    observed_safe: '해당 상황 안전행동 관찰',
    correction_required: '개선·조치 필요',
    unable_to_verify: '실천 확인 불가',
};
export const PRACTICE_ALLOWED_RESULTS: Record<WorkerPracticeStage, WorkerPracticeResult[]> = {
    education: ['delivered'],
    understanding: ['understood', 'needs_explanation'],
    field_check: ['observed_safe', 'correction_required', 'unable_to_verify'],
    recheck: ['observed_safe', 'correction_required', 'unable_to_verify'],
};

const validDay = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T00:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value;
};
const koreaDay = (timestamp: string): string => {
    const d = new Date(timestamp);
    return Number.isFinite(d.getTime()) ? getKoreanCalendarDay(d) : '';
};

export const validatePracticeVerificationEvent = (
    item: WorkerPracticeVerificationEvent,
    previous: readonly WorkerPracticeVerificationEvent[],
    existingFollowups: readonly WorkerRiskFollowupEvent[] = [],
): string[] => {
    const errors: string[] = [];
    if (!item.id?.trim()) errors.push('기록 ID가 필요합니다.');
    if (previous.some(entry => entry.id === item.id)) errors.push('동일 이벤트 ID는 중복 저장할 수 없습니다.');
    if (previous.length >= MAX_PRACTICE_EVENTS_PER_RECORD) errors.push('저장 가능한 검증 이력 한도에 도달했습니다. 먼저 백업해 주세요.');
    if (![1, 2, 3, 4, 5].includes(item.questionNumber)) errors.push('Q1~Q5 중 관련 문항을 선택해 주세요.');
    if (!PRACTICE_ALLOWED_RESULTS[item.stage]?.includes(item.result)) errors.push('단계와 확인 결과가 일치하지 않습니다.');
    const time = new Date(item.timestamp).getTime();
    if (!Number.isFinite(time) || time > Date.now() + 60_000) errors.push('실제 기록 시각을 확인해 주세요.');
    if (String(item.actor || '').trim().length < 2) errors.push('확인 관리자 성명이 필요합니다.');
    if (String(item.evidenceNote || '').trim().length < 8) errors.push('확인 방법과 근거를 8자 이상 남겨주세요.');
    if (item.stage === 'education' && String(item.sessionReference || '').trim().length < 3) {
        errors.push('교육을 실제 실시한 경우 교육일지·회차 등 근거번호를 입력해 주세요.');
    }
    if (item.stage === 'understanding' && String(item.sessionReference || '').trim().length < 3) {
        errors.push('이해 확인에 사용한 교육일지·회차를 입력해 주세요.');
    }
    if (item.result === 'observed_safe' && !String(item.evidenceReference || '').trim()) {
        errors.push('현장 안전행동 관찰에는 확인 가능한 증빙 참조번호가 필요합니다.');
    }
    if (['correction_required', 'unable_to_verify', 'needs_explanation'].includes(item.result)
        && !validDay(String(item.nextCheckDueDate || ''))) {
        errors.push('보완 또는 확인 필요 시 재확인 예정일을 지정해 주세요.');
    }
    if (item.relatedFollowupCaseId) {
        const caseEntry = collectWorkerRiskFollowupCases(existingFollowups)
            .find(entry => entry.caseId === item.relatedFollowupCaseId);
        if (!caseEntry) errors.push('연결된 현장 조치 건을 찾을 수 없습니다.');
        else if (caseEntry.opened.questionNumber !== item.questionNumber) errors.push('연결된 조치 건의 문항 번호가 다릅니다.');
    }
    if (item.stage === 'recheck' && !previous.some(entry =>
        entry.questionNumber === item.questionNumber
        && (entry.result === 'correction_required' || entry.result === 'unable_to_verify')
    )) {
        errors.push('재점검 전 확인 필요·개선 필요 이력이 있어야 합니다.');
    }
    return errors;
};

/** Append-only; no automatic modification of site corrective-action completion or scores. */
export const appendPracticeVerificationEvent = (
    previous: readonly WorkerPracticeVerificationEvent[],
    item: WorkerPracticeVerificationEvent,
    existingFollowups: readonly WorkerRiskFollowupEvent[] = [],
): WorkerPracticeVerificationEvent[] => {
    const errors = validatePracticeVerificationEvent(item, previous, existingFollowups);
    if (errors.length) throw new Error(errors.join('\n'));
    const event: WorkerPracticeVerificationEvent = {
        id: item.id.trim(),
        timestamp: item.timestamp,
        questionNumber: item.questionNumber,
        stage: item.stage,
        result: item.result,
        actor: item.actor.trim(),
        evidenceNote: item.evidenceNote.trim(),
        ...(item.sessionReference?.trim() ? { sessionReference: item.sessionReference.trim() } : {}),
        ...(item.relatedFollowupCaseId?.trim() ? { relatedFollowupCaseId: item.relatedFollowupCaseId.trim() } : {}),
        ...(item.nextCheckDueDate?.trim() ? { nextCheckDueDate: item.nextCheckDueDate.trim() } : {}),
        ...(item.evidenceReference?.trim() ? { evidenceReference: item.evidenceReference.trim() } : {}),
    };
    return [...previous, event];
};

export interface PracticeVerificationSummary {
    asOfDate: string;
    periodStartDate: string;
    educationDelivered: number;
    understandingConfirmed: number;
    understandingNeedsHelp: number;
    fieldObserved: number;
    fieldPositiveObservation: number;
    needsFieldRecheck: number;
    overdueFieldRecheck: number;
    rechecked: number;
    educationFocus: string[];
}

export const buildPracticeVerificationSummary = (
    records: readonly WorkerRecord[],
    options: { asOfDate: string; periodStartDate?: string; workType?: string },
): PracticeVerificationSummary => {
    const today = getKoreanCalendarDay();
    const asOfDate = validDay(options.asOfDate) && options.asOfDate < today ? options.asOfDate : today;
    const periodStartDate = validDay(options.periodStartDate || '') && String(options.periodStartDate) <= asOfDate
        ? String(options.periodStartDate) : '';
    const result: PracticeVerificationSummary = {
        asOfDate, periodStartDate,
        educationDelivered: 0, understandingConfirmed: 0, understandingNeedsHelp: 0,
        fieldObserved: 0, fieldPositiveObservation: 0, needsFieldRecheck: 0,
        overdueFieldRecheck: 0, rechecked: 0, educationFocus: [],
    };
    // One row per document, not one row per event; no personal fields are copied out.
    const seenRecords = new Set<string>();
    const needsByQuestion = new Map<number, { cases: number; overdue: number }>();
    for (const record of records) {
        if (options.workType && options.workType !== '전체 공종' && options.workType !== record.jobField) continue;
        if (!record.id || seenRecords.has(record.id)) continue;
        seenRecords.add(record.id);
        const assessmentDate = String(record.date || '').slice(0, 10);
        if (validDay(assessmentDate) && assessmentDate > asOfDate) continue;
        const eventsById = new Map<string, WorkerPracticeVerificationEvent>();
        for (const entry of record.practiceVerificationEvents || []) {
            if (!entry?.id || !koreaDay(entry.timestamp) || koreaDay(entry.timestamp) > asOfDate) continue;
            if (!eventsById.has(entry.id)) eventsById.set(entry.id, entry);
        }
        const entries = [...eventsById.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));
        const inWindow = (event: WorkerPracticeVerificationEvent) => !periodStartDate || koreaDay(event.timestamp) >= periodStartDate;
        result.educationDelivered += entries.filter(x => inWindow(x) && x.stage === 'education').length;
        result.understandingConfirmed += entries.filter(x => inWindow(x) && x.stage === 'understanding' && x.result === 'understood').length;
        result.understandingNeedsHelp += entries.filter(x => inWindow(x) && x.result === 'needs_explanation').length;
        result.fieldObserved += entries.filter(x => inWindow(x) && x.stage === 'field_check').length;
        result.fieldPositiveObservation += entries.filter(x => inWindow(x) && x.result === 'observed_safe').length;
        result.rechecked += entries.filter(x => inWindow(x) && x.stage === 'recheck').length;
        for (const q of [1, 2, 3, 4, 5]) {
            const latest = [...entries].reverse().find(x =>
                x.questionNumber === q && (x.stage === 'field_check' || x.stage === 'recheck')
            );
            if (!latest || !['correction_required', 'unable_to_verify'].includes(latest.result)) continue;
            result.needsFieldRecheck++;
            const overdue = validDay(String(latest.nextCheckDueDate || '')) && String(latest.nextCheckDueDate) < asOfDate;
            if (overdue) result.overdueFieldRecheck++;
            const row = needsByQuestion.get(q) || { cases: 0, overdue: 0 };
            row.cases++;
            if (overdue) row.overdue++;
            needsByQuestion.set(q, row);
        }
    }
    result.educationFocus = [...needsByQuestion]
        .sort((a, b) => b[1].overdue - a[1].overdue || b[1].cases - a[1].cases || a[0] - b[0])
        .slice(0, 3)
        .map(([q, row]) => 'Q' + q + ' 실천 확인 미해소 ' + row.cases + '건 (재확인 기한 초과 ' + row.overdue
            + '건). 현장 관찰 근거, 임시통제 및 작업 전 확인사항을 다시 점검합니다.');
    return result;
};

export const formatPracticeVerificationEducationLines = (summary: PracticeVerificationSummary): string[] => {
    if (!summary.educationDelivered && !summary.fieldObserved && !summary.needsFieldRecheck
        && !summary.rechecked && !summary.understandingConfirmed && !summary.understandingNeedsHelp) return [];
    return [
        '[PSI 교육 후 실천 확인 · 기준일 ' + summary.asOfDate + ']',
        '교육 전달 기록 ' + summary.educationDelivered + '회 / 이해 확인 ' + summary.understandingConfirmed
          + '회 / 현장 관찰 ' + summary.fieldObserved + '회 / 현장 재점검 ' + summary.rechecked + '회.',
        '현장 재확인 필요 ' + summary.needsFieldRecheck + '개 문항·기록 (기한 초과 ' + summary.overdueFieldRecheck + '개).',
        ...summary.educationFocus,
        '교육 전달·이해 확인은 실제 보호구 착용이나 현장조치 완료를 증명하지 않습니다. 안전행동 관찰도 해당 시점의 사실이며 작업재개 허가가 아닙니다.',
    ];
};
