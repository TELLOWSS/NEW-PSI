import { describe, expect, it } from 'vitest';
import type { WorkerPracticeVerificationEvent, WorkerRecord } from '../types';
import {
    appendPracticeVerificationEvent, buildPracticeVerificationSummary,
    formatPracticeVerificationEducationLines, validatePracticeVerificationEvent,
} from '../utils/practiceVerification';
import { buildFieldRecordSource, buildTbmEducationDraft } from '../utils/tbmEducationStudio';

const evt = (
    id: string, stage: WorkerPracticeVerificationEvent['stage'],
    result: WorkerPracticeVerificationEvent['result'], timestamp: string,
    extra: Partial<WorkerPracticeVerificationEvent> = {},
): WorkerPracticeVerificationEvent => ({
    id, stage, result, timestamp, questionNumber: 5,
    actor: '안전 관리자',
    evidenceNote: '현장에서 구체적인 상황과 안전행동 확인',
    ...extra,
});
const record = (id: string, items: WorkerPracticeVerificationEvent[], trade='형틀') => ({
    id, name: '교광성', employeeId: '123456',
    date:'2026-09-01', jobField: trade,
    practiceVerificationEvents: items,
    handwrittenAnswers:[{questionNumber:'Q5',answerText:'私人个人信息',koreanTranslation:'개인 실천 약속'}],
    riskFollowupEvents: [],
    safetyScore: 90,
} as unknown as WorkerRecord);

describe('worker practice verification is separate from training and corrective action', () => {
    it('rejects fictional education completion and contradictory phase/result pairs', () => {
        const base = evt('e1','education','delivered','2026-09-15T01:00:00Z');
        expect(validatePracticeVerificationEvent(base,[]).join(' ')).toContain('교육일지');
        expect(validatePracticeVerificationEvent({...base, result:'observed_safe'},[]).join(' ')).toContain('일치');
        const safe = evt('e2','field_check','observed_safe','2026-09-15T02:00:00Z');
        expect(validatePracticeVerificationEvent(safe,[]).join(' ')).toContain('증빙 참조번호');
        expect(validatePracticeVerificationEvent(evt('e3','recheck','observed_safe','2026-09-15T03:00:00Z',{evidenceReference:'A1'}),[]).join(' ')).toContain('재점검 전');
    });

    it('requires revisit date and permits appended recheck after genuine field concern', () => {
        const concern = evt('a','field_check','correction_required','2026-09-15T01:00:00Z', {nextCheckDueDate:'2026-09-20'});
        expect(validatePracticeVerificationEvent({...concern,nextCheckDueDate:undefined},[]).join(' ')).toContain('재확인 예정일');
        const first = appendPracticeVerificationEvent([],concern);
        const second = appendPracticeVerificationEvent(first,evt('b','recheck','observed_safe','2026-09-22T01:00:00Z',{
            evidenceReference:'사진대장 1008',
        }));
        expect(first).toHaveLength(1);
        expect(second).toHaveLength(2);
        expect(first[0].result).toBe('correction_required');
        expect(validatePracticeVerificationEvent(first[0],first).join(' ')).toContain('중복');
    });

    it('requires matching Q case when linking to a corrective action', () => {
        const e = evt('x','field_check','unable_to_verify','2026-09-22T01:00:00Z',{
            relatedFollowupCaseId:'case-01',nextCheckDueDate:'2026-09-29',
        });
        const linked = [{
            id:'f1',caseId:'case-01',questionNumber:2,status:'open',
            timestamp:'2026-09-10T01:00:00Z',actor:'점검자',owner:'반장',actionDetail:'차단조치 확인',
        }] as const;
        expect(validatePracticeVerificationEvent(e,[],[...linked]).join(' ')).toContain('문항 번호');
    });

    it('keeps education and understanding separate from observed field behavior and preserves time cutoffs', () => {
        const events = [
            evt('e1','education','delivered','2026-09-02T02:00:00Z',{sessionReference:'교육일지-2026-09'}),
            evt('e2','understanding','understood','2026-09-02T03:00:00Z',{sessionReference:'교육일지-2026-09'}),
            evt('e3','field_check','unable_to_verify','2026-09-03T01:00:00Z',{nextCheckDueDate:'2026-09-06'}),
            evt('e4','recheck','observed_safe','2026-10-01T01:00:00Z',{evidenceReference:'PHOTO-001'}),
        ];
        const september = buildPracticeVerificationSummary([record('R-1',events)],{asOfDate:'2026-09-30',periodStartDate:'2026-09-01'});
        expect(september.educationDelivered).toBe(1);
        expect(september.understandingConfirmed).toBe(1);
        expect(september.fieldObserved).toBe(1);
        expect(september.fieldPositiveObservation).toBe(0);
        expect(september.needsFieldRecheck).toBe(1);
        expect(september.overdueFieldRecheck).toBe(1);
        const october = buildPracticeVerificationSummary([record('R-1',events)],{asOfDate:'2026-10-05',periodStartDate:'2026-10-01'});
        expect(october.educationDelivered).toBe(0);
        expect(october.fieldPositiveObservation).toBe(1);
        expect(october.needsFieldRecheck).toBe(0);
        expect(october.rechecked).toBe(1);
    });

    it('never exports worker names, raw OCR strings or individual scores to education', () => {
        const e=evt('e1','field_check','correction_required','2026-09-03T01:00:00Z',{
            evidenceNote:'교광성 휴대전화 010-1234-5678',
            nextCheckDueDate:'2026-09-05',
        });
        const snap = buildPracticeVerificationSummary([record('R-1',[e])],{asOfDate:'2026-09-30'});
        const lines = formatPracticeVerificationEducationLines(snap).join('\n');
        for(const val of ['교광성','010-1234-5678','123456','私人个人信息','90']) expect(lines).not.toContain(val);
        expect(lines).toContain('재확인 필요 1');
    });

    it('adds Q-level practice checks to A4 focus, never to official high-grade risks', () => {
        const e=evt('e1','field_check','correction_required','2026-09-03T01:00:00Z',{nextCheckDueDate:'2026-09-05'});
        const doc=record('R-1',[e]);
        const source=buildFieldRecordSource([],'전체 공종','10월', {
            practiceRecords:[doc],asOfDate:'2026-09-30',periodStartDate:'2026-09-01',
        });
        expect(source?.text).toContain('Q5 실천 확인 미해소');
        const d=buildTbmEducationDraft({workerRecords:[],sources:source?[source]:[],workType:'전체 공종',month:'2026-10'});
        expect(d.focusPoints.some(line=>line.includes('Q5 실천 확인 미해소'))).toBe(true);
        expect(d.risks).toHaveLength(0);
        expect(d.confirmationQuestions).toContain('교육 후 실제 작업에서 안전행동을 누가 어떤 근거로 확인했습니까?');
    });
});
