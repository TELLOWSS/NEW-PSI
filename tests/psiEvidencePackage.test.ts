import { describe, it, expect } from 'vitest';
import type { WorkerRecord, WorkerRiskFollowupEvent, WorkerPracticeVerificationEvent } from '../types';
import { preparePsiEvidencePackage, PSI_EVIDENCE_PACKAGE_VERSION } from '../utils/psiEvidencePackage';

const risk = (id: string, timestamp: string, status: WorkerRiskFollowupEvent['status'] = 'open'): WorkerRiskFollowupEvent => ({
    id, caseId:'case-1', questionNumber:2, status, timestamp,
    actor:'가상 관리자', owner:'가상 담당자', actionDetail:'위험 구역 작업 통제 상태 확인',
});
const practice = (id: string, timestamp: string): WorkerPracticeVerificationEvent => ({
    id, questionNumber:5, stage:'field_check', result:'unable_to_verify', timestamp,
    actor:'가상 관리자', evidenceNote:'현장에서 작업 상태 확인 불가', nextCheckDueDate:'2026-10-24',
});
const sample = (): WorkerRecord => ({
    id:'synthetic-record-001', name:'가상 근로자', jobField:'형틀', language:'zh', date:'2026-10-21',
    filename:'worker-original.jpg', ocrAnalyzedAt:'2026-10-21T00:03:00Z',
    originalImage:'data:image/jpeg;base64,QUJD',
    handwrittenAnswers:[
        {questionNumber:'Q1',answerText:'高处作业',koreanTranslation:'높은 곳에서 하는 작업'},
        {questionNumber:'Q2',answerText:'坠落、夹伤、碰撞',koreanTranslation:'추락·끼임·부딪힘'},
        {questionNumber:'Q3',answerText:'非常危险',koreanTranslation:'매우 위험합니다'},
        {questionNumber:'Q4',answerText:'佩戴安全帽',koreanTranslation:'안전모를 착용합니다'},
        {questionNumber:'Q5',answerText:'检查防护用具',koreanTranslation:'보호구를 확인합니다'},
    ],
    riskFollowupEvents:[risk('a','2026-10-21T01:00:00Z'),risk('b','2026-10-23T01:00:00Z','completed')],
    practiceVerificationEvents:[practice('c','2026-10-22T01:00:00Z')],
    correctionHistory:[{
        timestamp:'2026-10-21T02:00:00Z',actor:'가상 관리자',changedFields:['koreanTranslation'],
        reason:'번역 원문 대조 수정',
    }],
    auditTrail:[{timestamp:'2026-10-22T06:00:00Z',actor:'가상 관리자',stage:'validation',note:'현장 확인'}],
} as unknown as WorkerRecord);

describe('PSI confidential evidence package time and provenance boundaries',()=>{
    it('does not present a retrospective export as proof that the current OCR/photo existed then',()=>{
        const doc=preparePsiEvidencePackage(sample(),{exportedAt:'2026-11-01T00:00:00Z',cutoffIso:'2026-10-21T01:30:00Z'});
        const snapshot=JSON.parse(doc.files.find(x=>x.path==='record/snapshot.json')!.text);
        expect(snapshot.schema).toBe(PSI_EVIDENCE_PACKAGE_VERSION);
        expect(snapshot.siteActionEvents).toHaveLength(1);
        expect(snapshot.educationAndPracticeEvents).toHaveLength(0);
        expect(snapshot.eventTimeExclusions.followup.afterCutoff).toBe(1);
        expect(snapshot.eventTimeExclusions.practice.afterCutoff).toBe(1);
        expect(snapshot.savedAnswerValuesAsOfExport).toHaveLength(5);
        expect(snapshot.savedAnswerValuesAsOfExport[0].originalText).toBe('高处作业');
        expect(snapshot.record.sourceImageFile).toBe('assets/currently-stored-original-form.jpg');
        expect(doc.warnings.join(' ')).toContain('소급 증명하지 못합니다');
        expect(doc.counts.sourceImages).toBe(1);
        expect(doc.assets[0].base64).toBe('QUJD');
    });

    it('retains all present manager events without a cutoff and avoids treating training as field completion',()=>{
        const doc=preparePsiEvidencePackage(sample(),{exportedAt:'2026-11-01T00:00:00Z'});
        const data=JSON.parse(doc.files[0].text);
        expect(data.siteActionEvents).toHaveLength(2);
        expect(data.educationAndPracticeEvents).toHaveLength(1);
        expect(data.recordReviewApprovalIsNotTranslationCertification).toBe(true);
        expect(doc.files[1].text).toContain('교육·실천 확인');
        expect(doc.files[1].text).not.toContain('작업재개 승인 완료');
    });

    it('keeps photo attachments in separate files, never duplicates base64 inside the JSON',()=>{
        const doc=sample();
        doc.riskFollowupEvents![0].evidencePhoto='data:image/png;base64,QUJDRA==';
        const draft=preparePsiEvidencePackage(doc,{exportedAt:'2026-11-01T00:00:00Z'});
        const data=JSON.parse(draft.files[0].text);
        expect(data.siteActionEvents[0].evidencePhotoFile).toBe('assets/field-action-001.png');
        expect(draft.assets).toHaveLength(2);
        expect(draft.files[0].text).not.toContain('QUJDRA==');
    });

    it('reports missing original images rather than manufacturing them',()=>{
        const doc=sample();doc.originalImage='';
        const pkg=preparePsiEvidencePackage(doc,{exportedAt:'2026-11-01T00:00:00Z'});
        expect(pkg.assets).toHaveLength(0);
        expect(pkg.warnings.join(' ')).toContain('원본 자필 양식 이미지');
        expect(JSON.parse(pkg.files[0].text).record.sourceImageFile).toBe(null);
    });

    it('does not include future-dated and invalid-timestamp events in a time-scoped export',()=>{
        const doc=sample();
        doc.riskFollowupEvents!.push(risk('bad','not-a-time'));
        const pkg=preparePsiEvidencePackage(doc,{exportedAt:'2026-11-01T00:00:00Z',cutoffIso:'2026-10-22T00:00:00Z'});
        const payload=JSON.parse(pkg.files[0].text);
        expect(payload.siteActionEvents).toHaveLength(1);
        expect(payload.eventTimeExclusions.followup.invalidTimestamp).toBe(1);
        expect(payload.eventTimeExclusions.followup.afterCutoff).toBe(1);
    });
});
