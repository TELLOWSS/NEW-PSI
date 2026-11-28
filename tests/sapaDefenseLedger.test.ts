import { beforeEach, describe, expect, it } from 'vitest';
import { buildNexusComplianceBundle } from '../utils/nexusComplianceBundle';
import { seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';
import {
  SAPA_APPROVAL_PRESETS,
  SAPA_DEFENSE_CARD_SPECS,
  advanceApprovalStepOnCard,
  applyApprovalPresetToCard,
  applyCeoDirectiveAndSealCard,
  hydrateSapaDefenseMatrix,
  readSapaGovernanceMode,
  resetSapaDefenseStore,
  seedSapaDefensePortfolio,
  updateCardApprovalSteps,
  upsertSapaDefenseCardRecord,
  writeSapaGovernanceMode,
} from '../utils/sapaDefenseLedger';

describe('SAPA Legal Defense Card Engine, Dynamic Approval Lines & ERP Bridge', () => {
  beforeEach(() => {
    resetSapaDefenseStore();
  });

  it('defines 9 distinct Article 4 defense cards and 4 approval line presets by document nature', () => {
    expect(SAPA_DEFENSE_CARD_SPECS).toHaveLength(9);
    const ids = new Set(SAPA_DEFENSE_CARD_SPECS.map(s => s.cardId));
    expect(ids.size).toBe(9);
    expect(Object.keys(SAPA_APPROVAL_PRESETS)).toEqual([
      'site_authority',
      'hq_safety_review',
      'hq_budget_review',
      'ceo_mandatory',
    ]);
  });

  it('supports switching between Stage 1 (erp_bridge) and Stage 2 (psi_native) plus structured/custom ERP fields', async () => {
    expect(readSapaGovernanceMode()).toBe('erp_bridge');
    const seeded = await seedSapaDefensePortfolio('2026-11-28', '2026-11-28T09:00:00Z');
    expect(seeded.length).toBeGreaterThanOrEqual(27);

    const site1Card3 = seeded.find(r => r.siteId === 'SITE-01-SUBRC' && r.cardId === 'CARD-03')!;
    expect(site1Card3.erpBridge.erpDocNo).toContain('ERP-202611-03');
    expect(site1Card3.erpBridge.erpCustomFields.length).toBeGreaterThanOrEqual(1);
    expect(site1Card3.sealHash.length).toBeGreaterThanOrEqual(16);

    const switched = applyApprovalPresetToCard(site1Card3, 'hq_budget_review', '2026-11-28T10:00:00Z');
    expect(switched.approvalSteps).toHaveLength(4);
    expect(switched.sealHash).toBe('');

    const customSteps = updateCardApprovalSteps(
      switched,
      [
        ...switched.approvalSteps,
        {
          stepOrder: 5,
          roleCode: 'custom',
          roleLabel: '외부 기술검토자',
          status: 'pending',
          actorName: '',
          actedAt: '',
          note: '',
        },
      ],
      '2026-11-28T10:05:00Z',
    );
    expect(customSteps.approvalSteps).toHaveLength(5);

    upsertSapaDefenseCardRecord({
      ...customSteps,
      erpBridge: {
        ...customSteps.erpBridge,
        erpCostCenter: 'CC-CUSTOM-99',
        erpCustomFields: [{ key: 'WBS_CD', label: '공종 WBS', value: 'RC-B2-CORE' }],
      },
    });

    writeSapaGovernanceMode('psi_native');
    const matrix = hydrateSapaDefenseMatrix({ asOfDate: '2026-11-28' });
    expect(matrix.mode).toBe('psi_native');
    const target = matrix.cards.find(c => c.recordKey === customSteps.recordKey)!;
    expect(target.erpBridge.erpCostCenter).toBe('CC-CUSTOM-99');
    expect(target.erpBridge.erpCustomFields[0].value).toBe('RC-B2-CORE');
    expect(target.signal).not.toBe('green');
  });

  it('progresses dynamic approval steps, applies CEO directive sealing, and packages Article 4 folders into SAPA Compliance ZIP', async () => {
    const sim = seedMultiSiteOperationalSimulation('2026-11-28T08:00:00Z');
    await seedSapaDefensePortfolio('2026-11-28', '2026-11-28T09:00:00Z');
    const before = hydrateSapaDefenseMatrix({ asOfDate: '2026-11-28', ...sim });

    const pendingCard = before.cards.find(c => c.siteId === 'SITE-02-GANGFORM' && c.cardId === 'CARD-04')!;
    const afterStep = await advanceApprovalStepOnCard(pendingCard, {
      stepOrder: pendingCard.approvalSteps.length,
      decision: 'approved',
      actorName: '대표이사',
      note: '예산 즉시 집행 승인',
      nowIso: '2026-11-28T11:00:00Z',
    });
    expect(afterStep.sealHash.length).toBeGreaterThanOrEqual(16);

    const revTarget = before.cards.find(c => c.siteId === 'SITE-03-SHORING' && c.cardId === 'CARD-03')!;
    const sealed = await applyCeoDirectiveAndSealCard(revTarget, {
      directiveType: 'budget_support',
      directiveNote: '시스템동바리 추가 가새 예산 즉시 승인',
      actorName: '대표이사',
      nowIso: '2026-11-28T11:05:00Z',
    });
    expect(sealed.sealHash.length).toBeGreaterThanOrEqual(16);

    const updatedMatrix = hydrateSapaDefenseMatrix({ asOfDate: '2026-11-28', ...sim });
    const bundle = await buildNexusComplianceBundle({
      asOfDate: '2026-11-28',
      pipelineCases: sim.cases,
      equipmentReports: sim.equipmentReports,
      trainingCampaigns: sim.campaigns,
      visitPlans: sim.visits,
      investigations: sim.investigations,
      defenseCards: updatedMatrix.cards,
      governanceMode: 'erp_bridge',
    });

    const paths = bundle.manifest.files.map(f => f.name);
    expect(paths).toContain('05_시행령4조_9대방어카드_이행대장.csv');
    expect(paths).toContain('06_ERP특정항목_연계_및_결재로그.csv');
    expect(paths.some(p => p.startsWith('sapa_cards/03_시행령4조3호_위험성평가개선/'))).toBe(true);
    expect(paths.some(p => p.startsWith('sapa_cards/09_대표이사_보고결재_지시이력/'))).toBe(true);
  });
});
