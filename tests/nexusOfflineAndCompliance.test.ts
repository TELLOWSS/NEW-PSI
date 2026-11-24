import { beforeEach, describe, expect, it } from 'vitest';
import { buildNexusComplianceBundle, buildStoreZipArchive } from '../utils/nexusComplianceBundle';
import {
  readExecutiveTrainingCampaigns,
  recordIndividualWorkerHandwrittenSignature,
  stageExecutiveTrainingHandoff,
  writeExecutiveTrainingCampaigns,
} from '../utils/nexusExecutiveTrainingPipeline';
import { seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';
import {
  clearSyncedOfflineQueue,
  enqueueNexusOfflineMutation,
  flushNexusOfflineQueue,
  getPendingOfflineQueueCount,
  resetNexusOfflineQueue,
} from '../utils/nexusOfflineQueue';

describe('Offline Underground Queue, Handwritten 12-Lang Signatures & SAPA Compliance ZIP', () => {
  beforeEach(() => {
    resetNexusOfflineQueue();
    writeExecutiveTrainingCampaigns([]);
  });

  it('queues field mutations offline and flushes cleanly once online', async () => {
    enqueueNexusOfflineMutation(
      {
        kind: 'pipeline_case',
        siteId: 'SITE-01-SUBRC',
        recordId: 'CASE-B2-001',
        summary: '지하 2층 합벽 타이볼트 간격 보강 [작업중지]',
      },
      '2026-11-24T08:00:00Z',
    );
    enqueueNexusOfflineMutation(
      {
        kind: 'equipment_photo',
        siteId: 'SITE-01-SUBRC',
        recordId: 'EQ-PUMP-001',
        summary: '콘크리트 펌프카 아웃트리거 사진',
      },
      '2026-11-24T08:02:00Z',
    );

    expect(getPendingOfflineQueueCount()).toBe(2);

    const processed: string[] = [];
    const flushRes = await flushNexusOfflineQueue(async entry => {
      processed.push(entry.recordId);
    }, '2026-11-24T08:05:00Z');

    expect(flushRes.flushedCount).toBe(2);
    expect(flushRes.failedCount).toBe(0);
    expect(flushRes.remainingPendingCount).toBe(0);
    expect(processed).toEqual(['EQ-PUMP-001', 'CASE-B2-001']);

    const afterClear = clearSyncedOfflineQueue();
    expect(afterClear).toHaveLength(0);
  });

  it('records individual worker handwritten signature receipts and embeds them into SAPA Compliance ZIP with CSV injection safety', async () => {
    const campaign = stageExecutiveTrainingHandoff('RC-SUB-01', {
      targetWorkers: 2,
      dispatchImmediately: true,
      nowIso: '2026-11-24T08:30:00Z',
    });

    const tinyPngDataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

    const firstSign = recordIndividualWorkerHandwrittenSignature(
      campaign.campaignId,
      {
        workerName: '=NGUYEN',
        languageCode: 'vi-VN',
        signatureDataUrl: tinyPngDataUrl,
        siteId: 'SITE-01-SUBRC',
      },
      '2026-11-24T08:35:00Z',
    );
    expect(firstSign.receipt.workerName).toBe('=NGUYEN');
    expect(firstSign.campaigns[0].completionRatePct).toBe(50);

    const secondSign = recordIndividualWorkerHandwrittenSignature(
      campaign.campaignId,
      {
        workerName: 'ZHANG WEI',
        languageCode: 'cmn-CN',
        signatureDataUrl: tinyPngDataUrl,
        siteId: 'SITE-01-SUBRC',
      },
      '2026-11-24T08:36:00Z',
    );
    expect(secondSign.campaigns[0].status).toBe('completed_verified');
    expect(secondSign.campaigns[0].completionRatePct).toBe(100);
    expect(readExecutiveTrainingCampaigns()[0].workerSignatureReceipts).toHaveLength(2);

    const seeded = seedMultiSiteOperationalSimulation('2026-11-24T08:40:00Z');
    const bundle = await buildNexusComplianceBundle({
      asOfDate: '2026-11-24',
      siteScopeLabel: '전사 3대 골조 포트폴리오',
      pipelineCases: seeded.cases,
      equipmentReports: seeded.equipmentReports,
      trainingCampaigns: secondSign.campaigns,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
    });

    expect(bundle.bundleId).toBe('PSI-SAPA-20261124');
    expect(bundle.embeddedPhotoCount).toBeGreaterThanOrEqual(1);
    expect(bundle.embeddedSignatureCount).toBe(2);
    expect(bundle.manifest.counts.handwrittenSignatures).toBe(2);
    // Standard PKZIP Local File Header signature 0x50 0x4B 0x03 0x04
    expect(bundle.zipBytes[0]).toBe(0x50);
    expect(bundle.zipBytes[1]).toBe(0x4b);
    expect(bundle.zipBytes[2]).toBe(0x03);
    expect(bundle.zipBytes[3]).toBe(0x04);

    // Formula neutralization check on raw uncompressed Store archive payload
    const archiveText = new TextDecoder('utf-8', { fatal: false }).decode(bundle.zipBytes);
    expect(archiveText).toContain('\t=NGUYEN');

    const emptyZip = buildStoreZipArchive([]);
    expect(emptyZip.length).toBe(22); // End of Central Directory only
  });
});
