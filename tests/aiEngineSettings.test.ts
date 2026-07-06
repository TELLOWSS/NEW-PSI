import { describe, expect, it } from 'vitest';
import { getOcrEngineLabel, resolveGeminiOcrModelChain } from '../utils/aiEngineSettings';

describe('AI engine routing', () => {
    it('routes clear bulk documents to the fast Gemini chain', () => {
        expect(resolveGeminiOcrModelChain('gemini-fast', { isPaidApiMode: true })).toEqual([
            'gemini-3.0-flash',
            'gemini-2.5-flash',
        ]);
    });

    it('routes difficult documents to the precise model first', () => {
        expect(resolveGeminiOcrModelChain('gemini-precise', { isPaidApiMode: true })[0]).toBe('gemini-3.1-pro-preview');
    });

    it('labels the automatic mode for non-technical users', () => {
        expect(getOcrEngineLabel('auto')).toBe('자동 추천');
    });
});
