import { describe, expect, it, vi } from 'vitest';
import {
    A4_REVIEW_STORAGE_KEY,
    a4ReviewKey,
    calculateA4ReviewFingerprint,
    newA4ReviewChecks,
    readA4ReviewStore,
    saveA4ReviewStore,
    validA4Review,
    type A4OutputReview,
} from '../utils/educationA4LocalReview';
import { readFileSync } from 'node:fs';

const key = a4ReviewKey('2026-11', '형틀', 'my-MM');
const sampleRecord = (fingerprint: string): A4OutputReview => ({
    version: 1,
    key,
    fingerprint,
    language: 'my-MM',
    role: 'native-language-reviewer',
    checkedAt: '2026-11-04T00:00:00.000Z',
    checks: {
        fileOpened: true,
        glyphsLegible: true,
        safetyMeaningCompared: true,
    },
});

describe('PSI R98–R100 A4 local operator review and content invalidation', () => {
    it('uses SHA-256 for the exact scope and invalidates a review on language or hazard wording change', async () => {
        const original = JSON.stringify({ month: '2026-11', workType: '형틀', lang: 'my-MM', coreMessage: 'အန္တရာယ်', korean: '작업중지' });
        const change = JSON.stringify({ month: '2026-11', workType: '형틀', lang: 'my-MM', coreMessage: 'အန္တရာယ်', korean: '착용 필수' });
        const digest = await calculateA4ReviewFingerprint(original);
        const changed = await calculateA4ReviewFingerprint(change);
        expect(digest).toMatch(/^[0-9a-f]{64}$/);
        expect(changed).not.toBe(digest);
        const store = { [key]: sampleRecord(digest) };
        expect(validA4Review(store, key, digest)?.language).toBe('my-MM');
        expect(validA4Review(store, key, changed)).toBeNull();
        expect(validA4Review(store, a4ReviewKey('2026-11', '형틀', 'km-KH'), digest)).toBeNull();
        expect(a4ReviewKey('2026-12', '형틀', 'my-MM')).not.toBe(key);
    });

    it('only saves minimal self-attestation metadata, never original messages or identities', async () => {
        const digest = await calculateA4ReviewFingerprint('synthetic-only');
        const original = { [key]: sampleRecord(digest) };
        const setItem = vi.fn();
        saveA4ReviewStore({ setItem }, original);
        expect(setItem).toHaveBeenCalledWith(A4_REVIEW_STORAGE_KEY, expect.any(String));
        const bytes = setItem.mock.calls[0][1] as string;
        expect(bytes).toContain(digest);
        expect(bytes).not.toContain('synthetic-only');
        expect(bytes).not.toContain('주민등록번호');
        expect(bytes).not.toContain('phone');
        const parsed = readA4ReviewStore({ getItem: () => bytes });
        expect(parsed[key]).toEqual(original[key]);
        const cleared = { ...parsed };
        delete cleared[key];
        saveA4ReviewStore({ setItem }, cleared);
        expect(readA4ReviewStore({ getItem: () => setItem.mock.lastCall![1] })[key]).toBeUndefined();
    });

    it('rejects malformed, partial, wrong-hash, and missing permissions without declaring review completion', async () => {
        const digest = await calculateA4ReviewFingerprint('scope');
        const bad = { [key]: { ...sampleRecord(digest), checks: { fileOpened: true, glyphsLegible: false, safetyMeaningCompared: true } } };
        expect(readA4ReviewStore({ getItem: () => JSON.stringify(bad) })).toEqual({});
        expect(readA4ReviewStore({ getItem: () => 'not-json' })).toEqual({});
        expect(readA4ReviewStore({ getItem: () => { throw new Error('denied'); } })).toEqual({});
        expect(newA4ReviewChecks()).toEqual({ fileOpened: false, glyphsLegible: false, safetyMeaningCompared: false });
        expect(validA4Review({ [key]: sampleRecord(digest) }, key, '0'.repeat(64))).toBeNull();
    });

    it('provides explicit mobile-friendly controls and does not block normal A4 downloads', () => {
        const studio = readFileSync('pages/A4EducationMaterial.tsx', 'utf8');
        expect(studio).toContain('data-psi-a4-output-review="true"');
        expect(studio).toContain('data-psi-a4-review-check={check}');
        expect(studio).toContain('data-psi-a4-review-save="true"');
        expect(studio).toContain("type=\"checkbox\"");
        expect(studio).toContain('확인기록 취소');
        expect(studio).toContain('A4_REVIEW_CHECKS.every(check => reviewChecks[check])');
        expect(studio).toContain('currentTranslationSourceText');
        expect(studio).toContain('calculateA4ReviewFingerprint(scope)');
        expect(studio).toContain('원문 또는 번역이 달라지면');
        expect(studio).toContain('전체 다국어 PNG · ZIP 한 파일');
    });
});
