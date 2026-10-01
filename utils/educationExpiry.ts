// Local display expiry only: no request, polling or persisted education material.
export function scheduleEducationExpiry(expiresAt: string, onExpire: () => void): () => void {
    const remaining = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
        onExpire();
        return () => undefined;
    }
    const timer = setTimeout(onExpire, Math.min(remaining, 2147483647));
    return () => clearTimeout(timer);
}
