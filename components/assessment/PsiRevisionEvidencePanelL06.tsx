import React from 'react';
import { PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../../config/psiFormMaster';

/**
 * Staging-only, read-only view of a manager-authorized revision-chain payload.
 * This component does NOT authenticate the viewer or fetch/save/review data.
 * Never mount it with untrusted query parameters or worker-supplied snapshots.
 */
type ReviewEvent = { action: string; note: string; revision: number };
type ReviewSnapshot = {
  schema: string;
  tenantId: string;
  siteId: string;
  submissionId: string;
  workerId: string;
  sourceLanguage: string;
  gradeReason: string;
  answers: Record<PsiQuestionKey, string>;
  events: ReviewEvent[];
  workClearanceGranted: false;
};
export type PsiRevisionChainL06 = {
  schema: 'psi-worker-risk-revision-chain-v1';
  original: ReviewSnapshot;
  replacement: ReviewSnapshot;
  linkedAt: string;
  workClearanceGranted: false;
};
const keys: PsiQuestionKey[] = ['Q1','Q2','Q3','Q4','Q5'];

export const hasReadableL06RevisionChain = (candidate: unknown): candidate is PsiRevisionChainL06 => {
  if (!candidate || typeof candidate !== 'object') return false;
  const chain = candidate as Partial<PsiRevisionChainL06>;
  if (chain.schema !== 'psi-worker-risk-revision-chain-v1' ||
      chain.workClearanceGranted !== false ||
      !chain.original || !chain.replacement) return false;
  const old = chain.original;
  const next = chain.replacement;
  if (old.workClearanceGranted !== false || next.workClearanceGranted !== false ||
      old.schema !== 'psi-worker-risk-manager-review-v1' ||
      next.schema !== 'psi-worker-risk-manager-review-v1' ||
      !old.submissionId || !next.submissionId || old.submissionId === next.submissionId ||
      !old.workerId || old.workerId !== next.workerId ||
      !old.siteId || old.siteId !== next.siteId ||
      !old.tenantId || old.tenantId !== next.tenantId ||
      !old.sourceLanguage || !next.sourceLanguage ||
      !Array.isArray(old.events) || !Array.isArray(next.events) ||
      old.events.at(-1)?.action !== 'request_changes') return false;
  for (const record of [old,next]) {
    if (!record.answers || typeof record.answers !== 'object' ||
        typeof record.gradeReason !== 'string' ||
        !keys.every(key => typeof record.answers[key] === 'string')) return false;
  }
  return true;
};

export function PsiRevisionEvidencePanelL06({ chain }: {chain: unknown}) {
  if (!hasReadableL06RevisionChain(chain)) {
    return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
      role="status" data-testid="psi-l06-revision-unavailable">
      보완 전·후 기록을 안전하게 대조할 수 없습니다. 연결 정보 및 관리자 조회 권한을 확인하세요.
    </section>;
  }
  const reason = chain.original.events.at(-1)?.note ?? '';
  return (
    <section aria-label="Q1부터 Q5까지 보완 전후 기록 대조" data-testid="psi-l06-revision-evidence"
      className="rounded-3xl border border-slate-200 bg-white p-4 text-slate-900 shadow-sm md:p-6">
      <header className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-teal-700">PSI · L06 기록 대조</p>
        <h2 className="text-xl font-extrabold">보완요청 원문과 새 작성본 비교</h2>
        <p className="text-sm leading-6 text-slate-600">
          기존 작성내용과 보완 요청은 수정하지 않고 보존합니다. 새 작성본은 별도 접수기록이며,
          이 화면은 관리자 승인·위험 제거·교육 이수·작업허가 또는 작업 재개 승인이 아닙니다.
        </p>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm" role="note">
          <strong className="block">관리자 보완요청 사유</strong>
          <p className="mt-1 whitespace-pre-wrap break-words">{reason}</p>
        </div>
      </header>
      <div className="mt-5 space-y-3">
        {PSI_FORM_QUESTIONS.map(question => {
          const previous = question.key === 'Q3'
            ? [chain.original.answers.Q3, chain.original.gradeReason].filter(Boolean).join(' · ')
            : chain.original.answers[question.key];
          const updated = question.key === 'Q3'
            ? [chain.replacement.answers.Q3, chain.replacement.gradeReason].filter(Boolean).join(' · ')
            : chain.replacement.answers[question.key];
          const changed = previous !== updated;
          return (
            <article className="rounded-2xl border border-slate-200 p-4" key={question.key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold">{question.key} · {question.workerIntent}</h3>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${changed
                  ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                  {changed ? '문구 변경' : '원문 동일'}
                </span>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="min-w-0 rounded-xl bg-slate-50 p-3">
                  <p className="text-xs font-bold text-slate-500">보완 전 원문 · {chain.original.sourceLanguage}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{previous}</p>
                </div>
                <div className="min-w-0 rounded-xl bg-teal-50 p-3">
                  <p className="text-xs font-bold text-teal-700">새 작성본 원문 · {chain.replacement.sourceLanguage}</p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm">{updated}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <footer className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <strong>검토 대기:</strong> 원문 차이는 단순 문구 비교이며 개선대책의 적절성이나 이행 여부를 자동 판정하지 않습니다.
        실제 인증된 관리자 조회·독립 검토와 승인 절차가 필요합니다.
      </footer>
    </section>
  );
}
