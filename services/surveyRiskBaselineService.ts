import { postAdminJson } from '../utils/adminApiClient';
import {
    appendManagerRiskBaselineHistory,
    getManagerRiskBaselineKey,
    normalizeManagerRiskBaselineBasis,
    readManagerRiskBaselineHistory,
    readManagerRiskBaselines,
    writeManagerRiskBaselines,
    type ManagerRiskBaseline,
    type ManagerRiskBaselineBasis,
    type ManagerRiskBaselineHistoryEntry,
    type ManagerRiskBaselineMap,
    type SurveyRiskLevel,
} from '../utils/surveyRiskGap';

export type SurveyRiskBaselineStorageMode = 'shared-db' | 'local-fallback';

export interface SurveyRiskBaselineLoadResult {
    baselines: ManagerRiskBaselineMap;
    mode: SurveyRiskBaselineStorageMode;
    warning?: string;
    historyAvailable?: boolean;
}

export interface SurveyRiskBaselineHistoryLoadResult {
    items: ManagerRiskBaselineHistoryEntry[];
    mode: SurveyRiskBaselineStorageMode;
    historyAvailable: boolean;
    warning?: string;
}

interface SurveyRiskBaselineApiItem {
    trade?: string;
    monthKey?: string;
    level?: string;
    updatedAt?: string;
    basis?: unknown;
}

interface SurveyRiskBaselineApiHistoryItem {
    id?: string;
    monthKey?: string;
    trade?: string;
    action?: string;
    previousLevel?: string | null;
    nextLevel?: string | null;
    basis?: unknown;
    changedAt?: string;
}

interface SurveyRiskBaselineApiResponse {
    ok: boolean;
    mode?: 'fallback-local';
    items?: Array<SurveyRiskBaselineApiItem | SurveyRiskBaselineApiHistoryItem>;
    item?: SurveyRiskBaselineApiItem;
    historyAvailable?: boolean;
}

const getCurrentAdminActorName = (): string => {
    try {
        if (typeof window === 'undefined') return '관리자';
        const raw = window.localStorage.getItem('psi_app_settings');
        if (!raw) return '관리자';
        const parsed = JSON.parse(raw) as { siteManager?: unknown };
        return String(parsed?.siteManager || '').trim().slice(0, 80) || '관리자';
    } catch {
        return '관리자';
    }
};

