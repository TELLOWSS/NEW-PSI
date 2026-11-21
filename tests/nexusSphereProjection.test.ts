import { describe, expect, it } from 'vitest';
import {
  NEXUS_ORBIT_LAYERS,
  NEXUS_SPHERE_NODES_BY_LAYER,
  computeTargetAnglesForLatLon,
  formatSphericalCoord,
  latLonToUnitVec3,
  projectNodeToStage,
  rotateVec3YawPitch,
  shortestAngleDelta,
  shortestAngleStep,
} from '../utils/nexusSphereProjection';
import {
  NEXUS_STRUCTURAL_INCIDENT_SEEDS,
  buildOrbitLayerLiveSignals,
  filterStructuralIncidentSeeds,
} from '../utils/nexusStructuralTaxonomy';
import type { WorkerRecord } from '../types';

describe('Safety Nexus 3D spherical projection & multi-layer orbit model', () => {
  it('defines 3 orbit layers with 5 cycle nodes, 6 core module nodes, and 10 structural/substructure RC nodes', () => {
    expect(NEXUS_ORBIT_LAYERS.map(l => l.id)).toEqual(['cycle', 'modules', 'structural']);
    expect(NEXUS_SPHERE_NODES_BY_LAYER.cycle).toHaveLength(5);
    expect(NEXUS_SPHERE_NODES_BY_LAYER.modules).toHaveLength(6);
    expect(NEXUS_SPHERE_NODES_BY_LAYER.structural).toHaveLength(10);

    // Ensure Q4 in cycle preserves exact contract text and action
    const q4 = NEXUS_SPHERE_NODES_BY_LAYER.cycle[3];
    expect(q4.title).toBe('안전조치');
    expect(q4.detail).toMatch(/즉시 조치|임시 보호조치|재점검/);
    expect(q4.action).toBe('안전조치 현황 열기');

    // Ensure substructure RC is separated as #01 in structural layer
    const rc = NEXUS_SPHERE_NODES_BY_LAYER.structural[0];
    expect(rc.title).toBe('지하 RC구조물');
    expect(rc.categoryBadge).toContain('지하 RC');
    expect(rc.checkpoints.length).toBeGreaterThanOrEqual(3);
  });

  it('rotates any selected node into the front focal hemisphere (depthZ > 0.85, isFront = true)', () => {
    for (const layer of NEXUS_ORBIT_LAYERS) {
      for (const node of NEXUS_SPHERE_NODES_BY_LAYER[layer.id]) {
        const target = computeTargetAnglesForLatLon(node.latDeg, node.lonDeg);
        const unit = latLonToUnitVec3(node.latDeg, node.lonDeg);
        const [, , rz] = rotateVec3YawPitch(unit, target.yaw, target.pitch);
        expect(rz).toBeGreaterThan(0.85);

        const projected = projectNodeToStage(node.latDeg, node.lonDeg, target.yaw, target.pitch);
        expect(projected.isFront).toBe(true);
        expect(projected.depthZ).toBeGreaterThan(0.85);
        // Never overlap the sacred central PSI emblem box at (50%, 50%)
        const clearOfPsiDesktop =
          Math.abs(projected.leftPct - 50) >= 24.5 || Math.abs(projected.topPct - 50) >= 15.5;
        expect(clearOfPsiDesktop).toBe(true);

        const projectedMobile = projectNodeToStage(node.latDeg, node.lonDeg, target.yaw, target.pitch, {
          isMobile: true,
        });
        const clearOfPsiMobile =
          Math.abs(projectedMobile.leftPct - 50) >= 33.5 || Math.abs(projectedMobile.topPct - 50) >= 18.5;
        expect(clearOfPsiMobile).toBe(true);
      }
    }
  });

  it('clamps projected stage coordinates within overflow-safe bounds on mobile and desktop', () => {
    const sampleAngles = [-Math.PI, -1.2, 0, 0.9, Math.PI];
    for (const yaw of sampleAngles) {
      for (const pitch of [-0.7, 0, 0.7]) {
        for (const node of NEXUS_SPHERE_NODES_BY_LAYER.structural) {
          const mobileProj = projectNodeToStage(node.latDeg, node.lonDeg, yaw, pitch, { isMobile: true });
          expect(mobileProj.leftPct).toBeGreaterThanOrEqual(22);
          expect(mobileProj.leftPct).toBeLessThanOrEqual(78);
          expect(mobileProj.topPct).toBeGreaterThanOrEqual(15);
          expect(mobileProj.topPct).toBeLessThanOrEqual(83);

          const desktopProj = projectNodeToStage(node.latDeg, node.lonDeg, yaw, pitch, { isMobile: false });
          expect(desktopProj.leftPct).toBeGreaterThanOrEqual(15);
          expect(desktopProj.leftPct).toBeLessThanOrEqual(85);
          expect(desktopProj.topPct).toBeGreaterThanOrEqual(15);
          expect(desktopProj.topPct).toBeLessThanOrEqual(83);
        }
      }
    }
  });

  it('interpolates along the shortest angular arc across the -PI/PI boundary', () => {
    const delta = shortestAngleDelta(Math.PI - 0.1, -Math.PI + 0.1);
    expect(delta).toBeCloseTo(0.2, 5);
    const stepped = shortestAngleStep(Math.PI - 0.1, -Math.PI + 0.1, 0.5);
    expect(Math.abs(stepped)).toBeCloseTo(Math.PI, 4);
  });

  it('formats spherical coordinates cleanly for HUD display', () => {
    expect(formatSphericalCoord(28, -52)).toBe('28°N · 052°W');
    expect(formatSphericalCoord(-36, 0)).toBe('36°S · 000°E');
  });

  it('links 3-axis structural incident seeds and loaded records to sphere nodes', () => {
    expect(NEXUS_STRUCTURAL_INCIDENT_SEEDS).toHaveLength(10);
    const subRcSeeds = filterStructuralIncidentSeeds({
      zoneAxis: 'substructure_rc',
      processAxis: '',
      hazardEquipmentAxis: '',
    });
    expect(subRcSeeds.length).toBeGreaterThanOrEqual(2);
    expect(subRcSeeds[0].caseCode).toBe('RC-SUB-01');

    const records = [
      {
        id: 'rec-rc-1',
        date: '2026-11-10',
        jobField: '지하 형틀',
        selfAssessedRiskLevel: '상',
        riskFollowupEvents: [
          {
            id: 'ev-1',
            caseId: 'case-1',
            questionNumber: 1,
            status: 'scheduled',
            dueDate: '2026-11-05',
            timestamp: '2026-11-01T09:00:00Z',
          },
        ],
      },
    ] as unknown as WorkerRecord[];

    const signals = buildOrbitLayerLiveSignals(
      'structural',
      records,
      { zoneAxis: 'substructure_rc', processAxis: '', hazardEquipmentAxis: '' },
      '2026-11-15',
    );
    expect(signals).toHaveLength(10);
    expect(signals[0].nodeIndex).toBe('01');
    expect(signals[0].matchesAxisFilter).toBe(true);
    expect(signals[0].matchedRecords).toBe(1);
    expect(signals[0].highSelfRisk).toBe(1);
    expect(signals[0].unresolvedActions).toBe(1);
    expect(signals[0].overdueActions).toBe(1);
  });
});
