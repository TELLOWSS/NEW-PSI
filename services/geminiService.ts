
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { getWindowProp } from '../utils/windowUtils';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord, HandwrittenAnswer, OcrErrorType } from '../types';
import { extractMessage } from '../utils/errorUtils';
import { deriveIntegrityScore, enforceSafetyLevel } from '../utils/evidenceUtils';
import { getSafetyLevelFromScore } from '../utils/safetyLevelUtils';
import { getIsPaidApiMode } from '../utils/apiModeUtils';

/**
 * [API Rate Limiting State Management]
 * Tracks quota exhaustion to prevent repeated failed requests
 */
interface ApiQuotaState {
    isExhausted: boolean;
    lastExhaustedTime: number;
    nextRetryTime: number;
}

const QUOTA_STATE_KEY = 'psi_api_quota_state';
const QUOTA_RECOVERY_MINUTES = 60; // 1 hour default recovery time
const OCR_MODEL_PRIMARY = 'gemini-3.0-flash';
const OCR_MODEL_FALLBACK = 'gemini-3-flash-preview';
const REASONING_MODEL_PRIMARY = 'gemini-3.1-pro-preview';
const REASONING_MODEL_FALLBACK = 'gemini-3-flash-preview';

const getQuotaState = (): ApiQuotaState => {
    try {
        const stored = localStorage.getItem(QUOTA_STATE_KEY);
        if (!stored) return { isExhausted: false, lastExhaustedTime: 0, nextRetryTime: 0 };
        
        const state: ApiQuotaState = JSON.parse(stored);
        const now = Date.now();
        
        // Auto-recover after QUOTA_RECOVERY_MINUTES
        if (state.isExhausted && now > state.nextRetryTime) {
            state.isExhausted = false;
        }
        
        return state;
    } catch (e) {
        return { isExhausted: false, lastExhaustedTime: 0, nextRetryTime: 0 };
    }
};

const setQuotaExhausted = (exhaustedMinutes: number = QUOTA_RECOVERY_MINUTES) => {
    const now = Date.now();
    const state: ApiQuotaState = {
        isExhausted: true,
        lastExhaustedTime: now,
        nextRetryTime: now + (exhaustedMinutes * 60 * 1000)
    };
    localStorage.setItem(QUOTA_STATE_KEY, JSON.stringify(state));
};

const clearQuotaState = () => {
    localStorage.removeItem(QUOTA_STATE_KEY);
};

/**
 * [Detect API Rate Limit Error]
 * Returns true if error is a 429/quota exhaustion error
 */
const isRateLimitError = (errorMsg: string): boolean => {
    const msg = errorMsg.toLowerCase();
    return msg.includes('429') || 
           msg.includes('resource_exhausted') || 
           msg.includes('exhausted') || 
           msg.includes('quota exceeded') || 
           msg.includes('rate limit') ||
           msg.includes('too many requests');
};

const isModelAvailabilityError = (errorMsg: string): boolean => {
    const msg = errorMsg.toLowerCase();
    return msg.includes('404') ||
           msg.includes('model') && (msg.includes('not found') || msg.includes('unsupported') || msg.includes('unavailable'));
};

const getAiInstance = () => {
    const isPaidApiMode = getIsPaidApiMode();
    const apiKey = isPaidApiMode
        ? (localStorage.getItem('paidApiKey') || '')
        : (localStorage.getItem('freeApiKey') || '');

    if (!apiKey) {
        throw new Error('설정 화면에서 API 키를 먼저 입력해주세요.');
    }

    return new GoogleGenAI({ apiKey });
};

// --- Schemas (Defined exactly as before) ---
const workerRecordSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            name: { type: Type.STRING },
            employeeId: { type: Type.STRING, description: "사번 또는 근로자 식별번호" },
            qrId: { type: Type.STRING, description: "QR/NFC 식별자" },
            jobField: { type: Type.STRING },
            teamLeader: { type: Type.STRING, description: "팀장 이름 (Team Leader Name)" },
            ocrConfidence: { type: Type.NUMBER, description: "OCR 판독 신뢰도(0~1)" },
            signatureMatchScore: { type: Type.NUMBER, description: "서명 일치 점수(0~1)" },
            role: { 
                type: Type.STRING, 
                enum: ['worker', 'leader', 'sub_leader'], 
                description: "직급/위계: 팀장(leader), 부팀장/반장(sub_leader), 일반팀원(worker)" 
            },
            isTranslator: { type: Type.BOOLEAN, description: "통역 업무 수행 여부" },
            isSignalman: { type: Type.BOOLEAN, description: "신호수/유도원 업무 수행 여부" },
            date: { type: Type.STRING },
            nationality: { type: Type.STRING },
            language: { type: Type.STRING },
            handwrittenAnswers: {
                type: Type.ARRAY,
                items: {
                    type: Type.OBJECT,
                    properties: {
                        questionNumber: { type: Type.STRING },
                        answerText: { type: Type.STRING },
                        koreanTranslation: { type: Type.STRING },
                    }
                }
            },
            fullText: { type: Type.STRING },
            koreanTranslation: { type: Type.STRING },
            safetyScore: { type: Type.NUMBER },
            safetyLevel: { type: Type.STRING, enum: ['초급', '중급', '고급'] },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            strengths_native: { type: Type.ARRAY, items: { type: Type.STRING } },
            weakAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
            weakAreas_native: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvement: { type: Type.STRING },
            improvement_native: { type: Type.STRING },
            suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestions_native: { type: Type.ARRAY, items: { type: Type.STRING } },
            aiInsights: { type: Type.STRING },
            aiInsights_native: { type: Type.STRING },
            scoreReasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
            selfAssessedRiskLevel: { type: Type.STRING, enum: ['상', '중', '하'] },
            psychologicalAnalysis: {
                type: Type.OBJECT,
                properties: {
                    pressureLevel: { type: Type.STRING, enum: ['high', 'medium', 'low'], description: "Pen pressure level based on stroke width and darkness" },
                    hasLayoutIssue: { type: Type.BOOLEAN, description: "Whether text violates layout boundaries or margins" }
                }
            },
        },
        required: ["name", "jobField", "date", "nationality", "safetyScore", "safetyLevel"]
    }
};

