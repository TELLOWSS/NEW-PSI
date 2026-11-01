import { describe, expect, it } from 'vitest';
import type { WorkerRecord, WorkerRiskFollowupEvent } from '../types';
import { evaluatePsiEvidenceReadiness } from '../utils/psiEvidenceReadiness';

const worker = (patch: Partial<WorkerRecord> = {}): WorkerRecord => ({
    id:'synthetic-01',name:'가상 근로자',jobField:'형틀',date:'2026-10-31',
    language:'zh',originalImage:'data:image/jpeg;base64,QUJD',
    handwrittenAnswers: [
        {questionNumber:'Q1',answerText:'高处作业',koreanTranslation:'높은 곳 작업'},
        {questionNumber:'Q2',answerText:'坠落',koreanTranslation:'추락'},
        {questionNumber:'Q3',answerText:'很危险',koreanTranslation:'매우 위험'},
        {questionNumber:'Q4',answerText:'安全帽',koreanTranslation:'안전모'},
        {questionNumber:'Q5',answerText:'检查',koreanTranslation:'확인'},
    ],approvedBy:'관리자',approvedAt:'2026-10-31T10:00:00Z',
    ...patch,
} as unknown as WorkerRecord);
const followup = (patch: Partial<WorkerRiskFollowupEvent> = {}): WorkerRiskFollowupEvent => ({
    id:'evt-01',caseId:'case-01',questionNumber:2,
    status:'completed',timestamp:'2026-10-31T09:30:00Z',actor:'관리자',owner:'반장',
    actionDetail:'현장 조치 및 사진 확인 완료',verifiedBy:'관리자',
    evidenceNote:'작업 전 현장을 직접 확인',...patch,
});

describe('PSI evidence completeness review does not infer legal compliance',()=>{
    it('distinguishes available OCR/translation and stored image from verified historic original',()=>{
        const note=evaluatePsiEvidenceReadiness(worker());
        expect(note.sourceQuestionCount).toBe(5);
        expect(note.translationCount).toBe(5);
        expect(note.originalSource).toBe('stored-image');
        expect(note.findings.some(x=>x.code==='SOURCE_CURRENT_ONLY')).toBe(true);
        expect(note.findings.some(x=>x.code==='SERVER_RECEIPT_UNPROVEN')).toBe(true);
        expect(note.externallyTimestamped).toBe(false);
        expect(note.certifiedForLegalUse).toBe(false);
    });
    it('reports missing original and missing OCR values as critical without inventing evidence',()=>{
        const note=evaluatePsiEvidenceReadiness(worker({originalImage:'',handwrittenAnswers:[]}));
        expect(note.criticalCount).toBeGreaterThanOrEqual(3);
        expect(note.findings.map(x=>x.code)).toContain('SOURCE_MISSING');
        expect(note.findings.map(x=>x.code)).toContain('OCR_INCOMPLETE');
        expect(note.hasRecordContent).toBe(false);
    });
    it('separates unsupported narrative closure from independent evidence reference',()=>{
        const onlyNote=evaluatePsiEvidenceReadiness(worker({riskFollowupEvents:[followup()]}));
        expect(onlyNote.completedCaseCount).toBe(1);
        expect(onlyNote.unsupportedCompletionCount).toBe(1);
        expect(onlyNote.findings.map(x=>x.code)).toContain('SELF_REPORTED_COMPLETION');
        const referenced=evaluatePsiEvidenceReadiness(worker({riskFollowupEvents:[followup({evidenceReference:'현장점검-123'})]}));
        expect(referenced.unsupportedCompletionCount).toBe(0);
        expect(referenced.certifiedForLegalUse).toBe(false);
    });
    it('never marks a manager approval as professional translation certification',()=>{
        const note=evaluatePsiEvidenceReadiness(worker());
        expect(note.findings.map(x=>x.code)).toContain('NATIVE_REVIEW_UNCERTIFIED');
        expect(note.findings.map(x=>x.code)).not.toContain('TRANSLATION_GAPS');
    });
    it('reports invalid timestamps and observed safety lacking a linked proof reference',()=>{
        const note=evaluatePsiEvidenceReadiness(worker({
            riskFollowupEvents:[followup({timestamp:'invalid'})],
            practiceVerificationEvents:[{
                id:'obs-01',questionNumber:5,stage:'field_check',result:'observed_safe',
                actor:'관리자',timestamp:'2026-10-31T11:00:00Z',evidenceNote:'안전대 체결 현장 확인',
            }],
        }));
        expect(note.findings.map(x=>x.code)).toContain('FOLLOWUP_TIME_INVALID');
        expect(note.findings.map(x=>x.code)).toContain('PRACTICE_PROOF_MISSING');
    });
});
