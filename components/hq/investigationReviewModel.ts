/**
 * HQ-SAFE investigation review model (prototype).
 *
 * No AI conclusions, no server persistence, no legal findings.
 * "Evidence" here is only a claim plus a user-entered reference label:
 * no upload, source integrity check, authenticating reviewer or approval.
 */
export type ReviewKind = 'fact' | 'hypothesis' | 'unknown';
export type ReviewSource = '사고보고서' | '사진·영상' | '작업문서' | '진술' | '현장확인' | '기타';
export type ReviewStatus = 'draft' | 'requested' | 'needs_revision';
export type ReviewEntry = {
  id: string;
  incidentId: number;
  kind: ReviewKind;
  description: string;
  source: ReviewSource | null;
  sourceRef: string;
  registeredAt: string;
};
export type ReviewEvent = {
  eventId: string;
  incidentId: number;
  eventType: 'request' | 'revise';
  at: string;
  reason: string;
};
export type InvestigationDraft = {
  incidentId: number;
  entries: readonly ReviewEntry[];
  events: readonly ReviewEvent[];
  status: ReviewStatus;
};

export const REVIEW_KIND_LABELS: Record<ReviewKind, string> = {
  fact: '확인된 사실 주장 (원본 검토 전)',
  hypothesis: '원인 가설',
  unknown: '미확인·추가 조사'
};

export const createInvestigationDraft = (incidentId: number): InvestigationDraft => ({
  incidentId, entries: [], events: [], status: 'draft'
});

const trimField = (value: string, max: number) => value.trim().slice(0, max);

export const appendInvestigationEntry = (
  draft: InvestigationDraft,
  entry: ReviewEntry
): InvestigationDraft => {
  if (draft.incidentId !== entry.incidentId) throw new Error('다른 사고의 조사자료를 추가할 수 없습니다.');
  if (draft.status === 'requested') throw new Error('검토 요청 중에는 먼저 보완 상태로 되돌려야 합니다.');
  if (draft.entries.some((item) => item.id === entry.id)) throw new Error('중복 조사자료 식별자입니다.');
  const description = trimField(entry.description, 500);
  const sourceRef = trimField(entry.sourceRef, 180);
  if (description.length < 8) throw new Error('사실·가설·미확인 사항을 8자 이상 입력하세요.');
  if (entry.kind === 'fact' && (!entry.source || sourceRef.length < 4)) {
    throw new Error('사실로 분류할 때는 근거 종류와 원본 위치·자료번호를 입력해야 합니다.');
  }
  return {
    ...draft,
    entries: [...draft.entries, {...entry, description, sourceRef, source: entry.source || null}],
    status: 'draft'
  };
};

export const investigationReadiness = (draft: InvestigationDraft): {
  readyToRequest: boolean;
  messages: string[];
  counts: Record<ReviewKind, number>;
} => {
  const counts = {
    fact: draft.entries.filter((x) => x.kind === 'fact').length,
    hypothesis: draft.entries.filter((x) => x.kind === 'hypothesis').length,
    unknown: draft.entries.filter((x) => x.kind === 'unknown').length
  };
  const messages: string[] = [];
  if (counts.fact === 0) messages.push('근거 자료가 기재된 사실 항목을 최소 1개 추가해야 합니다.');
  if (counts.unknown === 0) messages.push('미확인 사항 또는 추가 조사 필요 여부를 항목으로 기록해야 합니다.');
  if (draft.entries.some((x) => x.kind === 'fact' && (!x.source || x.sourceRef.trim().length < 4))) {
    messages.push('사실 항목 중 근거 종류 또는 자료번호가 누락됐습니다.');
  }
  return {readyToRequest: messages.length === 0, messages, counts};
};

export const requestInvestigationReview = (
  draft: InvestigationDraft,
  eventId: string,
  at: string
): InvestigationDraft => {
  if (draft.status === 'requested') throw new Error('이미 검토를 요청한 사례입니다.');
  const check = investigationReadiness(draft);
  if (!check.readyToRequest) throw new Error(check.messages.join(' '));
  if (!eventId.trim() || !Number.isFinite(Date.parse(at))) throw new Error('변경 이력 정보가 유효하지 않습니다.');
  if (draft.events.some((x) => x.eventId === eventId)) throw new Error('중복 변경이력 식별자입니다.');
  return {
    ...draft,
    status: 'requested',
    events: [...draft.events, {eventId, incidentId: draft.incidentId, eventType: 'request', at, reason: '사내 검토 요청 표시 · 실제 결재/승인 아님'}]
  };
};

export const returnInvestigationForRevision = (
  draft: InvestigationDraft,
  eventId: string,
  at: string,
  reason: string
): InvestigationDraft => {
  if (draft.status !== 'requested') throw new Error('검토 요청 중인 사례만 보완 대상으로 되돌릴 수 있습니다.');
  if (!eventId.trim() || !Number.isFinite(Date.parse(at)) || draft.events.some((x) => x.eventId === eventId)) {
    throw new Error('변경 이력 정보가 유효하지 않습니다.');
  }
  const explanation = trimField(reason, 200);
  if (explanation.length < 4) throw new Error('보완 사유를 4자 이상 입력하세요.');
  return {
    ...draft,
    status: 'needs_revision',
    events: [...draft.events, {eventId, incidentId: draft.incidentId, eventType: 'revise', at, reason: explanation}]
  };
};
