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

export const resolveGeminiOcrModelChain = (engine: OcrEngineMode): string[] => {
    if (engine === 'gemini-fast') {
        return ['gemini-3.0-flash', 'gemini-2.5-flash'];
    }
    if (engine === 'gemini-precise') {
        return ['gemini-3.1-pro-preview', 'gemini-3.0-flash', 'gemini-2.5-flash'];
    }
    return ['gemini-3.0-flash', 'gemini-3.1-pro-preview', 'gemini-2.5-flash'];
};

export const getOcrEngineLabel = (engine: OcrEngineMode): string => {
    if (engine === 'gemini-fast') return 'Gemini 빠른 분석';
    if (engine === 'gemini-precise') return 'Gemini 정밀 분석';
    if (engine === 'openai-precise') return 'OpenAI 정밀 분석';
    return '자동 추천';
};
