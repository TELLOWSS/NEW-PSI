import type { UiAudienceMode } from './routeMeta';

export type PhraseKey =
    | 'dashboard.quickAction.worker.priority'
    | 'dashboard.quickAction.worker.flow'
    | 'dashboard.quickAction.executive.trend'
    | 'dashboard.quickAction.executive.report'
    | 'dashboard.quickAction.practitioner.newAnalysis'
    | 'dashboard.quickAction.practitioner.report';

type PhraseEntry = {
    base: string;
    overrides?: Partial<Record<UiAudienceMode, string>>;
};

export const phraseDictionary: Record<PhraseKey, PhraseEntry> = {
    'dashboard.quickAction.worker.priority': {
        base: '보호 우선순위 보기',
        overrides: {
            worker: '보호 우선순위 보기',
        },
    },
    'dashboard.quickAction.worker.flow': {
        base: '작업조 흐름 확인',
        overrides: {
            worker: '작업조 흐름 확인',
        },
    },
    'dashboard.quickAction.executive.trend': {
        base: '추세 분석 보기',
        overrides: {
            practitioner: '추세 분석 보기',
            developer: 'Trend Analysis',
        },
    },
    'dashboard.quickAction.executive.report': {
        base: '리포트 생성',
        overrides: {
            practitioner: '리포트 생성',
            developer: 'Generate Report',
        },
    },
    'dashboard.quickAction.practitioner.newAnalysis': {
        base: '신규 분석',
        overrides: {
            practitioner: '신규 분석',
            developer: 'New Analysis',
        },
    },
    'dashboard.quickAction.practitioner.report': {
        base: '리포트 생성',
        overrides: {
            practitioner: '리포트 생성',
            developer: 'Generate Report',
        },
    },
};
