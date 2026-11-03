import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildEducationA4Pdf, type EducationPdfPage } from '../utils/educationLocalPdf';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]); // byte-level PDF structure probe, not a renderable JPEG
const page = (): EducationPdfPage => ({
    jpeg, pixelWidth: 595, pixelHeight: 842,
    placement: { width: 210, height: 297, offsetX: 0, offsetY: 0 },
});

describe('PSI R88–R90 A4 offline PDF writer', () => {
    it('creates valid PDF 1.4 object tables, A4 media size and exact page count', async () => {
        const blob = buildEducationA4Pdf([page(), page(), page()]);
        expect(blob.type).toBe('application/pdf');
        const value = new TextDecoder('latin1').decode(await blob.arrayBuffer());
        expect(value.startsWith('%PDF-1.4\n')).toBe(true);
        expect(value).toContain('/Type /Catalog /Pages 2 0 R');
        expect(value).toContain('/Count 3');
        expect(value.match(/\/Type \/Page \/Parent/g)).toHaveLength(3);
        expect(value.match(/\/Filter \/DCTDecode/g)).toHaveLength(3);
        expect(value).toContain('/MediaBox [0 0 595.27559 841.88976]');
        expect(value.endsWith('%%EOF\n')).toBe(true);
        const startxref = Number(value.match(/startxref\n(\d+)\n%%EOF/)?.[1]);
        expect(value.slice(startxref, startxref + 5)).toBe('xref\n');
        const match = value.slice(startxref).match(/^xref\n0 (\d+)\n0000000000 65535 f \n([\s\S]+?)trailer/);
        expect(match?.[1]).toBe('12');
        const entries = match![2].split('\n').filter(Boolean);
        expect(entries).toHaveLength(11);
        for (let id = 1; id <= 11; id++) {
            const offset = Number(entries[id - 1].slice(0, 10));
            expect(value.slice(offset)).toMatch(new RegExp('^' + id + ' 0 obj\\n'));
        }
    });
    it('rejects malformed binary, oversized image and invalid A4 placement', () => {
        expect(() => buildEducationA4Pdf([])).toThrow();
        expect(() => buildEducationA4Pdf(Array.from({ length: 21 }, page))).toThrow();
        expect(() => buildEducationA4Pdf([{ ...page(), jpeg: new Uint8Array([1, 2, 3, 4]) }])).toThrow();
        expect(() => buildEducationA4Pdf([{ ...page(), pixelWidth: 0 }])).toThrow();
        expect(() => buildEducationA4Pdf([{ ...page(), placement: { width: 210, height: 298, offsetX: 0, offsetY: 0 } }])).toThrow();
        expect(() => buildEducationA4Pdf([{ ...page(), placement: { width: 210, height: 297, offsetX: 1, offsetY: 0 } }])).toThrow();
    });
    it('uses the local PDF writer in both one-page and multi-language paths', () => {
        const studio = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(studio).toContain('buildEducationA4Pdf([{');
        expect(studio).toContain('buildEducationA4Pdf(pdfPages)');
        expect(studio).not.toContain('ensureJsPdfConstructor()');
        expect(studio).toContain('data-psi-education-ready-download="true"');
        expect(studio).toContain('파일 다시 다운로드');
        expect(studio).toContain('setPreparedBundle({ blob, filename })');
        expect(studio).toContain("requestEducationDownload(blob, buildPsiExportFileName({");
        const pdfSource = readFileSync('utils/educationLocalPdf.ts', 'utf8');
        expect(pdfSource).not.toContain('fetch(');
        expect(pdfSource).not.toContain('cdnjs.');
        expect(pdfSource).toContain('DCTDecode');
    });
});
