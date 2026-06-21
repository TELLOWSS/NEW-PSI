import { stableWorkerHash } from './workerIdentity';

export const SAFETY_CASE_STORAGE_KEY = 'psi_safety_cases_v1';
export const SAFETY_CASE_UPDATED_EVENT = 'psi-safety-cases-updated';
export const SAFETY_CASE_TRAINING_HANDOFF_KEY = 'psi_safety_case_training_handoff_v1';
export const SAFETY_CASE_FOCUS_KEY = 'psi_safety_case_focus_v1';

export type SafetyCaseStage =
    | 'detected'
    | 'action'
    | 'report'
    | 'training'
    | 'acknowledgement'
    | 'reassessment';

export type SafetyCaseStatus =
    | 'open'
    | 'action-in-progress'
    | 'awaiting-report'
    | 'awaiting-training'
    | 'awaiting-acknowledgement'
    | 'awaiting-reassessment'
    | 'closed';

export interface SafetyCaseEvent {
    id: string;
    stage: SafetyCaseStage;
    occurredAt: string;
    actor: string;
    note: string;
    evidenceId?: string;
}

export interface SafetyCaseRecord {
    caseId: string;
    sourcePlanKey: string;
    sourceRecordId?: string;
    workerId?: string;
    workerName: string;
    jobField: string;
    teamLeader?: string;
    riskLabel: string;
    actionTitle: string;
    owner: string;
    dueLabel: string;
    dueAt?: string;
    status: SafetyCaseStatus;
    completedStages: Partial<Record<SafetyCaseStage, string>>;
    trainingSessionId?: string;
    reassessmentRecordId?: string;
    createdAt: string;
    updatedAt: string;
    events: SafetyCaseEvent[];
}

export interface SafetyCasePlanInput {
    planKey: string;
    sourceRecordId?: string;
    workerId?: string;
    workerName: string;
    jobField: string;
    teamLeader?: string;
    riskLabel: string;
    actionTitle: string;
    owner: string;
    dueLabel: string;
    detectedAt?: string;
}

export const SAFETY_CASE_STAGE_ORDER: SafetyCaseStage[] = [
    'detected',
    'action',
    'report',
    'training',
    'acknowledgement',
    'reassessment',
];

export const SAFETY_CASE_STAGE_LABELS: Record<SafetyCaseStage, string> = {
    detected: '위험 발견',
    action: '보호조치',
    report: '리포트',
    training: '교육',
    acknowledgement: '본인확인·서명',
    reassessment: '재평가',
};

const normalizeText = (value: unknown): string => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

const createEventId = (caseId: string, stage: SafetyCaseStage, occurredAt: string): string => (
    `${caseId}-${stage}-${stableWorkerHash(occurredAt).slice(0, 8)}`
);

export const buildSafetyCaseId = (input: Pick<SafetyCasePlanInput, 'planKey' | 'workerName' | 'jobField' | 'riskLabel'>): string => {
    const seed = [
        normalizeText(input.planKey),
        normalizeText(input.workerName),
        normalizeText(input.jobField),
        normalizeText(input.riskLabel),
    ].join('|');
    return `PSI-CASE-${stableWorkerHash(seed).slice(0, 12)}`;
};

export const resolveSafetyCaseDueAt = (dueLabel: string): string | undefined => {
    const match = String(dueLabel || '').match(/(\d{4})\D+(\d{1,2})\D+(\d)\s*주차/);
    if (!match) return undefined;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const week = Number(match[3]);
    if (!Number.isInteger(year) || month < 1 || month > 12 || week < 1 || week > 5) return undefined;

    const monthEnd = new Date(year, month, 0, 23, 59, 59, 999);
    const targetDay = Math.min(monthEnd.getDate(), week * 7);
    return new Date(year, month - 1, targetDay, 23, 59, 59, 999).toISOString();
};

export const deriveSafetyCaseStatus = (
    completedStages: Partial<Record<SafetyCaseStage, string>>,
    actionInProgress = false,
): SafetyCaseStatus => {
    if (completedStages.reassessment) return 'closed';
    if (completedStages.acknowledgement) return 'awaiting-reassessment';
    if (completedStages.training) return 'awaiting-acknowledgement';
    if (completedStages.report) return 'awaiting-training';
    if (completedStages.action) return 'awaiting-report';
    if (actionInProgress) return 'action-in-progress';
    return 'open';
};

export const createSafetyCaseFromPlan = (
    input: SafetyCasePlanInput,
    nowIso = new Date().toISOString(),
): SafetyCaseRecord => {
    const detectedAt = input.detectedAt || nowIso;
    const caseId = buildSafetyCaseId(input);
    const detectedEvent: SafetyCaseEvent = {
        id: createEventId(caseId, 'detected', detectedAt),
        stage: 'detected',
        occurredAt: detectedAt,
        actor: 'PSI 선행 위험신호',
        note: `${input.workerName} · ${input.jobField} · ${input.riskLabel}`,
        evidenceId: input.sourceRecordId,
    };

    return {
        caseId,
        sourcePlanKey: input.planKey,
        sourceRecordId: input.sourceRecordId,
        workerId: input.workerId,
        workerName: input.workerName,
        jobField: input.jobField,
        teamLeader: input.teamLeader,
        riskLabel: input.riskLabel,
        actionTitle: input.actionTitle,
        owner: input.owner,
        dueLabel: input.dueLabel,
        dueAt: resolveSafetyCaseDueAt(input.dueLabel),
        status: 'open',
        completedStages: { detected: detectedAt },
        createdAt: detectedAt,
        updatedAt: detectedAt,
        events: [detectedEvent],
    };
};

