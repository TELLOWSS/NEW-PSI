import { readFile } from 'node:fs/promises';

const requiredHeaders = new Map([
    ['content-security-policy', ['default-src', 'object-src', 'frame-ancestors', 'connect-src']],
    ['x-content-type-options', ['nosniff']],
    ['x-frame-options', ['deny']],
    ['referrer-policy', ['strict-origin-when-cross-origin']],
    ['permissions-policy', ['camera=()', 'microphone=()', 'geolocation=()']],
    ['cross-origin-opener-policy', ['same-origin-allow-popups']],
    ['cross-origin-resource-policy', ['same-site']],
]);

const urlArgIndex = process.argv.indexOf('--url');
const targetUrl = urlArgIndex >= 0 ? process.argv[urlArgIndex + 1] : process.env.PSI_SECURITY_HEADER_URL;

const normalizeHeaders = (entries) => new Map(
    entries.map(([key, value]) => [String(key).toLowerCase(), String(value).toLowerCase()]),
);

const validate = (headers) => {
    const results = [];
    for (const [header, expectedParts] of requiredHeaders) {
        const value = headers.get(header) || '';
        const missingParts = expectedParts.filter((part) => !value.includes(part));
        results.push({
            header,
            passed: Boolean(value) && missingParts.length === 0,
            missingParts,
        });
    }
    return results;
};

let source = 'vercel.json';
let headers;

if (targetUrl) {
    source = targetUrl;
    const response = await fetch(targetUrl, { method: 'HEAD', redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`보안 헤더 확인 대상이 HTTP ${response.status}로 응답했습니다.`);
    }
    headers = normalizeHeaders([...response.headers.entries()]);
} else {
    const config = JSON.parse(await readFile('vercel.json', 'utf8'));
    const globalRule = (config.headers || []).find((rule) => rule.source === '/(.*)');
    headers = normalizeHeaders((globalRule?.headers || []).map((item) => [item.key, item.value]));
}

const results = validate(headers);
const failed = results.filter((result) => !result.passed);

console.log(`[security-headers] source=${source}`);
console.log(`[security-headers] ${results.length - failed.length}/${results.length} passed`);
for (const result of failed) {
    console.log(`[security-headers] missing=${result.header}${result.missingParts.length ? ` (${result.missingParts.join(', ')})` : ''}`);
}

if (failed.length > 0) process.exitCode = 1;
