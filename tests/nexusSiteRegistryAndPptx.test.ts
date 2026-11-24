import { beforeEach, describe, expect, it } from 'vitest';
import { buildExecutiveBriefingDeckSpec } from '../utils/nexusExecutivePptx';
import {
  buildMultiSitePortfolioMatrix,
  scopeNexusWorkspaceData,
  seedMultiSiteOperationalSimulation,
} from '../utils/nexusHqCommandLoop';
import {
  archiveManagedNexusSite,
  readManagedNexusSites,
  resetManagedNexusSites,
  upsertManagedNexusSite,
} from '../utils/nexusSiteRegistry';

describe('Dynamic Company Site Master Registry & CEO PPTX Deck Spec', () => {
  beforeEach(() => {
    resetManagedNexusSites();
  });

  it('adds a custom company construction site, reflects it in HQ matrix/scoping, and archives/restores safely', () => {
    const initial = readManagedNexusSites(false);
    expect(initial).toHaveLength(3);

    const { savedSite } = upsertManagedNexusSite(
      {
        siteName: '제4현장 인천 송도 물류센터 PC골조',
        shortLabel: '제4현장 · 송도 PC골조',
        focusZone: 'superstructure_std',
        focusProcess: 'gangform',
        managerName: '박안전 소장',
        registeredEquipment: ['타워크레인', '이동식 크레인·카고'],
      },
      '2026-11-24T09:00:00Z',
    );

    const activeAfterAdd = readManagedNexusSites(false);
    expect(activeAfterAdd).toHaveLength(4);
    expect(activeAfterAdd.some(s => s.siteId === savedSite.siteId)).toBe(true);

    const seeded = seedMultiSiteOperationalSimulation('2026-11-24T09:10:00Z');
    const matrix = buildMultiSitePortfolioMatrix(
      seeded.cases,
      seeded.visits,
      seeded.investigations,
      seeded.campaigns,
      '2026-11-24',
    );
    expect(matrix.some(m => m.siteId === savedSite.siteId)).toBe(true);

    const scopedField4 = scopeNexusWorkspaceData({
      workspaceRole: 'field',
      assignedFieldSiteId: savedSite.siteId,
      pipelineCases: seeded.cases,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
      equipmentReports: seeded.equipmentReports,
    });
    expect(scopedField4.effectiveSiteId).toBe(savedSite.siteId);
    expect(scopedField4.pipelineCases).toHaveLength(0);
    expect(scopedField4.equipmentReports).toHaveLength(0);

    archiveManagedNexusSite(savedSite.siteId, true, '2026-11-24T10:00:00Z');
    expect(readManagedNexusSites(false)).toHaveLength(3);
    expect(readManagedNexusSites(true)).toHaveLength(4);
  });

  it('builds a multi-slide CEO PowerPoint briefing specification with matrix & verified equipment photos', () => {
    const seeded = seedMultiSiteOperationalSimulation('2026-11-24T08:00:00Z');
    const matrix = buildMultiSitePortfolioMatrix(
      seeded.cases,
      seeded.visits,
      seeded.investigations,
      seeded.campaigns,
      '2026-11-24',
    );

    const spec = buildExecutiveBriefingDeckSpec({
      asOfDate: '2026-11-24',
      reporterLabel: '본사 CSO 안전보건실장',
      siteMatrix: matrix,
      pipelineCases: seeded.cases,
      equipmentReports: seeded.equipmentReports,
      visitPlans: seeded.visits,
      investigations: seeded.investigations,
      trainingCampaigns: seeded.campaigns,
    });

    expect(spec.deckId).toBe('CEO-PPTX-20261124');
    expect(spec.fileName.endsWith('.pptx')).toBe(true);
    expect(spec.totalSlides).toBeGreaterThanOrEqual(4);
    expect(spec.slides[0].kind).toBe('cover_kpi');
    expect(spec.slides[1].kind).toBe('site_matrix');
    expect(spec.slides[1].tableRows?.length).toBe(matrix.length);
    const gallerySlide = spec.slides.find(s => s.kind === 'equipment_gallery');
    expect(gallerySlide?.photoCards?.length).toBeGreaterThanOrEqual(1);
    expect(spec.slides[spec.slides.length - 1].kind).toBe('action_training');
  });
});