export const mergeSafetyCasePlan = (
    existing: SafetyCaseRecord | undefined,
    input: SafetyCasePlanInput,
    nowIso = new Date().toISOString(),
): SafetyCaseRecord => {
    if (!existing) return createSafetyCaseFromPlan(input, nowIso);

    return {
        ...existing,
        sourcePlanKey: input.planKey,
        sourceRecordId: input.sourceRecordId || existing.sourceRecordId,
        workerId: input.workerId || existing.workerId,
        workerName: input.workerName,
        jobField: input.jobField,
        teamLeader: input.teamLeader || existing.teamLeader,
        riskLabel: input.riskLabel,
        actionTitle: input.actionTitle,
        owner: input.owner,
        dueLabel: input.dueLabel,
        dueAt: resolveSafetyCaseDueAt(input.dueLabel) || existing.dueAt,
        updatedAt: nowIso,
    };
};

export const getNextSafetyCaseStage = (record: SafetyCaseRecord): SafetyCaseStage | null => (
    SAFETY_CASE_STAGE_ORDER.find((stage) => !record.completedStages[stage]) || null
);

export const canCompleteSafetyCaseStage = (record: SafetyCaseRecord, stage: SafetyCaseStage): boolean => {
    const stageIndex = SAFETY_CASE_STAGE_ORDER.indexOf(stage);
    if (stageIndex <= 0) return stage === 'detected';
    return SAFETY_CASE_STAGE_ORDER
        .slice(0, stageIndex)
        .every((previousStage) => Boolean(record.completedStages[previousStage]));
};

export const markSafetyCaseActionStarted = (
    record: SafetyCaseRecord,
    actor: string,
    note = '보호조치를 시작했습니다.',
    occurredAt = new Date().toISOString(),
): SafetyCaseRecord => {
    if (record.completedStages.action) return record;
    const event: SafetyCaseEvent = {
        id: createEventId(record.caseId, 'action', occurredAt),
        stage: 'action',
        occurredAt,
        actor,
        note,
    };
    return {
        ...record,
        status: 'action-in-progress',
        updatedAt: occurredAt,
        events: [...record.events, event],
    };
};

export const completeSafetyCaseStage = (
    record: SafetyCaseRecord,
    stage: Exclude<SafetyCaseStage, 'detected'>,
    actor: string,
    note: string,
    options: { occurredAt?: string; evidenceId?: string } = {},
): SafetyCaseRecord => {
    if (!canCompleteSafetyCaseStage(record, stage)) {
        throw new Error(`${SAFETY_CASE_STAGE_LABELS[stage]} 전에 이전 단계를 먼저 완료해야 합니다.`);
    }
    if (record.completedStages[stage]) return record;

    const occurredAt = options.occurredAt || new Date().toISOString();
    const completedStages = { ...record.completedStages, [stage]: occurredAt };
    const event: SafetyCaseEvent = {
        id: createEventId(record.caseId, stage, occurredAt),
        stage,
        occurredAt,
        actor,
        note,
        evidenceId: options.evidenceId,
    };

    return {
        ...record,
        status: deriveSafetyCaseStatus(completedStages),
        completedStages,
        trainingSessionId: stage === 'training' ? options.evidenceId || record.trainingSessionId : record.trainingSessionId,
        reassessmentRecordId: stage === 'reassessment' ? options.evidenceId || record.reassessmentRecordId : record.reassessmentRecordId,
        updatedAt: occurredAt,
        events: [...record.events, event],
    };
};

export const isSafetyCaseOverdue = (record: SafetyCaseRecord, now = new Date()): boolean => {
    if (record.status === 'closed' || !record.dueAt) return false;
    const dueTime = new Date(record.dueAt).getTime();
    return Number.isFinite(dueTime) && dueTime < now.getTime();
};

export const readSafetyCases = (): SafetyCaseRecord[] => {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(SAFETY_CASE_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const writeSafetyCases = (records: SafetyCaseRecord[]): void => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SAFETY_CASE_STORAGE_KEY, JSON.stringify(records));
    window.dispatchEvent(new Event(SAFETY_CASE_UPDATED_EVENT));
};

export const upsertSafetyCase = (record: SafetyCaseRecord): SafetyCaseRecord[] => {
    const existing = readSafetyCases();
    const next = existing.some((item) => item.caseId === record.caseId)
        ? existing.map((item) => item.caseId === record.caseId ? record : item)
        : [record, ...existing];
    writeSafetyCases(next);
    return next;
};

export const syncSafetyCasesFromPlans = (plans: SafetyCasePlanInput[]): SafetyCaseRecord[] => {
    const existing = readSafetyCases();
    const existingById = new Map(existing.map((item) => [item.caseId, item]));
    const nowIso = new Date().toISOString();
    const nextById = new Map(existingById);

    plans.forEach((plan) => {
        const caseId = buildSafetyCaseId(plan);
        nextById.set(caseId, mergeSafetyCasePlan(existingById.get(caseId), plan, nowIso));
    });

    const next = Array.from(nextById.values()).sort((left, right) => (
        new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    ));
    writeSafetyCases(next);
    return next;
};

export const findSafetyCasesForWorker = (
    records: SafetyCaseRecord[],
    workerName: string,
    jobField: string,
): SafetyCaseRecord[] => {
    const nameKey = normalizeText(workerName);
    const jobKey = normalizeText(jobField);
    return records.filter((record) => (
        normalizeText(record.workerName) === nameKey
        && normalizeText(record.jobField) === jobKey
    ));
};
