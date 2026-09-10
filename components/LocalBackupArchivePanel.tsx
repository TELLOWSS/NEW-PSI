import React, { useEffect, useRef, useState } from 'react';
import { createLocalArchive, openLocalArchive, readArchivedRecord, type ArchiveDirectory, type ArchiveEntry, type LocalArchiveIndex } from '../utils/localBackupArchive';
import type { WorkerRecord } from '../types';

type PickerWindow = Window & { showDirectoryPicker?: (options: { mode: 'read' | 'readwrite' }) => Promise<ArchiveDirectory> };
export default function LocalBackupArchivePanel({ onResume, workingRecords = [] }: {
    onResume?: (record: Record<string, unknown>) => Promise<{ message: string; id?: string }>;
    workingRecords?: WorkerRecord[];
}) {
    const [source, setSource] = useState<File>();
    const [index, setIndex] = useState<LocalArchiveIndex>();
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState('원본 JSON은 그대로 보존됩니다. 운영 기록에는 합산하지 않습니다.');
    const [record, setRecord] = useState<Record<string, unknown>>();
    const [showImage, setShowImage] = useState(false);
    const [resumedId, setResumedId] = useState<string>();
    const folder = useRef<ArchiveDirectory>();
    const controller = useRef<AbortController>();
    const alive = useRef(true);
    const working = useRef(false);
    useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); }; }, []);
    const execute = async (action: () => Promise<void>, keepRecord = false) => {
        if (working.current) return;
        working.current = true; setBusy(true);
        if (!keepRecord) { setRecord(undefined); setShowImage(false); setResumedId(undefined); }
        try { await action(); }
        catch (error) { if (alive.current) setStatus(error instanceof DOMException && error.name === 'AbortError'
            ? '취소했습니다. 원본은 유지됩니다. index.json이 없는 생성 폴더는 미완료입니다.'
            : `처리 중단: ${error instanceof Error ? error.message : '저장 권한과 공간을 확인해 주세요.'}`); }
        finally { working.current = false; if (alive.current) setBusy(false); }
    };
    const pick = async (mode: 'read' | 'readwrite') => {
        const picker = (window as PickerWindow).showDirectoryPicker;
        if (!picker) throw new Error('PC 보관함은 폴더 접근을 지원하는 데스크톱 Chrome/Edge에서 사용해 주세요.');
        return picker.call(window, { mode });
    };
    const create = () => execute(async () => {
        if (!source) return;
        const parent = await pick('readwrite');
        const name = `PSI-보관-${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}`;
        const target = await parent.getDirectoryHandle(name, { create: true });
        controller.current = new AbortController();
        setStatus('기록별로 읽고 PC에 저장합니다. 원본 이미지는 제외하지 않습니다.');
        const result = await createLocalArchive(source, target, controller.current.signal, count => {
            if (alive.current) setStatus(`${count}건 저장·대조 중 · 완료 판정 전에는 원본을 삭제하지 마세요.`);
        });
        if (!alive.current) return;
        folder.current = target; setIndex(result); setPage(0); setQuery('');
        setStatus(`${result.records}건 보관 완료 · ${name} 폴더 전체를 함께 보관하세요. 원문 검증은 OCR 정확도 인증이 아닙니다.`);
    });
    const open = () => execute(async () => {
        const target = await pick('read');
        const result = await openLocalArchive(target);
        if (!alive.current) return;
        folder.current = target; setIndex(result); setPage(0); setQuery('');
        setStatus(`${result.records}건 목록을 연결했습니다. 각 기록은 열 때 해시를 확인합니다.`);
    });
    const inspect = (entry: ArchiveEntry) => execute(async () => {
        if (!folder.current) return;
        const result = await readArchivedRecord(folder.current, entry);
        if (alive.current) { setRecord(result); setStatus('선택한 1건의 해시 대조 완료 · 원점수·원등급·날짜를 변경하지 않은 보관 원문입니다.'); }
    });
    const matches = index?.entries.filter(entry => `${entry.name} ${entry.date}`.includes(query)) ?? [];
    const workingRecord = record ? workingRecords.find(item => item.id === (resumedId || record.id)) : undefined;
    const resume = () => execute(async () => {
        if (!record || !onResume) return;
        const result = await onResume(record);
        if (alive.current) { setStatus(result.message); setResumedId(result.id); }
    }, true);
    const saveWork = () => execute(async () => {
        if (!workingRecord) return;
        const savedAt = new Date().toISOString();
        const blob = new Blob([JSON.stringify({ schemaVersion: 'psi-backup/v2', product: 'NEW-PSI', scope: 'work-resume-copy', exportedAt: savedAt, records: [workingRecord] })], { type: 'application/json' });
        if (blob.size >= 32 * 1024 * 1024) throw new Error('작업본이 32MiB 이상입니다. 대용량 보관 경로를 사용해 주세요.');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        link.download = `PSI_작업본_${savedAt.replace(/[:.]/g, '-')}.json`; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        setStatus('선택한 기록의 현재 저장본 다운로드를 요청했습니다. 저장된 파일을 확인하세요. 원래 보관함은 변경하지 않았습니다. 편집창의 미저장 내용은 포함되지 않습니다.');
    }, true);
    const rawImage = record?.originalImage ?? record?.imageBase64;
    const image = typeof rawImage === 'string' && /^data:image\/(png|jpeg);base64,/i.test(rawImage) ? rawImage : undefined;
    return <details className="rounded-2xl border border-sky-300/40 bg-slate-950 p-4 text-slate-100">
        <summary className="cursor-pointer text-sm font-bold">PC 저메모리 보관함 · 원본 보존</summary>
        <div className="mt-3 space-y-3 text-sm leading-relaxed">
            <p>목록만 읽고 원문은 1건씩 엽니다. 작업 이어하기를 선택한 기록만 운영 목록으로 가져옵니다. 보관함 조회·작업 재개는 유료 OCR을 실행하지 않습니다.</p>
            <p className="text-amber-200">폴더 안의 파일을 따로 옮기지 마세요. 암호화 기능은 없으므로 접근이 제한된 PC 폴더에 보관하세요. 기존 운영 목록의 메모리 사용량은 이 기능으로 줄어들지 않습니다.</p>
            <label className="block">보관할 월별 JSON<input type="file" accept=".json" disabled={busy} onChange={event => setSource(event.target.files?.[0])} className="mt-1 block w-full text-xs" /></label>
            <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !source} onClick={() => void create()} className="rounded-lg bg-sky-700 px-3 py-2 font-bold disabled:opacity-50">새 PC 보관함 만들기</button>
                <button type="button" disabled={busy} onClick={() => void open()} className="rounded-lg bg-slate-700 px-3 py-2 font-bold disabled:opacity-50">보관 폴더 열기</button>
                {busy && <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg bg-rose-800 px-3 py-2">보관 생성 취소</button>}
            </div>
            <p role="status" aria-live="polite">{status}</p>
            {index && <>
                <label className="block">이름·날짜 검색<input value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-900 p-2" /></label>
                <p>{matches.length}건 · 한 화면 20건 · 이 목록은 운영 통계와 별도입니다.</p>
                <ul className="space-y-2">{matches.slice(page * 20, page * 20 + 20).map(entry => <li key={entry.file}>
                    <button type="button" disabled={busy} onClick={() => void inspect(entry)} className="w-full rounded-lg border border-slate-600 p-2 text-left disabled:opacity-50">{entry.name || '이름 미기재'} · {entry.date || '날짜 미기재'} · 원문 열기</button>
                </li>)}</ul>
                <div className="flex gap-3"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>이전</button><span>{page + 1} / {Math.max(1, Math.ceil(matches.length / 20))}</span><button type="button" disabled={(page + 1) * 20 >= matches.length} onClick={() => setPage(value => value + 1)}>다음</button></div>
            </>}
            {record && <section aria-label="선택한 보관 원문" className="space-y-2 rounded-lg border border-slate-600 p-3">
                {onResume && <button type="button" disabled={busy} onClick={() => void resume()} className="rounded-lg bg-sky-700 px-3 py-2 font-bold disabled:opacity-50">이 기록 작업 이어하기</button>}
                <button type="button" disabled={busy || !workingRecord} onClick={() => void saveWork()} className="rounded-lg bg-emerald-800 px-3 py-2 font-bold disabled:opacity-50">수정본 새 백업 저장 (1건)</button>
                <p>같은 ID의 작업본이 있으면 현재 작업본을 엽니다. 수정 후 편집창에서 저장하고 새 백업을 만드세요. 원래 보관함은 수정되지 않습니다.</p>
                <button type="button" onClick={() => { setRecord(undefined); setShowImage(false); }} className="rounded-lg bg-slate-700 px-3 py-2">원문 닫기 · 메모리 해제</button>
                <p>원점수: {String(record.safetyScore ?? '없음')} · 원등급: {String(record.safetyLevel ?? '없음')}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{typeof record.fullText === 'string' ? record.fullText : '원문 텍스트 없음'}</pre>
                {image ? <><button type="button" onClick={() => setShowImage(value => !value)}>{showImage ? '이미지 닫기' : '원본 이미지 1장 보기'}</button>{showImage && <img src={image} alt="선택한 보관 기록의 원본 문서" className="max-h-96 w-full object-contain" />}</> : <p>이미지는 원본 JSON에 그대로 보관됩니다. 이 형식의 미리보기는 지원하지 않습니다.</p>}
            </section>}
        </div>
    </details>;
}
