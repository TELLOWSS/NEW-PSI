import type { WorkerRiskFollowupEvent, WorkerRiskFollowupStatus } from '../types';

export const WORKER_FOLLOWUP_VERSION = 'psi-worker-followup-v1';
/** Calendar date for site management; UTC would lag KST before 09:00. */
export const getSeoulFollowupDay = (date: Date = new Date()): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type: string): string => parts.find(item => item.type === type)?.value || '';
    return part('year') + '-' + part('month') + '-' + part('day');
};

export const MAX_FOLLOWUP_EVENTS = 100;
export const MAX_FOLLOWUP_PHOTOS = 12;
export const MAX_FOLLOWUP_PHOTO_DATA_URL_LENGTH = 420_000;

export interface WorkerRiskFollowupCase {
    caseId: string;
    opened: WorkerRiskFollowupEvent;
    latest: WorkerRiskFollowupEvent;
    events: WorkerRiskFollowupEvent[];
}

export interface WorkerRiskFollowupInput {
    id: string;
    caseId: string;
    questionNumber: 1 | 2 | 3 | 4 | 5;
    status: WorkerRiskFollowupStatus;
    timestamp: string;
    actor: string;
    owner: string;
    actionDetail: string;
    dueDate?: string;
    interimControl?: string;
    evidenceReference?: string;
    evidenceNote?: string;
    evidencePhoto?: string;
    verifiedBy?: string;
}

export const FOLLOWUP_STATUS_LABELS: Record<WorkerRiskFollowupStatus, string> = {
    open: '현장 확인 전',
    interim_control: '임시통제 중',
    scheduled: '조치 예정',
    completed: '완료 증빙 확인',
    reopened: '재점검·재조치',
};

/** Chronology is insertion order; an earlier timestamp cannot overwrite a later event. */
export const collectWorkerRiskFollowupCases = (events: readonly WorkerRiskFollowupEvent[] = []): WorkerRiskFollowupCase[] => {
    const cases = new Map<string, WorkerRiskFollowupCase>();
    for (const event of events) {
        if (!event || !event.caseId || !Number.isInteger(event.questionNumber) || event.questionNumber < 1 || event.questionNumber > 5) continue;
        const found = cases.get(event.caseId);
        if (!found) {
            cases.set(event.caseId, { caseId: event.caseId, opened: event, latest: event, events: [event] });
        } else if (found.opened.questionNumber === event.questionNumber) {
            found.latest = event;
            found.events.push(event);
        }
    }
    return [...cases.values()];
};

export const getWorkerRiskFollowupSummary = (
    events: readonly WorkerRiskFollowupEvent[] = [],
    today: string = getSeoulFollowupDay(),
) => {
    const cases = collectWorkerRiskFollowupCases(events);
    const unresolved = cases.filter(item => item.latest.status !== 'completed');
    const completed = cases.filter(item => item.latest.status === 'completed');
    const overdue = unresolved.filter(item => Boolean(item.latest.dueDate) && String(item.latest.dueDate) < today);
    return { total: cases.length, unresolved: unresolved.length, completed: completed.length, overdue: overdue.length, cases };
};

/**
 * Reject ambiguous or unsupported field claims. Completion requires a named human
 * verifier AND concrete evidence, but is not an authorization to resume work.
 */
