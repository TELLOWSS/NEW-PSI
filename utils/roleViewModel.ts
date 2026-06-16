import type { Page } from '../types';
import type { InterpretationCardItem } from '../components/shared/InterpretationCardGrid';
import { BRAND_TONE } from './brandToneTokens';

export type DashboardAudience = 'worker' | 'manager' | 'executive';
export type DashboardInsightTab = 'chart' | 'team' | 'worker';

export type DashboardStatsSnapshot = {
    totalWorkers: number;
    averageScore: number;
    highRiskWorkers: number;
    totalChecks: number;
};

export type DashboardHarnessSnapshot = {
    approvalBacklog: number;
    fallback: number;
    immediateAttention: number;
};

export type DashboardSelectedTeamSnapshot = {
    label: string;
} | null;

export type DashboardWeakestTeamSnapshot = {
    team: string;
    avgScore: number;
    riskCount: number;
} | null;

export type DashboardSelectedTargetSnapshot = {
    trade: string;
    nationality: string;
} | null;

export type DashboardStatCardConfig = {
    key: string;
    title: string;
    value: string;
    iconType: 'users' | 'chart' | 'warning' | 'check';
    page: Page;
};

export type DashboardInsightTabConfig = {
    key: DashboardInsightTab;
    label: string;
};

export type DashboardAudienceQuickGuideItem = {
    key: string;
    title: string;
    focus: string;
    action: string;
};

export const DASHBOARD_AUDIENCE_META: Record<DashboardAudience, { label: string; description: string }> = {
    worker: {
        label: '근로자 관점',
        description: '누가 위험한지 보고 바로 행동합니다.',
    },
    manager: {
        label: '관리자 관점',
        description: '근거로 오늘 처리 순서를 정합니다.',
    },
    executive: {
        label: '경영진 관점',
        description: '추세로 자원 배분 우선순위를 정합니다.',
    },
};

export const buildAudienceInsightMessage = (audience: DashboardAudience, highRiskWorkers: number): string => {
    if (audience === 'worker') {
        return highRiskWorkers > 0
            ? `보호 우선 ${highRiskWorkers}명입니다. 취약 팀부터 코칭 순서를 바로 잠그세요.`
            : '안정 흐름입니다. 작은 이상 신호만 먼저 확인하세요.';
    }
    if (audience === 'executive') {
        return highRiskWorkers > 0
        ? `추가 확인 ${highRiskWorkers}명입니다. 취약 공종·팀에 자원을 우선 배분하세요.`
            : '안정 흐름입니다. 취약 팀만 선별 관리해 수준을 유지하세요.';
    }
    return highRiskWorkers > 0
        ? `즉시 조치 ${highRiskWorkers}명입니다. 재점검·승인 순서를 먼저 고정하세요.`
        : '안정 상태입니다. 반복 취약 신호만 선제 점검하세요.';
};

export const buildOverviewStatCards = (audience: DashboardAudience, stats: DashboardStatsSnapshot): DashboardStatCardConfig[] => {
    if (audience === 'worker') {
        return [
            {
                key: 'risk-priority',
                title: '보호 필요 인원',
                value: `${stats.highRiskWorkers}명`,
                iconType: 'warning',
                page: 'predictive-analysis',
            },
            {
                key: 'avg-score',
                title: '실무 응답품질 신호',
                value: `${stats.averageScore.toFixed(1)}점`,
                iconType: 'chart',
                page: 'performance-analysis',
            },
            {
                key: 'workers',
                title: '현장 실무 근로자',
                value: `${stats.totalWorkers}명`,
                iconType: 'users',
                page: 'worker-management',
            },
            {
                key: 'checks',
                title: '안전 이행 점검',
                value: `${stats.totalChecks}건`,
                iconType: 'check',
                page: 'safety-checks',
            },
        ];
    }

    if (audience === 'manager') {
        return [
            {
                key: 'immediate-attention',
                title: '즉시 조치 대상',
                value: `${stats.highRiskWorkers}명`,
                iconType: 'warning',
                page: 'predictive-analysis',
            },
            {
                key: 'checks',
                title: '오늘 점검 이행',
                value: `${stats.totalChecks}건`,
                iconType: 'check',
                page: 'safety-checks',
            },
            {
                key: 'avg-score',
                title: '현장 응답품질',
                value: `${stats.averageScore.toFixed(1)}점`,
                iconType: 'chart',
                page: 'performance-analysis',
            },
            {
                key: 'workers',
                title: '관리 대상 인원',
                value: `${stats.totalWorkers}명`,
                iconType: 'users',
                page: 'worker-management',
            },
        ];
    }

    if (audience === 'executive') {
        return [
            {
                key: 'risk-priority',
                title: '추가 확인 대상',
                value: `${stats.highRiskWorkers}명`,
                iconType: 'warning',
                page: 'predictive-analysis',
            },
            {
                key: 'checks',
                title: '안전 이행 점검',
                value: `${stats.totalChecks}건`,
                iconType: 'check',
                page: 'safety-checks',
            },
            {
                key: 'avg-score',
                title: '실무 응답품질 신호',
                value: `${stats.averageScore.toFixed(1)}점`,
                iconType: 'chart',
                page: 'performance-analysis',
            },
            {
                key: 'workers',
                title: '현장 실무 근로자',
                value: `${stats.totalWorkers}명`,
                iconType: 'users',
                page: 'worker-management',
            },
        ];
    }

    return [
        {
            key: 'workers',
            title: '현장 실무 근로자',
            value: `${stats.totalWorkers}명`,
            iconType: 'users',
            page: 'worker-management',
        },
        {
            key: 'avg-score',
            title: '실무 응답품질 신호',
            value: `${stats.averageScore.toFixed(1)}점`,
            iconType: 'chart',
            page: 'performance-analysis',
        },
        {
            key: 'risk-priority',
            title: '추가 확인 대상',
            value: `${stats.highRiskWorkers}명`,
            iconType: 'warning',
            page: 'predictive-analysis',
        },
        {
            key: 'checks',
            title: '안전 이행 점검',
            value: `${stats.totalChecks}건`,
            iconType: 'check',
            page: 'safety-checks',
        },
    ];
};

