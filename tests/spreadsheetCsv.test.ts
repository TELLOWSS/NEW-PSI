import { describe, expect, it } from 'vitest';
import { escapeSpreadsheetCsvCell } from '../utils/spreadsheetCsv';
import { buildNativeLanguageEvidenceCsv } from '../utils/nativeLanguageEvidence';

describe('spreadsheet report serialization', () => {
    it.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '  =1', '\t=1', '\r=1', '\n=1', '＝1', '＋1', '－1', '＠SUM(A1)'])('marks formula-like text as literal: %j', value => {
        expect(escapeSpreadsheetCsvCell(value)).toBe(`"\t${value}"`);
    });
    it.each([null, undefined, '', '홍길동', 'A,B', 'a"b', 'a\rb', 'a\nb'])('quotes and preserves ordinary text: %j', value => {
        expect(escapeSpreadsheetCsvCell(value)).toBe(`"${String(value ?? '').replace(/"/g, '""')}"`);
    });
    it('preserves typed numeric report values including negatives', () => {
        expect(escapeSpreadsheetCsvCell(-12.5)).toBe('"-12.5"');
        expect(escapeSpreadsheetCsvCell(0)).toBe('"0"');
    });
    it('contains separator and quote breakout attempts in one quoted field', () => {
        expect(escapeSpreadsheetCsvCell('x",=1')).toBe('"x"",=1"');
    });
    it('applies protection to report data while preserving numeric counts and BOM', () => {
        const csv = buildNativeLanguageEvidenceCsv([{ language: '＝1', records: 2, complete: 1, checksPassed: 0, numberWarnings: 0 }], '2026-10-01');
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv).toContain('"\t＝1","2","1","0","0"');
    });
});
