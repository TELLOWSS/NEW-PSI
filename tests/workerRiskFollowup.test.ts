import { describe, expect, it } from 'vitest';
import {
    appendWorkerRiskFollowupEvent,
    collectWorkerRiskFollowupCases,
    getWorkerRiskFollowupSummary,
    validateWorkerRiskFollowup,
    type WorkerRiskFollowupInput,
} from '../utils/workerRiskFollowup';

const initial = (patch: Partial<WorkerRiskFollowupInput> = {}): WorkerRiskFollowupInput => ({
    id: 'event-1',
    caseId: 'case-1',
    questionNumber: 2,
    status: 'open',
    timestamp: '2026-10-31T01:00:00.000Z',
    actor: '관리자 A',
    owner: '담당자 B',
    actionDetail: '작업발판 현장 확인 필요',
    ...patch,
});

describe('PSI worker follow-up closed-loop', () => {
    it('keeps a complete immutable event sequence for the same Q2 case', () => {
        const a = appendWorkerRiskFollowupEvent([], initial());
        const b = appendWorkerRiskFollowupEvent(a, initial({
            id: 'event-2',
            status: 'interim_control',
            timestamp: '2026-10-31T02:00:00.000Z',
            actionDetail: '해당 구간 임시 출입통제',
            interimControl: '작업 통로 차단 및 안전표지 설치',
        }));
        const c = appendWorkerRiskFollowupEvent(b, initial({
            id: 'event-3',
            status: 'scheduled',
            timestamp: '2026-10-31T03:00:00.000Z',
            actionDetail: '난간 및 작업발판 보완 예정',
            dueDate: '2026-11-01',
        }));
        expect(a).toHaveLength(1);
        expect(b).toHaveLength(2);
        expect(c).toHaveLength(3);
        expect(b[0]).toEqual(a[0]);
        expect(getWorkerRiskFollowupSummary(c, '2026-11-02').overdue).toBe(1);
        expect(collectWorkerRiskFollowupCases(c)[0].latest.status).toBe('scheduled');
    });

    it('requires verifier and evidence before completion and supports reopening', () => {
        const a = appendWorkerRiskFollowupEvent([], initial());
        const complete = initial({
            id: 'event-2',
            status: 'completed',
            timestamp: '2026-10-31T02:00:00.000Z',
            actionDetail: '안전난간 보완 현장 확인',
            verifiedBy: '확인자 C',
            evidenceNote: '안전난간 현장 확인 및 점검 사진 등록',
        });
        expect(validateWorkerRiskFollowup({ ...complete, verifiedBy: '' }, a).join(' ')).toContain('확인자');
        expect(validateWorkerRiskFollowup({ ...complete, evidenceNote: '' }, a).join(' ')).toContain('완료 증빙');
        const b = appendWorkerRiskFollowupEvent(a, complete);
        expect(getWorkerRiskFollowupSummary(b).completed).toBe(1);
        expect(validateWorkerRiskFollowup(initial({ id:'event-3',status:'scheduled', dueDate:'2026-11-01',timestamp:'2026-10-31T03:00:00.000Z' }), b)).toContain('완료된 건은 재개방 후 다시 기록해야 합니다.');
        const c = appendWorkerRiskFollowupEvent(b, initial({
            id: 'event-3',
            status: 'reopened',
            timestamp: '2026-10-31T03:00:00.000Z',
            actionDetail: '다음 층 동일 위험 재확인 필요',
        }));
        expect(getWorkerRiskFollowupSummary(c).unresolved).toBe(1);
        expect(getWorkerRiskFollowupSummary(c).completed).toBe(0);
    });

    it('prevents false closure, arbitrary question changes, duplicate IDs and missing interim controls', () => {
        expect(validateWorkerRiskFollowup(initial({ status:'completed' })).length).toBeGreaterThan(0);
        expect(validateWorkerRiskFollowup(initial({ status:'interim_control' })).join(' ')).toContain('임시통제');
        expect(validateWorkerRiskFollowup(initial({ status:'scheduled' })).join(' ')).toContain('기한');
        const a = appendWorkerRiskFollowupEvent([], initial());
        expect(validateWorkerRiskFollowup(initial({id:'event-2',questionNumber:3}),a).join(' ')).toContain('연결 문항');
        expect(validateWorkerRiskFollowup(initial(),a).join(' ')).toContain('동일한 이벤트 ID');
    });

    it('rejects images that are not bounded JPEG and keeps proof references', () => {
        expect(validateWorkerRiskFollowup(initial({evidencePhoto:'data:image/png;base64,abc'})).join(' ')).toContain('JPEG');
        const a = appendWorkerRiskFollowupEvent([], initial({
            evidenceReference:'사진대장-123',
            evidenceNote:'현장 확인 내용 기록',
        }));
        expect(a[0].evidenceReference).toBe('사진대장-123');
    });
});
