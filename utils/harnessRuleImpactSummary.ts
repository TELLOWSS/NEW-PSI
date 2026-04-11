export interface HarnessRuleImpactSource {
    ruleCode?: string | null;
    ruleVersion?: string | null;
    severity?: string | null;
    message?: string | null;
    triggerType?: string | null;
    originalDecision?: string | null;
    overriddenDecision?: string | null;
    createdAt?: string | null;
}

export interface HarnessRuleImpactSummaryItem {
    ruleCode: string;
    ruleVersion: string | null;
    severity: string;
    count: number;
    decisionPath: string;
    messages: string[];
    triggerTypes: string[];
    latestCreatedAt: string | null;
}

export interface HarnessRuleImpactSummaryBundle {
    items: HarnessRuleImpactSummaryItem[];
    narrative: string;
    totalCount: number;
    criticalCount: number;
}

const severityRank: Record<string, number> = {
    info: 0,
    warning: 1,
    high: 2,
    critical: 3,
};

function normalizeSeverity(value?: string | null): string {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized || 'warning';
}

function resolveHigherSeverity(current: string, candidate: string): string {
    return (severityRank[candidate] ?? 1) > (severityRank[current] ?? 1) ? candidate : current;
}

function unique(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function buildDecisionPath(originals: string[], overridden: string[]): string {
    const originalText = originals[0] || 'N/A';
    const overriddenText = overridden[0] || 'N/A';
    const extraCount = Math.max((originals.length - 1) + (overridden.length - 1), 0);
    return extraCount > 0
        ? `${originalText} → ${overriddenText} 외 ${extraCount}개 변형`
        : `${originalText} → ${overriddenText}`;
}

export function buildHarnessRuleImpactSummary(overrides: HarnessRuleImpactSource[]): HarnessRuleImpactSummaryBundle {
    const grouped = new Map<string, HarnessRuleImpactSummaryItem & {
        _originalDecisions: string[];
        _overriddenDecisions: string[];
    }>();

    overrides.forEach((override) => {
        const ruleCode = String(override.ruleCode || '').trim();
        if (!ruleCode) return;

        const ruleVersion = String(override.ruleVersion || '').trim() || null;
        const key = `${ruleCode}::${ruleVersion || 'unversioned'}`;
        const message = String(override.message || '').trim();
        const triggerType = String(override.triggerType || '').trim();
        const originalDecision = String(override.originalDecision || '').trim();
        const overriddenDecision = String(override.overriddenDecision || '').trim();
        const createdAt = String(override.createdAt || '').trim() || null;
        const severity = normalizeSeverity(override.severity);

        if (!grouped.has(key)) {
            grouped.set(key, {
                ruleCode,
                ruleVersion,
                severity,
                count: 0,
                decisionPath: 'N/A → N/A',
                messages: [],
                triggerTypes: [],
                latestCreatedAt: createdAt,
                _originalDecisions: [],
                _overriddenDecisions: [],
            });
        }

        const current = grouped.get(key)!;
        current.count += 1;
        current.severity = resolveHigherSeverity(current.severity, severity);
        current.messages = unique([...current.messages, message]);
        current.triggerTypes = unique([...current.triggerTypes, triggerType]);
        current._originalDecisions = unique([...current._originalDecisions, originalDecision]);
        current._overriddenDecisions = unique([...current._overriddenDecisions, overriddenDecision]);

        if (createdAt && (!current.latestCreatedAt || new Date(createdAt).getTime() > new Date(current.latestCreatedAt).getTime())) {
            current.latestCreatedAt = createdAt;
        }
    });

    const items = Array.from(grouped.values())
        .map((item) => ({
            ruleCode: item.ruleCode,
            ruleVersion: item.ruleVersion,
            severity: item.severity,
            count: item.count,
            decisionPath: buildDecisionPath(item._originalDecisions, item._overriddenDecisions),
            messages: item.messages,
            triggerTypes: item.triggerTypes,
            latestCreatedAt: item.latestCreatedAt,
        }))
        .sort((a, b) => {
            const severityDiff = (severityRank[b.severity] ?? 1) - (severityRank[a.severity] ?? 1);
            if (severityDiff !== 0) return severityDiff;
            if (b.count !== a.count) return b.count - a.count;
            return a.ruleCode.localeCompare(b.ruleCode);
        });

    const narrative = items.length === 0
        ? '현재 저장된 가드레일 오버라이드는 없습니다.'
        : `${items.slice(0, 2).map((item) => `${item.ruleCode} ${item.count}건(${item.severity}) · ${item.decisionPath}`).join(' / ')}${items.length > 2 ? ` / 외 ${items.length - 2}개 룰` : ''}`;

    return {
        items,
        narrative,
        totalCount: overrides.length,
        criticalCount: items.filter((item) => item.severity === 'critical').length,
    };
}