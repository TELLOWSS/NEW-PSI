import { describe, expect, it } from 'vitest';
import { isFormatCompatibleWithAI, validateImageFormat } from '../services/geminiService';
import { isSupportedOcrFile } from '../utils/ocrFilePolicy';

const PDF_BASE64 = 'JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyA+PgplbmRvYmoKJSVFT0YK';

describe('OCR PDF support', () => {
    it('accepts PDF files selected by MIME type or extension', () => {
        expect(isSupportedOcrFile({ name: 'risk-assessment.pdf', type: 'application/pdf' })).toBe(true);
        expect(isSupportedOcrFile({ name: 'risk-assessment.PDF', type: '' })).toBe(true);
        expect(isSupportedOcrFile({ name: 'risk-assessment.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(false);
    });

    it('detects PDF base64 and allows it for Gemini analysis', () => {
        const result = validateImageFormat(PDF_BASE64);
        expect(result).toMatchObject({ isValid: true, detectedFormat: 'application/pdf', supportedFormat: true });
        expect(isFormatCompatibleWithAI(result.detectedFormat)).toBe(true);
    });
});
