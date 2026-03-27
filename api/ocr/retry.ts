type RetryRequestBody = {
    recordId?: string;
    imageSource?: string;
    filenameHint?: string;
};

const resolveGeminiApiKey = () => {
    return (
        process.env.GEMINI_API_KEY ||
        process.env.GOOGLE_GEMINI_API_KEY ||
        process.env.GOOGLE_API_KEY ||
        ''
    ).trim();
};

const normalizeNationality = (rawNationality: string): string => {
    if (!rawNationality) return '미상';

    const nation = rawNationality.trim().toLowerCase();
    if (nation.includes('한국') || nation.includes('korea') || nation.includes('rok') || nation.includes('south korea')) return '대한민국';
    if (nation.includes('베트남') || nation.includes('vietnam')) return '베트남';
    if (nation.includes('중국') || nation.includes('china')) return '중국';
    if (nation.includes('태국') || nation.includes('thailand')) return '태국';
    if (nation.includes('우즈벡') || nation.includes('uzbekistan') || nation.includes('ўзбек') || nation.includes('узбек')) return '우즈베키스탄';
    if (nation.includes('인도네시아') || nation.includes('indonesia')) return '인도네시아';
    if (nation.includes('캄보디아') || nation.includes('cambodia')) return '캄보디아';
    if (nation.includes('몽골') || nation.includes('mongolia') || nation.includes('монгол')) return '몽골';
    if (nation.includes('카자흐') || nation.includes('kazakhstan') || nation.includes('қазақ') || nation.includes('казахст')) return '카자흐스탄';
    if (nation.includes('러시아') || nation.includes('russia') || nation.includes('россия') || nation.includes('рф') || nation.includes('российск')) return '러시아';
    if (nation.includes('네팔') || nation.includes('nepal')) return '네팔';
    if (nation.includes('미얀마') || nation.includes('myanmar') || nation.includes('burma')) return '미얀마';

    return rawNationality.trim();
};

const normalizeImagePayload = (input: string) => {
    if (!input || typeof input !== 'string') {
        throw new Error('imageSource가 필요합니다.');
    }

    let cleanData = input.trim();
    if (cleanData.includes('base64,')) {
        const parts = cleanData.split('base64,');
        cleanData = parts[parts.length - 1] || '';
    }
    cleanData = cleanData.replace(/[\r\n\s]/g, '');

    if (cleanData.length < 100) {
        throw new Error('이미지 데이터가 너무 짧아 재분석할 수 없습니다.');
    }

    const signature = cleanData.slice(0, 20);
    const mimeType = signature.startsWith('iVBORw0KGgo')
        ? 'image/png'
        : signature.startsWith('/9j/')
            ? 'image/jpeg'
            : signature.startsWith('R0lGOD')
                ? 'image/gif'
                : signature.startsWith('UklGR')
                    ? 'image/webp'
                    : signature.startsWith('AAAAFftM') || signature.includes('ftyp')
                        ? 'image/heic'
                        : 'image/jpeg';

    return { cleanData, mimeType };
};

const parseJsonCandidate = (rawText: string): Record<string, unknown> | null => {
    const trimmed = String(rawText || '').trim();
    if (!trimmed) return null;

    try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
            const first = parsed[0];
            return first && typeof first === 'object' && !Array.isArray(first) ? first as Record<string, unknown> : null;
        }
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch {
        const arrayStart = trimmed.indexOf('[');
        const arrayEnd = trimmed.lastIndexOf(']');
        if (arrayStart >= 0 && arrayEnd > arrayStart) {
            try {
                const parsed = JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1));
                const first = Array.isArray(parsed) ? parsed[0] : null;
                return first && typeof first === 'object' && !Array.isArray(first) ? first as Record<string, unknown> : null;
            } catch {
                return null;
            }
        }
        return null;
    }
};

const toStringArray = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return value.map((item) => String(item || '').trim()).filter(Boolean);
};

const resolveSafetyLevel = (score: number, rawLevel: unknown): '초급' | '중급' | '고급' => {
    if (rawLevel === '고급' || rawLevel === '중급' || rawLevel === '초급') return rawLevel;
    if (score >= 80) return '고급';
    if (score >= 60) return '중급';
    return '초급';
};

