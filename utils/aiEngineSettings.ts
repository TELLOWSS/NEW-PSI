export type OcrEngineMode = 'auto' | 'gemini-fast' | 'gemini-precise' | 'openai-precise';
export type DocumentAnalysisMode = 'auto' | 'gemini-fast' | 'gemini-precise' | 'openai-precise';

export interface AiEngineSettings {
    ocrEngine: OcrEngineMode;
    documentAnalysisEngine: DocumentAnalysisMode;
}

export const AI_ENGINE_SETTINGS_KEY = 'psi_ai_engine_settings_v1';
export const AI_ENGINE_SETTINGS_CHANGED_EVENT = 'psi-ai-engine-settings-changed';

export const DEFAULT_AI_ENGINE_SETTINGS: AiEngineSettings = {
    ocrEngine: 'auto',
    documentAnalysisEngine: 'auto',
};

/**
 * 2026-08-22 Google 공식 GA/Preview 모델 기준 OCR 라우팅 카탈로그.
 * 가격은 Gemini Developer API Standard 유료 티어의 USD / 1M tokens이며,
 * 3.7 Flash는 2026-12-31까지의 프로모션 단가다.
 */
export const GEMINI_OCR_MODEL_CATALOG = {
    economy: {
        id: 'gemini-3.5-flash-lite',
        lifecycle: 'ga',
        inputUsdPerMillionTokens: 0.30,
        outputUsdPerMillionTokens: 2.50,
    },
    precision: {
        id: 'gemini-3.7-flash',
        lifecycle: 'ga',
        inputUsdPerMillionTokens: 0.75,
        outputUsdPerMillionTokens: 3.75,
        promotionalPriceEndsAt: '2026-12-31',
    },
    stableFallback: {
        id: 'gemini-2.5-flash',
        lifecycle: 'ga',
        inputUsdPerMillionTokens: 0.30,
        outputUsdPerMillionTokens: 2.50,
    },
    exceptionalPrecision: {
        id: 'gemini-3.1-pro-preview',
        lifecycle: 'preview',
        inputUsdPerMillionTokens: 2.00,
        outputUsdPerMillionTokens: 12.00,
    },
} as const;

export type GeminiOcrModelId = typeof GEMINI_OCR_MODEL_CATALOG[keyof typeof GEMINI_OCR_MODEL_CATALOG]['id'];

export interface GeminiTokenUsage {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
}

export interface GeminiOcrCostGuardDecision {
    allowed: boolean;
    projectedAttemptCostUsd: number;
    projectedTotalCostUsd: number;
    remainingBudgetUsd: number;
}

export const estimateGeminiOcrCostUsd = (
    modelId: string,
    usage: GeminiTokenUsage,
): number => {
    const entry = Object.values(GEMINI_OCR_MODEL_CATALOG).find((item) => item.id === modelId);
    if (!entry) return 0;

    const inputTokens = Math.max(0, Number(usage.inputTokens) || 0);
    const outputTokens = Math.max(0, Number(usage.outputTokens) || 0);
    const thinkingTokens = Math.max(0, Number(usage.thinkingTokens) || 0);
    return (
        inputTokens * entry.inputUsdPerMillionTokens
        + (outputTokens + thinkingTokens) * entry.outputUsdPerMillionTokens
    ) / 1_000_000;
};

/**
 * 공급자 호출 전에 실제 countTokens 입력값과 최악 출력 예산으로 문서별 비용 상한을 판정한다.
 * maxBillableOutputTokens에는 사용자에게 보이는 출력과 내부 thinking 예산을 모두 포함해야 한다.
 */
export const evaluateGeminiOcrCostGuard = (options: {
    modelId: string;
    countedInputTokens: number;
    maxBillableOutputTokens: number;
    spentUsd: number;
    maxUsd: number;
}): GeminiOcrCostGuardDecision => {
    const spentUsd = Math.max(0, Number(options.spentUsd) || 0);
    const maxUsd = Math.max(0, Number(options.maxUsd) || 0);
    const projectedAttemptCostUsd = estimateGeminiOcrCostUsd(options.modelId, {
        inputTokens: Math.max(0, Number(options.countedInputTokens) || 0),
        outputTokens: Math.max(0, Number(options.maxBillableOutputTokens) || 0),
        thinkingTokens: 0,
    });
    const projectedTotalCostUsd = spentUsd + projectedAttemptCostUsd;
    return {
        allowed: projectedTotalCostUsd <= maxUsd,
        projectedAttemptCostUsd,
        projectedTotalCostUsd,
        remainingBudgetUsd: Math.max(0, maxUsd - spentUsd),
    };
};

const VALID_ENGINES = new Set<OcrEngineMode>([
    'auto',
    'gemini-fast',
    'gemini-precise',
    'openai-precise',
]);

export const getAiEngineSettings = (): AiEngineSettings => {
    try {
        const parsed = JSON.parse(localStorage.getItem(AI_ENGINE_SETTINGS_KEY) || 'null') as Partial<AiEngineSettings> | null;
        return {
            ocrEngine: VALID_ENGINES.has(parsed?.ocrEngine as OcrEngineMode)
                ? parsed!.ocrEngine as OcrEngineMode
                : DEFAULT_AI_ENGINE_SETTINGS.ocrEngine,
            documentAnalysisEngine: VALID_ENGINES.has(parsed?.documentAnalysisEngine as DocumentAnalysisMode)
                ? parsed!.documentAnalysisEngine as DocumentAnalysisMode
                : DEFAULT_AI_ENGINE_SETTINGS.documentAnalysisEngine,
        };
    } catch {
        return DEFAULT_AI_ENGINE_SETTINGS;
    }
};

export const setAiEngineSettings = (settings: AiEngineSettings): void => {
    localStorage.setItem(AI_ENGINE_SETTINGS_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event(AI_ENGINE_SETTINGS_CHANGED_EVENT));
};

export const resolveGeminiOcrModelChain = (
    engine: OcrEngineMode,
    options?: { isPaidApiMode?: boolean },
): string[] => {
    const isPaidApiMode = options?.isPaidApiMode === true;

    if (engine === 'gemini-fast') {
        return [
            GEMINI_OCR_MODEL_CATALOG.economy.id,
            GEMINI_OCR_MODEL_CATALOG.stableFallback.id,
        ];
    }
    if (engine === 'gemini-precise') {
        return isPaidApiMode
            ? [
                GEMINI_OCR_MODEL_CATALOG.precision.id,
                GEMINI_OCR_MODEL_CATALOG.exceptionalPrecision.id,
            ]
            : [
                GEMINI_OCR_MODEL_CATALOG.precision.id,
                GEMINI_OCR_MODEL_CATALOG.stableFallback.id,
            ];
    }
    return isPaidApiMode
        ? [
            GEMINI_OCR_MODEL_CATALOG.economy.id,
            GEMINI_OCR_MODEL_CATALOG.precision.id,
        ]
        : [
            GEMINI_OCR_MODEL_CATALOG.economy.id,
            GEMINI_OCR_MODEL_CATALOG.stableFallback.id,
        ];
};

export const getOcrEngineLabel = (engine: OcrEngineMode): string => {
    if (engine === 'gemini-fast') return 'Gemini 가성비 분석';
    if (engine === 'gemini-precise') return 'Gemini 고정밀 분석';
    if (engine === 'openai-precise') return 'OpenAI 정밀 분석';
    return '자동 추천';
};
