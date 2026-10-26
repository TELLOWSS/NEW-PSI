import React, { useMemo, useRef, useState } from 'react';
import {
    LAYA_EXTENDED_SCHEMA,
    LAYA_V2_CASES_PER_LANGUAGE,
    buildLayaExtendedReferencePack,
    evaluateLayaExtendedRun,
    validateLayaExtendedPack,
    type LayaV2Pack,
    type LayaV2Report,
} from '../../utils/layaExtendedSafetyBenchmark';
import { CURRENT_SITE_TRAINING_LANGUAGE_CODES, TRAINING_LANGUAGE_LABELS, type TrainingLanguageCode } from '../../utils/constructionTrainingTranslation';

const exportJson = (name: string, value: unknown) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
};
const importJsonFile = async (file: File): Promise<unknown> => {
    if (!file.name.toLowerCase().endsWith('.json') || file.size > 1024 * 1024) {
        throw new Error('1MB 이하 JSON 파일만 불러올 수 있습니다.');
    }
    return JSON.parse(await file.text()) as unknown;
};
const LABELS: Record<string,string> = {
    fall:'추락',struck_by:'낙하·충돌',caught_in:'끼임·협착',
    electrical:'감전',fire:'화재',none:'사고위험 미기재',
};

export const LayaExtendedReviewPanel: React.FC = () => {
    const [pack,setPack] = useState<LayaV2Pack>(()=>buildLayaExtendedReferencePack());
    const [selected,setSelected] = useState<TrainingLanguageCode>('vi-VN');
    const [reviewerCode,setReviewerCode] = useState('');
    const [result,setResult] = useState<LayaV2Report|null>(null);
    const [feedback,setFeedback] = useState('');
    const filePicker = useRef<HTMLInputElement>(null);
    const resultPicker = useRef<HTMLInputElement>(null);
    const languageCases = useMemo(()=>pack.cases.filter(c=>c.language===selected),[pack,selected]);
    const totals = useMemo(()=>{
        const completed = pack.cases.filter(c=>c.translationReview==='reviewed').length;
        const completedForeign = pack.cases.filter(c=>c.language!=='ko-KR'&&c.translationReview==='reviewed').length;
        return {completed,completedForeign};
    },[pack]);
    const updateSentence = (id:string,text:string) => {
        setPack(current=>({...current,cases:current.cases.map(c=>c.id===id?{
            ...c,text,translationReview:'pending',reviewerCode:'',reviewedAt:null,
        }:c)}));
        setResult(null);
    };
    const markReviewed = (id:string) => {
        const item = pack.cases.find(c=>c.id===id);
        if (!item || item.language==='ko-KR') return;
        if (item.text.trim().length<10 || item.text.trim()===item.referenceKo || reviewerCode.trim().length<3) {
            setFeedback('현지어 문장 10자 이상과 검수자 식별 코드 3자 이상이 필요합니다. 한국어 원문 복사는 불가합니다.');
            return;
        }
        setPack(current=>({...current,cases:current.cases.map(c=>c.id===id?{
            ...c,translationReview:'reviewed',reviewerCode:reviewerCode.trim(),reviewedAt:new Date().toISOString(),
        }:c)}));
        setResult(null);
        setFeedback('검수 기록을 이 기기에 반영했습니다. 파일을 저장해야 보존되며, 신원·전문성 인증은 아닙니다.');
    };
    const loadFile = async (file:File|undefined,mode:'pack'|'result') => {
        if(!file) return;
        setFeedback('');
        try {
            const data = await importJsonFile(file);
            if (mode==='pack') {
                const valid = validateLayaExtendedPack(data);
                setPack(valid);
                setResult(null);
                setFeedback('확장 검수표 132건을 이 브라우저에 불러왔습니다. 로컬에 저장한 원본 파일은 별도로 보관하세요.');
            } else {
                const report = evaluateLayaExtendedRun(data);
                setResult(report);
                setFeedback('오프라인 분류 결과의 숫자만 집계했습니다. 실제 모델 실행·검수자 신원은 독립 인증하지 않습니다.');
            }
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : '파일 읽기 오류');
        }
    };
    return (
        <section className="rounded-2xl border border-sky-200 bg-white p-4 no-print dark:border-sky-500/30 dark:bg-slate-900 sm:p-5" aria-label="Laya 11개 언어 확장 검수판">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black tracking-wider text-sky-700 dark:text-sky-300">ATLAS LAB · RESEARCH V2 · LOCAL ONLY</p>
                    <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">11개 언어 · 6개 위험유형 검수판</h3>
                    <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600 dark:text-slate-300">
                        한국어 기준 12상황 × 11언어, 총 132건입니다. 추락·낙하/충돌·끼임/협착·감전·화재·특정 사고위험 미기재를
                        각각 2건씩 비교합니다. 통역자가 현지어로 검수할 때까지 외국어 문장은 비워 둡니다.
                    </p>
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1.5 text-[11px] font-black text-sky-800 dark:bg-sky-900 dark:text-sky-100">개발자 전용 · 무료 함수 추가 없음</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">외국어 검수 기록</p>
                    <p className="mt-1 text-xl font-black tabular-nums">{totals.completedForeign} / 120</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">검수 대상 언어</p>
                    <p className="mt-1 text-xl font-black tabular-nums">10개 외국어</p>
                </div>
                <div className="col-span-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-800 sm:col-span-1">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">현재 확장 검수표</p>
                    <p className="mt-1 text-xl font-black tabular-nums">v2 · 132건</p>
                </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 text-xs font-black text-white"
                    onClick={()=>{try {exportJson('PSI_Laya_V2_11lang_132cases.json',validateLayaExtendedPack(pack));setFeedback('현 기기의 시험 검수표를 JSON으로 저장했습니다.');}catch(e){setFeedback(e instanceof Error?e.message:'검수표 저장 오류');}}}>
                    검수표 저장 (132건 JSON)
                </button>
                <button type="button" onClick={()=>filePicker.current?.click()}
                    className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black dark:border-slate-600">
                    기존 검수표 다시 열기
                </button>
                <button type="button" onClick={()=>resultPicker.current?.click()}
                    className="min-h-11 rounded-xl border border-sky-300 px-4 py-2 text-xs font-black text-sky-800 dark:border-sky-600 dark:text-sky-200">
                    오프라인 실험 결과 평가
                </button>
                <input ref={filePicker} type="file" className="hidden" accept=".json,application/json" aria-label="132건 검수표 가져오기"
                    onChange={e=>{void loadFile(e.target.files?.[0],'pack');e.target.value='';}}/>
                <input ref={resultPicker} type="file" className="hidden" accept=".json,application/json" aria-label="Laya v2 예측 결과 가져오기"
                    onChange={e=>{void loadFile(e.target.files?.[0],'result');e.target.value='';}}/>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                    검수할 언어
                    <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        value={selected} onChange={e=>setSelected(e.target.value as TrainingLanguageCode)}>
                        {CURRENT_SITE_TRAINING_LANGUAGE_CODES.map(code=>
                            <option key={code} value={code}>{TRAINING_LANGUAGE_LABELS[code]}</option>
                        )}
                    </select>
                </label>
                <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                    검수자 식별 코드 (실명·연락처 입력 금지)
                    <input className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        value={reviewerCode} onChange={e=>setReviewerCode(e.target.value.slice(0,80))}
                        placeholder="예: VI-REVIEWER-A" autoComplete="off"/>
                </label>
            </div>
            <div className="mt-3 grid gap-3">
                {languageCases.map(item=>
                    <article key={item.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-black text-slate-900 dark:text-white">{LABELS[item.expectedLabel]} · {item.id.split(':').slice(1).join(':')}</span>
                            <span className={['rounded-full px-2 py-1 text-[10px] font-black',
                                item.translationReview==='reviewed'?'bg-emerald-100 text-emerald-900':'bg-amber-100 text-amber-900'].join(' ')}>
                                {item.translationReview==='reviewed'?'검수 기록됨':'미검수'}
                            </span>
                        </div>
                        <p className="mt-2 rounded-lg bg-slate-100 p-2.5 text-xs font-semibold leading-5 text-slate-800 dark:bg-slate-800 dark:text-slate-200">
                            한국어 기준: {item.referenceKo}
                        </p>
                        {selected!=='ko-KR' &&
                            <>
                                <label className="mt-3 block text-xs font-black text-slate-700 dark:text-slate-200">
                                    현지어 번역 (의미·부정·작업중지 강도 대조)
                                    <textarea value={item.text} onChange={e=>updateSentence(item.id,e.target.value)}
                                        rows={2} maxLength={3000} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 p-3 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                                        placeholder="실제 통역·검수 후 문장을 입력하세요. 자동 번역하지 않습니다."/>
                                </label>
                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-[11px] text-slate-600 dark:text-slate-300">
                                        {item.translationReview==='reviewed' ? '입력된 검수 기록 (신원 미인증)' : '검수 완료 버튼을 누르기 전까지 평가 제외'}
                                    </span>
                                    <button type="button" onClick={()=>markReviewed(item.id)}
                                        className="min-h-10 rounded-lg border border-sky-300 px-3 py-2 text-xs font-black text-sky-800 dark:border-sky-600 dark:text-sky-200">
                                        현지어 대조 완료 기록
                                    </button>
                                </div>
                            </>
                        }
                    </article>
                )}
            </div>
            {result&&
                <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                    <h4 className="text-sm font-black text-amber-950 dark:text-amber-100">오프라인 평가표 · 연구 전용</h4>
                    <p className="mt-2 text-sm font-bold text-amber-950 dark:text-amber-100">
                        전체 문장 대비 예측 {(result.coverageAllCases*100).toFixed(1)}% ·
                        완전 예측 언어 {result.predictedLanguagesComplete}/11 ·
                        위험 누락 {result.falseNegative}건 ·
                        위험 오경보 {result.falsePositive}건 ·
                        유형 오류 {result.wrongType}건
                    </p>
                    <p className="mt-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
                        이 수치는 가져온 JSON 기반입니다. 모델 실행 및 검수자 인증을 별도로 증명하지 못하며 PSI 운영 자동판정은 금지됩니다.
                    </p>
                    <div className="mt-3 max-h-64 overflow-auto">
                        <table className="min-w-[650px] w-full text-xs text-left">
                            <thead><tr><th className="p-2">언어</th><th className="p-2">검수</th><th className="p-2">예측</th><th className="p-2">위험 누락</th><th className="p-2">오경보</th><th className="p-2">위험검출 재현율</th></tr></thead>
                            <tbody>{result.languages.map(item=><tr key={item.language} className="border-t border-amber-200">
                                <td className="p-2">{item.name}</td><td className="p-2">{item.reviewed}/{LAYA_V2_CASES_PER_LANGUAGE}</td>
                                <td className="p-2">{item.predicted}</td><td className="p-2">{item.falseNegative}</td>
                                <td className="p-2">{item.falsePositive}</td>
                                <td className="p-2">{item.hazardDetectionRecall===null?'평가 불가':(item.hazardDetectionRecall*100).toFixed(1)+'%'}</td>
                            </tr>)}</tbody>
                        </table>
                    </div>
                    <button type="button" onClick={()=>exportJson('PSI_Laya_V2_132case_Research_Report.json',result)}
                        className="mt-3 min-h-11 rounded-xl border border-amber-500 px-4 py-2 text-xs font-black text-amber-950 dark:text-amber-100">
                        검증 결과 저장
                    </button>
                </div>
            }
            {feedback&&<p className="mt-3 rounded-lg bg-slate-100 p-3 text-xs font-bold text-slate-900 dark:bg-slate-800 dark:text-white" role="status">{feedback}</p>}
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold leading-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                검수자 코드와 날짜는 사용자 입력 기록이며 외부 인증이 아닙니다. 이 화면은 모델을 실행하지 않으며 외부 서버로 데이터를 보내지 않습니다.
                개인정보가 포함된 실제 사고·근로자 자료는 입력하지 마세요. 132건도 실제 현장 적용을 승인하기에는 충분하지 않습니다.
            </p>
        </section>
    );
};

export default LayaExtendedReviewPanel;
