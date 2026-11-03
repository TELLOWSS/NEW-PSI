import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEducationPngZip, isMatchingA4Language } from '../utils/educationA4BatchExport';

const studio = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
const archiveSource = readFileSync('utils/educationA4BatchExport.ts', 'utf8');

describe('PSI R85–R87 local multilingual A4 batches', () => {
    it('prevents stale-language output even when page and poster use different language codes', () => {
        expect(isMatchingA4Language('ko-KR', 'ko-KR', 'ko-KR')).toBe(true);
        expect(isMatchingA4Language('cmn-CN', 'zh-CN', 'cmn-CN')).toBe(true);
        expect(isMatchingA4Language('km-KH', 'km-KH', 'km-KH')).toBe(true);
        expect(isMatchingA4Language('ur-PK', 'ur-PK', 'ur-PK')).toBe(true);
        expect(isMatchingA4Language('cmn-CN', 'cmn-CN', 'cmn-CN')).toBe(false);
        expect(isMatchingA4Language('km-KH', 'km-KH', 'ko-KR')).toBe(false);
        expect(isMatchingA4Language('unknown', 'ko-KR', 'unknown')).toBe(false);
    });

    it('builds an offline UTF-8, CRC-validated STORE ZIP with readable image bytes', async () => {
        const files = [
            { name: 'PSI_한국어.png', content: new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' }) },
            { name: 'PSI_ភាសាខ្មែរ.png', content: new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/png' }) },
        ];
        const zip = await buildEducationPngZip(files);
        expect(zip.type).toBe('application/zip');
        const bytes = new Uint8Array(await zip.arrayBuffer());
        const view = new DataView(bytes.buffer);
        expect(view.getUint32(0, true)).toBe(0x04034b50);
        expect(view.getUint16(6, true)).toBe(0x0800);
        expect(view.getUint16(8, true)).toBe(0);
        const nameLength = view.getUint16(26, true);
        expect(new TextDecoder().decode(bytes.slice(30, 30 + nameLength))).toBe('PSI_한국어.png');
        const contentOffset = 30 + nameLength;
        expect([...bytes.slice(contentOffset, contentOffset + 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        const eocd = bytes.length - 22;
        expect(view.getUint32(eocd, true)).toBe(0x06054b50);
        expect(view.getUint16(eocd + 10, true)).toBe(files.length);
        expect(view.getUint32(view.getUint32(eocd + 16, true), true)).toBe(0x02014b50);
    });

    it('rejects unsafe names, duplicates and empty files before downloading', async () => {
        const blob = new Blob([new Uint8Array([1])], { type: 'image/png' });
        await expect(buildEducationPngZip([])).rejects.toThrow();
        await expect(buildEducationPngZip([{ name: '../outside.png', content: blob }])).rejects.toThrow();
        await expect(buildEducationPngZip([{ name: 'one.png', content: blob }, { name: 'one.png', content: blob }])).rejects.toThrow();
        await expect(buildEducationPngZip([{ name: 'blank.png', content: new Blob() }])).rejects.toThrow();
    });

    it('switches languages by rendered markers rather than an arbitrary delay, then issues one download', () => {
        expect(studio).toContain('waitForRenderedEducationLanguage(lang)');
        expect(studio).toContain("querySelector('[data-a4-safety-poster=\"true\"]')");
        expect(studio).not.toContain('setTimeout(resolve, 400)');
        expect(studio).toContain('buildEducationPngZip(pngFiles)');
        expect(studio).toContain("pdf.output('blob')");
        expect(studio).toContain('requestEducationDownload(blob, filename)');
        expect(studio).toContain('잘못된 언어로 저장하지 않았습니다.');
        expect(studio).toContain('묶음 다운로드는 요청하지 않았습니다');
        expect(studio).toContain('role="status" aria-live="polite"');
        expect(studio).toContain('disabled={isExporting}');
        expect(archiveSource).not.toContain('cdnjs.cloudflare.com');
        expect(archiveSource).not.toContain('fetch(');
    });
});