const updateSchema = {
    type: Type.OBJECT,
    properties: {
        strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
        strengths_native: { type: Type.ARRAY, items: { type: Type.STRING } },
        weakAreas: { type: Type.ARRAY, items: { type: Type.STRING } },
        weakAreas_native: { type: Type.ARRAY, items: { type: Type.STRING } },
        safetyScore: { type: Type.NUMBER },
        safetyLevel: { type: Type.STRING, enum: ['초급', '중급', '고급'] },
        aiInsights: { type: Type.STRING },
        aiInsights_native: { type: Type.STRING },
        scoreReasoning: { type: Type.ARRAY, items: { type: Type.STRING } },
        koreanTranslation: { type: Type.STRING },
    },
    required: ["strengths", "strengths_native", "weakAreas", "weakAreas_native", "safetyScore", "safetyLevel", "aiInsights", "aiInsights_native", "scoreReasoning"]
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const classifyOcrErrorType = (rawMessage: string): OcrErrorType => {
    const message = (rawMessage || '').toLowerCase();

    if (
        message.includes('모서리') ||
        message.includes('잘림') ||
        message.includes('crop') ||
        message.includes('layout') ||
        message.includes('배경') ||
        message.includes('바닥')
    ) {
        return 'LAYOUT';
    }

    if (
        message.includes('해상도') ||
        message.includes('low resolution') ||
        message.includes('too short') ||
        message.includes('너무 멀') ||
        message.includes('small text')
    ) {
        return 'RESOLUTION';
    }

    if (
        message.includes('악필') ||
        message.includes('손글씨') ||
        message.includes('handwriting') ||
        message.includes('illegible') ||
        message.includes('인식 불가 언어') ||
        message.includes('cannot recognize language')
    ) {
        return 'HANDWRITING';
    }

    if (
        message.includes('반사') ||
        message.includes('그림자') ||
        message.includes('초점') ||
        message.includes('흔들') ||
        message.includes('blur') ||
        message.includes('glare') ||
        message.includes('shadow')
    ) {
        return 'QUALITY';
    }

    return 'UNKNOWN';
};

const detectTextBasedOcrError = (record: WorkerRecord): OcrErrorType | null => {
    const fullText = String(record.fullText || '');
    const handwrittenCount = Array.isArray(record.handwrittenAnswers) ? record.handwrittenAnswers.length : 0;
    const compactText = fullText.replace(/\s+/g, '');

    if (compactText.length <= 18 && handwrittenCount === 0) {
        return 'RESOLUTION';
    }

    const noisyChars = compactText.match(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ一-龥ぁ-ゔァ-ヴー々〆〤.,:;()\-_/]/g) || [];
    const noiseRatio = compactText.length > 0 ? noisyChars.length / compactText.length : 0;
    if (compactText.length > 0 && noiseRatio > 0.35) {
        return compactText.length < 40 ? 'RESOLUTION' : 'HANDWRITING';
    }

    if (compactText.length > 0 && compactText.length < 35 && handwrittenCount > 0) {
        return 'HANDWRITING';
    }

    return null;
};

const createOcrErrorRecord = (
    imageSource: string,
    filenameHint: string | undefined,
    name: string,
    insight: string,
    ocrErrorType: OcrErrorType
): WorkerRecord => ({
    id: `rec-err-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    jobField: '미분류',
    teamLeader: '미지정',
    role: 'worker',
    isTranslator: false,
    isSignalman: false,
    date: new Date().toISOString().split('T')[0],
    nationality: '미상',
    safetyScore: 0,
    safetyLevel: '초급',
    originalImage: imageSource,
    filename: filenameHint,
    language: 'unknown',
    handwrittenAnswers: [],
    fullText: '분석 실패',
    koreanTranslation: 'OCR 분석에 실패했습니다.',
    strengths: [],
    strengths_native: [],
    weakAreas: ['분석 오류'],
    weakAreas_native: [],
    improvement: '',
    improvement_native: '',
    suggestions: [],
    suggestions_native: [],
    aiInsights: insight,
    aiInsights_native: '',
    selfAssessedRiskLevel: '중',
    ocrErrorType,
    ocrErrorMessage: insight,
});

const parseJsonObjectFromText = (rawText: string): Record<string, unknown> | null => {
    const text = (rawText || '').trim();
    if (!text) return null;

    const stripFence = (value: string): string => {
        const fenced = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        return fenced ? fenced[1].trim() : value;
    };

    const candidate = stripFence(text);

    try {
        const parsed = JSON.parse(candidate);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        const firstBrace = candidate.indexOf('{');
        const lastBrace = candidate.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const sliced = candidate.slice(firstBrace, lastBrace + 1);
            try {
                const parsed = JSON.parse(sliced);
                return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
            } catch {
                return null;
            }
        }
        return null;
    }
};

const clampScore = (value: unknown, fallback = 0): number => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return Math.max(0, Math.min(100, Math.round(fallback)));
    return Math.max(0, Math.min(100, Math.round(numeric)));
};

const scoreToSafetyLevel = (score: number): WorkerRecord['safetyLevel'] => {
    return getSafetyLevelFromScore(score);
};

const normalizeScoreReasoning = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => String(item || '').trim())
        .filter(item => item.length > 0)
        .slice(0, 8);
};

const enforceScoreGradeConsistency = (
    scoreInput: unknown,
    levelInput: unknown,
    reasoningInput: unknown,
    fallbackScore: number
): { safetyScore: number; safetyLevel: WorkerRecord['safetyLevel']; scoreReasoning: string[] } => {
    const safetyScore = clampScore(scoreInput, fallbackScore);
    const derivedLevel = scoreToSafetyLevel(safetyScore);
    const requestedLevel = (typeof levelInput === 'string' ? levelInput : '').trim();
    const scoreReasoning = normalizeScoreReasoning(reasoningInput);

    if (requestedLevel && requestedLevel !== derivedLevel) {
        scoreReasoning.push(`점수-등급 정합성 검증에 따라 등급을 ${derivedLevel}으로 보정함 (기준: 90/70점)`);
    }

    return {
        safetyScore,
        safetyLevel: derivedLevel,
        scoreReasoning,
    };
};

export interface ExternalIssueAnalysisResult {
    issueDate: string;
    location: string;
    summary: string;
    riskLevel: 'High' | 'Medium' | 'Low';
    requiredAction: string;
}



const LANGUAGE_POLICY = `
**언어 및 국적 표준화 정책 (엄격 준수)**:
1. **국적 표기 통일**: 분석 대상의 국적(Nationality)이 '한국', 'Korea', 'South Korea', 'ROK' 등으로 식별될 경우, 반드시 **'대한민국'**으로 저장하라.
   그 외 국가는 통용되는 한글 명칭을 사용한다 (예: 베트남, 중국, 태국, 우즈베키스탄 등).

2. **모국어 필드(_native)**:
   - **대한민국** -> 한국어 (Korean) (native 필드도 한국어로 전문적으로 재기술)
   - **중국** -> 중국어 간체 (Simplified Chinese)
   - **베트남** -> 베트남어 (Vietnamese)
   - **태국** -> 태국어 (Thai)
   - **우즈베키스탄** -> 우즈베크어 (Uzbek)
   - **인도네시아** -> 인도네시아어 (Indonesian)
   - **몽골** -> 몽골어 (Mongolian)
   - **캄보디아** -> 크메르어 (Khmer)
   - **러시아/카자흐스탄** -> 러시아어 (Russian)

**번역 지침**:
단순 직역이 아닌, 건설 현장에서 통용되는 '안전 전문 용어'로 의역하라.
(예: 'Falling' -> '추락(Fall from height)', 'Struck by' -> '협착/충돌')
`;

const STRICT_SCORE_POLICY = `
**엄격한 정량적 평가 기준 (필수 적용)**:
1) 채점 축과 가중치:
    - w1 무결성(Integrity): 25%
    - w2 업무 이해도(Job Understanding): 25%
    - w3 위험성평가 이해도(Risk Assessment Understanding): 35%
    - w4 실행 가능성(Actionability): 15%
    - 최종점수 = round(w1*0.25 + w2*0.25 + w3*0.35 + w4*0.15)

2) 상투어 필터링 강제 페널티:
    - 구체적 장비명(예: 그라인더, 안전대, 펌프카 등) 또는 공종 특화 위험요인이 없고,
      "안전하게 작업", "주변 경계", "정리정돈" 등 범용 문구만 반복되면
      w1(무결성)과 w2(업무 이해도)를 각각 30점 이하로 강제 제한.

