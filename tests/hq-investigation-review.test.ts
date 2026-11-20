import { describe, expect, it } from 'vitest';
import {
  appendInvestigationEntry,
  createInvestigationDraft,
  investigationReadiness,
  requestInvestigationReview,
  returnInvestigationForRevision,
  type ReviewEntry
} from '../components/hq/investigationReviewModel';

const sample = (incidentId: number, kind: ReviewEntry['kind'], id: string, sourceRef=''): ReviewEntry => ({
  id, incidentId, kind, description: '시연용 조사 항목 내용입니다.',
  source: kind === 'fact' ? '작업문서' : null, sourceRef, registeredAt: '2026-11-20T00:00:00.000Z'
});

describe('HQ safety investigation evidence and human review guard', () => {
  it('isolates draft records by incident and rejects duplicate item IDs', () => {
    const draft = createInvestigationDraft(10);
    expect(() => appendInvestigationEntry(draft, sample(11,'hypothesis','A'))).toThrow('다른 사고');
    const once = appendInvestigationEntry(draft, sample(10,'hypothesis','A'));
    expect(() => appendInvestigationEntry(once, sample(10,'unknown','A'))).toThrow('중복');
    expect(draft.entries).toEqual([]);
  });

  it('does not allow claims labeled fact without a traceable source reference', () => {
    const draft = createInvestigationDraft(12);
    expect(() => appendInvestigationEntry(draft, sample(12,'fact','F1'))).toThrow('근거');
    expect(() => appendInvestigationEntry(draft, {...sample(12,'fact','F1','D1'), source:null})).toThrow('근거');
    const sourced = appendInvestigationEntry(draft, sample(12,'fact','F1','DOC-001'));
    expect(sourced.entries[0].sourceRef).toBe('DOC-001');
    expect(investigationReadiness(sourced).readyToRequest).toBe(false);
    expect(investigationReadiness(sourced).messages.join(' ')).toContain('미확인');
  });

  it('requires an explicit unknown/gap entry before marking a request', () => {
    let draft = createInvestigationDraft(42);
    expect(() => requestInvestigationReview(draft, 'R1','2026-11-20T01:00:00.000Z')).toThrow('사실');
    draft = appendInvestigationEntry(draft, sample(42,'fact','F1','DOC-001'));
    expect(() => requestInvestigationReview(draft,'R1','2026-11-20T01:00:00.000Z')).toThrow('미확인');
    draft = appendInvestigationEntry(draft, sample(42,'unknown','U1'));
    const checked = investigationReadiness(draft);
    expect(checked.readyToRequest).toBe(true);
    expect(checked.counts).toEqual({fact:1,hypothesis:0,unknown:1});
    draft = requestInvestigationReview(draft,'R1','2026-11-20T01:00:00.000Z');
    expect(draft.status).toBe('requested');
    expect(draft.events).toHaveLength(1);
    expect(draft.events[0].reason).toContain('실제 결재/승인 아님');
    expect(() => appendInvestigationEntry(draft,sample(42,'hypothesis','H1'))).toThrow('검토 요청 중');
  });

  it('requires a meaningful reason to reopen a requested draft and preserves history', () => {
    let draft=createInvestigationDraft(17);
    draft=appendInvestigationEntry(draft,sample(17,'fact','F1','DOC-003'));
    draft=appendInvestigationEntry(draft,sample(17,'unknown','U1'));
    draft=requestInvestigationReview(draft,'EVT1','2026-11-20T01:00:00.000Z');
    expect(() => returnInvestigationForRevision(draft,'EVT2','2026-11-20T01:30:00.000Z','x')).toThrow('보완 사유');
    draft=returnInvestigationForRevision(draft,'EVT2','2026-11-20T01:30:00.000Z','진술 대조 필요');
    expect(draft.status).toBe('needs_revision');
    expect(draft.events.map((event)=>event.eventType)).toEqual(['request','revise']);
    const updated=appendInvestigationEntry(draft,sample(17,'hypothesis','H1'));
    expect(updated.events).toEqual(draft.events);
    expect(updated.status).toBe('draft');
  });
});
