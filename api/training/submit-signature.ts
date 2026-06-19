import gatewayHandler from '../gateway.js';

export const normalizeSubmitSignaturePayload = (body: Record<string, unknown>) => {
    const checklist = body?.checklist && typeof body.checklist === 'object'
        ? body.checklist as Record<string, unknown>
        : {};
    const checklistComplete = Boolean(checklist.riskReview)
        && Boolean(checklist.ppeConfirm)
        && Boolean(checklist.emergencyConfirm);

    return {
        sessionId: body?.sessionId,
        workerId: body?.workerId,
        workerName: body?.workerName,
        nationality: body?.nationality,
        selectedLanguageCode: body?.selectedLanguageCode,
        reviewedGuidance: Boolean(body?.reviewedGuidance),
        audioPlayed: Boolean(body?.audioPlayed),
        scrolledToEnd: typeof body?.scrolledToEnd === 'boolean'
            ? body.scrolledToEnd
            : Boolean(body?.reviewedGuidance),
        acknowledgedRiskAssessment: typeof body?.acknowledgedRiskAssessment === 'boolean'
            ? body.acknowledgedRiskAssessment
            : checklistComplete,
        checklist,
        selectedAudioUrl: body?.selectedAudioUrl,
        signatureDataUrl: body?.signatureDataUrl,
        linkExpiresAt: body?.linkExpiresAt,
        linkToken: body?.linkToken,
        workerAuthExpiresAt: body?.workerAuthExpiresAt,
        workerAuthToken: body?.workerAuthToken,
        isManagerProxy: false,
    };
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, message: 'Method Not Allowed' });
    }

    let body: Record<string, unknown>;
    try {
        body = typeof req.body === 'string'
            ? JSON.parse(req.body || '{}')
            : (req.body || {});
    } catch {
        return res.status(400).json({ ok: false, message: '요청 본문 형식이 올바르지 않습니다.' });
    }

    return gatewayHandler({
        ...req,
        query: {
            ...(req.query || {}),
            action: 'training.submit',
        },
        body: {
            type: 'single',
            payload: normalizeSubmitSignaturePayload(body),
        },
    }, res);
}
