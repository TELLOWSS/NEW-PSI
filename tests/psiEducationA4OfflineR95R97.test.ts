import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string): string => readFileSync(path, 'utf8');

describe('PSI R95–R97 offline A4 export reliability contract', () => {
    it('prevents externally fetched font embedding and remote CDN fallback for A4 education capture', () => {
        const capture = read('utils/pdfCapture.ts');
        const studio = read('pages/A4EducationMaterial.tsx');
        expect(capture).toContain('skipFonts: options.strictLocalCapture === true');
        expect(capture).toContain('cacheBust: options.strictLocalCapture !== true');
        expect(capture).toContain('if (options.strictLocalCapture) {');
        expect(capture).toContain('throw error instanceof Error ? error');
        expect(studio).toContain('strictLocalCapture: true');
        expect(studio).toContain('preferOfflineRenderer: true');
        expect(studio).toContain('captureTimeoutMs: 20_000');
        expect(capture).toContain('options.captureTimeoutMs');
        expect(capture).toContain('Promise.race([');
        expect(capture).toContain('파일을 만들지 않았습니다');
    });
    it('never awaits a complete external font load for each language switch', () => {
        const studio = read('pages/A4EducationMaterial.tsx');
        const waitStart = studio.indexOf('const waitForRenderedEducationLanguage = async');
        const waitEnd = studio.indexOf('// One local ZIP / one local PDF', waitStart);
        const waitBody = studio.slice(waitStart, waitEnd);
        expect(waitStart).toBeGreaterThan(0);
        expect(waitEnd).toBeGreaterThan(waitStart);
        expect(waitBody).not.toContain('await waitForA4Fonts()');
        expect(waitBody).toContain('isMatchingA4Language(');
        expect(studio).toContain('await waitForA4Fonts(1_000)');
        expect(studio).toContain('assetTimeoutMs: 3_000');
    });
    it('treats absent or delayed fonts as a human-review obligation, not a safety-approval signal', () => {
        const studio = read('pages/A4EducationMaterial.tsx');
        const fontReview = read('utils/educationA4FontPreflight.ts');
        expect(studio).toContain('출력물은 기기 글꼴로 만들어졌으므로 외국어 문자·줄바꿈을 육안으로 확인하세요');
        expect(studio).toContain('data-psi-a4-font-preflight="true"');
        expect(fontReview).toContain('humanReviewRequired: true');
        expect(fontReview).toContain('검증된 것은 아닙니다');
    });
});
