import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { A4_SCRIPT_SAMPLES, inspectA4FontPreflight } from '../utils/educationA4FontPreflight';
import { A4_LANGUAGE_POLICIES } from '../utils/a4LanguagePolicy';

describe('PSI R92–R94 A4 multilingual font and stalled-capture preflight', () => {
    it('covers every supported A4 print language with an actual script sample', () => {
        for (const code of Object.keys(A4_LANGUAGE_POLICIES)) {
            const review = inspectA4FontPreflight(code, []);
            expect(review.sample.length, code).toBeGreaterThan(2);
            expect(review.humanReviewRequired, code).toBe(true);
            expect(review.language).toBe(code);
            expect(A4_SCRIPT_SAMPLES[code]).toBeDefined();
        }
        expect(inspectA4FontPreflight('cmn-CN', []).family).toBe('Noto Sans SC');
        expect(inspectA4FontPreflight('my-MM', []).sample).toContain('က');
        expect(inspectA4FontPreflight('km-KH', []).sample).toContain('ក');
        expect(inspectA4FontPreflight('ur-PK', []).sample).toContain('ا');
    });

    it('does not present system fallback, missing browser font APIs, or a loading face as proof of proper rendering', () => {
        expect(inspectA4FontPreflight('my-MM', null).level).toBe('unknown');
        expect(inspectA4FontPreflight('my-MM', []).level).toBe('fallback');
        expect(inspectA4FontPreflight('my-MM', [{ family: 'Noto Sans Myanmar', status: 'loading' }]).level).toBe('loading');
        expect(inspectA4FontPreflight('my-MM', [{ family: 'Noto Sans Myanmar', status: 'loaded' }]).level).toBe('loaded');
        const ready = inspectA4FontPreflight('km-KH', [{ family: '"Noto Sans Khmer"', status: 'loaded' }]);
        expect(ready.humanReviewRequired).toBe(true);
        expect(ready.detail).toContain('검증된 것은 아닙니다');
        expect(inspectA4FontPreflight('my-MM', [{ family: 'Noto Sans Myanmar', status: 'loaded' }], true).level).toBe('loading');
    });

    it('exposes clear per-language review controls in the A4 output studio', () => {
        const studio = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(studio).toContain('data-psi-a4-font-preflight="true"');
        expect(studio).toContain('data-psi-a4-font-result={fontPreflight.level}');
        expect(studio).toContain('현재 언어 글꼴 점검');
        expect(studio).toContain('자음 결합');
        expect(studio).toContain('setFontPreflight(null)');
        expect(studio).toContain('assetTimeoutMs: 3_000');
        const capture = readFileSync('utils/pdfCapture.ts', 'utf8');
        expect(capture).toContain('assetTimeoutMs?: number');
        expect(capture).toContain('await waitForImages(root, assetTimeoutMs)');
        expect(capture).toContain('window.setTimeout(() => done(false), timeoutMs)');
        expect(capture).toContain('A4 이미지가 준비되지 않았습니다');
    });
});
