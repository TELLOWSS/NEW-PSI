import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { sliceLoadedNexusRecords, summarizeLoadedNexusRecords } from '../utils/safetyNexusViewModel';

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
  it('unknown trade never appears as a fabricated category', () => {
    const result=sliceLoadedNexusRecords([...rows,
      {date:'2026-11-01',jobField:'',selfAssessedRiskLevel:'상'}],{month:'',trade:''});
    expect(result.tradeOptions).toEqual(['철근','형틀']);
    expect(result.matchingRows).toBe(5);
  });
});
