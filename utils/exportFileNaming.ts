import { buildKstDateToken, buildKstTimeToken } from './exportTimestamp';

const normalizeToken = (value: unknown): string => {
    const raw = String(value ?? '').trim();
    if (!raw) return 'NA';

    return raw
        .replace(/\s+/g, '-')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_.]+|[-_.]+$/g, '') || 'NA';
};

export const getPsiDateToken = (date = new Date()): string => {
    return buildKstDateToken(date);
};

const getPsiTimeToken = (date = new Date()): string => {
    return buildKstTimeToken(date);
};

export const buildPsiExportBaseName = (options: {
    tokens: Array<string | number | null | undefined>;
    date?: Date;
    includeTime?: boolean;
}): string => {
    const date = options.date || new Date();
    const tokens = options.tokens
        .map(normalizeToken)
        .filter((token) => token.length > 0);

    const base = ['PSI', ...tokens, getPsiDateToken(date)];
    if (options.includeTime) {
        base.push(getPsiTimeToken(date));
    }

    return base.join('_');
};

export const buildPsiExportFileName = (options: {
    tokens: Array<string | number | null | undefined>;
    extension: string;
    date?: Date;
    includeTime?: boolean;
}): string => {
    const ext = String(options.extension || '').replace(/^\./, '').trim() || 'txt';
    return `${buildPsiExportBaseName({
        tokens: options.tokens,
        date: options.date,
        includeTime: options.includeTime,
    })}.${ext}`;
};
