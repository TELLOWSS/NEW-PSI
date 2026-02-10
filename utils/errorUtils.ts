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
