import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkerPracticeVerificationEvent, WorkerRiskFollowupEvent, WorkerRecord } from '../types';
import { resolvePracticeFollowupLink } from '../utils/practiceFollowupLink';
import { validatePracticeVerificationEvent } from '../utils/practiceVerification';
import { WorkerPracticeVerificationAppendix } from '../components/report/WorkerPracticeVerificationAppendix';
import { WorkerPracticeVerificationPanel } from '../components/ocr/WorkerPracticeVerificationPanel';

const followup = (caseId = 'case-A'): WorkerRiskFollowupEvent => ({
    id: 'action-1', caseId, questionNumber: 5, status: 'open', timestamp: '2026-09-01T01:00:00Z',
    actor: '가상 관리자', owner: '가상 담당자', actionDetail: '가상 추락방지 조치 확인',
});
const practice = (extra: Partial<WorkerPracticeVerificationEvent> = {}): WorkerPracticeVerificationEvent => ({
    id: 'practice-1', questionNumber: 5, stage: 'field_check', result: 'unable_to_verify',
    timestamp: '2026-09-02T01:00:00Z', actor: '가상 관리자', evidenceNote: '가상 현장 확인 미실시 근거',
    nextCheckDueDate: '2026-09-03', relatedFollowupCaseId: 'case-A', ...extra,
});

describe('practice followup relationship integrity', () => {
    it('distinguishes unspecified, missing, cross-question and conflicting links', () => {
        expect(resolvePracticeFollowupLink(practice({relatedFollowupCaseId: undefined}), []).state).toBe('unlinked');
        expect(resolvePracticeFollowupLink(practice(), []).state).toBe('missing');
        expect(resolvePracticeFollowupLink(practice(), [{...followup(), questionNumber: 2}]).state).toBe('question_mismatch');
        const conflicting = [followup(), {...followup(), status: 'completed' as const}];
        expect(resolvePracticeFollowupLink(practice(), conflicting).state).toBe('conflict');
        expect(validatePracticeVerificationEvent(practice(), [], conflicting).join(' ')).toContain('충돌');
    });
    it('shows the current reopened state without rewriting the original practice event', () => {
        const original = practice();
        const actions = [followup(), {...followup(), id: 'action-2', status: 'reopened' as const, timestamp: '2026-09-04T01:00:00Z'}];
        const link = resolvePracticeFollowupLink(original, actions);
        expect(link.label).toContain('현재 조치 기록: 재점검·재조치');
        expect(original.timestamp).toBe('2026-09-02T01:00:00Z');
        expect(resolvePracticeFollowupLink(original, [followup(), followup()]).state).toBe('linked');
    });
    it('rejects a future case, another case concern or a future concern as recheck basis', () => {
        const recheck = practice({id: 'recheck', stage: 'recheck', result: 'observed_safe', evidenceReference: '합성 사진대장'});
        expect(validatePracticeVerificationEvent(recheck, [practice({relatedFollowupCaseId: 'case-B'})], [followup()]).join(' ')).toContain('같은 연결 조치');
        expect(validatePracticeVerificationEvent(recheck, [practice({timestamp: '2026-09-03T01:00:00Z'})], [followup()]).join(' ')).toContain('재점검 전');
        expect(validatePracticeVerificationEvent(practice(), [], [{...followup(), timestamp: '2026-09-03T01:00:00Z'}]).join(' ')).toContain('등록되기 전');
        expect(validatePracticeVerificationEvent({...recheck, timestamp: '2026-09-03T01:00:00Z'}, [practice()], [followup()])).toEqual([]);
    });
    it('renders the same explicit missing relation in manager history and appendix', () => {
        const record = {id: 'synthetic', date: '2026-09-01', practiceVerificationEvents: [practice()], riskFollowupEvents: []} as unknown as WorkerRecord;
        const history = renderToStaticMarkup(React.createElement(WorkerPracticeVerificationPanel, {record, onPersist: async () => true}));
        const report = renderToStaticMarkup(React.createElement(WorkerPracticeVerificationAppendix, {record}));
        for (const markup of [history, report]) {
            expect(markup).toContain('연결 조치 원본 없음');
            expect(markup).toContain('case-A');
        }
        const unlinked = renderToStaticMarkup(React.createElement(WorkerPracticeVerificationAppendix, {record:{...record,practiceVerificationEvents:[practice({relatedFollowupCaseId:undefined})]}}));
        expect(unlinked).toContain('조치 연결 미지정');
    });
});