const createHistoryId = (): string => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `baseline-history-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toBaselineMap = (items: SurveyRiskBaselineApiItem[]): ManagerRiskBaselineMap => (
    items.reduce<ManagerRiskBaselineMap>((acc, item) => {
        const trade = String(item.trade || '').trim();
        const monthKey = String(item.monthKey || '').trim();
        const level = String(item.level || '');
        if (!trade || !/^\d{4}-\d{2}$/.test(monthKey) || !['상', '중', '하'].includes(level)) {
            return acc;
        }

        const baseline: ManagerRiskBaseline = {
            trade,
            monthKey,
            level: level as ManagerRiskBaseline['level'],
            updatedAt: String(item.updatedAt || ''),
            basis: normalizeManagerRiskBaselineBasis(item.basis),
        };
        acc[getManagerRiskBaselineKey(monthKey, trade)] = baseline;
        return acc;
    }, {})
);

const toHistoryItems = (
    items: SurveyRiskBaselineApiHistoryItem[],
): ManagerRiskBaselineHistoryEntry[] => (
    items.reduce<ManagerRiskBaselineHistoryEntry[]>((acc, item) => {
        const basis = normalizeManagerRiskBaselineBasis(item.basis);
        const action = String(item.action || '');
        const previousLevel = ['상', '중', '하'].includes(String(item.previousLevel))
            ? item.previousLevel as SurveyRiskLevel
            : null;
        const nextLevel = ['상', '중', '하'].includes(String(item.nextLevel))
            ? item.nextLevel as SurveyRiskLevel
            : null;
        if (
            !item.id
            || !item.monthKey
            || !item.trade
            || !['upsert', 'delete', 'copy'].includes(action)
            || !basis
        ) return acc;
        acc.push({
            id: item.id,
            monthKey: item.monthKey,
            trade: item.trade,
            action: action as ManagerRiskBaselineHistoryEntry['action'],
            previousLevel,
            nextLevel,
            basis,
            changedAt: String(item.changedAt || ''),
        });
        return acc;
    }, [])
);

const createLocalHistoryEntry = (
    baseline: Pick<ManagerRiskBaseline, 'monthKey' | 'trade'>,
    previousLevel: SurveyRiskLevel | null,
    nextLevel: SurveyRiskLevel | null,
    basis: ManagerRiskBaselineBasis,
    action: ManagerRiskBaselineHistoryEntry['action'],
): ManagerRiskBaselineHistoryEntry => ({
    id: createHistoryId(),
    monthKey: baseline.monthKey,
    trade: baseline.trade,
    action,
    previousLevel,
    nextLevel,
    basis,
    changedAt: new Date().toISOString(),
});

export const loadSurveyRiskBaselines = async (): Promise<SurveyRiskBaselineLoadResult> => {
    const localBaselines = readManagerRiskBaselines();

    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            { action: 'list', payload: {} },
            { fallbackMessage: '관리자 위험 기준 조회 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                baselines: localBaselines,
                mode: 'local-fallback',
                historyAvailable: false,
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저에만 저장됩니다.',
            };
        }

        const baselines = toBaselineMap((response.items || []) as SurveyRiskBaselineApiItem[]);
        if (response.historyAvailable === false) {
            Object.entries(baselines).forEach(([key, baseline]) => {
                const localBasis = localBaselines[key]?.basis;
                if (!baseline.basis && localBasis) baseline.basis = localBasis;
            });
        }
        writeManagerRiskBaselines(baselines);
        return {
            baselines,
            mode: 'shared-db',
            historyAvailable: response.historyAvailable,
        };
    } catch (error) {
        return {
            baselines: localBaselines,
            mode: 'local-fallback',
            historyAvailable: false,
            warning: error instanceof Error
                ? `공유 DB 연결 실패로 이 브라우저의 저장값을 사용합니다. (${error.message})`
                : '공유 DB 연결 실패로 이 브라우저의 저장값을 사용합니다.',
        };
    }
};

export const loadSurveyRiskBaselineHistory = async (
    monthKey: string,
    trade = '',
): Promise<SurveyRiskBaselineHistoryLoadResult> => {
    const localItems = readManagerRiskBaselineHistory({ monthKey, trade: trade || undefined });
    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            {
                action: 'list-history',
                payload: { monthKey, trade: trade || undefined, limit: 100 },
            },
            { fallbackMessage: '관리자 위험 기준 변경 이력 조회 실패' },
        );
        if (response.mode === 'fallback-local' || response.historyAvailable === false) {
            return {
                items: localItems,
                mode: 'local-fallback',
                historyAvailable: false,
                warning: '변경 이력 DB 적용 전까지 이 브라우저의 이력을 표시합니다.',
            };
        }
        return {
            items: toHistoryItems((response.items || []) as SurveyRiskBaselineApiHistoryItem[]),
            mode: 'shared-db',
            historyAvailable: true,
        };
    } catch (error) {
        return {
            items: localItems,
            mode: 'local-fallback',
            historyAvailable: false,
            warning: error instanceof Error
                ? `공유 변경 이력 조회 실패로 로컬 이력을 표시합니다. (${error.message})`
                : '공유 변경 이력 조회 실패로 로컬 이력을 표시합니다.',
        };
    }
};

export const persistSurveyRiskBaseline = async (
    baseline: ManagerRiskBaseline,
    previousLevel: SurveyRiskLevel | null = null,
): Promise<{ mode: SurveyRiskBaselineStorageMode; warning?: string; historyAvailable?: boolean }> => {
    const basis = baseline.basis || {
        reason: '관리자가 등급을 직접 선택했습니다.',
        source: 'manual',
        ruleVersion: 'manual-v1',
        updatedBy: getCurrentAdminActorName(),
    };
    appendManagerRiskBaselineHistory([
        createLocalHistoryEntry(baseline, previousLevel, baseline.level, basis, 'upsert'),
    ]);

    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            {
                action: 'upsert',
                payload: {
                    trade: baseline.trade,
                    monthKey: baseline.monthKey,
                    level: baseline.level,
                    basis,
                    updatedBy: basis.updatedBy,
                },
            },
            { fallbackMessage: '관리자 위험 기준 저장 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                mode: 'local-fallback',
                historyAvailable: false,
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저에만 저장되었습니다.',
            };
        }
        return {
            mode: 'shared-db',
            historyAvailable: response.historyAvailable,
            warning: response.historyAvailable === false
                ? '기준은 공유 저장됐지만 변경 이력 DB는 아직 적용되지 않아 로컬 이력도 함께 보관합니다.'
                : undefined,
        };
    } catch (error) {
        return {
            mode: 'local-fallback',
            historyAvailable: false,
            warning: error instanceof Error
                ? `공유 저장에 실패하여 이 브라우저에만 보관했습니다. (${error.message})`
                : '공유 저장에 실패하여 이 브라우저에만 보관했습니다.',
        };
    }
};

export const persistSurveyRiskBaselines = async (
    baselines: ManagerRiskBaseline[],
): Promise<{ mode: SurveyRiskBaselineStorageMode; warning?: string; historyAvailable?: boolean }> => {
    if (baselines.length === 0) return { mode: 'shared-db' };

    appendManagerRiskBaselineHistory(baselines.map((baseline) => {
        const basis = baseline.basis || {
            reason: '관리자 기준 일괄 저장',
            source: 'manual' as const,
            ruleVersion: 'manual-v1',
            updatedBy: getCurrentAdminActorName(),
        };
        return createLocalHistoryEntry(
            baseline,
            null,
            baseline.level,
            basis,
            basis.source === 'previous-month' ? 'copy' : 'upsert',
        );
    }));

    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            {
                action: 'upsert-many',
                payload: {
                    items: baselines.map((baseline) => ({
                        trade: baseline.trade,
                        monthKey: baseline.monthKey,
                        level: baseline.level,
                        basis: baseline.basis,
                    })),
                    updatedBy: getCurrentAdminActorName(),
                },
            },
            { fallbackMessage: '관리자 위험 기준 일괄 저장 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                mode: 'local-fallback',
                historyAvailable: false,
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저에만 일괄 저장되었습니다.',
            };
        }
        return {
            mode: 'shared-db',
            historyAvailable: response.historyAvailable,
            warning: response.historyAvailable === false
                ? '기준은 공유 저장됐지만 변경 이력 DB는 아직 적용되지 않아 로컬 이력도 함께 보관합니다.'
                : undefined,
        };
    } catch (error) {
        return {
            mode: 'local-fallback',
            historyAvailable: false,
            warning: error instanceof Error
                ? `공유 일괄 저장에 실패하여 이 브라우저에만 보관했습니다. (${error.message})`
                : '공유 일괄 저장에 실패하여 이 브라우저에만 보관했습니다.',
        };
    }
};

export const deleteSurveyRiskBaseline = async (
    monthKey: string,
    trade: string,
    previousLevel: SurveyRiskLevel | null = null,
    basis?: ManagerRiskBaselineBasis,
): Promise<{ mode: SurveyRiskBaselineStorageMode; warning?: string; historyAvailable?: boolean }> => {
    const resolvedBasis = basis || {
        reason: '관리자 기준 삭제',
        source: 'manual',
        ruleVersion: 'manual-v1',
        updatedBy: getCurrentAdminActorName(),
    };
    appendManagerRiskBaselineHistory([
        createLocalHistoryEntry(
            { monthKey, trade },
            previousLevel,
            null,
            resolvedBasis,
            'delete',
        ),
    ]);

    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            {
                action: 'delete',
                payload: {
                    monthKey,
                    trade,
                    basis: resolvedBasis,
                    updatedBy: resolvedBasis.updatedBy,
                },
            },
            { fallbackMessage: '관리자 위험 기준 삭제 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                mode: 'local-fallback',
                historyAvailable: false,
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저 값만 삭제되었습니다.',
            };
        }
        return {
            mode: 'shared-db',
            historyAvailable: response.historyAvailable,
            warning: response.historyAvailable === false
                ? '기준은 공유 삭제됐지만 변경 이력 DB는 아직 적용되지 않아 로컬 이력도 함께 보관합니다.'
                : undefined,
        };
    } catch (error) {
        return {
            mode: 'local-fallback',
            historyAvailable: false,
            warning: error instanceof Error
                ? `공유 DB 삭제에 실패하여 이 브라우저 값만 삭제했습니다. (${error.message})`
                : '공유 DB 삭제에 실패하여 이 브라우저 값만 삭제했습니다.',
        };
    }
};