export const validateWorkerRiskFollowup = (
    input: WorkerRiskFollowupInput,
    prior: readonly WorkerRiskFollowupEvent[] = [],
): string[] => {
    const issues: string[] = [];
    const trim = (x?: string) => String(x || '').trim();
    if (!trim(input.id) || !trim(input.caseId)) issues.push('조치 식별자가 필요합니다.');
    if (!Number.isInteger(input.questionNumber) || input.questionNumber < 1 || input.questionNumber > 5) issues.push('Q1~Q5 중 문항을 선택해 주세요.');
    if (!trim(input.actor) || !trim(input.owner)) issues.push('기록자와 담당자를 입력해 주세요.');
    if (trim(input.actionDetail).length < 6) issues.push('실제 현장 확인·조치 내용을 6자 이상 구체적으로 입력해 주세요.');
    if (!Number.isFinite(Date.parse(input.timestamp))) issues.push('기록 시각이 올바르지 않습니다.');
    if (prior.length >= MAX_FOLLOWUP_EVENTS) issues.push('이력 100건에 도달했습니다. 기록을 백업한 뒤 관리자에게 문의해 주세요.');
    if (prior.some(item => item.id === input.id)) issues.push('동일한 이벤트 ID는 재사용할 수 없습니다.');

    const existing = collectWorkerRiskFollowupCases(prior).find(item => item.caseId === input.caseId);
    if (existing) {
        if (existing.opened.questionNumber !== input.questionNumber) issues.push('동일 조치 건의 연결 문항은 변경할 수 없습니다.');
        if (existing.latest.status === 'completed' && input.status !== 'reopened') issues.push('완료된 건은 재개방 후 다시 기록해야 합니다.');
        if (Date.parse(input.timestamp) < Date.parse(existing.latest.timestamp)) issues.push('과거 시각으로 최신 조치 상태를 덮어쓸 수 없습니다.');
    } else if (input.status === 'completed' || input.status === 'reopened') {
        issues.push('새 조치는 현장 확인 전·임시통제·조치 예정 중 하나로 시작해야 합니다.');
    }
    if (input.status === 'reopened' && existing?.latest.status !== 'completed') {
        issues.push('재개방은 완료된 조치 건에만 가능합니다.');
    }
    if (input.status === 'scheduled' && !/^\d{4}-\d{2}-\d{2}$/.test(trim(input.dueDate))) issues.push('조치 예정에는 기한이 필요합니다.');
    if (input.status === 'interim_control' && trim(input.interimControl).length < 6) issues.push('임시통제 방법을 구체적으로 입력해 주세요.');
    if (input.status === 'completed') {
        if (trim(input.verifiedBy).length < 2) issues.push('완료 확인자 성명을 입력해 주세요.');
        if (trim(input.evidenceNote).length < 6 && !trim(input.evidenceReference) && !trim(input.evidencePhoto)) {
            issues.push('완료 증빙 설명·증빙 참조·사진 중 하나가 필요합니다.');
        }
    }
    if (trim(input.evidencePhoto)) {
        if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(trim(input.evidencePhoto))) {
            issues.push('증빙 사진은 JPEG 형식만 허용합니다.');
        }
        if (trim(input.evidencePhoto).length > MAX_FOLLOWUP_PHOTO_DATA_URL_LENGTH) issues.push('증빙 이미지 용량이 제한을 초과했습니다.');
        if (prior.filter(item => Boolean(item.evidencePhoto)).length >= MAX_FOLLOWUP_PHOTOS) issues.push('이 기록의 사진 12장 제한에 도달했습니다. 별도 증빙 식별자를 사용해 주세요.');
    }
    return issues;
};

export const appendWorkerRiskFollowupEvent = (
    prior: readonly WorkerRiskFollowupEvent[] = [],
    input: WorkerRiskFollowupInput,
): WorkerRiskFollowupEvent[] => {
    const issues = validateWorkerRiskFollowup(input, prior);
    if (issues.length) throw new Error(issues.join('\n'));
    const normalized: WorkerRiskFollowupEvent = {
        id: input.id.trim(),
        caseId: input.caseId.trim(),
        questionNumber: input.questionNumber,
        status: input.status,
        timestamp: input.timestamp,
        actor: input.actor.trim(),
        owner: input.owner.trim(),
        actionDetail: input.actionDetail.trim(),
        ...(input.dueDate?.trim() ? { dueDate: input.dueDate.trim() } : {}),
        ...(input.interimControl?.trim() ? { interimControl: input.interimControl.trim() } : {}),
        ...(input.evidenceReference?.trim() ? { evidenceReference: input.evidenceReference.trim() } : {}),
        ...(input.evidenceNote?.trim() ? { evidenceNote: input.evidenceNote.trim() } : {}),
        ...(input.evidencePhoto?.trim() ? { evidencePhoto: input.evidencePhoto.trim() } : {}),
        ...(input.verifiedBy?.trim() ? { verifiedBy: input.verifiedBy.trim() } : {}),
    };
    return [...prior, normalized];
};
