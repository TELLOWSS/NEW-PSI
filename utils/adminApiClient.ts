export type SafeJsonParseOptions = {
    fallbackMessage: string;
    requireOk?: boolean;
    nonJsonMessage?: string;
};

const buildRawErrorMessage = (status: number, detail: string, fallback: string) => {
    const normalized = String(detail || '').trim();
    return `${status} - ${normalized || fallback}`;
};

export async function parseAdminJsonResponse<T = any>(
    response: Response,
    options: SafeJsonParseOptions,
): Promise<T> {
    const {
        fallbackMessage,
        requireOk = true,
        nonJsonMessage = '서버 응답 오류 (로그 확인 요망)',
    } = options;

    const contentType = response.headers.get('content-type') || '';
    const rawText = await response.text();
    const isJson = contentType.includes('application/json');

    if (!isJson) {
        if (!response.ok) {
            throw new Error(buildRawErrorMessage(response.status, rawText || nonJsonMessage, fallbackMessage));
        }
        throw new Error(buildRawErrorMessage(response.status, nonJsonMessage, fallbackMessage));
    }

    let data: any = null;
    try {
        data = rawText ? JSON.parse(rawText) : null;
    } catch {
        throw new Error(buildRawErrorMessage(response.status, rawText || 'JSON 파싱 실패', fallbackMessage));
    }

    if (requireOk && (!response.ok || !data?.ok)) {
        const detail = data?.details || data?.message || data?.error || rawText;
        throw new Error(buildRawErrorMessage(response.status, detail, fallbackMessage));
    }

    return data as T;
}

export async function postAdminJson<T = any>(
    url: string,
    payload: unknown,
    options: SafeJsonParseOptions,
): Promise<T> {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    return parseAdminJsonResponse<T>(response, options);
}
