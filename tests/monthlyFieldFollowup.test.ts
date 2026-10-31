import { describe, expect, it } from 'vitest';
import type { WorkerRecord, WorkerRiskFollowupEvent } from '../types';
import { buildMonthlyFieldFollowupSummary, formatMonthlyFollowupEducationLines, getKoreanCalendarDay } from '../utils/monthlyFieldFollowup';
import { buildFieldRecordSource, buildTbmEducationDraft } from '../utils/tbmEducationStudio';

const event = (
    id: string, caseId: string, status: WorkerRiskFollowupEvent['status'],
    timestamp: string, extra: Partial<WorkerRiskFollowupEvent> = {},
): WorkerRiskFollowupEvent => ({
    id, caseId, status, timestamp, questionNumber: 2,
    actor: '안전관리자 A', owner: '근로자 홍길동',
    actionDetail: '실명 홍길동 010-1234-5678, 시정되지 않은 위험을 현장에서 확인했습니다.',
    ...extra,
});

const worker = (id: string, date: string, riskFollowupEvents: WorkerRiskFollowupEvent[], trade = '형틀'): WorkerRecord => ({
    id, date, riskFollowupEvents, jobField: trade,
    name: '홍길동', employeeId: 'private-001',
    handwrittenAnswers: [{ questionNumber:'Q2', answerText:'중국어 자필 실명 홍길동', koreanTranslation:'개인별 원문' }],
    weakAreas: [], suggestions: [], improvement: '', actionable_coaching: '',
} as unknown as WorkerRecord);

describe('monthly worker action follow-up education handoff', () => {
    const first = event('evt1', 'case-A', 'scheduled', '2026-08-20T01:30:00Z', { dueDate: '2026-08-31' });
    const interim = event('evt2', 'case-B', 'interim_control', '2026-09-02T10:30:00Z', {
        questionNumber: 4, interimControl: '작업구역 출입을 통제합니다.',
    });
    const reopened = event('evt3', 'case-C', 'open', '2026-08-10T01:00:00Z', {questionNumber: 5});
    const finished = event('evt4', 'case-C', 'completed', '2026-08-18T02:00:00Z', {questionNumber: 5, verifiedBy:'확인자'});
    const recheck = event('evt5', 'case-C', 'reopened', '2026-09-09T03:00:00Z', {questionNumber: 5});

    it('carries open cases forward; counts overdue only if unresolved and due date is past', () => {
        const source = worker('w1', '2026-08-02', [first, interim, reopened, finished, recheck]);
        const snapshot = buildMonthlyFieldFollowupSummary([source], {
            asOfDate:'2026-09-15', periodStartDate:'2026-09-01',
        });
        expect(snapshot.totalCases).toBe(3);
        expect(snapshot.unresolved).toBe(3);
        expect(snapshot.completed).toBe(0);
        expect(snapshot.overdue).toBe(1);
        expect(snapshot.carriedOver).toBe(2);
        expect(snapshot.touchedInPeriod).toBe(2);
        expect(snapshot.reopened).toBe(1);
        expect(snapshot.interimControl).toBe(1);
        expect(snapshot.educationFocus[0]).toContain('Q2');
    });

    it('does not look forward into later events, imported copies or future-dated assessments', () => {
        const lateCompletion = event('ev6','case-A','completed','2026-10-08T00:00:00Z',{verifiedBy:'확인자'});
        const rec = worker('w1', '2026-08-02', [first,lateCompletion]);
        const duplicatedCopy = worker('w1', '2026-08-02', [first]);
        const notYetWritten = worker('w2','2026-11-05',[event('ev7','case-X','open','2026-08-01T00:00:00Z')]);
        const september = buildMonthlyFieldFollowupSummary([rec,duplicatedCopy,notYetWritten], {
            asOfDate:'2026-09-30',periodStartDate:'2026-09-01',
        });
        expect(september.totalCases).toBe(1);
        expect(september.unresolved).toBe(1);
        expect(september.overdue).toBe(1);
        const october = buildMonthlyFieldFollowupSummary([rec], {
            asOfDate:'2026-10-10',periodStartDate:'2026-10-01',
        });
        expect(october.completed).toBe(1);
        expect(october.unresolved).toBe(0);
        expect(october.overdue).toBe(0);
        expect(october.carriedOver).toBe(0);
    });

    it('uses only verified manager events and never leaks free-text personal data into training signals', () => {
        const source = worker('w1','2026-09-01',[first]);
        const snap = buildMonthlyFieldFollowupSummary([source], {
            asOfDate:'2026-09-30',periodStartDate:'2026-09-01',
        });
        const text = formatMonthlyFollowupEducationLines(snap).join('\n');
        expect(text).toContain('기한 초과 1건');
        for (const sensitive of ['홍길동','010-1234-5678','private-001','중국어 자필']) {
            expect(text + snap.educationFocus.join('\n')).not.toContain(sensitive);
        }
        const pledgeOnly = worker('w2','2026-09-15',[]);
        expect(buildMonthlyFieldFollowupSummary([pledgeOnly], {asOfDate:'2026-09-30'}).totalCases).toBe(0);
    });

    it('places follow-up findings in A4 focus, not official high-grade risk or accident case', () => {
        const lastCycle = worker('w1','2026-08-10',[first]);
        const source = buildFieldRecordSource([], '전체 공종','다음 달', {
            followupRecords: [lastCycle],
            asOfDate:'2026-09-30',periodStartDate:'2026-09-01',
        });
        expect(source?.kind).toBe('field-record');
        expect(source?.text).toContain('Q2 확인사항');
        const draft = buildTbmEducationDraft({
            workerRecords:[],sources:source ? [source] : [], workType:'전체 공종',
            month:'2026-10',targetCycleLabel:'다음 달',
        });
        expect(draft.focusPoints.some(x=>x.includes('Q2 확인사항'))).toBe(true);
        expect(draft.confirmationQuestions).toContain('미완료 현장 조치의 담당자, 임시통제 방법, 재확인 기한은 무엇입니까?');
        expect(draft.risks).toHaveLength(0);
        expect(draft.accidentCases[0].title).toBe('최근 유사 재해사례 입력 필요');
    });

    it('supports trade filtering and caps an accidentally selected future reference date', () => {
        const records = [
            worker('w1','2026-08-10',[first],'형틀'),
            worker('w2','2026-08-10',[event('ev-other','other','open','2026-08-22T00:00:00Z')],'철근'),
        ];
        expect(buildMonthlyFieldFollowupSummary(records,{asOfDate:'2026-09-30',workType:'형틀'}).totalCases).toBe(1);
        expect(buildMonthlyFieldFollowupSummary(records,{asOfDate:'2099-12-31'}).asOfDate).toBe(getKoreanCalendarDay());
    });
});
