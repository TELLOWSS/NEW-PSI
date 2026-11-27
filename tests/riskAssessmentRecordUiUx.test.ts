import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readText = (relPath: string): string =>
  fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');

describe('Risk Assessment Record Sheet UI/UX redesign contracts', () => {
  const fileUploadTsx = readText('components/FileUpload.tsx');
  const detailModalTsx = readText('components/modals/RecordDetailModal.tsx');
  const ocrAnalysisTsx = readText('pages/OcrAnalysis.tsx');

  it('provides A4 camera framing guide, continuous multi-sheet capture, and status pills in FileUpload', () => {
    expect(fileUploadTsx).toContain('data-psi-camera-guide="a4-frame"');
    expect(fileUploadTsx).toContain('continuousCapture');
    expect(fileUploadTsx).toContain('연속 촬영 ON');
    expect(fileUploadTsx).toContain('1안 · 2안 양식 자동 판별');
    expect(fileUploadTsx).toContain('분석 가능');
    expect(fileUploadTsx).toContain('원본 확인 필요');
    expect(fileUploadTsx).toContain('다시 촬영 필요');
  });

  it('equips RecordDetailModal with interactive viewer controls, unified footer dock, and preserves required contracts', () => {
    expect(detailModalTsx).toContain('data-psi-doc-viewer-toolbar="true"');
    expect(detailModalTsx).toContain('docZoom');
    expect(detailModalTsx).toContain('docRotation');
    expect(detailModalTsx).toContain('docHighContrast');
    expect(detailModalTsx).toContain('필기 대비');
    expect(detailModalTsx).toContain('화면 맞춤');

    expect(detailModalTsx).toContain('data-psi-detail-footer-dock="true"');
    expect(detailModalTsx).toContain('aria-label="검토 및 수정 사유 입력"');
    expect(detailModalTsx).toContain('① 판단 조정');
    expect(detailModalTsx).toContain('② 분석 근거');
    expect(detailModalTsx).toContain('③ 원문 비교·후속조치');

    // Contract preservation checks
    expect(detailModalTsx).toContain('h-[100dvh] sm:h-[95dvh]');
    expect(detailModalTsx).toContain("max-h-[38dvh]");
    expect(detailModalTsx.indexOf('eyebrow="원문 비교 검수"')).toBeLessThan(
      detailModalTsx.indexOf('data-psi-field-followup-tools="true"'),
    );
  });

  it('consolidates OcrAnalysis top workspace without breaking any start-guide, field-mode, or collapse-delete contracts', () => {
    expect(ocrAnalysisTsx).toContain('data-psi-screen="ocr-analysis"');
    expect(ocrAnalysisTsx).toContain('id="ocr-start-guide"');
    expect(ocrAnalysisTsx).toContain('data-mobile-proof="field-mode"');
    expect(ocrAnalysisTsx).toContain('id="ocr-operation-tools"');
    expect(ocrAnalysisTsx).toContain('id="new-ocr-capture-section"');
    expect(ocrAnalysisTsx).toContain('id="ocr-record-workspace"');

    // Unified header contains field-mode proof metrics and workflow mode switcher in one compact section
    const startIdx = ocrAnalysisTsx.indexOf('id="ocr-start-guide"');
    const toolsIdx = ocrAnalysisTsx.indexOf('id="ocr-operation-tools"');
    expect(startIdx).toBeGreaterThan(-1);
    expect(toolsIdx).toBeGreaterThan(startIdx);
    const unifiedTopBlock = ocrAnalysisTsx.slice(startIdx, toolsIdx);
    expect(unifiedTopBlock).toContain('data-mobile-proof="field-mode"');
    expect(unifiedTopBlock).toContain("openWorkflowDestination('new')");
    expect(unifiedTopBlock).toContain("openWorkflowDestination('records')");
  });
});
