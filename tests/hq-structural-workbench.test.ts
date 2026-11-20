import { describe, expect, it } from 'vitest';
import { STRUCTURAL_PROCESSES } from '../components/hq/StructuralHQWorkbench';

describe('HQ structural workbench reference taxonomy', () => {
  it('keeps underground RC separate from AL form and general formwork', () => {
    const byId = Object.fromEntries(STRUCTURAL_PROCESSES.map((item) => [item.id, item]));
    expect(byId['underground-wall'].area).toBe('지하 RC');
    expect(byId['underground-slab'].area).toBe('지하 RC');
    expect(byId['formwork'].area).toBe('일반 형틀');
    expect(byId['alform'].area).toBe('지상 골조');
    expect(byId['formwork'].id).not.toBe(byId['alform'].id);
  });

  it('contains ten distinct structural processes with meaningful inspection and evidence controls', () => {
    expect(STRUCTURAL_PROCESSES).toHaveLength(10);
    expect(new Set(STRUCTURAL_PROCESSES.map((item) => item.id)).size).toBe(10);
    STRUCTURAL_PROCESSES.forEach((item) => {
      expect(item.hazards.length).toBeGreaterThanOrEqual(3);
      expect(item.inspection.length).toBeGreaterThanOrEqual(3);
      expect(item.evidence.length).toBeGreaterThanOrEqual(2);
      expect(item.title.trim().length).toBeGreaterThan(2);
    });
  });

  it('includes RC-specific temporary works and concrete lateral-pressure checks', () => {
    const underground = STRUCTURAL_PROCESSES.filter((item) => item.area === '지하 RC');
    const checks = underground.flatMap((item) => [...item.hazards, ...item.inspection]).join(' ');
    expect(checks).toContain('측압');
    expect(checks).toContain('동바리');
    expect(checks).toContain('흙막이');
    expect(checks).toContain('개구부');
  });
});
