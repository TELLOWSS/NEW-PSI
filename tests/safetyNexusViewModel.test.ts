import { describe, expect, it } from 'vitest';
import type { WorkerRecord } from '../types';
import { summarizeLoadedNexusRecords } from '../utils/safetyNexusViewModel';

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