export const buildDashboardSummaryCards = (options: {
    audience: DashboardAudience;
    stats: DashboardStatsSnapshot;
    selectedTeamOption: DashboardSelectedTeamSnapshot;
    harnessSummary: DashboardHarnessSnapshot;
}): InterpretationCardItem[] => {
    const { audience, stats, selectedTeamOption, harnessSummary } = options;
    const teamDescription = selectedTeamOption
        ? `${selectedTeamOption.label} 기준으로 대상을 좁혀 팀별 신호를 읽고 있습니다.`
        : '전체 현장 기준으로 실무 근로자 안전 흐름을 한 화면에서 확인하고 있습니다.';

    if (audience === 'worker') {
        return [
            {
                key: 'dashboard-status',
                eyebrow: '지금 내 현장',
                title: `${stats.totalWorkers}명의 실무 근로자 흐름을 보고 있습니다.`,
                description: teamDescription,
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'dashboard-evidence',
                eyebrow: '무엇을 보면 되나',
                title: `평균 ${stats.averageScore.toFixed(1)}점 · 보호 필요 ${stats.highRiskWorkers}명`,
                description: '응답품질과 보호 우선 인원은 누가 추가 확인이 필요한지 알려주는 신호입니다. 공종·팀 비교까지 함께 보면 내 작업조의 위치를 더 쉽게 이해할 수 있습니다.',
                tone: BRAND_TONE.whiteSoft,
            },
            {
                key: 'dashboard-action',
                eyebrow: '다음 행동',
                title: stats.highRiskWorkers > 0 ? '보호가 필요한 구간부터 코칭과 재확인을 시작하세요.' : '현재 안정 흐름을 유지하며 작은 이상 신호만 먼저 확인하세요.',
                description: stats.highRiskWorkers > 0
                    ? 'OCR 분석과 예측 분석으로 연결하면 어떤 항목을 먼저 보완해야 하는지 바로 이어서 볼 수 있습니다.'
                    : '공종·국적 교차 분석으로 유사 작업군의 신호를 가볍게 확인해 선제 보완을 준비할 수 있습니다.',
                tone: stats.highRiskWorkers > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
            },
        ];
    }

    if (audience === 'executive') {
        return [
            {
                key: 'dashboard-status',
                eyebrow: '리스크 현황',
                title: `${stats.totalWorkers}명 기준 현장 안전 흐름을 추적 중입니다.`,
                description: selectedTeamOption
                    ? `${selectedTeamOption.label} 팀 구간을 별도로 좁혀 리스크 편차를 보고 있습니다.`
                    : '전체 현장 관점에서 실무 인력의 리스크 흐름을 집계하고 있습니다.',
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'dashboard-evidence',
                eyebrow: '핵심 지표',
                title: `응답품질 ${stats.averageScore.toFixed(1)}점 · 추가 확인 ${stats.highRiskWorkers}명 · 점검 ${stats.totalChecks}건`,
                description: '응답품질, 추가 확인 인원, 점검 건수는 현재 현장의 리스크 수준과 이행 상태를 보여주는 운영 지표입니다.',
                tone: BRAND_TONE.whiteSoft,
            },
            {
                key: 'dashboard-action',
                eyebrow: '의사결정 포인트',
                title: stats.highRiskWorkers > 0 ? '취약 공종과 추가 확인 인원 중심으로 보호 자원 배분을 검토하세요.' : '안정 구간을 유지하면서 취약 팀만 선별 관리하세요.',
                description: stats.highRiskWorkers > 0
                    ? '팀 비교와 공종 비교를 함께 보면 어느 구간에 교육·점검 자원을 먼저 투입해야 하는지 빠르게 정리할 수 있습니다.'
                    : '안정 흐름일수록 팀 편차와 식별 불가 데이터를 함께 봐야 잠재 리스크를 놓치지 않습니다.',
                tone: stats.highRiskWorkers > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
            },
        ];
    }

    if (audience === 'manager') {
        return [
            {
                key: 'dashboard-status',
                eyebrow: '운영 상태',
                title: `${stats.totalWorkers}명 관리 대상 중 우선 조치 대상을 추려 보고 있습니다.`,
                description: selectedTeamOption
                    ? `${selectedTeamOption.label} 기준으로 범위를 좁혀 즉시 조치 대상과 재점검 대상을 정리하고 있습니다.`
                    : '전체 현장 기준으로 즉시 조치·재점검·보고 대상을 동시에 확인하고 있습니다.',
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'dashboard-evidence',
                eyebrow: '우선순위 근거',
                title: `추가 확인 ${stats.highRiskWorkers}명 · 응답품질 ${stats.averageScore.toFixed(1)}점 · 점검 ${stats.totalChecks}건`,
                description: '즉시 조치 인원, 응답품질, 점검 이행 건수를 묶어서 보면 오늘 어떤 팀을 먼저 붙잡아야 하는지 빠르게 결정할 수 있습니다.',
                tone: BRAND_TONE.whiteSoft,
            },
            {
                key: 'dashboard-action',
                eyebrow: '즉시 행동',
                title: stats.highRiskWorkers > 0 ? '추가 확인 인원부터 코칭·재점검·승인 흐름으로 연결하세요.' : '안정 구간을 유지하되 반복 취약 신호를 선제 점검하세요.',
                description: stats.highRiskWorkers > 0
                    ? '행동 센터에서 우선 대상을 고른 뒤 팀 비교로 내려가 편차를 확인하고, 필요한 건은 OCR/리포트로 즉시 넘기면 됩니다.'
                    : '공종·팀 비교에서 반복 신호만 선별해 사전 코칭과 점검 계획을 잠그는 것이 효과적입니다.',
                tone: stats.highRiskWorkers > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
            },
            {
                key: 'dashboard-harness',
                eyebrow: '승인·보류 상태',
                title: `${harnessSummary.approvalBacklog}명 승인 대기 · ${harnessSummary.immediateAttention}명 즉시 확인 필요`,
                description: harnessSummary.fallback > 0
                    ? `${harnessSummary.fallback}명은 persistence 폴백 상태이므로 저장 연결과 보호 해석을 함께 확인해야 합니다.`
                    : '승인 백로그와 즉시 확인 대상을 함께 보면 관리자 처리 순서를 하루 단위로 고정하기 쉽습니다.',
                tone: harnessSummary.approvalBacklog > 0 || harnessSummary.immediateAttention > 0
                    ? BRAND_TONE.violetSoft80
                    : BRAND_TONE.slate,
            },
        ];
    }

    return [
        {
            key: 'dashboard-status',
            eyebrow: '지금 상태',
            title: `${stats.totalWorkers}명의 실무 근로자 흐름을 보고 있습니다.`,
            description: teamDescription,
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'dashboard-evidence',
            eyebrow: '판단 근거',
            title: `응답품질 ${stats.averageScore.toFixed(1)}점 · 추가 확인 ${stats.highRiskWorkers}명 · 점검 ${stats.totalChecks}건`,
            description: '응답품질, 추가 확인 인원, 점검 건수, 공종·국적·팀 비교가 함께 있어 어느 구간에서 보완이 필요한지 빠르게 읽을 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'dashboard-action',
            eyebrow: '다음 행동',
            title: stats.highRiskWorkers > 0 ? '추가 확인 인원부터 분석·코칭 흐름으로 연결하세요.' : '현재 안정 흐름을 유지하며 취약 공종만 선별 확인하세요.',
            description: stats.highRiskWorkers > 0
                ? '예측 분석, OCR 분석, 리포트 생성으로 바로 연결해 현장 보호 조치를 끊기지 않게 이어갈 수 있습니다.'
                : '공종·국적 교차 분석과 팀 비교를 통해 작은 이상 신호를 먼저 찾아 선제 보완할 수 있습니다.',
            tone: stats.highRiskWorkers > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'dashboard-harness',
            eyebrow: '하네스 백로그',
            title: `${harnessSummary.approvalBacklog}명 승인 대기 · ${harnessSummary.immediateAttention}명 즉시 보호 대상`,
            description: harnessSummary.fallback > 0
                ? `${harnessSummary.fallback}명은 persistence 폴백 상태입니다. 보호 해석은 유지되지만 저장 연결 여부를 함께 확인해야 합니다.`
                : '대시보드에서도 승인 백로그와 즉시 보호 대상을 함께 읽어 보고서·OCR·관리자 검토 우선순위를 바로 정할 수 있습니다.',
            tone: harnessSummary.approvalBacklog > 0 || harnessSummary.immediateAttention > 0
                ? BRAND_TONE.violetSoft80
                : BRAND_TONE.slate,
        },
    ];
};

