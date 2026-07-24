import { describe, expect, it } from 'vitest';
import {
    buildSafetyCaseId,
    completeSafetyCaseStage,
    createSafetyCaseFromPlan,
    getNextSafetyCaseStage,
    isSafetyCaseOverdue,
    markSafetyCaseActionStarted,
    mergeSafetyCasePlan,
    resolveSafetyCaseDueAt,
} from '../utils/safetyCase';

const plan = {
    planKey: 'worker-a-fall',
    sourceRecordId: 'record-a',
    workerId: 'worker-a',
    workerName: '응우옌 반 안',
    jobField: '형틀',
    teamLeader: '김팀장',
    riskLabel: '추락 위험',
    actionTitle: '안전대 체결점 재확인',
    owner: '안전관리자',
    dueLabel: '2026년 7월 2주차',
};

describe('safety case closed loop', () => {
    it('builds a stable case id and due date from the same plan', () => {
        expect(buildSafetyCaseId(plan)).toBe(buildSafetyCaseId({ ...plan }));
        expect(buildSafetyCaseId(plan)).toMatch(/^PSI-CASE-/);
        expect(resolveSafetyCaseDueAt(plan.dueLabel)).toContain('2026-07-14');
        expect(resolveSafetyCaseDueAt('다음 주 · 2026-07-24')).toContain('2026-07-24');
    });

    it('advances in order from detection to reassessment', () => {
        let record = createSafetyCaseFromPlan(plan, '2026-06-22T00:00:00.000Z');
        expect(record.status).toBe('open');
        expect(getNextSafetyCaseStage(record)).toBe('action');

        record = markSafetyCaseActionStarted(record, '관리자');
        expect(record.status).toBe('action-in-progress');

        record = completeSafetyCaseStage(record, 'action', '관리자', '안전대 체결점 보완');
        expect(record.status).toBe('awaiting-report');
        record = completeSafetyCaseStage(record, 'report', '관리자', '관리자 분석 리포트 발행', { evidenceId: 'report-a' });
        record = completeSafetyCaseStage(record, 'training', '관리자', 'TBM 교육 연결', { evidenceId: 'session-a' });
        record = completeSafetyCaseStage(record, 'acknowledgement', '근로자', '모국어 확인 및 전자서명');
        record = completeSafetyCaseStage(record, 'reassessment', '관리자', '재평가 완료', { evidenceId: 'record-b' });

        expect(record.status).toBe('closed');
        expect(record.trainingSessionId).toBe('session-a');
        expect(record.reassessmentRecordId).toBe('record-b');
        expect(record.events).toHaveLength(7);
    });

    it('blocks skipping required stages', () => {
        const record = createSafetyCaseFromPlan(plan);
        expect(() => completeSafetyCaseStage(record, 'training', '관리자', '교육')).toThrow('이전 단계를 먼저 완료');
    });

    it('preserves completed history when a predictive plan is refreshed', () => {
        const record = completeSafetyCaseStage(
            createSafetyCaseFromPlan(plan),
            'action',
            '관리자',
            '조치 완료',
        );
        const refreshed = mergeSafetyCasePlan(record, { ...plan, owner: '현장소장' });
        expect(refreshed.completedStages.action).toBeTruthy();
        expect(refreshed.owner).toBe('현장소장');
        expect(refreshed.status).toBe('awaiting-report');
    });

    it('marks only open cases past their due date as overdue', () => {
        const record = createSafetyCaseFromPlan(plan);
        expect(isSafetyCaseOverdue(record, new Date('2026-07-15T00:00:00.000Z'))).toBe(true);
        const closed = {
            ...record,
            status: 'closed' as const,
        };
        expect(isSafetyCaseOverdue(closed, new Date('2026-07-15T00:00:00.000Z'))).toBe(false);
    });
});
