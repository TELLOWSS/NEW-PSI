export function extractMessage(e: unknown): string {
    if (e && typeof e === 'object') {
        const obj = e as { message?: unknown };
        if (obj.message && typeof obj.message === 'string') return obj.message;
        if (obj.message !== undefined) return String(obj.message);
    }
    try {
        return String(e);
    } catch {
        return 'Unknown error';
    }
}

export function toVercelFriendlyMessage(raw: unknown, fallback: string): string {
    const message = extractMessage(raw);
    const normalized = message.toLowerCase();

    if (normalized.includes('aborterror') || normalized.includes('요청 시간 초과') || normalized.includes('timeout')) {
        return '요청 시간이 초과되었습니다. 서버에서도 처리가 완료됐을 수 있으므로 저장 기록을 먼저 확인하고 중복 전송을 피하세요.';
    }

    if (normalized.includes('failed to fetch') || normalized.includes('network') || normalized.includes('네트워크 오류')) {
        return '네트워크 또는 배포 상태를 확인해 주세요. 일시적으로 서버 함수 호출이 불안정할 수 있습니다.';
    }

    return String(message || fallback);
}
