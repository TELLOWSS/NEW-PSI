import { describe, expect, it } from 'vitest';
import { preserveEvidenceText } from '../utils/evidenceText';

describe('source evidence preservation across restore and reload', () => {
    it('retains whitespace, line breaks and multilingual text exactly', () => {
        for (const source of ['  원문\r\n답변\n ', '\n\t', ' 中文 ไทย Tiếng Việt \n', '']) {
            expect(preserveEvidenceText(source)).toBe(source);
            expect(preserveEvidenceText(JSON.parse(JSON.stringify(source)))).toBe(source);
        }
    });
    it('does not manufacture source text from malformed values', () => {
        for (const value of [null, undefined, 12, false, {}, []]) expect(preserveEvidenceText(value)).toBe('');
    });
});
