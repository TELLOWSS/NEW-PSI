import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { inspectLayaReviewReadiness, verifyLayaRunMatchesCurrentPack } from '../../utils/layaReviewReadiness';
import { advanceLayaReviewCursor, findNextUnreviewedLayaCase, getLayaReviewQueue, resolveLayaReviewCursor } from '../../utils/layaReviewWorkflow';
import { buildLayaReviewHandoff, findNextPendingLayaLanguage } from '../../utils/layaReviewHandoff';
import { compareLayaReviewImport, stageLayaReviewImport, type StagedLayaReviewImport } from '../../utils/layaReviewImportSafety';

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
    const [focusedMode,setFocusedMode] = useState(true);
    const [pendingOnly,setPendingOnly] = useState(false);
    const [requestedCaseId,setRequestedCaseId] = useState('');
    const [needsSave,setNeedsSave] = useState(false);
    const [saveRequested,setSaveRequested] = useState(false);
    const [stagedImport,setStagedImport] = useState<StagedLayaReviewImport|null>(null);
    const [reviewLossAcknowledged,setReviewLossAcknowledged] = useState(false);
    const filePicker = useRef<HTMLInputElement>(null);
    const resultPicker = useRef<HTMLInputElement>(null);
    const languageCases = useMemo(()=>pack.cases.filter(c=>c.language===selected),[pack,selected]);
    const readiness = useMemo(() => inspectLayaReviewReadiness(pack), [pack]);
    const foreignReviewed = readiness.reviewed - LAYA_V2_CASES_PER_LANGUAGE;
    const currentLanguage = readiness.rows.find(row => row.language === selected);
    const nextPendingLanguage = useMemo(()=>findNextPendingLayaLanguage(pack,selected),[pack,selected]);
    const stagedDifference = useMemo(()=>stagedImport ? compareLayaReviewImport(pack,stagedImport.restored.pack) : null,[pack,stagedImport]);
    const importHasOverwriteRisk = Boolean(stagedDifference && (stagedDifference.reviewsLostOnReplace>0 || stagedDifference.conflictingReviewedCases>0));
    const queue = useMemo(()=>getLayaReviewQueue(pack,selected,pendingOnly),[pack,selected,pendingOnly]);
    const cursor = useMemo(()=>resolveLayaReviewCursor(queue,requestedCaseId),[queue,requestedCaseId]);
    const visibleCases = useMemo(()=>focusedMode ? queue.filter(row=>row.id===cursor.id) : queue,[focusedMode,queue,cursor.id]);
    useEffect(()=>{
        if(!needsSave) return;
        const warnUnsaved = (event:BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload',warnUnsaved);
        return ()=>window.removeEventListener('beforeunload',warnUnsaved);
    },[needsSave]);
    const updateSentence = (id:string,text:string) => {
        setPack(current=>({...current,cases:current.cases.map(c=>c.id===id?{
            ...c,text,translationReview:'pending',reviewerCode:'',reviewedAt:null,
        }:c)}));
        setResult(null);
        setNeedsSave(true);
        setSaveRequested(false);
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
        setNeedsSave(true);
        setSaveRequested(false);
        const nextUnreviewed = findNextUnreviewedLayaCase(pack,selected,id);
        if (focusedMode && nextUnreviewed) setRequestedCaseId(nextUnreviewed);
        setFeedback('검수 기록을 이 기기에 반영했습니다. JSON 파일 저장 전에는 작업이 보존되지 않습니다.');
    };
    const applyStagedImport = () => {
        if(!stagedImport || needsSave || (importHasOverwriteRisk && !reviewLossAcknowledged)) return;
        const {restored}=stagedImport;
        setPack(restored.pack);
        setResult(null);
        setNeedsSave(false);
        setSaveRequested(false);
        setStagedImport(null);
        setReviewLossAcknowledged(false);
        setSelected(restored.session?.selectedLanguage ?? 'vi-VN');
        setRequestedCaseId(restored.session?.selectedCaseId ?? '');
        setFocusedMode(restored.session?.focusedMode ?? true);
        setPendingOnly(restored.session?.pendingOnly ?? false);
        setFeedback(restored.ignoredSession
            ? '검수표 교체 완료. 이전 화면 위치 정보가 유효하지 않아 첫 화면으로 열었습니다.'
            : restored.session
            ? '검수표 교체 완료. 마지막 언어·문장 위치를 복원했습니다.'
            : '검수표 교체 완료. 마지막 위치 정보가 없어 첫 문장부터 표시합니다.');
    };
    const loadFile = async (file:File|undefined,mode:'pack'|'result') => {
        if(!file) return;
        setFeedback('');
        if(mode==='pack'){
            // File selection only stages an import. It NEVER replaces current edits.
            setStagedImport(null);
            setReviewLossAcknowledged(false);
        }else{
            setResult(null);
        }
        try {
            const data = await importJsonFile(file);
            if (mode==='pack') {
                const staged=stageLayaReviewImport(pack,data);
                setStagedImport(staged);
                setFeedback('검수표 132건을 검증했습니다. 현재 작업은 그대로 유지됩니다. 차이를 확인하고 교체 여부를 선택하세요.');
            } else {
                verifyLayaRunMatchesCurrentPack(data, pack);
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
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">외국어 검수 기록</p>
                    <p className="mt-1 text-xl font-black tabular-nums">{foreignReviewed} / 120</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">검수 대상 언어</p>
                    <p className="mt-1 text-xl font-black tabular-nums">{Math.max(0, readiness.languagesComplete - 1)} / 10</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">미검수 문장</p>
                    <p className="mt-1 text-xl font-black tabular-nums">{readiness.awaiting}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
                    <p className="text-[11px] font-bold text-slate-600 dark:text-slate-200">동일 문구 반복 경고</p>
                    <p className="mt-1 text-xl font-black tabular-nums">{readiness.possibleCopyPasteCases}</p>
                </div>
            </div>
            <p className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs font-semibold leading-5 text-sky-950 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
                {readiness.awaiting > 0 ? '미검수 문장이 남아 있어 전체 11개 언어 평가 준비가 완료되지 않았습니다. ' : '132건 검수 기록이 존재합니다. '}
                {readiness.possibleCopyPasteCases > 0 ? '같은 언어의 서로 다른 상황에 동일한 번역문이 사용됐습니다. 작업 지시 의미를 다시 대조하세요. ' : ''}
                검수 기록은 신원 인증이나 의미 검증 증명서가 아닙니다. 실제 모델 평가 및 현장 도입은 별도입니다.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 text-xs font-black text-white"
                    onClick={()=>{try {
                        const handoff = buildLayaReviewHandoff(pack,{
                            selectedLanguage:selected,selectedCaseId:cursor.id||'',focusedMode,pendingOnly,
                        });
                        exportJson('PSI_Laya_V2_132cases_Resume.json',handoff);
                        setSaveRequested(needsSave);
                        setFeedback('JSON 다운로드를 요청했습니다. 다운로드 폴더에 파일이 있는지 확인해 주세요. 저장 완료를 자동으로 확정하지 않습니다.');
                    }catch(e){setFeedback(e instanceof Error?e.message:'검수표 저장 오류');}}}>
                    검수표·이어하기 저장
                </button>
                <button type="button" onClick={()=>filePicker.current?.click()}
                    className="min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-xs font-black dark:border-slate-600">
                    기존 검수표 다시 열기
                </button>
                <button type="button" onClick={()=>resultPicker.current?.click()}
                    className="min-h-11 rounded-xl border border-sky-300 px-4 py-2 text-xs font-black text-sky-800 dark:border-sky-600 dark:text-sky-200">
                    오프라인 실험 결과 평가
                </button>
                {needsSave && saveRequested && <button type="button"
                    onClick={()=>{setNeedsSave(false);setSaveRequested(false);setFeedback('사용자가 다운로드된 JSON 파일을 확인한 것으로 기록했습니다. 별도 서버 저장은 하지 않습니다.');}}
                    className="min-h-11 rounded-xl border border-emerald-500 px-4 py-2 text-xs font-black text-emerald-800 dark:text-emerald-200">
                    다운로드 파일 확인 완료
                </button>}
                <input ref={filePicker} type="file" className="hidden" accept=".json,application/json" aria-label="132건 검수표 가져오기"
                    onChange={e=>{void loadFile(e.target.files?.[0],'pack');e.target.value='';}}/>
                <input ref={resultPicker} type="file" className="hidden" accept=".json,application/json" aria-label="Laya v2 예측 결과 가져오기"
                    onChange={e=>{void loadFile(e.target.files?.[0],'result');e.target.value='';}}/>
            </div>
            {stagedImport && stagedDifference && <section role="region" aria-label="검수표 불러오기 비교 확인"
                className="mt-4 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 dark:border-amber-500 dark:bg-amber-500/10">
                <h4 className="text-sm font-black text-amber-950 dark:text-amber-100">검수표를 바꾸기 전에 확인하세요</h4>
                <p className="mt-2 text-xs font-semibold leading-5 text-amber-950 dark:text-amber-100">
                    파일은 검사만 했으며 현재 검수표는 아직 교체하지 않았습니다. 가져올 파일의 검수 기록
                    {stagedDifference.incomingReviewed}/132건, 현재 검수 기록 {stagedDifference.existingReviewed}/132건,
                    다른 문장·검수기록 {stagedDifference.changedCases}건입니다.
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-bold text-amber-950 dark:text-amber-100">
                    <span>교체 시 검수→미검수 {stagedDifference.reviewsLostOnReplace}건</span>
                    <span>교체 시 미검수→검수 {stagedDifference.reviewsAddedOnReplace}건</span>
                    <span>검수 기록 내용 변경 {stagedDifference.conflictingReviewedCases}건</span>
                    <span>새 파일의 미검수 외국어 {stagedDifference.pendingLanguagesAfter}개</span>
                </div>
                {stagedDifference.changedLanguages.length>0 && <p className="mt-2 text-xs text-amber-950 dark:text-amber-100">
                    차이가 있는 언어: {stagedDifference.changedLanguages.map(item=>item.label+' '+item.changed+'건').join(' · ')}
                </p>}
                {needsSave && <p role="alert" className="mt-3 rounded-lg bg-white p-3 text-xs font-black text-rose-800 dark:bg-slate-900 dark:text-rose-200">
                    현재 수정 중인 자료가 저장되지 않았습니다. 위의 「검수표·이어하기 저장」으로 백업을 요청하고,
                    실제 다운로드 파일을 확인한 후에만 교체할 수 있습니다.
                </p>}
                {importHasOverwriteRisk && <label className="mt-3 flex items-start gap-2 text-xs font-black text-amber-950 dark:text-amber-100">
                    <input type="checkbox" className="mt-1 size-4" checked={reviewLossAcknowledged}
                        onChange={e=>setReviewLossAcknowledged(e.target.checked)}/>
                    교체 시 기존의 일부 검수 완료 기록이 없어지거나 다른 내용으로 바뀌는 것을 확인했습니다.
                </label>}
                <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={applyStagedImport}
                        disabled={needsSave || (importHasOverwriteRisk && !reviewLossAcknowledged)}
                        className="min-h-11 rounded-xl bg-amber-800 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                        확인 후 이 파일로 교체
                    </button>
                    <button type="button" onClick={()=>{setStagedImport(null);setReviewLossAcknowledged(false);setFeedback('불러오기를 취소했습니다. 기존 검수자료를 유지했습니다.');}}
                        className="min-h-11 rounded-xl border border-amber-500 px-4 py-2 text-xs font-black text-amber-950 dark:text-amber-100">
                        취소 · 기존 자료 유지
                    </button>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                    이 비교는 문장·검수자 코드·시각의 차이이며, 실제 번역 의미나 검수자 신원을 인증하지 않습니다.
                </p>
            </section>}
            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <label className="text-xs font-black text-slate-700 dark:text-slate-200">
                    검수할 언어
                    <select className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        value={selected} onChange={e=>{setSelected(e.target.value as TrainingLanguageCode);setRequestedCaseId('');}}>
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
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">검수가 필요한 다른 언어로 이어가기</span>
                <button type="button" disabled={!nextPendingLanguage}
                    onClick={()=>{if(nextPendingLanguage){setSelected(nextPendingLanguage);setRequestedCaseId('');setPendingOnly(true);setFocusedMode(true);}}}
                    className="min-h-11 rounded-xl bg-sky-700 px-4 py-2 text-xs font-black text-white disabled:opacity-40">
                    {nextPendingLanguage ? TRAINING_LANGUAGE_LABELS[nextPendingLanguage]+' 검수로 이동' : '미검수 외국어 없음'}
                </button>
            </div>
            <p className="mt-2 text-xs font-bold text-slate-600 dark:text-slate-300">
                현재 언어: 검수 {currentLanguage?.reviewed ?? 0} / 12건 · 미검수 {currentLanguage?.missing ?? 0}건
                {(currentLanguage?.suspiciousDuplicates ?? 0) > 0 ? ' · 동일 번역문 반복: 수동 확인 필요' : ''}
            </p>
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-black text-sky-950 dark:text-sky-100">
                        {focusedMode ? '한 건씩 집중 검수' : '12건 전체 검수'} · {cursor.total>0 ? cursor.position+' / '+cursor.total : '표시할 항목 없음'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" aria-pressed={focusedMode} onClick={()=>setFocusedMode(current=>!current)}
                            className="min-h-10 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 dark:border-sky-700 dark:bg-slate-800 dark:text-sky-100">
                            {focusedMode ? '12건 한꺼번에 보기' : '한 건씩 보기'}
                        </button>
                        <button type="button" aria-pressed={pendingOnly} onClick={()=>{setPendingOnly(current=>!current);setRequestedCaseId('');}}
                            className="min-h-10 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-black text-sky-900 dark:border-sky-700 dark:bg-slate-800 dark:text-sky-100">
                            {pendingOnly ? '전체 보기' : '미검수만 보기'}
                        </button>
                    </div>
                </div>
                <p className="mt-2 text-xs font-semibold text-sky-900 dark:text-sky-100">
                    {needsSave ? (saveRequested
                        ? '다운로드를 요청했습니다. 실제 JSON 파일을 확인한 뒤 「다운로드 파일 확인 완료」를 눌러 주세요.'
                        : '미저장 변경사항이 있습니다. 검수표·이어하기 JSON을 저장해 주세요.')
                        : '미저장 변경사항 없음 · 기기를 바꿀 때는 검수표 JSON을 직접 보관하세요.'}
                </p>
                {focusedMode && cursor.id && (
                    <nav className="mt-3 flex items-center justify-between gap-2" aria-label="검수 문장 탐색">
                        <button type="button" disabled={cursor.position<=1}
                            onClick={()=>setRequestedCaseId(advanceLayaReviewCursor(queue,cursor.id!,-1)||'')}
                            className="min-h-11 rounded-xl bg-white px-4 py-2 text-xs font-black text-sky-900 disabled:opacity-40 dark:bg-slate-800 dark:text-sky-100">이전 문장</button>
                        <span className="text-xs font-bold tabular-nums text-sky-900 dark:text-sky-100">{cursor.position} / {cursor.total}</span>
                        <button type="button" disabled={cursor.position>=cursor.total}
                            onClick={()=>setRequestedCaseId(advanceLayaReviewCursor(queue,cursor.id!,1)||'')}
                            className="min-h-11 rounded-xl bg-white px-4 py-2 text-xs font-black text-sky-900 disabled:opacity-40 dark:bg-slate-800 dark:text-sky-100">다음 문장</button>
                    </nav>
                )}
                {focusedMode && <div className="mt-3 grid grid-cols-6 gap-1 sm:grid-cols-12" aria-label="12개 안전상황 바로가기">
                    {languageCases.map((item,index)=><button type="button" key={item.id}
                        onClick={()=>{if(pendingOnly && item.translationReview==='reviewed') setPendingOnly(false);setRequestedCaseId(item.id);}}
                        aria-current={cursor.id===item.id?'step':undefined}
                        aria-label={String(index+1)+'번 '+LABELS[item.expectedLabel]+' '+(item.translationReview==='reviewed'?'검수 기록':'미검수')}
                        className={['min-h-10 rounded-lg border text-xs font-black',
                          cursor.id===item.id ? 'border-sky-700 bg-sky-700 text-white' :
                          item.translationReview==='reviewed' ? 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-100' :
                          'border-sky-200 bg-white text-sky-900 dark:bg-slate-800 dark:text-white'].join(' ')}>
                        {index+1}
                    </button>)}
                </div>}
            </div>
            <div className="mt-3 grid gap-3">
                {queue.length===0 && <p role="status" className="rounded-xl border border-emerald-300 p-4 text-sm font-bold text-emerald-900 dark:text-emerald-200">
                    {pendingOnly?'현재 언어에 미검수 문장이 없습니다. 검수표 JSON을 저장해 주세요.':'표시할 검수 문장이 없습니다.'}
                </p>}
                {visibleCases.map(item=>
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
