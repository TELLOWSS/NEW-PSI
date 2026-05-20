import { assertAdminAuthenticated, getAdminAuthToken } from './adminGuard';

/**
 * Vercel 무료(Hobby) 플랜 서버리스 함수 타임아웃 기준: 10초
 * 클라이언트 측에서 9초 내에 강제 중단하여 사용자에게 명확한 에러 메시지 노출.
 * 긴 작업(Gemini 번역/audio 생성 등)은 timeoutMs 옵션으로 개별 조정 가능.
 */
const VERCEL_FREE_SAFE_TIMEOUT_MS = 9_000;

export type SafeJsonParseOptions = {
    fallbackMessage: string;
    requireOk?: boolean;
    nonJsonMessage?: string;
    /** ms 단위 요청 타임아웃 (기본: 9000ms — Vercel 무료 10초 제한 1초 여유). 0 = 타임아웃 없음 */
    timeoutMs?: number;
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
    assertAdminAuthenticated();
    const adminAuthToken = getAdminAuthToken();
    if (!adminAuthToken) {
        throw new Error('관리자 인증 토큰이 없습니다. 다시 로그인해 주세요.');
    }

    const timeoutMs = options.timeoutMs === undefined
        ? VERCEL_FREE_SAFE_TIMEOUT_MS
        : options.timeoutMs;

    let controller: AbortController | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    if (timeoutMs > 0) {
        controller = new AbortController();
        timerId = setTimeout(() => {
            controller!.abort();
        }, timeoutMs);
    }

    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-admin-auth': adminAuthToken,
            },
            body: JSON.stringify(payload),
            signal: controller?.signal ?? undefined,
        });
    } catch (err: unknown) {
        if (timerId) clearTimeout(timerId);
        // AbortError: 타임아웃 초과 → 사용자 친화적 메시지
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(
                `요청 시간 초과 (${timeoutMs / 1000}초) · Vercel 무료 플랜 제한입니다. 잠시 후 다시 시도해 주세요.`,
            );
        }
        // 네트워크 오류
        throw new Error(
            `네트워크 오류 · 서버에 연결할 수 없습니다. 인터넷 연결 또는 배포 상태를 확인해 주세요. (${String((err as Error)?.message ?? err)})`,
        );
    }

    if (timerId) clearTimeout(timerId);
    return parseAdminJsonResponse<T>(response, options);
}

/**
 * raw fetch + AbortController 타임아웃 래퍼.
 * postAdminJson 을 쓰지 않는 직접 fetch 호출처(AdminTraining 등)에서 사용.
 * @param input  RequestInfo
 * @param init   RequestInit (signal 있으면 무시하고 덮어씀)
 * @param timeoutMs  타임아웃(ms), 기본 9초. 0 = 제한 없음
 */
export async function fetchWithTimeout(
    input: RequestInfo,
    init?: RequestInit,
    timeoutMs = VERCEL_FREE_SAFE_TIMEOUT_MS,
): Promise<Response> {
    if (timeoutMs <= 0) {
        return fetch(input, init);
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(input, { ...init, signal: controller.signal });
        clearTimeout(timerId);
        return response;
    } catch (err: unknown) {
        clearTimeout(timerId);
        if (err instanceof Error && err.name === 'AbortError') {
            throw new Error(
                `요청 시간 초과 (${timeoutMs / 1000}초) · Vercel 무료 플랜 제한입니다. 잠시 후 다시 시도해 주세요.`,
            );
        }
        throw err;
    }
}
