import React, { useEffect, useMemo, useState } from 'react';
import type { TbmEducationDraft } from '../../utils/tbmEducationStudio';
import {
    buildEducationPreview30,
    EDUCATION_PREVIEW_SECONDS,
    selectEducationPreviewScene,
} from '../../utils/educationPreview30';

type Props = { draft: TbmEducationDraft };

const secs = (value: number): string =>
    `00:${String(Math.floor(Math.max(0, Math.min(EDUCATION_PREVIEW_SECONDS, value)))).padStart(2, '0')}`;

/**
 * Browser-only storyboard rehearsal: no request, model, media encode, GPU
 * renderer, timers on the server, or remote fonts.
 */
export const EducationPreview30: React.FC<Props> = ({ draft }) => {
    const result = useMemo(() => {
        try {
            return { scenes: buildEducationPreview30(draft), error: '' };
        } catch (error) {
            return { scenes: [], error: error instanceof Error ? error.message : '장면 구성을 확인해 주세요.' };
        }
    }, [draft]);
    const [elapsed, setElapsed] = useState(0);
    const [playing, setPlaying] = useState(false);

    useEffect(() => {
        setElapsed(0);
        setPlaying(false);
    }, [result]);

    useEffect(() => {
        if (!playing) return;
        const origin = Date.now() - elapsed * 1000;
        const timer = window.setInterval(() => {
            const next = Math.min(EDUCATION_PREVIEW_SECONDS, (Date.now() - origin) / 1000);
            setElapsed(next);
            if (next >= EDUCATION_PREVIEW_SECONDS) setPlaying(false);
        }, 250);
        return () => window.clearInterval(timer);
        // Start/pause reanchors elapsed; do not recreate interval on every tick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [playing]);

    const scene = selectEducationPreviewScene(result.scenes, elapsed);
    const canPlay = result.scenes.length > 0 && !result.error;
    const ended = elapsed >= EDUCATION_PREVIEW_SECONDS;

    return (
        <section className="rounded-2xl border border-sky-200 bg-slate-950 p-5 text-white shadow-sm" aria-label="30초 안전교육 압축 미리보기">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[.18em] text-sky-300">PSI · EDUCATION PREVIEW</p>
                    <h3 className="mt-1 text-lg font-black">30초 핵심 흐름 미리보기</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
                        5분 장면표를 30초로 압축해 미리 보는 화면입니다. 실제 동영상·음성 생성이나 AI 분석이 아닙니다.
                    </p>
                </div>
                <span className="rounded-full border border-white/20 px-3 py-2 text-xs font-black tabular-nums" aria-live="off">
                    {secs(elapsed)} / 00:30
                </span>
            </div>
            {result.error ? (
                <p role="status" className="mt-4 rounded-xl bg-amber-950/50 p-4 text-sm font-bold leading-6 text-amber-200">
                    5분 장면표를 검수하면 미리보기가 활성화됩니다. {result.error}
                </p>
            ) : (
                <div className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-5" aria-live="polite">
                    <p className="text-xs font-bold text-sky-300">장면 {scene?.order ?? 0}/{result.scenes.length} · {ended ? '미리보기 종료' : playing ? '압축 재생 중' : '재생 준비'}</p>
                    <h4 className="mt-2 break-words text-xl font-black leading-snug">{scene?.title}</h4>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-white">{scene?.narration}</p>
                    <div className="mt-4 rounded-lg border border-white/10 bg-slate-800 px-3 py-3">
                        <p className="text-[11px] font-black text-slate-300">화면 구성 가이드 · 실제 영상 아님</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-200">{scene?.visualGuide}</p>
                    </div>
                </div>
            )}
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-700" role="progressbar"
                aria-label="30초 미리보기 진행" aria-valuemin={0} aria-valuemax={30} aria-valuenow={Math.floor(elapsed)}>
                <div className="h-full rounded-full bg-sky-400 transition-[width] duration-200"
                    style={{ width: `${Math.max(0, Math.min(100, (elapsed / EDUCATION_PREVIEW_SECONDS) * 100))}%` }} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={!canPlay} onClick={() => {
                    if (ended) setElapsed(0);
                    setPlaying(!playing || ended);
                }} className="min-h-11 rounded-xl bg-sky-500 px-5 py-2 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
                    {playing ? '일시정지' : ended ? '다시 보기' : elapsed > 0 ? '이어 보기' : '30초 재생'}
                </button>
                <button type="button" disabled={!canPlay || elapsed === 0} onClick={() => {
                    setPlaying(false);
                    setElapsed(0);
                }} className="min-h-11 rounded-xl border border-white/30 px-4 py-2 text-sm font-black disabled:opacity-50">처음으로</button>
            </div>
            <p className="mt-3 text-[11px] font-semibold leading-5 text-slate-300">
                로컬 재생 · 추가 Vercel 함수 호출 0 · 외부 업로드 없음 · 안전관리자 최종 교육내용 확인 필요
            </p>
        </section>
    );
};

export default EducationPreview30;
