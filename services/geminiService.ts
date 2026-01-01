
import { GoogleGenAI, Type, Modality } from "@google/genai";
import type { WorkerRecord, BriefingData, RiskForecastData, SafetyCheckRecord } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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
**언어 정책 (매우 중요 - 엄격 준수)**:
분석 대상의 **국적(Nationality)**에 따라 반드시 해당 모국어로 번역된 필드(_native)를 채워야 한다.
- **중국(China)** -> 중국어 간체 (Simplified Chinese)
- **베트남(Vietnam)** -> 베트남어 (Vietnamese)
- **태국(Thailand)** -> 태국어 (Thai)
- **우즈베키스탄(Uzbekistan)** -> 우즈베크어 (Uzbek)
- **인도네시아(Indonesia)** -> 인도네시아어 (Indonesian)
- **몽골(Mongolia)** -> 몽골어 (Mongolian)
- **캄보디아(Cambodia)** -> 크메르어 (Khmer)
- **러시아/카자흐스탄** -> 러시아어 (Russian)
- **한국(Korea)** -> 한국어 (Korean) (native 필드도 한국어로 전문적으로 재기술)

**번역 지침**:
단순 직역이 아닌, 건설 현장에서 통용되는 '안전 전문 용어'로 의역하라.
(예: 'Falling' -> '추락(Fall from height)', 'Struck by' -> '협착/충돌')
`;

async function callGeminiWithRetry(base64Image: string, mimeType: string, modelName: string, filenameHint?: string, maxRetries = 3): Promise<WorkerRecord[]> {
    let lastError: any;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const systemInstruction = `
            **역할**: 건설현장 안전관리 전문가 및 문서 분석관.
            **임무**: 수기 위험성 평가표 이미지를 분석하여 데이터를 추출하고 안전 진단을 실시하라.
            ${LANGUAGE_POLICY}
            
            **강조 표기 규칙**:
            - 분석 결과(aiInsights, strengths, weakAreas)에서 **핵심 위험 요인**이나 **매우 우수한 점**은 반드시 '작은따옴표'로 감싸서 강조하라.

            **분석 기준**:
            - 근로자가 작성한 위험 요인의 구체성, 대책의 실효성을 바탕으로 PSI 점수를 산출하라.
            - 취약점(Weak Areas)은 근로자의 생명과 직결되는 부분을 우선적으로 도출하라.
            - 팀장(Team Leader) 이름이 문서에 있다면 반드시 추출하라.
            
            **직책 및 임무 식별 (중요)**:
            1. **직급(Role)**: '팀장/소장'은 'leader', '부팀장/반장'은 'sub_leader', 그 외는 'worker'로 분류.
            2. **통역(isTranslator)**: '통역' 관련 언급이나 역할이 확인되면 true, 아니면 false.
            3. **신호수(isSignalman)**: '신호수', '유도원' 관련 언급이 확인되면 true, 아니면 false.
            *참고: 직급과 임무는 독립적입니다. 예: 팀장이면서 신호수일 수 있음.*
            `;

            const prompt = `위험성 평가 문서를 분석하십시오. 파일명 힌트: ${filenameHint || '없음'}. 
            한국인은 한국어로만, 외국인은 한국어와 위 정책에 따른 모국어를 병기하여 상세 분석 리포트를 작성하십시오.`;
            
            const imagePart = { inlineData: { data: base64Image, mimeType: mimeType } };

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
                const records = JSON.parse(response.text.trim());
                return records.map((r: any) => ({
                    ...r,
                    id: r.id || `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                    originalImage: base64Image,
                    filename: filenameHint,
                    name: r.name || "식별 대기",
                    jobField: r.jobField || "기타",
                    teamLeader: r.teamLeader || "미지정",
                    role: r.role || "worker",
                    isTranslator: r.isTranslator || false,
                    isSignalman: r.isSignalman || false
                }));
            }
            throw new Error("Empty response from AI");
            
        } catch (e: any) {
            lastError = e;
            const errorMsg = e?.message || JSON.stringify(e);
            if ((errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED')) && i < maxRetries - 1) {
                await delay(Math.pow(2, i) * 2000 + Math.random() * 1000);
                continue;
            }
            break; 
        }
    }

    return [{
        id: `rec-err-${Date.now()}`,
        name: "할당량 초과 (재분석 필요)",
        jobField: "미분류",
        teamLeader: "미지정",
        role: 'worker',
        isTranslator: false,
        isSignalman: false,
        date: new Date().toISOString().split('T')[0],
        nationality: "미상",
        safetyScore: 0,
        safetyLevel: '초급',
        originalImage: base64Image,
        filename: filenameHint,
        language: "unknown",
        handwrittenAnswers: [],
        fullText: "분석 실패",
        koreanTranslation: "API 사용량이 일시적으로 초과되었습니다.",
        strengths: [], strengths_native: [],
        weakAreas: ["할당량 초과"], weakAreas_native: [],
        improvement: "", improvement_native: "",
        suggestions: [], suggestions_native: [],
        aiInsights: "현재 API 요청량이 너무 많습니다.", aiInsights_native: "",
        selfAssessedRiskLevel: '중'
    }];
}

