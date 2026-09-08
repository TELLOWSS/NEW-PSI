import type { WorkerRecord } from '../types';
import { evaluateOcrVerificationCompleteness, evaluateOcrVerificationQuality } from './ocrVerificationLanguageUtils';

export interface LanguageEvidenceRow {
    language: string;
    records: number;
    complete: number;
    checksPassed: number;
    numberWarnings: number;
}

const numbers = (value: string) => [...new Set(value.normalize('NFKC').match(/\d+(?:[.,]\d+)*/g) || [])].sort();

/** Structural checks are evidence of coverage, never certification of native fluency. */
export const summarizeNativeLanguageEvidence = (records: WorkerRecord[]): LanguageEvidenceRow[] => {
    const groups = new Map<string, LanguageEvidenceRow>();
    for (const record of records) {
        const language = String(record.language || '').trim() || `언어 미지정 (${record.nationality || '국적 미상'})`;
        const row = groups.get(language) || { language, records: 0, complete: 0, checksPassed: 0, numberWarnings: 0 };
        const completeness = evaluateOcrVerificationCompleteness(record);
        const quality = evaluateOcrVerificationQuality(record);
        const numberWarning = (record.handwrittenAnswers || []).some(answer => {
            const source = String(answer.koreanTranslation || answer.answerText || '');
            const target = String(answer.nativeTranslation || '');
            return target && numbers(source).join('|') !== numbers(target).join('|');
        });
        row.records++;
        if (completeness.isComplete) row.complete++;
        if (completeness.isComplete && quality.isHealthy && !numberWarning) row.checksPassed++;
        if (numberWarning) row.numberWarnings++;
        groups.set(language, row);
    }
    return [...groups.values()].sort((a, b) => a.language.localeCompare(b.language));
};

export const buildNativeLanguageEvidenceCsv = (rows: LanguageEvidenceRow[], timestamp: string): string => {
    const cell = (value: string | number) => `"${String(value).replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
    const data: Array<Array<string | number>> = [
        ['검사시각(UTC)', timestamp],
        ['검사범위', '현재 PC 기록 전체. 원어민 자연스러움·의미 정확도 인증이 아닙니다.'],
        ['언어', '기록 수', '구조 완결', '자동 점검 통과', '숫자 대조 필요', '원어민 검수'],
        ...rows.map(row => [row.language, row.records, row.complete, row.checksPassed, row.numberWarnings, '증빙 미등록']),
    ];
    return '\uFEFF' + data.map(row => row.map(cell).join(',')).join('\r\n');
};
