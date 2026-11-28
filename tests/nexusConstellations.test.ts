import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NEXUS_CONSTELLATIONS_BY_KEY,
  getNodeConstellation,
  type NexusConstellationAnimationKind,
} from '../utils/nexusConstellations';
import { NEXUS_ORBIT_LAYERS, NEXUS_SPHERE_NODES_BY_LAYER } from '../utils/nexusSphereProjection';

const readText = (relPath: string): string =>
  readFileSync(resolve(process.cwd(), relPath), 'utf8').replace(/\r\n/g, '\n');

describe('SafetyNexus Per-Node Constellations & Tailored Kinetic Animations', () => {
  it('assigns a unique, valid astronomical constellation to all 21 nodes across all 3 layers', () => {
    const seenKoNames = new Set<string>();
    const seenAnimKinds = new Set<NexusConstellationAnimationKind>();

    let totalNodes = 0;
    for (const layer of NEXUS_ORBIT_LAYERS) {
      for (const node of NEXUS_SPHERE_NODES_BY_LAYER[layer.id]) {
        totalNodes += 1;
        const c = getNodeConstellation(layer.id, node.index);
        expect(c.key).toBe(`${layer.id}-${node.index}`);
        expect(NEXUS_CONSTELLATIONS_BY_KEY[c.key]).toBeDefined();
        expect(c.koName.trim().length).toBeGreaterThan(0);
        expect(c.latinName.trim().length).toBeGreaterThan(0);
        expect(c.symbolism.trim().length).toBeGreaterThan(0);
        expect(c.stars.length).toBeGreaterThanOrEqual(4);
        expect(c.edges.length).toBeGreaterThanOrEqual(4);

        for (const [a, b] of c.edges) {
          expect(a).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThan(c.stars.length);
          expect(b).toBeGreaterThanOrEqual(0);
          expect(b).toBeLessThan(c.stars.length);
          expect(a).not.toBe(b);
        }

        expect(seenKoNames.has(c.koName)).toBe(false);
        seenKoNames.add(c.koName);
        seenAnimKinds.add(c.animationKind);
      }
    }

    expect(totalNodes).toBe(21);
    expect(seenKoNames.size).toBe(21);
    expect(seenAnimKinds.size).toBe(6);
  });

  it('wires u_animMode kinetic personality modes and 3D spherical constellations into NexusWebGLCore', () => {
    const webgl = readText('pages/NexusWebGLCore.tsx');
    expect(webgl).toContain('uniform float u_animMode;');
    expect(webgl).toContain('animationMode = 0');
    expect(webgl).toContain('modeShimmer');
    expect(webgl).toContain('animModeRef.current');
    expect(webgl).toContain('isConstEdge');
    expect(webgl).toContain('isConstStar');
    expect(webgl).toContain('constellationStars');
    expect(webgl).toContain('constellationEdges');
  });

  it('embeds 3D WebGL constellations, horology engraving badge, and hairline crest in SafetyNexus', () => {
    const tsx = readText('pages/SafetyNexus.tsx');
    expect(tsx).toContain('constellationStars={activeConstellation.stars}');
    expect(tsx).toContain('constellationEdges={activeConstellation.edges}');
    expect(tsx).toContain('nexus-constellation-engrave');
    expect(tsx).toContain('nexus-constellation-crest');
    expect(tsx).toContain('nexus-mini-constellation');
    expect(tsx).toContain('getNodeConstellation');
    expect(tsx).toContain('animationMode={activeConstellation.animModeIndex}');
  });

  it('defines horology constellation crest animations and motion-paused/reduced guards in CSS', () => {
    const css = readText('pages/SafetyNexus.css');
    for (const kf of ['nexusConstellationDraw', 'nexusStarTwinkle']) {
      expect(css).toContain(`@keyframes ${kf}`);
    }
    expect(css).toContain('.safety-nexus[data-motion-paused="true"] .nexus-mini-constellation *');
    expect(css).toContain('.safety-nexus[data-reduced-motion="true"] .nexus-mini-constellation *');
    expect(css).toContain('.nexus-constellation-engrave');
    expect(css).toContain('.nexus-constellation-crest');
  });
});
