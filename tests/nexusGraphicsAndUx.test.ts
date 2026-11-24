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
});
