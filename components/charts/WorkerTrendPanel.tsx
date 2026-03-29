/**
 * 개인별 트렌드 추적 패널 + 상세 모달
 * - 선택된 타겟 그룹(공종+국적) 근로자 목록
 * - 근로자 클릭 시 최근 6개월 점수 추이 라인차트 모달
 */
import React, { useState, useEffect } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
    type TradeNationalityGroupData,
    type WorkerTrendData,
} from '../../utils/dashboardDataTransformer';

interface Props {
    targetGroup: TradeNationalityGroupData | null;
}

const SCORE_COLOR = (score: number) =>
    score >= 75 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

const TrendTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const score = payload[0]?.value as number;
    return (
        <div className="bg-slate-900/95 text-white text-xs rounded-xl shadow-2xl p-3 border border-white/10">
            <p className="font-bold text-indigo-300 mb-1">{label}</p>
            <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: SCORE_COLOR(score) }} />
                <span>종합 점수</span>
                <span className="font-black ml-1">{score}점</span>
            </div>
        </div>
    );
};

interface TrendModalProps {
    worker: WorkerTrendData;
    onClose: () => void;
}

const TrendModal: React.FC<TrendModalProps> = ({ worker, onClose }) => {
    const first = worker.trend[0]?.score ?? 0;
    const last  = worker.trend[worker.trend.length - 1]?.score ?? 0;
    const delta = last - first;
    const avg   = parseFloat((worker.trend.reduce((s, t) => s + t.score, 0) / worker.trend.length).toFixed(1));

    // ESC 키로 닫기
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center px-4"
            style={{ background: 'rgba(15,23,42,0.75)', backdropFilter: 'blur(4px)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg sm:max-w-2xl mx-auto overflow-hidden animate-[fadeInScale_0.2s_ease-out]">
                {/* Modal Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 px-5 py-4 text-white flex justify-between items-start">
                    <div>
                        <h4 className="font-bold text-base sm:text-lg">{worker.name}</h4>
                        <p className="text-indigo-200 text-xs mt-0.5">
                            {worker.trade} 공종 · {worker.nationality} · 평가 기록 추이
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
                        aria-label="닫기"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* 요약 통계 */}
                <div className="grid grid-cols-3 divide-x divide-slate-100 border-b border-slate-100">
                    {[
                        { label: '최신 점수', value: `${last}점`, color: SCORE_COLOR(last) },
                        { label: '6개월 평균', value: `${avg}점`, color: SCORE_COLOR(avg) },
                        {
                            label: '변화',
                            value: `${delta >= 0 ? '+' : ''}${delta}점`,
                            color: delta >= 0 ? '#10b981' : '#ef4444',
                        },
                    ].map(s => (
                        <div key={s.label} className="p-3 sm:p-4 text-center">
                            <p className="text-[10px] sm:text-xs text-slate-500 mb-1">{s.label}</p>
                            <p className="text-lg sm:text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                        </div>
                    ))}
                </div>

                {/* Line Chart */}
                <div className="p-4 sm:p-6">
                    {worker.trend.length < 2 ? (
                        <div className="h-[220px] flex flex-col items-center justify-center text-center text-slate-400">
                            <p className="font-semibold text-sm">추이 분석을 위한 기록이 부족합니다.</p>
                            <p className="text-xs mt-1">최소 2건 이상 평가가 쌓이면 선형 추이가 표시됩니다.</p>
                        </div>
                    ) : (
                        <>
                            <ResponsiveContainer width="100%" height={220}>
                                <LineChart data={worker.trend} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="label"
                                        tick={{ fontSize: 11, fill: '#64748b' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        domain={[0, 100]}
                                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                                        axisLine={false}
                                        tickLine={false}
                                        tickFormatter={(v) => `${v}`}
                                        width={32}
                                    />
                                    <Tooltip content={<TrendTooltip />} />
                                    <ReferenceLine y={75} stroke="#10b981" strokeDasharray="4 4" label={{ value: '양호', fontSize: 9, fill: '#10b981', position: 'right' }} />
                                    <ReferenceLine y={60} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: '주의', fontSize: 9, fill: '#f59e0b', position: 'right' }} />
                                    <Line
                                        type="monotone"
                                        dataKey="score"
                                        name="종합 점수"
                                        stroke="#6366f1"
                                        strokeWidth={2.5}
                                        dot={(props) => {
                                            const { cx, cy, payload } = props;
                                            return (
                                                <circle
                                                    key={payload.date}
                                                    cx={cx} cy={cy} r={5}
                                                    fill={SCORE_COLOR(payload.score)}
                                                    stroke="#fff"
                                                    strokeWidth={2}
                                                />
                                            );
                                        }}
                                        activeDot={{ r: 7, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                            <p className="text-right text-[10px] text-slate-400 mt-1">
                                ※ 초록 75점 이상 양호 / 노랑 60~75점 주의 / 빨강 60점 미만 고위험
                            </p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export const WorkerTrendPanel: React.FC<Props> = ({ targetGroup }) => {
    const [selectedWorker, setSelectedWorker] = useState<WorkerTrendData | null>(null);

    if (!targetGroup) {
        return (
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex items-center justify-center min-h-[100px]">
                <p className="text-xs text-slate-400 font-medium">작업조를 선택하면 개인별 트렌드 목록이 활성화됩니다.</p>
            </div>
        );
    }

    const workers = targetGroup.workers;
    const latestAvg = targetGroup.compositeScore;

    return (
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-800">
                        개인별 트렌드 추적
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        근로자를 클릭하면 6개월 점수 추이를 확인할 수 있습니다.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold">
                        {targetGroup.trade} · {targetGroup.nationality}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">
                        그룹 평균: <strong>{latestAvg}점</strong>
                    </span>
                </div>
            </div>

            {workers.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-slate-400 text-sm">
                    해당 그룹의 개인 데이터가 없습니다.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                        <thead>
                            <tr className="border-b border-slate-100">
                                {['이름', '최신 점수', '6개월 평균', '추이', '상세'].map(h => (
                                    <th key={h} className="text-left text-[10px] sm:text-xs font-bold text-slate-400 uppercase pb-2 pr-3 whitespace-nowrap tracking-wide">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {workers.map(w => {
                                const latest = w.latestScore;
                                const avg = w.averageScore;
                                const delta = w.deltaScore;
                                return (
                                    <tr
                                        key={w.workerId}
                                        className="hover:bg-indigo-50/60 transition-colors cursor-pointer group"
                                        onClick={() => setSelectedWorker(w)}
                                    >
                                        <td className="py-2.5 pr-3 font-semibold text-slate-800 text-xs sm:text-sm group-hover:text-indigo-700 transition-colors">
                                            {w.name}
                                        </td>
                                        <td className="py-2.5 pr-3">
                                            <span
                                                className="px-2 py-0.5 rounded-full text-xs font-bold"
                                                style={{
                                                    background: SCORE_COLOR(latest) + '22',
                                                    color: SCORE_COLOR(latest),
                                                }}
                                            >
                                                {latest}점
                                            </span>
                                        </td>
                                        <td className="py-2.5 pr-3 text-xs text-slate-600 font-medium">{avg}점</td>
                                        <td className="py-2.5 pr-3">
                                            <span className={`text-xs font-bold ${delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                                {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}
                                            </span>
                                        </td>
                                        <td className="py-2.5">
                                            <button className="text-[10px] sm:text-xs text-indigo-500 hover:text-indigo-700 font-bold px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                                                차트 보기
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {selectedWorker && (
                <TrendModal
                    worker={selectedWorker}
                    onClose={() => setSelectedWorker(null)}
                />
            )}
        </div>
    );
};
