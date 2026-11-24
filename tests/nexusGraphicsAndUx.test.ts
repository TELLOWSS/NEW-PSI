import { describe, expect, it } from 'vitest';
import { buildRoleScopedCommands } from '../utils/nexusCommandPalette';
import { readManagedNexusSites, resetManagedNexusSites } from '../utils/nexusSiteRegistry';

describe('Role-Scoped Command Palette & Visual UX Registry', () => {
  it('strictly excludes HQ BI, PPTX, SAPA ZIP, and other sites when workspaceRole is field', () => {
    resetManagedNexusSites();
    const sites = readManagedNexusSites(false);

    const fieldCommands = buildRoleScopedCommands({
      workspaceRole: 'field',
      managedSites: sites,
    });

    const ids = fieldCommands.map(c => c.id);
    expect(ids).not.toContain('hq-export-pptx');
    expect(ids).not.toContain('hq-export-zip');
    expect(ids).not.toContain('hq-view-bi');
    expect(ids.some(id => id.startsWith('hq-site-'))).toBe(false);
    expect(ids).toContain('field-tab-inspect');
    expect(ids).toContain('field-tab-training');
  });

  it('includes HQ executive PPTX, SAPA ZIP, and dynamic company sites when workspaceRole is hq and filters by Korean query', () => {
    resetManagedNexusSites();
    const sites = readManagedNexusSites(false);

    const pptxMatches = buildRoleScopedCommands({
      workspaceRole: 'hq',
      managedSites: sites,
      query: 'PPTX 대표이사',
    });
    expect(pptxMatches.map(c => c.id)).toContain('hq-export-pptx');

    const siteMatches = buildRoleScopedCommands({
      workspaceRole: 'hq',
      managedSites: sites,
      query: '제2현장',
    });
    expect(siteMatches.map(c => c.id)).toContain('hq-site-SITE-02-GANGFORM');
  });

  it('enriches command palette badges with live pending queue counts while keeping field isolation', () => {
    resetManagedNexusSites();
    const sites = readManagedNexusSites(false);

    const hqCommands = buildRoleScopedCommands({
      workspaceRole: 'hq',
      managedSites: sites,
      pendingCounts: {
        stopWork: 2,
        equipmentPending: 3,
        investigationPending: 1,
        unackedVisits: 4,
        offlinePending: 5,
      },
    });
    expect(hqCommands.find(c => c.id === 'hq-tab-equip')?.badge).toBe('검토대기 3건');
    expect(hqCommands.find(c => c.id === 'hq-tab-stopwork')?.badge).toBe('작업중지 2건');
    expect(hqCommands.find(c => c.id === 'common-sync-queue')?.badge).toBe('미전송 5건');

    const fieldCommands = buildRoleScopedCommands({
      workspaceRole: 'field',
      managedSites: sites,
      pendingCounts: {
        stopWork: 1,
        fieldRevision: 2,
        incompleteTraining: 3,
      },
    });
    expect(fieldCommands.find(c => c.id === 'field-tab-equip')?.badge).toBe('보완 2건');
    expect(fieldCommands.find(c => c.id === 'field-tab-training')?.badge).toBe('미이수 3건');
    expect(fieldCommands.some(c => c.id.startsWith('hq-'))).toBe(false);
  });
});
