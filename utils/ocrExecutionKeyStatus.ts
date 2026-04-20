export type OcrExecutionKeySource =
    | 'local-primary'
    | 'env-primary'
    | 'local-secondary'
    | 'env-secondary'
    | 'none';

export type OcrExecutionKeyStatus = {
    ready: boolean;
    hasKey: boolean;
    modeLabel: '무료' | '유료';
    modeApiLabel: '무료 API' | '유료 API';
    source: OcrExecutionKeySource;
    sourceLabel: string;
};

type ResolveOcrExecutionKeyStatusOptions = {
    isPaidApiMode: boolean;
    freeLocalKey?: string;
    paidLocalKey?: string;
    freeEnvKey?: string;
    paidEnvKey?: string;
};

const readTrimmed = (value: unknown): string => String(value || '').trim();

export const resolveOcrExecutionKeyStatus = ({
    isPaidApiMode,
    freeLocalKey,
    paidLocalKey,
    freeEnvKey,
    paidEnvKey,
}: ResolveOcrExecutionKeyStatusOptions): OcrExecutionKeyStatus => {
    const localFree = readTrimmed(freeLocalKey ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('freeApiKey') : ''));
    const localPaid = readTrimmed(paidLocalKey ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('paidApiKey') : ''));
    const envFree = readTrimmed(freeEnvKey ?? import.meta.env.VITE_GEMINI_API_KEY_FREE);
    const envPaid = readTrimmed(paidEnvKey ?? import.meta.env.VITE_GEMINI_API_KEY_PAID);

    const primaryLocal = isPaidApiMode ? localPaid : localFree;
    const primaryEnv = isPaidApiMode ? envPaid : envFree;
    const secondaryLocal = isPaidApiMode ? localFree : localPaid;
    const secondaryEnv = isPaidApiMode ? envFree : envPaid;

    let source: OcrExecutionKeySource = 'none';
    if (primaryLocal) source = 'local-primary';
    else if (primaryEnv) source = 'env-primary';
    else if (secondaryLocal) source = 'local-secondary';
    else if (secondaryEnv) source = 'env-secondary';

    const sourceLabel = source === 'local-primary'
        ? '설정 키(현재 모드)'
        : source === 'env-primary'
            ? '환경변수(현재 모드)'
            : source === 'local-secondary'
                ? '설정 키(보조 모드)'
                : source === 'env-secondary'
                    ? '환경변수(보조 모드)'
                    : '미설정';

    const hasKey = source !== 'none';

    return {
        ready: hasKey,
        hasKey,
        modeLabel: isPaidApiMode ? '유료' : '무료',
        modeApiLabel: isPaidApiMode ? '유료 API' : '무료 API',
        source,
        sourceLabel,
    };
};