import { assertAdminAuthenticated, clearAdminAuthentication } from './adminGuard';
import { classifyRequestOutcome, recordClientRequestOutcome } from './clientRequestDiagnostics';

/**
 * 브라우저 기본 대기시간은 9초입니다. Vercel 서버 함수의 실제 제한과는 별개입니다.
 * 응답이 끊긴 저장 요청은 이미 완료됐을 수 있으므로 자동 재시도를 하지 않습니다.
 * 긴 작업(Gemini 번역/audio 생성 등)은 timeoutMs 옵션으로 개별 조정 가능.
 */
const VERCEL_FREE_SAFE_TIMEOUT_MS = 9_000;

export type SafeJsonParseOptions = {
    fallbackMessage: string;
    requireOk?: boolean;
    nonJsonMessage?: string;
    /** ms 단위 브라우저 응답 대기시간. 0 = 클라이언트 타임아웃 없음 */
    timeoutMs?: number;
};

export class AdminApiError extends Error {
    constructor(message:string,public status:number|null=null,public retryAfterSeconds:number|null=null,public outcomeUnknown=false){
        super(message);this.name='AdminApiError';
    }
}
export function parseRetryAfterSeconds(value:string|null):number|null{
    if(!value||!/^\d{1,4}$/.test(value.trim()))return null;
    const seconds=Number(value);return seconds>=1&&seconds<=3600?seconds:null;
}
const safeDetail=(detail:unknown,fallback:string):string=>{
    if(typeof detail!=='string')return fallback;
    const text=detail.trim();
    if(!text||text.length>220||!/[가-힣]/.test(text)||/[<>@]/.test(text)||/https?:\/\/|\b(SQL|PGRST|JSON|token|bearer|stack|authorization|api[_ -]?key)\b/i.test(text))return fallback;
    return text;
};
export function friendlyHttpMessage(status:number,fallback:string,retryAfterSeconds:number|null,detail?:unknown):string{
    if(status===401)return '로그인이 만료됐습니다. 다시 로그인하고 저장 기록을 먼저 확인해 주세요.';
    if(status===402)return '서비스 이용량 또는 이용 조건으로 요청이 제한됐습니다. 운영자에게 확인하고 저장 기록부터 확인해 주세요.';
    if(status===403)return '현재 계정에 작업 권한이 없습니다. 관리자에게 확인해 주세요.';
    if(status===408||status===429)return '요청이 일시적으로 제한됐습니다. '+(retryAfterSeconds?'약 '+retryAfterSeconds+'초 이후에 ':'잠시 후 ')+'저장된 결과를 먼저 확인하고 필요한 작업만 다시 진행해 주세요.';
    if(status===413)return '사진 또는 입력 크기가 너무 큽니다. 파일을 줄인 뒤 다시 선택해 주세요.';
    if(status>=500&&status<=599)return '서버의 처리 결과를 확인하지 못했습니다. 중복 저장을 막기 위해 저장 기록부터 확인해 주세요.';
    return safeDetail(detail,fallback);
}
const buildRawErrorMessage = (status:number,detail:unknown,fallback:string,retryAfterSeconds:number|null=null)=>{
    return friendlyHttpMessage(status,fallback,retryAfterSeconds,detail);
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
    const retryAfterSeconds=parseRetryAfterSeconds(response.headers.get('Retry-After'));
    const isJson = contentType.includes('application/json');

    if (!isJson) {
        if (!response.ok) {
            throw new AdminApiError(buildRawErrorMessage(response.status, undefined, fallbackMessage,retryAfterSeconds),response.status,retryAfterSeconds,true);
        }
        throw new AdminApiError(buildRawErrorMessage(response.status, nonJsonMessage, fallbackMessage,retryAfterSeconds),response.status,retryAfterSeconds,true);
    }

    let data: any = null;
    try {
        data = rawText ? JSON.parse(rawText) : null;
    } catch {
        throw new AdminApiError(buildRawErrorMessage(response.status,undefined,fallbackMessage,retryAfterSeconds),response.status,retryAfterSeconds,true);
    }

    if (requireOk && (!response.ok || !data?.ok)) {
        const detail = data?.details || data?.message || data?.error || rawText;
        throw new AdminApiError(buildRawErrorMessage(response.status, detail, fallbackMessage,retryAfterSeconds),response.status,retryAfterSeconds,response.status>=500);
    }

    return data as T;
}

export async function postAdminJson<T = any>(
    url: string,
    payload: unknown,
    options: SafeJsonParseOptions,
): Promise<T> {
    assertAdminAuthenticated();
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

    const started=Date.now();
    let response: Response;
    try {
        response = await fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller?.signal ?? undefined,
        });
    } catch (err: unknown) {
        if (timerId) clearTimeout(timerId);
        // AbortError: 타임아웃 초과 → 사용자 친화적 메시지
        if (err instanceof Error && err.name === 'AbortError') {
            recordClientRequestOutcome('timeout',Date.now()-started);
            throw new AdminApiError('응답 대기 시간이 초과됐습니다. 저장됐을 수 있으니 기록부터 확인하세요. 자동으로 재전송하지 않습니다.',null,null,true);
        }
        // 네트워크 오류
        recordClientRequestOutcome('network',Date.now()-started);
        throw new AdminApiError('네트워크 연결이 끊겼습니다. 저장 기록과 인터넷 상태를 먼저 확인하세요. 자동으로 재전송하지 않습니다.',null,null,true);
    }

    if (timerId) clearTimeout(timerId);
    if (response.status === 401) {
        clearAdminAuthentication();
    }
    try {
        const result=await parseAdminJsonResponse<T>(response,options);
        recordClientRequestOutcome(classifyRequestOutcome(response.status,response.ok&&(result as any)?.ok!==false),Date.now()-started);
        return result;
    } catch(error) {
        recordClientRequestOutcome(classifyRequestOutcome(response.status,false),Date.now()-started);
        throw error;
    }
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
        const response = await fetch(input, { credentials: 'same-origin', ...init });
        if (response.status === 401) clearAdminAuthentication();
        return response;
    }

    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(input, { credentials: 'same-origin', ...init, signal: controller.signal });
        clearTimeout(timerId);
        if (response.status === 401) clearAdminAuthentication();
        return response;
    } catch (err: unknown) {
        clearTimeout(timerId);
        if (err instanceof Error && err.name === 'AbortError') {
            throw new AdminApiError('응답 대기 시간이 초과됐습니다. 서버의 저장 여부를 먼저 확인해 주세요.',null,null,true);
        }
        throw err;
    }
}