3) 공종 일치도 검증 강제:
    - 입력된 근로자 공종(jobField)과 작성 위험요인이 논리적으로 전혀 맞지 않으면
      "허위/무지성 작성"으로 판정하고 최종점수를 59점 이하로 강제 제한,
      최종 등급은 반드시 최하(초급/Red)로 산정.

4) 등급 매핑(내부 크로스체크 필수):
    - 80점 이상: 고급(🟢S/안전)
    - 60~79점: 중급(🟡A/주의)
    - 60점 미만: 초급(🔴B/위험)
    점수와 등급이 불일치하면 반드시 점수 기준 등급으로 보정 후 응답.

5) 상세 채점 근거 출력:
    - scoreReasoning 배열에 가점/감점 근거를 구체 문장으로 반드시 기록.
    - 예: "구체적 장비명 누락 및 상투적 문구 반복으로 무결성 점수 차감됨"
`;

/**
 * [Nationality Normalization]
 * LANGUAGE_POLICY 준수: AI 분석 결과의 국적 필드를 표준화된 형식으로 변환
 * Normalizes nationality to standard format per LANGUAGE_POLICY
 */
function normalizeNationality(rawNationality: string): string {
    if (!rawNationality) return '미상';
    
    const nation = (rawNationality || '').trim().toLowerCase();
    
    // 한국인 정규화: 대한민국으로 통일
    if (nation.includes('한국') || nation.includes('korea') || nation.includes('ROK') || nation.includes('south korea')) {
        return '대한민국';
    }
    
    // 다른 국가들: 공식 한글 표기로 통일
    if (nation.includes('베트남') || nation.includes('vietnam')) return '베트남';
    if (nation.includes('중국') || nation.includes('china')) return '중국';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan')) return '우즈베키스탄';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return '인도네시아';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return '캄보디아';
    if (nation.includes('몽골') || nation.includes('mongolia')) return '몽골';
    if (nation.includes('필리핀') || nation.includes('philippines')) return '필리핀';
    if (nation.includes('카자흐') || nation.includes('kazakhstan')) return '카자흐스탄';
    if (nation.includes('러시아') || nation.includes('russia')) return '러시아';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return '미얀마';
    
    // 원본 반환 (미분류)
    return rawNationality;
}

/**
 * [Enhanced Mime Detector - Step 3 Image Format Compatibility]
 * Detects the real MIME type based on Base64 Magic Bytes (File Signatures).
 * Supports: PNG, JPEG, GIF, WebP, HEIC, TIFF, BMP, SVG
 * Fixes issues where header says 'image/jpeg' but data is actually 'image/png'.
 */
function detectMimeTypeFromBase64(base64Data: string): string {
    if (!base64Data || base64Data.length < 12) return 'image/jpeg';
    
    // First 12+ characters contain magic bytes for format detection
    const signature = base64Data.substring(0, 16);
    
    // Check for various image formats by their magic bytes
    // PNG: iVBORw0KGgo=
    if (signature.startsWith('iVBORw0KGgo')) return 'image/png';
    
    // JPEG: /9j/ (covers JPEG, JPG)
    if (signature.startsWith('/9j/')) return 'image/jpeg';
    
    // GIF: R0lGOD (GIF87a or GIF89a)
    if (signature.startsWith('R0lGOD')) return 'image/gif';
    
    // WebP: UklGR
    if (signature.startsWith('UklGR')) return 'image/webp';
    
    // HEIC: AAAAFftM or similar HEIC signatures
    if (signature.startsWith('AAAAFftM') || signature.includes('ftyp')) return 'image/heic';
    
    // TIFF: SUQy (Intel byte order) or MM (Motorola byte order)
    if (signature.startsWith('SUQy') || signature.startsWith('TU0=')) return 'image/tiff';
    
    // BMP: Qk0= (BM signature)
    if (signature.startsWith('Qk0=')) return 'image/bmp';
    
    // SVG: PHN2ZyA= (<svg )
    if (signature.startsWith('PHN2ZyA=') || signature.startsWith('PHN2Zw==')) return 'image/svg+xml';
    
    // Default fallback (assume JPEG for compatibility)
    return 'image/jpeg';
}

/**
 * [Robust Image Cleaner - 개선]
 * Extracts pure Base64 data and corrects MIME type with better error handling
 */
function getCleanImagePayload(input: string): { data: string, mimeType: string } {
    if (!input || typeof input !== 'string' || input.length < 50) {
        throw new Error("Image data is empty or too short.");
    }

    let cleanData = input.trim();
    let detectedMime = '';

    // 1. Remove Header if present (안전한 분할)
    if (cleanData.includes('base64,')) {
        const parts = cleanData.split('base64,');
        // 마지막 부분을 사용하여 여러 헤더 또는 중복된 ',' 대비
        cleanData = parts[parts.length - 1];
    }

    // 2. Clean whitespace
    cleanData = cleanData.replace(/[\r\n\s]/g, '');

    // 3. 최종 검증: 최소 데이터 크기 확인
    if (!cleanData || cleanData.length < 100) {
        throw new Error("Cleaned image data is too short or invalid.");
    }

    // 4. Detect Real MIME Type (Magic Bytes)
    detectedMime = detectMimeTypeFromBase64(cleanData);

    return { data: cleanData, mimeType: detectedMime };
}

/**
 * [Step 3 Image Format Validation]
 * Validates image format compatibility and detects format errors
 * Returns: { isValid: boolean, detectedFormat: string, supportedFormat: boolean, error?: string }
 */
function validateImageFormat(base64Data: string): { isValid: boolean; detectedFormat: string; supportedFormat: boolean; error?: string } {
    if (!base64Data || base64Data.length < 50) {
        return { isValid: false, detectedFormat: 'unknown', supportedFormat: false, error: 'Image data too short' };
    }

    const detectedMime = detectMimeTypeFromBase64(base64Data);
    const supportedFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/tiff', 'image/bmp', 'image/svg+xml'];
    const isSupported = supportedFormats.includes(detectedMime);

    // Additional validation: check for common corruption patterns
    if (base64Data.includes('null') || base64Data.includes('undefined') || base64Data.includes('NaN')) {
        return { isValid: false, detectedFormat: detectedMime, supportedFormat: isSupported, error: 'Corrupted data detected' };
    }

    // Validate base64 format (only alphanumeric + /+= allowed with whitespace)
    const base64Regex = /^[A-Za-z0-9+/=\s]*$/;
    if (!base64Regex.test(base64Data)) {
        return { isValid: false, detectedFormat: detectedMime, supportedFormat: isSupported, error: 'Invalid base64 characters' };
    }

    return { isValid: true, detectedFormat: detectedMime, supportedFormat: isSupported };
}

/**
 * [Image Format Compatibility Check]
 * Checks if the detected image format is compatible with Gemini AI
 * Gemini supports: JPEG, PNG, GIF, WebP, HEIC
 */
function isFormatCompatibleWithAI(mimeType: string): boolean {
    const aiSupportedFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic'];
    return aiSupportedFormats.includes(mimeType);
}

/**
 * [Robust] Call Gemini with Auto-Parsing and Aggressive Rate Limit Handling
 */
async function callGeminiWithRetry(
    imageSource: string, 
    _unusedMimeType: string | null, 
    modelName: string, 
    filenameHint?: string, 
    maxRetries = 3, // Increased default retries
    fallbackModelName?: string
): Promise<WorkerRecord[]> {
    let lastError: unknown;
    let ai;

    try {
        ai = getAiInstance();
    } catch (e: unknown) {
        // Return a special error record that alerts the UI about missing key
        const errMsg = extractMessage(e);
        return [createOcrErrorRecord(imageSource, filenameHint, '설정 필요', `⛔ ${errMsg}`, 'UNKNOWN')];
    }
    
    // 1. Prepare Data
    let imageData: string;
    let mimeType: string;

    try {
        const payload = getCleanImagePayload(imageSource);
        imageData = payload.data;
        mimeType = payload.mimeType;
        
        // Only log in non-production/dev debug environments to avoid leaking info in prod
        const isDevWindow = getWindowProp<boolean>('__DEV__');
        if (import.meta.env.DEV || isDevWindow) {
            console.log(`[Gemini] Processing image: ${mimeType}, length: ${imageData.length}`);
        }
    } catch (e: unknown) {
        console.error("Image Processing Failed:", e);
        const errMsg = extractMessage(e);
        const errorType = classifyOcrErrorType(errMsg);
        return [createOcrErrorRecord(imageSource, filenameHint, '이미지 데이터 유실', `오류: ${errMsg}`, errorType)];
    }

    // 2. Retry Loop with Aggressive Backoff
    // [IMPROVED] Add total wait time protection
    const startTime = Date.now();
    const MAX_TOTAL_WAIT_MS = 120000; // 2 minutes maximum total wait time
    
    let activeModelName = modelName;
    let fallbackActivated = false;

    for (let i = 0; i < maxRetries; i++) {
        // Check if total wait time exceeded
        if (Date.now() - startTime > MAX_TOTAL_WAIT_MS) {
            console.warn(`Total wait time exceeded ${MAX_TOTAL_WAIT_MS/1000}s for ${filenameHint}`);
            lastError = new Error('최대 대기 시간 초과 (2분). API 응답 실패.');
            break;
        }
        
        try {
            const systemInstruction = `
            **역할**: 건설현장 안전관리 전문가.
            **임무**: 수기 위험성 평가표 이미지를 분석하여 데이터 추출 및 엄격 정량 채점 수행.
            ${LANGUAGE_POLICY}
            ${STRICT_SCORE_POLICY}
            
            **강조**: 분석 결과에서 핵심 위험 요인은 '작은따옴표'로 강조.
            **직책 식별**: '팀장/소장'은 'leader', '부팀장/반장'은 'sub_leader', 그 외 'worker'.
            **임무 식별**: '통역' -> isTranslator=true, '신호수/유도원' -> isSignalman=true.

            **정량 채점 실행 규칙(필수)**:
            1. handwrittenAnswers, fullText, koreanTranslation에서 위험요인/대책의 구체성(장비명, 공종특화 표현)을 먼저 평가.
            2. 상투어 필터 조건 충족 시 w1/w2를 각각 30점 이하로 강제 제한.
            3. 공종-위험요인 불일치 시 "허위/무지성 작성"으로 판정하여 safetyScore를 59점 이하로 제한하고 safetyLevel=초급.
            4. aiInsights에는 종합 판정 요약을 작성하고, scoreReasoning 배열에는 감점/가점 근거를 항목별로 기록.
            5. 최종 반환 전 safetyScore(0~100)와 safetyLevel(고급/중급/초급) 정합성(80/60 기준)을 내부 검증.
            
            **심리 분석 (psychologicalAnalysis)**:
            1. **필압 (pressureLevel)**: 글씨의 굵기와 진하기를 분석하여 'high'(매우 진하고 굵음), 'medium'(보통), 'low'(흐리고 가늠) 판정.
            2. **레이아웃 위반 (hasLayoutIssue)**: 텍스트가 지정된 영역/여백을 벗어나거나 칸을 넘어가면 true, 정상이면 false.

            **신뢰도/식별 필드**:
            1. ocrConfidence(0~1)를 반드시 산출.
            2. employeeId, qrId, signatureMatchScore(0~1)를 가능한 범위에서 채움.
            `;

            const prompt = `위험성 평가 문서를 분석하십시오. 파일명: ${filenameHint || 'unknown'}.
            한국인은 한국어로, 외국인은 한국어와 모국어를 병기하여 JSON으로 출력하십시오.
            반드시 scoreReasoning 배열을 포함하고, 점수-등급 일치(80/60 기준)를 확인한 후 반환하십시오.`;
            
            const imagePart = { inlineData: { data: imageData, mimeType: mimeType } };

            const response = await ai.models.generateContent({
                model: activeModelName,
                contents: { parts: [{ text: prompt }, imagePart] },
                config: {
                    systemInstruction: systemInstruction,
                    responseMimeType: "application/json",
                    responseSchema: workerRecordSchema,
                    temperature: 0.1,
                }
            });

            if (response.text) {
                try {
                    const parsed = JSON.parse(response.text.trim());
                    if (!Array.isArray(parsed)) throw new Error('AI response is not an array');
                    return parsed.map((r: Record<string, unknown>) => {
                        const id = (r['id'] as string) || `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
                        const name = (r['name'] as string) || "식별 대기";
                        const employeeId = (r['employeeId'] as string) || undefined;
                        const qrId = (r['qrId'] as string) || undefined;
                        const jobField = (r['jobField'] as string) || "기타";
                        const teamLeader = (r['teamLeader'] as string) || "미지정";
                        const ocrConfidence = typeof r['ocrConfidence'] === 'number' ? (r['ocrConfidence'] as number) : 0.9;
                        const signatureMatchScore = typeof r['signatureMatchScore'] === 'number' ? (r['signatureMatchScore'] as number) : undefined;
                        const role = (r['role'] as string) as ('worker'|'leader'|'sub_leader') || 'worker';
                        const isTranslator = Boolean(r['isTranslator']);
                        const isSignalman = Boolean(r['isSignalman']);
                        const date = (r['date'] as string) || new Date().toISOString().split('T')[0];
                        // [CRITICAL] 국적 정규화 (LANGUAGE_POLICY 준수)
                        const nationality = normalizeNationality((r['nationality'] as string) || '미상');
                        const normalizedScoreAndLevel = enforceScoreGradeConsistency(
                            r['safetyScore'],
                            r['safetyLevel'],
                            r['scoreReasoning'],
                            0
                        );
                        const safetyScore = normalizedScoreAndLevel.safetyScore;
                        const safetyLevel = normalizedScoreAndLevel.safetyLevel;

                        const baseRecord: WorkerRecord = {
                            id,
                            name,
                            employeeId,
                            qrId,
                            jobField,
                            teamLeader,
                            ocrConfidence,
                            signatureMatchScore,
                            matchMethod: employeeId ? 'employeeId' : qrId ? 'qr' : (typeof signatureMatchScore === 'number' ? 'signature' : role ? 'role' : 'name'),
                            role,
                            isTranslator,
                            isSignalman,
                            date,
                            nationality,
                            safetyScore,
                            safetyLevel,
                            originalImage: imageSource,
                            filename: filenameHint,
                            language: (r['language'] as string) || 'unknown',
                            handwrittenAnswers: Array.isArray(r['handwrittenAnswers']) ? (r['handwrittenAnswers'] as unknown as HandwrittenAnswer[]) : [],
                            fullText: (r['fullText'] as string) || '',
                            koreanTranslation: (r['koreanTranslation'] as string) || '',
                            strengths: Array.isArray(r['strengths']) ? (r['strengths'] as string[]) : [],
                            strengths_native: Array.isArray(r['strengths_native']) ? (r['strengths_native'] as string[]) : [],
                            weakAreas: Array.isArray(r['weakAreas']) ? (r['weakAreas'] as string[]) : [],
                            weakAreas_native: Array.isArray(r['weakAreas_native']) ? (r['weakAreas_native'] as string[]) : [],
                            improvement: (r['improvement'] as string) || '',
                            improvement_native: (r['improvement_native'] as string) || '',
                            suggestions: Array.isArray(r['suggestions']) ? (r['suggestions'] as string[]) : [],
                            suggestions_native: Array.isArray(r['suggestions_native']) ? (r['suggestions_native'] as string[]) : [],
                            aiInsights: (r['aiInsights'] as string) || '',
                            aiInsights_native: (r['aiInsights_native'] as string) || '',
                            scoreReasoning: normalizedScoreAndLevel.scoreReasoning,
                            selfAssessedRiskLevel: (r['selfAssessedRiskLevel'] as string) || '중',
                            psychologicalAnalysis: r['psychologicalAnalysis'] ? {
                                pressureLevel: ((r['psychologicalAnalysis'] as Record<string, unknown>)['pressureLevel'] as string) || 'medium',
                                hasLayoutIssue: Boolean((r['psychologicalAnalysis'] as Record<string, unknown>)['hasLayoutIssue'])
                            } : undefined,
                            actionHistory: [],
                            approvalHistory: [],
                            correctionHistory: [],
                            auditTrail: [{ stage: 'ocr', timestamp: new Date().toISOString(), actor: 'ai-engine', note: 'OCR 분석 완료' }],
                        };

                        const withIntegrity: WorkerRecord = {
                            ...baseRecord,
                            integrityScore: deriveIntegrityScore(baseRecord),
                        };

                        const textBasedErrorType = detectTextBasedOcrError(withIntegrity);
                        const withOcrTag: WorkerRecord = textBasedErrorType
                            ? {
                                ...withIntegrity,
                                ocrErrorType: textBasedErrorType,
                                ocrErrorMessage: textBasedErrorType === 'HANDWRITING'
                                    ? '필기 인식 난이도가 높습니다.'
                                    : '추출 텍스트가 너무 적어 해상도/거리 문제 가능성이 큽니다.',
                                ocrConfidence: Math.min(typeof withIntegrity.ocrConfidence === 'number' ? withIntegrity.ocrConfidence : 1, 0.55),
                            }
                            : withIntegrity;

                        const enforced = enforceSafetyLevel(withOcrTag);
                        const verified = enforceScoreGradeConsistency(
                            enforced.safetyScore,
                            enforced.safetyLevel,
                            enforced.scoreReasoning,
                            safetyScore
                        );

                        return {
                            ...enforced,
                            safetyScore: verified.safetyScore,
                            safetyLevel: verified.safetyLevel,
                            scoreReasoning: verified.scoreReasoning,
                        };
                    });
                } catch (parseErr: unknown) {
                    console.error("Parsing AI response failed:", parseErr);
                    console.error("Raw AI response:", response.text);
                    // Let outer catch handle retry/backoff by throwing
                    throw parseErr;
                }
            }
            throw new Error("AI returned empty response");
            
        } catch (e: unknown) {
            const errMsg = extractMessage(e);
            lastError = { message: errMsg };
            const errorMsg = errMsg;
            console.warn(`Attempt ${i + 1} failed for ${filenameHint}:`, errorMsg);

            if (fallbackModelName && !fallbackActivated && isModelAvailabilityError(errorMsg)) {
                console.warn(`[Model Fallback] ${activeModelName} -> ${fallbackModelName}`);
                activeModelName = fallbackModelName;
                fallbackActivated = true;
                continue;
            }
            
            // Critical errors: Don't retry
            if (errorMsg.includes('400') || errorMsg.includes('INVALID_ARGUMENT')) {
                lastError = new Error(`이미지 포맷(${mimeType})을 AI가 인식하지 못했습니다.`);
                break;
            }
            
            // Rate limit errors: Aggressive Backoff
            // 429: Too Many Requests, RESOURCE_EXHAUSTED
            if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota')) {
                // [IMPROVED] Use setQuotaExhausted to track quota state
                setQuotaExhausted(60); // Set 60-minute recovery time
                
                // [IMPROVED] Cap wait time to avoid exceeding total wait budget
                const waitTime = Math.min(15000 * (i + 1), 60000); // Cap at 60s
                console.warn(`[Quota Limit] Backing off for ${waitTime/1000}s... Recovery time set.`);
                await delay(waitTime);
            } else if (i < maxRetries - 1) {
                // Standard error backoff
                await delay(3000 * (i + 1)); 
            }
        }
    }

    console.error("Final failure for", filenameHint, lastError);

    // Ensure 429 is propagated in the error text for the UI to detect
    const lastMsg = extractMessage(lastError);
    const isQuotaError = lastMsg.includes('429') || lastMsg.includes('RESOURCE_EXHAUSTED');
    const finalErrorMsg = isQuotaError
        ? `할당량 초과 (429 RESOURCE_EXHAUSTED). 잠시 후 다시 시도됩니다.`
        : `오류 상세: ${lastMsg || '알 수 없는 오류'}`;

    const finalErrorType = isQuotaError ? 'UNKNOWN' : classifyOcrErrorType(finalErrorMsg);

    return [createOcrErrorRecord(
        imageSource,
        filenameHint,
        isQuotaError ? '할당량 초과 (대기중)' : '분석 실패 (재시도 필요)',
        finalErrorMsg,
        finalErrorType
    )];
}

