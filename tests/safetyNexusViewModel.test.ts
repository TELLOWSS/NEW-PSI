import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { filterLoadedNexusRecords, sliceLoadedNexusRecords, summarizeLoadedNexusRecords, summarizeNexusScoreEvidence, nexusEventsAsOf } from '../utils/safetyNexusViewModel';

it('limits related events to the Korean calendar cutoff and excludes later source records', () => {
  const events = [
    { id:'a', caseId:'x', questionNumber:2, timestamp:'2026-01-31T14:59:00Z' },
    { id:'b', caseId:'x', questionNumber:2, timestamp:'2026-01-31T15:00:00Z' },
    { id:'c', caseId:'x', questionNumber:2, timestamp:'invalid' },
  ] as WorkerRecord['riskFollowupEvents'];
  expect(nexusEventsAsOf({date:'2026-01-01',riskFollowupEvents:events},2,'2026-01-31').map(e=>e.id)).toEqual(['a']);
  expect(nexusEventsAsOf({date:'2026-02-01',riskFollowupEvents:events},2,'2026-01-31')).toEqual([]);
});

it('keeps valid zero scores and excludes missing or invalid values independently for each metric', () => {
  const rows = [
    { scoreBreakdown: { psychological: 0, jobUnderstanding: 20 } },
    { scoreBreakdown: { psychological: 10, jobUnderstanding: 21 } },
    { scoreBreakdown: { psychological: NaN, jobUnderstanding: 0 } },
    {},
  ] as unknown as Pick<WorkerRecord, 'scoreBreakdown'>[];
  const result = summarizeNexusScoreEvidence(rows);
  expect(result.find(item => item.key === 'psychological')).toMatchObject({ valid: 2, missing: 2, average: 5 });
  expect(result.find(item => item.key === 'jobUnderstanding')).toMatchObject({ valid: 2, missing: 2, average: 10 });
  expect(result.find(item => item.key === 'proficiency')).toMatchObject({ valid: 0, missing: 4, average: null });
  expect(result.some(item => item.key === 'repeatViolationPenalty')).toBe(false);
});

type MinimalRecord = Pick<WorkerRecord, 'selfAssessedRiskLevel' | 'reviewStatus' | 'approvalStatus'>;

describe('Safety Nexus loaded-record snapshot', () => {
  it('keeps self-assessed levels separate from official hazard judgments', () => {
    const records: MinimalRecord[] = [
      { selfAssessedRiskLevel:'상', reviewStatus:'PENDING' },
      { selfAssessedRiskLevel:'중', approvalStatus:'PENDING', reviewStatus:'APPROVED' },
      { selfAssessedRiskLevel:'하', approvalStatus:'APPROVED' },
      { selfAssessedRiskLevel:'상', reviewStatus:'REJECTED' },
    ];
    expect(summarizeLoadedNexusRecords(records)).toEqual({
      loadedRecordRows:4,
      selfRiskLevels:{'상':2,'중':1,'하':1},
      unclassifiedRows:0,
      pendingReviewMarkedRows:2,
      scopeVerified:false,
      officialReportComparable:false,
    });
  });
  it('does not infer zero risk when the assessment field is missing', () => {
    const raw=[{selfAssessedRiskLevel:'기타'}] as unknown as MinimalRecord[];
    const snapshot=summarizeLoadedNexusRecords(raw);
    expect(snapshot.unclassifiedRows).toBe(1);
    expect(snapshot.selfRiskLevels['하']).toBe(0);
  });
  it('never returns names or individual source answers', () => {
    const snapshot=summarizeLoadedNexusRecords([{selfAssessedRiskLevel:'상'}]);
    expect(JSON.stringify(snapshot)).not.toMatch(/name|answer|worker_uuid|signature/);
  });
});

describe('Safety Nexus local scope guards', () => {
  const rows = [
    {date:'2026-11-15',jobField:'형틀',selfAssessedRiskLevel:'상' as const},
    {date:'2026-11-11',jobField:'철근',selfAssessedRiskLevel:'하' as const},
    {date:'2026-10-31',jobField:'형틀',selfAssessedRiskLevel:'중' as const},
    {date:'알 수 없음',jobField:'형틀',selfAssessedRiskLevel:'상' as const},
  ];
  it('counts only matching source-month and trade rows without inventing a site scope', () => {
    const result=sliceLoadedNexusRecords(rows,{month:'2026-11',trade:'형틀'});
    expect(result.matchingRows).toBe(1);
    expect(result.snapshot.selfRiskLevels).toEqual({'상':1,'중':0,'하':0});
    expect(result.scope).toBe('CURRENTLY_LOADED_RECORDS_ONLY');
    expect(result.snapshot.scopeVerified).toBe(false);
    expect(result.monthOptions).toEqual(['2026-11','2026-10']);
  });
  it('does not silently put unknown-date rows in the chosen month', () => {
    expect(sliceLoadedNexusRecords(rows,{month:'2026-11',trade:''}).matchingRows).toBe(2);
    const all=sliceLoadedNexusRecords(rows,{month:'',trade:''});
    expect(all.undatedRowsInAllPeriods).toBe(1);
    expect(all.snapshot.loadedRecordRows).toBe(4);
  });
  it('returns exactly matching loaded source records without copying personal fields into metrics', () => {
    const source=[
      {id:'A',date:'2026-11-15',jobField:'형틀',selfAssessedRiskLevel:'상'},
      {id:'B',date:'2026-11-14',jobField:'철근',selfAssessedRiskLevel:'중'},
      {id:'C',date:'2026-10-15',jobField:'형틀',selfAssessedRiskLevel:'하'},
      {id:'D',date:'invalid',jobField:'형틀',selfAssessedRiskLevel:'상'},
    ];
    const result=filterLoadedNexusRecords(source,{month:'2026-11',trade:'형틀'});
    expect(result.map(row=>row.id)).toEqual(['A']);
    expect(source).toHaveLength(4);
  });
  it('unknown trade never appears as a fabricated category', () => {
    const result=sliceLoadedNexusRecords([...rows,
      {date:'2026-11-01',jobField:'',selfAssessedRiskLevel:'상'}],{month:'',trade:''});
    expect(result.tradeOptions).toEqual(['철근','형틀']);
    expect(result.matchingRows).toBe(5);
  });
});
