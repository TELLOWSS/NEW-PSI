import { postAdminJson } from '../utils/adminApiClient';
import {
    getManagerRiskBaselineKey,
    readManagerRiskBaselines,
    writeManagerRiskBaselines,
    type ManagerRiskBaseline,
    type ManagerRiskBaselineMap,
} from '../utils/surveyRiskGap';

export type SurveyRiskBaselineStorageMode = 'shared-db' | 'local-fallback';

export interface SurveyRiskBaselineLoadResult {
    baselines: ManagerRiskBaselineMap;
    mode: SurveyRiskBaselineStorageMode;
    warning?: string;
}

interface SurveyRiskBaselineApiItem {
    trade?: string;
    monthKey?: string;
    level?: string;
    updatedAt?: string;
}

interface SurveyRiskBaselineApiResponse {
    ok: boolean;
    mode?: 'fallback-local';
    items?: SurveyRiskBaselineApiItem[];
    item?: SurveyRiskBaselineApiItem;
}

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
        };
        acc[getManagerRiskBaselineKey(monthKey, trade)] = baseline;
        return acc;
    }, {})
);

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
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저에만 저장됩니다.',
            };
        }

        const baselines = toBaselineMap(response.items || []);
        writeManagerRiskBaselines(baselines);
        return { baselines, mode: 'shared-db' };
    } catch (error) {
        return {
            baselines: localBaselines,
            mode: 'local-fallback',
            warning: error instanceof Error
                ? `공유 DB 연결 실패로 이 브라우저의 저장값을 사용합니다. (${error.message})`
                : '공유 DB 연결 실패로 이 브라우저의 저장값을 사용합니다.',
        };
    }
};

export const persistSurveyRiskBaseline = async (
    baseline: ManagerRiskBaseline,
): Promise<{ mode: SurveyRiskBaselineStorageMode; warning?: string }> => {
    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            {
                action: 'upsert',
                payload: {
                    trade: baseline.trade,
                    monthKey: baseline.monthKey,
                    level: baseline.level,
                    updatedBy: '관리자',
                },
            },
            { fallbackMessage: '관리자 위험 기준 저장 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                mode: 'local-fallback',
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저에만 저장되었습니다.',
            };
        }
        return { mode: 'shared-db' };
    } catch (error) {
        return {
            mode: 'local-fallback',
            warning: error instanceof Error
                ? `공유 저장에 실패하여 이 브라우저에만 보관했습니다. (${error.message})`
                : '공유 저장에 실패하여 이 브라우저에만 보관했습니다.',
        };
    }
};

export const deleteSurveyRiskBaseline = async (
    monthKey: string,
    trade: string,
): Promise<{ mode: SurveyRiskBaselineStorageMode; warning?: string }> => {
    try {
        const response = await postAdminJson<SurveyRiskBaselineApiResponse>(
            '/api/admin/survey-risk-baselines',
            { action: 'delete', payload: { monthKey, trade } },
            { fallbackMessage: '관리자 위험 기준 삭제 실패' },
        );

        if (response.mode === 'fallback-local') {
            return {
                mode: 'local-fallback',
                warning: '공유 DB 스키마가 아직 적용되지 않아 이 브라우저 값만 삭제되었습니다.',
            };
        }
        return { mode: 'shared-db' };
    } catch (error) {
        return {
            mode: 'local-fallback',
            warning: error instanceof Error
                ? `공유 DB 삭제에 실패하여 이 브라우저 값만 삭제했습니다. (${error.message})`
                : '공유 DB 삭제에 실패하여 이 브라우저 값만 삭제했습니다.',
        };
    }
};