export async function updateAnalysisBasedOnEdits(record: WorkerRecord): Promise<Partial<WorkerRecord> | null> {
    const quotaState = getQuotaState();
    if (quotaState.isExhausted) {
        const remainingSeconds = Math.ceil((quotaState.nextRetryTime - Date.now()) / 1000);
        if (remainingSeconds > 0) {
            throw new Error(`API 할당량 회복 대기 중입니다. 약 ${remainingSeconds}초 후 재시도해주세요.`);
        }
        clearQuotaState();
    }

    const ai = getAiInstance();
    const specialDuties = [];
    if (record.isTranslator) specialDuties.push("통역(Translator)");
    if (record.isSignalman) specialDuties.push("신호수(Signalman)");
    const dutyStr = specialDuties.length > 0 ? specialDuties.join(", ") : "없음";

    const latestCorrection = (record.correctionHistory || []).slice(-1)[0];
    const previousValues = latestCorrection?.previousValues || {};
    const originalSnapshot = {
        name: String(previousValues['name'] ?? record.name),
        jobField: String(previousValues['jobField'] ?? record.jobField),
        handwrittenAnswers: previousValues['handwrittenAnswers'] ?? record.handwrittenAnswers,
        fullText: String(previousValues['fullText'] ?? record.fullText),
        weakAreas: previousValues['weakAreas'] ?? record.weakAreas,
        aiInsights: String(previousValues['aiInsights'] ?? record.aiInsights),
        safetyScore: clampScore(previousValues['safetyScore'], record.safetyScore),
        safetyLevel: String(previousValues['safetyLevel'] ?? record.safetyLevel),
    };

    const finalSnapshot = {
        name: record.name,
        nationality: record.nationality,
        jobField: record.jobField,
        teamLeader: record.teamLeader || '미지정',
        role: record.role || 'worker',
        specialDuty: dutyStr,
        handwrittenAnswers: record.handwrittenAnswers,
        fullText: record.fullText,
        weakAreas: record.weakAreas,
        strengths: record.strengths,
        aiInsights: record.aiInsights,
        safetyScore: clampScore(record.safetyScore, 0),
        safetyLevel: record.safetyLevel,
    };

    const systemInstruction = `
    **역할**: 당신은 신규 평가자가 아니라, 원본 대비 수정 편차(Delta)를 계산하는 깐깐한 안전 감사관이다.
    **임무**: [근로자 원본 데이터]와 [관리자 수정 최종 데이터]를 비교해 기존 분석을 감사 방식으로 갱신.
    ${LANGUAGE_POLICY}
    ${STRICT_SCORE_POLICY}

    **2차 분석 편차 규칙 (강제)**:
    1. 중대 페널티: 관리자 최종본에 원본에 없던 '치명적 위험(High)' 또는 '핵심 안전 대책'이 새로 추가되면,
       근로자가 핵심 위험을 놓친 것으로 판정하고 w3(위험성평가 이해도)를 기존 대비 절반 이하로 대폭 하향.
       이때 scoreReasoning에 반드시 "관리자 개입으로 핵심 위험/대책이 추가되어 이해도 점수 대폭 차감" 취지의 근거를 남긴다.

    2. 면책 조항: 오타/맞춤법/문맥 다듬기 수준의 경미 수정만 있으면,
       safetyScore와 safetyLevel을 기존값과 절대 동일하게 유지하고 점수 재산정 금지.
       scoreReasoning에는 "경미 수정으로 기존 점수·등급 유지"를 명시한다.

    3. 출력 데이터는 반드시 JSON 스키마를 준수하고, 점수-등급 일관성 검증을 내부 수행한 뒤 반환한다.
    `;

    const prompt = `
    아래 두 데이터의 차이(Delta)를 기반으로 strengths, weakAreas, aiInsights, native 필드, safetyScore, safetyLevel, scoreReasoning을 갱신하라.

    [근로자 원본 데이터]
    ${JSON.stringify(originalSnapshot)}

    [관리자가 수정한 최종 데이터]
    ${JSON.stringify(finalSnapshot)}

    [응답 규칙]
    - scoreReasoning은 최소 1개 이상 작성.
    - 점수/등급 기준: 80점↑ 고급, 60~79 중급, 60 미만 초급.
    - 점수와 등급이 불일치하면 반드시 점수 기준으로 보정.
    `;

    const requestConfig = {
        contents: { parts: [{ text: prompt }] },
        config: {
            systemInstruction: systemInstruction,
            responseMimeType: "application/json",
            responseSchema: updateSchema,
            temperature: 0.3,
        }
    };

    const candidateModels = [
        REASONING_MODEL_PRIMARY,
        REASONING_MODEL_FALLBACK,
        OCR_MODEL_PRIMARY,
    ];

    let lastError: unknown = null;

    for (const modelName of candidateModels) {
        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await ai.models.generateContent({
                    model: modelName,
                    ...requestConfig,
                });

                const parsed = response.text ? parseJsonObjectFromText(response.text) : null;
                if (parsed) {
                    const normalized = enforceScoreGradeConsistency(
                        parsed['safetyScore'],
                        parsed['safetyLevel'],
                        parsed['scoreReasoning'],
                        record.safetyScore
                    );

                    const normalizedResult: Partial<WorkerRecord> = {
                        ...parsed,
                        safetyScore: normalized.safetyScore,
                        safetyLevel: normalized.safetyLevel,
                        scoreReasoning: normalized.scoreReasoning,
                    };

                    clearQuotaState();
                    return normalizedResult;
                }

                throw new Error(`AI 응답 파싱 실패: ${modelName} 응답이 JSON 형식이 아닙니다.`);
            } catch (e: unknown) {
                lastError = e;
                const errorMsg = extractMessage(e);

                if (isModelAvailabilityError(errorMsg)) {
                    console.warn(`[Model Fallback] ${modelName} 사용 불가 -> 다음 모델 시도`);
                    break;
                }

                if (isRateLimitError(errorMsg)) {
                    const cooldownMinutes = 10;
                    setQuotaExhausted(cooldownMinutes);
                    if (attempt < maxAttempts - 1) {
                        const waitMs = Math.min(2000 * (attempt + 1), 8000);
                        await delay(waitMs);
                        continue;
                    }
                    break;
                }

                if (attempt < maxAttempts - 1) {
                    const waitMs = Math.min(1500 * (attempt + 1), 6000);
                    await delay(waitMs);
                    continue;
                }
            }
        }
    }

    console.error("Update analysis failed:", lastError);
    throw new Error(`2차 재가공 실패: ${extractMessage(lastError) || '알 수 없는 오류'}`);
}

