import { createClient } from '@supabase/supabase-js';
import { calculateIntegrityScore, type ViolationRecord } from '../../utils/integrityUtils.js';

type SixMetricBreakdown = {
    psychological: number;
    jobUnderstanding: number;
    riskAssessmentUnderstanding: number;
    proficiency: number;
    improvementExecution: number;
    repeatViolationPenalty: number;
};

export type MultilingualRiskSubmissionInput = {
    sessionId: string;
    multilingualText: string;
    originalLanguageHint?: string;
    pastViolationHistory?: ViolationRecord[];
    minTotalScore?: number;
};

export type MultilingualRiskSubmissionResult = {
    sessionId: string;
    originalLanguage: string;
    translatedKoreanText: string;
    integrityScore: number;
    sixMetricBreakdown: SixMetricBreakdown;
    sixMetricTotalScore: number;
    storedEmbedding: boolean;
    skippedReason: string | null;
};

const TRANSLATION_MODEL = 'gemini-2.5-flash';
const SCORING_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

const DEFAULT_MIN_SCORE = 80;

const clampNumber = (value: unknown, min: number, max: number): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.max(min, Math.min(max, numeric));
};

const computeSixMetricTotalScore = (breakdown: SixMetricBreakdown): number => {
    const total =
        clampNumber(breakdown.psychological, 0, 10) +
        clampNumber(breakdown.jobUnderstanding, 0, 20) +
        clampNumber(breakdown.riskAssessmentUnderstanding, 0, 20) +
        clampNumber(breakdown.proficiency, 0, 30) +
        clampNumber(breakdown.improvementExecution, 0, 20) -
        clampNumber(breakdown.repeatViolationPenalty, 0, 30);

    return clampNumber(Math.round(total), 0, 100);
};

const getGeminiApiKey = (): string => {
    const key =
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        '';

    if (!key) {
        throw new Error('Gemini API Key가 없습니다. GEMINI_API_KEY 또는 GOOGLE_GEMINI_API_KEY를 설정하세요.');
    }

    return key;
};

const getSupabaseClient = () => {
    const supabaseUrl =
        process.env.VITE_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        '';
    const supabaseServiceRoleKey =
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_SERVICE_KEY ||
        process.env.SERVICE_ROLE_KEY ||
        '';
    const supabaseAnonKey =
        process.env.VITE_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        '';
    const psiAdminSecret =
        process.env.VITE_PSI_ADMIN_SECRET ||
        process.env.PSI_ADMIN_SECRET ||
        '';

    const keyToUse = supabaseServiceRoleKey || supabaseAnonKey;
    if (!supabaseUrl || !keyToUse) {
        throw new Error('Supabase 환경변수가 누락되었습니다. SUPABASE_URL + SERVICE_ROLE_KEY를 확인하세요.');
    }

    return createClient(supabaseUrl, keyToUse, {
        global: {
            headers: psiAdminSecret ? { 'x-psi-admin-secret': psiAdminSecret } : {},
        },
    });
};

const parseGeminiJson = (response: any): Record<string, unknown> => {
    const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    try {
        return JSON.parse(rawText) as Record<string, unknown>;
    } catch {
        return {};
    }
};

const requestGeminiJson = async (
    apiKey: string,
    model: string,
    prompt: string
): Promise<Record<string, unknown>> => {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                },
            }),
        }
    );

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Gemini 요청 실패(${model}): ${response.status} ${detail}`);
    }

    const payload = await response.json();
    return parseGeminiJson(payload);
};

const toVectorLiteral = (values: number[]): string => {
    const normalized = values
        .map((value) => (Number.isFinite(value) ? Number(value) : 0))
        .map((value) => value.toFixed(8));
    return `[${normalized.join(',')}]`;
};

const requestGeminiEmbedding = async (apiKey: string, koreanText: string): Promise<number[]> => {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: {
                    parts: [{ text: koreanText }],
                },
                taskType: 'SEMANTIC_SIMILARITY',
            }),
        }
    );

    if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Gemini Embedding 요청 실패: ${response.status} ${detail}`);
    }

    const payload = await response.json();
    const values = payload?.embedding?.values;
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Gemini Embedding 응답 파싱 실패: embedding.values가 비어 있습니다.');
    }

    return values.map((value: unknown) => Number(value)).filter((value: number) => Number.isFinite(value));
};

const normalizeSixMetrics = (raw: Record<string, unknown>): SixMetricBreakdown => {
    return {
        psychological: clampNumber(raw.psychological, 0, 10),
        jobUnderstanding: clampNumber(raw.jobUnderstanding, 0, 20),
        riskAssessmentUnderstanding: clampNumber(raw.riskAssessmentUnderstanding, 0, 20),
        proficiency: clampNumber(raw.proficiency, 0, 30),
        improvementExecution: clampNumber(raw.improvementExecution, 0, 20),
        repeatViolationPenalty: clampNumber(raw.repeatViolationPenalty, 0, 30),
    };
};

