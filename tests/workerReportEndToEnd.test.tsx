import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { WorkerRecord, WorkerPracticeVerificationEvent } from '../types';
import { WorkerInterpretationAppendix } from '../components/report/WorkerInterpretationAppendix';
import { WorkerRiskFollowupAppendix } from '../components/report/WorkerRiskFollowupAppendix';
import { WorkerPracticeVerificationAppendix } from '../components/report/WorkerPracticeVerificationAppendix';
import { buildWorkerInterpretationNote } from '../utils/workerInterpretationNote';
import { appendWorkerRiskFollowupEvent, getSeoulFollowupDay } from '../utils/workerRiskFollowup';
import { appendPracticeVerificationEvent, buildPracticeVerificationSummary } from '../utils/practiceVerification';
import { buildMonthlyFieldFollowupSummary } from '../utils/monthlyFieldFollowup';

const fixture = (): WorkerRecord => ({
    id: 'synthetic-chinese-worker-01',
    name: '가상 근로자',
    date: '2026-10-21',
    jobField: '형틀',
    nationality: '중국',
    language: 'zh',
    handwrittenAnswers: [
        { questionNumber: 'Q1', answerText: '高处作业', koreanTranslation: '높은 곳에서 하는 작업입니다.' },
        { questionNumber: 'Q2', answerText: '坠落、夹伤、碰撞', koreanTranslation: '추락, 끼임, 부딪힘입니다.' },
        { questionNumber: 'Q3', answerText: '非常危险', koreanTranslation: '아주 위험합니다.' },
        { questionNumber: 'Q4', answerText: '佩戴安全帽和安全带', koreanTranslation: '안전모와 안전대를 착용합니다.' },
        { questionNumber: 'Q5', answerText: '施工前检查安全用品', koreanTranslation: '작업 전에 보호구를 확인합니다.' },
    ],
} as unknown as WorkerRecord);

describe('PSI manager Q1-Q5 report full-route regression', () => {
    it('preserves all originals, Korean drafts and uncertainty in the appendix', () => {
        const record = fixture();
        const note = buildWorkerInterpretationNote(record);
        const markup = renderToStaticMarkup(React.createElement(WorkerInterpretationAppendix, { record }));
        expect(note.sourceCount).toBe(5);
        expect(note.translationCount).toBe(5);
        expect(markup).toContain('data-worker-interpretation-note="true"');
        expect(markup).toContain('高处作业');
        expect(markup).toContain('높은 곳에서 하는 작업입니다.');
        expect((markup.match(/data-interpretation-question=/g)||[])).toHaveLength(5);
        expect(markup).toContain('공식 위험등급');
        expect(markup).not.toContain('75점');
    });

    it('prints the recorded corrective action, not just an empty unverified checklist', () => {
        const record = fixture();
        const first = appendWorkerRiskFollowupEvent([], {
            id: 'action-01', caseId: 'case-01', questionNumber: 2, status: 'scheduled',
            actor: '관리자', owner: '담당반장', timestamp: '2026-10-21T02:00:00Z',
            actionDetail: '고소작업 출입통제와 안전난간 점검 예정',
            dueDate: '2026-10-22',
        });
        record.riskFollowupEvents = appendWorkerRiskFollowupEvent(first, {
            id: 'action-02', caseId: 'case-01', questionNumber: 2, status: 'interim_control',
            actor: '관리자', owner: '담당반장', timestamp: '2026-10-21T04:00:00Z',
            actionDetail: '작업구역 출입통제 유지 확인',
            interimControl: '위험 구역 출입금지 표지와 임시 차단시설 설치',
        });
        const markup = renderToStaticMarkup(React.createElement(WorkerRiskFollowupAppendix, { record }));
        expect(markup).toContain('data-worker-risk-followup-appendix="true"');
        expect(markup).toContain('작업구역 출입통제');
        expect(markup).toContain('임시통제');
        expect(markup).not.toContain('완료 증빙 확인</h3>');
        const summary = buildMonthlyFieldFollowupSummary([record], {
            asOfDate: '2026-10-24', periodStartDate: '2026-10-01',
        });
        expect(summary.unresolved).toBe(1);
        expect(summary.completed).toBe(0);
    });

    it('prints practice separately, and does not count education as observed safe behavior', () => {
        const record = fixture();
        const education: WorkerPracticeVerificationEvent = {
            id:'education-01', stage:'education', result:'delivered', questionNumber:5,
            timestamp:'2026-10-21T00:10:00Z', actor:'관리자', sessionReference:'교육일지-가상-01',
            evidenceNote:'실제 출석명부와 교육자료를 현장 확인함',
        };
        const field: WorkerPracticeVerificationEvent = {
            id:'field-01', stage:'field_check', result:'unable_to_verify', questionNumber:5,
            timestamp:'2026-10-21T01:10:00Z', actor:'관리자', nextCheckDueDate:'2026-10-22',
            evidenceNote:'해당 시간에 작업구역을 직접 확인하지 못함',
        };
        record.practiceVerificationEvents = appendPracticeVerificationEvent([], education);
        record.practiceVerificationEvents = appendPracticeVerificationEvent(record.practiceVerificationEvents, field);
        const markup = renderToStaticMarkup(React.createElement(WorkerPracticeVerificationAppendix, { record }));
        expect(markup).toContain('data-practice-verification-appendix="true"');
        expect(markup).toContain('교육 전달');
        expect(markup).toContain('실천 확인 불가');
        expect(markup).toContain('재점검 기한');
        const summary = buildPracticeVerificationSummary([record], {
            asOfDate:'2026-10-24',periodStartDate:'2026-10-01',
        });
        expect(summary.educationDelivered).toBe(1);
        expect(summary.fieldPositiveObservation).toBe(0);
        expect(summary.needsFieldRecheck).toBe(1);
        expect(summary.overdueFieldRecheck).toBe(1);
    });

    it('uses Korea local calendar day across midnight for corrective action deadlines', () => {
        expect(getSeoulFollowupDay(new Date('2026-10-31T21:30:00.000Z'))).toBe('2026-11-01');
        expect(getSeoulFollowupDay(new Date('2026-10-31T14:30:00.000Z'))).toBe('2026-10-31');
    });

    it('protects worker image/MMS from manager-only annexes and keeps source review first', () => {
        const pageSource = readFileSync(fileURLToPath(new URL('../pages/IndividualReport.tsx', import.meta.url)), 'utf8');
        const qnaSource = readFileSync(fileURLToPath(new URL('../components/modals/RecordDetailModal.tsx', import.meta.url)), 'utf8');
        expect(pageSource).toContain('includeAdminAppendix={true}');
        const pageOnlyCapture = pageSource.match(/captureReportCanvases\(workerCertificatePage\(\), html2canvas/g) || [];
        expect(pageOnlyCapture).toHaveLength(2); // worker image share + worker MMS
        const fullCapture = pageSource.match(/captureReportCanvases\(reportRef\.current, html2canvas/g) || [];
        expect(fullCapture).toHaveLength(2); // manager PDF + manager ZIP
        expect(qnaSource.indexOf('eyebrow="원문 비교 검수"')).toBeLessThan(qnaSource.indexOf('data-psi-field-followup-tools="true"'));
    });
});