export async function analyzeWorkerRiskAssessment(imageSource: string, _unusedMimeType: string, filenameHint?: string): Promise<WorkerRecord[]> {
    return await callGeminiWithRetry(imageSource, null, OCR_MODEL_PRIMARY, filenameHint, 3, OCR_MODEL_FALLBACK);
}

export async function generateSpeechFromText(text: string, voiceName: string = 'Kore'): Promise<string> {
    try {
        const ai = getAiInstance();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
            },
        });
        return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
    } catch (e) { 
        console.error("TTS generation failed:", e);
        return ""; 
    }
}

export async function generateSafetyBriefing(workers: WorkerRecord[], checks: SafetyCheckRecord[]): Promise<BriefingData> {
    try {
        const ai = getAiInstance();
        const today = new Date();
        const currentMonth = `${today.getFullYear()}년 ${today.getMonth() + 1}월`;
        
        const workerSummary = workers.map(w => ({
            name: w.name,
            score: w.safetyScore,
            field: w.jobField,
            teamLeader: w.teamLeader, 
            weakAreas: w.weakAreas
        }));

        const checkSummary = checks.slice(0, 10).map(c => ({
            type: c.type,
            reason: c.reason
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `다음 데이터를 바탕으로 ${currentMonth} 안전 전략 브리핑 대본과 KPI 작성.
            근로자: ${JSON.stringify(workerSummary)}
            점검: ${JSON.stringify(checkSummary)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        month: { type: Type.STRING },
                        avgScore: { type: Type.NUMBER },
                        totalWorkers: { type: Type.NUMBER },
                        topWeakness: { type: Type.STRING },
                        script: { type: Type.STRING },
                        kpiAnalysis: { type: Type.STRING }
                    },
                    required: ["month", "avgScore", "totalWorkers", "topWeakness", "script", "kpiAnalysis"]
                }
            }
        });

        let result: Partial<BriefingData> = {};
        if (response.text) {
            try {
                result = JSON.parse(response.text);
            } catch (pe) {
                console.error("Parsing safety briefing response failed:", pe);
                console.error("Raw AI response:", response.text);
                result = {};
            }
        }
        const bestWorker = workers.length > 0 ? [...workers].sort((a, b) => b.safetyScore - a.safetyScore)[0] : null;
        return { ...result, bestWorker };
    } catch (error) {
        return {
            month: "데이터 없음",
            avgScore: 0,
            totalWorkers: 0,
            topWeakness: "분석 실패",
            bestWorker: null,
            script: "브리핑 데이터를 생성할 수 없습니다.",
            kpiAnalysis: "N/A"
        };
    }
}

export async function generateFutureRiskForecast(workers: WorkerRecord[]): Promise<RiskForecastData> {
    try {
        const ai = getAiInstance();
        const today = new Date();
        const nextMonthDate = new Date(today);
        nextMonthDate.setMonth(today.getMonth() + 1);
        const nextMonth = `${nextMonthDate.getFullYear()}년 ${nextMonthDate.getMonth() + 1}월`;

        const summary = workers.map(w => ({
            field: w.jobField,
            leader: w.teamLeader,
            score: w.safetyScore,
            weak: w.weakAreas
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `근로자 데이터를 분석하여 ${nextMonth} 위험성 예측.
            데이터: ${JSON.stringify(summary)}`,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        nextMonth: { type: Type.STRING },
                        predictedRisks: {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    risk: { type: Type.STRING },
                                    probability: { type: Type.STRING },
                                    action: { type: Type.STRING }
                                }
                            }
                        },
                        focusTeams: { type: Type.ARRAY, items: { type: Type.STRING } },
                        aiAdvice: { type: Type.STRING }
                    },
                    required: ["nextMonth", "predictedRisks", "focusTeams", "aiAdvice"]
                }
            }
        });

        if (response.text) {
            try {
                return JSON.parse(response.text);
            } catch (pe) {
                console.error("Parsing future risk forecast failed:", pe);
                console.error("Raw AI response:", response.text);
                return {
                    nextMonth: "예측 불가",
                    predictedRisks: [],
                    focusTeams: [],
                    aiAdvice: "데이터 분석 중 오류가 발생했습니다."
                };
            }
        }
        return {
            nextMonth: "예측 불가",
            predictedRisks: [],
            focusTeams: [],
            aiAdvice: "데이터 분석 중 오류가 발생했습니다."
        };
    } catch (error) {
        return {
            nextMonth: "예측 불가",
            predictedRisks: [],
            focusTeams: [],
            aiAdvice: "데이터 분석 중 오류가 발생했습니다."
        };
    }
}

export async function analyzeExternalIssueDocument(base64Data: string, mimeType: string): Promise<ExternalIssueAnalysisResult> {
    try {
        const ai = getAiInstance();
        const cleanBase64 = (base64Data || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
        const normalizedMimeType = mimeType || 'image/jpeg';

        if (!cleanBase64 || cleanBase64.length < 50) {
            throw new Error('외부 지적사항 문서 데이터가 비어있거나 유효하지 않습니다.');
        }

        const response = await ai.models.generateContent({
            model: OCR_MODEL_PRIMARY,
            contents: {
                parts: [
                    {
                        text: `당신은 건설현장 안전관리 AI 분석관이다.
다음 외부 지적사항 문서(이미지 또는 PDF)를 분석해 JSON만 반환하라.

추출 항목:
1) issueDate: 지적 날짜 (YYYY-MM-DD, 알 수 없으면 "")
2) location: 발생 위치 (구역/동/층 포함 요약)
3) summary: 지적 내용 핵심 요약 (한글, 2문장 이내)
4) riskLevel: 위험 등급 (High, Medium, Low 중 하나)
5) requiredAction: 요구되는 조치사항 (한글, 구체적 실행형)

