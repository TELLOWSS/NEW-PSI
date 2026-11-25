import React, { useState } from 'react';
import { PSI_FORM_QUESTIONS, type PsiQuestionKey } from '../../config/psiFormMaster';

/**
 * Staging-only, read-only view of a manager-authorized revision-chain payload.
 * This component does NOT authenticate the viewer or fetch/save/review data.
 * Never mount it with untrusted query parameters or worker-supplied snapshots.
 */
type ReviewEvent = {
  action: 'reviewed' | 'request_changes' | 'approved';
  note: string;
  revision: number;
  recordedAt: string;
};
type ReviewSnapshot = {
  schema: string;
  tenantId: string;
  siteId: string;
  submissionId: string;
  workerId: string;
  sourceLanguage: string;
  gradeReason: string;
  receivedAt: string;
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
const validUtc = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
};
const asSeoulTime = (utc: string) => new Intl.DateTimeFormat('ko-KR', {
  timeZone:'Asia/Seoul', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
}).format(new Date(utc)) + ' KST';
const actionLabel = (action: ReviewEvent['action']): string =>
  action === 'approved' ? '평가자료 검토 승인 (작업허가 아님)'
    : action === 'request_changes' ? '추가 보완요청' : '보완본 1차 검토';

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
      old.events.length < 1 || old.events.length > 2 || next.events.length > 2 ||
      old.events.at(-1)?.action !== 'request_changes' ||
      !validUtc(old.receivedAt) || !validUtc(next.receivedAt) || !validUtc(chain.linkedAt)) return false;
  const firstReceipt = Date.parse(old.receivedAt);
  const requestAt = old.events.at(-1)?.recordedAt;
  if (!validUtc(requestAt) || !(firstReceipt < Date.parse(requestAt) &&
      Date.parse(requestAt) < Date.parse(next.receivedAt) &&
      Date.parse(next.receivedAt) <= Date.parse(chain.linkedAt))) return false;
  for (const [record, floor] of [
    [old, firstReceipt],
    [next, Date.parse(chain.linkedAt)],
  ] as const) {
    let previousEventAt = floor;
    for (const event of record.events) {
      if (!event || !validUtc(event.recordedAt) ||
          !['reviewed','request_changes','approved'].includes(event.action) ||
          typeof event.note !== 'string' || !Number.isInteger(event.revision) ||
          Date.parse(event.recordedAt) < previousEventAt) return false;
      previousEventAt = Date.parse(event.recordedAt);
    }
  }
  for (const record of [old,next]) {
    if (!record.answers || typeof record.answers !== 'object' ||
        typeof record.gradeReason !== 'string' ||
        !keys.every(key => typeof record.answers[key] === 'string')) return false;
  }
  return true;
};

export function PsiRevisionEvidencePanelL06({ chain }: {chain: unknown}) {
  const [changedOnly, setChangedOnly] = useState(false);
  if (!hasReadableL06RevisionChain(chain)) {
    return <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
      role="status" data-testid="psi-l06-revision-unavailable">
      보완 전·후 기록을 안전하게 대조할 수 없습니다. 연결 정보 및 관리자 조회 권한을 확인하세요.
    </section>;
  }
  const reason = chain.original.events.at(-1)?.note ?? '';
  const reviewed = chain.replacement.events.at(-1)?.action;
  // Approval here means "reviewed record", never verified risk control or permit.
  const phase = reviewed === 'approved' ? '평가자료 검토 승인 · 작업허가 아님'
    : reviewed === 'request_changes' ? '추가 보완요청 · 미완료'
    : reviewed === 'reviewed' ? '1차 검토 완료 · 최종 검토 대기'
    : '신규 보완본 접수 · 검토 대기';
  const pairs = PSI_FORM_QUESTIONS.map(question => {
    const previous = question.key === 'Q3'
      ? [chain.original.answers.Q3, chain.original.gradeReason].filter(Boolean).join(' · ')
      : chain.original.answers[question.key];
    const updated = question.key === 'Q3'
      ? [chain.replacement.answers.Q3, chain.replacement.gradeReason].filter(Boolean).join(' · ')
      : chain.replacement.answers[question.key];
    return {question, previous, updated, changed: previous !== updated};
  });
  const changedCount = pairs.filter(pair => pair.changed).length;
  const visiblePairs = changedOnly ? pairs.filter(pair => pair.changed) : pairs;
  const timeline = [
    {label:'최초 원문 접수',at:chain.original.receivedAt},
    {label:'관리자 보완요청',at:chain.original.events.at(-1)!.recordedAt},
    {label:'보완본 별도 접수',at:chain.replacement.receivedAt},
    {label:'원본·보완본 연결 기록',at:chain.linkedAt},
    ...chain.replacement.events.map(event => ({label:actionLabel(event.action),at:event.recordedAt})),
  ];
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
      <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:p-5"
        aria-label="서버 기록 기준 보완 진행 이력" data-testid="psi-l06-evidence-timeline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-extrabold">원문을 보존하는 보완 기록 흐름</h3>
          <span className="text-xs font-semibold text-slate-500">서버 기록시각 · 한국시간(KST)</span>
        </div>
        <ol className="mt-4 grid gap-3 md:grid-cols-2">
          {timeline.map((item,index) => (
            <li key={item.label + index} className="flex min-w-0 gap-3 rounded-xl bg-white p-3 shadow-sm">
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-extrabold text-teal-800">
                {index+1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{item.label}</p>
                <time dateTime={item.at} className="mt-1 block text-xs tabular-nums text-slate-600">{asSeoulTime(item.at)}</time>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          기록 시각은 업무 진행의 순서를 보여줄 뿐, 감소대책의 실제 이행이나 작업 재개 허가를 증명하지 않습니다.
        </p>
      </section>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3" aria-label="원문 비교 결과 요약">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs text-slate-600">전체 문항</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums">5</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-900">문구 변경</p>
          <p className="mt-1 text-lg font-extrabold tabular-nums" data-testid="psi-l06-changed-count">{changedCount}</p>
        </div>
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-3 md:col-span-1">
          <p className="text-xs text-slate-600">보완본 기록 상태</p>
          <p className="mt-1 text-sm font-bold" data-testid="psi-l06-review-phase">{phase}</p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-700">Q1~Q5 원문 비교</p>
        <button type="button" aria-pressed={changedOnly} onClick={() => setChangedOnly(v => !v)}
          className="min-h-11 rounded-xl border border-teal-700 bg-white px-4 py-2 text-sm font-bold text-teal-900 hover:bg-teal-50 focus-visible:outline-2 focus-visible:outline-offset-2"
          data-testid="psi-l06-changes-filter">
          {changedOnly ? '전체 5문항 보기' : `변경 문항만 보기 (${changedCount})`}
        </button>
      </div>
      <div className="mt-3 space-y-3" aria-live="polite">
        {visiblePairs.map(({question,previous,updated,changed}) => (
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
        ))}
        {visiblePairs.length === 0 && <p className="rounded-xl bg-slate-50 p-4 text-sm" role="status">
          변경된 문구가 없습니다. 동일한 원문도 보완사항을 충족했는지 관리자 확인이 필요합니다.
        </p>}
      </div>
      <footer className="mt-5 border-t border-slate-200 pt-4 text-sm text-slate-600">
        <strong>기록 검토와 현장 조치는 별개입니다.</strong> 원문 차이는 단순 문구 비교이며 개선대책의 적절성이나 이행 여부를 자동 판정하지 않습니다.
        실제 인증된 관리자 조회와 해당 현장의 독립 확인이 필요합니다.
      </footer>
    </section>
  );
}
