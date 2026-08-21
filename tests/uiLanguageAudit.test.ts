import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): string => readFileSync(path, 'utf8');

describe('user-facing language quality', () => {
    it('removes developer-only labels from primary operations screens', () => {
        const text = [
            read('pages/Dashboard.tsx'),
            read('pages/OcrAnalysis.tsx'),
            read('pages/Reports.tsx'),
            read('pages/SurveyIntelligence.tsx'),
            read('pages/WorkerManagement.tsx'),
        ].join('\n');

        [
            '팀 공유 DB',
            '승인 백로그',
            'BULK MODE',
            'INDIVIDUAL MODE',
            'SUCCESS RATE',
            'TOP PROVIDER',
            'MESSAGE HISTORY',
            'API Cooling Down',
            'Operations Configuration',
            'run 연결',
            'Preflight 검증',
            'Manifest / JSON 메타',
            '증빙 해시',
        ].forEach((term) => expect(text).not.toContain(term));
    });

    it('explains unavoidable technical key terminology in plain language', () => {
        const settings = read('pages/Settings.tsx');
        expect(settings).toContain('브라우저 보조 AI 연결 (서버 OCR과 분리)');
        expect(settings).toContain('브라우저 보조기능용 무료키');
        expect(settings).toContain('브라우저 보조기능용 유료키');
        expect(settings).toContain('서버 OCR은 여기 입력한 키를 사용하지 않습니다.');
    });

    it('keeps Korean worker training controls in Korean while unsupported locales use English fallback', () => {
        const workerTraining = read('pages/WorkerTraining.tsx');
        expect(workerTraining).toContain("if (code === 'ko-KR') return 'ko';");
        expect(workerTraining).toContain("return 'en';");
    });
});
