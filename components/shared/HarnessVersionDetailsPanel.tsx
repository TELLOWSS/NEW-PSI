import React from 'react';
import type { HarnessVersionDescriptor } from '../../utils/harnessVersionCatalog';

interface HarnessVersionDetailsPanelProps {
    title: string;
    descriptors: HarnessVersionDescriptor[];
    tone?: 'prompt' | 'policy' | 'rule';
    emptyMessage?: string;
    className?: string;
}

const toneClassMap: Record<NonNullable<HarnessVersionDetailsPanelProps['tone']>, {
    container: string;
    heading: string;
    chip: string;
}> = {
    prompt: {
        container: 'border-violet-200 bg-violet-50/80',
        heading: 'text-violet-800',
        chip: 'bg-violet-100 text-violet-700',
    },
    policy: {
        container: 'border-indigo-200 bg-indigo-50/80',
        heading: 'text-indigo-800',
        chip: 'bg-indigo-100 text-indigo-700',
    },
    rule: {
        container: 'border-amber-200 bg-amber-50/80',
        heading: 'text-amber-800',
        chip: 'bg-amber-100 text-amber-700',
    },
};

export const HarnessVersionDetailsPanel: React.FC<HarnessVersionDetailsPanelProps> = ({
    title,
    descriptors,
    tone = 'prompt',
    emptyMessage = '표시할 버전 정보가 없습니다.',
    className,
}) => {
    const toneClass = toneClassMap[tone];

    return (
        <div className={className ?? `rounded-xl border px-4 py-3 ${toneClass.container}`}>
            <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${toneClass.heading}`}>{title}</p>
            {descriptors.length > 0 ? (
                <div className="mt-2 space-y-2">
                    {descriptors.map((descriptor) => (
                        <div key={descriptor.version} className="rounded-lg border border-white/70 bg-white/70 px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <p className={`text-xs font-black ${toneClass.heading}`}>{descriptor.version}</p>
                                <span className={`rounded-full px-2 py-1 text-[10px] font-black ${toneClass.chip}`}>{descriptor.label}</span>
                            </div>
                            <p className="mt-1 text-[11px] font-bold text-slate-700 leading-relaxed">{descriptor.summary}</p>
                            {descriptor.previousVersion ? (
                                <p className="mt-1 text-[10px] font-bold text-slate-500">이전 기준: {descriptor.previousVersion}</p>
                            ) : null}
                            {descriptor.changesFromPrevious && descriptor.changesFromPrevious.length > 0 ? (
                                <ul className="mt-2 space-y-1">
                                    {descriptor.changesFromPrevious.slice(0, 3).map((change, index) => (
                                        <li key={`${descriptor.version}-change-${index}`} className="text-[11px] font-semibold leading-relaxed text-slate-600">
                                            • {change}
                                        </li>
                                    ))}
                                </ul>
                            ) : null}
                        </div>
                    ))}
                </div>
            ) : (
                <p className="mt-2 text-[11px] font-bold text-slate-500">{emptyMessage}</p>
            )}
        </div>
    );
};
