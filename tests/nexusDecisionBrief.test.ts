import { describe, expect, it } from 'vitest';
import {
  buildNexusDecisionBrief,
  getAllowedDecisionPersonas,
} from '../utils/nexusDecisionBrief';
import { seedMultiSiteOperationalSimulation } from '../utils/nexusHqCommandLoop';

describe('Mobile Decision-First Brief (So What · Why · How · Outcome)', () => {
  it('restricts field authority from accessing executive persona while allowing HQ executive view', () => {
    expect(getAllowedDecisionPersonas('hq')).toEqual(['executive', 'site_director']);
    expect(getAllowedDecisionPersonas('field')).toEqual(['field_manager', 'site_director']);

    const seeded = seedMultiSiteOperationalSimulation('2026-11-25T09:00:00Z');
    const clampedField = buildNexusDecisionBrief({
      workspaceRole: 'field',
      persona: 'executive',
      scopeLabel: '제1현장 · 지하 2층 RC구간',
      pipelineCases: seeded.cases,
      equipmentReports: seeded.equipmentReports,
      trainingCampaigns: seeded.campaigns,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
    });

    expect(clampedField.persona).toBe('field_manager');
    expect(clampedField.howActions.some(a => a.targetAction === 'open_ceo_briefing')).toBe(false);
    expect(clampedField.howActions.some(a => a.targetAction === 'export_pptx')).toBe(false);
  });

  it('builds concrete 4-stage outcomes across executive, site_director, and field_manager personas without developer jargon', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-25T09:00:00Z');
    const forbidden = ['SLICE', '매니페스트', '텔레메트리', '파이프라인', '커맨드 팔레트', 'Diff'];

    for (const roleSpec of [
      { role: 'hq' as const, persona: 'executive' as const },
      { role: 'hq' as const, persona: 'site_director' as const },
      { role: 'field' as const, persona: 'field_manager' as const },
    ]) {
      const vm = buildNexusDecisionBrief({
        workspaceRole: roleSpec.role,
        persona: roleSpec.persona,
        scopeLabel: roleSpec.role === 'hq' ? '전사 통합 3개 현장' : '제1현장 · 지하 2층 RC',
        pipelineCases: seeded.cases,
        equipmentReports: seeded.equipmentReports,
        trainingCampaigns: seeded.campaigns,
        visitPlans: seeded.visits,
        investigations: seeded.investigations,
      });

      expect(vm.soWhatHeadline.length).toBeGreaterThan(8);
      expect(vm.whyReasons.length).toBeGreaterThanOrEqual(1);
      expect(vm.howActions.length).toBeGreaterThanOrEqual(3);
      expect(vm.outcomeMetrics).toHaveLength(3);

      const combined = `${vm.soWhatHeadline} ${vm.soWhatSubline} ${vm.whyReasons.map(r => r.summary).join(' ')} ${vm.howActions.map(a => a.label).join(' ')} ${vm.outcomeProofLine}`;
      for (const term of forbidden) {
        expect(combined).not.toContain(term);
      }
    }
  });

  it('raises critical signal immediately when revision_requested_hq equipment exists for field manager', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-25T09:00:00Z');
    const revisedEquip = seeded.equipmentReports.map((eq, idx) =>
      idx === 0
        ? {
            ...eq,
            status: 'revision_requested_hq' as const,
            hqReviewNote: '아웃트리거 깔목 근접 재촬영 필요',
          }
        : eq,
    );

    const vm = buildNexusDecisionBrief({
      workspaceRole: 'field',
      persona: 'field_manager',
      scopeLabel: '제1현장',
      pipelineCases: seeded.cases,
      equipmentReports: revisedEquip,
      trainingCampaigns: seeded.campaigns,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
    });

    expect(vm.signalLevel).toBe('critical');
    expect(vm.whyReasons.some(r => r.summary.includes('아웃트리거 깔목 근접 재촬영'))).toBe(true);
    expect(vm.howActions.find(a => a.targetAction === 'open_equip_upload')?.label).toContain('보완 사진 재촬영');
  });
});