export async function updateAnalysisBasedOnEdits(record: WorkerRecord): Promise<Partial<WorkerRecord> | null> {
    try {
        const specialDuties = [];
        if (record.isTranslator) specialDuties.push("통역(Translator)");
        if (record.isSignalman) specialDuties.push("신호수(Signalman)");
        const dutyStr = specialDuties.length > 0 ? specialDuties.join(", ") : "없음";

        const systemInstruction = `
        **역할**: 건설현장 안전관리 AI 보좌관.
        **임무**: 사용자가 수동으로 수정한 근로자 정보(국적, 점수, 직종, 팀장, 직책, 특수임무 등)를 바탕으로 안전 분석 결과와 번역을 **반드시 새로 생성**하라.
        ${LANGUAGE_POLICY}
        
        **필수 지침**:
        - 입력된 '안전 점수'에 맞춰 평가(aiInsights)의 톤앤매너를 수정하라. (예: 점수가 높으면 칭찬, 낮으면 경고)
        - 입력된 '국적'에 맞춰 '_native' 필드의 번역 언어를 변경하라.
        - **직책(Role)과 특수임무(Duties) 반영**:
          - '팀장/부팀장'인 경우 리더십과 솔선수범을 강조.
          - '통역' 임무가 있으면 정확한 안전 지침 전달의 중요성을 강조.
          - '신호수' 임무가 있으면 장비 유도 및 사각지대 관리 중요성을 강조.
        `;

        const prompt = `
        다음은 관리자가 수정한 근로자 정보입니다. 이 정보를 바탕으로 strengths, weakAreas, aiInsights 및 native 필드들을 갱신하십시오.
        
        [수정된 정보]
        이름: ${record.name}
        국적: ${record.nationality}
        공종: ${record.jobField}
        팀장: ${record.teamLeader || "미지정"}
        직급: ${record.role || "worker"}
        특수임무: ${dutyStr}
        안전 점수: ${record.safetyScore} (등급: ${record.safetyLevel})
        
        위 정보를 반영하여 JSON 형식으로 결과를 반환하십시오.
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
            return JSON.parse(response.text.trim());
        }
        return null;
    } catch (e) {
        console.error("Update analysis failed:", e);
        return null;
    }
}

export async function analyzeWorkerRiskAssessment(base64Image: string, mimeType: string, filenameHint?: string): Promise<WorkerRecord[]> {
    return await callGeminiWithRetry(base64Image, mimeType, 'gemini-3-flash-preview', filenameHint);
}

export async function generateSpeechFromText(text: string, voiceName: string = 'Kore'): Promise<string> {
    try {
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
            contents: `다음 현장 데이터를 바탕으로 ${currentMonth} 안전 전략 브리핑 대본과 KPI 분석을 작성하라.
            데이터:
            근로자 요약: ${JSON.stringify(workerSummary)}
            최근 점검: ${JSON.stringify(checkSummary)}
            
            대본은 전문적이고 권위 있으면서도 근로자들의 사기를 북돋는 톤으로 작성하라.
            특정 팀(팀장)에서 반복되는 취약점이 있다면 언급하라.`,
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

        const result = JSON.parse(response.text || "{}");
        const bestWorker = workers.length > 0 ? [...workers].sort((a, b) => b.safetyScore - a.safetyScore)[0] : null;

        return {
            ...result,
            bestWorker
        };
    } catch (error) {
        console.error("Safety briefing generation failed:", error);
        return {
            month: "데이터 없음",
            avgScore: 0,
            totalWorkers: 0,
            topWeakness: "분석 실패",
            bestWorker: null,
            script: "브리핑 데이터를 생성할 수 없습니다. 다시 시도해주세요.",
            kpiAnalysis: "N/A"
        };
    }
}

export async function generateFutureRiskForecast(workers: WorkerRecord[]): Promise<RiskForecastData> {
    try {
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
            contents: `근로자 안전 데이터를 분석하여 ${nextMonth}의 위험성을 예측하라.
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

        return JSON.parse(response.text || "{}");
    } catch (error) {
        console.error("Risk forecast generation failed:", error);
        return {
            nextMonth: "예측 불가",
            predictedRisks: [],
            focusTeams: [],
            aiAdvice: "데이터 분석 중 오류가 발생했습니다."
        };
    }
}
