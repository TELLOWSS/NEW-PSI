export function getWindowProp<T = any>(key: string): T | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        return (window as unknown as Record<string, unknown>)[key] as T | undefined;
    } catch (e) {
        return undefined;
    }
}
