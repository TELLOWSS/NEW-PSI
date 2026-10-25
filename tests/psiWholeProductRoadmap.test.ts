import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import roadmap from '../config/psi-product-upgrade-roadmap.json';
import roster from '../config/psi-company-agent-roster.json';

describe('PSI whole-product roadmap contract', () => {
    const owners = new Set(roster.departments.map(department => department.id));
    const streams = roadmap.streams;

    it('covers the full NEW-PSI core without merging standalone products', () => {
        expect(roadmap.product).toBe('NEW-PSI');
        expect(streams).toHaveLength(9);
        expect(new Set(streams.map(item => item.id)).size).toBe(streams.length);
        expect(roadmap.independentProducts).toContain('SMART TBM');
        expect(roadmap.independentProducts).toContain('PSI : ZERO DAY');
        expect(streams.map(item => item.id)).toEqual(expect.arrayContaining([
            'field-entry', 'risk-original', 'inspection', 'six-signals',
            'language-training', 'corrective-loop', 'reports',
            'security', 'mobile-performance',
        ]));
    });

    it('makes every delivery auditable instead of presenting a plan as verified', () => {
        for (const stream of streams) {
            expect(['P0', 'P1', 'P2']).toContain(stream.priority);
            expect(['first-change', 'review-needed', 'queued']).toContain(stream.phase);
            expect(owners.has(stream.owner)).toBe(true);
            expect(stream.review.length).toBeGreaterThan(0);
            expect(stream.review.every(owner => owners.has(owner) && owner !== stream.owner)).toBe(true);
            expect(stream.scope.trim().length).toBeGreaterThan(14);
            expect(stream.implemented.trim().length).toBeGreaterThan(14);
            expect(stream.next.trim().length).toBeGreaterThan(14);
            expect(stream.acceptance.trim().length).toBeGreaterThan(14);
        }
        expect(streams.filter(item => item.phase === 'review-needed').map(item=>item.id)).toContain('security');
        expect(streams.every(item => item.phase !== 'verified')).toBe(true);
    });

    it('connects the basic work board and management panel to real destinations', () => {
        const dashboard = readFileSync('components/dashboard/PrecisionOperationsBoard.tsx', 'utf8');
        const company = readFileSync('components/management/PsiCompanyAuditPanel.tsx', 'utf8');
        expect(dashboard).toContain("page: 'safety-inspector'");
        expect(dashboard).toContain("page: 'predictive-analysis'");
        expect(dashboard).toContain("page: 'education-return'");
        expect(dashboard).toContain('새 AI 호출 없음');
        expect(company).toContain('data-psi-upgrade-stream');
        expect(company).toContain('최종검증 전');
        expect(company).toContain('psi-product-upgrade-roadmap.json');
    });
});