규칙:
- 반드시 JSON 단일 객체만 반환
- 불확실한 항목은 추정하지 말고 빈 문자열 또는 Medium 기본값 사용
- 불필요한 설명, 코드블록, 마크다운 금지`
                    },
                    {
                        inlineData: {
                            mimeType: normalizedMimeType,
                            data: cleanBase64
                        }
                    }
                ]
            },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        issueDate: { type: Type.STRING },
                        location: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        riskLevel: { type: Type.STRING, enum: ['High', 'Medium', 'Low'] },
                        requiredAction: { type: Type.STRING }
                    },
                    required: ['issueDate', 'location', 'summary', 'riskLevel', 'requiredAction']
                },
                temperature: 0.2
            }
        });

        const parsed = response.text ? parseJsonObjectFromText(response.text) : null;
        if (!parsed) {
            throw new Error('외부 지적사항 분석 결과를 JSON으로 파싱하지 못했습니다.');
        }

        return {
            issueDate: String(parsed.issueDate || ''),
            location: String(parsed.location || ''),
            summary: String(parsed.summary || ''),
            riskLevel: (['High', 'Medium', 'Low'].includes(String(parsed.riskLevel)) ? String(parsed.riskLevel) : 'Medium') as ExternalIssueAnalysisResult['riskLevel'],
            requiredAction: String(parsed.requiredAction || '')
        };
    } catch (error) {
        const message = extractMessage(error);
        throw new Error(`외부 지적사항 AI 분석 실패: ${message}`);
    }
}
// [Export] Core Utilities for use in other modules
export { 
    normalizeNationality,
    getQuotaState,
    setQuotaExhausted,
    clearQuotaState,
    isRateLimitError,
    validateImageFormat,
    isFormatCompatibleWithAI
};