export const buildOperationalFocusCards = (audience: DashboardAudience): InterpretationCardItem[] => {
    if (audience === 'worker') {
        return [
            {
                key: 'operational-focus-status',
                eyebrow: '지금 먼저 볼 곳',
                title: '행동 센터와 개인 추이를 먼저 보면 보호 순서를 빠르게 잡을 수 있습니다.',
                description: '아래 패널은 위험 신호가 큰 작업군, 자주 반복되는 취약 분야, 최근 점검 흐름을 연결해서 보여줍니다.',
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'operational-focus-evidence',
                eyebrow: '판단 기준',
                title: '취약 분야와 점검 흐름은 지금 무엇을 보완해야 하는지 알려주는 근거입니다.',
                description: '특정 공종의 국적 분포와 최근 2주 점검 흐름을 함께 보면 같은 작업군 안의 반복 신호를 더 쉽게 읽을 수 있습니다.',
                tone: BRAND_TONE.whiteSoft,
            },
        ];
    }

    if (audience === 'executive') {
        return [
            {
                key: 'operational-focus-status',
                eyebrow: '운영 개요',
                title: '분포와 취약 영역을 먼저 보면 자원 배분 우선순위를 빠르게 정리할 수 있습니다.',
                description: '아래 섹션은 국적 분포, 반복 취약 분야, 최근 점검 동향, 보호 우선 작업군을 한 흐름으로 묶어 보여줍니다.',
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'operational-focus-action',
                eyebrow: '의사결정 포인트',
                title: '취약 공종과 점검 공백이 겹치는 구간부터 교육·점검 자원을 배분하세요.',
                description: '리스크 분포를 먼저 보고, 행동 센터에서 실제 보호 우선순위를 확인하면 보고와 실행 흐름을 분리하지 않고 이어갈 수 있습니다.',
                tone: BRAND_TONE.amberSoft80,
            },
        ];
    }

    if (audience === 'manager') {
        return [
            {
                key: 'operational-focus-status',
                eyebrow: '오늘의 운영 초점',
                title: '행동 센터와 팀 비교를 먼저 보면 관리자 처리 순서를 즉시 정할 수 있습니다.',
                description: '즉시 조치 대상, 반복 취약 분야, 최근 점검 흐름을 함께 보며 코칭·재점검·승인 순서를 확정합니다.',
                tone: BRAND_TONE.indigoSoft70,
            },
            {
                key: 'operational-focus-action',
                eyebrow: '관리자 액션',
                title: '취약 공종의 팀 편차부터 확인하고, 필요한 건을 OCR/리포트로 바로 연결하세요.',
                description: '오늘 처리할 대상 수를 먼저 잠그고, 팀별 편차 근거를 붙여 승인·보류·재점검 흐름을 끊기지 않게 운영합니다.',
                tone: BRAND_TONE.amberSoft80,
            },
        ];
    }

    return [
        {
            key: 'operational-focus-status',
            eyebrow: '운영 해석',
            title: '행동 센터와 분포 차트를 함께 보면 지금 보호가 필요한 구간을 빠르게 읽을 수 있습니다.',
            description: '국적 분포, 주요 취약 분야, 점검 동향, 행동 센터를 나란히 보며 현장 상태를 운영 관점으로 정리할 수 있습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'operational-focus-action',
            eyebrow: '다음 행동',
            title: '취약 신호가 반복되는 공종부터 코칭·점검·보고를 연결하세요.',
            description: '행동 센터에서 우선 대상을 고르고, 아래 비교 섹션으로 내려가 같은 공종 안의 팀 편차를 이어서 확인할 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
    ];
};

export const buildMobileInsightTabs = (audience: DashboardAudience): DashboardInsightTabConfig[] => {
    if (audience === 'worker') {
        return [
            { key: 'chart', label: '차트' },
            { key: 'worker', label: '개인추이' },
            { key: 'team', label: '팀비교' },
        ];
    }

    if (audience === 'executive') {
        return [
            { key: 'chart', label: '리스크차트' },
            { key: 'team', label: '팀편차' },
            { key: 'worker', label: '개인추이' },
        ];
    }

    if (audience === 'manager') {
        return [
            { key: 'team', label: '팀우선' },
            { key: 'chart', label: '근거차트' },
            { key: 'worker', label: '개인확인' },
        ];
    }

    return [
        { key: 'chart', label: '차트' },
        { key: 'team', label: '팀비교' },
        { key: 'worker', label: '개인추이' },
    ];
};

export const buildComparisonSectionMeta = (options: {
    audience: DashboardAudience;
}): {
    title: string;
    description: string;
    tradeQuickAccessTitle: string;
    tradeQuickAccessDescription: string;
    tradeQuickAccessBadge: string;
    teamQuickAccessTitle: string;
    teamQuickAccessDescription: string;
    teamQuickAccessBadge: string;
    teamComparisonDescription: string;
    teamSortDescription: string;
    detailModeDescription: string;
    emptyRadarTitle: string;
    emptyRadarDescription: string;
    emptyWorkerTrend: string;
} => {
    const { audience } = options;

    if (audience === 'worker') {
        return {
            title: '공종 × 작업조 보호 흐름 해석',
            description: '메인 비교 축은 항상 작업조이며, 국적은 필요할 때만 보조 드릴다운으로 내려가 확인합니다.',
            tradeQuickAccessTitle: '보호 우선 공종 바로가기',
            tradeQuickAccessDescription: '평균점수가 낮은 공종부터 선택한 뒤, 비교할 작업조 2~3개를 골라 같은 축에서 읽습니다.',
            tradeQuickAccessBadge: '보호 필요 공종 우선',
            teamQuickAccessTitle: '작업조 비교 바로가기',
            teamQuickAccessDescription: '같은 팀장명이라도 공종이 다르면 별도 작업조로 분리합니다. 메인 비교는 선택한 작업조 2~3개만 보여 줍니다.',
            teamQuickAccessBadge: '공종 포함 작업조 기준',
            teamComparisonDescription: '작업조 비교는 전체 국적 통합 기준으로 유지되어, 같은 공종 안에서 어느 팀을 먼저 코칭할지 빠르게 읽게 합니다.',
            teamSortDescription: '고급 보기에서만 정렬과 축약을 조정해 선택한 작업조 묶음의 우선순위를 정리할 수 있습니다.',
            detailModeDescription: '작업조 비교는 통합 기준으로 유지하고, 필요할 때만 팀 내부 국적 보기로 내려가 해석 근거를 확인합니다.',
            emptyRadarTitle: '위 그래프에서 확인할 작업조를 선택하세요',
            emptyRadarDescription: '막대 클릭은 팀 내부 국적 근거를 확인하기 위한 보조 드릴다운이며, 메인 비교는 항상 전체 국적 통합 기준입니다.',
            emptyWorkerTrend: '작업조를 선택하면 개인별 추이 목록이 열려 누구를 먼저 다시 확인할지 이어서 볼 수 있습니다.',
        };
    }

    if (audience === 'executive') {
        return {
            title: '공종 × 팀 리스크 편차 분석',
            description: '팀 비교를 메인 축으로 고정하고, 국적은 필요 시에만 보조 드릴다운으로 분리해 자원 배분 판단을 흔들지 않습니다.',
            tradeQuickAccessTitle: '리스크 우선 공종',
            tradeQuickAccessDescription: '평균점수가 낮은 공종부터 연 뒤, 메인 비교에 넣을 팀 2~3개를 골라 동일 축으로 확인합니다.',
            tradeQuickAccessBadge: '자원 배분 우선 노출',
            teamQuickAccessTitle: '팀 편차 바로가기',
            teamQuickAccessDescription: '같은 팀장명이라도 공종이 다르면 별도 팀으로 분리합니다. 메인 화면은 선택한 팀만 남겨 보여 줍니다.',
            teamQuickAccessBadge: '공종 포함 팀명 기준',
            teamComparisonDescription: '팀 비교는 항상 전체 국적 통합 기준으로 계산되어 동일 공종 내 편차를 안정적으로 읽을 수 있습니다.',
            teamSortDescription: '고급 보기에서만 정렬 기준을 바꿔 취약 팀부터 우수 팀까지 빠르게 정리할 수 있습니다.',
            detailModeDescription: '팀 비교는 통합 기준을 유지하고, 필요 시에만 팀 내부 국적 보기로 내려가 원인을 구분합니다.',
            emptyRadarTitle: '위 그래프에서 리스크를 확인할 공종 또는 팀을 선택하세요',
            emptyRadarDescription: '막대는 보조 국적 드릴다운 진입점이며, 팀 비교와 공종 칩은 전체 국적 통합 기준을 유지합니다.',
            emptyWorkerTrend: '대상을 선택하면 개인별 추이가 열려 특정 팀 안의 반복 리스크를 세부 확인할 수 있습니다.',
        };
    }

    if (audience === 'manager') {
        return {
            title: '공종 × 팀 운영 우선순위 설정',
            description: '팀 비교를 메인 축으로 고정하고, 국적은 원인 검증이 필요할 때만 보조로 내려가 확인합니다.',
            tradeQuickAccessTitle: '즉시 조치 공종',
            tradeQuickAccessDescription: '평균점수가 낮은 공종부터 열어 오늘 코칭/재점검할 팀 2~3개를 먼저 고릅니다.',
            tradeQuickAccessBadge: '관리자 우선 처리',
            teamQuickAccessTitle: '오늘 처리 팀 바로가기',
            teamQuickAccessDescription: '같은 팀장명이라도 공종이 다르면 별도 팀으로 분리합니다. 메인 비교는 선택한 팀만 남겨 운영합니다.',
            teamQuickAccessBadge: '공종 포함 팀명 기준',
            teamComparisonDescription: '팀 비교는 전체 국적 통합 기준으로 유지해 오늘의 우선 처리 순서를 흔들림 없이 정할 수 있습니다.',
            teamSortDescription: '고급 보기에서는 정렬 기준만 바꿔 취약 팀부터 처리 순서를 고정합니다.',
            detailModeDescription: '메인 비교는 통합 기준 유지, 팀 내부 국적은 원인 검증이 필요할 때만 내려가 확인합니다.',
            emptyRadarTitle: '위 그래프에서 오늘 먼저 처리할 팀을 선택하세요',
            emptyRadarDescription: '막대는 보조 국적 드릴다운 진입점이며, 메인 비교는 팀 우선 통합 기준으로 유지됩니다.',
            emptyWorkerTrend: '대상을 선택하면 개인별 추이가 열려 즉시 코칭/재점검 대상을 확정할 수 있습니다.',
        };
    }

    return {
        title: '공종 × 국적 교차 안전 숙련도 분석',
        description: '기본 축은 팀 비교이며, 국적은 팀 내부 해석 근거가 필요할 때만 고급 보기에서 확인합니다.',
        tradeQuickAccessTitle: '주요 공종 바로가기',
        tradeQuickAccessDescription: '평균점수가 낮은 공종부터 연 뒤, 팀 2~3개를 선택해 같은 축의 비교로 바로 진입할 수 있습니다.',
        tradeQuickAccessBadge: '취약 공종 우선 노출',
        teamQuickAccessTitle: '팀 비교 바로가기',
        teamQuickAccessDescription: '같은 팀장명이라도 공종이 다르면 별도 팀으로 분리합니다. 메인 비교는 선택한 팀 2~3개만 남겨 보여 줍니다.',
        teamQuickAccessBadge: '공종 포함 팀명 기준',
        teamComparisonDescription: '팀 비교는 항상 전체 국적 통합 기준으로 계산됩니다. 팀 내부의 다양한 국적은 분리하지 않습니다.',
        teamSortDescription: '고급 보기에서만 정렬 기준을 조정해 선택한 팀 묶음의 우선순위를 빠르게 비교할 수 있습니다.',
        detailModeDescription: '팀 비교는 통합 기준으로 유지하고, 하단 상세만 필요 시 팀 내부 국적 보기로 전환합니다.',
        emptyRadarTitle: '위 그래프에서 분석할 작업조를 클릭하세요',
        emptyRadarDescription: '막대는 공종·국적 기준의 보조 드릴다운이며, 팀 비교와 공종 칩은 전체 국적 통합 기준입니다.',
        emptyWorkerTrend: '작업조를 선택하면 개인별 트렌드 목록이 활성화됩니다.',
    };
};

export const buildAudienceQuickGuide = (options: {
    audience: DashboardAudience;
    stats: DashboardStatsSnapshot;
    harnessSummary: DashboardHarnessSnapshot;
}): DashboardAudienceQuickGuideItem[] => {
    const { audience, stats, harnessSummary } = options;

    if (audience === 'worker') {
        return [
            {
                key: 'worker-target',
                title: '지금 보는 대상',
                focus: `보호 우선 ${stats.highRiskWorkers}명과 취약 팀 흐름`,
                action: '보호 우선 공종 → 팀 2~3개 선택 → 개인추이 확인',
            },
            {
                key: 'worker-evidence',
                title: '판단 기준',
                focus: `평균 ${stats.averageScore.toFixed(1)}점 · 점검 ${stats.totalChecks}건`,
                action: '반복 취약 신호가 있는 팀부터 코칭 순서 고정',
            },
            {
                key: 'worker-first-action',
                title: '첫 클릭 행동',
                focus: '행동 센터와 팀비교를 먼저 연계',
                action: '취약 팀 선택 후 오늘 보완 항목 1~2개 즉시 확정',
            },
        ];
    }

    if (audience === 'executive') {
        return [
            {
                key: 'exec-target',
                title: '지금 보는 대상',
                focus: `추가 확인 ${stats.highRiskWorkers}명과 팀 편차`,
                action: '리스크 우선 공종 → 팀편차 → 보고 대상 확정',
            },
            {
                key: 'exec-evidence',
                title: '판단 기준',
                focus: `평균 ${stats.averageScore.toFixed(1)}점 · 점검 ${stats.totalChecks}건`,
                action: '취약 공종·팀에 교육/점검 자원 우선 배분',
            },
            {
                key: 'exec-first-action',
                title: '첫 클릭 행동',
                focus: '자원 배분 우선순위 잠금',
                action: '팀 편차 상위 구간부터 실행/보고 루트로 연결',
            },
        ];
    }

    return [
        {
            key: 'manager-target',
            title: '지금 보는 대상',
            focus: `즉시 조치 ${stats.highRiskWorkers}명 · 승인대기 ${harnessSummary.approvalBacklog}명`,
            action: '행동 센터에서 오늘 처리 대상 먼저 잠금',
        },
        {
            key: 'manager-evidence',
            title: '판단 기준',
            focus: `평균 ${stats.averageScore.toFixed(1)}점 · 점검 ${stats.totalChecks}건`,
            action: '팀 편차와 반복 취약 신호를 같이 보고 순서 확정',
        },
        {
            key: 'manager-first-action',
            title: '첫 클릭 행동',
            focus: '팀우선 → 근거차트 → 개인확인',
            action: `즉시확인 ${harnessSummary.immediateAttention}명부터 코칭·재점검·승인으로 연결`,
        },
    ];
};

export const buildReportsSummaryCards = (options: {
    filteredRecordsLength: number;
    activeTab: 'worker-report' | 'team-report';
    selectedTeam: string;
    dateFilterLabel: string;
    filterLevel: string;
    viewMode: 'list' | 'preview';
    harnessSummary: {
        connected: number;
        reviewNeeded: number;
        fallback: number;
    };
}): InterpretationCardItem[] => {
    const {
        filteredRecordsLength,
        activeTab,
        selectedTeam,
        dateFilterLabel,
        filterLevel,
        viewMode,
        harnessSummary,
    } = options;

    return [
        {
            key: 'report-status',
            eyebrow: '지금 상태',
            title: `${filteredRecordsLength}명의 보고서 흐름을 정리할 준비가 되어 있습니다.`,
            description: activeTab === 'team-report'
                ? `${selectedTeam === '전체' ? '전체 공종' : `${selectedTeam} 공종`} 기준으로 보고 대상을 모아 팀 단위 비교와 일괄 생성을 바로 이어갈 수 있습니다.`
                : '전체 근로자 목록에서 개별 미리보기와 일괄 생성 흐름을 같은 화면에서 이어갈 수 있습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'report-evidence',
            eyebrow: '판단 근거',
            title: '공종, 등급, 기간 필터가 현재 보고 범위를 만듭니다.',
            description: `현재 ${dateFilterLabel} 기준이며${filterLevel !== '전체' ? ` ${filterLevel} 등급만` : ' 전체 등급을'} 보고 있습니다. 필터 조건은 목록, 미리보기, ZIP/PDF 출력에 동일하게 반영됩니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'report-action',
            eyebrow: '다음 행동',
            title: viewMode === 'preview' ? '현재 미리보기 보고서를 먼저 확인하세요.' : '대상 목록에서 먼저 우선순위를 읽으세요.',
            description: viewMode === 'preview'
                ? '미리보기에서 내용이 맞는지 확인한 뒤 현재 보고서 내보내기 또는 일괄 생성으로 이어가면 됩니다.'
                : '약점, 응답품질, 확인단계를 함께 비교해 어떤 근로자군부터 설명과 보호 조치를 연결할지 먼저 정리할 수 있습니다.',
            tone: viewMode === 'preview' ? BRAND_TONE.emeraldSoft80 : BRAND_TONE.amberSoft80,
        },
        {
            key: 'report-harness',
            eyebrow: '하네스 커버리지',
            title: `${harnessSummary.connected}건은 저장 연결, ${harnessSummary.reviewNeeded}건은 추가 보호 판단이 필요합니다.`,
            description: harnessSummary.fallback > 0
                ? `현재 ${harnessSummary.fallback}건은 persistence 폴백 상태입니다. 보고서 해석은 유지되지만 저장 연결 상태를 함께 읽어야 합니다.`
                : '보고서 대상마다 하네스 워크플로우·위험·승인 상태를 함께 읽을 수 있어 설명보다 보호 조치를 먼저 정리할 수 있습니다.',
            tone: harnessSummary.fallback > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.violetSoft80,
        },
    ];
};

export const buildReportsViewCards = (options: {
    viewMode: 'list' | 'preview';
    currentPreviewName: string;
    previewIndex: number;
    filteredRecordsLength: number;
}): InterpretationCardItem[] => {
    const { viewMode, currentPreviewName, previewIndex, filteredRecordsLength } = options;

    return [
        {
            key: 'view-status',
            eyebrow: '지금 상태',
            title: viewMode === 'list' ? '생성 대상 목록을 비교 중입니다.' : `${currentPreviewName || '선택된 근로자'} 보고서를 미리보고 있습니다.`,
            description: viewMode === 'list'
                ? '이름, 공종, 응답품질, 확인단계, 취약점을 같은 행에서 확인해 설명이 더 필요한 대상을 빠르게 찾을 수 있습니다.'
                : `${previewIndex + 1}/${filteredRecordsLength} 순서이며 현재 보고서 내용을 실제 출력 전 단계에서 검토할 수 있습니다.`,
            tone: BRAND_TONE.slate,
        },
        {
            key: 'view-evidence',
            eyebrow: '판단 근거',
            title: viewMode === 'list' ? '응답품질과 약점 조합이 우선 해설 대상을 보여줍니다.' : '미리보기 템플릿이 실제 PDF/이미지 출력 기준입니다.',
            description: viewMode === 'list'
                ? '단순 수치보다 주요 취약점을 함께 읽어 어떤 설명과 코칭이 필요한지 보호 중심으로 판단할 수 있습니다.'
                : '현재 보이는 템플릿이 그대로 캡처되어 PDF 또는 이미지로 저장됩니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'view-action',
            eyebrow: '다음 행동',
            title: viewMode === 'list' ? '행을 눌러 개별 미리보기로 이동하세요.' : '내용 확인 후 현재 보고서 내보내기 또는 일괄 생성으로 이어가세요.',
            description: '목록과 미리보기를 오가며 먼저 설명이 필요한 사람을 확인한 뒤 출력하면 보고서가 평가 문서가 아니라 보호 안내서처럼 작동합니다.',
            tone: viewMode === 'preview' ? BRAND_TONE.emeraldSoft80 : BRAND_TONE.amberSoft80,
        },
    ];
};

export const buildFieldHubSummaryCards = (options: {
    workerRecordsLength: number;
    recentRisk: {
        jobField: string;
        teamLeader: string;
    } | null;
    openViolations: number;
    activeTab: 'risk-check' | 'behavior' | 'violations' | 'review';
    harnessSummary: {
        approvalBacklog: number;
        immediateAttention: number;
        fallback: number;
    };
}): InterpretationCardItem[] => {
    const { workerRecordsLength, recentRisk, openViolations, activeTab, harnessSummary } = options;

    return [
        {
            key: 'hub-status',
            eyebrow: '지금 상태',
            title: `${workerRecordsLength}건의 근로자 기록을 기준으로 현장 안전 흐름을 보고 있습니다.`,
            description: recentRisk
                ? `최근 이행점검은 ${recentRisk.jobField}${recentRisk.teamLeader ? ` · ${recentRisk.teamLeader}` : ''} 기준으로 저장되어 있으며, 탭별 조치 흐름을 같은 구조로 이어갈 수 있습니다.`
                : '아직 이행점검 기록이 없다면 위험성평가 이행점검 탭부터 시작해 현장 기준을 먼저 세우는 것이 좋습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'hub-evidence',
            eyebrow: '판단 근거',
            title: '점검, 관찰·코칭, 지적사항, 종합판정을 한 화면 체계로 묶었습니다.',
            description: `현재 열린 지적 ${openViolations}건이 있으며, 각 탭은 상태보다 해석이 먼저 보이도록 '지금 상태 · 판단 근거 · 다음 행동' 구조를 공유합니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'hub-action',
            eyebrow: '다음 행동',
            title: activeTab === 'review' ? '종합판정 결과를 실제 보완 흐름과 연결하세요.' : '현재 탭에서 확인한 신호를 다음 탭 조치로 넘기세요.',
            description: '이행점검에서 찾은 미이행은 관찰·코칭으로, 반복 지적은 종합판정의 우선 확인 대상으로 연결하면 PSI가 감시 도구가 아니라 보호 파트너처럼 작동합니다.',
            tone: activeTab === 'review' ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'hub-harness',
            eyebrow: '하네스 우선순위',
            title: `${harnessSummary.approvalBacklog}명 승인 대기 · ${harnessSummary.immediateAttention}명 즉시 보호 대상`,
            description: harnessSummary.fallback > 0
                ? `${harnessSummary.fallback}명은 persistence 폴백 상태입니다. 현장 조치는 계속하되 저장 연결 여부를 함께 점검해야 합니다.`
                : '현장 안전이행 허브에서도 승인 백로그와 즉시 보호 대상을 함께 읽어 위험성평가, 코칭, 지적, 종합판정을 같은 보호 흐름으로 묶을 수 있습니다.',
            tone: harnessSummary.approvalBacklog > 0 || harnessSummary.immediateAttention > 0 ? BRAND_TONE.violetSoft80 : BRAND_TONE.slate,
        },
    ];
};

export const buildFieldReviewCards = (options: {
    reviewsLength: number;
    summary: {
        green: number;
        yellow: number;
        red: number;
    };
    localStats: {
        totalSessions: number;
        openViolations: number;
        criticalViolations: number;
    };
}): InterpretationCardItem[] => {
    const { reviewsLength, summary, localStats } = options;

    return [
        {
            key: 'review-status',
            eyebrow: '지금 상태',
            title: reviewsLength > 0 ? `${reviewsLength}명의 행동 무결성 판정이 정리되어 있습니다.` : '자동 판정 실행 전 상태입니다.',
            description: reviewsLength > 0
                ? `확정 ${summary.green}명, 추가 확인 ${summary.yellow}명, 조치 필요 ${summary.red}명으로 월별 보호 우선순위를 빠르게 볼 수 있습니다.`
                : '좌측 이행 현황과 행동 데이터를 함께 읽어 근로자별 보호 우선순위를 자동으로 정리하는 화면입니다.',
            tone: reviewsLength > 0 ? BRAND_TONE.indigoSoft70 : BRAND_TONE.slate,
        },
        {
            key: 'review-evidence',
            eyebrow: '판단 근거',
            title: '점검 이행률, 열린 지적, 행동 기록이 함께 반영됩니다.',
            description: `현재 위험성평가 ${localStats.totalSessions}건, 열린 지적 ${localStats.openViolations}건, 중대 지적 ${localStats.criticalViolations}건이 종합 판단의 바탕이 됩니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'review-action',
            eyebrow: '다음 행동',
            title: reviewsLength > 0 ? '노란색·빨간색 대상부터 코칭과 보완을 연결하세요.' : '판정 실행 후 추가 확인 대상을 먼저 살펴보세요.',
            description: '사유 코드를 그대로 두지 말고 관찰·코칭, 지적사항, 다음 점검 계획과 연결해 실제 현장 보완으로 이어지게 하는 것이 핵심입니다.',
            tone: reviewsLength > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
    ];
};

export const buildWorkerRegisteredCards = (options: {
    visibleWorkersLength: number;
    duplicateWorkerCount: number;
    duplicateGroupCount: number;
    missingAnyCount: number;
    missingPhone: number;
    missingBirth: number;
    missingPassport: number;
    autoDeleteCount: number;
    harnessSummary: {
        linkedReport: number;
        reviewNeeded: number;
        fallback: number;
        pending: number;
        highRisk: number;
        missingReport: number;
    };
}): InterpretationCardItem[] => {
    const {
        visibleWorkersLength,
        duplicateWorkerCount,
        duplicateGroupCount,
        missingAnyCount,
        missingPhone,
        missingBirth,
        missingPassport,
        autoDeleteCount,
        harnessSummary,
    } = options;

    return [
        {
            key: 'worker-registration-status',
            eyebrow: '지금 상태',
            title: `현재 화면에서 ${visibleWorkersLength}명을 보고 있고 중복 후보는 ${duplicateWorkerCount}명입니다.`,
            description:
                duplicateGroupCount > 0
                    ? `${duplicateGroupCount}개 그룹에서 같은 사람으로 보이는 등록이 반복되고 있어, 발급 전 기준 데이터 정리가 필요한 상태입니다.`
                    : '현재 필터 기준에서는 즉시 정리해야 할 중복 신호가 크지 않아, 현장 발급 흐름을 이어갈 수 있습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'worker-registration-evidence',
            eyebrow: '판단 근거',
            title: `연락처·생년월일·여권번호 중 ${missingAnyCount}명이 최소 1개 이상 확인이 더 필요합니다.`,
            description:
                `전화번호 ${missingPhone}명, 생년월일 ${missingBirth}명, 여권번호 ${missingPassport}명이 비어 있어 문자 발송과 본인 확인 신뢰에 직접 영향을 줍니다.`,
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'worker-registration-action',
            eyebrow: '다음 행동',
            title:
                autoDeleteCount > 0
                    ? `삭제 권장 ${autoDeleteCount}명을 먼저 검토하고, 남길 1명을 기준 데이터로 고정하세요.`
                    : '중복 정리보다는 누락 정보 보완과 번호 검증을 먼저 진행하세요.',
            description:
                autoDeleteCount > 0
                    ? '중복 그룹 미리보기에서 보존 후보를 확인한 뒤 자동선택으로 정리하면 이후 문자 발송과 발급 이력이 한 사람 기준으로 정리됩니다.'
                    : '필터에서 누락 항목을 좁힌 뒤 등록 정보를 보완하면 문자 발송 이력과 보안 패스 발급 연결이 더 안정적으로 유지됩니다.',
            tone: autoDeleteCount > 0 ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
        {
            key: 'worker-safety-context',
            eyebrow: '하네스 보호 맥락',
            title: `최신 리포트 연결 ${harnessSummary.linkedReport}명 중 ${harnessSummary.reviewNeeded}명은 추가 보호 판단이 필요합니다.`,
            description:
                harnessSummary.fallback > 0
                    ? `하네스 저장 폴백 ${harnessSummary.fallback}명, 저장 대기 ${harnessSummary.pending}명입니다. 등록 정보 정리와 함께 저장 연결 상태를 다시 확인해야 합니다.`
                    : `즉시 보호 대상 ${harnessSummary.highRisk}명, 최신 리포트 미연결 ${harnessSummary.missingReport}명입니다.`,
            tone: BRAND_TONE.violetSoft80,
        },
    ];
};

export const buildWorkerMessageDashboardCards = (options: {
    rangeLabel: string;
    totalCount: number;
    successRate: number;
    failedCount: number;
    topFailureCategory: string;
    topTeam: string;
    retryCandidateCount: number;
    primaryFailureGuide: {
        reason: string;
        count: number;
        action: string;
    } | null;
    retryLabel: string;
}): InterpretationCardItem[] => {
    const {
        rangeLabel,
        totalCount,
        successRate,
        failedCount,
        topFailureCategory,
        topTeam,
        retryCandidateCount,
        primaryFailureGuide,
        retryLabel,
    } = options;
    const hasAttention = failedCount > 0;

    return [
        {
            key: 'worker-message-status',
            eyebrow: '지금 상태',
            title: `${rangeLabel} 기준 ${totalCount}건 중 ${successRate}%가 정상 전달됐습니다.`,
            description: hasAttention
                ? `${failedCount}건은 추가 확인이 필요하며, 현장 커뮤니케이션이 끊기지 않도록 우선순위 판단이 필요한 상태입니다.`
                : '현재 범위에서는 발송 흐름이 안정적으로 유지되고 있어 추가 개입 필요도가 낮습니다.',
            tone: BRAND_TONE.indigoSoft70,
        },
        {
            key: 'worker-message-evidence',
            eyebrow: '판단 근거',
            title: hasAttention
                ? `가장 많이 보이는 신호는 ${topFailureCategory || '미분류'}입니다.`
                : `가장 많이 발송한 팀은 ${topTeam || '미지정'}입니다.`,
            description: primaryFailureGuide
                ? `${primaryFailureGuide.reason}이 ${primaryFailureGuide.count}건으로 가장 자주 보여, ${primaryFailureGuide.action} 흐름을 우선 적용하는 것이 좋습니다.`
                : '월별·팀별 집계를 함께 보면 특정 팀이나 시점에 발송 품질이 흔들렸는지 빠르게 파악할 수 있습니다.',
            tone: BRAND_TONE.whiteSoft,
        },
        {
            key: 'worker-message-action',
            eyebrow: '다음 행동',
            title: `${retryLabel} ${retryCandidateCount}건을 먼저 확인해 다시 보낼 수 있는 대상을 가려내세요.`,
            description:
                retryCandidateCount > 0
                    ? '재시도 큐에서 전화번호·등록 근로자·리포트 원본이 모두 연결된 대상을 먼저 선택하면, 실패 원인을 다시 찾는 시간보다 복구 속도를 더 빠르게 가져갈 수 있습니다.'
                    : '현재는 재시도 후보가 많지 않으므로, 신규 발송 품질 유지와 주요 실패 원인 예방에 집중하면 됩니다.',
            tone: hasAttention ? BRAND_TONE.amberSoft80 : BRAND_TONE.emeraldSoft80,
        },
    ];
};
