/** Stable JSON for the supported snapshot primitives. Object key order is irrelevant; array order is evidence order. */
export function serializeSnapshot(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(serializeSnapshot).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${serializeSnapshot((value as Record<string, unknown>)[key])}`).join(',')}}`;
    const encoded=JSON.stringify(value);
    if(encoded===undefined || typeof value==='number' && !Number.isFinite(value)) throw new Error('Unsupported snapshot value');
    return encoded;
}
