import type { Page } from '../types';

export type OnePointProofStageId =
    | 'stage-scan'
    | 'stage-q1-separation'
    | 'stage-manager-review'
    | 'stage-native-feedback';

export type OnePointProofSession = {
    active: boolean;
    currentStageId?: OnePointProofStageId;
    completedStageIds: OnePointProofStageId[];
    updatedAt: string;
    returnedAt?: string;
};

export type OnePointProofStage = {
    id: OnePointProofStageId;
    title: string;
    shortTitle: string;
    page: Page;
};

export const ONE_POINT_PROOF_STORAGE_KEY = 'psi_one_point_proof_session_v1';
export const ONE_POINT_PROOF_SESSION_EVENT = 'psi:onePointProofSessionChanged';

export const ONE_POINT_PROOF_STAGES: OnePointProofStage[] = [
    { id: 'stage-scan', title: '1. 기록지 1장 촬영', shortTitle: '기록지 촬영', page: 'ocr-analysis' },
    { id: 'stage-q1-separation', title: '2. 공종과 Q1 분리', shortTitle: '공종/Q1 분리', page: 'ocr-analysis' },
    { id: 'stage-manager-review', title: '3. 관리자 검증', shortTitle: '관리자 검증', page: 'ocr-analysis' },
    { id: 'stage-native-feedback', title: '4. 모국어·리포트·추적', shortTitle: '환류 확인', page: 'reports' },
];

const stageIdSet = new Set<OnePointProofStageId>(ONE_POINT_PROOF_STAGES.map((stage) => stage.id));

const notifyOnePointProofSessionChanged = (): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(ONE_POINT_PROOF_SESSION_EVENT));
};

const isStageId = (value: unknown): value is OnePointProofStageId =>
    typeof value === 'string' && stageIdSet.has(value as OnePointProofStageId);

const normalizeStageIds = (value: unknown): OnePointProofStageId[] => {
    if (!Array.isArray(value)) return [];
    const seen = new Set<OnePointProofStageId>();
    for (const item of value) {
        if (isStageId(item)) seen.add(item);
    }
    return ONE_POINT_PROOF_STAGES.map((stage) => stage.id).filter((id) => seen.has(id));
};

export const readOnePointProofSession = (): OnePointProofSession | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.sessionStorage.getItem(ONE_POINT_PROOF_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<OnePointProofSession>;
        const currentStageId = isStageId(parsed.currentStageId) ? parsed.currentStageId : undefined;
        const completedStageIds = normalizeStageIds(parsed.completedStageIds);
        return {
            active: Boolean(parsed.active),
            currentStageId,
            completedStageIds,
            updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
            returnedAt: typeof parsed.returnedAt === 'string' ? parsed.returnedAt : undefined,
        };
    } catch {
        return null;
    }
};

export const writeOnePointProofSession = (session: OnePointProofSession): OnePointProofSession => {
    const normalized: OnePointProofSession = {
        active: session.active,
        currentStageId: session.currentStageId,
        completedStageIds: normalizeStageIds(session.completedStageIds),
        updatedAt: new Date().toISOString(),
        returnedAt: session.returnedAt,
    };
    if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(ONE_POINT_PROOF_STORAGE_KEY, JSON.stringify(normalized));
        notifyOnePointProofSessionChanged();
    }
    return normalized;
};

export const startOnePointProofStage = (stageId: OnePointProofStageId): OnePointProofSession => {
    const existing = readOnePointProofSession();
    const completed = new Set<OnePointProofStageId>(existing?.completedStageIds || []);
    const stageIndex = ONE_POINT_PROOF_STAGES.findIndex((stage) => stage.id === stageId);
    ONE_POINT_PROOF_STAGES.slice(0, stageIndex + 1).forEach((stage) => completed.add(stage.id));
    return writeOnePointProofSession({
        active: true,
        currentStageId: stageId,
        completedStageIds: ONE_POINT_PROOF_STAGES.map((stage) => stage.id).filter((id) => completed.has(id)),
        updatedAt: new Date().toISOString(),
    });
};

export const markOnePointProofReturned = (): OnePointProofSession => {
    const existing = readOnePointProofSession();
    return writeOnePointProofSession({
        active: true,
        currentStageId: existing?.currentStageId,
        completedStageIds: existing?.completedStageIds || [],
        updatedAt: new Date().toISOString(),
        returnedAt: new Date().toISOString(),
    });
};

export const clearOnePointProofSession = (): void => {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(ONE_POINT_PROOF_STORAGE_KEY);
    notifyOnePointProofSessionChanged();
};

export const getOnePointProofStage = (stageId?: OnePointProofStageId): OnePointProofStage | null =>
    ONE_POINT_PROOF_STAGES.find((stage) => stage.id === stageId) || null;

export const getNextOnePointProofStage = (completedStageIds: OnePointProofStageId[]): OnePointProofStage | null => {
    const completed = new Set(completedStageIds);
    return ONE_POINT_PROOF_STAGES.find((stage) => !completed.has(stage.id)) || null;
};
