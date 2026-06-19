import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Vercel production security headers', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
    const globalRule = config.headers.find((rule: { source: string }) => rule.source === '/(.*)');
    const headers = new Map<string, string>(
        (globalRule?.headers || []).map((item: { key: string; value: string }) => (
            [item.key.toLowerCase(), item.value]
        )),
    );

    it('blocks framing, MIME sniffing, and unnecessary browser capabilities', () => {
        expect(headers.get('x-frame-options')).toBe('DENY');
        expect(headers.get('x-content-type-options')).toBe('nosniff');
        expect(headers.get('permissions-policy')).toContain('camera=()');
        expect(headers.get('permissions-policy')).toContain('microphone=()');
        expect(headers.get('permissions-policy')).toContain('geolocation=()');
    });

    it('ships a CSP compatible with the current bundled and external assets', () => {
        const csp = headers.get('content-security-policy') || '';
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("frame-ancestors 'none'");
        expect(csp).toContain('https://fonts.googleapis.com');
        expect(csp).toContain('https://cdnjs.cloudflare.com');
        expect(csp).toContain("worker-src 'self' blob:");
    });
});
