import React, { useState } from 'react';
import type { WorkerRecord } from '../../types';
import { ensureFileSaver } from '../../utils/externalScripts';
import { verifyPsiEvidenceArchive, type EvidencePackageVerification } from '../../utils/psiEvidenceArchive';
import { buildPsiHandoffReviewDraft } from '../../utils/psiHandoffReview';
import { downloadPsiMinimizedReviewArchive } from '../../utils/psiMinimizedReviewArchive';
import { downloadPsiTextRedactedReviewArchive } from '../../utils/psiTextRedactedArchive';
import { PsiPhotoPrivacyReviewPanel } from './PsiPhotoPrivacyReviewPanel';

export const PsiEvidenceHandoffReviewPanel: React.FC<{ record: WorkerRecord; hasPendingEdits?: boolean }> = ({
    record, hasPendingEdits = false,
}) => {
    const [busy, setBusy] = useState(false);
    const [originalName, setOriginalName] = useState('');
    const [sourceZip, setSourceZip] = useState<File | null>(null);
    const [reviewedContents, setReviewedContents] = useState(false);
    const [subsetHash, setSubsetHash] = useState('');
    const [redactedHash, setRedactedHash] = useState('');
    const [sensitiveTerms, setSensitiveTerms] = useState('');
    const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false);
    const [expectedHash, setExpectedHash] = useState('');
    const [verification, setVerification] = useState<EvidencePackageVerification | null>(null);
    const [selected, setSelected] = useState<string[]>([]);
    const [purpose, setPurpose] = useState('');
    const [recipient, setRecipient] = useState('');
    const [requestReference, setRequestReference] = useState('');
    const [reviewer, setReviewer] = useState('');
    const [storageReference, setStorageReference] = useState('');
    const [notes, setNotes] = useState('');
    const [notice, setNotice] = useState('');

    const textPaths = selected.filter(path => path === 'record/snapshot.json' || path === 'record/timeline.txt');
    const verified = Boolean(verification?.verified && verification.externallyAnchored
        && verification.recordId === record.id && verification.fileInventory.length);
    const inspectFile = async (file: File | null) => {
        if (!file || busy) return;
        setBusy(true);
        setVerification(null);
        setSelected([]);
        setOriginalName('');
        setSourceZip(null);
        setReviewedContents(false);
        setSubsetHash('');
        setRedactedHash('');
        setPrivacyAcknowledged(false);
        setNotice('');
        try {
            const result = await verifyPsiEvidenceArchive(file, expectedHash);
            if (!result.verified || !result.externallyAnchored) {
                setNotice(result.description + (result.errors.length ? '\n' + result.errors.join('\n') : '\n독립 보관 SHA-256 입력 후 다시 확인하세요.'));
                return;
            }
            if (result.recordId !== record.id) {
                setNotice('이 ZIP은 현재 열어 둔 근로자 기록의 증빙이 아닙니다.');
                return;
            }
            setVerification(result);
            setSourceZip(file);
            setOriginalName(file.name);
            setNotice('ZIP 내부 파일과 별도 보관 SHA-256 대조 성공. 이 결과는 제출 승인이 아닙니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : 'ZIP 검증에 실패했습니다.');
        } finally { setBusy(false); }
    };

    const prepareSubset = async () => {
        if (!verified || !sourceZip || !verification || !selected.length ||
            !reviewedContents || hasPendingEdits || busy) return;
        setBusy(true);
        setNotice('');
        setSubsetHash('');
        try {
            const result = await downloadPsiMinimizedReviewArchive(
                sourceZip, verification, selected, record.id);
            setSubsetHash(result.zipSha256);
            setNotice('선택한 ' + result.selectedCount
                + '개 원본 파일만 복제한 내부 검토용 ZIP 저장 요청을 보냈습니다. '
                + '이 파일은 비식별화·결재·외부 제출 완료가 아닙니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '선택본을 생성하지 못했습니다.');
        } finally { setBusy(false); }
    };
    const preparePrivacyTextCopy = async () => {
        if (!verified || !sourceZip || !verification || !textPaths.length ||
            !privacyAcknowledged || hasPendingEdits || busy) return;
        setBusy(true);setNotice('');setRedactedHash('');
        try {
            const terms = [record.name, ...sensitiveTerms.split(/\r?\n/)]
                .map(value => String(value || '').trim()).filter(value => value.length >= 2);
            const outcome = await downloadPsiTextRedactedReviewArchive(
                sourceZip, verification, textPaths, record.id, terms);
            setRedactedHash(outcome.zipSha256);
            setNotice('텍스트 '+outcome.count+'개를 가림 처리한 내부 검토 ZIP 저장을 요청했습니다. '
                +'사진·PDF는 포함하지 않습니다. 출력물에 남아 있는 개인정보와 사건 맥락을 직접 확인하고 '
                +'별도의 승인 전에는 외부에 제출하지 마세요.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '텍스트 가림 처리본을 생성하지 못했습니다.');
        } finally {setBusy(false);}
    };
    const prepareReview = async () => {
        if (!verified || busy || hasPendingEdits || !verification) return;
        setBusy(true);
        setNotice('');
        try {
            const draft = buildPsiHandoffReviewDraft(verification, {
                workerRecordId: record.id,
                packageName: originalName,
                purpose,
                recipientOrganization: recipient,
                requestReference,
                reviewerName: reviewer,
                separatelyStoredHashReference: storageReference,
                proposedFiles: selected,
                notes,
                generatedAt: new Date().toISOString(),
            });
            const saveAs = await ensureFileSaver();
            if (!saveAs) throw new Error('파일 저장 기능을 불러올 수 없습니다.');
            const filename = 'PSI_handoff_review_' +
                String(record.id || 'record').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32) + '.json';
            saveAs(new Blob([JSON.stringify(draft, null, 2) + '\n'], {
                type: 'application/json;charset=utf-8',
            }), filename);
            setNotice('제출 검토 초안 다운로드를 요청했습니다. 이 단계에서는 승인·전송·서버 등록이 이루어지지 않습니다.');
        } catch (error) {
            setNotice(error instanceof Error ? error.message : '검토서 작성에 실패했습니다.');
        } finally { setBusy(false); }
    };
    return <section data-psi-handoff-review="true" className="rounded-3xl border border-indigo-200 bg-white p-4 shadow-sm sm:p-6">
        <p className="text-[11px] font-black uppercase tracking-widest text-indigo-600">PSI · DISCLOSURE REVIEW DRAFT</p>
        <h3 className="mt-1 text-lg font-black text-slate-900">증빙 제출 전 검토서 작성</h3>
        <p className="mt-2 text-xs leading-5 text-slate-600">
            외부 기관·사고조사 제출 전 <strong>어떤 파일을 어떤 목적으로 제출할지</strong> 검토하는 초안입니다.
            승인을 받은 자료만 실제 제공하도록 별도 관리자 결재가 필요합니다.
        </p>
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
            이 기능은 검토서 JSON만 로컬에 저장합니다. 서버 승인·반출대장·실제 발송 기록이 아닙니다.
            원본 ZIP은 그대로이며, 아래 파일 선택이 ZIP에서 개인정보를 제거하지 않습니다. 해시 보관대장 자체의 최초 생성 시각과 진정성도 검증하지 않습니다.
        </p>
        {hasPendingEdits && <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-800">현재 미저장 수정이 있습니다. 먼저 원본·번역 변경을 저장하고 ZIP을 새로 생성·검증하세요.</p>}
        <label className="mt-4 block text-xs font-bold text-slate-800">
            외부에 별도로 보관한 원본 ZIP SHA-256
            <input type="text" value={expectedHash} maxLength={64} spellCheck={false} autoComplete="off"
                onChange={value => {
                    setExpectedHash(value.target.value);
                    setVerification(null); setSelected([]);
                    setSourceZip(null); setReviewedContents(false); setSubsetHash('');
                    setPrivacyAcknowledged(false);setRedactedHash('');
                }}
                placeholder="64자리 SHA-256" className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-mono text-xs" />
        </label>
        <label className="mt-3 flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-indigo-300 bg-indigo-50 p-3 text-xs font-black text-indigo-900">
            증빙 ZIP 선택 후 해시·파일 검증
            <input type="file" accept=".zip" className="sr-only" disabled={busy || hasPendingEdits}
                aria-label="제출 검토 대상 ZIP 선택"
                onChange={event => {
                    const element = event.currentTarget;
                    void inspectFile(element.files?.[0] || null);
                    element.value = '';
                }} />
        </label>
        {verified && verification && <>
            <p className="mt-3 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-900">
                비교한 ZIP: {originalName} · 검사 파일 {verification.fileInventory.length}개.
                원본 ZIP에는 이 파일들이 전부 들어 있으므로 별도 제출본 생성·개인정보 검토가 필요합니다.
            </p>
            <fieldset className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3">
                <legend className="px-1 text-xs font-black text-slate-900">제출 후보 파일 선택 — 실제 ZIP 내용을 수정하지 않음</legend>
                {verification.fileInventory.map(file => <label key={file.path} className="flex items-start gap-2 text-xs text-slate-700">
                    <input type="checkbox" className="mt-0.5" checked={selected.includes(file.path)}
                        onChange={event => {
                            setReviewedContents(false);
                            setSubsetHash('');
                            setRedactedHash('');
                            setPrivacyAcknowledged(false);
                            setSelected(current => event.target.checked ?
                                [...current, file.path] : current.filter(path => path !== file.path));
                        }} />
                    <span className="break-all">{file.path} ({file.bytes.toLocaleString()} bytes)</span>
                </label>)}
            </fieldset>
        </>}
        {verified && verification && <div data-psi-minimized-review="true"
            className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <h4 className="text-sm font-black text-slate-900">선택한 원본만 복제한 내부 검토용 ZIP</h4>
            <p className="mt-2 text-xs leading-5 text-slate-700">
                선택하지 않은 원본 파일은 새 ZIP에서 제외합니다. 선택한 파일의
                <strong> 내용은 수정·마스킹·익명화하지 않습니다.</strong>
                자필 양식·사진·JSON·타임라인에 개인정보가 남아 있을 수 있습니다.
                승인 전 외부 제공하지 마세요.
            </p>
            <label className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-900">
                <input type="checkbox" className="mt-1" checked={reviewedContents}
                    onChange={event => setReviewedContents(event.target.checked)} />
                <span>선택한 파일에 개인정보가 포함될 수 있고, 새 ZIP은 내부 검토용이며
                실제 비식별화·반출 승인·발송이 아니라는 점을 확인했습니다.</span>
            </label>
            <button type="button" onClick={() => void prepareSubset()}
                disabled={busy || hasPendingEdits || !selected.length || !reviewedContents || !sourceZip}
                className="mt-3 min-h-11 w-full rounded-xl bg-indigo-950 p-3 text-sm font-black text-white disabled:opacity-40">
                {busy ? '생성 중...' : '선택 파일만 담은 내부 검토용 ZIP 생성'}
            </button>
            {subsetHash && <div className="mt-2 rounded-lg bg-white p-3">
                <p className="text-xs font-bold text-slate-900">새 검토용 ZIP 전체 SHA-256 (별도 기록)</p>
                <p className="mt-1 break-all font-mono text-[11px] text-slate-800">{subsetHash}</p>
            </div>}
        </div>}
        {verified && verification && <div data-psi-text-privacy-review="true"
            className="mt-3 rounded-xl border border-slate-300 bg-slate-50 p-3">
            <h4 className="text-sm font-black text-slate-900">텍스트 개인정보 가림 검토본 (15차)</h4>
            <p className="mt-2 text-xs leading-5 text-slate-700">
                위에서 선택한 <strong>JSON·TXT만</strong> 가려서 별도 ZIP에 넣습니다.
                휴대전화·이메일·주민등록번호 형식, 일부 인적사항 필드 및 직접 지정한 이름을 가립니다.
                <strong> 사진·PDF는 절대 포함하지 않습니다.</strong> 자동 가림으로 모든 개인정보가
                제거되거나 제출이 승인된 것은 아닙니다.
            </p>
            <label className="mt-3 block text-xs font-bold text-slate-800">
                추가로 가릴 인명·식별 문구 (줄마다 1개, 2자 이상)
                <textarea value={sensitiveTerms} rows={3} maxLength={1500}
                    onChange={event => {
                        setSensitiveTerms(event.target.value);
                        setPrivacyAcknowledged(false);setRedactedHash('');
                    }}
                    placeholder="예: 동행한 관리자 이름, 목격자 이름, 현장 내 개인별 식별번호"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-2 text-xs font-normal" />
            </label>
            <p className="mt-1 text-[11px] text-slate-600">
                현재 기록의 근로자 이름도 자동 가림 목록에 넣습니다.
                별칭·외국어 표기·특이한 서술은 직접 검토해 추가해야 합니다.
                선택된 텍스트 {textPaths.length}개 · 사진은 가림 대상에서 제외
            </p>
            <label className="mt-3 flex items-start gap-2 text-xs font-medium text-slate-800">
                <input type="checkbox" className="mt-1" checked={privacyAcknowledged}
                    onChange={event => setPrivacyAcknowledged(event.target.checked)} />
                <span>자동 가림은 완전한 비식별화가 아니며, 문서 전체를 다시 읽고
                별도 승인 전 외부에 보내지 않아야 한다는 점을 확인했습니다.</span>
            </label>
            <button type="button" disabled={busy || hasPendingEdits || !sourceZip ||
                    !textPaths.length || !privacyAcknowledged}
                onClick={() => void preparePrivacyTextCopy()}
                className="mt-3 min-h-11 w-full rounded-xl bg-slate-800 p-3 text-sm font-black text-white disabled:opacity-40">
                {busy ? '검토본 생성 중...' : '개인정보 가림 텍스트 내부 검토용 ZIP 생성'}
            </button>
            {redactedHash && <p className="mt-2 break-all rounded-lg bg-white p-3 font-mono text-[11px]">
                새 가림 검토용 ZIP SHA-256: {redactedHash}
            </p>}
        </div>}
        {verified && verification && sourceZip && <PsiPhotoPrivacyReviewPanel
            key={record.id + ':' + verification.zipSha256}
            sourceZip={sourceZip}
            verification={verification}
            recordId={record.id}
            hasPendingEdits={hasPendingEdits || busy}
        />}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {([
                ['제출 목적·요청 내용', purpose, setPurpose, '예: ○○ 사고 조사에 따른 사실관계 확인'],
                ['제출 예정 기관', recipient, setRecipient, '예: 요청 공문에 기재된 기관'],
                ['요청 공문·접수번호', requestReference, setRequestReference, '요청 일자·공문번호 등'],
                ['검토 담당자(직접 입력)', reviewer, setReviewer, '검토자 이름'],
                ['별도 SHA-256 보관대장 참조', storageReference, setStorageReference, '관리대장 번호·보관 위치 등'],
            ] as const).map(([label,value,change,placeholder]) =>
                <label key={label} className="block text-xs font-bold text-slate-800">{label}
                    <input type="text" value={value} onChange={event => change(event.target.value)}
                        placeholder={placeholder} maxLength={300} disabled={busy}
                        className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-normal" />
                </label>)}
        </div>
        <label className="mt-3 block text-xs font-bold text-slate-800">개인정보 최소화·별도 승인 확인 필요사항
            <textarea value={notes} onChange={event => setNotes(event.target.value)} rows={2} maxLength={1200}
                placeholder="제출 전에 가려야 할 정보, 추가 검토·현장 증빙 필요사항 등"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-xs font-normal" />
        </label>
        <button type="button" disabled={!verified || !selected.length || busy || hasPendingEdits}
            onClick={() => void prepareReview()}
            className="mt-3 min-h-11 w-full rounded-xl bg-indigo-700 p-3 text-sm font-black text-white disabled:opacity-40">
            {busy ? '검토 중...' : '제출 검토 초안 JSON 저장 (승인·전송 아님)'}
        </button>
        {notice && <p role="status" aria-live="polite" className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-800">{notice}</p>}
    </section>;
};