const translateAndRefineToKorean = async (
    apiKey: string,
    multilingualText: string,
    originalLanguageHint?: string
): Promise<{ translatedKoreanText: string; originalLanguage: string }> => {
    const prompt = [
        '아래 근로자 수기 위험성평가 텍스트를 한국어 표준 문장으로 번역/정제하세요.',
        '출력은 반드시 JSON만 반환합니다.',
        '키는 translatedKoreanText, originalLanguage 만 사용하세요.',
        'translatedKoreanText는 현장 안전 문맥을 유지하고 불필요한 군더더기 없이 정제하세요.',
        'originalLanguage는 입력 원문의 언어코드(가능하면 BCP-47, 예: ko, ru, vi, zh-CN)로 반환하세요.',
        originalLanguageHint ? `언어 힌트: ${originalLanguageHint}` : '',
        '[원문]',
        multilingualText,
    ].filter(Boolean).join('\n');

    const parsed = await requestGeminiJson(apiKey, TRANSLATION_MODEL, prompt);
    const translatedKoreanText = String(parsed.translatedKoreanText || '').trim();
    const originalLanguage = String(parsed.originalLanguage || originalLanguageHint || 'unknown').trim();

    if (!translatedKoreanText) {
        throw new Error('번역/정제 결과가 비어 있습니다. 입력 텍스트 또는 Gemini 응답을 확인하세요.');
    }

    return { translatedKoreanText, originalLanguage };
};

const evaluateSixMetrics = async (apiKey: string, koreanText: string): Promise<SixMetricBreakdown> => {
    const prompt = [
        '아래 한국어 위험성평가 텍스트를 6대 지표로 채점하세요.',
        '반드시 JSON만 반환합니다.',
        '키는 psychological, jobUnderstanding, riskAssessmentUnderstanding, proficiency, improvementExecution, repeatViolationPenalty만 사용하세요.',
        '점수 범위: psychological(0~10), jobUnderstanding(0~20), riskAssessmentUnderstanding(0~20), proficiency(0~30), improvementExecution(0~20), repeatViolationPenalty(0~30)',
        '[한국어 정제 텍스트]',
        koreanText,
    ].join('\n');

    const parsed = await requestGeminiJson(apiKey, SCORING_MODEL, prompt);
    return normalizeSixMetrics(parsed);
};

/**
 * 다국어 수기 위험성평가 제출 파이프라인
 * 1) 번역/정제 -> 2) 무결성 + 6대 지표 계산 -> 3) 총점 80점 이상만 임베딩 저장
 */
export async function processMultilingualRiskSubmission(
    input: MultilingualRiskSubmissionInput
): Promise<MultilingualRiskSubmissionResult> {
    const sessionId = String(input.sessionId || '').trim();
    const multilingualText = String(input.multilingualText || '').trim();
    const minTotalScore = Number.isFinite(Number(input.minTotalScore))
        ? Math.max(0, Math.min(100, Number(input.minTotalScore)))
        : DEFAULT_MIN_SCORE;

    if (!sessionId) {
        throw new Error('sessionId가 필요합니다.');
    }
    if (!multilingualText) {
        throw new Error('multilingualText가 비어 있습니다.');
    }

    const geminiApiKey = getGeminiApiKey();

    const { translatedKoreanText, originalLanguage } = await translateAndRefineToKorean(
        geminiApiKey,
        multilingualText,
        input.originalLanguageHint
    );

    const integrity = calculateIntegrityScore(translatedKoreanText, input.pastViolationHistory || []);
    const sixMetricBreakdown = await evaluateSixMetrics(geminiApiKey, translatedKoreanText);
    const sixMetricTotalScore = computeSixMetricTotalScore(sixMetricBreakdown);

    if (sixMetricTotalScore < minTotalScore) {
        return {
            sessionId,
            originalLanguage,
            translatedKoreanText,
            integrityScore: integrity.score,
            sixMetricBreakdown,
            sixMetricTotalScore,
            storedEmbedding: false,
            skippedReason: `총점(${sixMetricTotalScore})이 기준(${minTotalScore}) 미만`,
        };
    }

    const embedding = await requestGeminiEmbedding(geminiApiKey, translatedKoreanText);
    const supabase = getSupabaseClient();

    const { error: updateError } = await supabase
        .from('training_sessions')
        .update({
            original_language: originalLanguage || 'unknown',
            embedding: toVectorLiteral(embedding),
        })
        .eq('id', sessionId);

    if (updateError) {
        throw new Error(`Supabase embedding 저장 실패: ${updateError.message}`);
    }

    return {
        sessionId,
        originalLanguage,
        translatedKoreanText,
        integrityScore: integrity.score,
        sixMetricBreakdown,
        sixMetricTotalScore,
        storedEmbedding: true,
        skippedReason: null,
    };
}
