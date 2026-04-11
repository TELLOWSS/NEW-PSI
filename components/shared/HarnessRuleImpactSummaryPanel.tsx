import React from 'react';
import type { HarnessRuleImpactSummaryBundle } from '../../utils/harnessRuleImpactSummary';

interface HarnessRuleImpactSummaryPanelProps {
    title: string;
    summary: HarnessRuleImpactSummaryBundle;
    emptyMessage?: string;
    className?: string;
    maxVisible?: number;
}

const severityClassMap: Record<string, string> = {
    info: 'bg-slate-100 text-slate-700',
    warning: 'bg-amber-100 text-amber-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-rose-100 text-rose-700',
};

export const HarnessRuleImpactSummaryPanel: React.FC<HarnessRuleImpactSummaryPanelProps> = ({
    title,
    summary,
    emptyMessage = '저장된 룰 개입 요약이 없습니다.',
    className,
    maxVisible = 3,
}) => {
    const visibleItems = summary.items.slice(0, maxVisible);
    const hiddenCount = Math.max(summary.items.length - visibleItems.length, 0);

    return (
        <div className={className ?? 'rounded-2xl border border-amber-200 bg-amber-50/80 p-4'}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">{title}</p>
                    <p className="mt-2 text-sm font-black text-amber-800">{summary.totalCount > 0 ? `${summary.totalCount}건의 룰 개입이 저장됐습니다.` : '오버라이드 개입이 없는 흐름입니다.'}</p>
                </div>
                <div className="text-right">
                    <span className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-black text-amber-700">Critical {summary.criticalCount}</span>
                </div>
            </div>
            {visibleItems.length > 0 ? (
                <div className="mt-3 space-y-2">
                    {visibleItems.map((item) => (
                        <div key={`${item.ruleCode}-${item.ruleVersion || 'none'}`} className="rounded-xl border border-white/80 bg-white/80 px-3 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-black text-slate-800">{item.ruleCode}</p>
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-700">{item.count}건</span>
                                    <span className={`rounded-full px-2 py-1 text-[10px] font-black ${severityClassMap[item.severity] || severityClassMap.warning}`}>{item.severity}</span>
                                </div>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-amber-700">{item.decisionPath}</p>
                            <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-700">{item.messages[0] || '메시지 없음'}</p>
                            <p className="mt-1 text-[10px] font-bold text-slate-500 break-all">버전: {item.ruleVersion || '미지정'}{item.triggerTypes.length > 0 ? ` · 트리거: ${item.triggerTypes.join(', ')}` : ''}</p>
                        </div>
                    ))}
                    {hiddenCount > 0 ? <p className="text-[10px] font-bold text-amber-700">+ 추가 룰 {hiddenCount}건은 상세 오버라이드 로그에서 이어서 확인할 수 있습니다.</p> : null}
                </div>
            ) : (
                <p className="mt-2 text-[11px] font-bold text-slate-500">{emptyMessage}</p>
            )}
        </div>
    );
};