async function analyzeSingleRecord(imageSource: string, filenameHint: string) {
    const apiKey = resolveGeminiApiKey();
    if (!apiKey) {
        throw new Error('서버 Gemini API 키가 설정되지 않았습니다. GEMINI_API_KEY 환경변수를 확인하세요.');
    }

    const { cleanData, mimeType } = normalizeImagePayload(imageSource);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: [
                                    '건설현장 위험성평가표 이미지를 분석해 JSON 배열 1개만 반환하세요.',
                                    '마크다운 없이 JSON만 반환하세요.',
                                    '필수 키: name, jobField, teamLeader, date, nationality, language, safetyScore, safetyLevel, strengths, weakAreas, improvement, suggestions, aiInsights, fullText, koreanTranslation, scoreReasoning, ocrConfidence',
                                    `파일명: ${filenameHint || 'unknown'}`,
                                ].join('\n'),
                            },
                            {
                                inlineData: {
                                    data: cleanData,
                                    mimeType,
                                },
                            },
                        ],
                    },
                ],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                },
            }),
        }
    );

    if (!response.ok) {
        const raw = await response.text();
        throw new Error(`Gemini API 오류 (${response.status}): ${raw.slice(0, 300)}`);
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = parseJsonCandidate(rawText);

    if (!parsed) {
        throw new Error('서버 OCR 응답 JSON 파싱에 실패했습니다.');
    }

    const safetyScore = Number.isFinite(Number(parsed.safetyScore)) ? Number(parsed.safetyScore) : 0;

    return {
        name: String(parsed.name || '식별 대기').trim(),
        jobField: String(parsed.jobField || '기타').trim(),
        teamLeader: String(parsed.teamLeader || '미지정').trim(),
        date: String(parsed.date || new Date().toISOString().split('T')[0]).trim(),
        nationality: normalizeNationality(String(parsed.nationality || '미상')),
        language: String(parsed.language || 'unknown').trim(),
        safetyScore,
        safetyLevel: resolveSafetyLevel(safetyScore, parsed.safetyLevel),
        strengths: toStringArray(parsed.strengths),
        strengths_native: toStringArray(parsed.strengths_native),
        weakAreas: toStringArray(parsed.weakAreas),
        weakAreas_native: toStringArray(parsed.weakAreas_native),
        improvement: String(parsed.improvement || '').trim(),
        improvement_native: String(parsed.improvement_native || '').trim(),
        suggestions: toStringArray(parsed.suggestions),
        suggestions_native: toStringArray(parsed.suggestions_native),
        aiInsights: String(parsed.aiInsights || '').trim(),
        aiInsights_native: String(parsed.aiInsights_native || '').trim(),
        fullText: String(parsed.fullText || '').trim(),
        koreanTranslation: String(parsed.koreanTranslation || '').trim(),
        scoreReasoning: toStringArray(parsed.scoreReasoning),
        ocrConfidence: Number.isFinite(Number(parsed.ocrConfidence)) ? Number(parsed.ocrConfidence) : 0.9,
        handwrittenAnswers: Array.isArray(parsed.handwrittenAnswers) ? parsed.handwrittenAnswers : [],
    };
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    try {
        const body = (req.body || {}) as RetryRequestBody;
        const recordId = String(body.recordId || '').trim();
        const imageSource = String(body.imageSource || '').trim();
        const filenameHint = String(body.filenameHint || '').trim();

        if (!recordId) {
            return res.status(400).json({ ok: false, message: 'recordId가 필요합니다.' });
        }

        if (!imageSource) {
            return res.status(400).json({ ok: false, message: 'imageSource가 필요합니다.' });
        }

        const record = await analyzeSingleRecord(imageSource, filenameHint || recordId);
        return res.status(200).json({ ok: true, recordId, record });
    } catch (error: any) {
        return res.status(500).json({
            ok: false,
            message: error?.message || '서버 OCR 재분석 실패',
        });
    }
}
