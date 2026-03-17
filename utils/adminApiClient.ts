export type SafeJsonParseOptions = {
    fallbackMessage: string;
    requireOk?: boolean;
    nonJsonMessage?: string;
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
    if (!contentType.includes('application/json')) {
        throw new Error(nonJsonMessage);
    }

    const data = await response.json();
    if (requireOk && (!response.ok || !data?.ok)) {
        throw new Error(data?.message || data?.error || `${fallbackMessage} (HTTP ${response.status})`);
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
