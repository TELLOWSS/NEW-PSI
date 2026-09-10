import { describe, expect, it } from 'vitest';
import { prepareArchiveWorkRecord } from '../utils/archiveWorkResume';
import { enforceSafetyLevel } from '../utils/evidenceUtils';
const source = () => ({ id: 'work-1', name: '검증', nationality: '대한민국', jobField: '형틀', date: '2025.11.29', safetyScore: 85, safetyLevel: '중급', fullText: '  원문\n', handwrittenAnswers: [], strengths: [], weakAreas: [], suggestions: [] });
describe('archive work copy preparation', () => {
    it('normalizes dotted dates only in the copy and preserves old evaluation on reload', async () => {
        const original = source();
        const result = await prepareArchiveWorkRecord(original);
        expect(original).toEqual(source());
        expect(result.date).toBe('2025-11-29');
        expect(result.id).toBe(original.id);
        expect(result.fullText).toBe(original.fullText);
        expect(enforceSafetyLevel(result).safetyLevel).toBe('중급');
        expect(enforceSafetyLevel(result).safetyScore).toBe(85);
        expect(result).toHaveProperty('archiveDateNormalization.originalDate', '2025.11.29');
    });
    it('rejects impossible calendar dates without rewriting them', async () => {
        await expect(prepareArchiveWorkRecord({ ...source(), date: '2025.02.29' })).rejects.toThrow('달력');
    });
    it('keeps identity and evidence through save/reopen cycles', async () => {
        const first = await prepareArchiveWorkRecord(source());
        const reopened = await prepareArchiveWorkRecord(JSON.parse(JSON.stringify(first)));
        expect(reopened).toEqual(first);
        expect(enforceSafetyLevel(reopened).safetyLevel).toBe('중급');
    });
    it('does not replace unknown provenance or silently repair unsupported grades', async () => {
        await expect(prepareArchiveWorkRecord({ ...source(), legacyBackup: { schemaVersion: 'unknown' } })).rejects.toThrow('호환');
        await expect(prepareArchiveWorkRecord({ ...source(), safetyLevel: 'A' })).rejects.toThrow('호환');
    });
    it('does not erase manual edits when an already migrated work copy is reopened', async () => {
        const first = await prepareArchiveWorkRecord(source());
        const edited = { ...first, fullText: '관리자 수정', safetyScore: 50, safetyLevel: '초급' };
        const reopened = await prepareArchiveWorkRecord(edited);
        expect(reopened.fullText).toBe('관리자 수정');
        expect(enforceSafetyLevel(reopened).safetyScore).toBe(50);
        expect(enforceSafetyLevel(reopened).safetyLevel).toBe('초급');
    });
});
