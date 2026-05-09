import React, { useEffect, useMemo, useState } from 'react';
import {
    buildDefaultChecklist,
    getDateKey,
    getYesterdayKey,
    loadOpsChecklistStore,
    OPS_CHECKLIST_STORAGE_KEY,
    saveOpsChecklistStore,
    type DailyOpsChecklist,
    type DailyOpsChecklistStore,
} from '../../utils/opsChecklistUtils';

export const OperationalSessionChecklist: React.FC = () => {
    const todayKey = useMemo(() => getDateKey(new Date()), []);
    const yesterdayKey = useMemo(() => getYesterdayKey(), []);
    const [store, setStore] = useState<DailyOpsChecklistStore>({});

    useEffect(() => {
        const loaded = loadOpsChecklistStore();
        setStore(loaded);
    }, []);

    const todayChecklist = store[todayKey] || buildDefaultChecklist(todayKey);
    const yesterdayChecklist = store[yesterdayKey] || null;

    useEffect(() => {
        if (!yesterdayChecklist) return;
        const hasTodayActions = todayChecklist.nextActions.some((item) => String(item || '').trim().length > 0);
        if (hasTodayActions) return;

        const carryOver = (yesterdayChecklist.nextActions || []).map((item) => String(item || '').trim()).slice(0, 3) as [string, string, string];
        if (!carryOver.some(Boolean)) return;

        updateTodayChecklist((prev) => ({
            ...prev,
            nextActions: carryOver,
        }));
    }, [yesterdayChecklist, todayChecklist.nextActions]);

    const updateTodayChecklist = (updater: (prev: DailyOpsChecklist) => DailyOpsChecklist) => {
        setStore((prevStore) => {
            const base = prevStore[todayKey] || buildDefaultChecklist(todayKey);
            const next = {
                ...updater(base),
                updatedAt: new Date().toISOString(),
            };
            const nextStore = {
                ...prevStore,
                [todayKey]: next,
            };
            saveOpsChecklistStore(nextStore);
            return nextStore;
        });
    };

    const toggleStartCheck = (index: number) => {
        updateTodayChecklist((prev) => {
            const nextChecks = [...prev.startChecks] as [boolean, boolean, boolean];
            nextChecks[index] = !nextChecks[index];
            return { ...prev, startChecks: nextChecks };
        });
    };

    const toggleEndCheck = (index: number) => {
        updateTodayChecklist((prev) => {
            const nextChecks = [...prev.endChecks] as [boolean, boolean, boolean];
            nextChecks[index] = !nextChecks[index];
            return { ...prev, endChecks: nextChecks };
        });
    };

    const updateNextAction = (index: number, value: string) => {
        updateTodayChecklist((prev) => {
            const next = [...prev.nextActions] as [string, string, string];
            next[index] = value;
            return { ...prev, nextActions: next };
        });
    };

    const startDoneCount = todayChecklist.startChecks.filter(Boolean).length;
    const endDoneCount = todayChecklist.endChecks.filter(Boolean).length;

    const yesterdayNextActions = (yesterdayChecklist?.nextActions || []).map((item) => String(item || '').trim()).filter(Boolean).slice(0, 3);

    return (
        <section className="rounded-2xl border border-indigo-100 bg-white p-4 shadow-sm dark:border-indigo-500/20 dark:bg-slate-800 no-print">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">운영 시작/종료 체크</p>
                    <h3 className="mt-1 text-sm font-black text-slate-900 dark:text-slate-100">시작 1분 · 종료 2분 루틴</h3>
                </div>
                <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-black text-indigo-700 dark:border-indigo-400/30 dark:bg-indigo-500/20 dark:text-indigo-200">
                    오늘 시작 {startDoneCount}/3 · 종료 {endDoneCount}/3
                </span>
            </div>

            {yesterdayNextActions.length > 0 && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <p className="text-[11px] font-black text-amber-700 dark:text-amber-200">어제 종료에서 이어진 오늘 우선 3건</p>
                    <ul className="mt-1 space-y-1 text-[11px] font-semibold text-amber-800 dark:text-amber-100">
                        {yesterdayNextActions.map((item, index) => (
                            <li key={`${item}-${index}`}>- {item}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">시작 체크 (1분)</p>
                    <div className="mt-2 space-y-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                        {[
                            '운영 모드가 실무 즉시인지 확인',
                            '오늘 즉시 처리 3건 확인',
                            '전일 미완료 3건 중 1순위 확정',
                        ].map((label, index) => (
                            <label key={label} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={todayChecklist.startChecks[index]}
                                    onChange={() => toggleStartCheck(index)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
                    <p className="text-xs font-black text-slate-800 dark:text-slate-100">종료 체크 (2분)</p>
                    <div className="mt-2 space-y-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200">
                        {[
                            '완료/미완료 3줄 기록',
                            '미완료 원인 1줄 기록',
                            '다음 시작 즉시 실행 3건 고정',
                        ].map((label, index) => (
                            <label key={label} className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={todayChecklist.endChecks[index]}
                                    onChange={() => toggleEndCheck(index)}
                                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <label className="block">
                    <p className="text-[11px] font-black text-slate-600 dark:text-slate-300">오늘 완료/미완료 요약</p>
                    <textarea
                        value={todayChecklist.completedSummary}
                        onChange={(event) => updateTodayChecklist((prev) => ({ ...prev, completedSummary: event.target.value }))}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        placeholder="예: 완료 2건 / 미완료 1건 (원인: 승인 대기)"
                    />
                </label>
                <label className="block">
                    <p className="text-[11px] font-black text-slate-600 dark:text-slate-300">미완료 원인 1줄</p>
                    <textarea
                        value={todayChecklist.blockerSummary}
                        onChange={(event) => updateTodayChecklist((prev) => ({ ...prev, blockerSummary: event.target.value }))}
                        rows={3}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                        placeholder="예: 현장 승인자 확인 지연"
                    />
                </label>
            </div>

            <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">다음 시작 즉시 실행 3건</p>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
                    {[0, 1, 2].map((index) => (
                        <input
                            key={index}
                            value={todayChecklist.nextActions[index]}
                            onChange={(event) => updateNextAction(index, event.target.value)}
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                            placeholder={`${index + 1}순위 작업`}
                        />
                    ))}
                </div>
                <p className="mt-2 text-[10px] font-semibold text-slate-400">입력 내용은 브라우저에 자동 저장됩니다. (키: {OPS_CHECKLIST_STORAGE_KEY})</p>
            </div>
        </section>
    );
};
