import React, { useRef, useState } from 'react';
import {
    buildLayaSafetyReferencePack,
    evaluateLayaOfflineRun,
    type LayaBenchReport,
} from '../../utils/layaSafetyBenchmark';

const saveJson = (name: string, content: unknown): void => {
    const data = new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
};

/** Developer-only benchmark import. This does not run a model or send network requests. */
export const LayaOfflineBenchmarkPanel: React.FC = () => {
    const [report, setReport] = useState<LayaBenchReport | null>(null);
    const [error, setError] = useState('');
    const picker = useRef<HTMLInputElement>(null);

    const importReport = async (files: FileList | null): Promise<void> => {
        setError('');
        setReport(null);
        const file = files?.[0];
        if (!file) return;
        if (file.size > 512 * 1024 || !file.name.toLowerCase().endsWith('.json')) {
            setError('512KB 이하의 JSON 시험 결과 파일만 열 수 있습니다.');
            return;
        }
        try {
            const parsed: unknown = JSON.parse(await file.text());
            setReport(evaluateLayaOfflineRun(parsed));
        } catch (e) {
            setError(e instanceof Error ? e.message : '시험 결과 파일을 읽지 못했습니다.');
        } finally {
            if (picker.current) picker.current.value = '';
        }
    };
    return (
        <section className="rounded-2xl border border-indigo-200 bg-white p-4 dark:border-indigo-500/30 dark:bg-slate-900 sm:p-5 no-print" aria-label="Laya 오프라인 연구용 위험정보 평가">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black tracking-wider text-indigo-600 dark:text-indigo-300">ATLAS LAB · LOCAL ONLY</p>
                    <h3 className="mt-1 text-lg font-black text-slate-900 dark:text-white">11개 언어 Laya 분류 적합성 시험</h3>
                    <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                        시험용 문장과 기대 위험유형을 내려받고, 컴퓨터에서 별도로 돌린 Laya 예측 결과를 가져오면
                        언어별 분류 일치·위험 누락·예측 누락 수를 계산합니다. PSI 운영 위험등급에는 반영하지 않습니다.
                    </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700 dark:bg-slate-700 dark:text-white">연구용 · 모델 미실행</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => {
                    saveJson('PSI_Laya_11lang_Synthetic_Test_Template.json', buildLayaSafetyReferencePack());
                }} className="min-h-11 rounded-xl bg-indigo-700 px-4 py-2 text-xs font-black text-white">
                    11개 언어 시험자료 저장
                </button>
                <button type="button" onClick={() => picker.current?.click()}
                    className="min-h-11 rounded-xl border border-indigo-300 px-4 py-2 text-xs font-black text-indigo-800 dark:border-indigo-500 dark:text-indigo-200">
                    오프라인 시험 결과 불러오기
                </button>
                <input ref={picker} type="file" accept="application/json,.json" className="hidden" aria-label="Laya 오프라인 결과 JSON" onChange={e => void importReport(e.target.files)} />
            </div>
            <p className="mt-3 text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                시험자료는 11개 언어 × 3개 가상상황(33건)입니다. 한국어 외 10개 언어의 문장은
                현장 통역자가 검토·입력해야 하므로 빈칸으로 제공됩니다. 이 단계만으로 모델 정확도를 주장할 수 없습니다.
            </p>
            {error && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{error}</p>}
            {report && (
                <div className="mt-4" role="status">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                            ['평가된 예측', String(report.predicted)],
                            ['위험 누락', String(report.missedHazard)],
                            ['예측 누락', String(report.unmatched)],
                            ['일치율', report.accuracy === null ? '측정 불가' : (report.accuracy * 100).toFixed(1) + '%'],
                        ].map(([label, value]) => (
                            <div key={label} className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                                <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{label}</p>
                                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{value}</p>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 max-h-72 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                <tr><th className="p-2">언어</th><th className="p-2">검토 문장</th><th className="p-2">예측</th><th className="p-2">위험 누락</th></tr>
                            </thead>
                            <tbody>
                                {report.languageMetrics.map(row => (
                                    <tr key={row.language} className="border-t border-slate-200 dark:border-slate-700">
                                        <td className="p-2 font-bold">{row.name}</td>
                                        <td className="p-2">{row.eligible}</td>
                                        <td className="p-2">{row.predicted}</td>
                                        <td className="p-2 font-bold text-rose-700 dark:text-rose-300">{row.missedHazard}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <button type="button" onClick={() => saveJson('PSI_Laya_Offline_Research_Report.json', report)}
                        className="mt-3 min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black dark:border-slate-600">
                        시험 집계표 저장
                    </button>
                </div>
            )}
            <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-950 dark:bg-amber-500/10 dark:text-amber-100">
                이 결과는 연구자료이며 모델 실행 여부와 번역 검증 이력은 업로드 파일만으로 독립 확인되지 않습니다.
                33건은 안전 판정용으로 부족합니다. Laya 모델 다운로드·실행과 Vercel 함수 호출은 이 화면에서 전혀 하지 않습니다.
            </p>
        </section>
    );
};
export default LayaOfflineBenchmarkPanel;
