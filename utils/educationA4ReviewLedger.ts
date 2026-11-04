import { a4ReviewKey, validA4Review, type A4ReviewStore, type A4ReviewerRole } from './educationA4LocalReview';

export type A4ReviewLedgerStatus = 'recorded' | 'recheck' | 'pending' | 'calculating';
export interface A4ReviewLedgerRow {
    language: string;
    languageLabel: string;
    status: A4ReviewLedgerStatus;
    role: A4ReviewerRole | null;
    checkedAt: string | null;
    sourceSha256: string;
}

export const A4_REVIEW_LEDGER_STATUSES: Readonly<Record<A4ReviewLedgerStatus, string>> = {
    recorded: '이 기기 확인기록 있음',
    recheck: '변경됨 · 다시 확인',
    pending: '미확인',
    calculating: '내용 확인 중',
};
export const A4_REVIEW_ROLE_LABELS: Readonly<Record<A4ReviewerRole, string>> = {
    'site-manager': '현장 관리자',
    'native-language-reviewer': '모국어 확인자',
    'joint-review': '관리자와 모국어 확인자 공동',
};

/** Only current-scope languages are exported. Invalidated records never inherit an old timestamp/role. */
export const buildA4ReviewLedger = (options: {
    educationMonth: string;
    workType: string;
    languages: readonly string[];
    labels: Readonly<Record<string, string>>;
    fingerprints: Readonly<Record<string, string>>;
    stored: A4ReviewStore;
    translationNeedsRefresh: boolean;
}): A4ReviewLedgerRow[] => {
    const { educationMonth, workType, languages, labels, fingerprints, stored, translationNeedsRefresh } = options;
    return [...new Set(languages)].map(language => {
        const key = a4ReviewKey(educationMonth, workType, language);
        const sha = fingerprints[language] || '';
        const saved = stored[key];
        const valid = sha ? validA4Review(stored, key, sha) : null;
        const translationStale = language !== 'ko-KR' && translationNeedsRefresh;
        const status: A4ReviewLedgerStatus = !/^[0-9a-f]{64}$/.test(sha) ? 'calculating'
            : translationStale || (saved && !valid) ? 'recheck'
            : valid ? 'recorded' : 'pending';
        return {
            language,
            languageLabel: labels[language] || language,
            status,
            role: status === 'recorded' ? valid!.role : null,
            checkedAt: status === 'recorded' ? valid!.checkedAt : null,
            sourceSha256: sha,
        };
    });
};

/** Prevent spreadsheet formula injection, quote each cell, and keep a stable Excel-friendly UTF-8 BOM. */
const csvCell = (value: string): string => {
    const cleaned = value.replace(/\u0000/g, '').replace(/[\r\n\t]/g, ' ');
    const safe = /^[\s]*[=+@\-]/.test(cleaned) ? "'" + cleaned : cleaned;
    return '"' + safe.replace(/"/g, '""') + '"';
};
const csvRow = (values: readonly string[]): string => values.map(csvCell).join(',');

/**
 * This export is a device-only snapshot of self-reported checks, NOT evidence of
 * education attendance, legal compliance, actual document distribution or
 * translation correctness. No worker details, source text, photos or names.
 */
export const buildA4ReviewLedgerCsv = (
    month: string, workType: string, rows: readonly A4ReviewLedgerRow[],
): string => {
    if (!rows.length || rows.length > 20 || rows.some(row => !/^[0-9a-f]{64}$/.test(row.sourceSha256))) {
        throw new Error('언어별 내용 확인 계산이 끝난 후 검수 현황 파일을 만들어 주세요.');
    }
    const lines = [
        csvRow(['PSI 다국어 A4 출력물 · 이 기기의 수동 확인기록 현황 (교육 이수·법정 증빙·서버 승인이 아님)']),
        csvRow(['교육 대상월', '대상 공종', '언어', '언어 코드', '확인 상태', '확인한 역할', '기기 기록 시각(ISO)', '현재 문서 SHA-256']),
        ...rows.map(row => csvRow([
            month, workType, row.languageLabel, row.language,
            A4_REVIEW_LEDGER_STATUSES[row.status],
            row.role ? A4_REVIEW_ROLE_LABELS[row.role] : '',
            row.checkedAt || '',
            row.sourceSha256,
        ])),
    ];
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
};

export const buildA4ReviewLedgerText = (rows: readonly A4ReviewLedgerRow[]): string =>
    ['PSI A4 출력물 기기 내 수동 확인기록 (교육 이수·법정 증빙·서버 승인 아님)',
        ...rows.map(row => `${row.languageLabel}: ${A4_REVIEW_LEDGER_STATUSES[row.status]}`),
        '실제 배포 전 글꼴·안전지시 문구는 별도 현장 검수 필요',
    ].join('\n');
