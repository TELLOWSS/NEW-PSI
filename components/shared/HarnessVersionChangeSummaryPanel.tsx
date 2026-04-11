import React from 'react';

interface HarnessVersionChangeSummaryPanelProps {
    title: string;
    lines: string[];
    tone?: 'prompt' | 'policy' | 'rule';
    emptyMessage?: string;
    maxVisible?: number;
    className?: string;
}

const toneClassMap: Record<NonNullable<HarnessVersionChangeSummaryPanelProps['tone']>, {
    container: string;
    heading: string;
    badge: string;
    meta: string;
}> = {
    prompt: {
        container: 'border-indigo-200 bg-indigo-50/80',
        heading: 'text-indigo-800',
        badge: 'bg-indigo-100 text-indigo-700',
        meta: 'text-indigo-600',
    },
    policy: {
        container: 'border-violet-200 bg-violet-50/80',
        heading: 'text-violet-800',
        badge: 'bg-violet-100 text-violet-700',
        meta: 'text-violet-600',
    },
    rule: {
        container: 'border-amber-200 bg-amber-50/80',
        heading: 'text-amber-800',
        badge: 'bg-amber-100 text-amber-700',
        meta: 'text-amber-700',
    },
};

function splitVersionChangeLine(line: string): { version: string | null; change: string } {
    const normalized = String(line || '').trim();
    const separatorIndex = normalized.indexOf(':');
    if (separatorIndex <= 0) {
        return { version: null, change: normalized };
    }

    return {
        version: normalized.slice(0, separatorIndex).trim() || null,
        change: normalized.slice(separatorIndex + 1).trim() || normalized,
    };
}

export const HarnessVersionChangeSummaryPanel: React.FC<HarnessVersionChangeSummaryPanelProps> = ({
    title,
    lines,
    tone = 'rule',
    emptyMessage = '기록된 변경 요약이 없습니다.',
    maxVisible = 2,
    className,
}) => {
    const toneClass = toneClassMap[tone];
    const normalizedLines = lines.map((line) => splitVersionChangeLine(line)).filter((entry) => entry.change);
    const visibleLines = normalizedLines.slice(0, maxVisible);
    const hiddenCount = Math.max(normalizedLines.length - visibleLines.length, 0);

    return (
        <div className={className ?? `rounded-xl border px-4 py-3 ${toneClass.container}`}>
            <div className="flex items-start justify-between gap-3">
                <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${toneClass.heading}`}>{title}</p>
                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${toneClass.badge}`}>{normalizedLines.length}건</span>
            </div>
            {visibleLines.length > 0 ? (
                <div className="mt-2 space-y-2">
                    {visibleLines.map((entry, index) => (
                        <div key={`${entry.version || 'change'}-${index}`} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                            {entry.version ? (
                                <p className={`text-[10px] font-black uppercase tracking-[0.14em] ${toneClass.meta}`}>{entry.version}</p>
                            ) : null}
                            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-700">• {entry.change}</p>
                        </div>
                    ))}
                    {hiddenCount > 0 ? (
                        <p className={`text-[10px] font-bold ${toneClass.meta}`}>+ 추가 변경 {hiddenCount}건은 아래 버전 상세 표에서 이어서 확인할 수 있습니다.</p>
                    ) : null}
                </div>
            ) : (
                <p className="mt-2 text-[11px] font-bold text-slate-500">{emptyMessage}</p>
            )}
        </div>
    );
};