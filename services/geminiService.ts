
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { getWindowProp } from '../utils/windowUtils';
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord, AppSettings } from '../types';
import { extractMessage } from '../utils/errorUtils';

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

// [BYOK Implementation]
// Instead of a global instance, we create a function to get the instance dynamically.
// This allows the user to change the key in Settings and have it apply immediately.
const getAiInstance = () => {
    let apiKey = process.env.API_KEY || "";
    
    try {
        const settingsStr = localStorage.getItem('psi_app_settings');
        if (settingsStr) {
            const settings: AppSettings = JSON.parse(settingsStr);
            if (settings.apiKey && settings.apiKey.trim() !== "") {
                apiKey = settings.apiKey;
            }
        }
    } catch (e) {
        console.warn("Failed to load API key from settings", e);
    }

    if (!apiKey) {
        throw new Error("API Key가 설정되지 않았습니다. [설정] 메뉴에서 Google API Key를 입력해주세요.");
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
            jobField: { type: Type.STRING },
            teamLeader: { type: Type.STRING, description: "팀장 이름 (Team Leader Name)" },
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
            selfAssessedRiskLevel: { type: Type.STRING, enum: ['상', '중', '하'] },
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
        aiInsights: { type: Type.STRING },
        aiInsights_native: { type: Type.STRING },
        koreanTranslation: { type: Type.STRING },
    },
    required: ["strengths", "strengths_native", "weakAreas", "weakAreas_native", "aiInsights", "aiInsights_native"]
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));



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
    maxRetries = 3 // Increased default retries
): Promise<WorkerRecord[]> {
    let lastError: unknown;
    let ai;

    try {
        ai = getAiInstance();
    } catch (e: unknown) {
        // Return a special error record that alerts the UI about missing key
        const errMsg = extractMessage(e);
        return [{
            id: `err-key-${Date.now()}`,
            name: "설정 필요",
            jobField: "미분류",
            teamLeader: "미지정",
            role: 'worker',
            date: new Date().toISOString().split('T')[0],
            nationality: "미상",
            safetyScore: 0,
            safetyLevel: '초급',
            originalImage: imageSource,
            filename: filenameHint,
            language: "unknown",
            handwrittenAnswers: [],
            fullText: "",
            koreanTranslation: "",
            strengths: [], strengths_native: [],
            weakAreas: [], weakAreas_native: [],
            improvement: "", improvement_native: "",
            suggestions: [], suggestions_native: [],
            aiInsights: `⛔ ${errMsg}`, 
            aiInsights_native: "",
            selfAssessedRiskLevel: '중'
        }];
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
        if ((typeof process !== 'undefined' && process.env && process.env.NODE_ENV !== 'production') || isDevWindow) {
            console.log(`[Gemini] Processing image: ${mimeType}, length: ${imageData.length}`);
        }
    } catch (e: unknown) {
        console.error("Image Processing Failed:", e);
        const errMsg = extractMessage(e);
        return [{
            id: `err-img-${Date.now()}`,
            name: "이미지 데이터 유실",
            jobField: "미분류",
            teamLeader: "미지정",
            role: 'worker',
            date: new Date().toISOString().split('T')[0],
            nationality: "미상",
            safetyScore: 0,
            safetyLevel: '초급',
            originalImage: imageSource, // Keep original
            filename: filenameHint,
            language: "unknown",
            handwrittenAnswers: [],
            fullText: "분석 불가",
            koreanTranslation: "이미지 데이터가 손상되어 분석할 수 없습니다.",
            strengths: [], strengths_native: [],
            weakAreas: ["이미지 오류"], weakAreas_native: [],
            improvement: "", improvement_native: "",
            suggestions: [], suggestions_native: [],
            aiInsights: `오류: ${errMsg}`, aiInsights_native: "",
            selfAssessedRiskLevel: '중'
        }];
    }

    // 2. Retry Loop with Aggressive Backoff
    for (let i = 0; i < maxRetries; i++) {
        try {
            const systemInstruction = `
            **역할**: 건설현장 안전관리 전문가.
            **임무**: 수기 위험성 평가표 이미지를 분석하여 데이터 추출.
            ${LANGUAGE_POLICY}
            
            **강조**: 분석 결과에서 핵심 위험 요인은 '작은따옴표'로 강조.
            **직책 식별**: '팀장/소장'은 'leader', '부팀장/반장'은 'sub_leader', 그 외 'worker'.
            **임무 식별**: '통역' -> isTranslator=true, '신호수/유도원' -> isSignalman=true.
            `;

            const prompt = `위험성 평가 문서를 분석하십시오. 파일명: ${filenameHint || 'unknown'}. 
            한국인은 한국어로, 외국인은 한국어와 모국어를 병기하여 JSON으로 출력하십시오.`;
            
            const imagePart = { inlineData: { data: imageData, mimeType: mimeType } };

            const response = await ai.models.generateContent({
                model: modelName,
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
                        const jobField = (r['jobField'] as string) || "기타";
                        const teamLeader = (r['teamLeader'] as string) || "미지정";
                        const role = (r['role'] as string) as ('worker'|'leader'|'sub_leader') || 'worker';
                        const isTranslator = Boolean(r['isTranslator']);
                        const isSignalman = Boolean(r['isSignalman']);
                        const date = (r['date'] as string) || new Date().toISOString().split('T')[0];
                        // [CRITICAL] 국적 정규화 (LANGUAGE_POLICY 준수)
                        const nationality = normalizeNationality((r['nationality'] as string) || '미상');
                        const safetyScore = typeof r['safetyScore'] === 'number' ? (r['safetyScore'] as number) : Number(r['safetyScore']) || 0;
                        const safetyLevel = (r['safetyLevel'] as string) || '초급';
                        return {
                            id,
                            name,
                            jobField,
                            teamLeader,
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
                            selfAssessedRiskLevel: (r['selfAssessedRiskLevel'] as string) || '중'
                        } as WorkerRecord;
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
            
            // Critical errors: Don't retry
            if (errorMsg.includes('400') || errorMsg.includes('INVALID_ARGUMENT')) {
                lastError = new Error(`이미지 포맷(${mimeType})을 AI가 인식하지 못했습니다.`);
                break;
            }
            
            // Rate limit errors: Aggressive Backoff
            // 429: Too Many Requests, RESOURCE_EXHAUSTED
            if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota')) {
                const waitTime = 15000 * (i + 1); // 15s, 30s, 45s
                console.warn(`[Quota Limit] Backing off for ${waitTime/1000}s...`);
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

    return [{
        id: `rec-err-${Date.now()}`,
        name: isQuotaError ? "할당량 초과 (대기중)" : "분석 실패 (재시도 필요)",
        jobField: "미분류",
        teamLeader: "미지정",
        role: 'worker',
        isTranslator: false,
        isSignalman: false,
        date: new Date().toISOString().split('T')[0],
        nationality: "미상",
        safetyScore: 0,
        safetyLevel: '초급',
        originalImage: imageSource, 
        filename: filenameHint,
        language: "unknown",
        handwrittenAnswers: [],
        fullText: "분석 실패",
        koreanTranslation: "AI 연결 실패 또는 이미지 인식 오류.",
        strengths: [], strengths_native: [],
        weakAreas: ["분석 오류"], weakAreas_native: [],
        improvement: "", improvement_native: "",
        suggestions: [], suggestions_native: [],
        aiInsights: finalErrorMsg, aiInsights_native: "",
        selfAssessedRiskLevel: '중'
    }];
}

export async function updateAnalysisBasedOnEdits(record: WorkerRecord): Promise<Partial<WorkerRecord> | null> {
    try {
        const ai = getAiInstance();
        const specialDuties = [];
        if (record.isTranslator) specialDuties.push("통역(Translator)");
        if (record.isSignalman) specialDuties.push("신호수(Signalman)");
        const dutyStr = specialDuties.length > 0 ? specialDuties.join(", ") : "없음";

        const systemInstruction = `
        **역할**: 건설현장 안전관리 AI 보좌관.
        **임무**: 사용자가 수정한 근로자 정보 기반으로 안전 분석 결과 갱신.
        ${LANGUAGE_POLICY}
        `;

        const prompt = `
        다음 정보를 바탕으로 strengths, weakAreas, aiInsights 및 native 필드들을 갱신하십시오.
        
        이름: ${record.name}
        국적: ${record.nationality}
        공종: ${record.jobField}
        팀장: ${record.teamLeader || "미지정"}
        직급: ${record.role || "worker"}
        특수임무: ${dutyStr}
        안전 점수: ${record.safetyScore}
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: prompt }] },
            config: {
                systemInstruction: systemInstruction,
                responseMimeType: "application/json",
                responseSchema: updateSchema,
                temperature: 0.3,
            }
        });

        if (response.text) {
            try {
                const parsed = JSON.parse(response.text.trim());
                if (parsed && typeof parsed === 'object') return parsed;
            } catch (pe) {
                console.error("Parsing updateAnalysis response failed:", pe);
                console.error("Raw AI response:", response.text);
                return null;
            }
        }
        return null;
    } catch (e) {
        console.error("Update analysis failed:", e);
        return null;
    }
}

export async function analyzeWorkerRiskAssessment(imageSource: string, _unusedMimeType: string, filenameHint?: string): Promise<WorkerRecord[]> {
    return await callGeminiWithRetry(imageSource, null, 'gemini-3-flash-preview', filenameHint);
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