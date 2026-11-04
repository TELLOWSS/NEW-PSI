import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { newInspectionDocument, type Inspection, type VisionImport } from '../lib/inspector/types';
import { resultJourney } from '../lib/inspector/resultJourney';
import { DEFAULT_REVIEW_NOTE } from '../lib/inspector/expertReview';

const inspection = (analysis = false): Inspection => {
    const doc = newInspectionDocument();
    doc.photoIds = ['photo-a'];
    if (analysis) {
        doc.analyses['photo-a'] = {
            photo_id: 'photo-a', requires_confirmation: [], risk_findings: [], recommended_controls: [],
        } as unknown as VisionImport;
    }
    return { id: 'synthetic-inspection', revision: 2, created_at: '', updated_at: '', document: doc };
};
const options = { notesMatch: true, analysisViewed: true, review: { decision: 'accepted' as const, note: '' }, hasDraft: false };

describe('PSI R107–R110 photo-to-report clarity and hard safety boundaries', () => {
    it('makes the no-AI report the primary action without inventing a completed corrective action', () => {
        const record = inspection();
        const frozen = JSON.stringify(record);
        const next = resultJourney(record, 'photo-a', options);
        expect(next).toMatchObject({ action: 'report', label: '사진·설명으로 보고서 작성',
            secondary: { action: 'draft-action', label: '조치 작성 (선택)' }, linked: 0 });
        expect(next?.description).toContain('조치는 아직 미등록 상태');
        expect(JSON.stringify(record)).toBe(frozen);
        expect(record.document.actions).toEqual([]);
        expect(record.document.reviews).toEqual({});
    });

    it('does NOT offer one-click report for an unreviewed AI analysis or an uncommitted action draft', () => {
        const unreviewed = inspection(true);
        expect(resultJourney(unreviewed, 'photo-a', options)?.action).toBe('save-review');
        expect(resultJourney(unreviewed, 'photo-a', { ...options, analysisViewed: false })?.action).toBe('view-stored');
        const reviewed = inspection(true);
        reviewed.document.reviews['photo-a'] = { decision: 'accepted', note: DEFAULT_REVIEW_NOTE };
        expect(resultJourney(reviewed, 'photo-a', { ...options, hasDraft: true })?.action).toBe('return-draft');
        expect(resultJourney(reviewed, 'photo-a', { ...options, notesMatch: false })?.action).toBe('edit-input');
    });

    it('makes report progress visible instead of hiding every stage behind a disclosure', () => {
        const source = readFileSync('components/inspector/InspectorResultJourney.tsx', 'utf8');
        expect(source).toContain('data-psi-report-journey="true"');
        expect(source).toContain('보고서까지 · 지금 할 일 하나');
        expect(source).toContain('className="si-journey-steps"');
        expect(source).toContain('journey.reviewStatus');
        expect(source).toContain('journey.actionStatus');
        expect(source).toContain('journey.reportStatus');
    });

    it('sets a human-readable field brief as default but preserves full stored report and its legal caveats', () => {
        const source = readFileSync('components/inspector/InspectorReport.tsx', 'utf8');
        expect(source).toContain("useState<'brief'|'full'>('brief')");
        expect(source).toContain('data-psi-inspector-report-view="true"');
        expect(source).toContain('data-psi-inspector-field-brief="true"');
        expect(source).toContain('data-psi-inspector-full-evidence="true"');
        expect(source).toContain('상세 근거 전체 보기');
        expect(source).toContain('AI가 없는 사진은 자동 판독하지 않은 기록');
        expect(source).toContain('등록된 개선조치가 없습니다. 조치가 완료됐다는 뜻이 아닙니다.');
        expect(source).toContain('report.snapshot_sha256');
        expect(source).toContain('InspectorLegalResult');
    });

    it('hides only screen-level detailed evidence, never the full print evidence or photos', () => {
        const css = readFileSync('components/inspector/inspector-quick.css', 'utf8');
        expect(css).toContain('@media screen {\n  .si-report-mode-brief .si-report-full-only{display:none!important}');
        expect(css).toContain('@media print {\n  .si-report-view-controls,.si-report-field-brief{display:none!important}');
        expect(css).toContain('.si-report .si-report-full-only{display:block!important}');
        const report = readFileSync('components/inspector/InspectorReport.tsx', 'utf8');
        expect(report).toContain('photoState');
        expect(report).toContain('사진 준비 중 · 완료 후 인쇄 가능');
    });

    it('distinguishes offline local photo saving from optional reinspection reporting', () => {
        const source = readFileSync('components/inspector/InspectorLocalDraft.tsx', 'utf8');
        expect(source).toContain('data-psi-local-report-path="true"');
        expect(source).toContain('사진 1장을 저장했다고 재점검 보고서가 자동 생성되지는 않습니다');
        expect(source).toContain('id="si-local-recheck-report"');
        expect(source).toContain('재점검 경과보고서 · 필요할 때만');
        expect(source).toContain('서버 업로드·자동 발송 없이');
    });
});
