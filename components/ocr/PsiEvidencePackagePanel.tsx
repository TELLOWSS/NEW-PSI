import React, { useState } from 'react';
import type { WorkerRecord } from '../../types';
import { downloadPsiEvidenceArchive, verifyPsiEvidenceArchive } from '../../utils/psiEvidenceArchive';

export const PsiEvidencePackagePanel: React.FC<{ record: WorkerRecord; hasPendingEdits?: boolean }> = ({ record, hasPendingEdits = false }) => {
    const [cutoff, setCutoff] = useState('');
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState('');
    const [verification, setVerification] = useState<'ok' | 'error' | null>(null);

    const exportPackage = async () => {
        if (hasPendingEdits || busy) return;
        setBusy(true); setNotice(''); setVerification(null);
        try {
            const cutoffIso = cutoff
                ? new Date(cutoff + (cutoff.length === 16 ? ':00' : '') + '+09:00').toISOString()
                : null;
            const result = await downloadPsiEvidenceArchive(record, { cutoffIso });
            setNotice(result.name + ' 저장 요청 완료. 실제 다운로드 여부는 브라우저에서 확인해 주세요.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '증빙 패키지 생성 실패');
        } finally { setBusy(false); }
    };
    const verifyFile = async (file: File | null) => {
        if (!file || busy) return;
        setBusy(true); setNotice(''); setVerification(null);
        try {
            const result = await verifyPsiEvidenceArchive(file);
            setVerification(result.verified ? 'ok' : 'error');
            setNotice(result.description + (result.errors.length ? '\n' + result.errors.slice(0, 8).join('\n') : ''));
        } catch (error) {
            setVerification('error');
            setNotice(error instanceof Error ? error.message : '패키지 검증 실패');
        } finally { setBusy(false); }
    };

    return <section data-psi-evidence-package-panel="true" className="rounded-3xl border border-slate-300 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">PSI EVIDENCE TRACEABILITY</p>
        <h3 className="mt-1 text-lg font-black text-slate-900">관리자 증빙·변경이력 패키지</h3>
        <p className="mt-2 text-xs leading-5 text-slate-600">자필 원본·한국어 번역·교육·현장 조치·재점검·수정 이력을 내부 보관용 ZIP에 연결합니다.</p>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            기존 기록의 이벤트 시간을 기준으로 조회하며, 원본 이미지와 번역이 과거 그 시각에 존재했음은 별도로 확인해야 합니다.
            SHA-256 파일 검증은 공인 타임스탬프나 법적 원본 증명에 해당하지 않습니다.
            개인정보가 포함될 수 있으므로 접근 권한을 제한하세요.
        </p>
        <label className="mt-3 block text-xs font-bold text-slate-800">이력 조회 종료시각 (선택, 한국시간)
            <input type="datetime-local" aria-label="이력 조회 종료시각 한국시간" value={cutoff}
                onChange={event => setCutoff(event.target.value)} disabled={busy}
                className="mt-1 block w-full max-w-sm rounded-xl border border-slate-300 bg-white p-3 text-sm" />
        </label>
        <p className="mt-1 text-[11px] text-slate-500">미입력 시 모든 이벤트를 수록합니다. 입력 시 이후 이벤트는 제외하고 개수만 표시합니다.</p>
        {hasPendingEdits && <p className="mt-3 text-xs font-bold text-amber-800">미저장 수정이 있습니다. 먼저 기록을 저장하세요.</p>}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={busy || hasPendingEdits} onClick={() => void exportPackage()}
                className="min-h-11 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white disabled:opacity-40">
                {busy ? '처리 중...' : '관리자 증빙 ZIP 저장'}
            </button>
            <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800">
                기존 ZIP 해시 검증
                <input aria-label="기존 증빙 ZIP 무결성 검증" type="file" accept=".zip" disabled={busy} className="sr-only"
                    onChange={event => {
                        const input = event.currentTarget;
                        const file = input.files?.[0] || null;
                        void verifyFile(file);
                        input.value = '';
                    }} />
            </label>
        </div>
        {notice && <p role="status" aria-live="polite"
            className={'mt-3 whitespace-pre-wrap rounded-xl p-3 text-xs leading-5 ' +
                (verification === 'error' ? 'bg-rose-50 text-rose-900' : verification === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-slate-50 text-slate-700')}>
            {notice}
        </p>}
        <p className="mt-3 text-[11px] text-slate-500">내보내기 파일: 현재 기록 JSON, 시간순 이력, 저장된 원본·증빙 이미지, SHA-256 해시 목록과 매니페스트. 과거 변경본과 공인 시각을 재구성하지는 않습니다.</p>
    </section>;
};
