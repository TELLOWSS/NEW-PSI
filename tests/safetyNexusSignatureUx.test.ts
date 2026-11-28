import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readText = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');

describe('SafetyNexus Option A Signature UX & Non-Redundant Terminology', () => {
  it('removes redundant 골조·형틀 phrasing across SafetyNexus views, projections, taxonomy, and executive boards', () => {
    const checkedFiles = [
      'pages/SafetyNexus.tsx',
      'utils/nexusSphereProjection.ts',
      'utils/nexusStructuralTaxonomy.ts',
      'utils/nexusQuickPipeline.ts',
      'utils/nexusHqCommandLoop.ts',
      'utils/nexusExecutiveBentoMetrics.ts',
      'utils/nexusExecutivePptx.ts',
      'utils/nexusExecutiveTrainingPipeline.ts',
      'components/shared/NexusExecutiveBentoBoard.tsx',
      'components/inspector/NexusHqCommandWorkbench.tsx',
      'components/inspector/InspectorNexus3AxisBridge.tsx',
      'components/inspector/InspectorQuickWorkspace.tsx',
      'components/dashboard/PrecisionOperationsBoard.tsx',
    ];

    for (const file of checkedFiles) {
      const text = readText(file);
      expect(text, `${file} should use 골조 without redundant 골조·형틀`).not.toContain('골조·형틀');
    }

    expect(readText('utils/nexusSphereProjection.ts')).toContain('형틀공정');
  });

  it('adds resonance click ripple uniform u_pulse with paused/reduced-motion guard in WebGL sphere core', () => {
    const webgl = readText('pages/NexusWebGLCore.tsx');
    expect(webgl).toContain('uniform float u_pulse;');
    expect(webgl).toContain('clickRipple');
    expect(webgl).toContain('pulseRef.current.started');
    expect(webgl).toContain('if (!paused && !reduced)');
  });

  it('links sphere nodes, constellation arcs, detail bridge, Quick Feature Dock, and tone-synced detail card', () => {
    const tsx = readText('pages/SafetyNexus.tsx');
    expect(tsx).toContain('renderNexusNodeGlyph');
    expect(tsx).toContain('nexus-constellation-arc');
    expect(tsx).toContain('nexus-tether-glow');
    expect(tsx).toContain('nexus-detail-bridge');
    expect(tsx).toContain('nexus-feature-dock');
    expect(tsx).toContain('nexus-dock-chip');
    expect(tsx).toContain('data-active-tone={selected.tone}');
  });

  it('styles back-hemisphere star beacons, light-mode observatory bezel, dock chips, and paused motion in CSS', () => {
    const css = readText('pages/SafetyNexus.css');
    expect(css).toContain('[data-front="false"]:not(.selected):not(:hover):not([data-hovered="true"]):not(:focus-visible)');
    expect(css).toContain('.nexus-feature-dock');
    expect(css).toContain('.nexus-dock-chip.is-selected');
    expect(css).toContain('.nexus-detail[data-active-tone]::before');
    expect(css).toContain('.safety-nexus[data-nexus-theme="light"] .nexus-stage:not(.is-flat)');
    expect(css).toContain('.safety-nexus[data-motion-paused="true"] .nexus-detail-bridge');
  });
});
