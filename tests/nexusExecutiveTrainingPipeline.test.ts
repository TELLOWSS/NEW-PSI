import { beforeEach, describe, expect, it } from 'vitest';
import { assessConstructionTranslation } from '../utils/constructionTrainingTranslation';
import {
  NEXUS_CORE_12_LANGUAGES,
  buildExecutiveTrainingDraftFromSeed,
  readExecutiveTrainingCampaigns,
  recordExecutiveTrainingSignatureProgress,
  stageExecutiveTrainingHandoff,
  summarizeExecutiveTrainingForOrbitLayer,
  writeExecutiveTrainingCampaigns,
} from '../utils/nexusExecutiveTrainingPipeline';
import { NEXUS_STRUCTURAL_INCIDENT_SEEDS } from '../utils/nexusStructuralTaxonomy';

describe('Slice 3 · 04 Executive Multilingual Safety Training & 3D Sphere Completion Rate Feedback', () => {
  beforeEach(() => {
    writeExecutiveTrainingCampaigns([]);
  });

  it('generates a 5-stage Korean executive directive and 12-language native protective guidance from a 3D sphere seed', () => {
    const subRcSeed = NEXUS_STRUCTURAL_INCIDENT_SEEDS[0]; // RC-SUB-01
    const draft = buildExecutiveTrainingDraftFromSeed(subRcSeed, { targetWorkers: 15 });

    expect(draft.matchedCaseCode).toBe('RC-SUB-01');
    expect(draft.structuralNodeIndex).toBe('01');
    expect(draft.selectedLanguages).toHaveLength(12);

    // Must preserve 1~5 stages for translation quality verification
    for (const lang of NEXUS_CORE_12_LANGUAGES) {
      const text = draft.multilingualPreviews[lang];
      expect(text).toBeTruthy();
      const report = assessConstructionTranslation(
        draft.sourceTextKo,
        text,
        '작업중지 및 골조·형틀 보호조치 의미 보존 확인',
      );
      expect(report.sectionStructurePreserved).toBe(true);
    }
  });

  it('dispatches a 12-language campaign, records multilingual signatures, and feeds completion rates back to 3D sphere nodes', () => {
    const gangformSeed = NEXUS_STRUCTURAL_INCIDENT_SEEDS[2]; // GF-LIFT-03 (#03)
    const staged = stageExecutiveTrainingHandoff(gangformSeed, {
      targetWorkers: 10,
      dispatchImmediately: true,
    });

    expect(staged.status).toBe('dispatched_12lang');
    expect(staged.completionRatePct).toBe(0);

    // 4 Vietnamese workers + 6 Chinese workers sign
    recordExecutiveTrainingSignatureProgress(staged.campaignId, {
      addSignatures: 4,
      languageCode: 'vi-VN',
    });
    const mid = readExecutiveTrainingCampaigns()[0];
    expect(mid.confirmedSignatures).toBe(4);
    expect(mid.completionRatePct).toBe(40);
    expect(mid.participatingNationalities).toBe(1);

    const completed = recordExecutiveTrainingSignatureProgress(staged.campaignId, {
      addSignatures: 6,
      languageCode: 'cmn-CN',
    });
    expect(completed[0].confirmedSignatures).toBe(10);
    expect(completed[0].completionRatePct).toBe(100);
    expect(completed[0].participatingNationalities).toBe(2);
    expect(completed[0].status).toBe('completed_verified');

    // Verify 3D sphere node summaries across structural (#03), modules (#04), and cycle (#05)
    const structuralSummary = summarizeExecutiveTrainingForOrbitLayer('structural', completed);
    expect(structuralSummary[2].nodeIndex).toBe('03');
    expect(structuralSummary[2].averageCompletionRatePct).toBe(100);
    expect(structuralSummary[2].completedCampaigns).toBe(1);

    const moduleSummary = summarizeExecutiveTrainingForOrbitLayer('modules', completed);
    expect(moduleSummary[3].nodeIndex).toBe('04'); // 04 대표이사 안전교육
    expect(moduleSummary[3].averageCompletionRatePct).toBe(100);
  });
});
